"""
Stripe API wrapper.

All public functions degrade gracefully when STRIPE_SECRET_KEY is unset:
they raise HTTPException(503) with a clear message rather than crashing.
stripe is never imported at module level — only inside functions — so the
app boots without STRIPE_SECRET_KEY being set.

Pattern: _get_stripe() is called inside every function that needs the client.
Never call get_supabase() at module level.
"""
import os
import logging
import time
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ── In-process payment method cache (300 s TTL, keyed by user_id) ─────────────
_pm_cache: dict[str, dict] = {}
_pm_cache_ts: dict[str, float] = {}
_PM_TTL = 300.0  # seconds

# ── Settings cache (60 s TTL for invite_only_mode) ────────────────────────────
_settings_cache: dict = {}
_settings_cache_ts: float = 0.0
_SETTINGS_TTL = 60.0


def _get_stripe():
    """
    Return the configured stripe module. Raises 503 if STRIPE_SECRET_KEY is unset.
    Import is deferred so the app boots without the key.
    """
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Billing is not configured on this server. Contact support.",
        )
    try:
        import stripe as _stripe
        _stripe.api_key = key
        return _stripe
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Stripe library is not installed. Contact support.",
        )


def _require_stripe_customer(stripe, user_id: str, email: str) -> str:
    """
    Return stripe_customer_id for the user, creating a Stripe Customer if needed.
    Updates the subscriptions table.
    """
    from services.db import get_supabase
    sb = get_supabase()

    result = sb.table("subscriptions").select("stripe_customer_id").eq("user_id", user_id).maybe_single().execute()
    if result.data and result.data.get("stripe_customer_id"):
        return result.data["stripe_customer_id"]

    # Create Stripe Customer
    customer = stripe.Customer.create(
        email=email,
        metadata={"user_id": user_id},
    )
    customer_id = customer["id"]

    # Persist (upsert in case row doesn't exist yet)
    sb.table("subscriptions").upsert(
        {"user_id": user_id, "stripe_customer_id": customer_id},
        on_conflict="user_id",
    ).execute()

    return customer_id


def create_checkout_session(user_id: str, email: str, tier_key: str) -> str:
    """
    Create a Stripe Checkout Session for a paid tier.
    Returns the checkout URL.
    tier_key must be 'starter' or 'pro'.
    """
    if tier_key in ("free", "enterprise"):
        raise HTTPException(
            status_code=400,
            detail=f"tier_key '{tier_key}' cannot be purchased via checkout.",
        )

    from services.db import get_supabase
    from services.tier_limits import get_limits
    sb = get_supabase()

    # Check the subscriber doesn't already have an active paid subscription
    sub_result = sb.table("subscriptions").select("status, tier_key").eq("user_id", user_id).maybe_single().execute()
    if sub_result.data:
        status = sub_result.data.get("status", "active")
        current_tier = sub_result.data.get("tier_key", "free")
        if status == "active" and current_tier not in ("free",):
            raise HTTPException(
                status_code=400,
                detail="Subscriber already has an active paid subscription. Use the upgrade endpoint.",
            )

    stripe = _get_stripe()
    customer_id = _require_stripe_customer(stripe, user_id, email)

    # Resolve Stripe price ID from plans table
    plan = get_limits(tier_key)
    stripe_price_id = plan.get("stripe_price_id")
    if not stripe_price_id:
        raise HTTPException(
            status_code=400,
            detail=f"No Stripe price configured for tier '{tier_key}'. Contact support.",
        )

    client_portal_url = os.environ.get("CLIENT_PORTAL_URL", "http://localhost:5173").rstrip("/")

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": stripe_price_id, "quantity": 1}],
            success_url=f"{client_portal_url}/onboarding/complete?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{client_portal_url}/onboarding/plan",
            subscription_data={"metadata": {"user_id": user_id, "tier_key": tier_key}},
        )
        return session["url"]
    except Exception as e:
        logger.error("Stripe checkout session creation failed: %s", e)
        raise HTTPException(status_code=503, detail=f"Unable to start checkout. Please try again.")


def create_portal_session(user_id: str) -> str:
    """
    Create a Stripe Customer Portal session and return the URL.
    """
    from services.db import get_supabase
    sb = get_supabase()

    result = sb.table("subscriptions").select("stripe_customer_id").eq("user_id", user_id).maybe_single().execute()
    stripe_customer_id = result.data.get("stripe_customer_id") if result.data else None
    if not stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No billing account found. Subscribe to a paid plan first.",
        )

    stripe = _get_stripe()
    client_portal_url = os.environ.get("CLIENT_PORTAL_URL", "http://localhost:5173").rstrip("/")

    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=f"{client_portal_url}/settings/billing",
        )
        return portal_session["url"]
    except Exception as e:
        logger.error("Stripe portal session creation failed: %s", e)
        raise HTTPException(status_code=503, detail="Unable to open billing portal. Please try again.")


def upgrade_subscription(user_id: str, new_tier_key: str) -> dict:
    """
    Immediately switch an active paid subscriber to a higher tier (with proration).
    """
    from services.db import get_supabase
    from services.tier_limits import get_limits
    sb = get_supabase()

    result = sb.table("subscriptions").select("*").eq("user_id", user_id).maybe_single().execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="No active subscription found.")

    sub = result.data
    current_tier = sub.get("tier_key", "free")
    status = sub.get("status", "active")
    stripe_subscription_id = sub.get("stripe_subscription_id")
    stripe_subscription_item_id = sub.get("stripe_subscription_item_id")

    if status != "active" or not stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active paid subscription found.")

    tier_order = {"free": 0, "starter": 1, "pro": 2, "enterprise": 3}
    if tier_order.get(new_tier_key, 0) <= tier_order.get(current_tier, 0):
        raise HTTPException(status_code=400, detail="New tier must be higher than current tier.")

    plan = get_limits(new_tier_key)
    new_price_id = plan.get("stripe_price_id")
    if not new_price_id:
        raise HTTPException(status_code=400, detail=f"No Stripe price configured for tier '{new_tier_key}'.")

    stripe = _get_stripe()
    try:
        updated = stripe.Subscription.modify(
            stripe_subscription_id,
            items=[{"id": stripe_subscription_item_id, "price": new_price_id}],
            proration_behavior="create_prorations",
        )
    except Exception as e:
        logger.error("Stripe upgrade failed: %s", e)
        raise HTTPException(status_code=500, detail="Upgrade failed. Please retry.")

    # Optimistic DB update — webhook confirms
    import datetime
    period_end = None
    try:
        period_end = datetime.datetime.utcfromtimestamp(updated["current_period_end"]).isoformat() + "Z"
    except Exception:
        pass

    sb.table("subscriptions").update({
        "tier_key": new_tier_key,
        "stripe_price_id": new_price_id,
        "updated_at": "now()",
    }).eq("user_id", user_id).execute()

    return {
        "ok": True,
        "effective_tier": new_tier_key,
        "current_period_end": period_end,
    }


def downgrade_subscription(user_id: str, new_tier_key: str) -> dict:
    """
    Schedule a downgrade to take effect at current_period_end.
    Stores pending_tier_key; applied when the subscription renews via webhook.
    """
    from services.db import get_supabase
    sb = get_supabase()

    result = sb.table("subscriptions").select("*").eq("user_id", user_id).maybe_single().execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="No active subscription found.")

    sub = result.data
    current_tier = sub.get("tier_key", "free")
    status = sub.get("status", "active")
    pending_tier = sub.get("pending_tier_key")

    if status != "active":
        raise HTTPException(status_code=400, detail="No active subscription to downgrade.")

    tier_order = {"free": 0, "starter": 1, "pro": 2, "enterprise": 3}
    if tier_order.get(new_tier_key, 0) >= tier_order.get(current_tier, 0):
        raise HTTPException(status_code=400, detail="New tier must be lower than current tier.")

    if pending_tier:
        raise HTTPException(status_code=400, detail="A downgrade is already scheduled.")

    sb.table("subscriptions").update({
        "pending_tier_key": new_tier_key,
        "updated_at": "now()",
    }).eq("user_id", user_id).execute()

    current_period_end = sub.get("current_period_end")
    return {
        "ok": True,
        "pending_tier_key": new_tier_key,
        "effective_until": current_period_end,
    }


def cancel_subscription(user_id: str) -> dict:
    """
    Schedule subscription cancellation at period end.
    """
    from services.db import get_supabase
    sb = get_supabase()

    result = sb.table("subscriptions").select("stripe_subscription_id, current_period_end").eq("user_id", user_id).maybe_single().execute()
    if not result.data or not result.data.get("stripe_subscription_id"):
        raise HTTPException(status_code=400, detail="No active Stripe subscription found.")

    stripe_sub_id = result.data["stripe_subscription_id"]
    stripe = _get_stripe()

    try:
        stripe.Subscription.modify(stripe_sub_id, cancel_at_period_end=True)
    except Exception as e:
        logger.error("Stripe cancel failed: %s", e)
        raise HTTPException(status_code=503, detail="Unable to schedule cancellation. Please retry.")

    sb.table("subscriptions").update({
        "cancel_at_period_end": True,
        "updated_at": "now()",
    }).eq("user_id", user_id).execute()

    return {
        "ok": True,
        "cancels_at": result.data.get("current_period_end"),
    }


def reactivate_subscription(user_id: str) -> dict:
    """
    Remove scheduled cancellation.
    """
    from services.db import get_supabase
    sb = get_supabase()

    result = sb.table("subscriptions").select("stripe_subscription_id").eq("user_id", user_id).maybe_single().execute()
    if not result.data or not result.data.get("stripe_subscription_id"):
        raise HTTPException(status_code=400, detail="No active Stripe subscription found.")

    stripe_sub_id = result.data["stripe_subscription_id"]
    stripe = _get_stripe()

    try:
        stripe.Subscription.modify(stripe_sub_id, cancel_at_period_end=False)
    except Exception as e:
        logger.error("Stripe reactivate failed: %s", e)
        raise HTTPException(status_code=503, detail="Unable to reactivate subscription. Please retry.")

    sb.table("subscriptions").update({
        "cancel_at_period_end": False,
        "updated_at": "now()",
    }).eq("user_id", user_id).execute()

    return {"ok": True}


def get_payment_method(user_id: str) -> dict:
    """
    Return summary of the subscriber's default payment method.
    Cached per user for 300 s. Falls back to null fields on Stripe error.
    """
    now = time.time()
    if user_id in _pm_cache and (now - _pm_cache_ts.get(user_id, 0)) < _PM_TTL:
        return _pm_cache[user_id]

    _null_card = {"brand": None, "last4": None, "exp_month": None, "exp_year": None}

    from services.db import get_supabase
    sb = get_supabase()

    result = sb.table("subscriptions").select("stripe_customer_id").eq("user_id", user_id).maybe_single().execute()
    stripe_customer_id = result.data.get("stripe_customer_id") if result.data else None
    if not stripe_customer_id:
        return {**_null_card}

    try:
        stripe = _get_stripe()
    except HTTPException:
        return {**_null_card, "stale": True}

    try:
        customer = stripe.Customer.retrieve(
            stripe_customer_id,
            expand=["invoice_settings.default_payment_method"],
        )
        pm = customer.get("invoice_settings", {}).get("default_payment_method") or {}
        card = pm.get("card", {}) if isinstance(pm, dict) else {}
        info = {
            "brand":     card.get("brand"),
            "last4":     card.get("last4"),
            "exp_month": card.get("exp_month"),
            "exp_year":  card.get("exp_year"),
        }
        _pm_cache[user_id] = info
        _pm_cache_ts[user_id] = now
        return info
    except Exception as e:
        logger.warning("Stripe payment method fetch failed for %s: %s", user_id, e)
        return {**_null_card, "stale": True}


def invalidate_pm_cache(user_id: str) -> None:
    """Invalidate the payment method cache for a user (called on customer.updated webhook)."""
    _pm_cache.pop(user_id, None)
    _pm_cache_ts.pop(user_id, None)


def handle_webhook_event(raw_body: bytes, sig_header: str) -> dict:
    """
    Verify Stripe webhook signature and process the event.
    Returns {"received": True} on success or raises HTTPException(400) on signature failure.
    """
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    if not webhook_secret:
        logger.error("STRIPE_WEBHOOK_SECRET is not configured — webhook endpoint is non-functional")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    stripe = _get_stripe()

    try:
        event = stripe.Webhook.construct_event(raw_body, sig_header, webhook_secret)
    except stripe.error.SignatureVerificationError as e:
        logger.warning("Stripe webhook signature verification failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature.")
    except Exception as e:
        logger.warning("Stripe webhook parsing failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_id = event["id"]
    event_type = event["type"]

    from services.db import get_supabase
    sb = get_supabase()

    # Idempotency: attempt INSERT first. The primary key on stripe_event_id
    # makes duplicate inserts fail with postgres error code 23505. We only
    # process the event when the INSERT succeeds — this is atomic and
    # eliminates the SELECT-then-INSERT race on concurrent duplicate deliveries.
    import json
    payload_summary = json.dumps(event)[:500]
    try:
        sb.table("stripe_webhook_events").insert({
            "stripe_event_id": event_id,
            "event_type": event_type,
            "payload_summary": payload_summary,
        }).execute()
    except Exception as e:
        err_str = str(e)
        if "23505" in err_str or "duplicate key" in err_str.lower():
            logger.debug("Stripe webhook event %s already processed — skipping", event_id)
            return {"received": True}
        # Any other insert error: log and fall through; processing should still
        # be attempted rather than silently dropped for non-idempotency errors.
        logger.warning("Could not record webhook event %s: %s", event_id, e)

    _process_event(sb, stripe, event)
    return {"received": True}


def _process_event(sb, stripe, event: dict) -> None:
    """Dispatch webhook event to the appropriate handler."""
    event_type = event["type"]
    data_obj = event.get("data", {}).get("object", {})

    try:
        if event_type == "checkout.session.completed":
            _handle_checkout_completed(sb, data_obj)
        elif event_type == "customer.subscription.updated":
            _handle_subscription_updated(sb, data_obj)
        elif event_type == "customer.subscription.deleted":
            _handle_subscription_deleted(sb, data_obj)
        elif event_type == "invoice.payment_succeeded":
            _handle_invoice_payment_succeeded(sb, data_obj)
        elif event_type == "invoice.payment_failed":
            _handle_invoice_payment_failed(sb, data_obj)
        elif event_type == "customer.updated":
            _handle_customer_updated(data_obj)
        else:
            logger.debug("Stripe webhook event %s ignored", event_type)
    except Exception as e:
        logger.error("Error processing Stripe event %s (%s): %s", event.get("id"), event_type, e)


def _handle_checkout_completed(sb, session: dict) -> None:
    """checkout.session.completed — activate subscription."""
    metadata = session.get("metadata") or session.get("subscription_data", {}).get("metadata", {})
    user_id = metadata.get("user_id") or session.get("client_reference_id")
    tier_key = metadata.get("tier_key", "starter")
    stripe_subscription_id = session.get("subscription")
    stripe_customer_id = session.get("customer")

    if not user_id or not stripe_subscription_id:
        logger.warning("checkout.session.completed missing user_id or subscription_id")
        return

    # Fetch subscription item ID from Stripe
    try:
        stripe = _get_stripe()
        sub = stripe.Subscription.retrieve(stripe_subscription_id)
        items = sub.get("items", {}).get("data", [])
        item_id = items[0]["id"] if items else None
        price_id = items[0]["price"]["id"] if items else None
        period_start = sub.get("current_period_start")
        period_end = sub.get("current_period_end")
        import datetime
        ps = datetime.datetime.utcfromtimestamp(period_start).isoformat() + "Z" if period_start else None
        pe = datetime.datetime.utcfromtimestamp(period_end).isoformat() + "Z" if period_end else None
    except Exception as e:
        logger.warning("Could not fetch subscription details from Stripe: %s", e)
        item_id = None
        price_id = None
        ps = pe = None

    sb.table("subscriptions").upsert({
        "user_id": user_id,
        "tier_key": tier_key,
        "stripe_customer_id": stripe_customer_id,
        "stripe_subscription_id": stripe_subscription_id,
        "stripe_subscription_item_id": item_id,
        "stripe_price_id": price_id,
        "status": "active",
        "current_period_start": ps,
        "current_period_end": pe,
        "updated_at": "now()",
    }, on_conflict="user_id").execute()

    sb.table("user_profiles").update({
        "onboarding_completed": True,
        "onboarding_step": "complete",
    }).eq("id", user_id).execute()

    logger.info("checkout.session.completed: user %s activated on %s", user_id, tier_key)


def _handle_subscription_updated(sb, subscription: dict) -> None:
    """customer.subscription.updated — update status, period, cancel flag, handle pending downgrade."""
    stripe_subscription_id = subscription.get("id")
    if not stripe_subscription_id:
        return

    result = sb.table("subscriptions").select("*").eq("stripe_subscription_id", stripe_subscription_id).maybe_single().execute()
    if not result.data:
        return

    sub_row = result.data
    user_id = sub_row["user_id"]
    old_period_start = sub_row.get("current_period_start")
    pending_tier = sub_row.get("pending_tier_key")

    import datetime
    ps_ts = subscription.get("current_period_start")
    pe_ts = subscription.get("current_period_end")
    new_ps = datetime.datetime.utcfromtimestamp(ps_ts).isoformat() + "Z" if ps_ts else None
    new_pe = datetime.datetime.utcfromtimestamp(pe_ts).isoformat() + "Z" if pe_ts else None

    new_status = subscription.get("status", sub_row.get("status", "active"))
    cancel_at_period_end = subscription.get("cancel_at_period_end", False)

    update_payload: dict = {
        "status": new_status,
        "cancel_at_period_end": cancel_at_period_end,
        "current_period_start": new_ps,
        "current_period_end": new_pe,
        "updated_at": "now()",
    }

    # Apply pending downgrade if the billing cycle has rolled over
    if pending_tier and old_period_start and new_ps and new_ps != old_period_start:
        logger.info("Applying pending downgrade to %s for user %s", pending_tier, user_id)
        try:
            from services.tier_limits import get_limits
            plan = get_limits(pending_tier)
            new_price_id = plan.get("stripe_price_id")
            if new_price_id:
                items = subscription.get("items", {}).get("data", [])
                item_id = items[0]["id"] if items else sub_row.get("stripe_subscription_item_id")
                stripe = _get_stripe()
                stripe.Subscription.modify(
                    stripe_subscription_id,
                    items=[{"id": item_id, "price": new_price_id}],
                )
        except Exception as e:
            logger.error("Could not apply pending downgrade: %s", e)

        update_payload["tier_key"] = pending_tier
        update_payload["pending_tier_key"] = None

    sb.table("subscriptions").update(update_payload).eq("user_id", user_id).execute()


def _handle_subscription_deleted(sb, subscription: dict) -> None:
    """customer.subscription.deleted — cancel and downgrade to free."""
    stripe_subscription_id = subscription.get("id")
    if not stripe_subscription_id:
        return

    result = sb.table("subscriptions").select("user_id").eq("stripe_subscription_id", stripe_subscription_id).maybe_single().execute()
    if not result.data:
        return

    user_id = result.data["user_id"]
    sb.table("subscriptions").update({
        "status": "canceled",
        "tier_key": "free",
        "stripe_subscription_id": None,
        "stripe_subscription_item_id": None,
        "stripe_price_id": None,
        "cancel_at_period_end": False,
        "pending_tier_key": None,
        "updated_at": "now()",
    }).eq("user_id", user_id).execute()

    logger.info("customer.subscription.deleted: user %s downgraded to free", user_id)


def _handle_invoice_payment_succeeded(sb, invoice: dict) -> None:
    """invoice.payment_succeeded — insert/update invoice row; recover from past_due."""
    stripe_invoice_id = invoice.get("id")
    customer_id = invoice.get("customer")
    if not stripe_invoice_id or not customer_id:
        return

    result = sb.table("subscriptions").select("user_id, tier_key").eq("stripe_customer_id", customer_id).maybe_single().execute()
    if not result.data:
        return

    user_id = result.data["user_id"]
    tier_key = result.data.get("tier_key", "free")

    import datetime
    ps_ts = invoice.get("period_start")
    pe_ts = invoice.get("period_end")
    period_start = datetime.datetime.utcfromtimestamp(ps_ts).isoformat() + "Z" if ps_ts else None
    period_end = datetime.datetime.utcfromtimestamp(pe_ts).isoformat() + "Z" if pe_ts else None

    sb.table("invoices").upsert({
        "user_id": user_id,
        "stripe_invoice_id": stripe_invoice_id,
        "amount_due": float(invoice.get("amount_due", 0)) / 100,
        "amount_paid": float(invoice.get("amount_paid", 0)) / 100,
        "currency": invoice.get("currency", "usd"),
        "status": invoice.get("status", "paid"),
        "description": invoice.get("description"),
        "tier_key": tier_key,
        "period_start": period_start,
        "period_end": period_end,
        "invoice_pdf": invoice.get("invoice_pdf"),
        "hosted_invoice_url": invoice.get("hosted_invoice_url"),
    }, on_conflict="stripe_invoice_id").execute()

    # Recover from past_due if status is now paid
    sb.table("subscriptions").update({
        "status": "active",
        "updated_at": "now()",
    }).eq("user_id", user_id).eq("status", "past_due").execute()


def _handle_invoice_payment_failed(sb, invoice: dict) -> None:
    """invoice.payment_failed — set subscription to past_due."""
    customer_id = invoice.get("customer")
    if not customer_id:
        return

    result = sb.table("subscriptions").select("user_id").eq("stripe_customer_id", customer_id).maybe_single().execute()
    if not result.data:
        return

    user_id = result.data["user_id"]
    sb.table("subscriptions").update({
        "status": "past_due",
        "updated_at": "now()",
    }).eq("user_id", user_id).execute()

    logger.info("invoice.payment_failed: user %s set to past_due", user_id)


def _handle_customer_updated(data_obj: dict) -> None:
    """customer.updated — invalidate the payment method cache for the user."""
    customer_id = data_obj.get("id")
    if not customer_id:
        return

    try:
        from services.db import get_supabase
        sb = get_supabase()
        result = sb.table("subscriptions").select("user_id").eq("stripe_customer_id", customer_id).maybe_single().execute()
        if result.data:
            invalidate_pm_cache(result.data["user_id"])
    except Exception:
        pass


# ── Platform settings cache (invite_only_mode) ────────────────────────────────

def get_platform_settings() -> dict:
    """
    Return platform settings from DB with 60 s cache.
    Falls back to safe defaults (invite_only_mode=False) on error.
    """
    global _settings_cache, _settings_cache_ts
    now = time.time()
    if _settings_cache and (now - _settings_cache_ts) < _SETTINGS_TTL:
        return _settings_cache

    defaults = {"invite_only_mode": False, "maintenance_mode": False}
    try:
        from services.db import get_supabase
        result = get_supabase().table("platform_settings").select("*").eq("id", 1).maybe_single().execute()
        if result.data:
            _settings_cache = {
                "invite_only_mode": result.data.get("invite_only_mode", False),
                "maintenance_mode": result.data.get("maintenance_mode", False),
            }
            _settings_cache_ts = now
            return _settings_cache
    except Exception as e:
        logger.warning("Could not load platform settings (using defaults): %s", e)

    return defaults


def invalidate_settings_cache() -> None:
    """Force a reload on the next call to get_platform_settings()."""
    global _settings_cache_ts
    _settings_cache_ts = 0.0

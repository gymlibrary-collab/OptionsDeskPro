"""
Platform routes — /api/platform/*

All routes require an active platform_staff row (checked by require_staff()).
Further role restrictions are enforced per endpoint.
"""
import logging
import os
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.auth_utils import verify_token, get_user_id, get_user_email
from services.staff_auth import require_staff
from services.db import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

# Whitelist for subscriber search — alphanumeric, @, ., _, -, and space only.
# Everything else is stripped before interpolation into PostgREST filter strings.
_SEARCH_SAFE = re.compile(r"[^a-zA-Z0-9@._\- ]")


def _sanitise_search(raw: str) -> str:
    """Strip characters that are not in the PostgREST-safe whitelist."""
    return _SEARCH_SAFE.sub("", raw)


# ── Audit log helper ─────────────────────────────────────────────────────────

def _audit(actor: dict, action_type: str, target_user_id: Optional[str] = None, payload: Optional[dict] = None) -> None:
    """Write a platform_audit_log entry. Best-effort — never raises."""
    try:
        sb = get_supabase()
        sb.table("platform_audit_log").insert({
            "actor_id":       actor["id"],
            "actor_email":    actor["email"],
            "target_user_id": target_user_id,
            "action_type":    action_type,
            "payload":        payload,
        }).execute()
    except Exception as e:
        logger.warning("Audit log write failed: %s", e)


# ── Staff profile ─────────────────────────────────────────────────────────────

@router.get("/platform/staff/me")
async def get_staff_me(staff: dict = Depends(require_staff())):
    """Return the authenticated staff member's profile."""
    return staff


# ── Subscriber management ─────────────────────────────────────────────────────

@router.get("/platform/subscribers")
async def list_subscribers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    tier_key: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    staff: dict = Depends(require_staff(["owner", "support"])),
):
    """Paginated list of all subscriber profiles. Owner and support only."""
    sb = get_supabase()

    # subscriptions.user_id references auth.users (not user_profiles), so PostgREST
    # cannot discover the FK for an !inner join. Use two separate queries and merge.

    # 1. Query subscriptions with optional tier/status filters.
    sub_query = sb.table("subscriptions").select("user_id, tier_key, admin_override_tier_key, status, stripe_customer_id")
    if tier_key:
        sub_query = sub_query.eq("tier_key", tier_key)
    if status:
        sub_query = sub_query.eq("status", status)
    try:
        sub_result = sub_query.execute()
        sub_rows = sub_result.data or []
    except Exception as e:
        logger.warning("Subscriber subscriptions query failed: %s", e)
        sub_rows = []

    if not sub_rows:
        return {"total": 0, "page": page, "page_size": page_size, "subscribers": []}

    # Build lookup by user_id.
    sub_map = {r["user_id"]: r for r in sub_rows}
    user_ids = list(sub_map.keys())

    # 2. Query user_profiles for those user_ids, with optional search filter.
    profile_query = sb.table("user_profiles").select(
        "id, email, full_name, created_at, last_seen_at, deactivated_at"
    ).in_("id", user_ids)
    if search:
        safe = _sanitise_search(search)
        profile_query = profile_query.or_(f"email.ilike.%{safe}%,full_name.ilike.%{safe}%")

    try:
        profile_result = profile_query.execute()
        profile_rows = profile_result.data or []
    except Exception as e:
        logger.warning("Subscriber profiles query failed: %s", e)
        profile_rows = []

    profile_map = {r["id"]: r for r in profile_rows}

    # 3. Merge: only include users present in both tables (inner join semantics).
    merged = []
    for uid in user_ids:
        prof = profile_map.get(uid)
        if not prof:
            continue
        sub = sub_map[uid]
        merged.append({
            "id":                  uid,
            "email":               prof.get("email"),
            "full_name":           prof.get("full_name"),
            "tier_key":                sub.get("tier_key", "free"),
            "admin_override_tier_key": sub.get("admin_override_tier_key"),
            "subscription_status":     sub.get("status", "active"),
            "stripe_customer_id":      sub.get("stripe_customer_id"),
            "created_at":          prof.get("created_at"),
            "last_seen_at":        prof.get("last_seen_at"),
            "is_active":           prof.get("deactivated_at") is None,
        })

    total = len(merged)
    offset = (page - 1) * page_size
    subscribers = merged[offset: offset + page_size]

    return {
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "subscribers": subscribers,
    }


@router.get("/platform/subscribers/{user_id}")
async def get_subscriber(
    user_id: str,
    staff: dict = Depends(require_staff(["owner", "support"])),
):
    """Full subscriber profile for support view."""
    sb = get_supabase()

    profile_result = sb.table("user_profiles").select("*").eq("id", user_id).maybe_single().execute()
    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Subscriber not found.")

    profile = profile_result.data

    sub_result = sb.table("subscriptions").select("*").eq("user_id", user_id).maybe_single().execute()
    subscription = sub_result.data or {}

    # Watchlist symbols
    watchlist_symbols: list = []
    try:
        wl_result = sb.table("user_watchlists").select("symbols").eq("user_id", user_id).maybe_single().execute()
        if wl_result.data:
            raw = wl_result.data.get("symbols") or []
            watchlist_symbols = raw if isinstance(raw, list) else []
    except Exception:
        pass

    # Open positions summary (symbol, qty, avg_cost, strategy)
    positions: list = []
    positions_count = 0
    try:
        pos_result = sb.table("positions").select(
            "id, symbol, quantity, avg_cost, strategy_name, opened_at"
        ).eq("user_id", user_id).eq("status", "open").execute()
        rows = pos_result.data or []
        positions_count = len(rows)
        positions = [
            {
                "id":            r.get("id"),
                "symbol":        r.get("symbol"),
                "quantity":      r.get("quantity"),
                "avg_cost":      r.get("avg_cost"),
                "strategy":      r.get("strategy_name"),
                "opened_at":     r.get("opened_at"),
            }
            for r in rows
        ]
    except Exception:
        pass

    # Recent orders (last 20)
    orders: list = []
    orders_count = 0
    try:
        ord_result = sb.table("orders").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(20).execute()
        orders = ord_result.data or []
        # Total orders count (for summary display)
        ord_count_result = sb.table("orders").select("id", count="exact").eq("user_id", user_id).execute()
        orders_count = ord_count_result.count or 0
    except Exception:
        pass

    # Recent activity (last 20 entries)
    recent_activity: list = []
    try:
        act_result = sb.table("activity_log").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(20).execute()
        recent_activity = act_result.data or []
    except Exception:
        pass

    invoices_result = sb.table("invoices").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(20).execute()

    # Stripe internal IDs are restricted to owner role — support staff
    # do not need them and the principle of least disclosure applies.
    is_owner = staff.get("staff_role") == "owner"
    subscription_block: dict = {
        "tier_key":               subscription.get("tier_key", "free"),
        "status":                 subscription.get("status", "active"),
        "current_period_end":     subscription.get("current_period_end"),
        "cancel_at_period_end":   subscription.get("cancel_at_period_end", False),
        "admin_override_tier_key": subscription.get("admin_override_tier_key"),
    }
    if is_owner:
        subscription_block["stripe_customer_id"]     = subscription.get("stripe_customer_id")
        subscription_block["stripe_subscription_id"] = subscription.get("stripe_subscription_id")

    return {
        "profile": {
            "id":                   profile.get("id"),
            "email":                profile.get("email"),
            "full_name":            profile.get("full_name"),
            "avatar_url":           profile.get("avatar_url"),
            "created_at":           profile.get("created_at"),
            "last_seen_at":         profile.get("last_seen_at"),
            "onboarding_completed": profile.get("onboarding_completed", False),
            "is_active":            profile.get("deactivated_at") is None,
        },
        "subscription": subscription_block,
        "watchlist_symbols": watchlist_symbols,
        "positions":         positions,
        "positions_count":   positions_count,
        "orders":            orders,
        "orders_count":      orders_count,
        "recent_activity":   recent_activity,
        "invoices":          invoices_result.data or [],
    }


# ── Support sessions ──────────────────────────────────────────────────────────

@router.post("/platform/subscribers/{user_id}/support-session")
async def start_support_session(
    user_id: str,
    staff: dict = Depends(require_staff(["owner", "support"])),
):
    """Begin a read-only support session for the subscriber."""
    sb = get_supabase()

    # Verify subscriber exists
    check = sb.table("user_profiles").select("id, email").eq("id", user_id).maybe_single().execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Subscriber not found.")

    subscriber_email = check.data.get("email", "")

    result = sb.table("support_sessions").insert({
        "staff_id":      staff["id"],
        "subscriber_id": user_id,
    }).execute()

    session_id = result.data[0]["id"] if result.data else None

    _audit(staff, "support_session_start", target_user_id=user_id, payload={
        "subscriber_email": subscriber_email,
        "session_id": session_id,
    })

    return {
        "support_session_id": session_id,
        "subscriber_id":      user_id,
        "subscriber_email":   subscriber_email,
        "started_at":         result.data[0]["started_at"] if result.data else None,
    }


@router.delete("/platform/subscribers/{user_id}/support-session")
async def end_support_session(
    user_id: str,
    staff: dict = Depends(require_staff(["owner", "support"])),
):
    """End an active support session."""
    sb = get_supabase()

    # Find active session
    result = sb.table("support_sessions").select("id").eq("staff_id", staff["id"]).eq("subscriber_id", user_id).is_("ended_at", "null").maybe_single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No active support session found.")

    session_id = result.data["id"]
    sb.table("support_sessions").update({"ended_at": "now()"}).eq("id", session_id).execute()

    _audit(staff, "support_session_end", target_user_id=user_id, payload={"session_id": session_id})

    return {"ok": True}


# ── Tier override ─────────────────────────────────────────────────────────────

class TierOverrideRequest(BaseModel):
    tier_key: Optional[str] = None
    reason: Optional[str] = None


@router.patch("/platform/subscribers/{user_id}/tier-override")
async def set_tier_override(
    user_id: str,
    body: TierOverrideRequest,
    staff: dict = Depends(require_staff(["owner"])),
):
    """Set or clear admin_override_tier_key on the subscriber's subscription."""
    sb = get_supabase()

    # Get current state for audit (may be None for free users with no sub row)
    current = sb.table("subscriptions").select("admin_override_tier_key, tier_key").eq("user_id", user_id).maybe_single().execute()
    before = current.data.get("admin_override_tier_key") if current.data else None

    # Upsert so the override works even when no subscriptions row exists yet
    sb.table("subscriptions").upsert({
        "user_id":                user_id,
        "tier_key":               (current.data or {}).get("tier_key", "free"),
        "status":                 "active",
        "admin_override_tier_key": body.tier_key,
        "updated_at":             "now()",
    }, on_conflict="user_id").execute()

    # Sync user_profiles.subscription_tier so the session endpoint reflects it
    # immediately without requiring the user to log out and back in.
    effective = body.tier_key or (current.data or {}).get("tier_key", "free")
    sb.table("user_profiles").update({
        "subscription_tier": effective,
    }).eq("id", user_id).execute()

    _audit(staff, "tier_override", target_user_id=user_id, payload={
        "before": before,
        "after":  body.tier_key,
        "reason": body.reason,
    })

    return {"ok": True, "admin_override_tier_key": body.tier_key}


# ── Account deactivate/reactivate ─────────────────────────────────────────────

@router.patch("/platform/subscribers/{user_id}/deactivate")
async def deactivate_subscriber(
    user_id: str,
    staff: dict = Depends(require_staff(["owner"])),
):
    """Suspend a subscriber account by setting deactivated_at = now()."""
    sb = get_supabase()
    sb.table("user_profiles").update({"deactivated_at": "now()"}).eq("id", user_id).execute()
    # Immediately evict from the deactivation cache so the 403 takes effect
    # on the very next request, not after the 60 s TTL expires.
    from services.auth_utils import invalidate_deactivation_cache
    invalidate_deactivation_cache(user_id)
    _audit(staff, "account_deactivate", target_user_id=user_id)
    return {"ok": True}


@router.patch("/platform/subscribers/{user_id}/reactivate")
async def reactivate_subscriber(
    user_id: str,
    staff: dict = Depends(require_staff(["owner"])),
):
    """Clear deactivated_at to restore login access."""
    sb = get_supabase()
    sb.table("user_profiles").update({"deactivated_at": None}).eq("id", user_id).execute()
    # Evict cache so the account is unblocked immediately.
    from services.auth_utils import invalidate_deactivation_cache
    invalidate_deactivation_cache(user_id)
    _audit(staff, "account_reactivate", target_user_id=user_id)
    return {"ok": True}


# ── Pricing management ────────────────────────────────────────────────────────

@router.get("/platform/pricing")
async def get_platform_pricing(staff: dict = Depends(require_staff())):
    """Return all plans with full details including Stripe IDs."""
    sb = get_supabase()
    result = sb.table("plans").select("*").order("sort_order").execute()
    plans = result.data or []
    # Normalize DB column features_json → features so the frontend Plan interface works.
    for plan in plans:
        if "features_json" in plan and "features" not in plan:
            plan["features"] = plan.pop("features_json")
    return {"plans": plans}


class PricingUpdateRequest(BaseModel):
    price_monthly_usd: Optional[float] = None
    max_symbols: Optional[int] = None
    max_scans_per_month: Optional[int] = None
    features_json: Optional[dict] = None


@router.patch("/platform/pricing/{tier_key}")
async def update_pricing(
    tier_key: str,
    body: PricingUpdateRequest,
    staff: dict = Depends(require_staff(["owner"])),
):
    """
    Update a tier's price or entitlements.
    Price changes: create new Stripe Price, archive old (ADR-0004).
    Entitlement changes: update DB directly, flush plans cache.
    """
    sb = get_supabase()

    plan_result = sb.table("plans").select("*").eq("tier_key", tier_key).maybe_single().execute()
    if not plan_result.data:
        raise HTTPException(status_code=404, detail=f"Plan '{tier_key}' not found.")

    plan = plan_result.data
    update_payload: dict = {"updated_at": "now()"}
    audit_before: dict = {}
    audit_after: dict = {}
    new_stripe_price_id: Optional[str] = None
    affected_count = 0

    # Price change
    if body.price_monthly_usd is not None:
        if tier_key == "free":
            raise HTTPException(status_code=400, detail="Free tier price is immutable at $0.00.")
        if body.price_monthly_usd <= 0:
            raise HTTPException(status_code=400, detail="price_monthly_usd must be > 0 for paid tiers.")

        audit_before["price_monthly_usd"] = float(plan.get("price_monthly_usd") or 0)
        audit_after["price_monthly_usd"] = body.price_monthly_usd

        # Count affected subscribers
        try:
            count_result = sb.table("subscriptions").select("id", count="exact").eq("tier_key", tier_key).eq("status", "active").execute()
            affected_count = count_result.count or 0
        except Exception:
            affected_count = 0

        # Create new Stripe Price and archive old (ADR-0004)
        old_stripe_price_id = plan.get("stripe_price_id")
        stripe_product_id = plan.get("stripe_product_id")
        if stripe_product_id:
            try:
                from services.stripe_service import _get_stripe
                stripe = _get_stripe()
                new_price = stripe.Price.create(
                    product=stripe_product_id,
                    unit_amount=int(body.price_monthly_usd * 100),
                    currency="usd",
                    recurring={"interval": "month"},
                )
                new_stripe_price_id = new_price["id"]
                update_payload["stripe_price_id"] = new_stripe_price_id
                audit_after["stripe_price_id"] = new_stripe_price_id

                if old_stripe_price_id:
                    try:
                        stripe.Price.modify(old_stripe_price_id, active=False)
                    except Exception as e:
                        logger.warning("Could not archive old Stripe price %s: %s", old_stripe_price_id, e)
            except HTTPException:
                # Stripe not configured — update DB price only
                logger.warning("Stripe not configured — updating DB price only for %s", tier_key)
            except Exception as e:
                logger.error("Stripe price creation failed: %s", e)
                raise HTTPException(status_code=500, detail="Failed to create Stripe price. DB not updated.")

        update_payload["price_monthly_usd"] = body.price_monthly_usd

    # Entitlement changes
    if body.max_symbols is not None:
        audit_before["max_symbols"] = plan.get("max_symbols")
        audit_after["max_symbols"] = body.max_symbols
        update_payload["max_symbols"] = body.max_symbols

    if body.max_scans_per_month is not None:
        audit_before["max_scans_per_month"] = plan.get("max_scans_per_month")
        audit_after["max_scans_per_month"] = body.max_scans_per_month
        update_payload["max_scans_per_month"] = body.max_scans_per_month

    if body.features_json is not None:
        audit_before["features_json"] = plan.get("features_json")
        audit_after["features_json"] = body.features_json
        update_payload["features_json"] = body.features_json

    sb.table("plans").update(update_payload).eq("tier_key", tier_key).execute()

    # Flush plans cache so changes propagate within 60 s (ADR-0003)
    from services.tier_limits import invalidate_plans_cache
    invalidate_plans_cache()

    _audit(staff, "pricing_change", payload={"tier_key": tier_key, "before": audit_before, "after": audit_after})

    return {
        "ok": True,
        "affected_subscriber_count": affected_count,
        "new_stripe_price_id": new_stripe_price_id,
    }


# ── Revenue metrics ───────────────────────────────────────────────────────────

@router.get("/platform/revenue")
async def get_revenue(staff: dict = Depends(require_staff(["owner", "finance"]))):
    """Revenue metrics from DB. No live Stripe call."""
    sb = get_supabase()

    # MRR: sum of plan prices for active paid subscribers
    mrr_usd = 0.0
    active_by_tier: dict[str, int] = {}
    plan_prices: dict[str, float] = {}  # initialised here so past_due block can always reference it
    try:
        # Get plans with prices
        plans_result = sb.table("plans").select("tier_key, price_monthly_usd").execute()
        plan_prices = {p["tier_key"]: float(p["price_monthly_usd"] or 0) for p in (plans_result.data or [])}

        subs = sb.table("subscriptions").select("tier_key").eq("status", "active").execute().data or []
        for sub in subs:
            t = sub.get("tier_key", "free")
            active_by_tier[t] = active_by_tier.get(t, 0) + 1
            mrr_usd += plan_prices.get(t, 0.0)
    except Exception as e:
        logger.warning("MRR calculation failed: %s", e)

    # Monthly MRR trend from invoices
    mrr_by_month: list = []
    try:
        result = sb.rpc("pg_get_monthly_revenue", {}).execute()
        if result.data:
            mrr_by_month = result.data
    except Exception:
        # Fallback: group invoices by month
        try:
            invoices = sb.table("invoices").select("amount_paid, created_at").eq("status", "paid").order("created_at").execute().data or []
            month_totals: dict[str, float] = {}
            for inv in invoices:
                created = (inv.get("created_at") or "")[:7]  # 'YYYY-MM'
                if created:
                    month_totals[created] = month_totals.get(created, 0.0) + float(inv.get("amount_paid") or 0)
            mrr_by_month = [{"month": k, "mrr_usd": v} for k, v in sorted(month_totals.items())]
        except Exception as e2:
            logger.warning("Monthly MRR fallback failed: %s", e2)

    # New and churned this month
    from datetime import datetime, timezone
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    new_this_month = 0
    churned_this_month = 0
    try:
        new_result = sb.table("subscriptions").select("id", count="exact").gte("created_at", f"{this_month}-01").execute()
        new_this_month = new_result.count or 0

        churned_result = sb.table("subscriptions").select("id", count="exact").eq("status", "canceled").gte("updated_at", f"{this_month}-01").execute()
        churned_this_month = churned_result.count or 0
    except Exception:
        pass

    # Past due
    past_due_count = 0
    past_due_amount = 0.0
    try:
        pd_result = sb.table("subscriptions").select("tier_key").eq("status", "past_due").execute().data or []
        past_due_count = len(pd_result)
        for sub in pd_result:
            t = sub.get("tier_key", "free")
            past_due_amount += plan_prices.get(t, 0.0)
    except Exception:
        pass

    return {
        "mrr_current_usd":              round(mrr_usd, 2),
        "mrr_by_month":                 mrr_by_month,
        "active_subscribers_by_tier":   active_by_tier,
        "new_this_month":               new_this_month,
        "churned_this_month":           churned_this_month,
        "past_due_count":               past_due_count,
        "past_due_amount_at_risk_usd":  round(past_due_amount, 2),
    }


@router.get("/platform/revenue/export-csv")
async def export_revenue_csv(
    from_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    staff: dict = Depends(require_staff(["owner", "finance"])),
):
    """Export invoices as CSV."""
    import io, csv
    sb = get_supabase()

    query = sb.table("invoices").select(
        "created_at, user_id, tier_key, amount_paid, status,"
        "user_profiles!inner(email)"
    ).eq("status", "paid")

    if from_date:
        query = query.gte("created_at", from_date)
    if to_date:
        query = query.lte("created_at", to_date + "T23:59:59Z")

    result = query.order("created_at").execute()
    rows = result.data or []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["invoice_date", "subscriber_email", "tier_key", "amount_paid_usd", "status"])
    for row in rows:
        profile = row.get("user_profiles") or {}
        if isinstance(profile, list):
            profile = profile[0] if profile else {}
        writer.writerow([
            (row.get("created_at") or "")[:10],
            profile.get("email", row.get("user_id", "")),
            row.get("tier_key", ""),
            row.get("amount_paid", ""),
            row.get("status", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=revenue_export.csv"},
    )


# ── Health panel ──────────────────────────────────────────────────────────────

@router.get("/platform/health")
async def get_health(staff: dict = Depends(require_staff(["owner"]))):
    """
    System health panel data (FR-43, FR-44, FR-45, ADR-0006).
    No external API calls — all data from in-process counters and DB.
    """
    from services.metrics import get_counts_last_24h

    request_counts = get_counts_last_24h()

    # Active sessions: users with last_seen_at in last 15 minutes
    active_sessions = 0
    try:
        sb = get_supabase()
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
        result = sb.table("user_profiles").select("id", count="exact").gte("last_seen_at", cutoff).execute()
        active_sessions = result.count or 0
    except Exception as e:
        logger.warning("Active sessions count failed: %s", e)

    import os
    gemini_configured = bool(os.environ.get("GEMINI_API_KEY", "").strip())

    return {
        "api_status": "ok",
        "market_data_source": "yfinance",
        "gemini_configured": gemini_configured,
        "requests_last_24h":   request_counts,
        "active_sessions_last_15min": active_sessions,
    }


# ── Staff management ──────────────────────────────────────────────────────────

@router.get("/platform/staff")
async def list_staff(staff: dict = Depends(require_staff(["owner"]))):
    """List all platform staff. Owner only."""
    sb = get_supabase()
    result = sb.table("platform_staff").select("id, email, full_name, staff_role, is_active, last_seen_at, created_at").execute()
    return {"staff": result.data or []}


class StaffInviteRequest(BaseModel):
    email: str
    staff_role: str = "support"
    full_name: Optional[str] = None


@router.post("/platform/staff/invite")
async def invite_staff(
    body: StaffInviteRequest,
    staff: dict = Depends(require_staff(["owner"])),
):
    """Invite a new staff member by email. Owner only."""
    if body.staff_role not in ("owner", "support", "finance"):
        raise HTTPException(status_code=400, detail=f"Invalid staff_role '{body.staff_role}'.")

    sb = get_supabase()

    # Check email is not already a subscriber
    existing = sb.table("user_profiles").select("id").eq("email", body.email).maybe_single().execute()
    if existing.data:
        raise HTTPException(
            status_code=400,
            detail="Email is already a subscriber account.",
            headers={"X-Error-Code": "email_is_subscriber"},
        )

    # Check not already staff
    existing_staff = sb.table("platform_staff").select("id").eq("email", body.email).maybe_single().execute()
    if existing_staff.data:
        raise HTTPException(status_code=400, detail="Email is already a staff member.")

    # Supabase invite
    admin_portal_url = os.environ.get("ADMIN_PORTAL_URL", "").rstrip("/")
    try:
        result = sb.auth.admin.invite_user_by_email(
            body.email,
            options={"redirect_to": f"{admin_portal_url}/auth/callback"} if admin_portal_url else {},
        )
        invited_user_id = result.user.id if result.user else None
    except Exception as e:
        logger.error("Supabase invite failed for %s: %s", body.email, e)
        raise HTTPException(status_code=500, detail="Invitation failed. Please retry.")

    if not invited_user_id:
        raise HTTPException(status_code=500, detail="Invitation failed — no user ID returned.")

    sb.table("platform_staff").insert({
        "id":         invited_user_id,
        "email":      body.email,
        "full_name":  body.full_name or body.email,
        "staff_role": body.staff_role,
        "is_active":  True,
        "invited_by": staff["id"],
    }).execute()

    _audit(staff, "staff_invite", target_user_id=invited_user_id, payload={
        "email":      body.email,
        "staff_role": body.staff_role,
    })

    return {"ok": True, "email": body.email}


class StaffRoleRequest(BaseModel):
    staff_role: str


@router.patch("/platform/staff/{staff_id}/role")
async def change_staff_role(
    staff_id: str,
    body: StaffRoleRequest,
    staff: dict = Depends(require_staff(["owner"])),
):
    """Change a staff member's role. Owner only. Cannot self-demote."""
    if staff_id == staff["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role.")

    if body.staff_role not in ("owner", "support", "finance"):
        raise HTTPException(status_code=400, detail=f"Invalid staff_role '{body.staff_role}'.")

    sb = get_supabase()

    # Ensure at least one owner remains
    if body.staff_role != "owner":
        owner_count_result = sb.table("platform_staff").select("id", count="exact").eq("staff_role", "owner").eq("is_active", True).execute()
        owner_count = owner_count_result.count or 0
        target = sb.table("platform_staff").select("staff_role").eq("id", staff_id).maybe_single().execute()
        if target.data and target.data.get("staff_role") == "owner" and owner_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last active owner.")

    before_result = sb.table("platform_staff").select("staff_role").eq("id", staff_id).maybe_single().execute()
    before_role = before_result.data.get("staff_role") if before_result.data else None

    sb.table("platform_staff").update({"staff_role": body.staff_role, "updated_at": "now()"}).eq("id", staff_id).execute()

    _audit(staff, "staff_role_change", target_user_id=staff_id, payload={
        "before": before_role,
        "after":  body.staff_role,
    })

    return {"ok": True}


@router.patch("/platform/staff/{staff_id}/deactivate")
async def deactivate_staff(
    staff_id: str,
    staff: dict = Depends(require_staff(["owner"])),
):
    """Deactivate a staff account. Owner only. Same last-owner guard."""
    if staff_id == staff["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account.")

    sb = get_supabase()

    # Last-owner guard
    target = sb.table("platform_staff").select("staff_role").eq("id", staff_id).maybe_single().execute()
    if target.data and target.data.get("staff_role") == "owner":
        owner_count_result = sb.table("platform_staff").select("id", count="exact").eq("staff_role", "owner").eq("is_active", True).execute()
        if (owner_count_result.count or 0) <= 1:
            raise HTTPException(status_code=400, detail="Cannot deactivate the last active owner.")

    sb.table("platform_staff").update({"is_active": False, "updated_at": "now()"}).eq("id", staff_id).execute()

    _audit(staff, "staff_deactivate", target_user_id=staff_id)

    return {"ok": True}


# ── FAQ management ────────────────────────────────────────────────────────────

@router.get("/platform/faq")
async def get_platform_faq(staff: dict = Depends(require_staff(["owner", "support"]))):
    """List all FAQ articles (published and draft) for the admin editor."""
    sb = get_supabase()

    cats = sb.table("faq_categories").select("*").order("sort_order").execute().data or []
    articles = sb.table("faq_articles").select("*").order("sort_order").execute().data or []

    cat_map: dict[str, dict] = {}
    for cat in cats:
        cat_map[cat["id"]] = {**cat, "articles": []}
    uncategorised: list = []
    for art in articles:
        cat_id = art.get("category_id")
        if cat_id and cat_id in cat_map:
            cat_map[cat_id]["articles"].append(art)
        else:
            uncategorised.append(art)

    categories = sorted(cat_map.values(), key=lambda c: c.get("sort_order", 0))
    if uncategorised:
        categories.append({"id": None, "title": "Uncategorised", "articles": uncategorised})

    return {"categories": categories}


class FaqCreateRequest(BaseModel):
    category_id: Optional[str] = None
    question: str
    answer_markdown: str
    sort_order: int = 0


@router.post("/platform/faq")
async def create_faq(
    body: FaqCreateRequest,
    staff: dict = Depends(require_staff(["owner", "support"])),
):
    """Create a new FAQ article (draft by default)."""
    sb = get_supabase()
    result = sb.table("faq_articles").insert({
        "category_id":     body.category_id,
        "question":        body.question,
        "answer_markdown": body.answer_markdown,
        "sort_order":      body.sort_order,
        "is_published":    False,
        "created_by":      staff["id"],
        "updated_by":      staff["id"],
    }).execute()

    article_id = result.data[0]["id"] if result.data else None
    return {"id": article_id, "is_published": False}


class FaqUpdateRequest(BaseModel):
    question: Optional[str] = None
    answer_markdown: Optional[str] = None
    sort_order: Optional[int] = None
    category_id: Optional[str] = None


@router.patch("/platform/faq/{article_id}")
async def update_faq(
    article_id: str,
    body: FaqUpdateRequest,
    staff: dict = Depends(require_staff(["owner", "support"])),
):
    """Update question, answer, sort_order, or category."""
    sb = get_supabase()
    update_payload: dict = {"updated_by": staff["id"], "updated_at": "now()"}
    if body.question is not None:
        update_payload["question"] = body.question
    if body.answer_markdown is not None:
        update_payload["answer_markdown"] = body.answer_markdown
    if body.sort_order is not None:
        update_payload["sort_order"] = body.sort_order
    if body.category_id is not None:
        update_payload["category_id"] = body.category_id

    sb.table("faq_articles").update(update_payload).eq("id", article_id).execute()
    return {"ok": True}


class FaqPublishRequest(BaseModel):
    is_published: bool


@router.post("/platform/faq/{article_id}/publish")
async def publish_faq(
    article_id: str,
    body: FaqPublishRequest,
    staff: dict = Depends(require_staff(["owner", "support"])),
):
    """Toggle is_published on an FAQ article. Invalidates public FAQ cache."""
    sb = get_supabase()
    sb.table("faq_articles").update({
        "is_published": body.is_published,
        "updated_by":   staff["id"],
        "updated_at":   "now()",
    }).eq("id", article_id).execute()

    # Invalidate the public FAQ cache
    from routes.public_routes import invalidate_faq_cache
    invalidate_faq_cache()

    _audit(staff, "faq_publish", payload={"article_id": article_id, "is_published": body.is_published})
    return {"ok": True}


@router.delete("/platform/faq/{article_id}")
async def delete_faq(
    article_id: str,
    staff: dict = Depends(require_staff(["owner", "support"])),
):
    """Delete an FAQ article."""
    sb = get_supabase()
    sb.table("faq_articles").delete().eq("id", article_id).execute()

    # Invalidate cache
    from routes.public_routes import invalidate_faq_cache
    invalidate_faq_cache()

    _audit(staff, "faq_delete", payload={"article_id": article_id})
    return {"ok": True}


# ── Platform settings ─────────────────────────────────────────────────────────

@router.get("/platform/settings")
async def get_platform_settings(staff: dict = Depends(require_staff(["owner"]))):
    """Return current platform settings."""
    from services.stripe_service import get_platform_settings as _get_settings
    return _get_settings()


class PlatformSettingsUpdateRequest(BaseModel):
    invite_only_mode: Optional[bool] = None
    maintenance_mode: Optional[bool] = None


@router.patch("/platform/settings")
async def update_platform_settings(
    body: PlatformSettingsUpdateRequest,
    staff: dict = Depends(require_staff(["owner"])),
):
    """Update platform settings. Flushes settings cache."""
    sb = get_supabase()
    update_payload: dict = {"updated_by": staff["id"], "updated_at": "now()"}
    audit_payload: dict = {}

    if body.invite_only_mode is not None:
        update_payload["invite_only_mode"] = body.invite_only_mode
        audit_payload["invite_only_mode"] = body.invite_only_mode
    if body.maintenance_mode is not None:
        update_payload["maintenance_mode"] = body.maintenance_mode
        audit_payload["maintenance_mode"] = body.maintenance_mode

    sb.table("platform_settings").update(update_payload).eq("id", 1).execute()

    # Flush settings cache
    from services.stripe_service import invalidate_settings_cache
    invalidate_settings_cache()

    _audit(staff, "platform_setting_change", payload=audit_payload)

    return {"ok": True}

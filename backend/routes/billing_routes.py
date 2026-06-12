"""
Billing routes — /api/billing/*

All routes except /api/billing/webhook require subscriber authentication.
The webhook endpoint verifies via Stripe signature header only.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from services.auth_utils import verify_token, get_user_id, get_user_email
from services.db import get_supabase

router = APIRouter()


# ── Request models ────────────────────────────────────────────────────────────

class CheckoutSessionRequest(BaseModel):
    tier_key: str


class UpgradeRequest(BaseModel):
    tier_key: str


class DowngradeRequest(BaseModel):
    tier_key: str


class CancelRequest(BaseModel):
    confirmation: str


# ── Checkout session ──────────────────────────────────────────────────────────

@router.post("/billing/checkout-session")
async def create_checkout_session(
    body: CheckoutSessionRequest,
    payload: dict = Depends(verify_token),
):
    """Create a Stripe Checkout Session for the subscriber to start a paid plan."""
    user_id = get_user_id(payload)
    email = get_user_email(payload)

    from services.stripe_service import create_checkout_session as _create
    checkout_url = _create(user_id, email, body.tier_key)
    return {"checkout_url": checkout_url}


# ── Upgrade ───────────────────────────────────────────────────────────────────

@router.post("/billing/upgrade")
async def upgrade_subscription(
    body: UpgradeRequest,
    payload: dict = Depends(verify_token),
):
    """Immediately switch an active paid subscriber to a higher tier."""
    user_id = get_user_id(payload)

    from services.stripe_service import upgrade_subscription as _upgrade
    return _upgrade(user_id, body.tier_key)


# ── Downgrade ─────────────────────────────────────────────────────────────────

@router.post("/billing/downgrade")
async def downgrade_subscription(
    body: DowngradeRequest,
    payload: dict = Depends(verify_token),
):
    """Schedule a downgrade to take effect at current_period_end."""
    user_id = get_user_id(payload)

    from services.stripe_service import downgrade_subscription as _downgrade
    return _downgrade(user_id, body.tier_key)


# ── Cancel ────────────────────────────────────────────────────────────────────

@router.post("/billing/cancel")
async def cancel_subscription(
    body: CancelRequest,
    payload: dict = Depends(verify_token),
):
    """Schedule subscription cancellation at period end. Requires confirmation='CANCEL'."""
    if body.confirmation != "CANCEL":
        raise HTTPException(
            status_code=400,
            detail="Confirmation string must be exactly 'CANCEL'.",
        )
    user_id = get_user_id(payload)

    from services.stripe_service import cancel_subscription as _cancel
    return _cancel(user_id)


# ── Reactivate ────────────────────────────────────────────────────────────────

@router.post("/billing/reactivate")
async def reactivate_subscription(payload: dict = Depends(verify_token)):
    """Remove a scheduled cancellation."""
    user_id = get_user_id(payload)

    from services.stripe_service import reactivate_subscription as _reactivate
    return _reactivate(user_id)


# ── Invoices ──────────────────────────────────────────────────────────────────

@router.get("/billing/invoices")
async def list_invoices(payload: dict = Depends(verify_token)):
    """List the subscriber's invoices from the DB."""
    user_id = get_user_id(payload)
    sb = get_supabase()

    result = sb.table("invoices").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return {"invoices": result.data or []}


# ── Payment method ────────────────────────────────────────────────────────────

@router.get("/billing/payment-method")
async def get_payment_method(payload: dict = Depends(verify_token)):
    """
    Return summary of the subscriber's default payment method.
    Cached 300 s. Never returns 500 — falls back to null fields with stale=true.
    """
    user_id = get_user_id(payload)

    from services.stripe_service import get_payment_method as _get_pm
    return _get_pm(user_id)


# ── Customer Portal ───────────────────────────────────────────────────────────

@router.post("/billing/portal")
async def create_portal_session(payload: dict = Depends(verify_token)):
    """Create a Stripe Customer Portal session and return the URL."""
    user_id = get_user_id(payload)

    from services.stripe_service import create_portal_session as _create_portal
    portal_url = _create_portal(user_id)
    return {"portal_url": portal_url}


# ── Webhook ───────────────────────────────────────────────────────────────────

@router.post("/billing/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook endpoint. No auth — verified via Stripe-Signature header.
    Idempotent: duplicate events are detected via stripe_webhook_events table.
    """
    raw_body = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    from services.stripe_service import handle_webhook_event
    return handle_webhook_event(raw_body, sig_header)

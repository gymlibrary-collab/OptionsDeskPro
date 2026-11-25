"""
Entitlements service.

compute_entitlements(user_id) is the authoritative server-side function for
determining what a subscriber can access. It is called by:
  - GET /api/auth/entitlements
  - PUT /api/watchlist (max_symbols check)
  - GET /api/strategies/scan (max_scans_per_month check)
"""
import logging
from services.tier_limits import get_limits

logger = logging.getLogger(__name__)

# Statuses that degrade entitlements to free tier
_DEGRADED_STATUSES = {"past_due", "canceled", "incomplete"}


def compute_entitlements(user_id: str) -> dict:
    """
    Return the full entitlement dict for a subscriber.

    Effective tier resolution (in precedence order):
      1. admin_override_tier_key (if non-null)
      2. 'free' if subscription status is past_due / canceled / incomplete
      3. subscriptions.tier_key
    """
    from services.db import get_supabase
    sb = get_supabase()

    # Load subscription row
    sub_data: dict = {}
    try:
        result = sb.table("subscriptions").select("*").eq("user_id", user_id).maybe_single().execute()
        if result.data:
            sub_data = result.data
    except Exception as e:
        logger.warning("Could not load subscription for %s: %s", user_id, e)

    stripe_tier = sub_data.get("tier_key", "free")
    status = sub_data.get("status", "active")
    admin_override = sub_data.get("admin_override_tier_key")
    cancel_at_period_end = sub_data.get("cancel_at_period_end", False)
    pending_tier_key = sub_data.get("pending_tier_key")
    current_period_end = sub_data.get("current_period_end")

    # Resolve effective tier
    payment_failed = status in _DEGRADED_STATUSES
    if admin_override:
        effective_tier = admin_override
    elif payment_failed:
        effective_tier = "free"
    else:
        effective_tier = stripe_tier

    # Load plan limits
    plan = get_limits(effective_tier)

    return {
        "effective_tier":       effective_tier,
        "display_name":         plan.get("display_name", effective_tier.capitalize()),
        "price_monthly_usd":    plan.get("price_monthly_usd", 0.0),
        "subscription_status":  status,
        "stripe_tier":          stripe_tier,
        "admin_override_tier":  admin_override,
        "max_symbols":          plan.get("max_symbols"),
        "max_scans_per_month":  plan.get("max_scans_per_month"),
        "features":             plan.get("features", {}),
        "current_period_end":   current_period_end,
        "cancel_at_period_end": cancel_at_period_end,
        "pending_tier_key":     pending_tier_key,
        "payment_failed":       payment_failed,
    }


# ── Feature gate (FastAPI dependency factory) ────────────────────────────────

def require_feature(feature_key: str, required_plan: str = "Enterprise"):
    """
    Build a FastAPI dependency that rejects with HTTP 403 (+ ``X-Error-Code:
    feature_locked``) unless ``compute_entitlements(user).features[feature_key]``
    is truthy.

    It uses exactly the same entitlement computation as GET /api/auth/entitlements
    (admin_override_tier_key > payment degradation > subscription tier), so any
    override mechanism behaves as it does for every other feature. No separate
    admin/staff bypass exists in compute_entitlements and none is added here.

    Returns the verified token payload so a route may depend on it directly.
    """
    import asyncio
    from fastapi import Depends, HTTPException
    from services.auth_utils import verify_token, get_user_id

    async def _dep(payload: dict = Depends(verify_token)) -> dict:
        user_id = get_user_id(payload)
        ent = await asyncio.to_thread(compute_entitlements, user_id)
        if not (ent.get("features") or {}).get(feature_key, False):
            raise HTTPException(
                status_code=403,
                detail=f"This feature is available on the {required_plan} plan.",
                headers={"X-Error-Code": "feature_locked"},
            )
        return payload

    return _dep

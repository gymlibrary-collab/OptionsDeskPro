"""
Tier limits service (ADR-0003).

Reads from the `plans` DB table with a 60-second in-process cache.
Falls back to TIER_LIMITS hardcoded dict if the DB is unavailable.

Never call get_supabase() at module level — always inside a function.
"""
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Hardcoded fallback (kept in sync with the migration seed values) ─────────
TIER_LIMITS: dict[str, dict] = {
    'free': {
        'max_symbols': 5, 'max_scans_per_month': 10,
        'features': {
            'trading_desk': False, 'positions': False, 'risk_monitor': False,
            'ai_narrative': False, 'ai_chat': False, 'ai_risk_summary': False,
            'ai_strategy_reasoning': False, 'ai_earnings_awareness': False,
        },
    },
    'starter': {
        'max_symbols': 15, 'max_scans_per_month': 100,
        'features': {
            'trading_desk': False, 'positions': True, 'risk_monitor': False,
            'ai_narrative': False, 'ai_chat': False, 'ai_risk_summary': False,
            'ai_strategy_reasoning': False, 'ai_earnings_awareness': False,
        },
    },
    'pro': {
        'max_symbols': 50, 'max_scans_per_month': None,
        'features': {
            'trading_desk': True, 'positions': True, 'risk_monitor': False,
            'ai_narrative': True, 'ai_chat': True, 'ai_risk_summary': True,
            'ai_strategy_reasoning': True, 'ai_earnings_awareness': True,
        },
    },
    'enterprise': {
        'max_symbols': None, 'max_scans_per_month': None,
        'features': {
            'trading_desk': True, 'positions': True, 'risk_monitor': True,
            'ai_narrative': True, 'ai_chat': True, 'ai_risk_summary': True,
            'ai_strategy_reasoning': True, 'ai_earnings_awareness': True,
        },
    },
}

# ── In-process plans cache ────────────────────────────────────────────────────
_plans_cache: dict[str, dict] = {}
_plans_cache_ts: float = 0.0
_PLANS_TTL: float = 60.0  # seconds (ADR-0003)


def _load_plans() -> None:
    """
    Populate _plans_cache from the DB if the cache has expired.
    No-op if the cache is still fresh. Swallows all DB errors (falls back to
    hardcoded TIER_LIMITS via the lookup path).
    """
    global _plans_cache, _plans_cache_ts
    now = time.time()
    if now - _plans_cache_ts < _PLANS_TTL and _plans_cache:
        return  # cache is fresh
    try:
        from services.db import get_supabase
        result = get_supabase().table("plans").select("*").execute()
        if result.data:
            new_cache: dict[str, dict] = {}
            for row in result.data:
                tier_key = row.get("tier_key")
                if not tier_key:
                    continue
                features = row.get("features_json") or {}
                new_cache[tier_key] = {
                    "max_symbols":         row.get("max_symbols"),
                    "max_scans_per_month": row.get("max_scans_per_month"),
                    "features":            features,
                    "display_name":        row.get("display_name", tier_key),
                    "price_monthly_usd":   float(row.get("price_monthly_usd") or 0),
                    "stripe_price_id":     row.get("stripe_price_id"),
                    "stripe_product_id":   row.get("stripe_product_id"),
                    "is_active":           row.get("is_active", True),
                    "sort_order":          row.get("sort_order", 0),
                }
            _plans_cache = new_cache
            _plans_cache_ts = now
            logger.debug("Plans cache refreshed from DB (%d tiers)", len(new_cache))
    except Exception as e:
        logger.warning("Could not load plans from DB (using hardcoded fallback): %s", e)
        # Do NOT update _plans_cache_ts — retry on next call


def invalidate_plans_cache() -> None:
    """Force a reload on the next call to get_limits(). Called after pricing changes."""
    global _plans_cache_ts
    _plans_cache_ts = 0.0


def get_limits(tier: str) -> dict:
    """
    Return the entitlement limits for the given tier.
    Tries DB-backed cache first; falls back to TIER_LIMITS constant.
    """
    _load_plans()
    row = _plans_cache.get(tier) or TIER_LIMITS.get(tier) or TIER_LIMITS["free"]
    return row


def get_all_plans() -> list[dict]:
    """Return all plans from cache (or hardcoded fallback) as a list."""
    _load_plans()
    if _plans_cache:
        return sorted(_plans_cache.values(), key=lambda p: p.get("sort_order", 0))
    # fallback: synthesise from hardcoded dict
    return [
        {**v, "tier_key": k, "display_name": k.capitalize(),
         "price_monthly_usd": 0.0, "stripe_price_id": None,
         "stripe_product_id": None, "is_active": True, "sort_order": i}
        for i, (k, v) in enumerate(TIER_LIMITS.items())
    ]


def get_user_tier(db, user_id: str) -> str:
    """
    Look up a subscriber's effective tier from their subscriptions row.
    Falls back to 'free' on any error.

    NOTE: callers requiring the full entitlement dict (including admin overrides
    and payment-status degradation) should use entitlements.compute_entitlements()
    instead of this function.
    """
    try:
        result = db.table("subscriptions").select("tier_key, status, admin_override_tier_key").eq("user_id", user_id).maybe_single().execute()
        if result.data:
            # Degrade to free if payment failed
            status = result.data.get("status", "active")
            if status in ("past_due", "canceled", "incomplete"):
                return "free"
            # Admin override takes precedence
            override = result.data.get("admin_override_tier_key")
            if override:
                return override
            return result.data.get("tier_key", "free")
        # Fall back to user_profiles.subscription_tier (legacy path)
        result2 = db.table("user_profiles").select("subscription_tier").eq("id", user_id).maybe_single().execute()
        if result2.data:
            return result2.data.get("subscription_tier", "free")
    except Exception:
        pass
    return "free"

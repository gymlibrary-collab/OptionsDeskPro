"""
Public routes — /api/public/*

No authentication required. Serve pricing page and FAQ data.
"""
import time
import logging
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger(__name__)

# ── FAQ cache (30 s TTL) ──────────────────────────────────────────────────────
_faq_cache: dict = {}
_faq_cache_ts: float = 0.0
_FAQ_TTL = 30.0


def _load_faq() -> dict:
    """Load published FAQ from DB with 30 s cache. Falls back to empty on error."""
    global _faq_cache, _faq_cache_ts
    now = time.time()
    if _faq_cache and (now - _faq_cache_ts) < _FAQ_TTL:
        return _faq_cache

    try:
        from services.db import get_supabase
        sb = get_supabase()

        cats = sb.table("faq_categories").select("id, title, sort_order").order("sort_order").execute().data or []
        articles = sb.table("faq_articles").select(
            "id, category_id, question, answer_markdown, sort_order"
        ).eq("is_published", True).order("sort_order").execute().data or []

        cat_map: dict[str, dict] = {}
        for cat in cats:
            cat_map[cat["id"]] = {
                "id": cat["id"],
                "title": cat["title"],
                "sort_order": cat["sort_order"],
                "articles": [],
            }

        uncategorised: list = []
        for art in articles:
            entry = {
                "id": art["id"],
                "question": art["question"],
                "answer_markdown": art["answer_markdown"],
                "sort_order": art["sort_order"],
            }
            cat_id = art.get("category_id")
            if cat_id and cat_id in cat_map:
                cat_map[cat_id]["articles"].append(entry)
            else:
                uncategorised.append(entry)

        categories = sorted(cat_map.values(), key=lambda c: c["sort_order"])
        if uncategorised:
            categories.append({
                "id": None,
                "title": "General",
                "sort_order": 9999,
                "articles": uncategorised,
            })

        result = {"categories": categories}
        _faq_cache = result
        _faq_cache_ts = now
        return result
    except Exception as e:
        logger.warning("Could not load FAQ from DB: %s", e)
        return {"categories": [], "stale": True}


def invalidate_faq_cache() -> None:
    """Force a reload on the next public FAQ request (called after admin publish/delete)."""
    global _faq_cache_ts
    _faq_cache_ts = 0.0


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/public/pricing")
async def get_public_pricing():
    """
    Returns the plans catalog for the public pricing page.
    Uses the same 60 s in-process plans cache as tier_limits.py.
    Enterprise tier includes contact_us=true; no Stripe checkout CTA.
    """
    from services.tier_limits import get_all_plans, _load_plans
    _load_plans()

    from services.db import get_supabase
    sb = get_supabase()

    plans_list: list[dict] = []
    try:
        result = sb.table("plans").select(
            "tier_key, display_name, price_monthly_usd, max_symbols, max_scans_per_month, features_json, sort_order, is_active"
        ).eq("is_active", True).order("sort_order").execute()
        for row in (result.data or []):
            plan_entry = {
                "tier_key":            row["tier_key"],
                "display_name":        row["display_name"],
                "price_monthly_usd":   float(row["price_monthly_usd"]),
                "max_symbols":         row.get("max_symbols"),
                "max_scans_per_month": row.get("max_scans_per_month"),
                "features":            row.get("features_json") or {},
            }
            if row["tier_key"] == "enterprise":
                plan_entry["contact_us"] = True
            plans_list.append(plan_entry)
    except Exception as e:
        logger.warning("Could not load plans from DB for pricing page: %s", e)
        # Fall back to hardcoded
        from services.tier_limits import TIER_LIMITS
        for i, (tier_key, limits) in enumerate(TIER_LIMITS.items()):
            plan_entry = {
                "tier_key":            tier_key,
                "display_name":        tier_key.capitalize(),
                "price_monthly_usd":   0.0,
                "max_symbols":         limits["max_symbols"],
                "max_scans_per_month": limits["max_scans_per_month"],
                "features":            limits.get("features", {}),
            }
            if tier_key == "enterprise":
                plan_entry["contact_us"] = True
            plans_list.append(plan_entry)

    return {"plans": plans_list}


@router.get("/public/faq")
async def get_public_faq():
    """Returns published FAQ entries grouped by category."""
    return _load_faq()

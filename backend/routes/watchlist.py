from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth_utils import verify_token
from services.db import get_supabase
from services.tier_limits import get_user_tier, get_limits

router = APIRouter()


class WatchlistSaveRequest(BaseModel):
    symbols: list[str]


@router.get("/watchlist")
async def get_watchlist(payload: dict = Depends(verify_token)):
    user_id = payload["sub"]
    db = get_supabase()

    tier = get_user_tier(db, user_id)
    limits = get_limits(tier)

    symbols_result = (
        db.table("user_watchlists")
        .select("symbol, position")
        .eq("user_id", user_id)
        .order("position")
        .execute()
    )
    symbols = [r["symbol"] for r in (symbols_result.data or [])]

    month = datetime.utcnow().strftime("%Y-%m")
    usage_result = (
        db.table("scan_usage")
        .select("scans_used")
        .eq("user_id", user_id)
        .eq("month", month)
        .execute()
    )
    scans_used = usage_result.data[0]["scans_used"] if usage_result.data else 0

    return {
        "symbols": symbols,
        "tier": tier,
        "max_symbols": limits["max_symbols"],
        "scans_used": scans_used,
        "max_scans_per_month": limits["max_scans_per_month"],
    }


@router.put("/watchlist")
async def save_watchlist(body: WatchlistSaveRequest, payload: dict = Depends(verify_token)):
    user_id = payload["sub"]
    symbols = [s.strip().upper() for s in body.symbols if s.strip()]
    db = get_supabase()

    tier = get_user_tier(db, user_id)
    limits = get_limits(tier)
    max_syms = limits["max_symbols"]

    if max_syms is not None and len(symbols) > max_syms:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "watchlist_limit_exceeded",
                "limit": max_syms,
                "tier": tier,
                "message": f"Your {tier} plan supports up to {max_syms} symbols.",
            },
        )

    db.table("user_watchlists").delete().eq("user_id", user_id).execute()
    if symbols:
        rows = [{"user_id": user_id, "symbol": s, "position": i} for i, s in enumerate(symbols)]
        db.table("user_watchlists").insert(rows).execute()

    return {"saved": len(symbols), "tier": tier}

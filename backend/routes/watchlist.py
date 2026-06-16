from datetime import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth_utils import verify_token
from services.db import get_supabase
from services.legal_service import legal_gate_dep
from services.entitlements import compute_entitlements

router = APIRouter(dependencies=[Depends(legal_gate_dep)])
logger = logging.getLogger(__name__)


class WatchlistSaveRequest(BaseModel):
    symbols: list[str]


def _read_symbols(db, user_id: str) -> list[str]:
    """Read watchlist symbols — handles both schemas:
    - New: one row per user with symbols text[] column
    - Legacy: one row per symbol with symbol text column
    """
    # Try new schema first (symbols array, one row per user)
    try:
        result = (
            db.table("user_watchlists")
            .select("symbols")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if result and result.data is not None:
            return result.data.get("symbols") or []
    except Exception as e:
        logger.debug("New watchlist schema read failed, trying legacy: %s", e)

    # Try legacy schema (symbol text, one row per symbol)
    try:
        result = (
            db.table("user_watchlists")
            .select("symbol")
            .eq("user_id", user_id)
            .execute()
        )
        return [r["symbol"] for r in (result.data or [])]
    except Exception as e:
        logger.error("watchlist read failed for %s: %s", user_id, e)
        return []


def _write_symbols(db, user_id: str, symbols: list[str]) -> str | None:
    """Write watchlist symbols — tries new schema first, then legacy."""
    # Try new schema (symbols array upsert)
    try:
        db.table("user_watchlists").upsert(
            {"user_id": user_id, "symbols": symbols},
            on_conflict="user_id",
        ).execute()
        return None
    except Exception as e:
        logger.debug("New watchlist schema write failed, trying legacy: %s", e)

    # Try legacy schema (delete + insert one row per symbol with position)
    try:
        db.table("user_watchlists").delete().eq("user_id", user_id).execute()
        if symbols:
            rows = [{"user_id": user_id, "symbol": s, "position": i} for i, s in enumerate(symbols)]
            db.table("user_watchlists").insert(rows).execute()
        return None
    except Exception as e:
        logger.error("watchlist write failed for %s: %s", user_id, e)
        return str(e)


@router.get("/watchlist")
async def get_watchlist(payload: dict = Depends(verify_token)):
    user_id = payload["sub"]
    db = get_supabase()

    entitlements = compute_entitlements(user_id)
    tier = entitlements["effective_tier"]

    symbols = _read_symbols(db, user_id)

    month = datetime.utcnow().strftime("%Y-%m")
    try:
        usage_result = (
            db.table("scan_usage")
            .select("scans_used")
            .eq("user_id", user_id)
            .eq("month", month)
            .execute()
        )
        scans_used = usage_result.data[0]["scans_used"] if (usage_result and usage_result.data) else 0
    except Exception:
        scans_used = 0

    max_symbols = entitlements["max_symbols"]
    over_limit = max_symbols is not None and len(symbols) > max_symbols

    return {
        "symbols": symbols,
        "tier": tier,
        "max_symbols": max_symbols,
        "scans_used": scans_used,
        "max_scans_per_month": entitlements["max_scans_per_month"],
        "over_limit": over_limit,
    }


@router.put("/watchlist")
async def save_watchlist(body: WatchlistSaveRequest, payload: dict = Depends(verify_token)):
    user_id = payload["sub"]
    symbols = [s.strip().upper() for s in body.symbols if s.strip()]
    db = get_supabase()

    entitlements = compute_entitlements(user_id)
    tier = entitlements["effective_tier"]
    max_syms = entitlements["max_symbols"]

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

    err = _write_symbols(db, user_id, symbols)
    if err:
        logger.error("watchlist save error for %s: %s", user_id, err)

    return {"saved": len(symbols), "tier": tier}

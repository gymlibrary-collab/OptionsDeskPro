"""
Auto-settlement engine for expired options positions.

Triggered lazily by GET /api/positions, GET /api/portfolio, and
GET /api/positions/risk.  For each position whose expiry < today the engine:
  1. Atomically claims the row via DELETE WHERE id = ? (idempotency guarantee).
  2. Computes a settlement price via a three-tier yfinance fallback chain.
  3. Adjusts portfolio cash (longs receive proceeds; shorts pay to close).
  4. Inserts an orders row with status='auto_settled'.
  5. Logs to user_action_log.

INVARIANTS (from CLAUDE.md):
  - get_supabase() is NEVER called at module level.
  - yfinance numeric values are always read through _safe_float(); never cast
    directly to float().
  - yfinance calls run inside a daemon Thread with a 5-second join timeout,
    consistent with market_data._yfinance_chain().
"""
import logging
import math
import threading
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import yfinance as yf

logger = logging.getLogger(__name__)


# ── Safe numeric helpers (mirrors market_data._safe_float) ──────────────────

def _safe_float(val, default: float = 0.0) -> float:
    """Convert val to float, returning default for NaN/Inf/None/TypeError."""
    try:
        if val is None:
            return default
        f = float(val)
        return default if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return default


# ── Historical close lookup ──────────────────────────────────────────────────

def _get_historical_close(symbol: str, expiry_date: date) -> Optional[float]:
    """
    Fetch the underlying's official closing price on or before expiry_date using
    yfinance daily OHLCV history.

    Uses a ±3-day window (start = expiry - 3 days, end = expiry + 2 days) so
    that weekend/holiday expiry dates are handled: if expiry_date itself has no
    bar (half-day/holiday), the function returns the last trading close ON OR
    BEFORE expiry_date (e.g. Friday's close for a Saturday expiry).

    Returns None if yfinance returns no data or the request times out.
    Gate 2 Amendment 2: this is the OFFICIAL close on the expiry date for
    intrinsic-value settlement — NOT the current live spot price.
    """
    result: list = [None]

    def _run():
        try:
            ticker = yf.Ticker(symbol)
            start = (expiry_date - timedelta(days=3)).isoformat()
            end = (expiry_date + timedelta(days=2)).isoformat()
            hist = ticker.history(start=start, end=end)
            if hist is None or hist.empty:
                return
            # Filter to rows whose date is on or before expiry_date.
            # hist.index is a DatetimeIndex; .date returns an ndarray of
            # datetime.date objects suitable for direct comparison.
            candidates = hist[hist.index.date <= expiry_date]
            if candidates.empty:
                return
            close_val = _safe_float(candidates.iloc[-1]["Close"])
            if close_val > 0:
                result[0] = close_val
        except Exception as exc:
            logger.debug("_get_historical_close(%s, %s): %s", symbol, expiry_date, exc)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=5)
    return result[0]


# ── Settlement price fallback chain ─────────────────────────────────────────

def _get_settlement_price(pos: dict) -> tuple[float, str]:
    """
    Compute settlement price for an expired position via a three-tier chain.

    Tier 1 — yfinance expired contract: reconstruct the OCC symbol and fetch the
              last historical close for the option contract itself.  Rarely
              succeeds; yfinance drops expired contracts within hours of expiry.

    Tier 2 — Intrinsic value from underlying historical close on expiry date:
              max(spot - strike, 0) for calls; max(strike - spot, 0) for puts.
              If the option expired OTM, intrinsic = 0 → source = 'worthless'.

    Tier 3 — Worthless: $0.00 with source = 'worthless'.

    Returns (price: float, source: str).
    source is one of: 'market', 'intrinsic', 'worthless'.
    """
    symbol = pos["symbol"]
    expiry_str = pos["expiry"]  # "YYYY-MM-DD"
    strike = _safe_float(pos.get("strike"), default=0.0)
    option_type = (pos.get("option_type") or "call").lower()

    try:
        expiry_date = date.fromisoformat(str(expiry_str))
    except (ValueError, TypeError):
        logger.warning("_get_settlement_price: cannot parse expiry '%s'", expiry_str)
        return 0.0, "worthless"

    # ── Tier 1: last-traded price of the expired option contract ─────────────
    try:
        yy = expiry_date.strftime("%y")
        mm = expiry_date.strftime("%m")
        dd = expiry_date.strftime("%d")
        cp = "C" if option_type == "call" else "P"
        occ_symbol = f"{symbol}{yy}{mm}{dd}{cp}{int(strike * 1000):08d}"

        tier1_result: list = [None]

        def _fetch_contract():
            try:
                t = yf.Ticker(occ_symbol)
                hist = t.history(period="5d")
                if hist is not None and not hist.empty:
                    val = _safe_float(hist.iloc[-1]["Close"])
                    if val > 0:
                        tier1_result[0] = val
            except Exception as exc:
                logger.debug("Tier 1 settlement(%s): %s", occ_symbol, exc)

        t1 = threading.Thread(target=_fetch_contract, daemon=True)
        t1.start()
        t1.join(timeout=5)

        if tier1_result[0] is not None and tier1_result[0] > 0:
            logger.info(
                "Settlement %s/%s strike=%.2f: Tier 1 market price %.4f",
                symbol, expiry_str, strike, tier1_result[0],
            )
            return tier1_result[0], "market"
    except Exception as exc:
        logger.debug("Tier 1 outer exception (%s): %s", symbol, exc)

    # ── Tier 2: intrinsic value from underlying historical close ──────────────
    underlying_close = _get_historical_close(symbol, expiry_date)
    if underlying_close is not None and underlying_close > 0:
        if option_type == "call":
            intrinsic = max(underlying_close - strike, 0.0)
        else:
            intrinsic = max(strike - underlying_close, 0.0)

        source = "intrinsic" if intrinsic > 0 else "worthless"
        logger.info(
            "Settlement %s/%s strike=%.2f %s: underlying_close=%.2f intrinsic=%.4f source=%s",
            symbol, expiry_str, strike, option_type, underlying_close, intrinsic, source,
        )
        return round(intrinsic, 4), source

    # ── Tier 3: worthless fallback ────────────────────────────────────────────
    logger.info(
        "Settlement %s/%s strike=%.2f: Tier 3 worthless (no underlying data)",
        symbol, expiry_str, strike,
    )
    return 0.0, "worthless"


# ── Auto-settle pass ─────────────────────────────────────────────────────────

# Bound on positions settled in a single request.  Keeps worst-case added
# latency ~1-2 min even if every yfinance call times out; any remainder is
# picked up by the next read of positions/portfolio/risk (security review M01).
_MAX_SETTLE_PER_REQUEST = 10


async def auto_settle_expired(user_id: str, user_email: str = "") -> None:
    """
    Idempotently settle expired positions for user_id (capped per request).

    Runs the whole pass in a worker thread via asyncio.to_thread — the
    settlement price lookups block on yfinance (up to 5 s per tier) and the
    Supabase client is synchronous, so running inline would stall the event
    loop for every other user (security review M01).

    Concurrency safety: positions are claimed via atomic DELETE WHERE id = ?.
    If two concurrent requests race on the same position row, exactly one
    DELETE will return data; the other finds an empty result and skips all
    subsequent steps.  No explicit DB transaction is required.

    Called at the start of GET /api/positions, GET /api/portfolio, and
    GET /api/positions/risk before any existing logic runs.
    """
    import asyncio

    await asyncio.to_thread(_settle_expired_sync, user_id, user_email)


def _settle_expired_sync(user_id: str, user_email: str = "") -> None:
    from services.db import get_supabase  # never at module level (CLAUDE.md)

    sb = get_supabase()
    today_iso = date.today().isoformat()

    # ── 1. Find all expired positions ─────────────────────────────────────────
    try:
        query_result = (
            sb.table("positions")
            .select("*")
            .eq("user_id", user_id)
            .lt("expiry", today_iso)
            .execute()
        )
        expired_positions = query_result.data or []
    except Exception as exc:
        logger.error("auto_settle_expired: positions query failed for %s: %s", user_id, exc)
        return

    if not expired_positions:
        return

    if len(expired_positions) > _MAX_SETTLE_PER_REQUEST:
        logger.info(
            "auto_settle_expired: %d expired position(s) for user %s — settling "
            "first %d this request",
            len(expired_positions), user_id, _MAX_SETTLE_PER_REQUEST,
        )
        expired_positions = expired_positions[:_MAX_SETTLE_PER_REQUEST]
    else:
        logger.info(
            "auto_settle_expired: found %d expired position(s) for user %s",
            len(expired_positions), user_id,
        )

    for pos in expired_positions:
        pos_id = pos.get("id")
        if not pos_id:
            continue

        # ── 2. Atomic claim ───────────────────────────────────────────────────
        try:
            del_result = (
                sb.table("positions")
                .delete()
                .eq("id", pos_id)
                .eq("user_id", user_id)
                .execute()
            )
            if not del_result.data:
                # Another concurrent request already settled this row.
                logger.debug(
                    "auto_settle_expired: position %s already claimed — skipping", pos_id
                )
                continue
        except Exception as exc:
            logger.error(
                "auto_settle_expired: DELETE failed for position %s: %s", pos_id, exc
            )
            continue

        # ── 3. Compute settlement price ───────────────────────────────────────
        try:
            settlement_price, source = _get_settlement_price(pos)
        except Exception as exc:
            logger.error(
                "auto_settle_expired: _get_settlement_price failed for %s: %s", pos_id, exc
            )
            settlement_price, source = 0.0, "worthless"

        quantity = int(_safe_float(pos.get("quantity"), default=0))
        avg_cost = _safe_float(pos.get("avg_cost"), default=0.0)
        entry_action = pos.get("entry_action") or ("buy" if quantity > 0 else "sell")

        # ── 4. Cash adjustment ────────────────────────────────────────────────
        # Long (qty > 0): receive settlement proceeds.
        # Short (qty < 0): pay settlement value to close (buy-to-close model).
        # A short expiring worthless (settlement_price=0) has zero cash impact —
        # the collected premium is already in cash from the original sale.
        cash_delta = settlement_price * abs(quantity) * 100
        try:
            cash_row = (
                sb.table("portfolios")
                .select("cash")
                .eq("user_id", user_id)
                .single()
                .execute()
            )
            current_cash = _safe_float(cash_row.data["cash"], default=0.0)
            new_cash = current_cash + cash_delta if quantity > 0 else current_cash - cash_delta
            sb.table("portfolios").update({
                "cash": round(new_cash, 4),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("user_id", user_id).execute()
        except Exception as exc:
            logger.error(
                "auto_settle_expired: cash update failed for position %s: %s", pos_id, exc
            )
            # Proceed — order and log still written even if cash update fails.

        # ── 5. Realised P&L ───────────────────────────────────────────────────
        # Formula: (settlement_price - avg_cost) × signed_quantity × 100
        # For a short (qty < 0): e.g. sold at 3.50, expires worthless →
        #   (0 - 3.50) × -1 × 100 = +350.  Correct.
        realised_pnl = round((settlement_price - avg_cost) * quantity * 100, 2)

        # ── 6. Insert auto_settled order ──────────────────────────────────────
        close_action = "sell" if quantity > 0 else "buy"
        settlement_metadata = {
            "source": source,
            "entry_avg_cost": avg_cost,
            "entry_action": entry_action,
            "entry_quantity": quantity,
            "realised_pnl": realised_pnl,
        }
        try:
            sb.table("orders").insert({
                "user_id": user_id,
                "symbol": pos["symbol"],
                "expiry": pos["expiry"],
                "strike": pos["strike"],
                "option_type": pos["option_type"],
                "action": close_action,
                "quantity": abs(quantity),
                "price": settlement_price,
                "status": "auto_settled",
                "strategy_key": pos.get("strategy_key"),
                "strategy_name": pos.get("strategy_name"),
                "profit_target_pct": pos.get("profit_target_pct"),
                "leg_role": "auto_settled",
                "settlement_metadata": settlement_metadata,
            }).execute()
        except Exception as exc:
            logger.error(
                "auto_settle_expired: order insert failed for position %s: %s", pos_id, exc
            )

        # ── 7. Activity log ───────────────────────────────────────────────────
        if user_email:
            try:
                sb.table("user_action_log").insert({
                    "user_id": user_id,
                    "user_email": user_email,
                    "action_type": "position_auto_settled",
                    "detail": {
                        "symbol": pos["symbol"],
                        "expiry": pos["expiry"],
                        "strike": float(pos.get("strike") or 0),
                        "option_type": pos["option_type"],
                        "settlement_price": settlement_price,
                        "source": source,
                        "realised_pnl": realised_pnl,
                    },
                }).execute()
            except Exception as exc:
                logger.debug("auto_settle_expired: user_action_log insert failed: %s", exc)

        logger.info(
            "auto_settle_expired: settled %s %s K=%.2f %s → price=%.4f source=%s pnl=%.2f",
            pos["symbol"], pos["expiry"], float(pos.get("strike") or 0),
            pos["option_type"], settlement_price, source, realised_pnl,
        )

import asyncio
import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from services.auth_utils import verify_token, get_user_id, get_user_email
from services.db import get_supabase
from services.legal_service import legal_gate_dep
from services import user_portfolio
from services import settlement
from services.iv_analysis import get_iv_rank, get_directional_bias
from services.strategy_engine import STRATEGIES

router = APIRouter(dependencies=[Depends(legal_gate_dep)])


@router.get("/positions")
async def list_positions(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    user_email = get_user_email(payload)
    await settlement.auto_settle_expired(user_id, user_email)
    return await user_portfolio.get_positions(user_id)


@router.get("/portfolio")
async def get_portfolio(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    user_email = get_user_email(payload)
    await settlement.auto_settle_expired(user_id, user_email)
    return await user_portfolio.get_summary(user_id)


@router.post("/positions/snapshot")
async def take_snapshot(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    await user_portfolio.take_pnl_snapshot(user_id)
    return {"ok": True}


class AvgCostUpdateRequest(BaseModel):
    symbol: str
    expiry: str
    strike: float
    option_type: str
    avg_cost: float


@router.patch("/positions/avg-cost")
async def update_avg_cost(req: AvgCostUpdateRequest, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    if req.avg_cost < 0:
        raise HTTPException(status_code=422, detail="avg_cost must be non-negative")
    sb = get_supabase()
    pos_result = (
        sb.table("positions")
        .update({"avg_cost": req.avg_cost})
        .eq("user_id", user_id)
        .eq("symbol", req.symbol)
        .eq("expiry", req.expiry)
        .eq("strike", req.strike)
        .eq("option_type", req.option_type)
        .execute()
    )
    if not pos_result.data:
        raise HTTPException(status_code=404, detail="Position not found")
    # Update all matching entry buy orders to the new price
    sb.table("orders").update({"price": req.avg_cost}).eq("user_id", user_id).eq(
        "symbol", req.symbol
    ).eq("expiry", req.expiry).eq("strike", req.strike).eq(
        "option_type", req.option_type
    ).eq(
        "action", "buy"
    ).execute()
    return {"ok": True}


def _fetch_market_data(symbol: str):
    try:
        iv = get_iv_rank(symbol)
    except Exception:
        iv = None
    try:
        bias = get_directional_bias(symbol)
    except Exception:
        bias = None
    return symbol, iv, bias


def _assess_risk(pos, iv_data, bias_data) -> dict:
    expiry_date = date.fromisoformat(pos.expiry)
    dte = max((expiry_date - date.today()).days, 0)

    if pos.avg_cost > 0:
        is_long = (pos.entry_action or "buy").lower() == "buy"
        if is_long:
            pnl_pct = (pos.current_price - pos.avg_cost) / pos.avg_cost * 100
        else:
            pnl_pct = (pos.avg_cost - pos.current_price) / pos.avg_cost * 100
    else:
        pnl_pct = 0.0

    profit_target_pct = pos.profit_target_pct or 50.0

    signals = []
    risk_level = "green"

    def escalate(lvl):
        nonlocal risk_level
        rank = {"green": 0, "yellow": 1, "red": 2}
        if rank.get(lvl, 0) > rank.get(risk_level, 0):
            risk_level = lvl

    # ── Time decay ────────────────────────────────────────────────────────────────────
    if dte == 0:
        signals.append({"level": "red", "type": "dte",
                         "msg": "This contract expires TODAY. Do not let it expire — close it immediately to get whatever value remains."})
        escalate("red")
    elif dte <= 3:
        if pnl_pct < 0:
            signals.append({"level": "red", "type": "dte",
                             "msg": f"Only {dte} day(s) left and you're down {abs(pnl_pct):.0f}%. With so little time, the premium has almost no chance to recover. Close now to stop the bleeding."})
            escalate("red")
        else:
            signals.append({"level": "yellow", "type": "dte",
                             "msg": f"Only {dte} day(s) to expiry. You're in profit — lock in those gains now before time decay and overnight risk erode them."})
            escalate("yellow")
    elif dte <= 7:
        signals.append({"level": "yellow", "type": "dte",
                         "msg": f"{dte} days to expiry. Time decay (theta) is eating into your premium quickly. If you haven't hit your target yet, decide whether to hold or take what you have."})
        escalate("yellow")
    elif dte <= 21:
        signals.append({"level": "yellow", "type": "dte",
                         "msg": f"{dte} days to expiry. You've entered the danger zone. As a good practice, it is recommended to close at 21 DTE because theta accelerates and the risk/reward worsens from here."})
        escalate("yellow")

    # ── P&L thresholds ──────────────────────────────────────────────────────────────────
    loss_limit = profit_target_pct
    if pnl_pct <= -(loss_limit * 2):
        signals.append({"level": "red", "type": "pnl",
                         "msg": f"You're down {abs(pnl_pct):.0f}% — more than twice the recommended stop of {loss_limit:.0f}%. Exit immediately. Do not wait for a recovery that may not come."})
        escalate("red")
    elif pnl_pct <= -loss_limit:
        signals.append({"level": "red", "type": "pnl",
                         "msg": f"You've hit your stop-loss at -{loss_limit:.0f}% (currently down {abs(pnl_pct):.0f}%). The rule is to exit here without hesitation — take the loss and protect your account."})
        escalate("red")
    elif pnl_pct <= -(loss_limit * 0.5):
        signals.append({"level": "yellow", "type": "pnl",
                         "msg": f"You're down {abs(pnl_pct):.0f}%, getting close to the {loss_limit:.0f}% stop. Watch this carefully — if it moves further against you, don't hesitate to close."})
        escalate("yellow")
    elif pnl_pct >= profit_target_pct:
        signals.append({"level": "green", "type": "pnl",
                         "msg": f"Profit target hit! You're up {pnl_pct:.0f}% vs your {profit_target_pct:.0f}% goal. Close this trade and bank the profit — don't let a winner turn into a loser."})
    elif pnl_pct >= profit_target_pct * 0.75:
        signals.append({"level": "green", "type": "pnl",
                         "msg": f"Almost there — you're at {pnl_pct:.0f}% of your {profit_target_pct:.0f}% target. Stay alert and be ready to close when it hits."})

    # ── IV regime ─────────────────────────────────────────────────────────────────────────
    iv_rank_val = None
    iv_env_val = None
    if iv_data and not iv_data.get("error"):
        iv_rank_val = iv_data.get("iv_rank")
        iv_env_val = iv_data.get("iv_environment", "").upper()

        strat = STRATEGIES.get(pos.strategy_key or "")
        if strat:
            expected_iv_envs = [e.upper() for e in strat.get("iv_environment", [])]
            if iv_env_val and iv_env_val not in expected_iv_envs:
                signals.append({"level": "yellow", "type": "iv",
                                 "msg": f"Market volatility has shifted to {iv_env_val}. Your {pos.strategy_name or pos.strategy_key} was built for {'/'.join(expected_iv_envs)} conditions — the original edge may be gone. Consider whether this trade still makes sense."})
                escalate("yellow")

        is_long = (pos.entry_action or "buy").lower() == "buy"
        if iv_rank_val is not None:
            if iv_rank_val > 75 and is_long:
                signals.append({"level": "yellow", "type": "iv",
                                 "msg": f"IV Rank is {iv_rank_val:.0f} — volatility is elevated, which inflates premium prices. As a buyer, you're paying a high price. High IV tends to contract, which can hurt long positions even if the stock moves your way."})
                escalate("yellow")
            elif iv_rank_val < 20 and not is_long:
                signals.append({"level": "yellow", "type": "iv",
                                 "msg": f"IV Rank is {iv_rank_val:.0f} — volatility is very low, which means little premium to collect. Short option strategies work best when IV is high. The edge on this trade is reduced."})
                escalate("yellow")

    # ── Directional bias ─────────────────────────────────────────────────────────────────
    bias_val = None
    if bias_data and not bias_data.get("error"):
        bias_val = bias_data.get("bias", "").upper()
        strat = STRATEGIES.get(pos.strategy_key or "")
        if strat and bias_val:
            strategy_dirs = [d.upper() for d in strat.get("direction", [])]
            opposites = {"BULLISH": "BEARISH", "BEARISH": "BULLISH"}
            opp = opposites.get(bias_val)
            if opp and opp in strategy_dirs:
                signals.append({"level": "red", "type": "bias",
                                 "msg": f"The market has turned {bias_val.lower()} — this directly works against your {pos.strategy_name or pos.strategy_key}. The trade is now fighting the trend. Seriously consider closing."})
                escalate("red")
            elif bias_val not in strategy_dirs and bias_val != "NEUTRAL":
                signals.append({"level": "yellow", "type": "bias",
                                 "msg": f"Market bias has shifted to {bias_val.lower()}, which no longer aligns with this strategy's direction. The trade can still work, but the wind is no longer at your back."})
                escalate("yellow")

    if not signals:
        signals.append({"level": "green", "type": "healthy",
                         "msg": "All conditions look good — no urgent signals. Keep monitoring as market conditions change."})

    return {
        "symbol": pos.symbol,
        "expiry": pos.expiry,
        "strike": pos.strike,
        "option_type": pos.option_type,
        "quantity": pos.quantity,
        "avg_cost": pos.avg_cost,
        "current_price": pos.current_price,
        "pnl": pos.pnl,
        "strategy_key": pos.strategy_key,
        "strategy_name": pos.strategy_name,
        "profit_target_pct": profit_target_pct,
        "entry_action": pos.entry_action,
        "dte": dte,
        "pnl_pct": round(pnl_pct, 1),
        "risk_level": risk_level,
        "iv_rank": round(iv_rank_val, 1) if iv_rank_val is not None else None,
        "iv_environment": iv_env_val,
        "bias": bias_val,
        "signals": signals,
    }


@router.get("/positions/closed")
async def get_closed_positions(payload: dict = Depends(verify_token)):
    """
    Return the last 90 days of closed trades for the authenticated user.

    Includes:
      - auto-settled orders (status = 'auto_settled')
      - manual close orders (leg_role = 'close', added from migration 025 onward)

    Legacy close orders (pre-migration 025, leg_role IS NULL) are excluded
    because they lack settlement_metadata and cannot produce meaningful P&L rows.
    """
    user_id = get_user_id(payload)
    sb = get_supabase()
    cutoff_iso = (date.today() - timedelta(days=90)).isoformat()

    try:
        result = (
            sb.table("orders")
            .select("*")
            .eq("user_id", user_id)
            .or_("status.eq.auto_settled,leg_role.eq.close")
            .gte("created_at", cutoff_iso)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        rows = result.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch closed positions: {exc}")

    closed = []
    for row in rows:
        meta = row.get("settlement_metadata") or {}
        is_auto = row.get("status") == "auto_settled"

        settlement_price = float(row.get("price") or 0.0)
        raw_avg_cost = meta.get("entry_avg_cost")
        entry_avg_cost = float(raw_avg_cost) if raw_avg_cost is not None else None
        entry_action = meta.get("entry_action") or row.get("action")
        quantity = abs(int(row.get("quantity") or 0))
        source = meta.get("source")

        # Realised P&L
        realised_pnl = None
        if is_auto:
            raw_pnl = meta.get("realised_pnl")
            realised_pnl = float(raw_pnl) if raw_pnl is not None else None
        elif entry_avg_cost is not None and entry_action:
            # Compute for manual close orders
            if entry_action == "buy":
                # Long position closed: pnl = (close_price - entry) × qty × 100
                realised_pnl = round((settlement_price - entry_avg_cost) * quantity * 100, 2)
            else:
                # Short position closed: pnl = (entry - close_price) × qty × 100
                realised_pnl = round((entry_avg_cost - settlement_price) * quantity * 100, 2)

        # Realised P&L %
        realised_pnl_pct = None
        if realised_pnl is not None and entry_avg_cost and entry_avg_cost > 0 and quantity > 0:
            cost_basis = entry_avg_cost * quantity * 100
            if cost_basis != 0:
                realised_pnl_pct = round(realised_pnl / abs(cost_basis) * 100, 2)

        closed.append({
            "symbol": row.get("symbol"),
            "strategy_name": row.get("strategy_name"),
            "expiry": row.get("expiry"),
            "strike": float(row.get("strike") or 0.0),
            "option_type": row.get("option_type"),
            "settlement_price": settlement_price,
            "entry_avg_cost": entry_avg_cost,
            "quantity": quantity,
            "entry_action": entry_action,
            "realised_pnl": realised_pnl,
            "realised_pnl_pct": realised_pnl_pct,
            "settlement_source": source,
            "closed_at": row.get("created_at"),
            "is_auto_settled": is_auto,
        })

    return closed


@router.get("/positions/risk")
async def get_positions_risk(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    user_email = get_user_email(payload)
    await settlement.auto_settle_expired(user_id, user_email)
    positions = await user_portfolio.get_positions(user_id)
    if not positions:
        return []

    # ── entered_at: build map from MIN(orders.created_at) per position key ──────────
    # This query runs once, synchronously, before the market-data fan-out.
    # It is fast: the orders table is indexed on (user_id, created_at desc) and the
    # result set is at most 200 rows (the same cap enforced by get_orders).
    #
    # NOTE on partial-close / re-entry semantics: MIN(created_at) is intentional.
    # If a position was fully closed and re-entered, the old order rows still exist
    # and MIN(created_at) will reflect the original entry date, not the re-entry date.
    # For a paper-trading education tool this is the correct behaviour — it represents
    # how long this strategy configuration has ever been held.
    sb = get_supabase()
    entered_at_map: dict[tuple, str] = {}
    try:
        orders_rows = (
            sb.table("orders")
            .select("symbol, expiry, strike, option_type, strategy_key, created_at")
            .eq("user_id", user_id)
            .execute()
        )
        for row in (orders_rows.data or []):
            norm_key = row.get("strategy_key") or "manual"
            map_key = (
                row["symbol"],
                str(row["expiry"]),
                str(row["strike"]),
                row["option_type"],
                norm_key,
            )
            iso_date = row["created_at"][:10]  # "YYYY-MM-DD" from ISO 8601 timestamp
            if map_key not in entered_at_map or iso_date < entered_at_map[map_key]:
                entered_at_map[map_key] = iso_date
    except Exception as e:
        logger.warning("entered_at orders fetch failed: %s", e)

    # ── Market data fan-out ──────────────────────────────────────────────────────────
    unique_symbols = list({p.symbol for p in positions})
    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=min(len(unique_symbols), 8)) as pool:
        tasks = [loop.run_in_executor(pool, _fetch_market_data, sym) for sym in unique_symbols]
        results = await asyncio.gather(*tasks)

    market = {sym: (iv, bias) for sym, iv, bias in results}
    risk_items = [_assess_risk(pos, *market.get(pos.symbol, (None, None))) for pos in positions]

    # ── Attach entered_at to each risk item ─────────────────────────────────────────
    for item in risk_items:
        norm_key = item.get("strategy_key") or "manual"
        map_key = (
            item["symbol"],
            item["expiry"],
            str(item["strike"]),
            item["option_type"],
            norm_key,
        )
        item["entered_at"] = entered_at_map.get(map_key)  # None if no orders match

    # ── Fallback: positions.created_at for any item still missing entered_at ────────
    missing = [item for item in risk_items if item.get("entered_at") is None]
    if missing:
        try:
            pos_rows = (
                sb.table("positions")
                .select("symbol, expiry, strike, option_type, strategy_key, created_at")
                .eq("user_id", user_id)
                .execute()
                .data or []
            )
            pos_fallback: dict[tuple, str] = {}
            for row in pos_rows:
                norm_key = row.get("strategy_key") or "manual"
                map_key = (
                    row["symbol"],
                    str(row["expiry"]),
                    str(row["strike"]),
                    row["option_type"],
                    norm_key,
                )
                pos_fallback[map_key] = row["created_at"][:10]

            for item in missing:
                norm_key = item.get("strategy_key") or "manual"
                map_key = (
                    item["symbol"],
                    item["expiry"],
                    str(item["strike"]),
                    item["option_type"],
                    norm_key,
                )
                # Final fallback to today's date guarantees entered_at is never null
                item["entered_at"] = pos_fallback.get(map_key, str(date.today()))
        except Exception as e:
            logger.warning("entered_at positions fallback fetch failed: %s", e)
            today_iso = str(date.today())
            for item in missing:
                if item.get("entered_at") is None:
                    item["entered_at"] = today_iso

    # ── Strategy-group entered_at consistency pass ───────────────────────────────────
    # All legs of a named strategy group must share the same entered_at value:
    # the minimum (earliest) across all legs. Manual/ungrouped positions retain
    # their individual entered_at values.
    group_min: dict[str, str] = defaultdict(lambda: "9999-99-99")
    for item in risk_items:
        sk = item.get("strategy_key") or "manual"
        if sk != "manual":
            ea = item.get("entered_at") or str(date.today())
            if ea < group_min[sk]:
                group_min[sk] = ea

    for item in risk_items:
        sk = item.get("strategy_key") or "manual"
        if sk != "manual":
            item["entered_at"] = group_min[sk]

    # ── Fetch the most recent narrative per strategy (requires migration 022) ────────
    narrative_by_strategy: dict = {}
    try:
        narratives_result = sb.table("orders")\
            .select("strategy_key, narrative_json")\
            .eq("user_id", user_id)\
            .not_.is_("narrative_json", "null")\
            .order("created_at", desc=True)\
            .execute()
        for row in (narratives_result.data or []):
            sk = row.get("strategy_key")
            if sk and sk not in narrative_by_strategy:
                narrative_by_strategy[sk] = row["narrative_json"]
    except Exception as e:
        logger.warning("narrative_json fetch failed (migration 022 pending?): %s", e)

    for item in risk_items:
        item["narrative"] = narrative_by_strategy.get(item.get("strategy_key"))

    return risk_items

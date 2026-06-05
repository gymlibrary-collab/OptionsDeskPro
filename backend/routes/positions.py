import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from fastapi import APIRouter, Depends
from services.auth_utils import verify_token, get_user_id
from services import user_portfolio
from services.iv_analysis import get_iv_rank, get_directional_bias
from services.strategy_engine import STRATEGIES

router = APIRouter()


@router.get("/positions")
def list_positions(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    return user_portfolio.get_positions(user_id)


@router.get("/portfolio")
def get_portfolio(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    return user_portfolio.get_summary(user_id)


@router.post("/positions/snapshot")
async def take_snapshot(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    user_portfolio.take_pnl_snapshot(user_id)
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

    # P&L% from the trader's perspective
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
                         "msg": "Expires TODAY — close immediately"})
        escalate("red")
    elif dte <= 3:
        if pnl_pct < 0:
            signals.append({"level": "red", "type": "dte",
                             "msg": f"{dte} DTE with unrealized loss — expiry imminent, consider closing"})
            escalate("red")
        else:
            signals.append({"level": "yellow", "type": "dte",
                             "msg": f"{dte} DTE — very close to expiry, lock in gains"})
            escalate("yellow")
    elif dte <= 7:
        signals.append({"level": "yellow", "type": "dte",
                         "msg": f"{dte} DTE — theta accelerating, manage soon"})
        escalate("yellow")
    elif dte <= 21:
        signals.append({"level": "yellow", "type": "dte",
                         "msg": f"{dte} DTE — entering high-decay window (21 DTE)"})
        escalate("yellow")

    # ── P&L thresholds ──────────────────────────────────────────────────────────────────
    loss_limit = profit_target_pct  # e.g. target 50% → exit at -50% (2× credit rule)
    if pnl_pct <= -(loss_limit * 2):
        signals.append({"level": "red", "type": "pnl",
                         "msg": f"Down {abs(pnl_pct):.0f}% — well beyond stop-loss, exit now"})
        escalate("red")
    elif pnl_pct <= -loss_limit:
        signals.append({"level": "red", "type": "pnl",
                         "msg": f"Down {abs(pnl_pct):.0f}% — hit stop-loss threshold ({loss_limit:.0f}%), consider closing"})
        escalate("red")
    elif pnl_pct <= -(loss_limit * 0.5):
        signals.append({"level": "yellow", "type": "pnl",
                         "msg": f"Down {abs(pnl_pct):.0f}% — approaching stop-loss, monitor closely"})
        escalate("yellow")
    elif pnl_pct >= profit_target_pct:
        signals.append({"level": "green", "type": "pnl",
                         "msg": f"Profit target hit! +{pnl_pct:.0f}% vs {profit_target_pct:.0f}% target — consider closing"})
    elif pnl_pct >= profit_target_pct * 0.75:
        signals.append({"level": "green", "type": "pnl",
                         "msg": f"Approaching target — +{pnl_pct:.0f}% of {profit_target_pct:.0f}% goal"})

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
                                 "msg": f"IV environment now {iv_env_val} (strategy built for {'/'.join(expected_iv_envs)}) — edge has shifted"})
                escalate("yellow")

        is_long = (pos.entry_action or "buy").lower() == "buy"
        if iv_rank_val is not None:
            if iv_rank_val > 75 and is_long:
                signals.append({"level": "yellow", "type": "iv",
                                 "msg": f"IVR {iv_rank_val:.0f} — elevated IV inflating premium cost for long positions"})
                escalate("yellow")
            elif iv_rank_val < 20 and not is_long:
                signals.append({"level": "yellow", "type": "iv",
                                 "msg": f"IVR {iv_rank_val:.0f} — low IV reduces premium-selling edge"})
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
                                 "msg": f"Bias reversed to {bias_val} — directly conflicts with {pos.strategy_name or pos.strategy_key}"})
                escalate("red")
            elif bias_val not in strategy_dirs and bias_val != "NEUTRAL":
                signals.append({"level": "yellow", "type": "bias",
                                 "msg": f"Bias shifted to {bias_val} — no longer aligned with strategy direction"})
                escalate("yellow")

    if not signals:
        signals.append({"level": "green", "type": "healthy",
                         "msg": "All conditions within normal parameters"})

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


@router.get("/positions/risk")
async def get_positions_risk(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    positions = user_portfolio.get_positions(user_id)
    if not positions:
        return []

    unique_symbols = list({p.symbol for p in positions})
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=min(len(unique_symbols), 8)) as pool:
        tasks = [loop.run_in_executor(pool, _fetch_market_data, sym) for sym in unique_symbols]
        results = await asyncio.gather(*tasks)

    market = {sym: (iv, bias) for sym, iv, bias in results}

    return [_assess_risk(pos, *market.get(pos.symbol, (None, None))) for pos in positions]

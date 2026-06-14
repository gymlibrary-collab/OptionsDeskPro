import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from fastapi import APIRouter, Depends
from services.auth_utils import verify_token, get_user_id
from services.legal_service import legal_gate_dep
from services import user_portfolio
from services.iv_analysis import get_iv_rank, get_directional_bias
from services.strategy_engine import STRATEGIES

router = APIRouter(dependencies=[Depends(legal_gate_dep)])


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
                         "msg": f"{dte} days to expiry. You've entered the danger zone. The tastylive rule is to close at 21 DTE because theta accelerates and the risk/reward worsens from here."})
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

"""
AI feature routes — settings management and AI-powered endpoints.
All endpoints require authentication.
"""
import logging
from datetime import date, timezone, datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth_utils import verify_token, get_user_id
from services.db import get_supabase
from services.legal_service import legal_gate_dep

router = APIRouter(dependencies=[Depends(legal_gate_dep)])
logger = logging.getLogger(__name__)


# ── Settings models ─────────────────────────────────────────────────────────────────

class AISettingsBody(BaseModel):
    narrative_enabled: bool = False
    chat_enabled: bool = False
    risk_summary_enabled: bool = False
    strategy_reasoning_enabled: bool = False
    earnings_awareness_enabled: bool = False


class ChatRequest(BaseModel):
    question: str


class RiskSummaryRequest(BaseModel):
    positions_risk: list[dict]


class StrategyReasoningRequest(BaseModel):
    symbol: str
    iv_analysis: dict
    bias_analysis: dict
    strategy: dict
    trade: dict


class EnhanceNarrativeRequest(BaseModel):
    symbol: str
    iv_analysis: dict
    bias_analysis: dict
    strategy: dict
    trade: dict


# ── Helpers ────────────────────────────────────────────────────────────────────────

def _get_settings(user_id: str) -> dict:
    sb = get_supabase()
    result = sb.table("ai_settings").select("*").eq("user_id", user_id).execute()
    if result.data:
        return result.data[0]
    default = {
        "user_id": user_id,
        "narrative_enabled": False,
        "chat_enabled": False,
        "risk_summary_enabled": False,
        "strategy_reasoning_enabled": False,
    }
    sb.table("ai_settings").insert(default).execute()
    return default


def _settings_response(row: dict) -> dict:
    return {
        "narrative_enabled": bool(row.get("narrative_enabled", False)),
        "chat_enabled": bool(row.get("chat_enabled", False)),
        "risk_summary_enabled": bool(row.get("risk_summary_enabled", False)),
        "strategy_reasoning_enabled": bool(row.get("strategy_reasoning_enabled", False)),
        "earnings_awareness_enabled": bool(row.get("earnings_awareness_enabled", False)),
    }


# ── Routes ───────────────────────────────────────────────────────────────────────

@router.get("/ai/settings")
def get_ai_settings(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    return _settings_response(_get_settings(user_id))


@router.put("/ai/settings")
def update_ai_settings(body: AISettingsBody, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    sb = get_supabase()
    sb.table("ai_settings").upsert(
        {
            "user_id": user_id,
            "narrative_enabled": body.narrative_enabled,
            "chat_enabled": body.chat_enabled,
            "risk_summary_enabled": body.risk_summary_enabled,
            "strategy_reasoning_enabled": body.strategy_reasoning_enabled,
            "earnings_awareness_enabled": body.earnings_awareness_enabled,
        },
        on_conflict="user_id",
    ).execute()
    return {"saved": True}


def _require_ai_feature(user_id: str, feature_key: str) -> None:
    """
    Raise HTTP 403 if the user's effective tier does not include the given AI feature.
    Import is deferred to avoid module-level get_supabase() calls.
    """
    from services.entitlements import compute_entitlements
    ent = compute_entitlements(user_id)
    if not ent.get("features", {}).get(feature_key, False):
        raise HTTPException(status_code=403, detail="This feature requires a Pro plan or higher.")


@router.post("/ai/chat")
def ai_chat(body: ChatRequest, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    _require_ai_feature(user_id, "ai_chat")
    settings = _get_settings(user_id)
    if not settings.get("chat_enabled"):
        raise HTTPException(status_code=403, detail="AI Chat is disabled. Enable it in AI Settings.")

    from services import user_portfolio, ai_service

    try:
        positions = user_portfolio.get_positions(user_id)
        positions_data = [
            {
                "symbol": p.symbol, "option_type": p.option_type, "strike": p.strike,
                "expiry": p.expiry, "quantity": p.quantity, "avg_cost": p.avg_cost,
                "current_price": p.current_price, "pnl": p.pnl,
                "strategy_name": p.strategy_name,
            }
            for p in positions
        ]
    except Exception:
        positions_data = []

    try:
        summary = user_portfolio.get_summary(user_id)
        portfolio_summary = {
            "cash": summary.cash, "positions_value": summary.positions_value,
            "total_value": summary.total_value, "total_pnl": summary.total_pnl,
        }
    except Exception:
        portfolio_summary = {}

    answer = ai_service.answer_portfolio_question(body.question, positions_data, portfolio_summary)
    return {"answer": answer}


@router.post("/ai/risk-summary")
def ai_risk_summary(body: RiskSummaryRequest, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    _require_ai_feature(user_id, "ai_risk_summary")
    settings = _get_settings(user_id)
    if not settings.get("risk_summary_enabled"):
        raise HTTPException(status_code=403, detail="AI Risk Summary is disabled. Enable it in AI Settings.")

    from services import ai_service
    summary = ai_service.synthesize_risk_summary(body.positions_risk)
    return {"summary": summary}


@router.post("/ai/strategy-reasoning")
def ai_strategy_reasoning(body: StrategyReasoningRequest, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    _require_ai_feature(user_id, "ai_strategy_reasoning")
    settings = _get_settings(user_id)
    if not settings.get("strategy_reasoning_enabled"):
        raise HTTPException(status_code=403, detail="AI Strategy Reasoning is disabled. Enable it in AI Settings.")

    from services import ai_service
    reasoning = ai_service.explain_strategy_reasoning(
        body.symbol, body.iv_analysis, body.bias_analysis, body.strategy, body.trade
    )
    return {"reasoning": reasoning}


@router.post("/ai/enhance-narrative")
def ai_enhance_narrative(body: EnhanceNarrativeRequest, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    _require_ai_feature(user_id, "ai_narrative")
    settings = _get_settings(user_id)
    if not settings.get("narrative_enabled"):
        raise HTTPException(status_code=403, detail="AI Narrative is disabled. Enable it in AI Settings.")

    from services import ai_service
    insight = ai_service.enhance_narrative(
        body.symbol, body.iv_analysis, body.bias_analysis, body.strategy, body.trade
    )
    return {"insight": insight}


# ── E4: Morning Briefing ─────────────────────────────────────────────────────

@router.get("/ai/morning-briefing")
def get_morning_briefing(payload: dict = Depends(verify_token)):
    """
    E4 — Daily Morning Briefing. Free for all authenticated users.

    Checks the morning_briefings table for today's UTC date; returns cached if
    found. Otherwise fetches the user's watchlist, runs a lightweight yfinance-
    only IV+bias scan (no Market Data App credits), calls Claude Haiku to
    generate a <120-word briefing, persists it, and returns it.

    Response: {"briefing": "...", "date": "2026-06-13", "symbols": [...], "cached": true|false}
    """
    user_id = get_user_id(payload)
    _require_ai_feature(user_id, "morning_briefing")
    sb = get_supabase()
    today = date.today().isoformat()

    # Check for cached briefing
    cached_result = (
        sb.table("morning_briefings")
        .select("briefing_text, symbols")
        .eq("user_id", user_id)
        .eq("briefing_date", today)
        .maybe_single()
        .execute()
    )
    if cached_result.data:
        row = cached_result.data
        return {
            "briefing": row["briefing_text"],
            "date": today,
            "symbols": row.get("symbols") or [],
            "cached": True,
        }

    # Fetch user's watchlist
    watchlist_result = (
        sb.table("user_watchlists")
        .select("symbol")
        .eq("user_id", user_id)
        .order("position")
        .limit(10)
        .execute()
    )
    watchlist = [r["symbol"] for r in (watchlist_result.data or [])]

    if not watchlist:
        briefing_text = (
            "Your watchlist is empty. Add some tickers to receive a personalised morning briefing."
        )
        sb.table("morning_briefings").upsert(
            {
                "user_id": user_id,
                "briefing_date": today,
                "symbols": [],
                "briefing_text": briefing_text,
            },
            on_conflict="user_id,briefing_date",
        ).execute()
        return {"briefing": briefing_text, "date": today, "symbols": [], "cached": False}

    # Lightweight IV+bias scan (yfinance only, no Market Data App credits consumed)
    # We import here to avoid module-level side effects.
    from services.iv_analysis import get_iv_rank, get_directional_bias
    from services.market_context import get_earnings_info

    market_contexts: list[dict] = []
    for sym in watchlist:
        try:
            iv_data = get_iv_rank(sym)
            bias_data = get_directional_bias(sym)
            earnings = get_earnings_info(sym)
            market_contexts.append({
                "symbol": sym,
                "iv_environment": iv_data.get("iv_environment", "MEDIUM"),
                "bias": bias_data.get("bias", "NEUTRAL"),
                "iv_rank": iv_data.get("iv_rank", 0.0),
                "earnings_soon": earnings.get("earnings_soon", False),
            })
        except Exception as exc:
            logger.debug("Morning briefing scan failed for %s: %s", sym, exc)
            market_contexts.append({
                "symbol": sym,
                "iv_environment": "MEDIUM",
                "bias": "NEUTRAL",
                "iv_rank": 0.0,
                "earnings_soon": False,
            })

    from services import ai_service
    briefing_text = ai_service.generate_morning_briefing(user_id, watchlist, market_contexts)

    # Persist to DB (UPSERT handles rare duplicate on concurrent request)
    try:
        sb.table("morning_briefings").upsert(
            {
                "user_id": user_id,
                "briefing_date": today,
                "symbols": watchlist,
                "briefing_text": briefing_text,
            },
            on_conflict="user_id,briefing_date",
        ).execute()
    except Exception as exc:
        logger.warning("Could not persist morning briefing for %s: %s", user_id, exc)

    return {
        "briefing": briefing_text,
        "date": today,
        "symbols": watchlist,
        "cached": False,
    }


# ── E1: Trade Journal AI Review ───────────────────────────────────────────────

class TradeJournalReviewRequest(BaseModel):
    order_id: str


@router.post("/ai/trade-journal/review")
def ai_trade_journal_review(body: TradeJournalReviewRequest, payload: dict = Depends(verify_token)):
    """
    E1 — Trade Journal AI Review. Requires Pro/Enterprise (trade_journal entitlement).

    Fetches the order by order_id (must belong to the authenticated user),
    fetches the last 10 filled orders for behavioural context, then calls
    Claude Haiku to write a three-section post-mortem.

    Response: {"entry_consistency": "...", "rule_adherence": "...",
               "behavioural_patterns": "...", "overall_grade": "A"|"B"|"C"|"D"}
    """
    user_id = get_user_id(payload)
    _require_ai_feature(user_id, "trade_journal")

    sb = get_supabase()

    # Fetch the specific order — enforce ownership
    order_result = (
        sb.table("orders")
        .select("*")
        .eq("id", body.order_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not order_result.data:
        raise HTTPException(status_code=404, detail="Order not found or does not belong to this account.")

    order = order_result.data

    # Fetch last 10 filled orders for context (exclude the order being reviewed)
    recent_result = (
        sb.table("orders")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "filled")
        .neq("id", body.order_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    recent_trades = recent_result.data or []

    from services import ai_service
    review = ai_service.review_closed_trade(order, recent_trades)
    return review


# ── E5: Roll/Adjustment Advisor ───────────────────────────────────────────────

class RollAdvisorRequest(BaseModel):
    position_id: str


@router.post("/ai/roll-advisor")
def ai_roll_advisor(body: RollAdvisorRequest, payload: dict = Depends(verify_token)):
    """
    E5 — Roll/Adjustment Advisor. Requires Pro/Enterprise (roll_advisor entitlement).

    Looks up the position from the positions table (must belong to the auth user),
    fetches market context for the symbol, then calls Claude Haiku to propose
    1-3 ranked defensive actions.

    Response: {"suggestions": [...], "summary": "..."}
    """
    user_id = get_user_id(payload)
    _require_ai_feature(user_id, "roll_advisor")

    sb = get_supabase()

    # Fetch position — enforce ownership
    pos_result = (
        sb.table("positions")
        .select("*")
        .eq("id", body.position_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not pos_result.data:
        raise HTTPException(status_code=404, detail="Position not found or does not belong to this account.")

    pos = pos_result.data
    symbol = pos.get("symbol", "")

    # Compute DTE
    from datetime import date as _date
    try:
        expiry_date = _date.fromisoformat(pos["expiry"])
        dte = max((expiry_date - _date.today()).days, 0)
    except Exception:
        dte = None

    # Compute P&L
    avg_cost = float(pos.get("avg_cost") or 0)
    current_price = float(pos.get("current_price") or avg_cost)
    quantity = int(pos.get("quantity") or 0)
    pnl = (current_price - avg_cost) * quantity * 100

    position_dict = {
        "symbol": symbol,
        "expiry": pos.get("expiry"),
        "strike": pos.get("strike"),
        "option_type": pos.get("option_type"),
        "quantity": quantity,
        "avg_cost": avg_cost,
        "current_price": current_price,
        "pnl": pnl,
        "dte": dte,
        "risk_level": pos.get("risk_level", "green"),
        "signals": pos.get("signals") or [],
    }

    # Fetch market context
    from services.market_context import get_full_market_context
    try:
        market_ctx = get_full_market_context(symbol)
    except Exception as exc:
        logger.warning("market_context failed for roll advisor (%s): %s", symbol, exc)
        market_ctx = {}

    from services import ai_service
    result = ai_service.suggest_roll_adjustment(position_dict, market_ctx)
    return result


# ── E6: Portfolio Greeks Coaching ─────────────────────────────────────────────

@router.post("/ai/portfolio-greeks-coaching")
def ai_portfolio_greeks_coaching(payload: dict = Depends(verify_token)):
    """
    E6 — Portfolio Greeks Coaching. Requires Pro/Enterprise (greeks_coaching entitlement).

    Fetches all open positions, computes net delta/theta/vega, then calls Claude
    Haiku for a 2-3 sentence concentration-risk coaching paragraph.

    Response: {"coaching": "...", "net_delta": 0.45, "net_theta": -12.3, "net_vega": 89.2}
    """
    user_id = get_user_id(payload)
    _require_ai_feature(user_id, "greeks_coaching")

    from services import user_portfolio, ai_service
    from services.greeks import calculate_greeks
    from datetime import date as _date

    try:
        positions = user_portfolio.get_positions(user_id)
    except Exception as exc:
        logger.warning("get_positions failed for greeks coaching: %s", exc)
        positions = []

    net_delta = 0.0
    net_theta = 0.0
    net_vega = 0.0
    pos_dicts: list[dict] = []

    for p in positions:
        delta = float(p.delta or 0.0)
        # Position-level delta contribution (sign already baked in via quantity)
        pos_delta = delta * p.quantity
        net_delta += pos_delta

        # Theta and vega require the greeks dict which Position may not carry directly.
        # Recompute via Black-Scholes if needed.
        try:
            T = max((_date.fromisoformat(p.expiry) - _date.today()).days, 0) / 365.0
            g = calculate_greeks(
                # spot not available directly on Position; use strike as proxy if needed
                # We use current_price as a rough stand-in for the underlying only if spot=0
                float(p.strike) * 1.0,  # placeholder — greeks already computed on Position
                float(p.strike),
                T, 0.05, 0.30, p.option_type,
            )
            # Use the delta from the Position object (already market-aware) but
            # theta/vega from the BS greeks for a reasonable estimate.
            theta = float(g.get("theta", 0.0)) * p.quantity
            vega = float(g.get("vega", 0.0)) * p.quantity
        except Exception:
            theta = 0.0
            vega = 0.0

        net_theta += theta
        net_vega += vega

        pos_dicts.append({
            "symbol": p.symbol,
            "option_type": p.option_type,
            "quantity": p.quantity,
            "delta": delta,
        })

    coaching = ai_service.generate_greeks_coaching(net_delta, net_theta, net_vega, pos_dicts)

    return {
        "coaching": coaching,
        "net_delta": round(net_delta, 4),
        "net_theta": round(net_theta, 4),
        "net_vega": round(net_vega, 4),
    }

"""
AI feature routes — settings management and AI-powered endpoints.
All endpoints require authentication.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth_utils import verify_token, get_user_id
from services.db import get_supabase

router = APIRouter()


# ── Settings models ──────────────────────────────────────────────────────────

class AISettingsBody(BaseModel):
    narrative_enabled: bool = False
    chat_enabled: bool = False
    risk_summary_enabled: bool = False
    strategy_reasoning_enabled: bool = False


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


# ── Helpers ──────────────────────────────────────────────────────────────────

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
    }


# ── Routes ───────────────────────────────────────────────────────────────────

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
        },
        on_conflict="user_id",
    ).execute()
    return {"saved": True}


@router.post("/ai/chat")
def ai_chat(body: ChatRequest, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
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
    settings = _get_settings(user_id)
    if not settings.get("risk_summary_enabled"):
        raise HTTPException(status_code=403, detail="AI Risk Summary is disabled. Enable it in AI Settings.")

    from services import ai_service
    summary = ai_service.synthesize_risk_summary(body.positions_risk)
    return {"summary": summary}


@router.post("/ai/strategy-reasoning")
def ai_strategy_reasoning(body: StrategyReasoningRequest, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
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
    settings = _get_settings(user_id)
    if not settings.get("narrative_enabled"):
        raise HTTPException(status_code=403, detail="AI Narrative is disabled. Enable it in AI Settings.")

    from services import ai_service
    insight = ai_service.enhance_narrative(
        body.symbol, body.iv_analysis, body.bias_analysis, body.strategy, body.trade
    )
    return {"insight": insight}

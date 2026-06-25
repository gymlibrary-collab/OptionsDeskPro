"""
Fire-and-forget activity logging for user_action_log table.
Never raises. Any failure is logged at WARNING level and silently dropped.
See ADR-0009 for rationale.
"""
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

ACTION_TYPES = frozenset({
    "login",
    "logout",
    "ticker_search",
    "strategy_scan",
    "options_chain_view",
    "paper_trade_placed",
    "watchlist_update",
    "ai_query",
    "tc_acknowledged",
    "ai_features_enabled",
})


async def log_action(
    user_id: str,
    user_email: str,
    action_type: str,
    detail: dict | None,
    ip_address: str | None,
) -> None:
    """
    Write one row to user_action_log. Non-blocking: called with asyncio.create_task()
    by callers. Never raises — any exception is caught and logged at WARNING.

    Signature:
        user_id     — Supabase auth user UUID (string)
        user_email  — denormalised email for query convenience
        action_type — must be one of ACTION_TYPES; invalid values are dropped
        detail      — action-specific JSONB payload (may be None or {})
        ip_address  — client IP extracted from X-Forwarded-For or request.client.host
    """
    if action_type not in ACTION_TYPES:
        logger.warning("log_action: unknown action_type %r — row dropped", action_type)
        return
    try:
        from services.db import get_supabase
        sb = get_supabase()
        sb.table("user_action_log").insert({
            "user_id": user_id,
            "user_email": user_email,
            "action_type": action_type,
            "detail": detail or {},
            "ip_address": ip_address,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.warning(
            "log_action: failed to write %s for %s: %s",
            action_type, user_email, exc,
        )


def extract_ip(request) -> str | None:
    """
    Extract client IP from FastAPI Request.
    Prefers X-Forwarded-For (set by Railway's reverse proxy).
    Falls back to request.client.host.
    Returns the first IP in the X-Forwarded-For list if multiple are present.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None

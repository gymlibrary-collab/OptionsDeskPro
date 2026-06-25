"""
Subscriber-facing activity logging endpoint.
Only whitelisted client-callable action types are accepted.
The user_id and user_email are always taken from the verified JWT —
subscribers cannot log events for other users or inject arbitrary action types.
"""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from services.auth_utils import verify_token, get_user_id
from services.activity_logger import log_action, extract_ip

logger = logging.getLogger(__name__)

router = APIRouter()

# Only these action types may be written via the subscriber-facing endpoint.
# This prevents subscribers from fabricating events for admin-only types
# (e.g. paper_trade_placed) via direct API calls.
CLIENT_CALLABLE_ACTION_TYPES = frozenset({"ai_features_enabled"})


class LogActionRequest(BaseModel):
    action_type: str
    detail: dict | None = None


@router.post("/activity/log-action")
async def subscriber_log_action(
    body: LogActionRequest,
    request: Request,
    payload: dict = Depends(verify_token),
):
    """
    Fire-and-forget activity log write from an authenticated subscriber.
    Only action types in CLIENT_CALLABLE_ACTION_TYPES are accepted.
    The user identity is always derived from the verified JWT.
    """
    if body.action_type not in CLIENT_CALLABLE_ACTION_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"action_type {body.action_type!r} is not client-callable",
        )
    user_id = get_user_id(payload)
    user_email = payload.get("email", "")
    ip = extract_ip(request)
    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=user_email,
        action_type=body.action_type,
        detail=body.detail or {},
        ip_address=ip,
    ))
    return {"ok": True}

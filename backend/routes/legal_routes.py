"""
Legal routes — /api/legal/*

Subscriber-facing endpoints for the legal acknowledgment gate.
All DB writes use the service role (via get_supabase()).
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from services.auth_utils import verify_token, get_user_id
from services.db import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ── GET /legal/current-version ───────────────────────────────────────────────

@router.get("/legal/current-version")
async def get_current_version(payload: dict = Depends(verify_token)):
    """
    Return the currently active legal document version.
    Response is served from the 60-second in-process cache in legal_service.
    Returns 404 when no version has been published yet.
    Auth required: valid subscriber JWT.
    """
    from services.legal_service import get_active_version
    version = get_active_version()
    if not version:
        raise HTTPException(status_code=404, detail="No active legal document version has been published yet.")
    return version


# ── POST /legal/acknowledge ──────────────────────────────────────────────────

class AcknowledgeRequest(BaseModel):
    version_id: str
    content_hash: str


@router.post("/legal/acknowledge")
async def acknowledge_legal(
    body: AcknowledgeRequest,
    request: Request,
    payload: dict = Depends(verify_token),
):
    """
    Record a subscriber's acknowledgment of the active legal document version.

    Security invariants:
    - user_id is always taken from the verified JWT, never from the request body.
    - content_hash in the acknowledgment row comes from the DB row, not the client.
    - The client-supplied content_hash is validated against the DB value as a
      sanity check but is not used as the canonical stored value.
    - version_id is checked against the currently active version to guard against
      race conditions where a new version was published between page load and submit.

    On duplicate (user already acknowledged this version), returns
    {"already_acknowledged": true} without inserting a second row.
    """
    from services.legal_service import get_active_version

    user_id = get_user_id(payload)

    # Fetch the currently active version from cache / DB.
    active = get_active_version()
    if not active:
        raise HTTPException(
            status_code=404,
            detail="No active legal document version has been published yet.",
        )

    # Race-condition guard: reject if version_id has changed since the
    # subscriber loaded the form (e.g., owner published a new version mid-flow).
    if body.version_id != active["id"]:
        raise HTTPException(
            status_code=409,
            detail="Legal document version has changed. Please reload and re-read the updated terms.",
        )

    # Sanity check: client-supplied hash must match the DB-stored hash.
    # The DB hash is the canonical value written to the acknowledgment row.
    if body.content_hash != active["content_hash"]:
        raise HTTPException(
            status_code=409,
            detail="Content mismatch. Please reload.",
        )

    sb = get_supabase()
    version_id = active["id"]

    # Check for an existing acknowledgment (UNIQUE constraint on user_id, version_id).
    try:
        existing = (
            sb.table("legal_acknowledgments")
            .select("id")
            .eq("user_id", user_id)
            .eq("version_id", version_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:
        logger.error("legal/acknowledge: duplicate check failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Database error. Please try again.")

    if existing.data:
        return {"already_acknowledged": True}

    # Extract IP address for the audit record.
    ip_address: str | None = None
    xff = request.headers.get("x-forwarded-for")
    if xff:
        ip_address = xff.split(",")[0].strip()
    elif request.client:
        ip_address = request.client.host

    # Insert the acknowledgment row. All writes use the service role.
    try:
        result = sb.table("legal_acknowledgments").insert({
            "user_id":      user_id,
            "version_id":   version_id,
            "content_hash": active["content_hash"],  # DB value is canonical
            "ip_address":   ip_address,
        }).execute()
    except Exception as e:
        logger.error("legal/acknowledge: insert failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Failed to record acknowledgment. Please try again.")

    ack_row = result.data[0] if result.data else {}

    return {
        "acknowledged":    True,
        "version_number":  active["version_number"],
        "acknowledged_at": ack_row.get("acknowledged_at"),
    }

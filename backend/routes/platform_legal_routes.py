"""
Platform legal routes — /api/platform/legal/*

Admin-portal endpoints for legal document version management.
All routes require an active platform_staff JWT checked by require_staff().
Write operations further restrict to the 'owner' role.
"""
import hashlib
import logging
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from services.staff_auth import require_staff
from services.db import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Audit helper (mirrors platform_routes._audit) ────────────────────────────

def _audit(actor: dict, action_type: str, target_user_id: Optional[str] = None, payload: Optional[dict] = None) -> None:
    """Write a platform_audit_log entry. Best-effort — never raises."""
    try:
        sb = get_supabase()
        sb.table("platform_audit_log").insert({
            "actor_id":       actor["id"],
            "actor_email":    actor["email"],
            "target_user_id": target_user_id,
            "action_type":    action_type,
            "payload":        payload,
        }).execute()
    except Exception as e:
        logger.warning("Audit log write failed: %s", e)


# ── GET /platform/legal/versions ────────────────────────────────────────────

@router.get("/platform/legal/versions")
async def list_legal_versions(staff: dict = Depends(require_staff())):
    """
    Return all published legal document versions, ordered by published_at DESC.
    full_text / content_markdown intentionally omitted to keep payload small.
    Any active staff role may call this endpoint.
    """
    sb = get_supabase()
    try:
        result = (
            sb.table("legal_document_versions")
            .select("id, version_number, title, content_hash, effective_date, published_at, published_by, is_active")
            .order("published_at", desc=True)
            .execute()
        )
        return {"versions": result.data or []}
    except Exception as e:
        logger.error("platform/legal/versions: query failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve legal versions.")


# ── POST /platform/legal/versions ───────────────────────────────────────────

class PublishVersionRequest(BaseModel):
    version_number:   str
    title:            str
    content_markdown: str
    effective_date:   str  # ISO date string: "YYYY-MM-DD"


@router.post("/platform/legal/versions")
async def publish_legal_version(
    body: PublishVersionRequest,
    staff: dict = Depends(require_staff(["owner"])),
):
    """
    Publish a new legal document version. Owner only.

    Steps:
    1. Validate inputs.
    2. Compute content_hash server-side.
    3. Check version_number uniqueness.
    4. Deactivate current active version, then insert new active version.
    5. Write platform_audit_log entry (best-effort).
    6. Invalidate the 60-second active-version cache in legal_service.
    """
    # Validate content_markdown is non-empty.
    if not body.content_markdown or not body.content_markdown.strip():
        raise HTTPException(status_code=422, detail="Agreement text must not be empty.")

    # Validate effective_date is a parseable ISO date.
    try:
        effective = date.fromisoformat(body.effective_date)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"effective_date '{body.effective_date}' is not a valid ISO date (YYYY-MM-DD).",
        )

    sb = get_supabase()

    # Check version_number uniqueness.
    try:
        existing = (
            sb.table("legal_document_versions")
            .select("id")
            .eq("version_number", body.version_number)
            .maybe_single()
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=409,
                detail=f"Version number '{body.version_number}' already exists.",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("platform/legal/versions: uniqueness check failed: %s", e)
        raise HTTPException(status_code=500, detail="Database error during version check.")

    # Compute content_hash server-side — the canonical value stored in the DB.
    content_hash = hashlib.sha256(body.content_markdown.encode("utf-8")).hexdigest()

    # Deactivate the current active version then insert the new one.
    # Two separate calls are used instead of the publish_legal_version() RPC because
    # PostgREST requires explicit EXECUTE grants that are not applied by the migration.
    # The service role key bypasses RLS so both operations succeed without extra grants.
    try:
        sb.table("legal_document_versions").update({"is_active": False}).eq("is_active", True).execute()
    except Exception as e:
        logger.error("platform/legal/versions: deactivate current version failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to publish legal version.")

    try:
        insert_result = sb.table("legal_document_versions").insert({
            "version_number":   body.version_number,
            "title":            body.title,
            "content_markdown": body.content_markdown,
            "content_hash":     content_hash,
            "effective_date":   str(effective),
            "published_by":     staff["id"],
            "is_active":        True,
        }).execute()
    except Exception as e:
        logger.error("platform/legal/versions: insert new version failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to publish legal version.")

    new_id = insert_result.data[0]["id"] if insert_result.data else None

    # Audit log (best-effort — consistent with _audit pattern in platform_routes.py).
    _audit(staff, "legal_version_publish", payload={
        "version_number": body.version_number,
        "title":          body.title,
        "effective_date": str(effective),
        "content_hash":   content_hash,
    })

    # Invalidate the 60-second in-process cache so the new version is returned
    # immediately on the next call to GET /api/legal/current-version.
    from services.legal_service import invalidate_legal_version_cache
    invalidate_legal_version_cache()

    return {
        "ok":             True,
        "id":             new_id,
        "version_number": body.version_number,
        "content_hash":   content_hash,
    }


# ── GET /platform/legal/subscribers/{user_id}/history ───────────────────────

@router.get("/platform/legal/subscribers/{user_id}/history")
async def get_subscriber_legal_history(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    staff: dict = Depends(require_staff(["owner", "support", "finance"])),
):
    """
    Return the full legal acknowledgment history for a single subscriber.
    Results are joined with version info and ordered by acknowledged_at DESC.
    Returns an empty history (not a 404) when the subscriber has no records.
    """
    sb = get_supabase()

    # Verify subscriber exists in user_profiles.
    try:
        profile = (
            sb.table("user_profiles")
            .select("id")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not profile.data:
            raise HTTPException(status_code=404, detail="Subscriber not found.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("platform/legal/history: user lookup failed: %s", e)
        raise HTTPException(status_code=500, detail="Database error during subscriber lookup.")

    offset = (page - 1) * page_size

    try:
        # Fetch acknowledgment rows joined with version metadata.
        result = (
            sb.table("legal_acknowledgments")
            .select(
                "id, acknowledged_at, ip_address, content_hash,"
                "legal_document_versions!inner(version_number, title, effective_date)"
            )
            .eq("user_id", user_id)
            .order("acknowledged_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        logger.error("platform/legal/history: acknowledgment query failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve acknowledgment history.")

    # Count total rows for this user.
    try:
        count_result = (
            sb.table("legal_acknowledgments")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        total = count_result.count or 0
    except Exception:
        total = len(rows)

    history = []
    for row in rows:
        ver = row.get("legal_document_versions") or {}
        if isinstance(ver, list):
            ver = ver[0] if ver else {}
        history.append({
            "id":              row["id"],
            "version_number":  ver.get("version_number"),
            "title":           ver.get("title"),
            "effective_date":  ver.get("effective_date"),
            "content_hash":    row.get("content_hash"),
            "acknowledged_at": row.get("acknowledged_at"),
            "ip_address":      row.get("ip_address"),
        })

    return {
        "user_id":   user_id,
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "history":   history,
    }


# ── GET /platform/legal/pending-count ───────────────────────────────────────

@router.get("/platform/legal/pending-count")
async def get_pending_count(staff: dict = Depends(require_staff())):
    """
    Return the count of subscribers who have NOT acknowledged the current active
    legal version. This is a derived metric — no stored column tracks this state.

    Returns {"pending_count": 0, "current_version_number": null} when no version
    has been published.

    Not cached — called only on admin portal load of the Legal section.
    """
    from services.legal_service import get_active_version

    active = get_active_version()
    if not active:
        return {"pending_count": 0, "current_version_number": None}

    version_id = active["id"]
    version_number = active["version_number"]

    sb = get_supabase()

    # Count user_profiles rows that have no acknowledgment for the active version.
    # Excludes deactivated accounts and the admin email.
    # We do this as two separate queries: total active subscribers minus those
    # who have an acknowledgment for the current version.
    try:
        from services.auth_utils import ADMIN_EMAIL

        # Total active subscribers (excluding admin email and deactivated accounts).
        total_result = (
            sb.table("user_profiles")
            .select("id", count="exact")
            .is_("deactivated_at", "null")
            .neq("email", ADMIN_EMAIL)
            .execute()
        )
        total_subscribers = total_result.count or 0

        # Subscribers who HAVE acknowledged the current active version.
        acked_result = (
            sb.table("legal_acknowledgments")
            .select("user_id", count="exact")
            .eq("version_id", version_id)
            .execute()
        )
        acked_count = acked_result.count or 0

        pending_count = max(0, total_subscribers - acked_count)

    except Exception as e:
        logger.error("platform/legal/pending-count: query failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to compute pending count.")

    return {
        "pending_count":          pending_count,
        "current_version_number": version_number,
    }

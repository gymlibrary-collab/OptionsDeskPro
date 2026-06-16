"""
Staff authentication dependency for the admin portal.

require_staff(role) returns a FastAPI dependency that:
  1. Verifies the Supabase JWT (same as verify_token).
  2. Looks up the user in platform_staff and checks is_active = true.
  3. Optionally checks the caller has at least one of the required roles.

Roles: 'owner' | 'support' | 'finance'
Owner can access everything. Support and finance have limited access.

Never call get_supabase() at module level.
"""
import logging
from fastapi import Depends, HTTPException
from services.auth_utils import verify_token, get_user_id, get_user_email, ADMIN_EMAIL

logger = logging.getLogger(__name__)

# Role hierarchy: owner > support/finance
_VALID_ROLES = {"owner", "support", "finance"}


def _get_staff_row(user_id: str) -> dict:
    """
    Return the platform_staff row for user_id or raise 403.
    Also upserts the admin email as owner on first access (bootstrap).
    """
    from services.db import get_supabase
    sb = get_supabase()
    result = sb.table("platform_staff").select("*").eq("id", user_id).maybe_single().execute()
    if result.data:
        return result.data
    return {}


def require_staff(allowed_roles: list[str] | None = None):
    """
    FastAPI dependency factory.

    Usage:
        @router.get("/platform/...")
        async def handler(staff: dict = Depends(require_staff(["owner", "support"]))):
            ...

    If allowed_roles is None, any active staff member is accepted.
    """
    if allowed_roles is not None:
        invalid = set(allowed_roles) - _VALID_ROLES
        if invalid:
            raise ValueError(f"Invalid staff roles: {invalid}")

    def _dependency(payload: dict = Depends(verify_token)) -> dict:
        user_id = get_user_id(payload)
        email = get_user_email(payload)

        staff_row = _get_staff_row(user_id)
        if not staff_row:
            # Bootstrap: if this is the admin email and no staff row exists yet,
            # create one. The migration attempts this insert but may fail if the
            # user had not yet logged in at migration time.
            if email == ADMIN_EMAIL:
                try:
                    from services.db import get_supabase
                    sb = get_supabase()
                    meta = payload.get("user_metadata", {}) or {}
                    full_name = meta.get("full_name") or meta.get("name") or email
                    sb.table("platform_staff").upsert({
                        "id": user_id,
                        "email": email,
                        "full_name": full_name,
                        "staff_role": "owner",
                        "is_active": True,
                    }, on_conflict="id").execute()
                    staff_row = _get_staff_row(user_id)
                except Exception as e:
                    logger.warning("Could not bootstrap admin staff row: %s", e)

        if not staff_row:
            raise HTTPException(
                status_code=403,
                detail="Staff portal access denied.",
            )

        if not staff_row.get("is_active", False):
            raise HTTPException(
                status_code=403,
                detail="Staff account is inactive. Contact your administrator.",
            )

        staff_role = staff_row.get("staff_role", "")
        if allowed_roles is not None and staff_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"This action requires one of these roles: {', '.join(allowed_roles)}.",
            )

        # Update last_seen_at for the staff member (best-effort)
        try:
            from services.db import get_supabase
            get_supabase().table("platform_staff").update({"last_seen_at": "now()"}).eq("id", user_id).execute()
        except Exception:
            pass

        return {
            "id":         user_id,
            "email":      email,
            "staff_role": staff_role,
            "full_name":  staff_row.get("full_name", ""),
            "is_active":  True,
        }

    return _dependency

"""
Verify Supabase JWTs via the Supabase Auth API.
This approach is algorithm-agnostic — it works regardless of whether the project
uses HS256 or RS256, and doesn't require the JWT secret to be present.
"""
import os
import time
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

ADMIN_EMAIL = "leonardsim.sm@gmail.com"

security = HTTPBearer(auto_error=False)

# ── Deactivation TTL cache (60 s, keyed by user_id) ─────────────────────────
# Stores True when deactivated_at is set; False when account is active.
# Fail-open: missing key means we haven't cached yet (triggers a DB lookup).
_deactivation_cache: dict[str, bool] = {}
_deactivation_cache_ts: dict[str, float] = {}
_DEACTIVATION_TTL = 60.0  # seconds


def _is_deactivated(user_id: str) -> bool:
    """
    Return True if user_profiles.deactivated_at is non-null for this user.
    Result is cached for _DEACTIVATION_TTL seconds per user_id.
    Fail-open: any DB error returns False (allows the request).
    """
    now = time.time()
    if user_id in _deactivation_cache:
        if (now - _deactivation_cache_ts.get(user_id, 0)) < _DEACTIVATION_TTL:
            return _deactivation_cache[user_id]

    try:
        from services.db import get_supabase
        sb = get_supabase()
        result = (
            sb.table("user_profiles")
            .select("deactivated_at")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        deactivated = bool(result.data and result.data.get("deactivated_at"))
        _deactivation_cache[user_id] = deactivated
        _deactivation_cache_ts[user_id] = now
        return deactivated
    except Exception:
        # DB error — fail-open: do not block the request
        return False


def invalidate_deactivation_cache(user_id: str) -> None:
    """Force a fresh lookup on the next request for this user_id.
    Call this after deactivating or reactivating an account."""
    _deactivation_cache.pop(user_id, None)
    _deactivation_cache_ts.pop(user_id, None)


def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """FastAPI dependency. Validates the token with Supabase Auth and returns a
    normalised payload dict compatible with the rest of the codebase."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    try:
        from services.db import get_supabase
        sb = get_supabase()
        result = sb.auth.get_user(token)
        user = result.user
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")

        # Deactivation check — runs on every authenticated request.
        # Uses a 60 s in-process cache to avoid a DB round-trip per call.
        # Fail-open: _is_deactivated() returns False on DB error.
        if _is_deactivated(user.id):
            raise HTTPException(status_code=403, detail="Account suspended")

        return {
            "sub": user.id,
            "email": user.email,
            "user_metadata": user.user_metadata or {},
            "app_metadata": user.app_metadata or {},
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def get_user_id(payload: dict) -> str:
    return payload.get("sub", "")


def get_user_email(payload: dict) -> str:
    return payload.get("email", "")


def require_admin(payload: dict = None):
    """Raise 403 if user is not admin."""
    email = get_user_email(payload)
    if email == ADMIN_EMAIL:
        return

    # Check JWT metadata
    meta = payload.get("user_metadata", {}) or {}
    app_meta = payload.get("app_metadata", {}) or {}
    if meta.get("role") == "admin" or app_meta.get("role") == "admin":
        return

    # DB check — covers users promoted to admin via the admin panel
    from services.db import get_supabase
    user_id = get_user_id(payload)
    try:
        result = get_supabase().table("user_profiles").select("role").eq("id", user_id).execute()
        if result.data and result.data[0].get("role") == "admin":
            return
    except Exception:
        pass

    raise HTTPException(status_code=403, detail="Admin access required")

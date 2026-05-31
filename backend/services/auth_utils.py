"""
Verify Supabase JWTs via the Supabase Auth API.
This approach is algorithm-agnostic — it works regardless of whether the project
uses HS256 or RS256, and doesn't require the JWT secret to be present.
"""
import os
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

ADMIN_EMAIL = "leonard.simgt@gmail.com"

security = HTTPBearer(auto_error=False)


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

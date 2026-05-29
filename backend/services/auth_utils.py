"""
Verify Supabase JWTs and extract user info.
SUPABASE_JWT_SECRET: found in Supabase dashboard → Settings → API → JWT Settings → JWT Secret
"""
import os
from jose import jwt, JWTError
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ADMIN_EMAIL = "leonard.simgt@gmail.com"

security = HTTPBearer(auto_error=False)


def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """FastAPI dependency. Returns decoded JWT payload. Raises 401 if invalid."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def get_user_id(payload: dict) -> str:
    return payload.get("sub", "")


def get_user_email(payload: dict) -> str:
    return payload.get("email", "")


def require_admin(payload: dict = None):
    """Raise 403 if user is not admin."""
    email = get_user_email(payload)
    if email != ADMIN_EMAIL:
        # Also check role in payload metadata if present
        meta = payload.get("user_metadata", {}) or {}
        app_meta = payload.get("app_metadata", {}) or {}
        if meta.get("role") != "admin" and app_meta.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")

"""
Verify Supabase JWTs via the Supabase Auth API.
This approach is algorithm-agnostic — it works regardless of whether the project
uses HS256 or RS256, and doesn't require the JWT secret to be present.

Tokens are read from the sb_access_token httpOnly cookie first, with a backward-
compatible fallback to the Authorization: Bearer header for the transition window.
Transparent token refresh is performed when the access token is within 300 seconds
of expiry, using a per-user asyncio.Lock to prevent concurrent refresh races.
"""
import asyncio
import base64
import json
import logging
import os
import time

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

ADMIN_EMAIL = "leonardsim.sm@gmail.com"

# ── Deactivation TTL cache (60 s, keyed by user_id) ─────────────────────────
# Stores True when deactivated_at is set; False when account is active.
# Fail-open: missing key means we haven't cached yet (triggers a DB lookup).
_deactivation_cache: dict[str, bool] = {}
_deactivation_cache_ts: dict[str, float] = {}
_DEACTIVATION_TTL = 60.0  # seconds

# ── Per-user refresh locks (10 s TTL, evicted on access) ────────────────────
_refresh_locks: dict[str, asyncio.Lock] = {}
_refresh_lock_ts: dict[str, float] = {}
_REFRESH_LOCK_TTL = 10.0  # seconds


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


def _get_token_exp(token: str) -> int | None:
    """
    Decode the JWT payload (without signature verification) and return the
    exp claim as an integer Unix timestamp, or None if it cannot be parsed.
    Used only to decide whether to attempt a proactive refresh; Supabase's
    get_user() is the authoritative validity check.
    """
    try:
        payload_b64 = token.split(".")[1]
        # Restore standard base64 padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload_b64))
        return claims.get("exp")
    except Exception:
        return None


def _get_token_sub(token: str) -> str | None:
    """Return the sub (user_id) claim from the JWT payload without verification."""
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload_b64))
        return claims.get("sub")
    except Exception:
        return None


def _get_refresh_lock(user_id: str) -> asyncio.Lock:
    """
    Return (or create) a per-user asyncio.Lock.
    Entries whose timestamp is older than _REFRESH_LOCK_TTL are evicted to
    prevent unbounded memory growth in long-lived processes.
    """
    now = time.time()
    if user_id in _refresh_lock_ts and (now - _refresh_lock_ts[user_id]) > _REFRESH_LOCK_TTL:
        _refresh_locks.pop(user_id, None)
    if user_id not in _refresh_locks:
        _refresh_locks[user_id] = asyncio.Lock()
    _refresh_lock_ts[user_id] = now
    return _refresh_locks[user_id]


async def _maybe_refresh(token: str, request: Request) -> dict | None:
    """
    Attempt a proactive token refresh when the access token is within 300 s of
    expiry. Uses a per-user asyncio.Lock to prevent the concurrent-tab double-
    refresh race condition described in ADR-0010.

    Returns a dict with 'access_token' and 'refresh_token' on success, or None
    if no refresh was needed / possible.
    """
    exp = _get_token_exp(token)
    if exp is None:
        return None

    now = time.time()
    if exp - now >= 300:
        # Token is not near expiry; no refresh needed
        return None

    user_id = _get_token_sub(token)
    if not user_id:
        return None

    refresh_token = request.cookies.get("sb_refresh_token")
    if not refresh_token:
        return None

    lock = _get_refresh_lock(user_id)
    try:
        await asyncio.wait_for(lock.acquire(), timeout=2.0)
    except asyncio.TimeoutError:
        # Another coroutine holds the lock; proceed with the original token
        logger.debug("_maybe_refresh: lock timeout for user %s; proceeding without refresh", user_id)
        return None

    try:
        # Re-check expiry — another coroutine may have just refreshed the token.
        # If the token is no longer near expiry, skip the refresh.
        current_exp = _get_token_exp(token)
        if current_exp is not None and current_exp - time.time() >= 300:
            return None

        from services.db import get_supabase
        sb = get_supabase()
        result = sb.auth.refresh_session(refresh_token)
        session = result.session
        if not session:
            return None
        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
        }
    except Exception as exc:
        # Single-use refresh token already consumed, or network error
        logger.warning("_maybe_refresh: refresh failed for user %s: %s", user_id, exc)
        return None
    finally:
        lock.release()


def _set_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    """
    Set sb_access_token and sb_refresh_token as httpOnly cookies on response.
    The Secure flag is omitted when ENVIRONMENT=development to allow local HTTP
    testing without TLS.
    """
    is_dev = os.getenv("ENVIRONMENT", "").lower() == "development"
    secure = not is_dev

    response.set_cookie(
        key="sb_access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=3600,
    )
    response.set_cookie(
        key="sb_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=604800,
    )


async def verify_token(request: Request) -> dict:
    """
    FastAPI dependency. Reads the sb_access_token cookie (with a backward-
    compatible Authorization: Bearer fallback), performs a transparent proactive
    refresh if the token is near expiry, validates via Supabase Auth, and returns
    a normalised payload dict compatible with all existing route handlers.

    The returned dict always contains: sub, email, user_metadata, app_metadata.
    """
    # 1. Try cookie first
    token = request.cookies.get("sb_access_token")

    # 2. Fall back to Authorization header (transition window)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # 3. Transparent refresh if near expiry
    refreshed = await _maybe_refresh(token, request)
    if refreshed:
        token = refreshed["access_token"]
        request.state.new_access_token = refreshed["access_token"]
        request.state.new_refresh_token = refreshed["refresh_token"]

    # 4. Verify with Supabase
    try:
        from services.db import get_supabase
        sb = get_supabase()
        result = sb.auth.get_user(token)
        user = result.user
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    # 5. Deactivation check — runs on every authenticated request.
    #    Uses a 60 s in-process cache to avoid a DB round-trip per call.
    #    Fail-open: _is_deactivated() returns False on DB error.
    if _is_deactivated(user.id):
        raise HTTPException(status_code=403, detail="Account suspended")

    return {
        "sub": user.id,
        "email": user.email,
        "user_metadata": user.user_metadata or {},
        "app_metadata": user.app_metadata or {},
    }


def get_user_id(payload: dict) -> str:
    return payload.get("sub", "")


def get_user_email(payload: dict) -> str:
    return payload.get("email", "")


def get_admin_email() -> str:
    return ADMIN_EMAIL


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

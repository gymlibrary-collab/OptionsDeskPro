import asyncio
import base64
import json
import logging
import os
import re as _re
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from services.auth_utils import (
    verify_token,
    verify_token_bootstrap,
    get_user_id,
    get_user_email,
    get_admin_email,
    ADMIN_EMAIL,
    _set_auth_cookies,
    _is_deactivated,
)
from services.db import get_supabase, new_auth_client
from services.rate_limit import rate_limit
from services import user_portfolio
from services.activity_logger import log_action, extract_ip

logger = logging.getLogger(__name__)

# ── Password-auth helpers ─────────────────────────────────────────────────────

MIN_PASSWORD_LENGTH = 12

_EMAIL_RE = _re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email_format(email: str) -> bool:
    """Return True if the string looks like a plausible email address."""
    return bool(_EMAIL_RE.match(email))


def _is_admin_or_staff_email(email: str) -> bool:
    """
    Return True if the (stripped, case-normalised) email belongs to the admin
    account or any active platform_staff member.

    Fails closed: a DB exception returns True so a privileged address is never
    accidentally permitted through the password auth paths.

    This is a synchronous function; callers inside async handlers must dispatch
    it via ``await asyncio.to_thread(_is_admin_or_staff_email, email)``.
    """
    normalized = email.strip().lower()
    # Admin email — no DB round-trip needed
    if normalized == ADMIN_EMAIL.lower():
        return True
    # platform_staff lookup — read-only, shared client is safe here
    # ilike gives a case-insensitive match; escape its wildcards so "a_b@x.com"
    # cannot match a staff address "a.b@x.com".
    pattern = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    try:
        sb = get_supabase()
        result = (
            sb.table("platform_staff")
            .select("id")
            .ilike("email", pattern)
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        return bool(result.data)
    except Exception as exc:
        logger.warning(
            "_is_admin_or_staff_email: DB lookup failed for %r, failing closed: %s",
            email,
            exc,
        )
        return True  # fail closed


def _is_supabase_service_error(exc: Exception) -> bool:
    """
    Return True when the exception indicates Supabase Auth is unreachable or
    has rate-limited the request (both conditions map to HTTP 503).

    Pure API failures — user already registered, bad credentials — are NOT
    service errors; callers should catch them and swallow (anti-enumeration).
    """
    # Network / transport layer
    type_names = {c.__name__ for c in type(exc).__mro__}
    if type_names & {
        "ConnectError",
        "TimeoutException",
        "ConnectTimeout",
        "ReadTimeout",
        "NetworkError",
        "TransportError",
        "RemoteProtocolError",
        "ConnectionError",
        "TimeoutError",
    }:
        return True
    # Supabase/GoTrue rate-limit and connectivity messages
    msg = str(exc).lower()
    return any(
        k in msg
        for k in (
            "connection refused",
            "failed to connect",
            "name or service not known",
            "unable to connect",
            "network unreachable",
            "max retries exceeded",
            "rate limit exceeded",
            "too many requests",
            "over_email_send_rate_limit",
            "email rate limit exceeded",
        )
    )

router = APIRouter()


async def _warm_watchlist(user_id: str) -> None:
    """Pre-fetch options chains for the user's watchlist symbols after login."""
    try:
        from services.db import get_supabase
        from services.market_data import get_options_chain
        sb = get_supabase()
        result = sb.table("user_watchlists").select("symbols").eq("user_id", user_id).maybe_single().execute()
        symbols: list[str] = []
        if result and result.data:
            symbols = result.data.get("symbols") or []
        if not symbols:
            return
        loop = asyncio.get_running_loop()
        await asyncio.gather(
            *[loop.run_in_executor(None, get_options_chain, sym, None) for sym in symbols],
            return_exceptions=True,
        )
        logger.info("Watchlist pre-warm done for user %s (%d symbols)", user_id, len(symbols))
    except Exception as exc:
        logger.debug("Watchlist pre-warm failed for user %s: %s", user_id, exc)

# The backend callback URL that Supabase redirects back to after Google OAuth
_FRONTEND_ORIGIN       = os.getenv("FRONTEND_ORIGIN", "https://optionscompass.up.railway.app")
_ADMIN_FRONTEND_ORIGIN = os.getenv("ADMIN_FRONTEND_ORIGIN", "")   # e.g. https://optionscompass-admin.up.railway.app
_CALLBACK_URL = f"{os.getenv('BACKEND_URL', 'https://optionscompass-backend.up.railway.app')}/api/auth/callback"


# ── Shared profile-sync helper ────────────────────────────────────────────────

async def _sync_profile(request: Request, user, access_token: str) -> dict:
    """
    Runs platform gate checks, upserts user_profiles, ensures portfolio, and
    logs activity. Returns the login-response dict.

    Raises HTTPException(403) on invite-only denial or account suspension.
    Raises HTTPException(503) on maintenance mode denial.

    This helper is called by:
      - POST /api/auth/login  (existing backward-compat endpoint)
      - GET  /api/auth/callback  (Google OAuth callback)
      - POST /api/auth/email-login  (email/password sign-in)
    """
    sb = get_supabase()
    user_id = user.id
    email = user.email
    user_metadata = user.user_metadata or {}

    # ── Platform-level gates (maintenance mode + invite-only) ─────────────────
    if email != ADMIN_EMAIL:
        from services.stripe_service import get_platform_settings
        settings = get_platform_settings()

        # Maintenance mode: block all non-admin, non-staff logins
        if settings.get("maintenance_mode", False):
            staff_check_maint = sb.table("platform_staff").select("id, is_active").eq("email", email).maybe_single().execute()
            is_platform_staff_maint = bool(staff_check_maint.data and staff_check_maint.data.get("is_active"))
            if not is_platform_staff_maint:
                raise HTTPException(
                    status_code=503,
                    detail="OptionsDesk is under maintenance. Please try again later.",
                )

        if settings.get("invite_only_mode", False):
            wl = sb.table("user_whitelist").select("id, role").eq("email", email).execute()
            if not wl.data:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied. This platform is currently invite-only. Contact the admin to request access.",
                )

    # ── Determine role ────────────────────────────────────────────────────────
    role = "admin" if email == ADMIN_EMAIL else "user"
    if email != ADMIN_EMAIL:
        try:
            wl_row = sb.table("user_whitelist").select("role").eq("email", email).maybe_single().execute()
            if wl_row and wl_row.data and wl_row.data.get("role"):
                role = wl_row.data["role"]
        except Exception:
            pass

    # ── Check if account is deactivated ──────────────────────────────────────
    try:
        existing_profile = sb.table("user_profiles").select("deactivated_at, onboarding_completed, onboarding_step, is_platform_staff").eq("id", user_id).maybe_single().execute()
        if existing_profile and existing_profile.data and existing_profile.data.get("deactivated_at") is not None:
            raise HTTPException(
                status_code=403,
                detail="Account suspended. Contact support.",
                headers={"X-Error-Code": "account_suspended"},
            )
    except HTTPException:
        raise
    except Exception:
        pass

    # ── Upsert user profile ───────────────────────────────────────────────────
    is_staff = email == ADMIN_EMAIL  # bootstrap: admin email always gets staff flag

    # Check if email is in platform_staff
    if not is_staff:
        try:
            staff_check = sb.table("platform_staff").select("id, is_active").eq("email", email).maybe_single().execute()
            if staff_check and staff_check.data and staff_check.data.get("is_active"):
                is_staff = True
        except Exception:
            pass

    upsert_data: dict = {
        "id":           user_id,
        "email":        email,
        "full_name":    user_metadata.get("full_name") or user_metadata.get("name"),
        "avatar_url":   user_metadata.get("avatar_url") or user_metadata.get("picture"),
        "role":         role,
        "is_active":    True,
        "last_seen_at": "now()",
    }
    if is_staff:
        upsert_data["is_platform_staff"] = True

    # Admin always has onboarding completed
    if email == ADMIN_EMAIL:
        upsert_data["onboarding_completed"] = True
        upsert_data["onboarding_step"] = "complete"

    try:
        sb.table("user_profiles").upsert(upsert_data, on_conflict="id").execute()
    except Exception:
        pass

    # ── Ensure portfolio exists ───────────────────────────────────────────────
    try:
        user_portfolio.ensure_portfolio(user_id)
    except Exception:
        pass

    # ── Log activity ──────────────────────────────────────────────────────────
    ip = extract_ip(request)
    try:
        user_portfolio.log_activity(user_id, email, ip)
    except Exception:
        pass
    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=email,
        action_type="login",
        detail={"email": email},
        ip_address=ip,
    ))

    # ── Read back onboarding state ────────────────────────────────────────────
    onboarding_completed = True  # default for admin
    onboarding_step = "complete"
    try:
        profile_result = sb.table("user_profiles").select("onboarding_completed, onboarding_step, deactivated_at").eq("id", user_id).maybe_single().execute()
        if profile_result and profile_result.data:
            onboarding_completed = profile_result.data.get("onboarding_completed", False)
            onboarding_step = profile_result.data.get("onboarding_step", "plan_selection")
    except Exception:
        pass

    # ── Legal acknowledgment gate ─────────────────────────────────────────────
    # Fail-open: if the DB check fails, return False so a legal DB hiccup does
    # not lock everyone out (same pattern as _is_deactivated() in auth_utils.py).
    pending_legal_acknowledgment = False
    try:
        from services.legal_service import get_pending_legal_acknowledgment
        pending_legal_acknowledgment = get_pending_legal_acknowledgment(user_id, email)
    except Exception as _legal_exc:
        logger.warning(
            "_sync_profile: legal acknowledgment check failed for user %s — failing open: %s",
            user_id, _legal_exc,
        )

    # Pre-warm the options chain cache for the user's watchlist symbols in the
    # background. The login response returns immediately; fetches run concurrently
    # so chains are ready by the time the user navigates to the Options Chain tab.
    asyncio.create_task(_warm_watchlist(user_id))

    return {
        "ok": True,
        "role": role,
        "email": email,
        "onboarding_completed": onboarding_completed,
        "onboarding_step": onboarding_step,
        "is_deactivated": False,
        "pending_legal_acknowledgment": pending_legal_acknowledgment,
    }


# ── Google OAuth initiation ───────────────────────────────────────────────────

@router.get("/auth/google")
async def auth_google(portal: str = "client"):
    """
    Initiates the Google OAuth flow by constructing a Supabase OAuth URL with
    the backend callback as the redirect_uri, then returning a 302 redirect.
    No auth required.

    portal: "client" (default) or "admin" — stored in a short-lived cookie so
    the callback knows which frontend URL to redirect to after authentication.
    """
    try:
        sb = new_auth_client()
        result = sb.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {"redirect_to": _CALLBACK_URL},
        })
        oauth_url = result.url
        if not oauth_url:
            raise ValueError("No OAuth URL returned by Supabase")
        response = RedirectResponse(url=oauth_url, status_code=302)
        secure = os.getenv("ENVIRONMENT", "").lower() != "development"
        # supabase-py stores the PKCE code_verifier in its in-memory client
        # storage (not on OAuthResponse). Read it out before the client is GC'd
        # and persist it in a short-lived cookie for the stateless callback request.
        _sk = getattr(sb.auth, "_storage_key", "supabase.auth.token")
        code_verifier = sb.auth._storage.get_item(f"{_sk}-code-verifier")
        if code_verifier:
            response.set_cookie(
                "pkce_code_verifier",
                code_verifier,
                httponly=True,
                secure=secure,
                max_age=600,
                samesite="lax",
                path="/",
            )
        # Remember which portal initiated the flow so the callback can redirect
        # to the right frontend URL (client portal vs admin portal).
        if portal == "admin" and _ADMIN_FRONTEND_ORIGIN:
            response.set_cookie(
                "auth_portal",
                "admin",
                httponly=True,
                secure=secure,
                max_age=600,
                samesite="lax",
                path="/",
            )
        return response
    except Exception as exc:
        logger.error("auth_google: failed to build OAuth URL: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to initiate Google sign-in")


# ── Google OAuth callback ─────────────────────────────────────────────────────

@router.get("/auth/callback")
async def auth_callback(request: Request, code: str, state: str = None):
    """
    Receives the authorization code from Google (via Supabase), exchanges it for
    tokens server-side, syncs the user profile, sets httpOnly cookies, and
    redirects to the frontend root.

    All error conditions redirect to the frontend with an auth_error query param
    rather than returning a JSON 4xx, because the browser address bar is on the
    backend callback URL at this point and a JSON error would show a blank screen.
    No auth required.
    """
    try:
        sb = new_auth_client()
        code_verifier = request.cookies.get("pkce_code_verifier")
        exchange_params: dict = {"auth_code": code}
        if code_verifier:
            exchange_params["code_verifier"] = code_verifier
        result = sb.auth.exchange_code_for_session(exchange_params)
    except Exception as exc:
        logger.warning("auth_callback: code exchange failed: %s", exc)
        return RedirectResponse(
            url=f"{_FRONTEND_ORIGIN}/?auth_error=callback_failed",
            status_code=302,
        )

    session = result.session
    user = result.user if hasattr(result, "user") else (session.user if session else None)
    if not session or not user:
        logger.warning("auth_callback: no session/user in exchange result")
        return RedirectResponse(
            url=f"{_FRONTEND_ORIGIN}/?auth_error=callback_failed",
            status_code=302,
        )

    try:
        await _sync_profile(request, user, session.access_token)
    except HTTPException as exc:
        # Map specific HTTP errors to redirect query params
        if exc.status_code == 403:
            error_code = "account_suspended"
            # Distinguish invite-only from suspension by message content
            if "invite-only" in exc.detail.lower():
                error_code = "invite_only"
            return RedirectResponse(
                url=f"{_FRONTEND_ORIGIN}/?auth_error={error_code}",
                status_code=302,
            )
        if exc.status_code == 503:
            return RedirectResponse(
                url=f"{_FRONTEND_ORIGIN}/?auth_error=maintenance",
                status_code=302,
            )
        return RedirectResponse(
            url=f"{_FRONTEND_ORIGIN}/?auth_error=callback_failed",
            status_code=302,
        )
    except Exception as exc:
        logger.error("auth_callback: _sync_profile failed: %s", exc)
        return RedirectResponse(
            url=f"{_FRONTEND_ORIGIN}/?auth_error=callback_failed",
            status_code=302,
        )

    # Choose redirect destination: admin portal if the flow was initiated from
    # there (auth_portal=admin cookie) and ADMIN_FRONTEND_ORIGIN is configured.
    import urllib.parse
    portal_cookie = request.cookies.get("auth_portal", "client")
    if portal_cookie == "admin" and _ADMIN_FRONTEND_ORIGIN:
        target_origin = _ADMIN_FRONTEND_ORIGIN
    else:
        target_origin = _FRONTEND_ORIGIN

    # Redirect to the frontend with tokens in the URL fragment so the frontend
    # can store them in localStorage and send them as Bearer headers.  This
    # bypasses cross-domain cookie blocking (Firefox ETP, Safari ITP, etc.)
    # which would prevent SameSite=None cookies from being sent on XHR requests
    # from optionscompass.up.railway.app to optionscompass-backend.up.railway.app.
    at = urllib.parse.quote(session.access_token, safe='')
    rt = urllib.parse.quote(session.refresh_token, safe='')
    response = RedirectResponse(
        url=f"{target_origin}/#sb_access_token={at}&sb_refresh_token={rt}",
        status_code=302,
    )
    # Clear the portal cookie — it's single-use.
    response.delete_cookie("auth_portal", path="/")
    # Also set cookies so the same flow works if the app is ever served from the
    # same domain as the backend (same-origin deployment).
    _set_auth_cookies(response, session.access_token, session.refresh_token)
    return response


# ── Session endpoint ──────────────────────────────────────────────────────────

@router.get("/auth/session")
async def get_session(request: Request, payload: dict = Depends(verify_token)):
    """
    Returns the complete user context needed by the frontend to render the
    authenticated state. Replaces supabase.auth.getSession() on the frontend.
    Auth required via cookie (sb_access_token) or Bearer header fallback.
    """
    sb = get_supabase()
    user_id = get_user_id(payload)
    email = get_user_email(payload)

    # Read user profile from DB
    profile_data = {}
    try:
        result = sb.table("user_profiles").select(
            "full_name, avatar_url, role, onboarding_completed, onboarding_step, subscription_tier"
        ).eq("id", user_id).maybe_single().execute()
        if result.data:
            profile_data = result.data
    except Exception:
        pass

    # Derive is_admin using the same logic as require_admin
    is_admin = False
    if email == ADMIN_EMAIL:
        is_admin = True
    else:
        meta = payload.get("user_metadata", {}) or {}
        app_meta = payload.get("app_metadata", {}) or {}
        if meta.get("role") == "admin" or app_meta.get("role") == "admin":
            is_admin = True
        elif profile_data.get("role") == "admin":
            is_admin = True

    # Legal acknowledgment check — fail-open
    pending_legal_acknowledgment = False
    try:
        from services.legal_service import get_pending_legal_acknowledgment
        pending_legal_acknowledgment = get_pending_legal_acknowledgment(user_id, email)
    except Exception:
        pass

    return {
        "user_id": user_id,
        "email": email,
        "full_name": profile_data.get("full_name"),
        "avatar_url": profile_data.get("avatar_url"),
        "role": profile_data.get("role", "user"),
        "is_admin": is_admin,
        "onboarding_completed": profile_data.get("onboarding_completed", True),
        "onboarding_step": profile_data.get("onboarding_step", "complete"),
        "pending_legal_acknowledgment": pending_legal_acknowledgment,
        "subscription_tier": profile_data.get("subscription_tier", "free"),
    }


# ── Subscriber sign-up ───────────────────────────────────────────────────────

class SignUpRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/signup", dependencies=[Depends(rate_limit("signup", 5, 3600))])
async def signup(body: SignUpRequest):
    """
    Create a new subscriber account with email and password.

    Returns a uniform 200 response whether or not the email already exists
    (ADR-0017 — anti-enumeration).  Admin and active platform_staff emails are
    answered with the same neutral response and nothing is created.  No auth required.
    """
    # ── Server-side validation ────────────────────────────────────────────────
    if not body.email.strip() or not body.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if not _validate_email_format(body.email.strip()):
        raise HTTPException(status_code=400, detail="Email and password are required.")

    # ── Admin/staff guard (before the Supabase call) ──────────────────────────
    # Answered exactly like any other address so outsiders cannot learn which
    # emails belong to staff; nothing is created or sent.
    if await asyncio.to_thread(_is_admin_or_staff_email, body.email):
        logger.warning("signup: refused for admin/staff address %r", body.email)
        return {"ok": True, "detail": "check_email"}

    # ── Supabase sign-up on a fresh unshared auth client ─────────────────────
    try:
        sb = new_auth_client()
        await asyncio.to_thread(
            lambda: sb.auth.sign_up({
                "email": body.email.strip(),
                "password": body.password,
                "options": {"email_redirect_to": f"{_FRONTEND_ORIGIN}/"},
            })
        )
    except Exception as exc:
        if _is_supabase_service_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Authentication service unavailable. Please try again shortly.",
            )
        # Swallow API errors (user already registered, weak password from Supabase, etc.)
        # — do not confirm or deny whether the address is in use (ADR-0017).
        logger.info("signup: Supabase error swallowed for %r: %s", body.email, exc)

    return {"ok": True, "detail": "check_email"}


# ── Password-reset request ────────────────────────────────────────────────────

class ResetRequestBody(BaseModel):
    email: str


@router.post("/auth/reset-request", dependencies=[Depends(rate_limit("reset-request", 3, 900))])
async def reset_request(body: ResetRequestBody):
    """
    Trigger a Supabase password-reset email.

    Returns a uniform 200 response regardless of whether the email is registered
    (no account enumeration).  Admin and active platform_staff emails get the
    same neutral response and no email is sent.  No auth required.
    """
    # ── Server-side validation ────────────────────────────────────────────────
    if not body.email.strip():
        raise HTTPException(status_code=400, detail="Please enter your email address.")

    # ── Admin/staff guard (before the Supabase call) ──────────────────────────
    if await asyncio.to_thread(_is_admin_or_staff_email, body.email):
        logger.warning("reset-request: refused for admin/staff address %r", body.email)
        return {"ok": True, "detail": "check_email"}

    # ── Supabase reset email on a fresh unshared auth client ──────────────────
    try:
        sb = new_auth_client()
        await asyncio.to_thread(
            lambda: sb.auth.reset_password_for_email(
                body.email.strip(),
                options={"redirect_to": f"{_FRONTEND_ORIGIN}/reset-password"},
            )
        )
    except Exception as exc:
        if _is_supabase_service_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Authentication service unavailable. Please try again shortly.",
            )
        # Swallow API errors (unknown email, rate limit below 503 threshold, etc.)
        logger.info("reset_request: Supabase error swallowed for %r: %s", body.email, exc)

    return {"ok": True, "detail": "check_email"}


# ── Email/password sign-in ────────────────────────────────────────────────────

class EmailLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/email-login", dependencies=[Depends(rate_limit("email-login", 10, 900))])
async def email_login(request: Request, body: EmailLoginRequest):
    """
    Exchanges email + password for Supabase tokens, runs _sync_profile, sets
    httpOnly cookies, and returns the session context.
    No auth required (credentials are in the request body).
    """
    # Admin/staff guard — privileged accounts cannot use password login
    if await asyncio.to_thread(_is_admin_or_staff_email, body.email):
        raise HTTPException(
            status_code=403,
            detail="Password login is not available for this account. Use Google sign-in.",
            headers={"X-Error-Code": "staff_only_google"},
        )

    try:
        sb = new_auth_client()
        result = await asyncio.to_thread(
            lambda: sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
        )
    except Exception as exc:
        if _is_supabase_service_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Authentication service unavailable. Please try again shortly.",
            )
        logger.warning("email_login: Supabase rejected credentials for %s: %s", body.email, exc)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    session = result.session
    user = result.user
    if not session or not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Run profile sync — raises HTTPException on suspension/maintenance/invite-only
    profile_result = await _sync_profile(request, user, session.access_token)

    # Include tokens in the response body so the frontend can store them in
    # localStorage and use them as Bearer headers (cross-domain cookie fallback).
    profile_result["access_token"] = session.access_token
    profile_result["refresh_token"] = session.refresh_token

    response = JSONResponse(content=profile_result)
    _set_auth_cookies(response, session.access_token, session.refresh_token)
    return response


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
async def on_login(request: Request, payload: dict = Depends(verify_token_bootstrap)):
    """
    Retained for backward compatibility. Accepts the verified token payload from
    verify_token (cookie or Bearer header), runs _sync_profile, and returns the
    same response shape as before.
    """
    sb = get_supabase()
    user_id = get_user_id(payload)
    email = get_user_email(payload)

    # Build a minimal user-like object from the JWT payload so _sync_profile
    # can read user.id, user.email, and user.user_metadata consistently.
    class _UserProxy:
        def __init__(self, uid, em, meta):
            self.id = uid
            self.email = em
            self.user_metadata = meta

    user_proxy = _UserProxy(
        user_id,
        email,
        payload.get("user_metadata", {}) or {},
    )

    # Fetch the access token from the cookie or header for profile sync context
    access_token = request.cookies.get("sb_access_token") or ""
    if not access_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            access_token = auth_header[7:]

    return await _sync_profile(request, user_proxy, access_token)


# ── Token refresh ────────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/auth/refresh")
async def refresh_token(body: RefreshRequest):
    """
    Exchange a Supabase refresh token for a new access/refresh token pair.
    Called automatically by the frontend interceptor when a 401 is received,
    so the user is never logged out just because the 1-hour access token expired.
    No auth required — the refresh token IS the credential here.
    """
    try:
        sb = new_auth_client()
        result = sb.auth.refresh_session(body.refresh_token)
        session = result.session if hasattr(result, "session") else result
        if not session or not getattr(session, "access_token", None):
            raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
        response = JSONResponse(content={
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
        })
        _set_auth_cookies(response, session.access_token, session.refresh_token)
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("refresh_token: Supabase refresh failed: %s", exc)
        raise HTTPException(status_code=401, detail="Session refresh failed")


# ── Logout ───────────────────────────────────────────────────────────────────

@router.post("/auth/logout")
async def on_logout(request: Request, payload: dict = Depends(verify_token_bootstrap)):
    """
    Calls Supabase sign_out to invalidate the server-side session, logs the
    logout event, and clears both auth cookies on the response.
    """
    user_id = get_user_id(payload)
    email = get_user_email(payload)

    # Attempt Supabase server-side session invalidation; log but do not re-raise
    # on failure — the client-side cookie is cleared regardless.
    access_token = request.cookies.get("sb_access_token") or ""
    if access_token:
        try:
            sb = new_auth_client()
            sb.auth.sign_out(access_token)
        except Exception as exc:
            logger.warning("on_logout: Supabase sign_out failed for user %s: %s", user_id, exc)

    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=email,
        action_type="logout",
        detail={},
        ip_address=extract_ip(request),
    ))

    response = JSONResponse(content={"ok": True})
    # Clear cookies by setting Max-Age=0
    is_dev = os.getenv("ENVIRONMENT", "").lower() == "development"
    secure = not is_dev
    for cookie_name in ("sb_access_token", "sb_refresh_token"):
        response.set_cookie(
            key=cookie_name,
            value="",
            httponly=True,
            secure=secure,
            samesite="lax",
            path="/",
            max_age=0,
        )
    return response


# ── Update password ──────────────────────────────────────────────────────────

# A session counts as proof of mailbox ownership only shortly after the user
# followed an emailed link.  Supabase records how a session was established in
# the access token's `amr` claim.
_MAILBOX_PROOF_METHODS = {"recovery", "otp", "magiclink", "invite"}
_MAILBOX_PROOF_MAX_AGE_S = 15 * 60


def _token_claims(token: str) -> dict:
    """Decode a JWT payload without verifying it; callers verify the token first."""
    try:
        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        claims = json.loads(base64.urlsafe_b64decode(part))
        return claims if isinstance(claims, dict) else {}
    except Exception:
        return {}


def _has_recent_mailbox_proof(claims: dict) -> bool:
    now = time.time()
    for entry in claims.get("amr") or []:
        if not isinstance(entry, dict):
            continue
        ts = entry.get("timestamp")
        if (
            entry.get("method") in _MAILBOX_PROOF_METHODS
            and isinstance(ts, (int, float))
            and 0 <= now - ts <= _MAILBOX_PROOF_MAX_AGE_S
        ):
            return True
    return False


class UpdatePasswordRequest(BaseModel):
    password: str
    current_password: str | None = None


@router.post("/auth/update-password", dependencies=[Depends(rate_limit("update-password", 5, 900))])
async def update_password(
    request: Request,
    body: UpdatePasswordRequest,
    payload: dict = Depends(verify_token),
):
    """
    Set a new password for the calling user.

    Two callers:
      - ResetPasswordPage, right after the emailed recovery link was exchanged.
        That session proves mailbox ownership, so no current password is asked.
      - Settings > Change Password, from an ordinary signed-in session.  That
        must supply the current password: a session token alone (stolen, or
        left open on a shared computer) must not be enough to take over the
        account by replacing its password.

    Admin and active platform_staff accounts may not set a password (Story 6).
    """
    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")

    # Identify the caller.  The reset page sends its recovery session as a
    # Bearer token; verify_token prefers the cookie, which on a shared browser
    # can belong to a different account, so an explicit Bearer token wins here.
    auth_header = request.headers.get("Authorization", "")
    bearer = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
    if bearer:
        try:
            result = await asyncio.to_thread(get_supabase().auth.get_user, bearer)
            user = result.user
        except Exception:
            user = None
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        if user.id != get_user_id(payload) and await asyncio.to_thread(_is_deactivated, user.id):
            raise HTTPException(status_code=403, detail="Account suspended")
        user_id, email, token = user.id, user.email or "", bearer
    else:
        user_id, email = get_user_id(payload), get_user_email(payload)
        token = (
            getattr(request.state, "new_access_token", None)
            or request.cookies.get("sb_access_token")
            or ""
        )

    # Admin/staff guard — privileged accounts must never gain a password identity.
    if await asyncio.to_thread(_is_admin_or_staff_email, email):
        raise HTTPException(
            status_code=403,
            detail="Password login is not available for this account. Use Google sign-in.",
            headers={"X-Error-Code": "staff_only_google"},
        )

    if not _has_recent_mailbox_proof(_token_claims(token)):
        if not body.current_password:
            raise HTTPException(
                status_code=400,
                detail="Current password is required.",
                headers={"X-Error-Code": "current_password_required"},
            )
        try:
            sb = new_auth_client()
            await asyncio.to_thread(
                lambda: sb.auth.sign_in_with_password({"email": email, "password": body.current_password})
            )
        except Exception as exc:
            if _is_supabase_service_error(exc):
                raise HTTPException(
                    status_code=503,
                    detail="Authentication service unavailable. Please try again shortly.",
                )
            raise HTTPException(
                status_code=403,
                detail=(
                    "Current password is incorrect. If you sign in with Google and have "
                    "not set a password, sign out and use 'Forgot password?'."
                ),
                headers={"X-Error-Code": "current_password_invalid"},
            )

    try:
        await asyncio.to_thread(
            get_supabase().auth.admin.update_user_by_id, user_id, {"password": body.password}
        )
    except Exception as exc:
        logger.warning("update_password: failed for user %s: %s", user_id, exc)
        raise HTTPException(status_code=400, detail="Password update failed. Please try again.")
    return {"ok": True}


# ── Complete onboarding ───────────────────────────────────────────────────────

@router.post("/auth/complete-onboarding")
async def complete_onboarding(payload: dict = Depends(verify_token)):
    """Mark the user's onboarding as complete (free-tier path, no Stripe needed)."""
    sb = get_supabase()
    user_id = get_user_id(payload)
    try:
        sb.table("user_profiles").update({
            "onboarding_completed": True,
            "onboarding_step": "complete",
        }).eq("id", user_id).execute()
    except Exception:
        pass
    return {"ok": True}


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/auth/me")
async def get_me(payload: dict = Depends(verify_token)):
    """Return current user's profile."""
    sb = get_supabase()
    user_id = get_user_id(payload)
    result = sb.table("user_profiles").select("*").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


# ── Entitlements ──────────────────────────────────────────────────────────────

@router.get("/auth/entitlements")
async def get_entitlements(payload: dict = Depends(verify_token)):
    """
    Return the computed entitlement set for the requesting user.
    Reads from subscriptions + plans (via cached tier_limits service).
    Effective tier: admin_override > payment degradation > subscriptions.tier_key.
    """
    user_id = get_user_id(payload)
    from services.entitlements import compute_entitlements
    return compute_entitlements(user_id)


# ── PnL history ───────────────────────────────────────────────────────────────

@router.get("/auth/pnl-history")
async def get_pnl_history(payload: dict = Depends(verify_token)):
    """Return last 90 days of P&L snapshots for the current user."""
    sb = get_supabase()
    user_id = get_user_id(payload)
    rows = sb.table("pnl_snapshots").select("*")\
        .eq("user_id", user_id)\
        .order("snapshot_date", desc=False)\
        .limit(90)\
        .execute().data
    return rows


# ── Account deletion ──────────────────────────────────────────────────────────

class DeleteAccountRequest(BaseModel):
    confirmation: str


@router.delete("/auth/account")
async def delete_account(
    body: DeleteAccountRequest,
    payload: dict = Depends(verify_token),
):
    """
    Delete the subscriber's account.
    Sequence: cancel Stripe subscription (if any) → delete Supabase auth user.
    Requires confirmation='DELETE'.
    """
    if body.confirmation != "DELETE":
        raise HTTPException(
            status_code=400,
            detail="Confirmation string must be exactly 'DELETE'.",
        )

    user_id = get_user_id(payload)
    sb = get_supabase()

    # Step 1: Cancel Stripe subscription if active
    sub_result = sb.table("subscriptions").select("stripe_subscription_id").eq("user_id", user_id).maybe_single().execute()
    stripe_sub_id = sub_result.data.get("stripe_subscription_id") if sub_result.data else None

    if stripe_sub_id:
        try:
            from services.stripe_service import _get_stripe
            stripe = _get_stripe()
            stripe.Subscription.cancel(stripe_sub_id)
        except Exception as e:
            # Allow deletion to proceed only when Stripe itself tells us the
            # subscription is already cancelled (idempotent retry case — F-009).
            already_cancelled = False
            try:
                import stripe as _stripe_mod
                if isinstance(e, _stripe_mod.error.InvalidRequestError):
                    msg = str(e).lower()
                    if "cancel" in msg or "no such subscription" in msg:
                        already_cancelled = True
            except Exception:
                pass

            if not already_cancelled:
                raise HTTPException(
                    status_code=503,
                    detail="Cannot delete account: subscription cancellation unavailable; contact support.",
                )

    # Step 2: Delete the Supabase Auth user (CASCADE deletes all user data)
    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Deletion partially failed at step: supabase_delete. Contact support.",
        )

    return {"ok": True}

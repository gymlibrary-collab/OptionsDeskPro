import asyncio
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from services.auth_utils import (
    verify_token,
    get_user_id,
    get_user_email,
    get_admin_email,
    ADMIN_EMAIL,
    _set_auth_cookies,
)
from services.db import get_supabase
from services import user_portfolio
from services.activity_logger import log_action, extract_ip

logger = logging.getLogger(__name__)

router = APIRouter()

# The backend callback URL that Supabase redirects back to after Google OAuth
_FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://optionscompass.up.railway.app")
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
async def auth_google():
    """
    Initiates the Google OAuth flow by constructing a Supabase OAuth URL with
    the backend callback as the redirect_uri, then returning a 302 redirect.
    No auth required.
    """
    try:
        sb = get_supabase()
        result = sb.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {"redirect_to": _CALLBACK_URL},
        })
        oauth_url = result.url
        if not oauth_url:
            raise ValueError("No OAuth URL returned by Supabase")
        response = RedirectResponse(url=oauth_url, status_code=302)
        # supabase-py stores the PKCE code_verifier in its in-memory client
        # storage (not on OAuthResponse). Read it out before the client is GC'd
        # and persist it in a short-lived cookie for the stateless callback request.
        _sk = getattr(sb.auth, "_storage_key", "supabase.auth.token")
        code_verifier = sb.auth._storage.get_item(f"{_sk}-code-verifier")
        if code_verifier:
            secure = os.getenv("ENVIRONMENT", "").lower() != "development"
            response.set_cookie(
                "pkce_code_verifier",
                code_verifier,
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
        sb = get_supabase()
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

    # Redirect to the frontend with tokens in the URL fragment so the frontend
    # can store them in localStorage and send them as Bearer headers.  This
    # bypasses cross-domain cookie blocking (Firefox ETP, Safari ITP, etc.)
    # which would prevent SameSite=None cookies from being sent on XHR requests
    # from optionscompass.up.railway.app to optionscompass-backend.up.railway.app.
    import urllib.parse
    at = urllib.parse.quote(session.access_token, safe='')
    rt = urllib.parse.quote(session.refresh_token, safe='')
    response = RedirectResponse(
        url=f"{_FRONTEND_ORIGIN}/#sb_access_token={at}&sb_refresh_token={rt}",
        status_code=302,
    )
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


# ── Email/password sign-in ────────────────────────────────────────────────────

class EmailLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/email-login")
async def email_login(request: Request, body: EmailLoginRequest):
    """
    Exchanges email + password for Supabase tokens, runs _sync_profile, sets
    httpOnly cookies, and returns the session context.
    No auth required (credentials are in the request body).
    """
    try:
        sb = get_supabase()
        result = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as exc:
        # Supabase AuthApiError maps to 401
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
async def on_login(request: Request, payload: dict = Depends(verify_token)):
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
        sb = get_supabase()
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
async def on_logout(request: Request, payload: dict = Depends(verify_token)):
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
            sb = get_supabase()
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

class UpdatePasswordRequest(BaseModel):
    password: str

@router.post("/auth/update-password")
async def update_password(
    request: Request,
    body: UpdatePasswordRequest,
    payload: dict = Depends(verify_token),
):
    """Proxy for Supabase password update — keeps supabase-js out of the browser."""
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    user_id = get_user_id(payload)
    try:
        sb = get_supabase()
        sb.auth.admin.update_user_by_id(user_id, {"password": body.password})
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

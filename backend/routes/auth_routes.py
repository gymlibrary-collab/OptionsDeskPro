import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from services.auth_utils import verify_token, get_user_id, get_user_email, ADMIN_EMAIL
from services.db import get_supabase
from services import user_portfolio
from services.activity_logger import log_action, extract_ip

router = APIRouter()


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
async def on_login(request: Request, payload: dict = Depends(verify_token)):
    """
    Called by frontend after Google sign-in (or email/password sign-in).
    Behaviour change from pre-SaaS:
      - whitelist check is conditional on platform_settings.invite_only_mode (ADR-0005)
      - if invite_only_mode = false (default), any authenticated user may log in
      - checks deactivated_at to prevent suspended accounts from logging in
      - returns onboarding_completed and onboarding_step so the frontend can route appropriately
    """
    sb = get_supabase()
    user_id = get_user_id(payload)
    email = get_user_email(payload)

    # ── Platform-level gates (maintenance mode + invite-only) ─────────────────
    if email != ADMIN_EMAIL:
        from services.stripe_service import get_platform_settings
        settings = get_platform_settings()

        # Maintenance mode: block all non-admin, non-staff logins
        if settings.get("maintenance_mode", False):
            # Allow platform staff through even in maintenance mode
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
    meta = payload.get("user_metadata", {}) or {}
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
        "id":         user_id,
        "email":      email,
        "full_name":  meta.get("full_name") or meta.get("name"),
        "avatar_url": meta.get("avatar_url") or meta.get("picture"),
        "role":       role,
        "is_active":  True,
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
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
    try:
        user_portfolio.log_activity(user_id, email, ip)
    except Exception:
        pass
    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=email,
        action_type="login",
        detail={"email": email},
        ip_address=extract_ip(request),
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
        import logging as _logging
        _logging.getLogger(__name__).warning(
            "auth/login: legal acknowledgment check failed for user %s — failing open: %s",
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


# ── Logout ───────────────────────────────────────────────────────────────────

@router.post("/auth/logout")
async def on_logout(request: Request, payload: dict = Depends(verify_token)):
    """
    Record a logout event in user_action_log, then return ok.
    The frontend calls supabase.auth.signOut() after this to invalidate the session.
    """
    user_id = get_user_id(payload)
    email = get_user_email(payload)
    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=email,
        action_type="logout",
        detail={},
        ip_address=extract_ip(request),
    ))
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

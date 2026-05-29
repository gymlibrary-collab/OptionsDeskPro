from fastapi import APIRouter, Depends, HTTPException, Request
from services.auth_utils import verify_token, get_user_id, get_user_email, ADMIN_EMAIL
from services.db import get_supabase
from services import user_portfolio

router = APIRouter()


@router.post("/auth/login")
async def on_login(request: Request, payload: dict = Depends(verify_token)):
    """Called by frontend after Google sign-in. Checks whitelist, creates/updates profile, logs activity."""
    sb = get_supabase()
    user_id = get_user_id(payload)
    email = get_user_email(payload)

    # Check whitelist (admin email always allowed)
    if email != ADMIN_EMAIL:
        wl = sb.table("user_whitelist").select("id").eq("email", email).execute()
        if not wl.data:
            raise HTTPException(
                status_code=403,
                detail="Access denied. Contact the admin to request access.",
            )

    # Upsert user profile
    meta = payload.get("user_metadata", {}) or {}
    role = "admin" if email == ADMIN_EMAIL else "user"
    sb.table("user_profiles").upsert({
        "id": user_id,
        "email": email,
        "full_name": meta.get("full_name") or meta.get("name"),
        "avatar_url": meta.get("avatar_url") or meta.get("picture"),
        "role": role,
        "is_active": True,
        "last_seen_at": "now()",
    }, on_conflict="id").execute()

    # Ensure portfolio exists
    user_portfolio.ensure_portfolio(user_id)

    # Log activity
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
    user_portfolio.log_activity(user_id, email, ip)

    return {"ok": True, "role": role, "email": email}


@router.get("/auth/me")
async def get_me(payload: dict = Depends(verify_token)):
    """Return current user's profile."""
    sb = get_supabase()
    user_id = get_user_id(payload)
    result = sb.table("user_profiles").select("*").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


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

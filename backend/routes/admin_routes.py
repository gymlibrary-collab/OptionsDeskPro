from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth_utils import verify_token, require_admin, get_user_id
from services.db import get_supabase

router = APIRouter()


def admin_required(payload: dict = Depends(verify_token)):
    require_admin(payload)
    return payload


@router.get("/admin/users")
async def list_users(payload: dict = Depends(admin_required)):
    """List all user profiles with their portfolio value and last login."""
    sb = get_supabase()
    profiles = sb.table("user_profiles").select("*").order("created_at").execute().data
    portfolios = {p["user_id"]: p for p in sb.table("portfolios").select("*").execute().data}
    activity = {a["user_id"]: a for a in sb.table("activity_log").select("*").execute().data}
    result = []
    for p in profiles:
        uid = p["id"]
        result.append({
            **p,
            "cash": portfolios.get(uid, {}).get("cash"),
            "last_login_at": activity.get(uid, {}).get("last_login_at"),
            "login_count_today": activity.get(uid, {}).get("login_count", 0),
        })
    return result


@router.get("/admin/whitelist")
async def get_whitelist(payload: dict = Depends(admin_required)):
    sb = get_supabase()
    return sb.table("user_whitelist").select("*").order("added_at", desc=True).execute().data


class WhitelistAdd(BaseModel):
    email: str
    note: str = ""


@router.post("/admin/whitelist")
async def add_to_whitelist(body: WhitelistAdd, payload: dict = Depends(admin_required)):
    sb = get_supabase()
    try:
        sb.table("user_whitelist").insert({
            "email": body.email.lower().strip(),
            "added_by": get_user_id(payload),
            "note": body.note,
        }).execute()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Email already whitelisted")
        raise
    return {"ok": True}


class UserInvite(BaseModel):
    email: str
    role: str = "user"
    note: str = ""


@router.post("/admin/users/invite")
async def invite_user(body: UserInvite, payload: dict = Depends(admin_required)):
    """Add a user to the whitelist with a role. Only @gmail.com addresses accepted."""
    email = body.email.lower().strip()
    role = body.role if body.role in ("user", "admin") else "user"

    if not email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=422,
            detail="Only @gmail.com addresses are accepted (Google auth only).",
        )

    sb = get_supabase()
    try:
        sb.table("user_whitelist").insert({
            "email": email,
            "added_by": get_user_id(payload),
            "note": body.note or f"Invited as {role}",
            "role": role,
        }).execute()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Email already in the system.")
        raise

    # If the user already has a profile (previously logged in), update their role immediately
    try:
        sb.table("user_profiles").update({"role": role}).eq("email", email).execute()
    except Exception:
        pass

    return {"ok": True, "email": email, "role": role}


class RoleUpdate(BaseModel):
    role: str


@router.patch("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, body: RoleUpdate, payload: dict = Depends(admin_required)):
    """Change an existing user's role."""
    role = body.role if body.role in ("user", "admin") else "user"
    sb = get_supabase()
    result = sb.table("user_profiles").update({"role": role}).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    # Keep whitelist entry consistent
    email_rows = sb.table("user_profiles").select("email").eq("id", user_id).execute()
    if email_rows.data:
        try:
            sb.table("user_whitelist").update({"role": role}).eq(
                "email", email_rows.data[0]["email"]
            ).execute()
        except Exception:
            pass
    return {"ok": True, "role": role}


@router.delete("/admin/whitelist/{email}")
async def remove_from_whitelist(email: str, payload: dict = Depends(admin_required)):
    sb = get_supabase()
    sb.table("user_whitelist").delete().eq("email", email).execute()
    return {"ok": True}


@router.patch("/admin/users/{user_id}/deactivate")
async def deactivate_user(user_id: str, payload: dict = Depends(admin_required)):
    sb = get_supabase()
    sb.table("user_profiles").update({"is_active": False}).eq("id", user_id).execute()
    return {"ok": True}


@router.get("/admin/activity")
async def get_activity_log(payload: dict = Depends(admin_required)):
    """Today's login activity for all users."""
    sb = get_supabase()
    from datetime import date
    rows = sb.table("activity_log").select("*")\
        .eq("log_date", date.today().isoformat())\
        .order("last_login_at", desc=True)\
        .execute().data
    return rows


@router.get("/admin/stats")
async def get_stats(payload: dict = Depends(admin_required)):
    """Aggregate stats: total users, active today, total orders, leaderboard."""
    sb = get_supabase()
    from datetime import date
    users = sb.table("user_profiles").select("id, email, role", count="exact").execute()
    active_today = sb.table("activity_log").select("user_id", count="exact")\
        .eq("log_date", date.today().isoformat()).execute()
    orders = sb.table("orders").select("user_id, action, price, quantity, status", count="exact").execute()

    # Leaderboard: total P&L per user from latest snapshot
    snapshots = sb.table("pnl_snapshots").select("user_id, total_pnl, portfolio_value")\
        .order("snapshot_date", desc=True).execute().data
    seen = {}
    leaderboard = []
    for s in snapshots:
        uid = s["user_id"]
        if uid not in seen:
            seen[uid] = s
            leaderboard.append(s)

    # Join with profiles
    profiles = {p["id"]: p for p in sb.table("user_profiles").select("id, email, full_name").execute().data}
    for entry in leaderboard:
        p = profiles.get(entry["user_id"], {})
        entry["email"] = p.get("email")
        entry["full_name"] = p.get("full_name")
    leaderboard.sort(key=lambda x: x.get("total_pnl", 0), reverse=True)

    return {
        "total_users": users.count,
        "active_today": active_today.count,
        "total_orders": orders.count,
        "leaderboard": leaderboard[:10],
    }

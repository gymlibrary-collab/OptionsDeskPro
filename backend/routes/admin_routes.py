import asyncio
import time
import os
import math
import httpx
import yfinance as yf
from datetime import datetime, timezone, date as _date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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
    try:
        portfolios = {p["user_id"]: p for p in sb.table("portfolios").select("*").execute().data}
    except Exception:
        portfolios = {}
    try:
        activity = {a["user_id"]: a for a in sb.table("activity_log").select("*").execute().data}
    except Exception:
        activity = {}
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


class PlatformSettingsUpdate(BaseModel):
    ai_features_enabled: Optional[bool] = None


@router.patch("/admin/platform-settings")
async def update_platform_settings(
    body: PlatformSettingsUpdate,
    payload: dict = Depends(admin_required),
):
    """Toggle platform-level feature flags. Admin only."""
    sb = get_supabase()
    update_payload: dict = {"updated_at": "now()"}
    if body.ai_features_enabled is not None:
        update_payload["ai_features_enabled"] = body.ai_features_enabled
    sb.table("platform_settings").update(update_payload).eq("id", 1).execute()
    from services.stripe_service import invalidate_settings_cache
    invalidate_settings_cache()
    return {"ok": True}


# ── Health Check ───────────────────────────────────────────────────────────────

@router.get("/admin/health-check")
async def health_check(payload: dict = Depends(admin_required)):
    """
    Run all five component probes concurrently. Each probe is wrapped in
    asyncio.wait_for with a 10-second timeout. Results are assembled into
    a normalised response. No caching — every call executes live probes.
    """
    overall_start = datetime.now(timezone.utc)

    async def probe_backend() -> dict:
        # Self-referential: always healthy if this code is running.
        return {
            "name": "Backend API",
            "status": "healthy",
            "response_time_ms": 0,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "error": None,
        }

    async def probe_supabase() -> dict:
        name = "Supabase Database"
        t0 = time.monotonic()
        checked_at = datetime.now(timezone.utc).isoformat()
        try:
            sb = get_supabase()
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: sb.table("user_profiles").select("id").limit(1).execute(),
            )
            elapsed = int((time.monotonic() - t0) * 1000)
            if elapsed < 500:
                status = "healthy"
            elif elapsed < 2000:
                status = "degraded"
            else:
                status = "error"
            return {
                "name": name, "status": status,
                "response_time_ms": elapsed, "checked_at": checked_at, "error": None,
            }
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            return {
                "name": name, "status": "error",
                "response_time_ms": elapsed, "checked_at": checked_at,
                "error": str(exc)[:500],
            }

    async def probe_yfinance() -> dict:
        name = "yfinance Market Data"
        t0 = time.monotonic()
        checked_at = datetime.now(timezone.utc).isoformat()
        try:
            loop = asyncio.get_event_loop()

            def _fetch():
                ticker = yf.Ticker("SPY")
                price = ticker.fast_info.get("last_price")
                return price

            price = await loop.run_in_executor(None, _fetch)
            elapsed = int((time.monotonic() - t0) * 1000)
            if price is None or (isinstance(price, float) and math.isnan(price)):
                return {
                    "name": name, "status": "degraded", "response_time_ms": elapsed,
                    "checked_at": checked_at, "error": "Price unavailable (NaN returned)",
                }
            if elapsed < 3000:
                status = "healthy"
            elif elapsed < 6000:
                status = "degraded"
            else:
                status = "error"
            return {
                "name": name, "status": status,
                "response_time_ms": elapsed, "checked_at": checked_at, "error": None,
            }
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            return {
                "name": name, "status": "error",
                "response_time_ms": elapsed, "checked_at": checked_at,
                "error": str(exc)[:500],
            }

    async def probe_gemini() -> dict:
        name = "Gemini AI"
        checked_at = datetime.now(timezone.utc).isoformat()
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            return {
                "name": name, "status": "error", "response_time_ms": None,
                "checked_at": checked_at, "error": "GEMINI_API_KEY is not set",
            }
        t0 = time.monotonic()
        try:
            import google.generativeai as genai
            loop = asyncio.get_event_loop()

            def _call():
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel("gemini-1.5-flash")
                model.generate_content(
                    "Hi",
                    generation_config=genai.types.GenerationConfig(max_output_tokens=1),
                )

            await loop.run_in_executor(None, _call)
            elapsed = int((time.monotonic() - t0) * 1000)
            if elapsed < 5000:
                status = "healthy"
            elif elapsed < 10000:
                status = "degraded"
            else:
                status = "error"
            return {
                "name": name, "status": status,
                "response_time_ms": elapsed, "checked_at": checked_at, "error": None,
            }
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            return {
                "name": name, "status": "error",
                "response_time_ms": elapsed, "checked_at": checked_at,
                "error": str(exc)[:500],
            }

    async def probe_stocktwits() -> dict:
        name = "StockTwits"
        t0 = time.monotonic()
        checked_at = datetime.now(timezone.utc).isoformat()
        url = "https://api.stocktwits.com/api/2/streams/symbol/SPY.json"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
            elapsed = int((time.monotonic() - t0) * 1000)
            if resp.status_code == 429:
                return {
                    "name": name, "status": "degraded", "response_time_ms": elapsed,
                    "checked_at": checked_at, "error": "Rate limited (429)",
                }
            if resp.status_code != 200:
                return {
                    "name": name, "status": "error", "response_time_ms": elapsed,
                    "checked_at": checked_at, "error": f"HTTP {resp.status_code}",
                }
            if elapsed < 2000:
                status = "healthy"
            elif elapsed < 5000:
                status = "degraded"
            else:
                status = "error"
            return {
                "name": name, "status": status,
                "response_time_ms": elapsed, "checked_at": checked_at, "error": None,
            }
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            return {
                "name": name, "status": "error",
                "response_time_ms": elapsed, "checked_at": checked_at,
                "error": str(exc)[:500],
            }

    # Run all five probes concurrently. return_exceptions=True prevents a
    # TimeoutError from asyncio.wait_for propagating as an unhandled exception
    # and exposing internal details in a 500 response (security finding F1).
    probe_names = ["Backend API", "Supabase Database", "yfinance Market Data", "Gemini AI", "StockTwits"]
    results = await asyncio.gather(
        asyncio.wait_for(probe_backend(),    timeout=10.0),
        asyncio.wait_for(probe_supabase(),   timeout=10.0),
        asyncio.wait_for(probe_yfinance(),   timeout=10.0),
        asyncio.wait_for(probe_gemini(),     timeout=10.0),
        asyncio.wait_for(probe_stocktwits(), timeout=10.0),
        return_exceptions=True,
    )
    components = []
    for name, result in zip(probe_names, results):
        if isinstance(result, Exception):
            components.append({
                "name": name,
                "status": "error",
                "response_time_ms": None,
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "error": f"Probe timed out or failed: {str(result)[:200]}",
            })
        else:
            components.append(result)

    # Derive overall status from worst-case component
    statuses = [c["status"] for c in components]
    if "error" in statuses:
        overall = "error"
    elif "degraded" in statuses:
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "overall": overall,
        "checked_at": overall_start.isoformat(),
        "components": list(components),
    }


# ── Activity Log ───────────────────────────────────────────────────────────────

@router.get("/admin/activity-log")
async def get_user_activity_log(
    payload: dict = Depends(admin_required),
    user_email: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """
    Paginated activity log with filters. Returns total, page, page_size, results.
    date_from and date_to are YYYY-MM-DD strings interpreted as UTC calendar days.
    """
    VALID_ACTION_TYPES = {
        "login", "logout", "ticker_search", "strategy_scan",
        "options_chain_view", "paper_trade_placed", "watchlist_update", "ai_query",
    }
    if action_type and action_type not in VALID_ACTION_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid action_type: {action_type!r}")

    if date_from and date_to:
        try:
            df = _date.fromisoformat(date_from)
            dt = _date.fromisoformat(date_to)
            if df > dt:
                raise HTTPException(status_code=422, detail="date_from must not be after date_to")
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format; use YYYY-MM-DD")

    sb = get_supabase()

    # Count query
    count_q = sb.table("user_action_log").select("id", count="exact")
    if user_email:
        count_q = count_q.ilike("user_email", f"%{user_email}%")
    if action_type:
        count_q = count_q.eq("action_type", action_type)
    if date_from:
        count_q = count_q.gte("created_at", f"{date_from}T00:00:00+00:00")
    if date_to:
        count_q = count_q.lte("created_at", f"{date_to}T23:59:59.999999+00:00")
    count_result = count_q.execute()
    total = count_result.count or 0

    total_pages = max(1, (total + page_size - 1) // page_size)
    if page > total_pages and total > 0:
        raise HTTPException(status_code=422, detail="page exceeds total pages")

    offset = (page - 1) * page_size

    # Data query
    q = sb.table("user_action_log").select(
        "id, user_email, action_type, detail, ip_address, created_at"
    ).order("created_at", desc=True).range(offset, offset + page_size - 1)

    if user_email:
        q = q.ilike("user_email", f"%{user_email}%")
    if action_type:
        q = q.eq("action_type", action_type)
    if date_from:
        q = q.gte("created_at", f"{date_from}T00:00:00+00:00")
    if date_to:
        q = q.lte("created_at", f"{date_to}T23:59:59.999999+00:00")

    rows = q.execute().data or []

    return {"total": total, "page": page, "page_size": page_size, "results": rows}

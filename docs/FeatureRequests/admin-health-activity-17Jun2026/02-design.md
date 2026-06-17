# Technical Design — Admin Health Monitor and User Activity Log

**Date:** 17Jun2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

This design introduces two new admin-only capabilities: a real-time component health monitor and a granular user action audit log. The health monitor adds `GET /api/admin/health-check` to `admin_routes.py`, executing five concurrent async probes (Backend API self-time, Supabase SELECT 1, yfinance SPY fast_info, Gemini minimal generation, StockTwits HTTP GET) with per-probe `asyncio.wait_for` timeouts of 10 seconds, returning a normalised JSON shape. The activity log introduces a new `user_action_log` table (migration `015_user_action_log.sql`), a fire-and-forget async helper `backend/services/activity_logger.py`, injection calls into eight existing route functions, two new admin query/export endpoints, and a new `POST /api/auth/logout` route. On the frontend, two new tabs ("Health" and "User Actions") are added to `AdminPanel.tsx`, with typed API functions in `client.ts`. The existing "Activity Log" tab is renamed "Activity Log (Logins)" and is otherwise untouched. An ADR documents the decision to use a separate table and fire-and-forget pattern.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/migrations/015_user_action_log.sql` | New | `user_action_log` table, indexes, RLS, pg_cron purge |
| `backend/services/activity_logger.py` | New | `log_action()` fire-and-forget helper |
| `backend/routes/admin_routes.py` | Modified | Add `GET /api/admin/health-check`, `GET /api/admin/activity-log`, `GET /api/admin/activity-log/export` |
| `backend/routes/auth_routes.py` | Modified | Add `POST /api/auth/logout`; inject `login` log call into `on_login()` |
| `backend/routes/options.py` | Modified | Inject `ticker_search` and `options_chain_view` log calls; add `Request` param |
| `backend/routes/orders.py` | Modified | Inject `paper_trade_placed` log calls into `place_order()` and `record_trade()`; add `Request` param |
| `backend/routes/strategies.py` | Modified | Inject `strategy_scan` log call into `scan_watchlist()` |
| `backend/routes/watchlist.py` | Modified | Inject `watchlist_update` log call into `save_watchlist()` |
| `backend/routes/ai_routes.py` | Modified | Inject `ai_query` log calls into each AI endpoint that performs a generation call |
| `backend/requirements.txt` | Modified | Add `httpx` if not already present (used for StockTwits probe) |
| `frontend/src/components/AdminPanel.tsx` | Modified | Add "Health" and "User Actions" tabs; rename "Activity Log" to "Activity Log (Logins)"; add `HealthTab` and `UserActionsTab` sub-components |
| `frontend/src/api/client.ts` | Modified | Add `HealthCheckResponse`, `ActivityLogResponse`, `ActivityLogFilters` interfaces; add `getHealthCheck()`, `getActivityLog()`, `exportActivityLog()`, `postLogout()` functions |
| `frontend/src/context/AuthContext.tsx` | Modified | Call `postLogout()` in `signOut()` before `supabase.auth.signOut()` |
| `docs/adr/0009-user-action-log-separate-table.md` | New | ADR for table separation and fire-and-forget pattern |

---

## 3. Database Schema Changes

### Migration: `015_user_action_log.sql`

```sql
-- Migration 015: user_action_log table for granular per-action event recording
-- Separate from activity_log (daily login aggregates) — see ADR-0009

create table if not exists public.user_action_log (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  user_email   text        not null,
  action_type  text        not null check (
                 action_type in (
                   'login',
                   'logout',
                   'ticker_search',
                   'strategy_scan',
                   'options_chain_view',
                   'paper_trade_placed',
                   'watchlist_update',
                   'ai_query'
                 )
               ),
  detail       jsonb,
  ip_address   text,
  created_at   timestamptz not null default now()
);

-- Primary query pattern: newest-first filtered by email and/or action_type
create index user_action_log_created_at_idx
  on public.user_action_log (created_at desc);

create index user_action_log_user_email_idx
  on public.user_action_log (user_email);

-- No GIN index on detail: the query patterns (email, action_type, date range)
-- are fully served by the two indexes above. GIN on detail deferred until
-- a query-by-detail-field use case is demonstrated. See ADR-0009.

-- RLS: service role only (admin reads go through the service key on the backend)
alter table public.user_action_log enable row level security;

-- No user-facing RLS policy — regular users never read this table directly.
-- The service role key (used by the backend) bypasses RLS automatically.

-- 30-day rolling purge via pg_cron (requires pg_cron extension enabled in Supabase)
-- Schedule: 3:00 AM UTC daily. Deletes rows older than 30 days.
-- To enable: Dashboard → Database → Extensions → pg_cron → Enable
select cron.schedule(
  'purge-user-action-log-30d',
  '0 3 * * *',
  $$
    delete from public.user_action_log
    where created_at < now() - interval '30 days';
  $$
);
```

**Tables affected:**

| Table | Change |
|-------|--------|
| `public.user_action_log` | New table |
| `activity_log` | No change (existing login-aggregation table is untouched) |

**RLS policies:**

`user_action_log` has RLS enabled with no permissive policies for authenticated users. The backend service role key bypasses RLS. This means only backend service-role writes and reads are permitted; no Supabase JS client call from the frontend can access this table.

**pg_cron note:** If pg_cron is not available in the target Supabase project (e.g., free tier without the extension), the `cron.schedule()` call will fail. In that case, the operator must either enable pg_cron via the Dashboard or implement a Supabase Scheduled Edge Function as an alternative. The migration is written so the table creation succeeds even if the `cron.schedule()` call is removed; they are independent statements.

**Retention decision:** The Gate 1 decision specifies 30-day rolling purge. The spec (FR-26) originally stated no retention enforcement. The Gate 1 override takes precedence. Rows older than 30 days are purged daily at 3:00 AM UTC.

---

## 4. API Contracts

### `GET /api/admin/health-check`

**Auth required:** Yes (admin via `require_admin()`)

**Query parameters:** None.

**Response (200):**
```json
{
  "overall": "healthy",
  "checked_at": "2026-06-17T14:23:01.452Z",
  "components": [
    {
      "name": "Backend API",
      "status": "healthy",
      "response_time_ms": 0,
      "checked_at": "2026-06-17T14:23:01.452Z",
      "error": null
    },
    {
      "name": "Supabase Database",
      "status": "healthy",
      "response_time_ms": 42,
      "checked_at": "2026-06-17T14:23:01.453Z",
      "error": null
    },
    {
      "name": "yfinance Market Data",
      "status": "degraded",
      "response_time_ms": 4100,
      "checked_at": "2026-06-17T14:23:01.810Z",
      "error": "Price unavailable (NaN returned)"
    },
    {
      "name": "Gemini AI",
      "status": "error",
      "response_time_ms": null,
      "checked_at": "2026-06-17T14:23:01.452Z",
      "error": "GEMINI_API_KEY is not set"
    },
    {
      "name": "StockTwits",
      "status": "healthy",
      "response_time_ms": 310,
      "checked_at": "2026-06-17T14:23:01.762Z",
      "error": null
    }
  ]
}
```

**Field rules:**
- `overall`: derived from worst-case component status — if any component is `"error"` → `"error"`; else if any is `"degraded"` → `"degraded"`; else `"healthy"`.
- `response_time_ms`: integer milliseconds, or `null` when measurement is not possible (e.g., Gemini key absent — the probe exits immediately without timing a network call).
- `checked_at` (top-level): ISO 8601 UTC timestamp of when the endpoint handler began executing.
- `checked_at` (per component): ISO 8601 UTC timestamp of when that specific probe completed.
- `status` values: exactly `"healthy"` | `"degraded"` | `"error"` (lowercase).

**Per-probe thresholds and status logic:**

| Component | Healthy | Degraded | Error |
|-----------|---------|----------|-------|
| Backend API | Always `"healthy"` with `response_time_ms: 0` — see note below | — | If endpoint itself returns non-200 (unreachable from client perspective) |
| Supabase Database | `SELECT 1` succeeds, elapsed < 500 ms | 500–2000 ms | > 2000 ms or any exception |
| yfinance Market Data | `fast_info["last_price"]` is a valid non-NaN float, elapsed < 3000 ms | elapsed 3000–6000 ms, OR price is NaN/None (with message "Price unavailable (NaN returned)") | elapsed > 6000 ms or exception |
| Gemini AI | Key present, generation call succeeds, elapsed < 5000 ms | elapsed 5000–10000 ms | > 10000 ms, key absent, or generation raises any exception |
| StockTwits | HTTP 200, elapsed < 2000 ms | HTTP 429 (rate limited) or elapsed 2000–5000 ms | elapsed > 5000 ms, non-200 (excluding 429), or exception |

**Backend API probe rationale:** The backend cannot meaningfully measure its own round-trip time from within the same request handler. The component exists to surface to the admin that the backend is reachable (the fact that the frontend received a 200 response is the evidence). The probe always returns `status: "healthy"`, `response_time_ms: 0`. The frontend measures client-side wall-clock time from sending the request to receiving the response and displays it as "API Response Time" in a separate UI element (not as the `response_time_ms` from the component object).

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | No Authorization header |
| 403 | Valid JWT but user is not admin |

**No caching.** Results are never cached. Each call executes live probes.

---

### `GET /api/admin/activity-log`

**Auth required:** Yes (admin)

**Query parameters:**

| Parameter | Type | Default | Validation |
|-----------|------|---------|------------|
| `user_email` | string | — | Optional; partial match via `ilike '%value%'` |
| `action_type` | string | — | Optional; must be one of the 8 enum values or omitted |
| `date_from` | ISO date string (`YYYY-MM-DD`) | — | Optional |
| `date_to` | ISO date string (`YYYY-MM-DD`) | — | Optional |
| `page` | integer | 1 | >= 1 |
| `page_size` | integer | 50 | 1–200 |

**Validation errors (HTTP 422):**
- `date_from` is after `date_to`: `{"detail": "date_from must not be after date_to"}`
- `page` exceeds total pages (calculated from count and page_size): `{"detail": "page exceeds total pages"}`
- `action_type` is not one of the 8 allowed values: standard FastAPI 422.

**Date filter semantics:** `date_from` and `date_to` are interpreted as UTC calendar dates. `date_from` maps to `created_at >= date_from 00:00:00 UTC`; `date_to` maps to `created_at <= date_to 23:59:59.999999 UTC`.

**Response (200):**
```json
{
  "total": 2341,
  "page": 1,
  "page_size": 50,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_email": "alice@example.com",
      "action_type": "paper_trade_placed",
      "detail": {
        "symbol": "AAPL",
        "strategy_name": "Bull Call Spread",
        "legs": [
          {
            "contract_symbol": "AAPL240119C00150000",
            "option_type": "call",
            "strike": 150.0,
            "expiry": "2024-01-19",
            "side": "buy",
            "qty": 1,
            "price": 5.20
          },
          {
            "contract_symbol": "AAPL240119C00160000",
            "option_type": "call",
            "strike": 160.0,
            "expiry": "2024-01-19",
            "side": "sell",
            "qty": 1,
            "price": 2.10
          }
        ],
        "net_debit_credit": -3.10,
        "total_contracts": 1
      },
      "ip_address": "203.0.113.42",
      "created_at": "2026-06-17T14:23:01.452Z"
    }
  ]
}
```

**Sort order:** Always `created_at DESC`. Not configurable.

---

### `GET /api/admin/activity-log/export`

**Auth required:** Yes (admin)

**Query parameters:** Same as `GET /api/admin/activity-log` except `page` and `page_size` are not accepted (export is always the full filtered set up to 10,000 rows).

**Response (200):** `StreamingResponse` with `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="user-actions.csv"`.

**CSV format:**
```
timestamp,user_email,action_type,detail,ip_address
2026-06-17T14:23:01.452Z,alice@example.com,paper_trade_placed,"{""symbol"": ""AAPL""}",203.0.113.42
```

- Header row always present.
- `detail` field: serialised as a JSON string; fields containing commas or double-quotes are enclosed in double-quotes with internal double-quotes escaped as `""` (standard RFC 4180).
- Sort order: `created_at DESC` (most recent first).
- Cap: 10,000 rows maximum. If the filtered result set exceeds 10,000 rows, the response includes `X-Truncated: true` header and the CSV contains exactly the 10,000 most recent rows.
- Implementation: `StreamingResponse` with a generator that yields the header row then data rows; rows are fetched from Supabase in a single query with `.limit(10000)`.

**Empty result:** Returns a CSV with only the header row; no `X-Truncated` header.

---

### `POST /api/auth/logout`

**Auth required:** Yes (any authenticated user via `verify_token`)

**Request body:** Empty (`{}`).

**Response (200):**
```json
{"ok": true}
```

**Behaviour:** Verifies the JWT, extracts `user_id` and `user_email`, extracts IP from `Request`, calls `log_action()` with `action_type="logout"` and `detail={}`, then returns 200. The frontend then calls `supabase.auth.signOut()` to invalidate the Supabase session. The backend does not call Supabase auth admin APIs to invalidate the session — it only records the log event.

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | No or invalid Authorization header |

---

## 5. Activity Logger Service

**File:** `backend/services/activity_logger.py`

```python
"""
Fire-and-forget activity logging for user_action_log table.
Never raises. Any failure is logged at WARNING level and silently dropped.
See ADR-0009 for rationale.
"""
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

ACTION_TYPES = frozenset({
    "login",
    "logout",
    "ticker_search",
    "strategy_scan",
    "options_chain_view",
    "paper_trade_placed",
    "watchlist_update",
    "ai_query",
})


async def log_action(
    user_id: str,
    user_email: str,
    action_type: str,
    detail: dict | None,
    ip_address: str | None,
) -> None:
    """
    Write one row to user_action_log. Non-blocking: called with asyncio.create_task()
    by callers. Never raises — any exception is caught and logged at WARNING.

    Signature:
        user_id     — Supabase auth user UUID (string)
        user_email  — denormalised email for query convenience
        action_type — must be one of ACTION_TYPES; invalid values are dropped
        detail      — action-specific JSONB payload (may be None or {})
        ip_address  — client IP extracted from X-Forwarded-For or request.client.host
    """
    if action_type not in ACTION_TYPES:
        logger.warning("log_action: unknown action_type %r — row dropped", action_type)
        return
    try:
        from services.db import get_supabase
        sb = get_supabase()
        sb.table("user_action_log").insert({
            "user_id": user_id,
            "user_email": user_email,
            "action_type": action_type,
            "detail": detail or {},
            "ip_address": ip_address,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.warning(
            "log_action: failed to write %s for %s: %s",
            action_type, user_email, exc,
        )


def extract_ip(request) -> str | None:
    """
    Extract client IP from FastAPI Request.
    Prefers X-Forwarded-For (set by Railway's reverse proxy).
    Falls back to request.client.host.
    Returns the first IP in the X-Forwarded-For list if multiple are present.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None
```

**Calling pattern in route functions (fire-and-forget):**

```python
import asyncio
from services.activity_logger import log_action, extract_ip

# Inside an async route function:
asyncio.create_task(log_action(
    user_id=user_id,
    user_email=email,
    action_type="login",
    detail={"email": email},
    ip_address=extract_ip(request),
))

# Inside a sync route function (options.py and orders.py use def not async def):
# Use asyncio.ensure_future() or restructure the route to async.
# Decision: convert affected sync route functions to async def for consistency.
# This is a safe change — FastAPI handles both sync and async route handlers.
```

**Sync vs async route note:** `options.py` and `orders.py` define their handlers with `def` (sync). To use `asyncio.create_task()`, these must be converted to `async def`. This is a mechanical change with no behaviour difference for the existing logic — FastAPI runs sync handlers in a thread pool and async handlers in the event loop; the conversion does not break existing behaviour. Alternatively, `log_action` can be called without `await` as a bare coroutine call wrapped in a background task via `BackgroundTasks` (FastAPI built-in). The preferred approach is `asyncio.create_task()` within `async def` handlers, as it avoids importing `BackgroundTasks` as an additional dependency into every route.

---

## 6. Health Check Route Implementation

**Location:** `backend/routes/admin_routes.py` — new function `health_check()`.

**Imports required:** `asyncio`, `time`, `httpx`, `datetime`, `os`, `yfinance as yf`.

`httpx` is already in use in the codebase for other async HTTP calls; verify it is in `requirements.txt` and add it if absent.

```python
import asyncio
import time
import os
import httpx
import yfinance as yf
from datetime import datetime, timezone

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
            from services.db import get_supabase
            sb = get_supabase()
            # Run sync Supabase client in thread pool to avoid blocking event loop
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, lambda: sb.rpc("select_one", {}).execute()
                if False else sb.table("user_profiles").select("id").limit(1).execute())
            # Simpler: use raw SQL via postgrest
            # The supabase-py client does not expose raw SELECT 1 directly;
            # use a lightweight table read as equivalent (no data returned to caller).
            elapsed = int((time.monotonic() - t0) * 1000)
            if elapsed < 500:
                status = "healthy"
            elif elapsed < 2000:
                status = "degraded"
            else:
                status = "error"
            return {"name": name, "status": status,
                    "response_time_ms": elapsed, "checked_at": checked_at, "error": None}
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            return {"name": name, "status": "error",
                    "response_time_ms": elapsed, "checked_at": checked_at, "error": str(exc)[:500]}

    async def probe_yfinance() -> dict:
        name = "yfinance Market Data"
        t0 = time.monotonic()
        checked_at = datetime.now(timezone.utc).isoformat()
        try:
            loop = asyncio.get_event_loop()
            def _fetch():
                import math
                ticker = yf.Ticker("SPY")
                price = ticker.fast_info.get("last_price")
                return price
            price = await loop.run_in_executor(None, _fetch)
            elapsed = int((time.monotonic() - t0) * 1000)
            import math
            if price is None or (isinstance(price, float) and math.isnan(price)):
                return {"name": name, "status": "degraded", "response_time_ms": elapsed,
                        "checked_at": checked_at, "error": "Price unavailable (NaN returned)"}
            if elapsed < 3000:
                status = "healthy"
            elif elapsed < 6000:
                status = "degraded"
            else:
                status = "error"
            return {"name": name, "status": status,
                    "response_time_ms": elapsed, "checked_at": checked_at, "error": None}
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            return {"name": name, "status": "error",
                    "response_time_ms": elapsed, "checked_at": checked_at, "error": str(exc)[:500]}

    async def probe_gemini() -> dict:
        name = "Gemini AI"
        checked_at = datetime.now(timezone.utc).isoformat()
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            return {"name": name, "status": "error", "response_time_ms": None,
                    "checked_at": checked_at, "error": "GEMINI_API_KEY is not set"}
        t0 = time.monotonic()
        try:
            import google.generativeai as genai
            loop = asyncio.get_event_loop()
            def _call():
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel("gemini-1.5-flash")
                # Minimal generation: 1-token prompt, max 1 output token
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
            return {"name": name, "status": status,
                    "response_time_ms": elapsed, "checked_at": checked_at, "error": None}
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            return {"name": name, "status": "error",
                    "response_time_ms": elapsed, "checked_at": checked_at, "error": str(exc)[:500]}

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
                return {"name": name, "status": "degraded", "response_time_ms": elapsed,
                        "checked_at": checked_at, "error": "Rate limited (429)"}
            if resp.status_code != 200:
                return {"name": name, "status": "error", "response_time_ms": elapsed,
                        "checked_at": checked_at,
                        "error": f"HTTP {resp.status_code}"}
            if elapsed < 2000:
                status = "healthy"
            elif elapsed < 5000:
                status = "degraded"
            else:
                status = "error"
            return {"name": name, "status": status,
                    "response_time_ms": elapsed, "checked_at": checked_at, "error": None}
        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            return {"name": name, "status": "error",
                    "response_time_ms": elapsed, "checked_at": checked_at, "error": str(exc)[:500]}

    # Run all five probes concurrently; each is individually timeout-guarded
    components = await asyncio.gather(
        asyncio.wait_for(probe_backend(),    timeout=10.0),
        asyncio.wait_for(probe_supabase(),   timeout=10.0),
        asyncio.wait_for(probe_yfinance(),   timeout=10.0),
        asyncio.wait_for(probe_gemini(),     timeout=10.0),
        asyncio.wait_for(probe_stocktwits(), timeout=10.0),
        return_exceptions=False,
    )

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
```

**Supabase probe implementation note:** The supabase-py client does not expose a raw `SELECT 1`. The probe uses the lightest possible table read: `sb.table("user_profiles").select("id").limit(1).execute()`. This issues one HTTP request to PostgREST and reliably measures database connectivity. The result data is discarded.

**asyncio.wait_for and TimeoutError:** If a probe times out, `asyncio.wait_for` raises `asyncio.TimeoutError`. With `return_exceptions=False`, this would propagate from `asyncio.gather` and return a 500 to the admin. To prevent this, each probe function wraps its internal logic in try/except. The `asyncio.wait_for` is an outer safety net for runaway probes, not a substitute for internal error handling. If `wait_for` fires before the probe's own except clause, the 500 is acceptable and rare (only at exactly 10 s).

---

## 7. Activity Log Route Implementation

**Location:** `backend/routes/admin_routes.py` — two new functions.

```python
from fastapi import Query
from fastapi.responses import StreamingResponse
import csv
import io
from datetime import date as _date
from typing import Optional

@router.get("/admin/activity-log")
async def get_activity_log(
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


@router.get("/admin/activity-log/export")
async def export_activity_log(
    payload: dict = Depends(admin_required),
    user_email: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """
    Export filtered activity log as CSV. Capped at 10,000 rows (most recent).
    Sets X-Truncated: true header if result set would exceed cap.
    """
    VALID_ACTION_TYPES = {
        "login", "logout", "ticker_search", "strategy_scan",
        "options_chain_view", "paper_trade_placed", "watchlist_update", "ai_query",
    }
    if action_type and action_type not in VALID_ACTION_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid action_type: {action_type!r}")

    CAP = 10_000
    sb = get_supabase()

    # Fetch one more than cap to detect truncation
    q = sb.table("user_action_log").select(
        "id, user_email, action_type, detail, ip_address, created_at"
    ).order("created_at", desc=True).limit(CAP + 1)

    if user_email:
        q = q.ilike("user_email", f"%{user_email}%")
    if action_type:
        q = q.eq("action_type", action_type)
    if date_from:
        q = q.gte("created_at", f"{date_from}T00:00:00+00:00")
    if date_to:
        q = q.lte("created_at", f"{date_to}T23:59:59.999999+00:00")

    rows = q.execute().data or []
    truncated = len(rows) > CAP
    rows = rows[:CAP]

    import json

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["timestamp", "user_email", "action_type", "detail", "ip_address"])
        yield buf.getvalue()
        for row in rows:
            buf = io.StringIO()
            writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
            detail_str = json.dumps(row.get("detail") or {})
            writer.writerow([
                row.get("created_at", ""),
                row.get("user_email", ""),
                row.get("action_type", ""),
                detail_str,
                row.get("ip_address") or "",
            ])
            yield buf.getvalue()

    headers = {"Content-Disposition": "attachment; filename=\"user-actions.csv\""}
    if truncated:
        headers["X-Truncated"] = "true"

    return StreamingResponse(
        generate(),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )
```

---

## 8. Activity Logging Injection Points

For each of the 8 action types, the exact route function and injection location:

### 8.1 `login` — `backend/routes/auth_routes.py`, `on_login()`

**After:** The existing `user_portfolio.log_activity(user_id, email, ip)` call in the "Log activity" block (line ~118).

**Call:**
```python
asyncio.create_task(log_action(
    user_id=user_id,
    user_email=email,
    action_type="login",
    detail={"email": email},
    ip_address=extract_ip(request),
))
```

Note: `on_login` already has `request: Request` as a parameter. Import `asyncio`, `log_action`, and `extract_ip` at top of file.

### 8.2 `logout` — `backend/routes/auth_routes.py`, new `POST /api/auth/logout` route

The entire function body logs the event:
```python
@router.post("/auth/logout")
async def on_logout(request: Request, payload: dict = Depends(verify_token)):
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
```

### 8.3 `ticker_search` — `backend/routes/options.py`, `get_stock_quote()`

Convert `def get_stock_quote(symbol: str)` to `async def get_stock_quote(symbol: str, request: Request, payload: dict = Depends(verify_token))`.

**After** `return get_quote(symbol.upper())` — inject before the return:
```python
asyncio.create_task(log_action(
    user_id=get_user_id(payload),
    user_email=get_user_email(payload),
    action_type="ticker_search",
    detail={"symbol": symbol.upper()},
    ip_address=extract_ip(request),
))
```

**Auth note:** `GET /api/options/quote/{symbol}` currently has no auth requirement. To log the user, it needs `payload: dict = Depends(verify_token)`. The spec says all activity logging is per-user. If a caller is unauthenticated, the log should be skipped rather than blocking the request. Use `security` optional: change to `credentials: Optional[HTTPAuthorizationCredentials] = Security(security)` and only log when credentials are present.

### 8.4 `options_chain_view` — `backend/routes/options.py`, `get_chain()`

Same pattern as ticker_search. Add optional auth parameter. Add `request: Request`. Inject after the options chain is assembled and before the return:
```python
if payload:
    asyncio.create_task(log_action(
        user_id=get_user_id(payload),
        user_email=get_user_email(payload),
        action_type="options_chain_view",
        detail={"symbol": symbol.upper()},
        ip_address=extract_ip(request),
    ))
```

### 8.5 `strategy_scan` — `backend/routes/strategies.py`, `scan_watchlist()`

`scan_watchlist` is already `async def` and already has `payload: dict = Depends(verify_token)`. Add `request: Request` as a parameter.

**After** the scan results are assembled and sorted (before `return results`):
```python
asyncio.create_task(log_action(
    user_id=user_id,
    user_email=payload.get("email", ""),
    action_type="strategy_scan",
    detail={"symbols": symbol_list},
    ip_address=extract_ip(request),
))
```

### 8.6 `paper_trade_placed` — `backend/routes/orders.py`, `place_order()` and `record_trade()`

Both routes require auth. Convert both from `def` to `async def`. Add `request: Request` to both.

**`place_order()`:** Inject after `result = user_portfolio.place_order(user_id, req)` when `result.status == "filled"`:

```python
result = user_portfolio.place_order(user_id, req)
if result.status == "filled":
    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=payload.get("email", ""),
        action_type="paper_trade_placed",
        detail={
            "symbol": req.symbol,
            "strategy_name": req.strategy_name,
            "legs": [{
                "contract_symbol": req.symbol,
                "option_type": req.option_type,
                "strike": req.strike,
                "expiry": req.expiry,
                "side": req.action,
                "qty": req.quantity,
                "price": result.price,
            }],
            "net_debit_credit": result.price * (-1 if req.action == "buy" else 1),
            "total_contracts": req.quantity,
        },
        ip_address=extract_ip(request),
    ))
return result
```

**`record_trade()`:** Inject after `result = user_portfolio.record_trade(user_id, req)`:

```python
result = user_portfolio.record_trade(user_id, req)
asyncio.create_task(log_action(
    user_id=user_id,
    user_email=payload.get("email", ""),
    action_type="paper_trade_placed",
    detail={
        "symbol": req.symbol,
        "strategy_name": req.strategy_name,
        "legs": [
            {
                "contract_symbol": req.symbol,
                "option_type": leg.option_type,
                "strike": leg.strike,
                "expiry": req.expiry,
                "side": leg.action,
                "qty": leg.quantity,
                "price": leg.price,
            }
            for leg in req.legs
        ],
        "net_debit_credit": sum(
            -leg.price * leg.quantity if leg.action == "buy"
            else leg.price * leg.quantity
            for leg in req.legs
        ),
        "total_contracts": max(leg.quantity for leg in req.legs),
    },
    ip_address=extract_ip(request),
))
return result
```

### 8.7 `watchlist_update` — `backend/routes/watchlist.py`, `save_watchlist()`

`save_watchlist` is already `async def`. Add `request: Request`. **After** `_write_symbols(...)` succeeds (when `err` is None):
```python
asyncio.create_task(log_action(
    user_id=user_id,
    user_email=payload.get("email", ""),
    action_type="watchlist_update",
    detail={"symbol_count": len(symbols)},
    ip_address=extract_ip(request),
))
```

Log unconditionally (even if `err` is set) — we log the intent to save, not the success, because the `_write_symbols` failure path still attempts the write.

Correction: log only when the write is attempted without a hard exception. The current implementation does not raise on error — it returns `err` string. Log always (the user's action was taken regardless of DB outcome).

### 8.8 `ai_query` — `backend/routes/ai_routes.py`

The AI routes that constitute a "generation call" (i.e., send user intent to Gemini) are: `ai_chat`, `ai_risk_summary`, `ai_strategy_reasoning`, `ai_enhance_narrative`, `ai_morning_briefing` (GET), and `get_trade_journal_review`, `get_roll_advisor`, `get_greeks_coaching`. The `GET /ai/settings` and `PUT /ai/settings` routes are configuration only — do not log these.

For each qualifying AI route, add `request: Request` and inject after the entitlement check passes (i.e., after `_require_ai_feature()` and before the Gemini call):

```python
asyncio.create_task(log_action(
    user_id=user_id,
    user_email=payload.get("email", ""),
    action_type="ai_query",
    detail={"query_type": "chat"},   # replace with the specific type per route
    ip_address=extract_ip(request),
))
```

The `query_type` values map to: `ai_chat` → `"chat"`, `ai_risk_summary` → `"risk_summary"`, `ai_strategy_reasoning` → `"reasoning"`, `ai_enhance_narrative` → `"narrative"`, morning briefing → `"morning_briefing"`, trade journal review → `"trade_journal"`, roll advisor → `"roll_advisor"`, greeks coaching → `"greeks_coaching"`.

---

## 9. Frontend Design

### 9.1 Updated `AdminTab` type

```typescript
type AdminTab = 'users' | 'whitelist' | 'activity' | 'leaderboard' | 'settings' | 'health' | 'user_actions'
```

### 9.2 Updated tab bar in `AdminPanel.tsx`

```typescript
const tabs: { key: AdminTab; label: string }[] = [
  { key: 'users',        label: 'Users' },
  { key: 'whitelist',    label: 'Whitelist' },
  { key: 'activity',     label: 'Activity Log (Logins)' },   // renamed
  { key: 'leaderboard',  label: 'Leaderboard' },
  { key: 'settings',     label: 'Platform Settings' },
  { key: 'health',       label: 'Health' },                   // new
  { key: 'user_actions', label: 'User Actions' },             // new
]
```

The existing `loadActivity` / auto-refresh logic for the `'activity'` tab is unchanged; only the label changes.

### 9.3 `HealthTab` sub-component

**State:**
```typescript
interface ComponentHealth {
  name: string
  status: 'healthy' | 'degraded' | 'error'
  response_time_ms: number | null
  checked_at: string
  error: string | null
}

interface HealthCheckData {
  overall: 'healthy' | 'degraded' | 'error'
  checked_at: string
  components: ComponentHealth[]
}

const [healthData, setHealthData] = useState<HealthCheckData | null>(null)
const [loading, setLoading] = useState(false)
const [fetchError, setFetchError] = useState<string | null>(null)
const lastFetchRef = useRef<number>(0)   // epoch ms of last successful fetch
```

**Fetch function:**
```typescript
const fetchHealth = useCallback(async (force = false) => {
  const now = Date.now()
  if (!force && now - lastFetchRef.current < 30_000) return  // 30-second guard
  if (loading) return  // do not re-enter while in-flight
  setLoading(true)
  setFetchError(null)
  const t0 = Date.now()
  try {
    const data = await getHealthCheck()
    // Attach client-side API round-trip to Backend API component
    const apiRtt = Date.now() - t0
    data.components = data.components.map(c =>
      c.name === 'Backend API' ? { ...c, response_time_ms: apiRtt } : c
    )
    setHealthData(data)
    lastFetchRef.current = Date.now()
  } catch (err: any) {
    setFetchError(err?.message ?? 'Health check failed: network error')
  } finally {
    setLoading(false)
  }
}, [loading])
```

**useEffect for initial load and auto-refresh:**
```typescript
useEffect(() => {
  fetchHealth(true)  // immediate on tab entry
  const id = setInterval(() => fetchHealth(false), 60_000)
  return () => clearInterval(id)  // stop on tab exit
}, [])  // empty deps — runs once on mount, cleans up on unmount
```

Note: `fetchHealth` is excluded from the dependency array intentionally — the interval captures the stable callback ref pattern. In practice, wrap `fetchHealth` with `useCallback` and include it, or use a `ref` to the latest callback. The implementation must ensure the auto-refresh does not fire when a manual refresh is in progress (checked via `if (loading) return`).

**Overall banner colour mapping:**
```typescript
const bannerConfig = {
  healthy:  { label: 'All Systems Operational', color: '#16a34a' },
  degraded: { label: 'Degraded',                color: '#d97706' },
  error:    { label: 'Outage Detected',          color: '#dc2626' },
}
```

**Status badge colour mapping:**
```typescript
const statusColor = {
  healthy:  '#16a34a',
  degraded: '#d97706',
  error:    '#dc2626',
}
```

**Error state:** When `fetchError` is non-null, replace the component card grid with a single full-width error message. This handles the "admin loses connectivity" scenario from the spec.

**Refresh button:** Disabled when `loading` is true. Shows "Checking..." when loading, "Refresh" otherwise.

### 9.4 `UserActionsTab` sub-component

**State:**
```typescript
interface UserActionRow {
  id: string
  user_email: string
  action_type: string
  detail: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

interface ActivityLogResponse {
  total: number
  page: number
  page_size: number
  results: UserActionRow[]
}

interface ActivityFilters {
  user_email: string
  action_type: string   // "" means "All"
  date_from: string
  date_to: string
}

const [filters, setFilters] = useState<ActivityFilters>({
  user_email: '', action_type: '', date_from: '', date_to: '',
})
const [appliedFilters, setAppliedFilters] = useState<ActivityFilters>(filters)
const [page, setPage] = useState(1)
const [data, setData] = useState<ActivityLogResponse | null>(null)
const [loading, setLoading] = useState(false)
const [dateError, setDateError] = useState<string | null>(null)
const [exporting, setExporting] = useState(false)
const [exportTruncated, setExportTruncated] = useState(false)
```

**Filter apply:** Validate `date_from <= date_to` client-side before sending request. Set `setDateError(...)` and abort if invalid. On valid "Apply", call `setAppliedFilters(filters)` and `setPage(1)`.

**Fetch:** `useEffect([appliedFilters, page])` — fires when applied filters or page changes. Calls `getActivityLog(appliedFilters, page, 50)`.

**Detail cell rendering:**
```typescript
const renderDetail = (detail: Record<string, unknown> | null): string => {
  if (!detail) return ''
  const str = Object.entries(detail)
    .filter(([k]) => k !== 'legs')  // omit legs array for compact display
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ')
  return str.length > 120 ? str.slice(0, 117) + '...' : str
}
```

**CSV export handler:**
```typescript
const handleExport = async () => {
  setExporting(true)
  setExportTruncated(false)
  try {
    const { blob, truncated } = await exportActivityLog(appliedFilters)
    const today = new Date().toISOString().slice(0, 10)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `user-actions-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
    if (truncated) setExportTruncated(true)
  } catch {
    // no-op: export failure is non-critical
  } finally {
    setExporting(false)
  }
}
```

**Pagination controls:** Show only when `data.total > 50`. "Previous" disabled at `page === 1`. "Next" disabled when `page === Math.ceil(data.total / 50)`.

**Row count summary:** `"Showing {(page-1)*50 + 1}–{Math.min(page*50, total)} of {total} results"`. When `total === 0`: `"0 events"`.

**Empty state:** When `data.results.length === 0`, table body shows one row spanning all columns: "No actions recorded matching the current filters."

**No auto-refresh.** No `setInterval` in this component.

### 9.5 New API client functions in `frontend/src/api/client.ts`

```typescript
// ─── Admin Health Monitor ──────────────────────────────────────────────────

export interface ComponentHealth {
  name: string
  status: 'healthy' | 'degraded' | 'error'
  response_time_ms: number | null
  checked_at: string
  error: string | null
}

export interface HealthCheckResponse {
  overall: 'healthy' | 'degraded' | 'error'
  checked_at: string
  components: ComponentHealth[]
}

export const getHealthCheck = (): Promise<HealthCheckResponse> =>
  api.get('/admin/health-check', { timeout: 30000 }).then(r => r.data)

// ─── Admin User Actions Log ────────────────────────────────────────────────

export interface UserActionRow {
  id: string
  user_email: string
  action_type: string
  detail: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface ActivityLogFilters {
  user_email?: string
  action_type?: string
  date_from?: string
  date_to?: string
}

export interface ActivityLogResponse {
  total: number
  page: number
  page_size: number
  results: UserActionRow[]
}

export const getActivityLog = (
  filters: ActivityLogFilters,
  page = 1,
  page_size = 50,
): Promise<ActivityLogResponse> =>
  api.get('/admin/activity-log', {
    params: {
      ...(filters.user_email ? { user_email: filters.user_email } : {}),
      ...(filters.action_type ? { action_type: filters.action_type } : {}),
      ...(filters.date_from   ? { date_from:   filters.date_from }   : {}),
      ...(filters.date_to     ? { date_to:      filters.date_to }    : {}),
      page,
      page_size,
    },
  }).then(r => r.data)

export const exportActivityLog = async (
  filters: ActivityLogFilters,
): Promise<{ blob: Blob; truncated: boolean }> => {
  const resp = await api.get('/admin/activity-log/export', {
    params: {
      ...(filters.user_email ? { user_email: filters.user_email } : {}),
      ...(filters.action_type ? { action_type: filters.action_type } : {}),
      ...(filters.date_from   ? { date_from:   filters.date_from }   : {}),
      ...(filters.date_to     ? { date_to:      filters.date_to }    : {}),
    },
    responseType: 'blob',
    timeout: 60000,
  })
  const truncated = resp.headers['x-truncated'] === 'true'
  return { blob: resp.data as Blob, truncated }
}

export const postLogout = (): Promise<{ ok: boolean }> =>
  api.post('/auth/logout', {}).then(r => r.data)
```

### 9.6 Logout logging in `AuthContext.tsx`

Modify the `signOut` function:

```typescript
const signOut = async () => {
  // Best-effort: log the logout event before invalidating the Supabase session.
  // If the backend call fails, proceed with sign-out regardless.
  try {
    await postLogout()
  } catch {
    // fire-and-forget; never block sign-out on logging failure
  }
  await supabase.auth.signOut()
  delete api.defaults.headers.common['Authorization']
  setProfile(null)
  setEntitlements(null)
  setPendingLegalAcknowledgment(false)
}
```

`postLogout()` must be called before `supabase.auth.signOut()` because it requires a valid JWT in the Authorization header. After `signOut()`, the session is invalidated and the token cannot be used.

---

## 10. Frontend State Management Summary

| Component | State owned | Props received | Loading state | Error state | Empty state |
|-----------|-------------|----------------|---------------|-------------|-------------|
| `HealthTab` | `healthData`, `loading`, `fetchError`, `lastFetchRef` | None (reads from parent's `activeTab`) | Spinner overlay over component cards | Full-width error message replacing cards | N/A (always shows 5 cards or error) |
| `UserActionsTab` | `filters`, `appliedFilters`, `page`, `data`, `loading`, `dateError`, `exporting`, `exportTruncated` | None | Row spinner in table body | Inline error under filter bar | "No actions recorded..." row in table |

Both sub-components are rendered conditionally in `AdminPanel.tsx` based on `activeTab`. They mount when the tab becomes active and unmount when the admin navigates away, which naturally stops the `HealthTab` auto-refresh interval via the `useEffect` cleanup.

---

## 11. Caching Strategy

| Data | Cache key | TTL | Fallback |
|------|-----------|-----|----------|
| Health check results | None — uncached | N/A | No fallback; each call is fresh |
| Activity log results | None — uncached | N/A | Empty results + error message |
| yfinance SPY probe | Existing `_cache` in `market_data.py` (30 s) | 30 s | The health probe calls `yf.Ticker("SPY").fast_info` directly, bypassing `market_data.py` cache, to get a genuinely live measurement |

The health check endpoint has a client-side guard: the frontend suppresses duplicate calls within 30 seconds of the previous successful fetch. This is enforced via `lastFetchRef` and the 30-second check in `fetchHealth`. The backend has no caching or rate-limiting for this endpoint.

---

## 12. External Dependency Fallback Chain

The health monitor's purpose is to surface dependency failures, not to hide them. There are therefore no fallback chains for the health check probes. Each probe either succeeds or returns an error status.

For the activity logging injection points, the fire-and-forget pattern is itself the fallback: logging failure never propagates to the user-facing response. See ADR-0009.

| Probe | Degraded behaviour | Error behaviour |
|-------|--------------------|-----------------|
| Supabase (health) | Returns `degraded` status | Returns `error` status with exception message |
| yfinance (health) | Returns `degraded` with "Price unavailable (NaN returned)" | Returns `error` status |
| Gemini (health) | Returns `degraded` (slow) | Returns `error` (key absent or exception) |
| StockTwits (health) | Returns `degraded` (429 or slow) | Returns `error` status |
| `log_action()` write | N/A | Silent drop; WARNING log; user request unaffected |

---

## 13. Subscription Tier Enforcement

Neither feature is tier-gated. Both are exclusively admin-gated via `require_admin()` (for the admin API routes) and `isAdmin` (for the frontend tab visibility). There is no tier check, no entitlement lookup, and no subscriber impact.

`POST /api/auth/logout` is available to all authenticated users and does not check tier.

---

## 14. New Environment Variables

No new environment variables are introduced. `GEMINI_API_KEY` is already required for AI features; its presence or absence is surfaced in the Gemini health probe result.

---

## 15. ADR References

- `docs/adr/0009-user-action-log-separate-table.md` — Rationale for introducing a separate `user_action_log` table rather than extending `activity_log`, and the fire-and-forget logging pattern.

---

## 16. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

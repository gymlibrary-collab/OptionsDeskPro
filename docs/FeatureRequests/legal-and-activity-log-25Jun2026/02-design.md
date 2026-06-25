# Gate 2 — Technical Design
# Legal T&C Acknowledgment Tracking and Subscriber Activity Log

**Date:** 25Jun2026
**Author:** Solution Architect
**Status:** Draft — awaiting Gate 3 approval

---

## 0. PO Questions Answered Upfront

The Product Owner flagged three questions that must be resolved before implementation begins. Answers are definitive; no further PO input is needed.

**Q1 — Exact hook point for `log_action("tc_acknowledged", ...)`.**

The hook goes into `backend/routes/legal_routes.py`, inside the `acknowledge_legal` async function, after the successful `sb.table("legal_acknowledgments").insert(...)` call returns and before the `return` statement. Specifically, the task is created after `ack_row = result.data[0] if result.data else {}` and before `return { "acknowledged": True, ... }`.

The `detail` payload is:
```json
{
  "version_id": "<uuid string>",
  "version_number": "<e.g. '1.0'>",
  "content_hash": "<64-char hex SHA-256>"
}
```

`version_id` is included because it is the canonical foreign key that links this log entry to the `legal_document_versions` row. `version_number` is included as a human-readable field so the admin can read it from the log without a JOIN. `content_hash` is included to provide tamper-evidence parity with the `legal_acknowledgments` row. `user_id` and `user_email` are already top-level columns on `user_action_log` — they are not repeated in `detail`.

The `user_email` for the `log_action` call is extracted from the JWT payload. The `acknowledge_legal` handler already has access to `payload` (the verified JWT dict). `user_email = payload.get("email", "")` extracts it without an additional DB call.

`ip_address` is already extracted earlier in the handler into the local variable `ip_address`. That same variable is passed to `log_action`.

The call uses `asyncio.create_task()` per the fire-and-forget pattern established in ADR-0009. The acknowledgment insert into `legal_acknowledgments` is not rolled back if `log_action` fails — the log write is strictly append-only and secondary.

The existing route already calls `get_user_id(payload)` to obtain `user_id`. The same `user_id` string is passed to `log_action`.

**Q2 — `tc_ack_status` / `tc_ack_at` added to existing `GET /admin/users` (not a new endpoint).**

Confirmed: the two fields are added to the existing `GET /admin/users` response in `admin_routes.py`. No parallel endpoint is introduced. The Users tab fires exactly one `GET /admin/users` call on tab load; the acknowledgment status data arrives in that same response payload.

The query strategy inside `list_users` is a two-step Python-side join:
1. Fetch the active version ID from `legal_document_versions` where `is_active = true`, using `LIMIT 1 ORDER BY published_at DESC` as a safety guard against the multi-active edge case (which the partial unique index prevents but which we defend against in code anyway).
2. If an active version exists, fetch all `legal_acknowledgments` rows for that `version_id` in a single query: `.select("user_id, acknowledged_at").eq("version_id", active_version_id)`. This returns at most one row per user (enforced by the UNIQUE(user_id, version_id) constraint in migration 012). Store the result in a dict keyed by `user_id`.
3. For each user profile row, look up the dict to assign `tc_ack_status` and `tc_ack_at`.

This is one `legal_document_versions` query plus one `legal_acknowledgments` query regardless of subscriber count — not N queries. The Supabase Python client does not support server-side JOINs across tables in the REST API without RPC, so the two-query Python-side join is the correct approach here.

Admin accounts receive `tc_ack_status: "exempt"` and `tc_ack_at: null`. The admin email is identified by comparing each user's `role` field in `user_profiles` against `"admin"` (the same check used everywhere else in the codebase).

When no active version exists (step 1 returns no rows), every non-admin user receives `tc_ack_status: "no_version"` and `tc_ack_at: null`.

**Q3 — Per-session dedup mechanism for `ai_features_enabled`: client-side `useRef`.**

The dedup is implemented with a `useRef<boolean>` flag in `App.tsx` at the `Dashboard` component level. This ref persists across renders for the lifetime of the component but is destroyed and re-created on logout/login (because the `Dashboard` component unmounts on logout and remounts on next login). No `sessionStorage` is used.

The hook fires the `ai_features_enabled` log event on the first render where `activeTab === 'ai'`. A `useEffect` with `[activeTab]` dependency checks the ref before dispatching the API call:

```tsx
const aiTabLoggedRef = useRef(false)

useEffect(() => {
  if (activeTab === 'ai' && !aiTabLoggedRef.current) {
    aiTabLoggedRef.current = true
    api.post('/activity/log-action', {
      action_type: 'ai_features_enabled',
      detail: { tab: 'ai' },
    }).catch(() => {})
  }
}, [activeTab])
```

The POST call is fire-and-forget (`.catch(() => {})`). The ref is not reset if the user switches away and back — it fires exactly once per `Dashboard` mount, which corresponds to exactly once per session.

The endpoint `POST /api/activity/log-action` is a new lightweight subscriber-facing route (see Section 3.3 below). It accepts `action_type` and `detail` from the authenticated subscriber, validates that `action_type` is in the allowed client-callable subset, and delegates to `log_action()`.

**Rationale for `useRef` over `sessionStorage`:** `sessionStorage` survives component re-mounts within the same browser tab, which means a logout-and-login within the same tab would not fire the event again (the sessionStorage key would still be set). `useRef` correctly re-fires on each login because the component re-mounts. `sessionStorage` would only be preferable if we needed the flag to survive a full page refresh — but the spec says "once per session after login", and a page refresh constitutes a new session in this app's mental model (the user re-authenticates via Supabase's token refresh, which is automatic, but the `Dashboard` component re-mounts). `useRef` is the simpler, more correct choice. See ADR-0012.

---

## 1. Scope Summary

Four true new deliverables:

| # | Deliverable | Files touched |
|---|-------------|---------------|
| D1 | T&C ack status on `GET /admin/users` | `admin_routes.py`, `AdminPanel.tsx` (UserRow interface + Users tab columns) |
| D2 | `tc_acknowledged` event fired from `POST /api/legal/acknowledge` | `legal_routes.py`, `activity_logger.py`, migration 024 |
| D3 | "View Activity" cross-tab navigation button | `AdminPanel.tsx` (Users tab + UserActionsTab props) |
| D4 | `ai_features_enabled` backend registration + frontend session hook | `activity_logger.py`, migration 024, `admin_routes.py` (VALID_ACTION_TYPES), `App.tsx`, new `POST /api/activity/log-action` route |

Baselines (no code change, test coverage only): Stories 4, 7.

---

## 2. Database Migration

### Migration number: 024

The latest existing migration is `023_positions_strategy_unique.sql`. The new migration is `024_extend_action_types.sql`.

### Constraint analysis

Migration 015 defines the `action_type` column with an **inline** CHECK constraint. Inline constraints in Postgres are assigned a system-generated name of the form `<tablename>_<columnname>_check`. For `user_action_log.action_type`, the generated name is `user_action_log_action_type_check`.

Because the constraint is inline and was created without an explicit name, we cannot safely assume the generated name is stable across environments (it could vary if the table was re-created). The safe approach is:

1. Drop the constraint by its generated name, wrapped in a `DO $$ BEGIN ... EXCEPTION ... END $$` block so the migration is idempotent if the constraint was already dropped.
2. Add a new named constraint with the expanded value list.

Naming the new constraint explicitly (`user_action_log_action_type_valid`) ensures future migrations can reference it by a known, stable name.

### SQL — `backend/migrations/024_extend_action_types.sql`

```sql
-- Migration 024: extend user_action_log action_type CHECK constraint
-- Adds: tc_acknowledged, ai_features_enabled
-- Safe to run multiple times (idempotent via DO block).

DO $$
BEGIN
  -- Drop the inline constraint created by migration 015.
  -- Name is the Postgres default: <table>_<col>_check.
  ALTER TABLE public.user_action_log
    DROP CONSTRAINT IF EXISTS user_action_log_action_type_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add a new, explicitly-named constraint with the full value set.
ALTER TABLE public.user_action_log
  ADD CONSTRAINT user_action_log_action_type_valid
  CHECK (
    action_type IN (
      'login',
      'logout',
      'ticker_search',
      'strategy_scan',
      'options_chain_view',
      'paper_trade_placed',
      'watchlist_update',
      'ai_query',
      'tc_acknowledged',
      'ai_features_enabled'
    )
  );
```

This migration must be applied before the code that fires `tc_acknowledged` or `ai_features_enabled` is deployed. If the migration has not been applied when the new code fires an event, `log_action` catches the constraint-violation exception at the WARNING level and the event row is dropped — the user-facing flow is unaffected.

---

## 3. API Contracts

### 3.1 Modified: `GET /admin/users`

**File:** `backend/routes/admin_routes.py`, function `list_users`

No change to path, method, or authentication. Admin-only (existing `admin_required` dependency).

**Response shape change** — each element of the returned array gains two new fields:

```
Before:
{
  "id": "uuid",
  "email": "...",
  "full_name": "...",
  "avatar_url": "...",
  "role": "user" | "admin",
  "is_active": true,
  "created_at": "...",
  "cash": 100000.00 | null,
  "last_login_at": "..." | null,
  "login_count_today": 3
}

After (new fields in bold):
{
  ...(all existing fields),
  "tc_ack_status": "acknowledged" | "pending" | "no_version" | "exempt",
  "tc_ack_at": "2026-06-20T10:00:00Z" | null
}
```

`tc_ack_status` values:
- `"acknowledged"` — user has a row in `legal_acknowledgments` for the current active version.
- `"pending"` — user does not have such a row; they have not acknowledged the current version.
- `"no_version"` — no active version exists in `legal_document_versions`.
- `"exempt"` — user's `role == "admin"`; they bypass the legal gate.

`tc_ack_at` is the `acknowledged_at` timestamp from `legal_acknowledgments` when `tc_ack_status == "acknowledged"`, otherwise `null`.

**Implementation detail for `list_users`** — the following logic replaces the current body of `list_users` (the existing three queries for `user_profiles`, `portfolios`, and `activity_log` are retained; two new queries are appended):

```python
# Step 1: find the active legal version (safety: LIMIT 1 ORDER BY published_at DESC)
active_version = None
try:
    ver_rows = (
        sb.table("legal_document_versions")
        .select("id")
        .eq("is_active", True)
        .order("published_at", desc=True)
        .limit(1)
        .execute()
    )
    if ver_rows.data:
        active_version = ver_rows.data[0]["id"]
except Exception as e:
    logger.warning("list_users: failed to fetch active legal version: %s", e)

# Step 2: fetch all acknowledgments for the active version (single query)
ack_map: dict[str, str] = {}  # user_id -> acknowledged_at
if active_version:
    try:
        ack_rows = (
            sb.table("legal_acknowledgments")
            .select("user_id, acknowledged_at")
            .eq("version_id", active_version)
            .execute()
        )
        ack_map = {row["user_id"]: row["acknowledged_at"] for row in (ack_rows.data or [])}
    except Exception as e:
        logger.warning("list_users: failed to fetch legal_acknowledgments: %s", e)

# Step 3: assemble result rows
for p in profiles:
    uid = p["id"]
    is_admin = p.get("role") == "admin"
    if is_admin:
        tc_ack_status = "exempt"
        tc_ack_at = None
    elif active_version is None:
        tc_ack_status = "no_version"
        tc_ack_at = None
    elif uid in ack_map:
        tc_ack_status = "acknowledged"
        tc_ack_at = ack_map[uid]
    else:
        tc_ack_status = "pending"
        tc_ack_at = None
    result.append({
        **p,
        "cash": portfolios.get(uid, {}).get("cash"),
        "last_login_at": activity.get(uid, {}).get("last_login_at"),
        "login_count_today": activity.get(uid, {}).get("login_count", 0),
        "tc_ack_status": tc_ack_status,
        "tc_ack_at": tc_ack_at,
    })
```

This adds exactly two DB round-trips to the endpoint, regardless of subscriber count.

**Error responses:** unchanged from current behaviour.

---

### 3.2 Modified: `POST /api/legal/acknowledge`

**File:** `backend/routes/legal_routes.py`, function `acknowledge_legal`

No change to path, method, request body, or response shape. One new side-effect is added: after the successful `legal_acknowledgments` insert, fire a `tc_acknowledged` log event.

**Insertion point** — immediately after:
```python
ack_row = result.data[0] if result.data else {}
```

Add:
```python
import asyncio
from services.activity_logger import log_action

user_email = payload.get("email", "")
asyncio.create_task(log_action(
    user_id=user_id,
    user_email=user_email,
    action_type="tc_acknowledged",
    detail={
        "version_id":     version_id,
        "version_number": active["version_number"],
        "content_hash":   active["content_hash"],
    },
    ip_address=ip_address,
))
```

The `asyncio` import is added at module level in `legal_routes.py`. `log_action` is imported at the call site (inside the function body, following the pattern used elsewhere in the codebase for deferred imports, and to avoid circular imports at module level).

The early-return path (`if existing and existing.data: return {"already_acknowledged": True}`) deliberately does **not** fire `tc_acknowledged` — the event should record the first genuine acknowledgment, not a re-submission of an already-complete acknowledgment.

---

### 3.3 New: `POST /api/activity/log-action`

**File:** new file `backend/routes/activity_routes.py`

This is a thin subscriber-facing endpoint that allows the frontend to write specific whitelisted action types to `user_action_log`. It is not an admin endpoint — it is authenticated as a regular subscriber.

**Why a new route file:** `activity_logger.py` is a service, not a router. Adding a subscriber-facing log endpoint in `admin_routes.py` would be semantically incorrect (admin routes require `admin_required`). `auth_routes.py` already handles login/logout logging at the right level. A dedicated `activity_routes.py` keeps the separation clean.

**Endpoint:**

```
POST /api/activity/log-action
Auth: verify_token (any authenticated subscriber)
```

**Request body:**
```json
{
  "action_type": "ai_features_enabled",
  "detail": { "tab": "ai" }
}
```

**Allowed client-callable action types** (whitelist enforced server-side):
```python
CLIENT_CALLABLE_ACTION_TYPES = frozenset({"ai_features_enabled"})
```

Only `ai_features_enabled` is in this set for v1. The whitelist ensures subscribers cannot write arbitrary action types (e.g., `paper_trade_placed` with fabricated data) via this endpoint.

**Response (200 OK):**
```json
{ "ok": true }
```

**Error responses:**
- `422 Unprocessable Entity` — `action_type` not in `CLIENT_CALLABLE_ACTION_TYPES`.
- `401 Unauthorized` — invalid or missing JWT (handled by `verify_token` dependency).

**Implementation:**

```python
"""
Subscriber-facing activity logging endpoint.
Only client-callable action types (whitelist) are accepted.
"""
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth_utils import verify_token, get_user_id
from services.activity_logger import log_action, extract_ip

router = APIRouter()

CLIENT_CALLABLE_ACTION_TYPES = frozenset({"ai_features_enabled"})

class LogActionRequest(BaseModel):
    action_type: str
    detail: dict | None = None

@router.post("/activity/log-action")
async def subscriber_log_action(
    body: LogActionRequest,
    request,
    payload: dict = Depends(verify_token),
):
    if body.action_type not in CLIENT_CALLABLE_ACTION_TYPES:
        raise HTTPException(status_code=422, detail=f"action_type {body.action_type!r} is not client-callable")
    user_id = get_user_id(payload)
    user_email = payload.get("email", "")
    ip = extract_ip(request)
    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=user_email,
        action_type=body.action_type,
        detail=body.detail or {},
        ip_address=ip,
    ))
    return {"ok": True}
```

The router is registered in `backend/main.py` alongside the other routers.

---

### 3.4 Modified: `GET /admin/activity-log`

**File:** `backend/routes/admin_routes.py`, function `get_user_activity_log`

The `VALID_ACTION_TYPES` local set (defined inside the function body at line 473–476) must include the two new types:

```python
VALID_ACTION_TYPES = {
    "login", "logout", "ticker_search", "strategy_scan",
    "options_chain_view", "paper_trade_placed", "watchlist_update", "ai_query",
    "tc_acknowledged", "ai_features_enabled",   # ← add these two
}
```

Without this change, passing `action_type=tc_acknowledged` or `action_type=ai_features_enabled` as a query parameter would return HTTP 422.

---

## 4. Service-Layer Changes

### 4.1 `backend/services/activity_logger.py`

**Change:** Add two entries to `ACTION_TYPES`.

```python
ACTION_TYPES = frozenset({
    "login",
    "logout",
    "ticker_search",
    "strategy_scan",
    "options_chain_view",
    "paper_trade_placed",
    "watchlist_update",
    "ai_query",
    "tc_acknowledged",       # ← new
    "ai_features_enabled",   # ← new
})
```

No other changes to this file. The `log_action` function, `extract_ip` function, and the fire-and-forget exception-handling pattern are unchanged.

### 4.2 No changes to `legal_service.py`

The existing `get_active_version()` function in `legal_service.py` already returns the active version row (with `id`, `version_number`, `content_hash`). `legal_routes.py` already calls this function and stores the result in `active`. No changes to `legal_service.py` are required.

---

## 5. Frontend State Management

### 5.1 "View Activity" Cross-Tab Navigation (D3)

**Decision:** Internal React state (not URL routing). See ADR-0012 for rationale.

**Current tab management in `AdminPanel`:** `activeTab` is a `useState<AdminTab>` owned by the `AdminPanel` component. `UserActionsTab` is currently rendered as `<UserActionsTab />` with no props (line 565 of `AdminPanel.tsx`).

**Required changes to `AdminPanel`:**

1. Lift a `userActionsInitialEmail` state into `AdminPanel`:
   ```tsx
   const [userActionsInitialEmail, setUserActionsInitialEmail] = useState<string>('')
   ```

2. Add a `handleViewActivity(email: string)` callback in `AdminPanel`:
   ```tsx
   const handleViewActivity = useCallback((email: string) => {
     setUserActionsInitialEmail(email)
     setActiveTab('user_actions')
   }, [])
   ```

3. Pass `initialEmail` and `onEmailConsumed` props to `UserActionsTab`:
   ```tsx
   {activeTab === 'user_actions' && (
     <UserActionsTab
       initialEmail={userActionsInitialEmail}
       onEmailConsumed={() => setUserActionsInitialEmail('')}
     />
   )}
   ```

4. Add a "View Activity" button to each subscriber row in the Users tab:
   ```tsx
   <td style={s.td}>
     <button
       style={s.viewActivityBtn}
       onClick={() => handleViewActivity(u.email)}
     >
       View Activity
     </button>
   </td>
   ```
   The Users table `<thead>` gains a ninth column header (empty string `''` or `'Actions'` is acceptable).

5. `s.viewActivityBtn` style:
   ```tsx
   viewActivityBtn: {
     background: 'transparent',
     border: '1px solid #7c6af744',
     borderRadius: '6px',
     color: '#7c6af7',
     padding: '3px 10px',
     fontSize: '12px',
     cursor: 'pointer',
     fontFamily: font,
   }
   ```

**Changes to `UserActionsTab` component:**

`UserActionsTab` currently accepts no props. Its new signature:

```tsx
interface UserActionsTabProps {
  initialEmail?: string
  onEmailConsumed?: () => void
}

function UserActionsTab({ initialEmail = '', onEmailConsumed }: UserActionsTabProps) {
```

Inside `UserActionsTab`, a `useEffect` watches `initialEmail`:
```tsx
useEffect(() => {
  if (initialEmail) {
    setFilters(f => ({ ...f, user_email: initialEmail }))
    setAppliedFilters(f => ({ ...f, user_email: initialEmail }))
    setPage(1)
    onEmailConsumed?.()
  }
}, [initialEmail, onEmailConsumed])
```

Setting both `filters` (the input field value) and `appliedFilters` (the value that triggers the API call) simultaneously ensures the email field is visually populated and the search auto-executes. `onEmailConsumed` resets the parent's `userActionsInitialEmail` to `''` so that if the admin navigates back to Users and clicks "View Activity" for the same user again, the `useEffect` fires again (because the value went `email` → `''` → `email`).

**Why `appliedFilters` is set directly (not via `handleApply`):** `handleApply` is a local function and cannot be called from inside `useEffect` without creating a circular dependency. Setting `appliedFilters` directly is the correct React pattern — it triggers the `useEffect([appliedFilters, page, fetchData])` that calls `fetchData`.

### 5.2 T&C Acknowledgment Status Columns (D1)

**`UserRow` interface in `AdminPanel.tsx`** (the local interface at line 20, not in `client.ts`):

```tsx
interface UserRow {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  is_active: boolean
  created_at: string
  cash: number | null
  last_login_at: string | null
  login_count_today: number
  tc_ack_status: 'acknowledged' | 'pending' | 'no_version' | 'exempt'  // ← new
  tc_ack_at: string | null                                                // ← new
}
```

**Users table header row** — add two new `<th>` entries:
```
['Name', 'Email', 'Role', 'Cash', 'Last Login', "Today's Logins", 'Status', 'T&C Status', '']
```

**Users table body** — add a new `<td>` per row between the Status column and the existing actions column:
```tsx
<td style={s.td}>
  <TcAckBadge status={u.tc_ack_status} ackedAt={u.tc_ack_at} />
</td>
```

`TcAckBadge` is a small inline helper function defined at the top of the file:

```tsx
function TcAckBadge({ status, ackedAt }: { status: string; ackedAt: string | null }) {
  if (status === 'exempt') {
    return <span style={{ fontSize: '11px', color: '#64748b' }}>Exempt</span>
  }
  if (status === 'no_version') {
    return <span style={{ fontSize: '11px', color: '#64748b' }}>No version published</span>
  }
  if (status === 'acknowledged') {
    return (
      <span style={{ fontSize: '11px', color: '#22c55e' }}>
        Acknowledged{ackedAt ? ` ${new Date(ackedAt).toLocaleDateString()}` : ''}
      </span>
    )
  }
  // pending
  return <span style={{ fontSize: '11px', color: '#f97316' }}>Pending</span>
}
```

Spec requirement 2 (clicking the status indicator opens the User Actions tab pre-filtered to `tc_acknowledged`): this is an enhancement layered on top of the "View Activity" button from D3. Making the ack-status badge itself clickable with pre-filtering to `tc_acknowledged` is a UX addition, but the spec reads it as a separate AC (AC Story 1.2 — "Clicking the subscriber's acknowledgment status indicator must open the User Actions tab pre-filtered to that subscriber's email and to the `tc_acknowledged` action type"). This requires `handleViewActivity` to also optionally accept an `actionType` parameter:

```tsx
const handleViewActivity = useCallback((email: string, actionType?: string) => {
  setUserActionsInitialEmail(email)
  setUserActionsInitialActionType(actionType ?? '')
  setActiveTab('user_actions')
}, [])
```

A second piece of state `userActionsInitialActionType` is added to `AdminPanel`, and `UserActionsTab` gains a corresponding `initialActionType?: string` prop, handled in the same `useEffect` as `initialEmail`.

The `TcAckBadge` when status is `'acknowledged'` or `'pending'` renders as a clickable span:
```tsx
onClick={() => onViewActivity(u.email, 'tc_acknowledged')}
```
where `onViewActivity` is threaded down as a prop to the row or via the parent table's inline handler.

For simplicity, the "View Activity" button handles the generic case (no action type filter), and clicking the T&C status badge sets both email and action type filters. Both use the same `handleViewActivity` callback.

### 5.3 `ACTION_TYPES` Array in `AdminPanel.tsx`

The `ACTION_TYPES` array at line 894 gains two entries:

```tsx
const ACTION_TYPES = [
  'login',
  'logout',
  'ticker_search',
  'strategy_scan',
  'options_chain_view',
  'paper_trade_placed',
  'watchlist_update',
  'ai_query',
  'tc_acknowledged',      // ← new
  'ai_features_enabled',  // ← new
]
```

This array populates the action-type filter dropdown in `UserActionsTab`. No change to the rendering logic is needed — the `{ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}` expression already handles new entries.

### 5.4 `ai_features_enabled` Frontend Session Hook (D4)

**File:** `frontend/src/App.tsx`, inside the `Dashboard` component.

Add a `useRef` flag and a `useEffect` watching `activeTab`:

```tsx
const aiTabLoggedRef = useRef(false)

useEffect(() => {
  if (activeTab === 'ai' && !aiTabLoggedRef.current) {
    aiTabLoggedRef.current = true
    api.post('/activity/log-action', {
      action_type: 'ai_features_enabled',
      detail: { tab: 'ai' },
    }).catch(() => {})
  }
}, [activeTab])
```

Placement: after the existing `useEffect(() => { if (!aiEnabled && activeTab === 'ai') setActiveTab('chain') }, [aiEnabled, activeTab])` block (approximately line 106–108 of current `App.tsx`).

The ref is declared alongside the other refs in the `Dashboard` component body. No prop drilling is required — `api` is already imported in `App.tsx`.

**What "session" means:** The `Dashboard` component mounts on successful login (after `user` and `profile` are non-null) and unmounts on logout. The `useRef` is therefore scoped to the login session. If the user logs out and back in without a page refresh, the `Dashboard` re-mounts and `aiTabLoggedRef` is initialised to `false` again — correct behaviour.

The `aiTabLoggedRef.current = true` line runs before the `api.post` call so that even if the component re-renders between the `useEffect` firing and the API call completing, the flag is already set and a second call is not made.

---

## 6. New Route File Registration

**File:** `backend/main.py`

Import and include the new `activity_routes` router:

```python
from routes.activity_routes import router as activity_router
app.include_router(activity_router, prefix="/api")
```

This must be added alongside the existing `include_router` calls. The prefix `/api` matches the convention used for all other subscriber-facing routes.

---

## 7. Caching Strategy

No caching is introduced for any of the endpoints changed by this feature.

**`GET /admin/users` rationale:** Admin endpoints are used by a single operator with low frequency (the Users tab loads on tab-click, not on a timer). The subscriber list and acknowledgment status change infrequently. Adding a cache would create staleness risk for the compliance-critical ack status column. The cost of two extra DB queries per admin tab load (one for `legal_document_versions`, one for `legal_acknowledgments`) is negligible given the expected load.

**`POST /api/legal/acknowledge` rationale:** This is a write endpoint. Write endpoints are not cached.

**`POST /api/activity/log-action` rationale:** This is a write endpoint. Write endpoints are not cached.

**`legal_service.get_active_version()` existing 60-second cache:** The existing in-process cache in `legal_service.py` is used by `POST /api/legal/acknowledge` (via `get_active_version()`). This cache is not affected by this feature. The new `list_users` code performs its own direct DB query for the active version (one query) rather than going through the `legal_service` cache, because `list_users` needs the raw `id` field and the cache may not be warm on cold start. This is acceptable given the very low frequency of admin Users tab loads.

---

## 8. External Dependency Impact

This feature introduces no new external API calls. No changes to yfinance, the Claude API, or Reddit PRAW. No new quota risk. Supabase queries are additive (two extra queries on `GET /admin/users`, one extra insert on `POST /api/legal/acknowledge`, and one insert from the new subscriber route). All Supabase writes use the service-role key, server-side only.

---

## 9. Auth and Security

- `GET /admin/users` and `GET /admin/activity-log`: protected by `admin_required` (existing). No change.
- `POST /api/legal/acknowledge`: protected by `verify_token` (existing). No change.
- `POST /api/activity/log-action`: protected by `verify_token`. The `action_type` whitelist (`CLIENT_CALLABLE_ACTION_TYPES`) prevents subscribers from injecting arbitrary event types. The `user_id` and `user_email` are always taken from the verified JWT — the subscriber cannot log events for another user. The `detail` field is free-form but is only written to `user_action_log`, which is admin-read-only.
- `SUPABASE_JWT_SECRET`: not used. Auth continues via `sb.auth.get_user(token)` as per invariant.
- `MARKETDATA_API_TOKEN`: not touched.
- No secrets are exposed to the frontend.

---

## 10. Changed Files Summary

| File | Change type | Description |
|------|-------------|-------------|
| `backend/migrations/024_extend_action_types.sql` | New file | Drop inline CHECK constraint; add named constraint with `tc_acknowledged` and `ai_features_enabled` |
| `backend/services/activity_logger.py` | Modify | Add `tc_acknowledged` and `ai_features_enabled` to `ACTION_TYPES` frozenset |
| `backend/routes/legal_routes.py` | Modify | After successful `legal_acknowledgments` insert, fire `asyncio.create_task(log_action(..., "tc_acknowledged", ...))` |
| `backend/routes/admin_routes.py` | Modify | (1) `list_users`: add two DB queries + `tc_ack_status`/`tc_ack_at` fields to response; (2) `get_user_activity_log`: add `tc_acknowledged` and `ai_features_enabled` to `VALID_ACTION_TYPES` set |
| `backend/routes/activity_routes.py` | New file | `POST /api/activity/log-action` subscriber endpoint |
| `backend/main.py` | Modify | Register `activity_routes` router with `/api` prefix |
| `frontend/src/components/AdminPanel.tsx` | Modify | (1) `UserRow` interface: add `tc_ack_status`, `tc_ack_at`; (2) Users tab: add T&C Status column and "View Activity" button; (3) Lift `userActionsInitialEmail` + `userActionsInitialActionType` state; (4) Add `handleViewActivity` callback; (5) Pass `initialEmail`/`initialActionType`/`onEmailConsumed` props to `UserActionsTab`; (6) `UserActionsTab`: add props and `useEffect` to consume them; (7) `ACTION_TYPES` array: add two new entries |
| `frontend/src/App.tsx` | Modify | Add `aiTabLoggedRef` + `useEffect` to fire `ai_features_enabled` on first AI tab open per session |

**Files that do not change:**
- `backend/services/legal_service.py`
- `backend/services/auth_utils.py`
- `backend/services/db.py`
- `frontend/src/api/client.ts` — the `UserRow` interface in `client.ts` is not used by `AdminPanel.tsx` (which defines its own local `UserRow` interface). No change needed.
- `.github/workflows/purge-user-action-log.yml` — 30-day retention confirmed correct.
- All existing migrations.

---

## 11. ADRs Written

Two ADRs accompany this design:

- `docs/adr/0012-view-activity-navigation-internal-state.md` — Internal React state (not URL routing) for "View Activity" cross-tab navigation.
- `docs/adr/0013-ai-tab-session-dedup-useref.md` — `useRef` (not `sessionStorage`) for `ai_features_enabled` per-session deduplication.

---

## 12. Acceptance Criteria Coverage

| Story | AC | Covered by |
|-------|----|------------|
| Story 1 | AC1 — three status values | `tc_ack_status` field + `TcAckBadge` component |
| Story 1 | AC2 — date shown on ack | `tc_ack_at` field rendered in `TcAckBadge` |
| Story 1 | AC3 — "Pending" with no date | `tc_ack_status: "pending"`, `tc_ack_at: null` |
| Story 1 | AC4 — "No version published" | `tc_ack_status: "no_version"` path |
| Story 1 | AC5 — single round trip | Two extra DB queries in `list_users`; one API call from frontend |
| Story 3 | AC1 — `tc_acknowledged` row in log | `log_action` call in `acknowledge_legal` |
| Story 3 | AC2 — filterable in UserActionsTab | `ACTION_TYPES` array and `VALID_ACTION_TYPES` set updated |
| Story 3 | AC3 — immutable | Existing `user_action_log` RLS; `log_action` is insert-only |
| Story 3 | AC4 — fire-and-forget | `asyncio.create_task`; acknowledgment insert is not rolled back |
| Story 5 | AC1 — all 10 types in dropdown | `ACTION_TYPES` array |
| Story 5 | AC2–AC4 — filter behaviour | Existing `UserActionsTab` logic; `VALID_ACTION_TYPES` set |
| Story 6 | AC1 — "View Activity" button | Button in Users tab |
| Story 6 | AC2 — switches tab + pre-fills email | `handleViewActivity` + `UserActionsTab` `useEffect` |
| Story 6 | AC3 — filtered to subscriber email | `initialEmail` prop consumed by `useEffect` sets `appliedFilters` |
| Story 6 | AC4 — clearing filter returns unfiltered | User edits the filter field directly; no lock-in |
| Story 6 | AC5 — no events → "No results" | Existing `UserActionsTab` empty-state rendering |
| Story 8 | AC1 — `ai_features_enabled` event | `useRef` hook in `App.tsx` + `POST /api/activity/log-action` |
| Story 8 | AC2 — fires once per session | `aiTabLoggedRef.current` checked before dispatch |
| Story 8 | AC3 — distinct from `ai_query` | Separate action type; separate DB row |

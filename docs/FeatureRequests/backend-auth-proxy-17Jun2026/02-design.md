# Architecture Design — Backend Auth Proxy Refactor

**Date:** 18Jun2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

This refactor moves every Supabase auth operation — OAuth initiation, code exchange, token
storage, token refresh, and session verification — from the browser into the FastAPI backend.
After the change the browser communicates exclusively with `optionscompass.up.railway.app`;
no JavaScript in the frontend ever reads, writes, or transmits a Supabase token. Tokens
transition from `localStorage` + `Authorization: Bearer` headers to `HttpOnly; Secure;
SameSite=Lax` cookies that are invisible to JavaScript. Four new endpoints are added
(`GET /api/auth/google`, `GET /api/auth/callback`, `GET /api/auth/session`,
`POST /api/auth/email-login`). The existing `verify_token` dependency is rewritten to read
the `sb_access_token` cookie first, with a backwards-compatible header fallback for the
transition window. `AuthContext.tsx` is rewritten to poll `GET /api/auth/session` instead
of subscribing to the `supabase-js` auth state machine. The `supabase-js` package is
retained as a dev/build dependency solely for its TypeScript types and the existing admin
Supabase client calls; it is never initialised with real credentials in production frontend
bundles. No database schema changes are required. No tier limits or business logic routes
change. The one external-dependency risk (Supabase refresh token single-use semantics) is
addressed by a server-side per-user in-memory refresh lock, documented in Section 6.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/routes/auth_routes.py` | Modified | Add `GET /api/auth/google`, `GET /api/auth/callback`, `GET /api/auth/session`, `POST /api/auth/email-login`; update `POST /api/auth/logout` to clear cookies and call Supabase sign-out; extract `_sync_profile()` shared helper |
| `backend/services/auth_utils.py` | Modified | Rewrite `verify_token` to read `sb_access_token` cookie; add `Authorization` header fallback; add `_refresh_access_token()` helper; add per-user in-memory refresh lock |
| `backend/main.py` | Modified | Confirm `allow_credentials=True` and explicit origin list (no changes needed to existing content; one new env var `FRONTEND_ORIGIN` for operator override is documented) |
| `backend/requirements.txt` | Modified | Add `python-dotenv` if not present (already present); no new packages required — `httpx` is used for the Supabase token exchange call; verify it is listed |
| `frontend/src/context/AuthContext.tsx` | Modified | Full rewrite: remove `supabase-js` auth calls, poll `GET /api/auth/session`, expose same public interface |
| `frontend/src/api/client.ts` | Modified | Add `withCredentials: true` to Axios instance; remove `Authorization` header injection; remove `supabase.auth.refreshSession()` interceptor |
| `frontend/src/lib/supabase.ts` | Modified | Remove real credential initialisation; export a no-op placeholder or remove entirely after auditing all import sites |
| `frontend/e2e/fixtures/auth.ts` | Modified | Remove `localStorage` injection and Supabase URL intercepts; stub `GET /api/auth/session` |
| `frontend/e2e/mock-data.ts` | Modified | Add `MOCK_SESSION_RESPONSE` export for the new session endpoint shape |

---

## 3. Database Schema Changes

None. This feature touches no tables. No migration is required.

---

## 4. Auth Flow Diagrams

### 4a. Google OAuth (new)

```
Browser                     FastAPI Backend              Supabase / Google
  |                               |                              |
  | GET /api/auth/google          |                              |
  |------------------------------>|                              |
  |                               | Build Supabase OAuth URL     |
  |                               | redirect_uri =               |
  |                               | .../api/auth/callback        |
  | 302 → Supabase OAuth URL      |                              |
  |<------------------------------|                              |
  |                               |                              |
  | (browser follows redirect to Supabase, then to Google)       |
  |                               |                              |
  | GET /api/auth/callback?code=X |                              |
  |------------------------------>|                              |
  |                               | POST /auth/v1/token          |
  |                               | grant_type=pkce or           |
  |                               | authorization_code           |
  |                               |----------------------------->|
  |                               |   {access_token,             |
  |                               |    refresh_token, user}      |
  |                               |<-----------------------------|
  |                               | _sync_profile(user, token)   |
  |                               | (whitelist check, upsert,    |
  |                               |  portfolio ensure, log)      |
  |                               |                              |
  | 302 → frontend /              |                              |
  | Set-Cookie: sb_access_token   |                              |
  | Set-Cookie: sb_refresh_token  |                              |
  |<------------------------------|                              |
  |                               |                              |
  | GET / (authenticated)         |                              |
  |------------------------------>|                              |
```

### 4b. Email / Password Sign-In (new)

```
Browser                     FastAPI Backend              Supabase
  |                               |                              |
  | POST /api/auth/email-login    |                              |
  | {email, password}             |                              |
  |------------------------------>|                              |
  |                               | POST /auth/v1/token          |
  |                               | grant_type=password          |
  |                               |----------------------------->|
  |                               |   {access_token,             |
  |                               |    refresh_token, user}      |
  |                               |<-----------------------------|
  |                               | _sync_profile(user, token)   |
  |                               |                              |
  | 200 {ok, email, role, ...}    |                              |
  | Set-Cookie: sb_access_token   |                              |
  | Set-Cookie: sb_refresh_token  |                              |
  |<------------------------------|                              |
```

### 4c. Authenticated Request (new, any protected endpoint)

```
Browser                     FastAPI Backend              Supabase
  |                               |                              |
  | GET /api/strategies/analyze   |                              |
  | Cookie: sb_access_token=...   |                              |
  |------------------------------>|                              |
  |                               | verify_token():              |
  |                               |   read sb_access_token       |
  |                               |   check expiry               |
  |                               |   if near expiry → refresh   |
  |                               |   sb.auth.get_user(token)    |
  |                               |----------------------------->|
  |                               |   {user}                     |
  |                               |<-----------------------------|
  |                               | _is_deactivated(user_id)     |
  |                               | handle request...            |
  |                               |                              |
  | 200 {...}                     |                              |
  | (Set-Cookie only if refreshed)|                              |
  |<------------------------------|                              |
```

### 4d. Token Refresh (transparent, inline within verify_token)

```
Backend verify_token()
  |
  | decode JWT header (no signature verify — just read exp claim)
  | if exp - now() < 300 seconds:
  |   acquire per-user refresh lock (non-blocking, 10 s TTL)
  |   if lock acquired:
  |     POST Supabase /auth/v1/token (grant_type=refresh_token)
  |     if success:
  |       update cookies on Response object
  |       release lock
  |     if failure (single-use token already consumed):
  |       release lock
  |       proceed with original token if still valid
  |       if original token expired: raise HTTP 401
  |   if lock not acquired (another coroutine is refreshing):
  |     wait up to 2 s for lock to release
  |     re-read cookie from request (may have been updated)
  |     proceed with whatever token is now present
```

### 4e. Logout (updated)

```
Browser                     FastAPI Backend              Supabase
  |                               |                              |
  | POST /api/auth/logout         |                              |
  | Cookie: sb_access_token=...   |                              |
  |------------------------------>|                              |
  |                               | sb.auth.sign_out(token)      |
  |                               |----------------------------->|
  |                               |   ok                         |
  |                               |<-----------------------------|
  |                               | log_action(logout)           |
  |                               |                              |
  | 200 {ok: true}                |                              |
  | Set-Cookie: sb_access_token=; |                              |
  |   Max-Age=0; HttpOnly         |                              |
  | Set-Cookie: sb_refresh_token= |                              |
  |   ; Max-Age=0; HttpOnly       |                              |
  |<------------------------------|                              |
```

---

## 5. New and Changed Backend Endpoints

### `GET /api/auth/google`

**Auth required:** No

**Purpose:** Initiates the Google OAuth flow by redirecting the browser to Supabase's OAuth
URL with the backend callback as the redirect_uri.

**Request:** No body. No query parameters.

**Response (302):**
- `Location` header: Supabase OAuth URL of the form
  `https://<project>.supabase.co/auth/v1/authorize?provider=google&redirect_to=https://optionscompass.up.railway.app/api/auth/callback`
- No cookies set at this stage.

**Error responses:**

| Status | Condition |
|--------|-----------|
| 500 | `SUPABASE_URL` env var missing; cannot construct redirect URL |

**Implementation note:** The Supabase OAuth URL is constructed by calling
`sb.auth.sign_in_with_oauth(provider="google", redirect_to=CALLBACK_URL)` and returning
the `url` field. The FastAPI handler returns `RedirectResponse(url=oauth_url, status_code=302)`.

---

### `GET /api/auth/callback`

**Auth required:** No

**Purpose:** Receives the OAuth authorization code from Google (via Supabase), exchanges it
for tokens server-side, syncs the user profile, and sets httpOnly cookies before redirecting
to the frontend root.

**Request:** Query parameters supplied by Supabase:
- `code` (str) — authorization code
- `state` (str, optional) — PKCE state parameter

**Response (302 on success):**
- `Location: https://optionscompass.up.railway.app/` (or `FRONTEND_ORIGIN` env var)
- `Set-Cookie: sb_access_token=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`
- `Set-Cookie: sb_refresh_token=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`

**Response (302 on error):**
- `Location: https://optionscompass.up.railway.app/?auth_error=callback_failed`
- No cookies set.

**Error responses:**

| Status | Condition |
|--------|-----------|
| 302 to `/?auth_error=callback_failed` | Supabase code exchange fails (invalid/expired code) |
| 302 to `/?auth_error=account_suspended` | `deactivated_at IS NOT NULL` for the resolved user |
| 302 to `/?auth_error=invite_only` | Platform is in invite_only_mode and user is not whitelisted |
| 302 to `/?auth_error=maintenance` | Platform is in maintenance_mode and user is not staff |

**Implementation note:** All error conditions redirect rather than returning HTTP 4xx because
the browser's address bar is on the backend callback URL at this point; returning a JSON error
would show a blank API response to the user. Redirecting with a query parameter allows the
frontend to detect and display the appropriate error message from the URL.

The code exchange uses the `supabase-py` admin client:
```python
result = sb.auth.exchange_code_for_session({"auth_code": code})
```
After a successful exchange, `_sync_profile(request, result.session.user, result.session.access_token)`
is called to run the full profile-upsert, whitelist-check, portfolio-ensure, and activity-log
sequence. Cookies are then set on the `RedirectResponse` object.

---

### `GET /api/auth/session`

**Auth required:** Cookie (`sb_access_token`). Returns 401 if cookie absent or invalid.

**Purpose:** Replaces `supabase.auth.getSession()` in the frontend. Called on page mount,
window focus, and after any navigation. Returns the complete user context the frontend
needs to render the authenticated state.

**Request:** No body. Cookie `sb_access_token` must be present.

**Response (200):**
```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "full_name": "Alice Smith",
  "avatar_url": "https://...",
  "role": "user",
  "is_admin": false,
  "onboarding_completed": true,
  "onboarding_step": "complete",
  "pending_legal_acknowledgment": false,
  "subscription_tier": "pro"
}
```

All fields are always present. `full_name` and `avatar_url` may be `null`. `subscription_tier`
is read from `user_profiles.role` or the entitlements service; it is `"free"` when no
subscription row exists.

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | `sb_access_token` cookie absent |
| 401 | Token rejected by `sb.auth.get_user()` (expired or invalid) |
| 401 | Both access token expired AND refresh token expired/invalid |
| 403 | `deactivated_at IS NOT NULL` for this user (account suspended) |

**Transparent refresh behaviour:** Before calling `sb.auth.get_user()`, `verify_token`
inspects the JWT `exp` claim. If the token expires within 300 seconds, a background refresh
is attempted (see Section 6). If the refresh succeeds, the refreshed token is used for the
`get_user` call and both cookies are updated on the response. The 200 payload is identical
whether or not a refresh occurred.

**Implementation note:** This endpoint calls `verify_token` via `Depends`, reads the user
profile from `user_profiles`, derives `is_admin`, and returns the combined payload. The
deactivation check inside `verify_token` handles the 403 case transparently.

---

### `POST /api/auth/email-login`

**Auth required:** No (credentials in request body)

**Purpose:** Exchanges email + password for Supabase tokens and sets httpOnly cookies.
Runs the same `_sync_profile` sequence as the OAuth callback. Replaces the frontend-side
`supabase.auth.signInWithPassword()` call for all authenticated state.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

**Response (200):**
```json
{
  "ok": true,
  "email": "user@example.com",
  "role": "user",
  "onboarding_completed": true,
  "onboarding_step": "complete",
  "is_deactivated": false,
  "pending_legal_acknowledgment": false
}
```

Cookies set on the response (same spec as callback):
- `Set-Cookie: sb_access_token=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`
- `Set-Cookie: sb_refresh_token=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | Supabase rejects credentials ("Invalid login credentials") |
| 403 | Account suspended (`deactivated_at IS NOT NULL`) |
| 503 | Platform maintenance_mode active and user is not staff |
| 400 | Missing `email` or `password` field (Pydantic validation) |

**Implementation note:** Uses the Supabase admin client to call
`sb.auth.sign_in_with_password({"email": email, "password": password})`. On success, runs
`_sync_profile`. On Supabase `AuthApiError`, maps to HTTP 401.

---

### `POST /api/auth/login` (existing — updated behaviour)

**Auth required:** Yes — `verify_token` dependency (reads cookie, falls back to header)

**Purpose:** Retained for backward compatibility. After the refactor, the frontend will not
call this endpoint on the Google OAuth path (the callback handler calls `_sync_profile`
directly). The endpoint remains for any client that still uses header-based auth during the
transition window, and is the sync-profile trigger for the email-login path in existing
integrations.

No changes to the response shape. The `_sync_profile` extraction means the implementation
body shrinks to call that helper and return its result.

---

### `POST /api/auth/logout` (existing — updated behaviour)

**Auth required:** Yes — `verify_token` dependency (reads cookie, falls back to header)

**Additions:**
1. Calls `sb.auth.sign_out(access_token)` before logging the event.
2. Sets both cookies to expired empty values on the response.

**Response (200):** `{"ok": true}` — unchanged.

Cookie clearing headers added:
- `Set-Cookie: sb_access_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
- `Set-Cookie: sb_refresh_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`

**Note on Supabase sign-out failure:** If `sb.auth.sign_out()` raises, the error is logged
but not re-raised. The cookies are cleared regardless. The session may linger in Supabase's
server-side session store until natural expiry, but the client-side credential is gone.

---

## 6. Cookie Specification

Both cookies are set identically on every endpoint that issues tokens (callback, email-login)
and cleared on logout. Refresh updates both cookies in-place with new values and the same
attributes.

| Attribute | `sb_access_token` | `sb_refresh_token` |
|-----------|-------------------|--------------------|
| Name | `sb_access_token` | `sb_refresh_token` |
| Value | Supabase JWT access token | Supabase opaque refresh token |
| HttpOnly | `true` | `true` |
| Secure | `true` (enforced outside localhost) | `true` (enforced outside localhost) |
| SameSite | `Lax` | `Lax` |
| Path | `/` | `/` |
| Max-Age | `3600` (1 hour, matches Supabase JWT TTL) | `604800` (7 days) |
| Domain | Not set (browser uses request origin) | Not set |

**Localhost exception:** When `ENVIRONMENT=development` (or equivalent detection), the
`Secure` attribute may be omitted so that local `http://localhost:5173` development works
without HTTPS. The FastAPI `set_cookie` calls must check the environment and omit `secure=True`
accordingly.

**Cookie name rationale:** The prefix `sb_` signals Supabase provenance without colliding
with the Supabase JS client's own storage key pattern (`sb-<project-ref>-auth-token`). The
names are not meaningful to the browser; the names prevent confusion during the transition
period when both the old localStorage keys and the new cookies might coexist briefly.

**Max-Age selection:** 7 days for the refresh token matches Supabase's default refresh token
rotation window. If the user closes their browser and reopens within 7 days, the refresh
token cookie survives (it is persistent, not session-scoped) and `GET /api/auth/session` will
transparently exchange it for a fresh access token. After 7 days the user must re-authenticate.
This is consistent with the spec's requirement that session restore works across tab closes.

---

## 7. Changes to `verify_token` and `auth_utils.py`

### Current implementation

`verify_token` uses `HTTPBearer(auto_error=False)` to extract the `Authorization: Bearer`
header and calls `sb.auth.get_user(token)`.

### New implementation

`verify_token` changes its signature to accept a `Request` object instead of an
`HTTPAuthorizationCredentials` object. It must be changed from a `Security()`-decorated
parameter to a `Depends()` with the `Request` injected:

```python
from fastapi import Request

async def verify_token(request: Request) -> dict:
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
    refreshed_tokens = await _maybe_refresh(token, request)
    if refreshed_tokens:
        token = refreshed_tokens["access_token"]
        # Store refreshed tokens on request.state for the response middleware
        request.state.new_access_token = refreshed_tokens["access_token"]
        request.state.new_refresh_token = refreshed_tokens["refresh_token"]

    # 4. Verify with Supabase
    try:
        result = sb.auth.get_user(token)
        user = result.user
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    # 5. Deactivation check (unchanged)
    if _is_deactivated(user.id):
        raise HTTPException(status_code=403, detail="Account suspended")

    return {
        "sub": user.id,
        "email": user.email,
        "user_metadata": user.user_metadata or {},
        "app_metadata": user.app_metadata or {},
    }
```

**All existing route handlers that use `Depends(verify_token)` require no change.** The
`payload: dict = Depends(verify_token)` pattern continues to work because the dependency
signature change is transparent to the caller.

The old `security = HTTPBearer(auto_error=False)` declaration is removed. The
`HTTPAuthorizationCredentials` import is removed.

### Cookie update on refresh: response middleware

When `request.state.new_access_token` is set, a FastAPI middleware intercepts the response
and calls `response.set_cookie(...)` for both cookies. This is the cleanest way to inject
cookie updates from inside a dependency without coupling every route handler to cookie logic.

```python
# In main.py, registered after all routers
@app.middleware("http")
async def attach_refreshed_cookies(request: Request, call_next):
    response = await call_next(request)
    new_at = getattr(request.state, "new_access_token", None)
    new_rt = getattr(request.state, "new_refresh_token", None)
    if new_at:
        _set_auth_cookies(response, new_at, new_rt)
    return response
```

`_set_auth_cookies` is a shared helper (defined in `auth_utils.py` or a new
`backend/services/cookie_utils.py`) that calls `response.set_cookie` with the full attribute
set from Section 6.

### Backward-compatibility header fallback

The header fallback (step 2 above) remains in place until the frontend deployment is
confirmed. The removal of the header fallback is a separate one-line change to `verify_token`
that the implementor should do as a follow-up commit labelled "remove Bearer header fallback"
once both services are running on the new code.

---

## 8. Token Refresh Strategy

### Expiry detection

The JWT `exp` claim is read from the token payload without verifying the signature (the
signature verification is Supabase's responsibility via `get_user`). The token is base64-
decoded using Python's `base64.urlsafe_b64decode` on the second segment (payload). This is
safe because the value is used only to decide whether to attempt a refresh; Supabase's own
`get_user` is the authoritative validity check.

```python
import base64, json, time

def _get_token_exp(token: str) -> int | None:
    try:
        payload_b64 = token.split(".")[1]
        # Add padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64)).get("exp")
    except Exception:
        return None
```

If the `exp` claim cannot be parsed (malformed token), the refresh is skipped and `get_user`
will reject the token, producing an HTTP 401.

Refresh is triggered when `exp - time.time() < 300` (token expires within 5 minutes).

### Refresh call

The Supabase token refresh endpoint is called via the `supabase-py` admin client:

```python
result = sb.auth.refresh_session(refresh_token)
# result.session.access_token, result.session.refresh_token
```

The refresh token is read from the `sb_refresh_token` cookie on `request.cookies`.

### Concurrent-tab race condition — design decision

**Decision: server-side per-user in-memory refresh lock with 10-second TTL.**

**Rationale from PO ruling:** The PO required a concrete decision before implementation.
The options were:

1. Accept occasional multi-tab 401 and re-auth. Low implementation cost. The PO noted
   this is "marginally acceptable" for a paper-trading app, but also flagged that POST routes
   (order placement, position recording) must not silently lose data.

2. Server-side per-user refresh lock. Prevents the double-refresh race. Moderate cost.

Given that `POST /api/orders`, `POST /api/trades/record`, and `POST /api/auth/email-login`
are all write operations where a mid-request 401 would drop the user's action silently,
option 2 is required. A user placing a paper trade in one tab while a background refresh
fires in a second tab must not lose that trade entry.

**Lock implementation:**

```python
import asyncio
import time

_refresh_locks: dict[str, asyncio.Lock] = {}
_refresh_lock_ts: dict[str, float] = {}
_REFRESH_LOCK_TTL = 10.0  # seconds

def _get_refresh_lock(user_id: str) -> asyncio.Lock:
    now = time.time()
    # Evict stale locks to prevent unbounded growth
    if user_id in _refresh_lock_ts and (now - _refresh_lock_ts[user_id]) > _REFRESH_LOCK_TTL:
        _refresh_locks.pop(user_id, None)
    if user_id not in _refresh_locks:
        _refresh_locks[user_id] = asyncio.Lock()
    _refresh_lock_ts[user_id] = now
    return _refresh_locks[user_id]
```

In `_maybe_refresh(token, request)`:
1. Parse `exp`. If not near expiry, return `None` (no refresh needed).
2. Parse `sub` (user_id) from the token payload.
3. Acquire the per-user `asyncio.Lock` with a 2-second timeout.
4. After acquiring, re-parse `exp` on the cookie token (another coroutine may have just
   refreshed it). If no longer near expiry, release lock and return `None`.
5. Call `sb.auth.refresh_session(refresh_token)`.
6. On success, return new tokens and release lock.
7. On `AuthApiError` (single-use token already consumed): log at WARNING level, release lock,
   return `None` (the original access token, if still within its 1-hour TTL, will pass
   `get_user` and the request succeeds; if the access token has also expired, `get_user`
   returns an error and the caller gets HTTP 401).
8. Lock timeout (2 s exceeded): proceed without refresh, using the original token.

**Memory management:** The `_refresh_locks` dict is bounded by the number of concurrent
active users. Each entry is ~200 bytes. At 10,000 concurrent users this is ~2 MB. The TTL
eviction on lock acquisition prevents unbounded growth for long-lived processes.

**Multi-process caveat:** Railway deploys a single process per service. If Railway is ever
scaled to multiple instances, the in-memory lock provides no cross-process coordination and
the race may recur. At that point a Redis-based distributed lock is required. This is
documented in ADR-0010.

---

## 9. CORS Configuration Change

The `main.py` CORS configuration already satisfies `allow_credentials=True` with an explicit
origin list. No structural change is required. The current `_client_origins` list already
enumerates every Railway origin.

**Verification checklist for implementor:**

The following origins must be present in `_client_origins` before deployment:

```python
_client_origins = [
    "http://localhost:5173",           # local dev
    "http://127.0.0.1:5173",           # local dev (alternate)
    "https://optionspro-client-production.up.railway.app",
    "https://optionspro-admin-production.up.railway.app",
    "https://optionscompass-production.up.railway.app",
    "https://optionscompass-admin-production.up.railway.app",
    "https://optionscompass.up.railway.app",      # primary client
    "https://optionscompass-admin.up.railway.app", # admin portal
]
```

All entries are already present in the current file. `allow_credentials=True` is already set.
The wildcard guard on `ADMIN_PORTAL_ORIGINS` (which filters out `*` entries) is already in
place.

**No code change is required to `main.py` for CORS.** The implementor must confirm that the
Railway frontend service is deployed to one of the enumerated origins before testing
cross-origin cookie delivery.

**One optional addition** for operator flexibility: accept a `FRONTEND_ORIGIN` env var to
allow a custom domain to be added without a code deploy:

```python
_extra_origin = os.getenv("FRONTEND_ORIGIN", "").strip()
if _extra_origin and _extra_origin.startswith("https://"):
    _client_origins.append(_extra_origin)
```

This is optional and safe; the existing guard pattern (`o.strip().startswith("https://")`)
is already applied to `ADMIN_PORTAL_ORIGINS`.

---

## 10. Frontend Changes

### 10a. Remove supabase-js from runtime

`frontend/src/lib/supabase.ts` currently initialises a `createClient` with
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. After the refactor:

1. The file is reduced to a no-op that exports `null` as `supabase` (typed as `any`) to
   avoid breaking any residual import references during the transition:

```typescript
// frontend/src/lib/supabase.ts
// supabase-js client is no longer used for auth after the backend-auth-proxy refactor.
// This file is retained as a stub to prevent import errors during the transition.
// TODO: remove once all import sites have been audited and updated.
export const supabase = null as any
```

2. After the transition is confirmed stable, the file is deleted and all import sites are
   updated. The `@supabase/supabase-js` package may remain as a devDependency if its
   TypeScript types are still needed elsewhere (e.g., `User`, `Session` types used as
   type annotations). If no type-only usage remains, the package is removed from
   `package.json`.

3. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are no longer required at build time.
   They must be removed from all Railway frontend service environment variable configurations
   and from `.env.example`. They must not appear in production builds.

### 10b. AuthContext rewrite

The public interface of `AuthContext` is **unchanged**. Every downstream component
(`App.tsx`, `AdminPanel.tsx`, `UserGuide.tsx`, etc.) consumes `useAuth()` and will receive
the same fields with the same types.

**New `AuthContextType` interface** (same shape, different source):

```typescript
interface AuthContextType {
  user: SessionUser | null          // replaces supabase-js User
  session: null                     // always null post-refactor (removed concept)
  profile: SessionResponse | null   // populated from GET /api/auth/session
  isAdmin: boolean
  loading: boolean
  entitlements: Entitlements | null
  pendingLegalAcknowledgment: boolean
  signInWithGoogle: () => void      // now a synchronous navigation
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshEntitlements: () => Promise<void>
  clearLegalAcknowledgmentPending: () => void
}
```

`SessionUser` is a locally-defined interface (not from `supabase-js`):

```typescript
interface SessionUser {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
}
```

`SessionResponse` maps the `GET /api/auth/session` JSON response shape exactly.

**New initialisation sequence:**

```typescript
// On mount
useEffect(() => {
  fetchSession()

  // Poll on window focus to pick up auth state changes from other tabs.
  // This handles the case where one tab signs out and another tab refocuses.
  const handleFocus = () => fetchSession()
  window.addEventListener("focus", handleFocus)
  return () => window.removeEventListener("focus", handleFocus)
}, [])

async function fetchSession() {
  setLoading(true)
  try {
    const data = await getSession()   // calls GET /api/auth/session via Axios
    setUser({ id: data.user_id, email: data.email, full_name: data.full_name, avatar_url: data.avatar_url })
    setProfile(data)
    setPendingLegalAcknowledgment(data.pending_legal_acknowledgment)
    await fetchEntitlements()
  } catch (err: any) {
    if (err?.response?.status === 401) {
      // Not authenticated — clear state, show login
      setUser(null)
      setProfile(null)
      setEntitlements(null)
    } else if (err?.response?.status === 403) {
      // Account suspended
      setUser(null)
      setProfile(null)
      setEntitlements(null)
      alert("Your account has been suspended. Please contact support.")
    }
    // Other errors: keep existing state, do not log out
  } finally {
    setLoading(false)
  }
}
```

**`signInWithGoogle`** becomes a synchronous navigation:

```typescript
const signInWithGoogle = () => {
  window.location.href = `${BACKEND_URL}/api/auth/google`
}
```

No `async/await` needed. The browser performs a full-page navigation. After the OAuth
callback the browser is redirected to `/` and `fetchSession` runs on mount.

**`signInWithEmail`:**

```typescript
const signInWithEmail = async (email: string, password: string) => {
  await postEmailLogin(email, password)  // POST /api/auth/email-login — sets cookies
  await fetchSession()                    // immediately load session state
}
```

**`signUpWithEmail`:**

Email/password sign-up is a grey area — Supabase's sign-up flow may involve an email
confirmation link, which returns a different token exchange path. For v1:
- If `signUpWithEmail` is currently used in the codebase, it calls a new endpoint
  `POST /api/auth/email-signup` that proxies `sb.auth.sign_up()` and sets cookies if
  Supabase returns a session immediately (auto-confirm enabled).
- If auto-confirm is disabled (email verification required), the response has no session and
  no cookies are set; the frontend shows a "Check your email" message.
- The implementor must check the Supabase project's email confirmation setting and document
  the actual behaviour.

**`signOut`:**

```typescript
const signOut = async () => {
  try {
    await postLogout()    // POST /api/auth/logout — clears cookies, calls Supabase sign_out
  } catch {
    // fire-and-forget; never block sign-out
  }
  setUser(null)
  setProfile(null)
  setEntitlements(null)
  setPendingLegalAcknowledgment(false)
}
```

**`isAdmin` derivation:**

```typescript
const isAdmin = profile?.is_admin === true
```

Derived directly from the `GET /api/auth/session` response. No frontend email comparison.

**451 interceptor** (legal acknowledgment gate) is unchanged — it remains as an Axios
response interceptor in `AuthContext.tsx`.

### 10c. Axios client changes (`client.ts`)

Two changes to the Axios instance creation:

1. Add `withCredentials: true`:

```typescript
const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 15000,
  withCredentials: true,     // ADD THIS
})
```

2. Remove the 401-retry interceptor that calls `supabase.auth.refreshSession()`. The entire
   `useEffect` block in `AuthContext.tsx` that registers this interceptor is deleted. Token
   refresh is now transparent at the backend.

3. Remove the `api.defaults.headers.common['Authorization']` assignment from `initUser`
   and `signOut`. These lines set and delete the Bearer header; they are no longer needed.

**`postLogout` in `client.ts`** remains unchanged — it is still `api.post('/auth/logout', {})`.

**New function `getSession`** added to `client.ts`:

```typescript
export interface SessionResponse {
  user_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  is_admin: boolean
  onboarding_completed: boolean
  onboarding_step: string
  pending_legal_acknowledgment: boolean
  subscription_tier: string
}

export const getSession = (): Promise<SessionResponse> =>
  api.get<SessionResponse>('/auth/session').then(r => r.data)
```

**New function `postEmailLogin`** added to `client.ts`:

```typescript
export const postEmailLogin = (email: string, password: string): Promise<{
  ok: boolean
  email: string
  role: string
  onboarding_completed: boolean
  onboarding_step: string
  pending_legal_acknowledgment: boolean
}> =>
  api.post('/auth/email-login', { email, password }).then(r => r.data)
```

### 10d. Remove `frontend/src/lib/supabase.ts`

See Section 10a. The file is stubbed first, then removed after audit. The `@supabase/supabase-js`
package is removed from `package.json` dependencies (moved to devDependencies only if types
are still needed; removed entirely if not).

All occurrences of `import { supabase } from '../lib/supabase'` in `AuthContext.tsx` and
elsewhere are replaced. After the refactor, the only import site is `AuthContext.tsx` itself,
which is fully rewritten and no longer imports from `supabase.ts`.

---

## 11. E2E Fixture Migration

### What must change in `frontend/e2e/fixtures/auth.ts`

The current fixture does three things that must be replaced:

| Current | Replacement |
|---------|-------------|
| `page.route('**/auth/v1/user', ...)` — intercepts Supabase Auth API | Delete. No Supabase Auth API calls will occur from the browser. |
| `page.route('**/auth/v1/token**', ...)` — intercepts Supabase token refresh | Delete. Token refresh is server-side only. |
| `page.addInitScript(...)` — injects session into `localStorage` | Delete. No `localStorage` tokens exist post-refactor. |
| `page.route('**/api/auth/login', ...)` — intercepts backend login | Delete. Frontend no longer calls `POST /api/auth/login` on mount. |

**New fixture approach:** Stub `GET /api/auth/session` to return a mock session payload.

```typescript
async function bypassAuth(
  page: Page,
  sessionPayload = MOCK_SESSION_RESPONSE,
  entitlements = MOCK_ENTITLEMENTS_PRO,
): Promise<void> {
  // Stub the session endpoint — this is the only auth call AuthContext makes on mount
  await page.route(`${API_GLOB}auth/session`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionPayload),
    })
  })

  // Retain: stub /api/auth/me (used by some components directly)
  await page.route(`${API_GLOB}auth/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AUTH_ME),
    })
  })

  // Retain: stub /api/auth/entitlements
  await page.route(`${API_GLOB}auth/entitlements`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(entitlements),
    })
  })
}
```

**`authedPage` fixture:**

```typescript
authedPage: async ({ page }, use) => {
  await bypassAuth(page, MOCK_SESSION_RESPONSE, MOCK_ENTITLEMENTS_PRO)
  await use(page)
},
```

**`adminPage` fixture:**

```typescript
adminPage: async ({ page }, use) => {
  await bypassAuth(page, MOCK_SESSION_RESPONSE_ADMIN, MOCK_ENTITLEMENTS_PRO)
  await use(page)
},
```

### New mock data required in `frontend/e2e/mock-data.ts`

```typescript
export const MOCK_SESSION_RESPONSE = {
  user_id: MOCK_USER.id,
  email: MOCK_USER.email,
  full_name: 'Test User',
  avatar_url: null,
  role: 'user',
  is_admin: false,
  onboarding_completed: true,
  onboarding_step: 'complete',
  pending_legal_acknowledgment: false,
  subscription_tier: 'pro',
}

export const MOCK_SESSION_RESPONSE_ADMIN = {
  ...MOCK_SESSION_RESPONSE,
  email: MOCK_ADMIN_USER.email,
  role: 'admin',
  is_admin: true,
}
```

`MOCK_LOGIN_RESPONSE` and `MOCK_SUPABASE_SESSION` remain in `mock-data.ts` for backward
compatibility if any test directly references them, but they are no longer used by the
fixture.

### Verification of fixture correctness

The `adminPage` fixture must produce `is_admin: true` in the session payload. Tests that
assert the Admin tab is present should use `adminPage`; tests that assert its absence should
use `authedPage`. This matches the existing fixture intent without any test-logic change.

---

## 12. Deployment Prerequisites

These steps must be completed **before** any Railway deployment is initiated. They are
Go/No-Go blockers per the PO risk ruling.

### Step 1 — Google Cloud Console

In the Google Cloud Console OAuth 2.0 client configuration for the OptionsDesk project:

- Add to "Authorised redirect URIs":
  `https://optionscompass.up.railway.app/api/auth/callback`

The existing redirect URI pointing to the Supabase callback URL
(`https://<project>.supabase.co/auth/v1/callback`) must remain until the old frontend flow
is fully decommissioned. Do not remove the Supabase redirect URI until Gate 6 confirms the
new flow is working in production.

### Step 2 — Supabase project settings

In the Supabase project dashboard under Authentication > URL Configuration:

- Add to "Redirect URLs (allowed)":
  `https://optionscompass.up.railway.app/api/auth/callback`

The Supabase `sign_in_with_oauth` call sets `redirect_to` to the backend callback URL.
Supabase will reject the redirect unless this URL is in the allowed list.

### Step 3 — Railway environment variables

The following env var must be present on the **backend** Railway service:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Already set — no change |
| `SUPABASE_SERVICE_KEY` | Already set — no change |
| `FRONTEND_ORIGIN` | `https://optionscompass.up.railway.app` (optional, for operator override) |

The following env vars must be **removed** from the **frontend** Railway service after the
refactor is stable:

| Variable | Action |
|----------|--------|
| `VITE_SUPABASE_URL` | Remove (no longer bundled into frontend) |
| `VITE_SUPABASE_ANON_KEY` | Remove (no longer bundled into frontend) |

---

## 13. Migration Strategy

The recommended deployment sequence avoids a flag-day cutover that could lock all users out
simultaneously.

### Phase 1 — Backend deploy (new endpoints + dual verify_token)

1. Deploy the updated backend with:
   - New endpoints (`/api/auth/google`, `/api/auth/callback`, `/api/auth/session`,
     `/api/auth/email-login`)
   - Updated `verify_token` that reads cookie first, falls back to header
   - Updated `POST /api/auth/logout` that clears cookies
   - `_sync_profile` extraction

2. The existing frontend continues to work unchanged — it sends `Authorization: Bearer`
   headers, which the updated `verify_token` accepts via the fallback. No user is affected.

3. Smoke test the new endpoints manually against the production backend before proceeding.

### Phase 2 — Frontend deploy (AuthContext rewrite + Axios change)

1. Deploy the updated frontend with:
   - Rewritten `AuthContext.tsx`
   - `withCredentials: true` in Axios
   - `supabase.ts` stubbed

2. After this deploy:
   - All users must sign in once (existing `localStorage` tokens are not in cookies; the
     `GET /api/auth/session` call will return 401 and show the login screen).
   - Clicking "Sign in with Google" triggers the new backend-redirect flow.
   - All subsequent requests use cookies.

3. **User impact:** A one-time forced re-authentication for all currently-logged-in users.
   This is documented as an accepted consequence in the spec (Section 5, Out of Scope:
   "Migration of existing active user sessions").

### Phase 3 — Remove header fallback (post-validation)

1. After 48 hours of stable production operation with no header-based auth errors in logs:
   - Remove the `Authorization` header fallback from `verify_token`.
   - Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Railway frontend env vars.
   - Remove `supabase.ts` entirely if all import sites are clean.

2. This is a low-risk change at this stage; any client still sending a Bearer header will
   receive a 401 and be prompted to re-authenticate via the new flow.

---

## 14. Shared Service Extraction: `_sync_profile`

Currently the profile-sync logic (whitelist check, deactivation check, role derivation,
`user_profiles` upsert, portfolio ensure, activity log) lives entirely inside
`POST /api/auth/login`. The OAuth callback handler and `POST /api/auth/email-login` both
need to run the same sequence.

The logic is extracted to a module-level async function in `auth_routes.py`:

```python
async def _sync_profile(
    request: Request,
    user,           # Supabase user object from exchange/refresh
    access_token: str,
) -> dict:
    """
    Runs platform gate checks, upserts user_profiles, ensures portfolio,
    logs activity. Returns the login-response dict.
    Raises HTTPException on deactivation (403), maintenance (503), or invite-only (403).
    """
```

`POST /api/auth/login` becomes a thin wrapper that calls `verify_token` (for the token),
then calls `_sync_profile` and returns its result. This ensures behaviour is identical
across all sign-in paths.

---

## 15. New Environment Variables

| Variable | Side | Description | Required |
|----------|------|-------------|----------|
| `FRONTEND_ORIGIN` | Backend | Override the frontend redirect destination in OAuth callback and error redirects. Defaults to `https://optionscompass.up.railway.app` if not set. | No |
| `ENVIRONMENT` | Backend | Set to `development` to suppress the `Secure` flag on cookies for local HTTP testing. | No |

No new frontend env vars. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are retired.

---

## 16. Subscription Tier Enforcement

Not applicable. This feature makes no changes to tier limits, entitlement checks,
watchlist quotas, or scan quotas. `tier_limits.py` is untouched. The `GET /api/auth/entitlements`
endpoint continues to function identically — it uses `Depends(verify_token)` and will
automatically benefit from the cookie-reading `verify_token` without any change.

---

## 17. External Dependency Fallback Chain

| Primary | Fallback 1 | Fallback 2 | Behaviour if all fail |
|---------|------------|------------|----------------------|
| Supabase Auth API (`get_user`, `refresh_session`, `exchange_code_for_session`) | None | None | HTTP 401 / 302 redirect with `auth_error`. Login page shown. Matches current behaviour. |

No new external services are introduced. The fallback chain for auth is: Supabase Auth API,
or nothing. This is the same as the current architecture. The only change is that the single
point of failure shifts from browser-to-Supabase to backend-to-Supabase, which reduces the
attack surface without changing the availability risk profile.

---

## 18. ADR Reference

The architectural decisions in this feature are recorded in:

**`docs/adr/0010-backend-auth-proxy-cookie-transport.md`**

Key decisions covered in the ADR:
- httpOnly cookies over Bearer headers as the auth transport
- Server-side refresh lock strategy for single-use token race condition
- Polling `GET /api/auth/session` over `supabase.auth.onAuthStateChange` subscription
- Dual-mode `verify_token` for zero-downtime transition
- Redirect-with-query-param error reporting from the OAuth callback

---

## 19. Changed Files Summary

| File | Change | Migration needed |
|------|--------|-----------------|
| `backend/routes/auth_routes.py` | Add 4 endpoints; extract `_sync_profile`; update logout | No |
| `backend/services/auth_utils.py` | Rewrite `verify_token`; add refresh lock; add `_maybe_refresh`; add `_get_token_exp` | No |
| `backend/main.py` | Add `attach_refreshed_cookies` middleware | No |
| `backend/requirements.txt` | Verify `httpx` is listed (needed by supabase-py for async HTTP) | No |
| `frontend/src/context/AuthContext.tsx` | Full rewrite (same public interface) | No |
| `frontend/src/api/client.ts` | Add `withCredentials: true`; remove header interceptor; add `getSession`, `postEmailLogin` | No |
| `frontend/src/lib/supabase.ts` | Stub to no-op; later delete | No |
| `frontend/e2e/fixtures/auth.ts` | Remove Supabase intercepts and localStorage injection; stub `GET /api/auth/session` | No |
| `frontend/e2e/mock-data.ts` | Add `MOCK_SESSION_RESPONSE`, `MOCK_SESSION_RESPONSE_ADMIN` | No |
| `docs/adr/0010-backend-auth-proxy-cookie-transport.md` | New ADR | No |

No database migration. No new Python packages beyond what is already in `requirements.txt`
(supabase-py already wraps httpx for token operations).

---

## 20. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

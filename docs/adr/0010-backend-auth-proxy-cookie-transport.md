# ADR-0010 — Backend Auth Proxy: Cookie Transport for Supabase Tokens

**Date:** 18Jun2026
**Status:** Proposed
**Author:** Solution Architect

---

## Context

OptionsDesk currently performs all Supabase auth operations in the browser: the `supabase-js`
SDK is initialised with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, which are bundled
into the JavaScript served to every user. The session token is stored in `localStorage` and
injected into every API request as an `Authorization: Bearer` header. The `supabase-js`
client handles token refresh by calling the Supabase Auth API directly from the browser.

This architecture exposes three surfaces:
1. Supabase project credentials (URL and anon key) are visible in the JavaScript bundle and
   in the browser network tab.
2. The access token lives in `localStorage`, readable by any JavaScript on the page.
3. The `Authorization` header is readable by any network observer on insecure connections,
   and is logged by many reverse proxies by default.

The decision was made to proxy all auth operations through the FastAPI backend on Railway,
making Supabase an implementation detail invisible to the browser.

---

## Decisions and Rationale

### Decision 1 — httpOnly cookies as the token transport

**Decision:** Store `sb_access_token` and `sb_refresh_token` in separate `HttpOnly; Secure;
SameSite=Lax` cookies set by the FastAPI backend.

**Alternatives considered:**

- **Continue with `localStorage` + Bearer header.** Rejected. The `localStorage` XSS attack
  surface is real: any injected script can read the token. Bearer headers are logged by
  intermediary proxies. The spec explicitly rules this out.

- **`sessionStorage` + Bearer header.** Rejected. `sessionStorage` is also readable by
  JavaScript, and the value does not survive a tab close, violating the session restore
  requirement (Story 4).

- **Single combined cookie.** Rejected. Splitting access and refresh tokens into separate
  cookies allows independent max-age settings (access: 1 hour, refresh: 7 days) and avoids
  the 4 KB per-cookie size limit if both tokens are large JWTs.

**Rationale for `SameSite=Lax` over `Strict`:** With `SameSite=Strict`, the cookie is not
sent on cross-site navigations including the OAuth redirect-back. The browser navigates from
Google back to `optionscompass.up.railway.app/api/auth/callback`, which is a top-level
cross-site navigation. `Strict` would suppress the cookie on that request, but since the
callback handler *sets* cookies rather than reads them, this is not actually a problem for
the callback itself. However, `Strict` would suppress cookies on any future navigation from
an external site to the app (e.g., a user clicking a link from their email). `Lax` permits
cookies on top-level GET navigations, which is the standard setting for auth cookies that
must survive external-link arrivals.

---

### Decision 2 — Server-side per-user in-memory refresh lock

**Decision:** Implement a per-user `asyncio.Lock` in `auth_utils.py` to serialise concurrent
token refresh attempts within a single FastAPI process.

**Problem:** Supabase refresh tokens are single-use (rotating refresh tokens). If two
concurrent requests from the same user (typically from two browser tabs) both detect an
expiring access token and attempt to refresh simultaneously, one will succeed and one will
receive an `AuthApiError` from Supabase. The losing request, if it has an already-expired
access token, will return HTTP 401 to the browser, causing a surprise logout.

**Alternatives considered:**

- **Accept the race; document it as known behaviour.** The PO evaluated this option and
  ruled it MUST-FIX because POST routes (order placement, trade recording) could silently
  drop writes if a 401 fires mid-request. The cost of a surprise logout during a paper-trade
  entry is higher than the implementation cost of a lock.

- **Redis-based distributed lock.** Correct for multi-process deployments. Rejected for v1
  because Railway deploys a single FastAPI process. Adding Redis introduces a new
  infrastructure dependency for a problem that does not yet exist in production. Documented
  as the required upgrade path if Railway scaling to multiple instances is ever enabled.

- **Client-side deduplication (single refresh per browser).** Not applicable post-refactor;
  the browser has no access to the tokens and cannot coordinate refresh attempts.

**Lock design:** Per-user `asyncio.Lock` stored in a module-level dict, keyed by `user_id`.
Lock acquisition has a 2-second timeout; if the timeout fires, the original (potentially
expiring but still valid) token is used. After acquiring, the token expiry is re-checked
before calling Supabase, so a second coroutine that acquired the lock after the first
completed the refresh sees an up-to-date token and skips the refresh call. Stale lock
entries are evicted on acquisition using a 10-second TTL timestamp.

**Multi-process caveat:** This lock is in-process only. If Railway is ever scaled beyond
one instance per backend service, the lock provides no cross-process protection and the
race can recur. At that point the lock must be replaced with a Redis-backed distributed lock
(e.g., `redis-py` with `SET NX EX`). This caveat is accepted for v1.

---

### Decision 3 — Poll `GET /api/auth/session` instead of `onAuthStateChange`

**Decision:** `AuthContext.tsx` polls `GET /api/auth/session` on mount and on `window focus`
events, rather than subscribing to `supabase.auth.onAuthStateChange`.

**Alternatives considered:**

- **Server-Sent Events (SSE) for real-time auth state push.** Correct in principle —
  avoids polling. Rejected because Supabase does not push auth state events to the backend,
  so any SSE channel would only carry events we already know about (explicit sign-out) and
  would add significant infrastructure complexity for no user-visible benefit in a
  paper-trading app where auth events are infrequent.

- **WebSocket for auth state.** Rejected for the same reasons as SSE, with higher
  connection overhead.

- **Polling on a fixed timer (e.g., every 30 seconds).** Considered. The `window focus`
  trigger already covers the most important case (user returns to a previously-open tab
  after signing out in another tab). A fixed-interval poll would detect deactivation faster,
  but the 60-second deactivation cache in `_is_deactivated()` already bounds the detection
  latency at 60 seconds regardless. Adding a polling interval shorter than the cache TTL
  provides no additional benefit.

**Rationale:** Mount + focus polling is the industry-standard approach for cookie-based auth
without a JavaScript-accessible token. It is simple, reliable, and requires no persistent
connection. The frontend loading state resolves within one `GET /api/auth/session` round-trip
(< 500 ms on Railway, well within the 3-second requirement in Story 4 AC3).

---

### Decision 4 — Dual-mode `verify_token` for zero-downtime transition

**Decision:** During the transition window, `verify_token` reads the `sb_access_token` cookie
first and falls back to the `Authorization: Bearer` header. The fallback is removed in a
separate follow-up commit after the frontend deployment is confirmed stable.

**Rationale:** A flag-day cutover (deploy backend and frontend simultaneously and accept a
brief window of broken auth) was considered and rejected. The Railway deployment model
deploys each service independently; there is a window between the backend deploy completing
and the frontend deploy completing during which old frontend builds with Bearer headers are
hitting the new backend. The dual-mode fallback eliminates this window entirely. The
backwards-compatible header path adds approximately 10 lines of code and carries no security
risk during the transition period.

---

### Decision 5 — Redirect-with-query-param error reporting from the OAuth callback

**Decision:** `GET /api/auth/callback` redirects to `/?auth_error=<code>` on all failure
conditions rather than returning HTTP 4xx JSON responses.

**Rationale:** The browser's address bar is pointing to `optionscompass.up.railway.app/api/auth/callback`
at the moment the callback handler runs. Returning a 403 or 500 JSON response would render
a raw JSON body in the browser — not an acceptable UX. Redirecting to the frontend root
with an `auth_error` query parameter allows the frontend `AuthContext` or a route guard to
read the parameter and display a friendly error message. The alternative (serving an
HTML error page from the backend) was rejected because the backend has no templating engine
and maintaining HTML error pages in a FastAPI service is an anti-pattern for this codebase.

---

## Consequences

**Positive:**
- Supabase URL and anon key no longer appear in any browser-visible resource.
- Access and refresh tokens are inaccessible to JavaScript (XSS cannot steal sessions).
- `Authorization` headers disappear from the network tab and proxy logs.
- Token refresh is centralised and transparent; the frontend requires no refresh logic.
- The concurrent-tab refresh race is handled at the server level.

**Negative / Trade-offs:**
- The in-memory refresh lock is single-process. Multi-instance Railway scaling requires a
  Redis-backed distributed lock before the first horizontal scale-out.
- All currently-authenticated users are forced to re-authenticate once after the frontend
  deployment (existing `localStorage` tokens are not migrated to cookies).
- The `session` field in `AuthContextType` is effectively removed (set to `null` always).
  Any downstream component that reads `session` (not currently identified in the codebase)
  would break. Audit of `session` usage is required before the frontend deploy.
- `SameSite=Lax` (rather than `Strict`) is required for the OAuth redirect flow. This is
  standard for auth cookies and does not meaningfully weaken CSRF protection given that
  all state-mutating endpoints use POST/PATCH/DELETE methods (which Lax blocks from
  cross-site initiations).

---

## References

- `docs/FeatureRequests/backend-auth-proxy-17Jun2026/02-design.md`
- Supabase Auth documentation — OAuth with PKCE flow
- OWASP — Auth Cheat Sheet: Token Storage
- RFC 6265 — HTTP State Management Mechanism (SameSite extension)

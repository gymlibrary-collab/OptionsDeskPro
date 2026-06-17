# Feature Spec — Backend Auth Proxy Refactor

**Date:** 17Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

All authentication operations (Google OAuth initiation, OAuth code exchange, session
management, and token refresh) currently execute in the browser using the `supabase-js`
SDK, which requires the Supabase project URL and anon key to be present in the JavaScript
bundle and visible in the network tab. This refactor moves every auth operation behind the
existing FastAPI backend on Railway so that the browser communicates exclusively with
`optionscompass.up.railway.app`; Supabase becomes a server-side implementation detail
invisible to the browser. Tokens are stored in httpOnly, Secure, SameSite=Lax cookies that
JavaScript cannot read, eliminating the token-theft attack surface that currently exists in
`localStorage` and the `Authorization` header.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| All authenticated users (free / starter / pro / enterprise) | All | Sign in with Google and use the application without noticing any change to the login experience |
| Admin (leonardsim.sm@gmail.com) | Admin | Continue to access admin routes transparently; admin flag derivation must remain correct |
| QA engineer / E2E test suite | N/A | Auth bypass fixture must continue to allow headless tests without real Google OAuth |

---

## 3. Functional Requirements

### OAuth flow

1. `GET /api/auth/google` must redirect the browser to the Google OAuth consent screen using
   the Supabase OAuth URL, with the `redirect_uri` pointing to `GET /api/auth/callback` on
   the FastAPI backend. No browser-side JavaScript is involved in initiating the redirect.

2. `GET /api/auth/callback` must accept the `code` query parameter returned by Google,
   exchange it with Supabase for an `access_token` and `refresh_token`, and then set both
   tokens in httpOnly, Secure, SameSite=Lax cookies on the response before redirecting the
   browser to the frontend root (`/`).

3. After the callback redirect, the cookies must be sent automatically by the browser on
   every subsequent request to the backend (same-origin or configured cross-origin with
   `credentials: 'include'`). No JavaScript code may read or write the token values.

### Session endpoint

4. `GET /api/auth/session` must read the access token from the httpOnly cookie, call
   `sb.auth.get_user(token)` to verify it with Supabase, and return a JSON object containing
   at minimum: `user_id`, `email`, `role`, `is_admin`, `onboarding_completed`,
   `onboarding_step`, `pending_legal_acknowledgment`. This endpoint replaces
   `supabase.auth.getSession()` in the frontend.

5. `GET /api/auth/session` must return HTTP 401 when no valid access token cookie is present
   or when the token is rejected by Supabase, and HTTP 403 when the account is deactivated.

### Token refresh

6. On every authenticated request, the backend must inspect the access token's expiry. If
   the token will expire within 5 minutes, the backend must call the Supabase token refresh
   endpoint, update both cookies with the new tokens, and continue processing the original
   request — all transparently without client involvement.

7. Token refresh must be transparent to the user: a user who has been using the application
   for longer than 1 hour (Supabase access token TTL) must not be logged out automatically.

### Logout

8. `POST /api/auth/logout` must call `sb.auth.sign_out(token)` to invalidate the session in
   Supabase, then clear both token cookies by setting them to expired empty values, and
   return `{"ok": true}`.

### Internal login sequence

9. After a successful OAuth callback and cookie set, the backend must internally trigger the
   same profile-sync and whitelist-check logic currently in `POST /api/auth/login`
   (deactivation check, role derivation, `user_profiles` upsert, portfolio ensure, activity
   log) as part of the callback handler. The frontend must not call `POST /api/auth/login`
   separately.

10. `POST /api/auth/login` must remain available as an endpoint to support email/password
    sign-in paths and existing usages; it must not be removed as part of this refactor.

### Token verification

11. `verify_token` in `auth_utils.py` must be updated to read the access token from the
    httpOnly cookie on the incoming request rather than from the `Authorization: Bearer`
    header. All existing route handlers that use `Depends(verify_token)` must continue to
    work without any changes to their own code.

12. For backwards compatibility during a transition period (to be decided by the architect),
    `verify_token` should accept either the cookie or the `Authorization` header, preferring
    the cookie when both are present.

### Frontend changes

13. `AuthContext.tsx` must be rewritten to call `GET /api/auth/session` on mount and on
    window focus to determine authentication state, replacing `supabase.auth.getSession()`
    and `supabase.auth.onAuthStateChange()`.

14. `signInWithGoogle()` in `AuthContext` must redirect the browser to `GET /api/auth/google`
    rather than calling `supabase.auth.signInWithOAuth()`.

15. The `signInWithEmail` and `signUpWithEmail` functions in `AuthContext` must remain
    functional. If these paths set cookies via a dedicated backend endpoint, those endpoints
    must be documented for the architect; if they continue to use `supabase-js` directly for
    now, that must be called out as a known gap.

16. The Axios client in `client.ts` must be configured with `withCredentials: true` so
    cookies are sent cross-origin. The `Authorization` header injection
    (`api.defaults.headers.common['Authorization']`) and the 401-retry interceptor that calls
    `supabase.auth.refreshSession()` must be removed.

17. `isAdmin` derivation in `AuthContext` must continue to work correctly, derived from the
    `is_admin` field returned by `GET /api/auth/session`.

18. The `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables must no
    longer be required at runtime. If `supabase-js` is retained as a dev dependency for
    TypeScript types, it must not be initialised with real credentials in production builds.

### Security constraints

19. Cookies must be set with `HttpOnly=true`, `Secure=true`, and `SameSite=Lax`. The
    `Secure` flag must be enforced in all non-localhost environments.

20. The `SUPABASE_SERVICE_KEY` and `SUPABASE_URL` must remain server-side only. No
    Supabase credential may appear in any frontend build output or network response visible
    to the browser.

21. The Google Cloud Console OAuth 2.0 client and the Supabase project's allowed redirect
    URIs must be updated to include the new backend callback URL
    (`https://optionscompass.up.railway.app/api/auth/callback`). This is an operational
    prerequisite before deployment and must be documented in the release note.

### E2E test compatibility

22. The E2E auth bypass fixture (`frontend/e2e/fixtures/auth.ts`) currently injects a fake
    Supabase session into `localStorage` and intercepts Supabase auth API calls. After this
    refactor the fixture must instead intercept `GET /api/auth/session` and return a mock
    session payload, and must set a mock cookie or stub the session endpoint, so no
    `supabase-js` client calls are required during tests.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Google Sign-In via Backend Redirect

**As a** new or returning user, **I want** to click "Sign in with Google" and be taken
through the standard Google consent screen **so that** I am authenticated without the app
ever exposing Supabase credentials to my browser.

**Acceptance Criteria:**
- [ ] AC1: Clicking "Sign in with Google" causes a full-page navigation to
  `GET /api/auth/google` (verifiable in browser DevTools Network tab: no call to
  `accounts.google.com` or `supabase.co` is initiated by JavaScript before the redirect).
- [ ] AC2: After completing the Google consent screen, the browser is redirected to the
  frontend root (`/`). The application shows the authenticated dashboard without an
  additional login prompt.
- [ ] AC3: After sign-in, the browser DevTools Application tab shows no `access_token` or
  `refresh_token` in `localStorage`, `sessionStorage`, or any cookie readable by
  JavaScript (i.e., no cookie lacking the `HttpOnly` flag contains a token value).
- [ ] AC4: Opening DevTools Network tab and inspecting any subsequent API call shows no
  `Authorization` header on requests to the backend; cookies are sent instead.
- [ ] AC5: The Supabase project URL (`ocdyimweieclwtvnfnwi.supabase.co`) does not appear
  in the browser network tab as a request origin initiated by JavaScript after the
  refactor is complete.

### Story 2 — Transparent Token Refresh

**As an** authenticated user who has been using the app for more than 1 hour, **I want**
my session to stay active **so that** I am not unexpectedly logged out mid-session.

**Acceptance Criteria:**
- [ ] AC1: In a test or staging environment with a shortened token TTL (or by manually
  making the backend treat the token as near-expiry), performing any API action after
  token expiry does not produce a logged-out state; the response is the expected 200 with
  correct data.
- [ ] AC2: After a transparent refresh, the browser's cookie store contains updated token
  cookies with a new expiry. This is verifiable in DevTools Application > Cookies.
- [ ] AC3: No visible UI disruption (spinner, reload, redirect to login) occurs during a
  transparent token refresh.

### Story 3 — Sign Out Clears Cookies

**As an** authenticated user, **I want** to sign out **so that** my session is fully
invalidated and no credentials remain in the browser.

**Acceptance Criteria:**
- [ ] AC1: Clicking "Sign out" removes the access token and refresh token cookies from the
  browser (DevTools Application > Cookies: no token cookies present after sign-out).
- [ ] AC2: After sign-out, navigating directly to any authenticated route (e.g., `/`)
  shows the login screen, not the dashboard.
- [ ] AC3: A call to `GET /api/auth/session` immediately after sign-out returns HTTP 401.
- [ ] AC4: The user_action_log in Supabase contains a `logout` event with the correct
  `user_email` and timestamp (verifiable via Admin panel or direct DB query).

### Story 4 — Session Restore on Page Reload

**As an** authenticated user, **I want** reloading the page to restore my session
automatically **so that** I do not have to sign in again after every browser refresh.

**Acceptance Criteria:**
- [ ] AC1: Hard-refreshing the browser (Ctrl+R / Cmd+R) while authenticated shows the
  dashboard within 3 seconds without a login prompt.
- [ ] AC2: Closing and reopening the browser tab (session cookie behaviour depends on
  cookie max-age set by the architect; if a persistent cookie is used, the session must
  survive a tab close) restores the authenticated state if the token is still valid.
- [ ] AC3: `AuthContext` loading state resolves to `false` (loading complete) within 3
  seconds of page load under normal network conditions on the Railway-hosted app.

### Story 5 — Admin Flag and Role Are Correct Post-Refactor

**As an** admin user (`leonardsim.sm@gmail.com`), **I want** the admin flag to remain
correctly set after the auth refactor **so that** I retain access to the Admin panel and
all admin-gated routes without any behaviour change.

**Acceptance Criteria:**
- [ ] AC1: Signing in with the admin email shows the Admin tab in the navigation bar.
- [ ] AC2: `GET /api/auth/session` returns `"is_admin": true` for the admin email.
- [ ] AC3: All routes that call `require_admin(payload)` continue to return HTTP 200 for
  the admin user and HTTP 403 for a non-admin user.
- [ ] AC4: The `isAdmin` flag in `AuthContext` is `true` for the admin user and `false`
  for a standard free-tier user.

### Story 6 — Deactivated Account Blocked at Session Check

**As a** platform admin, **I want** a deactivated user's cookie to be rejected at
`GET /api/auth/session` **so that** suspended accounts cannot access the application even
if their cookie has not yet expired.

**Acceptance Criteria:**
- [ ] AC1: An account marked `deactivated_at IS NOT NULL` in `user_profiles` receives
  HTTP 403 from `GET /api/auth/session` even when presenting a cryptographically valid
  token cookie.
- [ ] AC2: The frontend, upon receiving HTTP 403 from `GET /api/auth/session`, displays
  the login screen (not an unhandled error) and shows the message "Your account has been
  suspended. Please contact support." or equivalent.
- [ ] AC3: The deactivation cache in `auth_utils.py` (60 s TTL) means a reactivated
  account may take up to 60 seconds to regain access; this is acceptable and must be
  documented in the User Guide for admins.

### Story 7 — Email / Password Sign-In Remains Functional

**As a** user who registered with email and password, **I want** to continue signing in
with my credentials **so that** the refactor does not break my existing login method.

**Acceptance Criteria:**
- [ ] AC1: Submitting a valid email and password on the login form results in the
  authenticated dashboard being shown.
- [ ] AC2: After successful email/password sign-in, no token is stored in `localStorage`
  or `sessionStorage` (cookie-only storage, same as Google OAuth path).
- [ ] AC3: Submitting an incorrect password returns an error message; the user is not
  logged in.

### Story 8 — E2E Test Suite Remains Green

**As a** QA engineer, **I want** the Playwright E2E auth bypass fixture to be updated for
the cookie-based auth model **so that** all existing E2E tests pass without relying on
`supabase-js` or `localStorage` token injection.

**Acceptance Criteria:**
- [ ] AC1: Running `npx playwright test` from `frontend/` with the refactored fixture
  produces zero failures on tests that previously passed (no regression).
- [ ] AC2: The fixture does not inject any token into `localStorage` or `sessionStorage`;
  it stubs `GET /api/auth/session` to return the mock user payload instead.
- [ ] AC3: The `authedPage` and `adminPage` fixture variants correctly represent a
  non-admin and admin user respectively, as verified by a test that asserts the presence
  or absence of the Admin tab in the navigation.

---

## 5. Out of Scope

- Changes to any business logic routes beyond `auth_routes.py` and `auth_utils.py`; all
  other route handlers are untouched except that they automatically benefit from the
  cookie-based `verify_token`.
- Stripe billing, subscription management, or any payment flow changes.
- Introduction of a separate identity provider or any auth system other than Supabase.
- Multi-factor authentication (MFA) — not currently implemented; not added here.
- "Remember me" toggle or configurable session duration — cookie lifetime is a single
  implementation decision for the architect.
- Real-money broker connections — this platform is paper-trading only; that invariant does
  not change.
- Removal of the Supabase Postgres backend or RLS policies — Supabase remains the
  data store; only the browser-facing auth layer changes.
- Changes to the Reddit PRAW, AI (Claude), or market-data (yfinance) integrations.
- Migration of existing active user sessions — users will be required to sign in once after
  the refactor is deployed.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|--------------------|
| Cookie blocked by browser (strict third-party cookie policy) | Not applicable: cookies are first-party (same domain `*.railway.app` or custom domain); third-party blocking does not apply. If a user's browser blocks all cookies, the login flow fails and the user sees an error message on the login page. |
| Access token cookie present but expired; refresh token also expired | `GET /api/auth/session` returns HTTP 401. Frontend clears local auth state and shows the login screen. User must sign in again. |
| Access token near expiry; Supabase refresh endpoint is unreachable | Backend logs the refresh failure, proceeds with the original (still-valid) token for the current request, and does not update cookies. Next request will retry the refresh. If the token has already expired by that point, the user receives HTTP 401 and is redirected to login. |
| Supabase Auth API is down (sb.auth.get_user returns error) | `verify_token` raises HTTP 401. All protected endpoints are unavailable until Supabase recovers. Login page is shown. This matches current behaviour. |
| Concurrent tabs: one tab refreshes the token, the other makes a simultaneous request with the old token | Supabase accepts refresh tokens only once (single-use). The second tab's request may fail with 401 if the old access token has expired. The backend must handle this gracefully by returning 401, which the frontend's session polling will detect and redirect to login. The architect must decide whether to implement a token-refresh lock. |
| User opens app in two browsers / devices simultaneously | Each device has independent cookies. Token refresh in one device does not invalidate the other unless Supabase revokes the session. Standard Supabase session behaviour applies. |
| Backend Railway service is cold-starting (first request takes >5 s) | No change from current behaviour. Frontend shows the loading state until `GET /api/auth/session` responds. |
| OAuth callback URL mismatch (Google Console not updated before deploy) | Google returns an error page ("redirect_uri_mismatch") before reaching the backend. Deployment must update Google Console and Supabase allowed URIs before going live (see FR-21). |
| CORS: frontend on a different domain from backend | Axios must use `withCredentials: true`; backend `CORS` middleware must include `allow_credentials=True` and enumerate the frontend origin explicitly (wildcard `*` is forbidden with `allow_credentials=True`). |
| Account deactivated while a valid cookie is still in the browser | `verify_token` checks `_is_deactivated()` on every request (60 s TTL cache). User is blocked within at most 60 seconds of deactivation. |
| `signInWithEmail` / `signUpWithEmail` paths not yet proxied | If these paths still use `supabase-js` in a first-pass implementation, a token returned by Supabase must still be exchanged for a cookie via a dedicated backend endpoint. A hybrid state where email login stores a token in `localStorage` while Google login uses cookies is not acceptable; both paths must use cookies before the feature is considered complete. |

---

## 7. External Dependencies

| Service | Usage in this feature | Quota / Risk |
|---------|-----------------------|--------------|
| Supabase Auth API (`/auth/v1/token`, `/auth/v1/user`) | Backend calls `get_user(token)` to verify tokens; calls the token endpoint to exchange the OAuth code and to refresh tokens | No per-request quota documented; standard Supabase rate limits apply. Downtime blocks all logins. |
| Google OAuth 2.0 (via Supabase) | Supabase proxies Google OAuth; the backend redirect initiates the flow | Google's OAuth endpoint must have the backend callback URL registered as an authorised redirect URI in Google Cloud Console before deployment. |
| FastAPI backend on Railway | New endpoints `GET /api/auth/google`, `GET /api/auth/callback`, `GET /api/auth/session` are added | No Railway-specific quota impact. Cookie headers are small. |
| Browser cookie storage | Stores httpOnly access and refresh token cookies | Browsers enforce cookie size limits (~4 KB per cookie). Supabase JWTs are well within this limit. |

---

## 8. Subscription Tier Impact

This is a pure infrastructure change to the authentication transport layer. It has no effect on
entitlements, feature gating, watchlist limits, scan quotas, or any per-tier behaviour.

| Tier | Behaviour |
|------|-----------|
| free | No change to any feature access or limits |
| starter | No change to any feature access or limits |
| pro | No change to any feature access or limits |
| enterprise | No change to any feature access or limits |

---

## 9. Notes for the Architect

The following observations from reading the current codebase are provided as context. They
are not design decisions — those belong in `02-design.md`.

**Current token flow (to be replaced):**

- `frontend/src/lib/supabase.ts` initialises a `supabase-js` client with `VITE_SUPABASE_URL`
  and `VITE_SUPABASE_ANON_KEY` — both are bundled into the JavaScript served to the browser.
- `AuthContext.tsx` calls `supabase.auth.getSession()` on mount and subscribes to
  `supabase.auth.onAuthStateChange()`. On a session, it sets
  `api.defaults.headers.common['Authorization'] = Bearer <token>` and then posts to
  `/api/auth/login`.
- A 401-retry Axios interceptor calls `supabase.auth.refreshSession()` directly from the
  browser.
- `auth_utils.py` `verify_token` uses `HTTPBearer` to extract the `Authorization` header,
  then calls `sb.auth.get_user(token)`.

**Surfaces that must change on the backend:**

- `verify_token` in `backend/services/auth_utils.py`: replace `HTTPBearer` extraction with
  cookie extraction from `Request`. Backwards-compatible header fallback is captured in FR-12.
- `POST /api/auth/login` in `backend/routes/auth_routes.py`: the profile-sync logic inside
  this handler must be callable internally from the new callback handler (FR-9) without
  duplicating the business logic. The architect should consider extracting it to a shared
  service function.
- `POST /api/auth/logout` in `backend/routes/auth_routes.py`: must add cookie-clearing to
  the response in addition to the existing activity log write. Currently it only logs and
  returns `{"ok": true}`; the actual Supabase sign-out was performed by the frontend.

**Surfaces that must change on the frontend:**

- `frontend/src/lib/supabase.ts`: client will no longer be needed in production for auth.
  If removed, any other `supabase` import in the codebase must be audited.
- `frontend/src/context/AuthContext.tsx`: full rewrite of session initialisation and auth
  state management (FR-13, FR-14, FR-16, FR-17).
- `frontend/src/api/client.ts`: add `withCredentials: true` to the Axios instance; remove
  `Authorization` header injection and the `supabase.auth.refreshSession()` interceptor.
- `frontend/e2e/fixtures/auth.ts`: currently injects a fake Supabase session into
  `localStorage` and intercepts `**/auth/v1/user` and `**/auth/v1/token**`. After the
  refactor the fixture must intercept `GET /api/auth/session` and return a mock session
  payload (FR-22). The `addInitScript` `localStorage` injection block and the Supabase
  route intercepts can be removed entirely.

**CORS constraint:** `backend/main.py` hardcodes CORS origins. `allow_credentials=True`
requires that the origin list be explicit (no wildcard). The architect must verify that the
Railway frontend origin is in the list before cookies will be accepted cross-origin.

**Cookie naming:** The architect should define cookie names (e.g., `sb_access_token`,
`sb_refresh_token`) that cannot be confused with existing `supabase-js` localStorage keys.

---

## 10. Product Owner Review

_Completed by: product-owner agent — 17Jun2026_

---

### Story Priority Scores

| Story | Priority | Rationale |
|-------|----------|-----------|
| Story 1 — Google Sign-In via Backend Redirect | 1 — Must Have | This is the entire point of the feature. Without it nothing else in this spec has a reason to exist. |
| Story 2 — Transparent Token Refresh | 1 — Must Have | Without server-side refresh, every user is hard-logged-out after 1 hour. That is an immediate support incident. Not deferrable. |
| Story 3 — Sign Out Clears Cookies | 1 — Must Have | If cookies are not cleared on sign-out, a shared or stolen device retains a live session indefinitely. This is the minimum security guarantee the refactor must deliver. |
| Story 4 — Session Restore on Page Reload | 1 — Must Have | `GET /api/auth/session` is called on mount. If it does not restore state correctly, every page reload logs the user out. This is not a degraded experience — it is a broken product. |
| Story 5 — Admin Flag and Role Are Correct | 1 — Must Have | Admin access to user management and the whitelist is gated on `is_admin`. If the flag breaks, the single admin account loses operational access. Non-negotiable. |
| Story 6 — Deactivated Account Blocked at Session Check | 1 — Must Have | Deactivation enforcement is the primary access control mechanism for suspended accounts. This must carry over intact; a valid cookie being accepted for a deactivated account is a security regression. |
| Story 7 — Email / Password Sign-In Remains Functional | 1 — Must Have | FR-12 explicitly permits a backwards-compatible header fallback during transition, but FR-15 is unambiguous: no hybrid transport state is acceptable. Both sign-in paths must use cookie storage before this feature ships. If the architect cannot deliver this in v1, the feature is not shippable. |
| Story 8 — E2E Test Suite Remains Green | 1 — Must Have | The E2E fixture is the only mechanism QA has to run headless auth tests. Shipping without a working fixture means Gate 4 (Test) cannot be passed. This is not optional. |

---

### MVP Boundary

**All 8 stories are in scope for v1. There is nothing to defer.**

This is a breaking infrastructure change. The auth transport layer is a single coherent system: the OAuth redirect, the callback cookie-set, the session endpoint, the refresh, the logout, and the verify_token dependency that every single protected route relies on. Removing any one story produces either a broken product or a security regression. A half-migrated state — for example, Google OAuth on cookies while email login stays on Bearer headers — is explicitly ruled out by FR-15 and the edge case table in Section 6. The all-or-nothing nature of this refactor was correctly identified in the brief. I am confirming it here as a product decision, not just a technical preference.

**There is no deferred backlog for this feature.**

---

### Risk Rulings

The BA flagged 5 risks. Each is ruled on below.

**Risk 1 — Google Cloud Console + Supabase redirect URI must be updated before go-live**

Ruling: GO/NO-GO BLOCKER. This is not a risk to mitigate; it is a hard deployment prerequisite. If the redirect URI is not updated in Google Cloud Console and in Supabase before the backend is deployed, every user who attempts to sign in receives a Google OAuth error page. The application is completely inaccessible to new logins. The operator must confirm both URIs are updated as part of the Gate 6 deployment checklist before any Railway deploy is initiated. This step must appear as a mandatory pre-flight item in `06-release-note.md`.

**Risk 2 — Concurrent-tab refresh token race condition**

Ruling: MUST-FIX-BEFORE-RELEASE. Supabase refresh tokens are single-use. If two tabs simultaneously attempt a refresh, one will succeed and one will receive a 401. In a polling-based session model (`GET /api/auth/session` on mount and on window focus), a 401 in the losing tab will trigger a redirect to the login screen. The architect must document their decision on this — either a server-side refresh lock (e.g., a short TTL in-memory mutex keyed on user_id) or an explicit acceptance that multi-tab users will occasionally be logged out and must re-authenticate. "Occasional logout in a second tab" is marginally acceptable for a paper-trading app where the cost of re-auth is low. A silent data-loss scenario (an order being dropped mid-submit) is not. The architect must assess whether any POST routes are at risk. If they are, a lock or deduplicated refresh is required. This must be resolved in `02-design.md` before implementation begins.

**Risk 3 — Email/password sign-in must use cookies — no hybrid transport**

Ruling: MUST-FIX-BEFORE-RELEASE. This is captured in Story 7 (Priority 1) and FR-15. The spec already calls out that a hybrid state is not acceptable. I am reinforcing it here as a product decision: the feature does not ship if email/password login is still writing to localStorage or using Bearer headers. There is no waiver for this. The architect must show how `signInWithEmail` and `signUpWithEmail` exchange credentials for a cookie via a backend endpoint; if that endpoint is not in `02-design.md`, the design is incomplete.

**Risk 4 — CORS `allow_credentials=True` is incompatible with wildcard origins**

Ruling: MUST-FIX-BEFORE-RELEASE. This is a deployment-time defect, not a theoretical risk. `backend/main.py` must enumerate the Railway frontend origin explicitly before deployment. I do not need to see this in code before approving the spec, but I require it to be addressed in `02-design.md` and verified in the security review (Gate 5). The CORS configuration is exactly the kind of thing that looks fine in local development and breaks silently in production with a confusing browser error.

**Risk 5 — E2E fixture requires a non-trivial rewrite**

Ruling: ACCEPTED OPERATIONAL CONSTRAINT, but it blocks Gate 4. The fixture rewrite is scoped in Story 8 and is Priority 1. The effort is acknowledged. It is not a blocker to approving the spec or proceeding to architecture, but QA cannot sign off at Gate 4 until the fixture works correctly and the full test suite is green. The QA engineer should be briefed on the scope of the fixture change before implementation begins so the test effort is not underestimated.

---

### Tier Impact Confirmation

Confirmed: no subscriber entitlements are affected. This feature touches no tier-gated code paths, no watchlist limits, no scan quotas, and no strategy or narrative access controls. `tier_limits.py` is untouched. Free-tier users get exactly the same change as enterprise users: a more secure auth transport. No tier restructure is required.

---

### Value Loop Assessment

This feature does not accelerate, clarify, or extend the core value loop (ticker entry → IV + bias → strategy recommendations → narrative → paper trade). It is a security hardening of the infrastructure layer that sits beneath the loop. I support it because:

1. Eliminating the Supabase URL and anon key from the browser bundle closes a real credential exposure surface, even if the anon key is low-privilege.
2. Moving to httpOnly cookies eliminates the localStorage token theft attack surface, which is material for a platform where users record real paper-trade decisions they trust.
3. The change is invisible to users if executed correctly — the login experience does not change.

I would not approve this feature if it touched the narrative experience, introduced new loading states, or added user-visible friction to the sign-in flow. The spec correctly scopes it as a pure transport layer change with no visible UX delta.

---

### PO Gate Decision

**APPROVED — with conditions.**

The feature may proceed to Gate 2 (Architecture Design). The architect must address the following in `02-design.md` before Gate 2 can be approved:

1. A concrete decision on the concurrent-tab refresh race condition (lock strategy or explicit acceptance with risk assessment of which POST routes could lose data).
2. A complete design for the email/password sign-in path to a backend-issued cookie — no hybrid transport state permitted.
3. Explicit enumeration of the Railway frontend CORS origins required for `allow_credentials=True`.
4. The Google Cloud Console and Supabase redirect URI update steps must appear as a mandatory pre-flight checklist in `06-release-note.md` — the architect should flag this for the devops engineer at Gate 6.

_Approved by: product-owner_ &nbsp;&nbsp; _Date: 17Jun2026_

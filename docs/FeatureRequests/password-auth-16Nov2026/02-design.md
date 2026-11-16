# Technical Design — Subscriber Password Login

**Date:** 16Nov2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

This feature completes the email+password authentication path for subscribers by adding
two backend endpoints (`POST /api/auth/signup`, `POST /api/auth/reset-request`),
hardening the existing `POST /api/auth/email-login` with an admin/staff guard, and
wiring the frontend: a new `ResetPasswordPage` component, a "forgot password" mode
inside `LoginPage`, and `AuthContext` plumbing for sign-up and email-verification
token exchange.

The feature uses Supabase Auth throughout — `sign_up`, `reset_password_for_email`,
and `verifyOtp` — with `new_auth_client()` for every session-changing call (as
required by the existing guard in `db.py` and enforced by
`TestAuthCallsUseUnsharedClient`).  Email redirect links use the PKCE token_hash
format (ADR-0016).  Sign-up responses are always a neutral 200 when the email already
exists (ADR-0017).  Admin and active platform_staff emails are rejected at every
password endpoint.  No database migration is needed.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/routes/auth_routes.py` | Modified | Add `POST /api/auth/signup`, `POST /api/auth/reset-request`; add admin/staff guard to `POST /api/auth/email-login`; add `_is_admin_or_staff_email()` helper |
| `backend/tests/test_efficiency_fixes.py` | Modified | Extend `_MUTATING` regex in `TestAuthCallsUseUnsharedClient` to include `sign_up` and `reset_password_for_email` |
| `frontend/src/components/LoginPage.tsx` | Modified | Add `'forgot'` to the `Mode` union; wire "Forgot password?" to transition to `'forgot'` mode; show reset-request form; handle `initialBanner` prop |
| `frontend/src/components/ResetPasswordPage.tsx` | New | PKCE token_hash exchange + set-new-password form |
| `frontend/src/context/AuthContext.tsx` | Modified | Implement `signUpWithEmail`; add `requestPasswordReset`; handle `?token_hash=...&type=signup` on mount for email verification auto-login |
| `frontend/src/api/client.ts` | Modified | Add `postSignUp`, `postResetRequest` typed API calls |
| `frontend/src/App.tsx` | Modified | Route `/reset-password` pathname to `ResetPasswordPage` before the `!user` check |
| `ARCHITECTURE.md` | Modified | Add new endpoints to the auth routes table |
| `docs/adr/0016-pkce-token-hash-for-email-auth-redirects.md` | New | PKCE token_hash decision |
| `docs/adr/0017-anti-enumeration-uniform-signup-response.md` | New | Anti-enumeration decision |

---

## 3. Database Schema Changes

**No migration is required.**

All auth state lives in Supabase Auth (`auth.users`, `auth.identities`), which is
managed entirely by Supabase.  The `user_profiles` and `user_whitelist` rows for a
password-registered subscriber are created on first login after email verification,
exactly as today (via `_sync_profile`).  The `platform_staff` table (email column,
already exists, is indexed on `email`) is used read-only by the new admin/staff guard.

---

## 4. API Contracts

---

### `POST /api/auth/signup` (NEW)

**Auth required:** No

**Purpose:** Create a new subscriber account with email and password.  Calls
`sb.auth.sign_up()` via `new_auth_client()`.  Returns a uniform response regardless
of whether the email already exists (ADR-0017).

**Request:**
```json
{ "email": "subscriber@example.com", "password": "s3cur3pw!" }
```

**Response (200):**
```json
{ "ok": true, "detail": "check_email" }
```
The frontend must display: "Account created. Check your email to confirm your address
before signing in."

**Error responses:**

| Status | `X-Error-Code` header | Condition | Frontend message |
|--------|----------------------|-----------|-----------------|
| 400 | — | Password < 8 characters | "Password must be at least 8 characters." |
| 400 | — | Email or password field empty | "Email and password are required." |
| 403 | `staff_only_google` | Email is `ADMIN_EMAIL` or active `platform_staff` row | "Password login is not available for this account. Use Google sign-in." |
| 503 | — | Supabase Auth unreachable | "Authentication service unavailable. Please try again shortly." |

**Implementation notes:**
- Guard runs before the Supabase call (no DB round-trip wasted on blocked emails).
- `sb.auth.sign_up()` is called on `new_auth_client()`.
- `options["email_redirect_to"]` is set to `{FRONTEND_ORIGIN}/` so Supabase's
  verification email redirects the user back to the root URL carrying
  `?token_hash=...&type=signup`.
- Any Supabase error other than a network failure is caught and swallowed; the
  endpoint still returns `200 {"ok": true, "detail": "check_email"}` (OQ-3 Option A).
- Network/503 errors from Supabase are surfaced as HTTP 503.

---

### `POST /api/auth/reset-request` (NEW)

**Auth required:** No

**Purpose:** Trigger a Supabase password-reset email.  Returns a uniform response
regardless of whether the email is registered.

**Request:**
```json
{ "email": "subscriber@example.com" }
```

**Response (200):**
```json
{ "ok": true, "detail": "check_email" }
```
The frontend must display: "If an account exists for that address, a reset link has
been sent. Check your inbox."

**Error responses:**

| Status | `X-Error-Code` header | Condition | Frontend message |
|--------|----------------------|-----------|-----------------|
| 400 | — | Email field empty | "Please enter your email address." |
| 403 | `staff_only_google` | Email is `ADMIN_EMAIL` or active `platform_staff` row | "Password login is not available for this account. Use Google sign-in." |
| 503 | — | Supabase Auth unreachable | "Authentication service unavailable. Please try again shortly." |

**Implementation notes:**
- Guard runs before the Supabase call.
- `sb.auth.reset_password_for_email()` called on `new_auth_client()` with
  `options["redirect_to"]` set to `{FRONTEND_ORIGIN}/reset-password`.
- Any Supabase error other than a network failure is caught and swallowed; the
  endpoint still returns `200 {"ok": true, "detail": "check_email"}` (no enumeration).
- Supabase's built-in rate limiting (3 reset emails per address per hour on the free
  plan) is the operative rate limit for this release.  Custom per-IP middleware is
  not added in this increment; it can be layered on later via `slowapi` without
  changing this endpoint's contract.

---

### `POST /api/auth/email-login` (MODIFIED)

**Change:** Add admin/staff guard at the top of the handler, before calling
`sb.auth.sign_in_with_password()`.

**New error response:**

| Status | `X-Error-Code` header | Condition | Frontend message |
|--------|----------------------|-----------|-----------------|
| 403 | `staff_only_google` | Email is `ADMIN_EMAIL` or active `platform_staff` row | "Password login is not available for this account. Use Google sign-in." |

All existing behaviour (401, 503, `_sync_profile` gates, cookie setting) is unchanged.

**Additional error response already in spec but not yet implemented:**
The spec requires HTTP 403 with `X-Error-Code: account_suspended` for suspended
accounts.  This is already raised by `_sync_profile` (which returns a 403 with
`X-Error-Code: account_suspended` when `deactivated_at` is set).  Confirm in Gate 4.

---

### `POST /api/auth/update-password` (UNCHANGED)

This endpoint already exists and already works for the reset-completion flow.  No
changes required.  It is called by `ResetPasswordPage` after the reset-token session
is established in the Supabase JS client.

---

### Admin/staff guard helper (private, not an endpoint)

A new private function `_is_admin_or_staff_email(email: str) -> bool` is added to
`auth_routes.py` (or extracted to `auth_utils.py` — implementer's choice; keeping it
in `auth_routes.py` is simpler since it is only needed there).

```
def _is_admin_or_staff_email(email: str) -> bool:
    1. if email == ADMIN_EMAIL: return True          # no DB needed
    2. query platform_staff WHERE email = ? AND is_active = true
    3. return bool(result)
    4. on DB exception: return True   (fail-closed, Gate 2 amendment: refuse rather than
       risk letting a staff email through; subscribers cannot log in without the DB anyway)
```

The `ADMIN_EMAIL` check is case-sensitive string comparison (matching the existing
pattern in `auth_utils.py`).  The `platform_staff` lookup uses `get_supabase()` (safe
here — it is a read-only SELECT, not a session-changing auth call).

---

## 5. Caching Strategy

No caching is introduced for auth endpoints.  Auth operations must reflect the current
state of Supabase Auth and cannot tolerate stale data.  The `platform_staff` email
lookup in `_is_admin_or_staff_email` is a lightweight indexed SELECT on a small table
and does not need a cache at current scale.

---

## 6. External Dependency Fallback Chain

| Primary | Fallback 1 | Fallback 2 | Behaviour if all fail |
|---------|------------|------------|----------------------|
| Supabase Auth (`sign_up`, `reset_password_for_email`, `sign_in_with_password`) | None | None | HTTP 503; frontend shows "Authentication service unavailable. Please try again shortly." |

There is no synthetic or cached fallback for authentication.  This is correct: the
alternative to a working auth service is a clear error message, not a fake session.
The existing three-tier market-data fallback (yfinance → synthetic Black-Scholes) is
unaffected by this feature.

---

## 7. Frontend State Management

### `LoginPage.tsx` — added `'forgot'` mode

The `Mode` union gains `'forgot'`.  `LoginPage` already owns `mode`, `email`,
`password`, `confirmPassword`, `submitting`, `formError`, and `successMsg`.  No new
state atoms are needed; the same `formError`/`successMsg` pattern is reused for the
forgot-password form.

A new `initialBanner?: string` prop is added so `App.tsx` can pass in a success
string (e.g., "Password updated. Please sign in.") after a successful reset-completion
redirect.

| State / prop | In `'forgot'` mode behaviour |
|---|---|
| `mode = 'forgot'` | Shows single email field + "Send reset link" button + "Back to sign in" link |
| `formError` | Validation: empty email; network: 503; 403 for staff |
| `successMsg` | "If an account exists for that address, a reset link has been sent. Check your inbox." |
| `submitting` | Disables button, shows "Sending..." |

The "Forgot password?" text in `'signin'` mode changes from `cursor: default` (inert)
to a clickable element that calls `setMode('forgot')`.

### `ResetPasswordPage.tsx` — new component

This component handles the two-step reset-completion interaction:

| State | Purpose |
|---|---|
| `tokenHash: string \| null` | Extracted from `?token_hash` URL param on mount |
| `verifying: boolean` | True while `supabase.auth.verifyOtp()` is in flight |
| `verifyError: boolean` | True if `verifyOtp` fails (expired/tampered link) |
| `password: string` | New password field |
| `confirmPassword: string` | Confirm-password field |
| `submitting: boolean` | True while `POST /api/auth/update-password` is in flight |
| `done: boolean` | True after successful update — triggers redirect to `/?reset_success=1` |
| `formError: string \| null` | Validation and API errors |

**Lifecycle:**
1. Mount: read `token_hash` and `type` from `window.location.search`.
2. If `type !== 'recovery'` or `token_hash` missing → show "Invalid reset link" error.
3. Set `verifying = true`; call `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`.
4. On `verifyOtp` error → set `verifyError = true`; show "This reset link has expired
   or has already been used. Please request a new one." with a link to the
   "Forgot password?" form (`/?forgot=1`).
5. On `verifyOtp` success → show password form.
6. On form submit → validate client-side (length ≥ 8, passwords match) → call
   `POST /api/auth/update-password` → on success set `done = true` → redirect to
   `/?reset_success=1`.
7. The redirect adds `?reset_success=1` to the root URL.  `App.tsx` / `LoginPage.tsx`
   reads this param on mount and sets `initialBanner = "Password updated. Please sign in."`.

**No auth state is set after `verifyOtp`.** The Supabase JS client holds the recovery
session in memory.  The Bearer-header interceptor in `client.ts` sends the access
token from this in-memory session when `update-password` is called.  After the
redirect to sign-in, the Supabase JS session is effectively discarded (the user will
sign in fresh with the new password).  `fetchSession()` is NOT called during the
reset flow — the user is not being logged in, only changing their password.

### `AuthContext.tsx` — sign-up and email-verification changes

**`signUpWithEmail` implementation** (currently a stub that throws):
```
1. Call postSignUp(email, password)
2. On success: return normally (LoginPage shows the "check your email" success message)
3. On 403 (staff_only_google): throw Error("Password login is not available for this account.")
4. On 400: throw Error(detail from response)
5. On 503: throw Error("Authentication service unavailable.")
```
No `fetchSession()` is called — the user is not yet logged in.

**`requestPasswordReset` new function** (exposed through `AuthContextType`):
```
1. Call postResetRequest(email)
2. On success: return normally (LoginPage shows "If an account exists…" message)
3. On 403 (staff_only_google): throw Error("Password login is not available for this account.")
4. On 400: throw Error("Please enter your email address.")
5. On 503: throw Error("Authentication service unavailable.")
```

**Email verification auto-login on mount:**
The existing mount effect handles `#sb_access_token=...` (OAuth redirect).  A new
check is added for `?token_hash=...&type=signup` in the URL query string:

```
On mount (after the hash check):
  params = new URLSearchParams(window.location.search)
  token_hash = params.get('token_hash')
  type = params.get('type')
  if (token_hash && type === 'signup'):
    Clear URL params (replaceState)
    Call supabase.auth.verifyOtp({ token_hash, type: 'signup' })
    On success: call fetchSession() → user is now logged in and dashboard loads
    On error: set a one-time banner "Email verification failed or link expired."
              (displayed on LoginPage via initialBanner prop)
```

### `App.tsx` — `/reset-password` routing

Before the `!user` check in `ClientAppInner`, add:
```
if (window.location.pathname === '/reset-password'):
    return <ResetPasswordPage />
```

This renders `ResetPasswordPage` whether or not the user is logged in — which is
correct, because the reset flow happens before login.

Also read `?reset_success=1` on mount and pass it to `LoginPage` as the
`initialBanner` prop when the user is unauthenticated.

---

## 8. Subscription Tier Enforcement

Not applicable.  All password auth flows (sign-up, login, reset) are available on
every tier.  No tier limit counters are touched.

---

## 9. New Environment Variables

None.  The existing `FRONTEND_ORIGIN` environment variable (already used in
`auth_routes.py` to build the OAuth callback URL) is reused for the
`email_redirect_to` and `redirect_to` parameters passed to Supabase Auth.

---

## 10. `new_auth_client()` guard — calls requiring unshared client

The two new session-changing calls added by this feature:

| Call | Endpoint | Reason `new_auth_client()` is required |
|------|----------|----------------------------------------|
| `sb.auth.sign_up(...)` | `POST /api/auth/signup` | With `email_confirm=OFF`, Supabase returns a session and swaps the client's `Authorization` header. Even with `email_confirm=ON` (current setting), using `new_auth_client()` is required for correctness under any configuration change. |
| `sb.auth.reset_password_for_email(...)` | `POST /api/auth/reset-request` | Does not return a session, but Supabase-py's implementation may update internal state depending on version. Using `new_auth_client()` costs one extra object creation and costs nothing in correctness. |

**Test guard extension required:**
The `_MUTATING` regex in `TestAuthCallsUseUnsharedClient` must be extended from:
```python
r"sb\.auth\.(sign_in_with_oauth|sign_in_with_password|"
r"exchange_code_for_session|refresh_session|sign_out)\b"
```
to:
```python
r"sb\.auth\.(sign_in_with_oauth|sign_in_with_password|"
r"exchange_code_for_session|refresh_session|sign_out|"
r"sign_up|reset_password_for_email)\b"
```
This ensures the CI test catches any future code that accidentally calls `sign_up` or
`reset_password_for_email` on the shared client.

---

## 11. Identity Linking — Google + Password on the Same Account (Flow D / Story 5)

### What is verified from GoTrue documented behaviour

GoTrue's `reset_password_for_email` queries `auth.users` by email address.  A
subscriber who originally signed in via Google OAuth has their Google email stored in
`auth.users.email` (confirmed by looking at the existing `_sync_profile` which reads
`user.email` from the OAuth session).  Therefore:

1. When `reset_password_for_email` is called with a Google-only subscriber's email,
   GoTrue finds the existing `auth.users` row (by the UNIQUE `email` column) and
   sends a recovery OTP tied to that row's `id`.
2. When the subscriber clicks the reset link and exchanges the token via `verifyOtp`,
   they receive a session for the **existing** `auth.users.id`.  GoTrue does not
   create a second `auth.users` row (the UNIQUE constraint prevents it).
3. When the subscriber calls `POST /api/auth/update-password` → `admin.update_user_by_id`,
   Supabase sets the password on that existing user.  GoTrue adds an email/password
   identity to `auth.identities` for the same `auth.users.id`.
4. The subscriber can now sign in with either Google or email+password.  Their
   `user_profiles`, `portfolios`, `user_watchlists`, `subscriptions`, and all other
   application data are linked to the original `auth.users.id` and are unaffected.

### What is assumed and must be verified in Gate 4

The above relies on the Supabase project not having the "Link accounts automatically"
(or equivalent "Merge identities from same email domain") setting disabled.  In a
small number of Supabase configurations, automatic identity linking is turned off,
which would cause the reset flow to fail with an error at the `verifyOtp` step
(not create a duplicate row — the UNIQUE constraint still applies).

**Gate 4 must run this test against the real project:**

1. Create (or use an existing) test Google account with email `testuser@<domain>`.
2. Sign in via Google OAuth → record `auth.users.id` from the Supabase dashboard
   (`Authentication > Users`).
3. Submit that email in the "Forgot password?" form.
4. Click the reset link in the email.
5. Set a new password.
6. Assert: `auth.users` has ONE row for that email (`Authentication > Users` count
   does not increase).
7. Assert: sign in with email+password succeeds.
8. Assert: sign in with Google still succeeds on the same account.
9. Assert: `user_profiles.id` and `portfolios.user_id` match the original
   `auth.users.id` from step 2.

If this test fails (identity linking disabled or misconfigured), Story 5 / AC5-5 is
blocked.  Resolution: enable automatic identity linking in the Supabase Auth dashboard
under Authentication > Identity Providers settings.

### Risk level

**Low.** The described behaviour is consistent GoTrue documented behaviour and is the
default for all Supabase projects.  The Gate 4 test provides definitive confirmation.
If the test fails, the fix is a single Supabase dashboard toggle — no code changes
are needed.

---

## 12. Reset Link Mechanics — End to End

The full PKCE token_hash reset flow (see also ADR-0016):

```
1. User submits "Forgot password?" form with their email.
   → Frontend calls POST /api/auth/reset-request
   → Backend: new_auth_client().auth.reset_password_for_email(
         email,
         options={"redirect_to": f"{FRONTEND_ORIGIN}/reset-password"}
       )
   → Supabase sends reset email with link:
         https://<project>.supabase.co/auth/v1/verify
            ?token=<otp>&type=recovery
            &redirect_to=https://frontend.app/reset-password

2. User clicks email link.
   → Browser hits Supabase GoTrue URL.
   → GoTrue verifies the OTP (server-side).
   → GoTrue redirects to:
         https://frontend.app/reset-password
            ?token_hash=<hash>&type=recovery

3. Browser loads https://frontend.app/reset-password.
   → App.tsx routes to ResetPasswordPage (pathname check runs before !user check).
   → ResetPasswordPage mounts, reads token_hash and type from URL params.
   → Calls supabase.auth.verifyOtp({ token_hash, type: 'recovery' }).
   → Supabase JS client now holds a recovery session in memory.

4. User enters new password and confirms it.
   → Client-side validation (length ≥ 8, passwords match).
   → Calls POST /api/auth/update-password with Bearer token (from Supabase JS session
       via api.interceptors.request in client.ts).
   → Backend verify_token reads Bearer header (cookie is not set for this session;
       the Bearer fallback in verify_token handles this).
   → Backend calls sb.auth.admin.update_user_by_id(user_id, {"password": new_pw}).
   → Response: { "ok": true }.

5. ResetPasswordPage redirects to /?reset_success=1.
   → LoginPage renders with initialBanner="Password updated. Please sign in."
   → User signs in with their new email+password.
```

**Token transport note:** The httpOnly `sb_access_token` and `sb_refresh_token`
cookies are NOT set during the reset flow (the backend is not involved in the
`verifyOtp` step).  The `verify_token` dependency in `auth_utils.py` already has a
Bearer-header fallback for exactly this case.  This is not a regression — the system
was designed with this dual-path approach (ADR-0010).

---

## 13. Sign-Up Email-Verification Link Mechanics — End to End

```
1. User submits sign-up form.
   → Frontend validates (length ≥ 8, passwords match) then calls POST /api/auth/signup.
   → Backend: new_auth_client().auth.sign_up({
         "email": email,
         "password": password,
         "options": {"email_redirect_to": f"{FRONTEND_ORIGIN}/"}
       })
   → Supabase sends verification email with link:
         https://<project>.supabase.co/auth/v1/verify
            ?token=<otp>&type=signup
            &redirect_to=https://frontend.app/

2. User clicks verification email link.
   → Browser hits Supabase GoTrue URL.
   → GoTrue verifies the OTP.
   → GoTrue redirects to:
         https://frontend.app/?token_hash=<hash>&type=signup

3. Browser loads https://frontend.app/?token_hash=...&type=signup.
   → AuthContext mount effect detects token_hash + type=signup in URL params.
   → Clears params from URL (replaceState).
   → Calls supabase.auth.verifyOtp({ token_hash, type: 'signup' }).
   → On success: Supabase JS session is set; fetchSession() is called.
   → Backend GET /api/auth/session validates the token (Bearer header) and returns
       the user context.
   → _sync_profile runs at first login (via GET /api/auth/session → fetchSession →
       but wait: session endpoint doesn't call _sync_profile).
   
   CORRECTION: fetchSession() calls GET /api/auth/session which does NOT call
   _sync_profile. _sync_profile is called only by the login/email-login/callback
   endpoints. For the email-verification auto-login path, the user is now signed in
   via Supabase JS but _sync_profile has not run yet, so user_profiles may not exist.

   RESOLUTION: After verifyOtp succeeds in AuthContext, call
   POST /api/auth/login (the backward-compatible endpoint) in addition to fetchSession.
   The existing POST /api/auth/login endpoint calls _sync_profile and creates the
   user_profiles row. This is the correct first-login synchronisation path.

   Updated step 3:
   → Calls supabase.auth.verifyOtp({ token_hash, type: 'signup' }).
   → On success:
       a. POST /api/auth/login (Bearer header) → runs _sync_profile → creates
          user_profiles row, checks whitelist/invite-only gate.
       b. If _sync_profile raises 403 (invite-only): show "Access denied" banner
          and do NOT call fetchSession (user stays logged out).
       c. If _sync_profile succeeds: call fetchSession() → user is logged in.
       d. _set_auth_cookies is called by /api/auth/login response → httpOnly cookies set.

4. User is now logged in (or sees the invite-only/suspended error message).
```

---

## 14. Supabase Dashboard Configuration Steps (Manual — Not in Repo)

These steps must be completed by the platform owner before deploying to production.
They cannot be automated through code.

**Step 1 — Confirm email is required:**
Authentication → Providers → Email → "Confirm email" must be **ON**.
(This is the Supabase default; verify it has not been changed.)

**Step 2 — Edit the email templates to send a token hash (REQUIRED):**
Corrected after checking the Supabase documentation: there is no dashboard
"Auth flow type" switch. The emailed link only carries `token_hash` if the
template is written that way; the default templates use `{{ .ConfirmationURL }}`,
which this design's landing pages cannot handle.
Authentication → Email Templates:
- "Confirm signup": link must be
  `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=email`
- "Reset password": link must be
  `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`
Authentication → URL Configuration → "Site URL" must be the production frontend
origin, because the templates build links from `{{ .SiteURL }}`.
The Supabase docs use `type=email` for sign-up confirmation; the frontend should
pass the `type` from the URL through to `verifyOtp` and Gate 4 must confirm the
value against the real project.

**Step 3 — Redirect URL allowlist:**
Authentication → URL Configuration → "Redirect URLs" — add:
- `https://optionscompass.up.railway.app/**` (or `https://optionscompass.up.railway.app/reset-password` specifically)
- `http://localhost:5173/**` (for local development)
Without these entries, Supabase will reject `redirect_to` parameters that do not
match the allowlist, and the email links will fail.

**Step 4 — Email branding (optional):**
Subject and wording of the two templates can be customised; the link format in Step 2 must be kept.
Supabase's built-in SMTP is used for now (OQ-4 decision).  The free plan sends from
`noreply@mail.supabase.io` and is subject to Supabase's shared sending limits
(approximately 3 emails/hour per address, 100 emails/hour per project on the free
plan).  If the platform owner encounters SMTP rate limits during testing, the
"Authentication service unavailable" message should appear; a custom SMTP provider
(SendGrid, Resend) can be configured later under Authentication → SMTP Settings
without any code changes.

---

## 15. Rate Limiting

| Endpoint | Supabase built-in | Backend custom middleware |
|----------|-------------------|--------------------------|
| `POST /api/auth/signup` | Supabase Auth: ~100 sign-ups/hour/IP (free plan) | None in this release |
| `POST /api/auth/reset-request` | Supabase Auth: ~3 emails/hour/address, ~100/hour/IP | None in this release |
| `POST /api/auth/email-login` | Supabase Auth: ~100 sign-ins/hour/IP | None in this release |

Supabase's limits are enforced at the GoTrue layer, before our backend is involved.
If the limits are hit, Supabase returns a `429` or `AuthApiError`; our endpoints
catch this and return `503` to the frontend.  Custom IP-based rate limiting via
`slowapi` can be added as a follow-on task without changing the endpoint contracts.

---

## 16. E2E Auth Fixture Impact

The existing `bypassAuth` fixture in `frontend/e2e/fixtures/auth.ts` stubs only
`GET /api/auth/session`, `GET /api/auth/me`, and `GET /api/auth/entitlements`.
It is **not affected** by this feature.

New E2E tests for the password auth flows are out of scope for Gate 3 (they are a
Gate 4 / QA deliverable).  When written, they will need additional route stubs in the
test file (not in `auth.ts`):
- `POST /api/auth/signup` → 200 `{"ok": true, "detail": "check_email"}`
- `POST /api/auth/reset-request` → 200 `{"ok": true, "detail": "check_email"}`
- `POST /api/auth/email-login` → 200 with session payload (already exists in
  some tests) or 403 for admin email tests

The `ResetPasswordPage` E2E tests will need to mock `supabase.auth.verifyOtp` via
`page.route` or Playwright's `page.addInitScript` to inject a fake Supabase JS
session, and stub `POST /api/auth/update-password`.

---

## 17. `ARCHITECTURE.md` Updates

The auth routes table in `ARCHITECTURE.md` must have the following rows added:

```
| POST | `/api/auth/signup`        | None | Email+password subscriber registration |
| POST | `/api/auth/reset-request` | None | Trigger Supabase password-reset email  |
```

---

## 18. ADR References

- `docs/adr/0016-pkce-token-hash-for-email-auth-redirects.md` — Why email link
  redirects use PKCE token_hash format rather than implicit fragment tokens
- `docs/adr/0017-anti-enumeration-uniform-signup-response.md` — Why `POST /api/auth/signup`
  always returns 200 for existing emails

---

## 19. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

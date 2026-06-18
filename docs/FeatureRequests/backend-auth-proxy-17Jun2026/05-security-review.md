# Security Review — Backend Auth Proxy Refactor

**Date:** 18Jun2026
**Reviewer:** security-reviewer
**Feature:** backend-auth-proxy-17Jun2026
**Commits reviewed:** `d10c036` (backend), `cb3b52a` (frontend), `a860f7c` (Gate 4 docs)
**Fixes applied:** H01, H02, M02, M05 resolved in follow-up commit on same branch.

---

## 1. Executive Summary

The backend-auth-proxy refactor successfully moves all Supabase auth operations into the
FastAPI backend. Tokens are stored in httpOnly cookies rather than localStorage, eliminating
the main-portal exposure of Supabase credentials in the browser. The CORS configuration,
deactivation checks, and JWT verification invariants are all maintained correctly.

Two High findings were identified — both were null-dereference regressions introduced by
stubbing `supabase.ts` before auditing all import sites. Both were fixed on the same branch
before this gate was closed. Two Medium findings (M02, M05) were also fixed in the same
commit. Remaining Medium and Low findings are tracked below for follow-up.

---

## 2. Findings

### Critical

None.

---

### High

**H01 — `StaffAuthContext.tsx` crashed on mount due to `supabase.auth.*` calls on null stub**

`frontend/src/lib/supabase.ts` exports `null as any`. `StaffAuthContext.tsx` called
`supabase.auth.getSession()` and `supabase.auth.onAuthStateChange()` on mount — both would
throw `TypeError: Cannot read properties of null (reading 'auth')`. The staff/admin portal
would be broken for all users.

**Fix applied:** Created `frontend/src/lib/supabase-staff.ts` — a dedicated real supabase-js
client for the staff portal only. Updated `StaffAuthContext.tsx` to import from there. The
main portal stub in `supabase.ts` is unchanged. The staff portal retains `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` as they are required for staff session management, which is
intentionally separate from the cookie-proxy auth model.

☑ Fixed

---

**H02 — `SettingsPage.tsx` password change crashed on `supabase.auth.updateUser()` on null stub**

`frontend/src/components/SettingsPage.tsx` called `supabase.auth.updateUser({ password })`.
With `supabase` being `null`, this threw a `TypeError` at runtime. Password changes were
completely non-functional.

**Fix applied:** Added `POST /api/auth/update-password` backend endpoint to
`auth_routes.py`. The endpoint calls `sb.auth.admin.update_user_by_id(user_id, {"password"})`
using the service key. Updated `SettingsPage.tsx` to call `updatePassword()` from `client.ts`,
removed the `supabase` import entirely from `SettingsPage.tsx`.

☑ Fixed

---

### Medium

**M01 — Optional-auth paths in `options.py` and `strategies.py` do not read the cookie —
activity logging silently dropped for cookie-auth users**

`_resolve_optional_payload()` reads only the `Authorization: Bearer` header via
`HTTPBearer(auto_error=False)`. After the frontend refactor, the browser sends a cookie
instead of a header. The function returns `None`, so activity log calls are silently skipped
for authenticated users on the options chain and strategy analyze endpoints.

This is a data-integrity gap, not a direct security vulnerability.

**Status:** Open — deferred to a follow-up sprint. Tracked as a known limitation.

☐ Fixed &nbsp; ☑ Deferred

---

**M02 — `_CALLBACK_URL` default domain was the frontend URL, not the backend**

`auth_routes.py` line 25: `os.getenv('BACKEND_URL', 'https://optionscompass.up.railway.app')`.
The default was the frontend domain. If `BACKEND_URL` was not set on the Railway backend
service, Supabase would be told to redirect the OAuth code to the frontend, breaking the
entire Google OAuth flow.

**Fix applied:** Default changed to `https://optionscompass-backend.up.railway.app` — the
correct production backend domain matching `client.ts`.

☑ Fixed

---

**M03 — `FRONTEND_ORIGIN` env var accepted without allowlist validation**

`_FRONTEND_ORIGIN` is used in six `RedirectResponse` calls with no `startswith("https://")`
guard. If set to an attacker-controlled value, all OAuth error redirects become open redirects.
The access and refresh tokens are in cookies (not redirect URLs), so token theft via this
path is not possible — but the error redirect destination would be attacker-controlled.

**Status:** Open — deferred. Mitigation: restrict Railway env var access to authorised
operators. A `startswith("https://")` guard should be added at startup.

☐ Fixed &nbsp; ☑ Deferred

---

**M04 — User email logged in plaintext on authentication failure**

`auth_routes.py` line 352: `logger.warning("email_login: Supabase rejected credentials for %s: %s", body.email, exc)`.
Logs the full email address on every failed login attempt. In environments with broad log
access, this leaks targeted email addresses from brute-force attempts.

**Status:** Open — deferred. Recommendation: truncate to `body.email[:3] + "***"`.

☐ Fixed &nbsp; ☑ Deferred

---

**M05 — Refresh lock re-check read stale token `exp` — double-refresh race not fully prevented**

`_maybe_refresh()` re-checked `_get_token_exp(token)` where `token` is the original parameter,
not the current cookie value. If another coroutine had already refreshed the token and written
a new one to `request.cookies`, the re-check would always see the old near-expiry `exp` and
proceed with a redundant refresh, consuming the single-use refresh token.

**Fix applied:** Changed to `current_token = request.cookies.get("sb_access_token") or token`
before the re-check, ensuring the most recent cookie value is used.

☑ Fixed

---

### Low / Informational

**L01 — No rate limiting on `POST /api/auth/email-login`**

No per-IP rate limiting. Supabase applies partial server-side rate limiting, but this should
not be the sole defence. Recommendation: add `slowapi` middleware at 10 requests/minute/IP.

**Status:** Deferred.

---

**L02 — OAuth callback error code derived from exception string matching**

`auth_routes.py` line 248: `if "invite-only" in exc.detail.lower()`. Fragile to detail text
changes. Recommendation: use a structured `error_code` field or custom exception class.

**Status:** Deferred.

---

**L03 — `GET /api/auth/session` exposes `role` as a raw string**

Returns `"role": "admin"` for admin users. No direct security risk — value comes from the
authenticated user's own profile row. Informational only.

---

**L04 — `supabase.ts` stub TODO not followed through before merge**

Three import sites (`StaffAuthContext.tsx`, `SettingsPage.tsx`, the stub itself) remained
unaudited at merge time. H01 and H02 were direct consequences. The stub pattern should not
be used again without a blocking checklist of all import sites.

---

**L05 — `GET /api/auth/google` allows unauthenticated OAuth flow initiation**

Any visitor can trigger a new Supabase OAuth consent dialog. Supabase's PKCE/state parameter
handling mitigates the practical risk. Informational only.

---

## 3. Invariant Checklist

| Check | Result | Notes |
|-------|--------|-------|
| New routes protected by verify_token or intentionally public | PASS | `/auth/google`, `/auth/callback`, `/auth/email-login` are intentionally unauthenticated. `/auth/session`, `/auth/update-password` require verify_token. |
| No admin endpoint reachable by non-admin | PASS | require_admin() unchanged on all admin routes. |
| No IDOR — user data scoped to authenticated user_id | PASS | All user-data reads use user_id from verified payload, never from request body. |
| No user identity derived from request body | PASS | Identity comes exclusively from the verified Supabase token. |
| No python-jose in codebase | PASS | Not present in requirements.txt. JWT payload decoded manually for exp only; verification delegated to sb.auth.get_user(). |
| No SUPABASE_JWT_SECRET in codebase | PASS | Not present in any reviewed file. |
| JWT verified via auth.get_user(token) | PASS | verify_token calls sb.auth.get_user(token) as the authoritative check. |
| MARKETDATA_API_TOKEN absent from frontend | PASS | Not present. |
| SUPABASE_SERVICE_KEY absent from frontend | PASS | Not present. |
| No VITE_ secrets for backend-only values | PASS | VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are retained only for supabase-staff.ts (staff portal). No new VITE_ backend secrets introduced. |
| No raw SQL string concatenation with user input | PASS | All DB calls use the Supabase client query builder. |
| Cookie attributes: HttpOnly, Secure, SameSite=Lax, Path=/ | PASS | _set_auth_cookies sets all four. Secure gated on ENVIRONMENT != development. |
| CORS: allow_credentials=True with explicit origin list, no wildcard | PASS | _client_origins is a hardcoded list. allow_credentials=True set. ADMIN_PORTAL_ORIGINS filters out wildcards. |
| Account suspension enforced on all sign-in paths | PASS | _sync_profile called from all three paths. _is_deactivated also in verify_token as second layer. |

---

## 4. Gate Decision

**Critical findings:** 0
**High findings:** 2 — both **fixed** before gate close
**Medium blockers:** M02, M05 — both **fixed** before gate close

**PASS WITH CONDITIONS**

The two High findings and two deployment-critical Medium findings (M02, M05) have been
resolved on the branch. Remaining Medium findings (M01, M03, M04) and Low findings are
deferred and tracked above.

The following conditions must be met before Railway deployment:

1. Set `BACKEND_URL` on the Railway **backend** service to `https://optionscompass-backend.up.railway.app` — the env var now has the correct default but an explicit value is still recommended to avoid silent misconfiguration.
2. Retain `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the Railway **frontend** service — required by `supabase-staff.ts` for the staff portal.
3. Do not remove `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from Railway frontend env vars (noted as a retirement action in earlier docs — this is now superseded by the staff portal requirement).

**Overall decision:** ☑ PASS WITH CONDITIONS

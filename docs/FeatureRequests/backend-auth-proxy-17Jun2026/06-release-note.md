# Release Note — Backend Auth Proxy Refactor

**Release date:** 18Jun2026
**Version / PR:** `claude/modest-davinci-sxz7lv`
**Author:** Technical Writer + DevOps Engineer

---

## Summary

Authentication now operates entirely through the backend (`optionscompass-backend.up.railway.app`). Google OAuth, email/password sign-in, and session management no longer expose Supabase credentials to your browser. Tokens are stored in secure, JavaScript-inaccessible cookies instead of localStorage, eliminating the token theft attack surface. You will be required to sign in once after this deployment; all subsequent logins use the new backend flow.

---

## What changed

- **Google Sign-In flow** — Clicking "Sign in with Google" redirects through the backend callback instead of directly to Supabase. No change to the user experience; the Google consent screen is identical.
- **Email/password sign-in** — Now routes through `POST /api/auth/email-login` and sets secure cookies. Tokens no longer store in `localStorage` or transmission headers.
- **Session restore** — Signing out or closing the browser now completely clears authentication state. Reopening the app within 7 days restores your session; after 7 days you must sign in again.
- **Token refresh** — Behind the scenes, expired tokens are refreshed transparently. Sessions lasting longer than 1 hour (the access token lifetime) are automatically extended without interrupting your work.
- **One-time forced re-authentication** — All currently-logged-in users will be signed out when this deployment goes live. Sign in again with your Google account or email/password. Your watchlist, paper trading history, and settings are retained.

---

## Why it changed

Moving authentication to the backend eliminates Supabase credentials from the browser, reducing the attack surface for credential theft. Storing tokens in httpOnly cookies prevents JavaScript code (malicious or otherwise) from reading authentication secrets. Transparent server-side token refresh removes the need for users to re-authenticate when sessions reach their 1-hour time limit.

---

## Who it affects

| Tier | Available | Notes |
|------|-----------|-------|
| free | Yes | No tier-specific feature gating. All free-tier users affected equally. |
| starter | Yes | No tier-specific feature gating. All starter-tier users affected equally. |
| pro | Yes | No tier-specific feature gating. All pro-tier users affected equally. |
| enterprise | Yes | No tier-specific feature gating. All enterprise-tier users affected equally. |

---

## Action required by users

1. **Sign in again after deployment.** When you visit the app, you will be shown the login screen even if you were previously logged in. Click "Sign in with Google" or enter your email and password. Your session is re-established within seconds.
2. **Bookmark the app URL** — it remains `https://optionscompass.up.railway.app` and does not change.
3. **No action needed on watchlist, positions, or settings** — all your data is preserved. After signing in, everything is exactly as you left it.

---

## Known limitations

### Deferred security findings

The following findings from the security review are deferred to a follow-up sprint and do not block deployment:

- **M01 — Activity logging gaps on optional-auth endpoints** — Options chain and strategy analysis endpoint activity logs are incomplete for cookie-authenticated users. This will be remediated in a follow-up by updating `_resolve_optional_payload()` to read the `sb_access_token` cookie.
- **M03 — Open redirect via FRONTEND_ORIGIN** — If `FRONTEND_ORIGIN` environment variable is set to an attacker-controlled value, OAuth error redirects become open redirects. Mitigation: restrict Railway environment variable access to authorised operators. A `startswith("https://")` validation guard will be added in a follow-up.
- **M04 — User email plaintext logging** — Failed email-login attempts log the full email address, which could leak targeted addresses from brute-force attempts. Recommendation: truncate email in logs before production logging. Will be fixed in a follow-up.

### Concurrent-tab token refresh edge case

If you have two browser tabs open and both tabs attempt to refresh the token simultaneously, one may briefly receive a 401 (logged-out state). This is rare and does not cause data loss — you will simply be prompted to sign in again in that tab. The other tab continues normally.

### Session cookie lifetime

- **Access token cookie:** expires after 1 hour of validity. Automatically refreshed transparently on any request within 5 minutes of expiry.
- **Refresh token cookie:** expires after 7 days. After 7 days without using the app, you must sign in again.

---

## Deployment steps

### Pre-deployment checklist (MANDATORY)

Complete these steps **before** proceeding to Railway deployment.

1. **Google Cloud Console update**
   - Go to Google Cloud Console > APIs & Services > OAuth 2.0 Client IDs (OptionsDesk project)
   - Edit the Web application client
   - Add to "Authorized redirect URIs": `https://optionscompass-backend.up.railway.app/api/auth/callback`
   - **Do NOT remove the existing Supabase redirect URI yet** — keep both until post-deployment validation

2. **Supabase project update**
   - Go to Supabase Dashboard > Settings > API
   - Scroll to "Redirect URLs (allowed)"
   - Add: `https://optionscompass-backend.up.railway.app/api/auth/callback`
   - **Do NOT remove the Supabase callback URL yet** — keep both until post-deployment validation
   - Save changes

3. **Pre-deployment confirmation**
   - Confirm both Google Cloud Console and Supabase are updated
   - Proceed only after both updates are saved

### Deployment sequence

**Phase 1 — Backend deploy (new endpoints active, dual-mode verify_token)**

1. Ensure environment variables on Railway backend service:
   - `SUPABASE_URL` — already set, no change
   - `SUPABASE_SERVICE_KEY` — already set, no change
   - `BACKEND_URL` — set to `https://optionscompass-backend.up.railway.app` (optional, but recommended; it is now the correct default)

2. Deploy backend service on Railway
   - Code includes new endpoints: `GET /api/auth/google`, `GET /api/auth/callback`, `GET /api/auth/session`, `POST /api/auth/email-login`, `POST /api/auth/update-password`
   - `verify_token` reads cookies first, falls back to `Authorization: Bearer` header for backwards compatibility
   - `POST /api/auth/logout` now clears token cookies
   - Application starts successfully; health check responds: `GET /api/health` → `{"status": "ok"}`

3. Smoke test (against production backend):
   - `curl https://optionscompass-backend.up.railway.app/api/auth/google` → 302 redirect to Supabase OAuth URL
   - Verify no 500 errors in Railway logs

**Phase 2 — Frontend deploy (AuthContext rewrite, Axios withCredentials)**

1. Ensure environment variables on Railway frontend service:
   - `VITE_SUPABASE_URL` — **KEEP (required by staff portal supabase-staff.ts)**
   - `VITE_SUPABASE_ANON_KEY` — **KEEP (required by staff portal supabase-staff.ts)**
   - **Do NOT remove these variables** — contrary to earlier docs, they are needed for the admin staff portal

2. Deploy frontend service on Railway
   - Code includes rewritten `AuthContext.tsx` (polls `GET /api/auth/session` instead of `supabase.auth.getSession()`)
   - Axios client has `withCredentials: true` enabled
   - `supabase.ts` stubbed as no-op; real Supabase client moved to `supabase-staff.ts` for staff portal only
   - E2E fixture updated to stub `GET /api/auth/session`

3. Smoke test (against production frontend):
   - Open `https://optionscompass.up.railway.app` in an incognito browser window
   - Login screen displayed (expected: all users logged out after deployment)
   - Click "Sign in with Google"
   - Complete Google OAuth flow
   - Redirected to dashboard after callback
   - Open browser DevTools > Application > Cookies: verify `sb_access_token` and `sb_refresh_token` present with `HttpOnly` flag
   - DevTools > Network: verify no requests to `supabase.co` auth endpoints; verify Cookie header sent on all API requests

**Phase 3 — Remove Bearer header fallback (post-validation, 48+ hours after Phase 2)**

1. After 48 hours of stable production operation with zero `Authorization: Bearer` header auth errors in Railway logs:
   - Remove the fallback branch from `verify_token()` that accepts `Authorization` header
   - Deploy backend again
   - No user-facing impact; any client still sending headers receives 401 and is prompted to re-authenticate via new flow

---

## Rollback procedure

If critical issues arise before Phase 3 completes:

1. **Rollback frontend:** Revert to previous Railway frontend deployment (restore from Railway's deployment history)
   - Users still see the old `AuthContext` — they continue with `Authorization: Bearer` headers
   - The backend still accepts headers (Phase 1 dual-mode is still active)
   - No user sessions are lost

2. **Rollback backend (if required):** Revert to previous Railway backend deployment
   - Old endpoints (`/api/auth/google`, `/api/auth/callback`) no longer respond
   - But the old `verify_token` still accepts `Authorization: Bearer` header
   - Only necessary if a critical issue exists in the backend new code

3. **Verification after rollback:**
   - Open `https://optionscompass.up.railway.app` in incognito window
   - Login and sign in with Google
   - Verify dashboard loads and positions are visible
   - Check Railway logs for errors

After rollback, investigate the root cause and re-attempt deployment.

---

## Post-deployment monitoring

Monitor for the first 24 hours:

1. **Error rate on new endpoints**
   - Watch Railway backend logs for 5xx errors on `/api/auth/google`, `/api/auth/callback`, `/api/auth/session`, `/api/auth/email-login`
   - Expected: low volume of errors (OAuth callback URL mismatch errors from users who encounter Google errors are expected but rare)

2. **Cookie delivery**
   - Verify at least a few users have `sb_access_token` and `sb_refresh_token` cookies set (check application logs for successful callback returns)
   - If no cookies are being set, CORS configuration or environment variable is misconfigured

3. **Session endpoint hit rate**
   - `GET /api/auth/session` should be called frequently on page load and window focus
   - Sudden 401s from this endpoint indicate token refresh or deactivation issues

4. **Supabase quota**
   - Monitor Supabase usage dashboard for unexpected spike in auth token operations (exchange, refresh, get_user calls)
   - If usage is 10× normal, an infinite refresh loop may exist (contact backend developer immediately)

5. **Deactivation cache latency**
   - Suspended accounts are checked every 60 seconds; there may be a brief window where a deactivated user can still access the app
   - This is documented and expected; no action required

---

## Post-deployment cleanup (Phase 3 only)

After Phase 3 (Bearer header removal) is complete:

1. **Remove from Google Cloud Console**
   - Remove the old Supabase redirect URI from "Authorized redirect URIs" (keep only the backend callback URL)

2. **Remove from Supabase**
   - Remove the old redirect URI from Supabase > Settings > API > Redirect URLs (keep only the backend callback URL)

3. **Optional: Delete supabase.ts stub**
   - After auditing all import sites to confirm no remaining usage, the stub in `frontend/src/lib/supabase.ts` can be removed entirely
   - The `supabase-staff.ts` (used by the staff portal) remains

---

## Gate 7 Sign-Off

| Field | Value |
|-------|-------|
| **Deployed to** | _To be filled by DevOps_ |
| **Deployment date** | _To be filled by DevOps_ |
| **User Guide updated** | _To be filled by Technical Writer_ |
| **Approved by** | _To be filled by Operator_ |
| **Date** | _To be filled by Operator_ |

# ADR-0016 — PKCE Token-Hash Redirect for Email Auth Flows

**Date:** 16Nov2026
**Status:** Accepted
**Deciders:** Solution Architect

---

## Context

Two new email-driven auth flows require Supabase to redirect the user back to the
frontend after an action triggered by an email link: (1) email address verification
after sign-up, and (2) password-reset completion.  For each of these flows Supabase
GoTrue sends the user an email whose link first hits the Supabase GoTrue server and
then redirects to the app.  The redirect can carry the resulting session in one of
two forms:

**Option A — Implicit (legacy fragment tokens):**
Supabase exchanges the OTP server-side and redirects to
`{redirect_url}#access_token=xxx&refresh_token=yyy&type=signup`.
The browser fragment is accessible to JavaScript immediately.  Tokens appear in the
browser history and are logged by any analytics or server-access-log that records
full URLs.

**Option B — PKCE token_hash (current Supabase default for new projects):**
Supabase exchanges the OTP server-side and redirects to
`{redirect_url}?token_hash=xxx&type=signup`.
The frontend must call `supabase.auth.verifyOtp({ token_hash, type })` to obtain a
session.  The token_hash is a one-time, short-lived opaque value; the access and
refresh tokens never appear in the URL.  Requires the "Confirm signup" and "Reset password" email templates to be edited
to build the link from `{{ .TokenHash }}` (the default `{{ .ConfirmationURL }}`
link does not carry a token hash).

---

## Decision

Design for **Option B (PKCE token_hash)**.

---

## Rationale

1. The existing OAuth flow in this project already uses PKCE (the backend explicitly
   generates a code verifier, stores it in a short-lived cookie, and exchanges the
   code at `/api/auth/callback`).  Using PKCE for email flows is consistent with
   the existing security posture.

2. Implicit tokens in the URL fragment are accessible to any JavaScript running on
   the page (including third-party analytics and browser extensions), and they are
   recorded by browser history.  Token-hash redirect eliminates this surface.

3. Supabase projects created after mid-2024 default to PKCE flow; using the default
   avoids a deliberate downgrade in the Supabase dashboard.

4. The token_hash approach works correctly with this app's Bearer-header auth
   architecture.  After `supabase.auth.verifyOtp()` succeeds the Supabase JS client
   holds the session, and the `api.interceptors.request` in `client.ts` attaches it
   as a Bearer header on all subsequent backend requests.

---

## Consequences

**Supabase dashboard action required:**
- Edit the "Confirm signup" and "Reset password" email templates to link to the
  frontend with `token_hash={{ .TokenHash }}`, and set the Site URL to the
  frontend origin. See 02-design.md deployment Step 2.

**Frontend changes required:**
- `AuthContext.tsx` mount effect must detect `?token_hash=...&type=signup` in the
  URL query string and call `supabase.auth.verifyOtp({ token_hash, type: 'signup' })`
  to complete email verification.
- `ResetPasswordPage.tsx` must detect `?token_hash=...&type=recovery` and call
  `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })` before showing the
  set-new-password form.

**Token_hash expiry:** Supabase's default OTP expiry is 3600 seconds (1 hour).
If the user clicks the email link after expiry, `verifyOtp` returns an error and the
frontend shows the "expired link" message.

**No backend changes required** for the OTP exchange itself; the frontend calls
Supabase JS directly.  The backend is only involved when the frontend subsequently
calls `POST /api/auth/update-password` with the resulting Bearer token.

---

## Alternatives rejected

**Routing the email redirect to the backend** (analogous to the OAuth callback):
Possible, but adds a backend round-trip for what is a purely frontend operation.
The OAuth callback must be on the backend because it needs to exchange an OAuth code
(which requires a secret code verifier stored server-side); `verifyOtp` with a
token_hash does not require any server-side secret.

**Implicit fragment tokens for email flows while keeping PKCE for OAuth:**
Technically feasible but inconsistent.  Supabase does not support per-flow override
of the token format; changing the project to Implicit would revert the OAuth flow
too.  Ruled out.

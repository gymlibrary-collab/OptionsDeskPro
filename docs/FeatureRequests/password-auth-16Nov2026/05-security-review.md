# Security Review — Subscriber Password Login + Shared Supabase Client

**Date:** 2026-11-17
**Reviewer:** security-reviewer agent (Gate 5), remediation notes added by session lead
**Branch:** `claude/modest-davinci-sxz7lv`
**Scope:** Part 1 — password feature (`git diff b9aeedd..HEAD`). Part 2 — shared
Supabase client and threaded auth checks (commit `3cb410d`).

**Reviewer's decision: FAIL** — one High finding (H01).
**Status after remediation:** H01, M01, M02, L01 and L05 fixed (see section 4).
M03 needs a manual test against the real project (E-06). The fixes have not
been re-reviewed by the security reviewer.

---

## 1. Findings

### High

**H01 — Password could be changed with only a session token** — *FIXED*
`POST /api/auth/update-password` accepted any authenticated session and no
current password. Anyone holding a subscriber's live session (stolen token,
shared or unattended computer) could replace the password and keep access after
the session expired; for a Google-only subscriber it silently added a password
they did not know existed. The Settings page "Change Password" form used this
endpoint the same way.

### Medium

**M01 — Staff emails can be identified** — *FIXED*
`/auth/signup` and `/auth/reset-request` answer 403 "use Google sign-in" for the
admin email and active staff emails, and a neutral 200 for everyone else. An
outsider can test candidate addresses and learn which belong to staff, then aim
phishing at them. The spec chose the 403 deliberately. Recommendation: return
the same neutral 200, send nothing, and log the attempt. (A response-time
difference would remain, since the staff check returns before the Supabase
call.)

**M02 — No backend rate limiting on the public auth endpoints** — *FIXED*
`/auth/signup`, `/auth/reset-request` and `/auth/email-login` rely entirely on
Supabase's own limits. Password guessing with leaked credential lists spread
across many IP addresses, and reset-email flooding of a victim, are not slowed
by the backend. No CAPTCHA. Recommendation: per-IP limits in the backend (for
example 10 sign-ins per 15 minutes, 5 sign-ups per hour, 3 reset requests per
15 minutes).

**M03 — Pre-registration takeover depends on Supabase behaviour** — *OPEN, verify by test*
An attacker can sign up with a victim's email and a password before the victim
ever uses the app. With email confirmation on, the attacker cannot sign in. The
risk is what happens when the victim later signs in with Google: if Supabase
attached the Google identity to the attacker's unconfirmed account and kept the
password, the attacker's password would work. Supabase's identity-linking
documentation states that when a new identity is linked to an existing user,
other unconfirmed identities are removed, which is the protection needed — but
this has not been tested against this project. Manual test E-06 covers it.

### Low

- **L01** — Minimum password length is 8 with no other policy. Recommendation:
  12, and consider a breached-password check. *Fixed (length only).*
- **L02** — The one-time `token_hash` is in the address bar until the page
  script removes it. Short-lived and single-use; no change needed.
- **L03** — The guard compares exact addresses, so a plus-addressed variant of a
  staff email (`name+x@…`) is a different string. It would be a different
  account, not the staff account. Create staff with plain addresses.
- **L04** — Auth cookies are `SameSite=None` (frontend and backend are on
  different Railway subdomains). CSRF protection rests on CORS and JSON-only
  request bodies; any future endpoint accepting form-encoded bodies would be
  exposed.
- **L05** — `email-login` reported an auth-service outage as "Invalid email or
  password". *FIXED.*

### Informational

- **I01** — Email addresses are written to backend logs on auth events. No
  passwords or tokens are logged.
- **I02** — The test that keeps session-changing auth calls off the shared
  client scans source text and looks back for the nearest `sb = ` line; it does
  not respect function boundaries and covers two files. No false pass today.
- **I03** — Shared client audit: every `.auth.` call in `backend/` was checked
  against the installed supabase-py / gotrue source. Calls on the shared client
  are `get_user(token)` and `auth.admin.*` only, none of which change the
  client's session. All session-changing calls use `new_auth_client()`. The
  lazy creation of the client's sub-clients can race under threads, with no
  effect beyond a discarded duplicate.
- **I04** — The email-template change and custom SMTP are manual steps with no
  automated check; make both go/no-go items at release.
- **I05** — A recovery session is an ordinary session and can call any
  authenticated endpoint until it expires or is signed out.

## 2. Confirmed sound

- Admin/staff guard: case and whitespace normalised; fails closed; runs before
  any Supabase call; on `update-password` it uses the email from the verified
  token, so a staff member signed in with Google cannot give themselves a
  password. Inactive staff are treated as subscribers, as intended.
- `update-password` takes the user id only from the verified token; the request
  body cannot influence it.
- No registered-email enumeration on sign-in, sign-up or reset-request.
- Redirect URLs sent to Supabase come from a backend environment variable; the
  `?forgot=1` / `?signup=1` / `?reset_success=1` parameters only switch screens.
- `verify_token` after the threading change: same checks, same order, all
  failures deny.
- Invariants: no python-jose, no `SUPABASE_JWT_SECRET`, no service key or
  backend secret in the frontend, no string-built queries.

## 3. Gate decision (reviewer)

**FAIL.** Conditions for a pass:

| ID | Condition |
|---|---|
| H01 | Changing a password must require the current password, or a session that just came from the emailed reset link. Required. |
| M03 | Verify and record how the project handles a Google sign-in to an email with an unconfirmed password account. Required before release. |
| M01 | Neutral response for staff emails. Recommended before release. |
| M02 | Backend rate limiting on the public auth endpoints. Recommended before release. |

## 4. Remediation

| ID | Status | What changed |
|---|---|---|
| H01 | Fixed 2026-11-17 | `update-password` now requires either (a) a session established from an emailed link within the last 15 minutes, read from the verified token's `amr` claim, or (b) the current password, checked with a sign-in on an unshared client. The Settings "Change Password" form has a "Current password" field. The endpoint also acts on the Bearer token's user when one is sent, so the reset page cannot change a different account's password via a leftover cookie. 10 new backend tests. |
| L05 | Fixed 2026-11-17 | `email-login` returns 503 for auth-service failures; the sign-in call no longer blocks the event loop. |
| M01 | Fixed 2026-11-17 | Owner chose the neutral response. Sign-up and reset-request answer a staff/admin address with the same 200 as anyone else, create and send nothing, and log the attempt. Sign-in and update-password keep the explicit refusal. The small response-time difference noted by the reviewer remains. |
| M02 | Fixed 2026-11-17 | Owner chose to add it now. In-process per-client limits: sign-in 10 per 15 min, sign-up 5 per hour, reset-request 3 per 15 min; 429 with Retry-After. No CAPTCHA. The client address is taken from X-Real-IP, else the right-most X-Forwarded-For entry; this assumes one trusted proxy in front of the app and is NOT verified against Railway — manual tests G-04 and G-05 check it. Limits are per process and reset on restart. |
| M03 | Open | Manual test E-06. |
| L01 | Fixed 2026-11-17 | Owner chose 12 characters. Enforced server-side on sign-up and password change/reset, and in all three forms. Existing shorter passwords still sign in. No breached-password check. |

**Not verified against the real project:** the H01 fix assumes Supabase labels a
session created from the reset link with `amr` method `recovery` (or `otp`). If
the real label differs, the reset page will ask for a current password and the
reset will fail. Manual test D-07 would catch this and is a release blocker.

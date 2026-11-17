# ADR-0017 — Anti-Enumeration: Uniform 200 Response for Sign-Up Duplicate Email

**Date:** 16Nov2026
**Status:** Accepted
**Deciders:** Solution Architect (OQ-3 decided by Product Owner in Gate 1)

---

## Context

The `POST /api/auth/signup` endpoint receives an email and password.  If the email
address is already registered in Supabase Auth (whether from a prior password
sign-up or a Google OAuth sign-up), the backend must decide what to return.

**Option A — Uniform success (no enumeration):**
Return `200 {"ok": true, "detail": "check_email"}` regardless of whether the email
is new or already registered.  Supabase will silently not create a duplicate user
(the `auth.users.email` column has a UNIQUE constraint).  Depending on Supabase
project settings, Supabase may send a "someone tried to register with your email"
notification to the existing account holder.

**Option B — Explicit error:**
Return `400` or `409` with "An account with that email already exists."  Leaks
whether an email is registered — usable for pre-flight credential-stuffing checks.

---

## Decision

**Option A (uniform success, no enumeration).**
This was decided by the Product Owner in Gate 1 (OQ-3) and is recorded here for
architectural completeness.

---

## Implementation

The sign-up endpoint catches ALL errors returned by `sb.auth.sign_up()` (including
Supabase's `AuthApiError: User already registered` and any other error variant) and
returns `200 {"ok": true, "detail": "check_email"}` in all non-500 cases.

The only exceptions to this uniform response are:
- `400`: Client-supplied password < 8 characters (validation, not enumeration).
- `403`: Admin/staff email submitted (see requirement 29).
- `503`: Supabase Auth is unreachable (generic "service unavailable").

---

## Consequences

**UX trade-off:** A subscriber who already has a Google-only account and mistakenly
uses the sign-up form will receive "check your email" rather than "you already have
an account."  Supabase may send a notification email to their address.  This is
intentional: the mild UX friction is preferable to exposing which email addresses
are registered.

**Supabase notification email:** When `sign_up` is called with an existing
Google-authenticated email, Supabase GoTrue (depending on project settings) may
send a "you already have an account, sign in here" email to that address.  This is
the documented Supabase behaviour for duplicate-email sign-ups with email
confirmation enabled.

**Security:** Removes the ability to enumerate registered email addresses via the
sign-up form.  Consistent with how Auth0, Clerk, and Supabase's own hosted UI handle
this case.

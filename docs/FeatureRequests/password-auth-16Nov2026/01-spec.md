# Feature Spec — Password-Based Authentication for Subscribers

**Date:** 16Nov2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

OptionsDesk currently authenticates every user via Google OAuth.  The product
owner wants subscribers to be able to sign in with an email address and
password instead.  Three distinct flows are required: (1) login with existing
email+password credentials, (2) new-subscriber password creation (the moment
a subscriber first sets and confirms their password), and (3) password reset
for a subscriber who has forgotten their credentials.

This feature closes the last gap in the email/password path.  The sign-in
endpoint (`POST /api/auth/email-login`) and an authenticated
change-password endpoint (`POST /api/auth/update-password`) already exist and
work.  What is missing is: a working self-service sign-up backend call, a
triggered password-reset email, a reset-completion landing page, and the
frontend wiring that connects each flow end-to-end.

---

## 2. Decided Scope Boundaries

The following questions were raised during spec authoring and answered by the
product owner before the spec was finalised.  They are recorded here so the
architect does not need to re-open them.

**Decision D-1 — Google sign-in is kept alongside password login.**
Google OAuth is not removed.  Email+password is added as a parallel method.
A subscriber may use either method.  The spec therefore includes a path for
a subscriber who currently holds a Google-only Supabase identity and wishes
to add a password to that same account.

**Decision D-2 — Scope is subscriber accounts only.**
Admin and platform-staff accounts continue to use Google OAuth exclusively.
Password-based login, sign-up, and reset must not be usable for admin or
staff email addresses.  The admin portal (`portal=admin`) is unaffected by
this feature.

---

## 3. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| New subscriber | free / starter / pro | Create an account with email+password without needing a Google account |
| Returning subscriber (password) | any | Sign in securely with the email+password credentials they set at registration |
| Returning subscriber (Google) | any | Continue to sign in with Google exactly as today — no regression |
| Google-only subscriber adding a password | any | Gain the ability to sign in with email+password on an account that was originally created via Google OAuth |
| Locked-out subscriber | any | Recover access after forgetting their password |
| Admin / platform staff | n/a | Out of scope — continues to use Google OAuth only |

---

## 4. Functional Requirements

### Flow A — Email+Password Sign-In (login)

1. The login form must present email and password fields and a submit button.
   The form must be accessible with a keyboard alone (tab order, `Enter` to
   submit).
2. On submit the frontend must call `POST /api/auth/email-login`.  On success
   it must store the returned tokens and transition the user to the
   authenticated dashboard in the same way that Google OAuth does today.
3. If the backend returns HTTP 401, the form must display the message "Invalid
   email or password." — no other detail.
4. If the backend returns HTTP 403 with header `X-Error-Code: account_suspended`,
   the form must display "Your account has been suspended. Contact support."
5. If the backend returns HTTP 503, the form must display "The platform is
   currently under maintenance. Please try again later."
6. While the request is in flight, the submit button must be disabled and show
   a loading indicator.
7. The sign-in form must include a "Forgot password?" link that opens the
   password-reset flow (Flow C).
8. The backend must never disclose in a sign-in error response whether the
   email address exists in the system (the message "Invalid email or password"
   satisfies this requirement for 401; the backend already implements this).

### Flow B — New-Subscriber Password Creation (sign-up)

9. The sign-up form must collect: email address, password, confirm-password.
   All three fields are required.
10. The frontend must enforce: passwords must match, password must be at least
    8 characters long.  Both checks must fire client-side before any network
    call is made.
11. The backend sign-up endpoint must enforce the minimum-length rule
    server-side as well (8 characters minimum).
12. On successful sign-up the frontend must display a confirmation message
    instructing the subscriber to check their email and click the verification
    link before they can sign in.
13. The sign-up flow must call a backend endpoint that in turn calls
    Supabase Auth's sign-up API (`sb.auth.sign_up`).  The
    `SUPABASE_SERVICE_KEY` or any other secret must not be passed to or
    handled by the browser.
14. If the email address is already registered in Supabase Auth, the backend
    must return a response that does not confirm whether the address is in use
    (see Open Question OQ-3 for the recommended strategy).
15. After sign-up, the new subscriber's row is NOT yet present in
    `user_profiles` or `user_whitelist`.  `_sync_profile` runs for the
    first time on the subscriber's first successful login after email
    verification.  The spec does not mandate when the whitelist/invite check
    is enforced — that is an Open Question (OQ-1).

### Flow C — Password Reset

16. A "Forgot password?" trigger on the sign-in page must present a
    single-field form collecting the subscriber's email address.
17. On submit, the frontend calls a backend endpoint that triggers a Supabase
    Auth password-reset email.  The endpoint must respond identically
    regardless of whether the email address is registered (generic "if an
    account exists for that address, a reset link has been sent" message),
    so that the response cannot be used to enumerate registered addresses.
18. The password-reset email must contain a one-use link that opens the app at
    a dedicated "set new password" page.
19. The "set new password" page must present a password field and a confirm-
    password field.  It must enforce the same minimum-length rule as sign-up
    (8 characters).
20. On submission the frontend must call the existing
    `POST /api/auth/update-password` endpoint, which uses the
    Supabase Admin API to set the password on the authenticated session carried
    by the reset link's token.
21. After the password is successfully updated, the subscriber must be
    redirected to the sign-in page with a success banner.
22. If the reset link has expired or has already been used, the backend must
    return an error and the frontend must display: "This reset link has expired
    or has already been used. Please request a new one." with a link back to
    the "Forgot password?" flow.
23. The reset link must be single-use (Supabase Auth enforces this natively).
24. The backend endpoint that triggers a reset email must be unauthenticated
    (the subscriber cannot be logged in if they have forgotten their password).

### Flow D — Google-only subscriber sets a password (adds email+password to existing account)

25. A subscriber whose Supabase identity was created exclusively via Google
    OAuth may use the "Forgot password?" / password-reset flow to set a
    password on their account.  After completing the reset flow, they can
    sign in with either Google or email+password.
26. The reset-request form (Flow C) must accept the subscriber's Google-
    associated email address and trigger a Supabase password-reset email to
    that address.  The flow is identical to Flow C for all other subscribers.
27. The architect must confirm whether Supabase links the Google identity and
    the email+password identity when the same email address is used for both
    (identity linking/account merging).  If Supabase creates a second
    `auth.users` row rather than merging, the architect must specify which
    row is the canonical one and what happens to `user_profiles` and
    subscriptions data.  This is flagged as an architectural risk.

### Flow E — Admin/staff accounts must not use password login

28. If a user whose email address matches a `platform_staff` row or whose
    `user_profiles.role` is `admin` (including `ADMIN_EMAIL`) attempts to
    sign in via `POST /api/auth/email-login`, the backend must reject the
    request with HTTP 403 and the message "Password login is not available
    for this account. Use Google sign-in."
29. If the same admin/staff email is submitted to the sign-up endpoint, the
    backend must reject the request with HTTP 403 and the same message.
30. The password-reset flow must similarly reject an admin/staff email at the
    reset-request step (the endpoint returns HTTP 403 rather than the generic
    "if an account exists" message, so that the admin is not exposed to a
    silent no-op).  Alternatively, the endpoint may succeed silently but not
    send an email — the architect should choose the approach that is least
    surprising in practice.

### General / Cross-cutting

31. All password fields must use `type="password"` so that browser and
    password-manager autocomplete works correctly.
32. All auth-related tokens — `sb_access_token`, `sb_refresh_token` — must
    continue to be stored as httpOnly cookies set by the backend.  Tokens must
    not be stored in `localStorage` by the frontend except as the transient
    handoff already in use by the OAuth callback flow.
33. Rate-limiting: the sign-in and reset-request endpoints must reject
    excessive requests from a single IP.  The spec defers the exact threshold
    and enforcement mechanism to the architect (Supabase's built-in Auth
    rate-limits may be sufficient; a custom middleware layer may be needed if
    not).
34. All new backend endpoints must be listed in `ARCHITECTURE.md`.
35. The E2E auth-bypass fixture (`frontend/e2e/fixtures/auth.ts`) stubs
    `GET /api/auth/session`, `GET /api/auth/me`, and
    `GET /api/auth/entitlements` only — it does not go through the login page.
    New E2E tests for the login page itself will need additional route stubs
    for `POST /api/auth/email-login`, the sign-up endpoint, and the
    reset-request endpoint.

---

## 5. User Stories & Acceptance Criteria

### Story 1 — Sign in with email and password

**As a** returning subscriber, **I want** to sign in with my email address and
password **so that** I can access OptionsDesk without needing a Google account.

**Acceptance Criteria:**

- [ ] AC1-1: Given the login page is open, when I enter a valid email and
  correct password and submit, I am redirected to the authenticated dashboard
  within 5 seconds and can see my watchlist.
- [ ] AC1-2: Given the login page is open, when I enter a valid email and an
  incorrect password and submit, the form shows "Invalid email or password."
  and I remain on the login page.
- [ ] AC1-3: Given the login page is open, when I enter an email address that
  is not registered and submit, the form shows "Invalid email or password."
  (same message as AC1-2 — no enumeration).
- [ ] AC1-4: Given the login page is open, while the sign-in request is in
  flight the submit button is disabled and shows a loading state.
- [ ] AC1-5: Given the login page is open, when I press Tab I move through
  email, password, submit button in order; pressing Enter from the password
  field submits the form.
- [ ] AC1-6: Given my account has been suspended, when I attempt to sign in
  with valid credentials the form shows "Your account has been suspended.
  Contact support." and I am not logged in.
- [ ] AC1-7: Given I signed in via Google OAuth previously, the Google
  sign-in button is still present on the login page and signing in with
  Google still works without any regression (confirmed per Decision D-1).

### Story 2 — Create a new account with email and password

**As a** new subscriber, **I want** to register with my email address and a
password of my choosing **so that** I can access OptionsDesk without a Google
account.

**Acceptance Criteria:**

- [ ] AC2-1: Given the sign-up form is open, when I enter a valid email,
  enter matching passwords of 8 or more characters, and submit, I see a
  confirmation message telling me to verify my email address.
- [ ] AC2-2: Given the sign-up form is open, when I enter passwords that do
  not match and attempt to submit, the form shows "Passwords do not match."
  before any network call is made.
- [ ] AC2-3: Given the sign-up form is open, when I enter a password shorter
  than 8 characters and attempt to submit, the form shows "Password must be
  at least 8 characters." before any network call is made.
- [ ] AC2-4: Given I have already registered with an email address, when
  someone submits the sign-up form with the same email address, the response
  does not confirm or deny that the address is in use (the form shows the
  same success confirmation as AC2-1, or a generic error — see OQ-3).
- [ ] AC2-5: Given the sign-up confirmation message is shown, when I click
  the email verification link in my inbox and return to the app, I am able
  to sign in successfully with my email and password.
- [ ] AC2-6: Given the sign-up form is open, when I leave the email field
  blank and submit, client-side validation shows "Email and password are
  required." before any network call is made.
- [ ] AC2-7: The backend sign-up endpoint rejects a password shorter than
  8 characters with HTTP 400 even if the client-side check is bypassed
  (testable by sending a direct API request with a short password).

### Story 3 — Request a password reset

**As a** subscriber who has forgotten their password, **I want** to request a
password-reset email **so that** I can regain access to my account.

**Acceptance Criteria:**

- [ ] AC3-1: Given the sign-in page is open, when I click "Forgot password?"
  I see a single-field form asking for my email address.
- [ ] AC3-2: Given the reset-request form is open, when I enter a registered
  email address and submit, I see the message "If an account exists for that
  address, a reset link has been sent. Check your inbox."
- [ ] AC3-3: Given the reset-request form is open, when I enter an email
  address that is not registered and submit, I see the same message as
  AC3-2 (no enumeration of registered addresses).
- [ ] AC3-4: Given the reset-request form is open, when I leave the email
  field blank and submit, the form shows a validation error before any
  network call.
- [ ] AC3-5: Within 5 minutes of submitting the reset request for a
  registered address, I receive an email containing a reset link.

### Story 4 — Complete a password reset via link

**As a** subscriber who requested a reset, **I want** to set a new password
using the link in my email **so that** I can sign in again.

**Acceptance Criteria:**

- [ ] AC4-1: Given I click the reset link in my email, I land on a
  "Set new password" page in the app (not an external Supabase-hosted page),
  which shows password and confirm-password fields.
- [ ] AC4-2: Given I am on the "Set new password" page, when I enter
  matching passwords of 8 or more characters and submit, I am redirected to
  the sign-in page with a success banner "Password updated. Please sign in."
- [ ] AC4-3: Given I am on the "Set new password" page, when I enter
  passwords that do not match and submit, the form shows "Passwords do not
  match." and no API call is made.
- [ ] AC4-4: Given I am on the "Set new password" page, when I enter a
  password shorter than 8 characters and submit, the form shows "Password
  must be at least 8 characters." and no API call is made.
- [ ] AC4-5: Given I open the reset link a second time (after already using
  it), the app shows "This reset link has expired or has already been used.
  Please request a new one." with a link back to the "Forgot password?"
  form.
- [ ] AC4-6: Given I open a reset link that is more than 24 hours old (or
  whatever Supabase's configured expiry is), the app shows the same expired
  message as AC4-5.
- [ ] AC4-7: After completing AC4-2, signing in with the new password
  succeeds and signs in with the old password fails.

### Story 5 — Google-only subscriber adds a password to their account

**As a** subscriber who originally signed up with Google, **I want** to set an
email+password on my account **so that** I can sign in without needing my
Google account.

**Acceptance Criteria:**

- [ ] AC5-1: Given I have a Google-authenticated account, when I enter my
  Google-associated email in the "Forgot password?" form and submit it,
  I receive a password-reset email at that address within 5 minutes.
- [ ] AC5-2: Given I complete the password-reset flow (Stories 3 and 4)
  using my Google email address, I can then sign in successfully using
  email+password with the new password.
- [ ] AC5-3: Given I have added a password via AC5-1 and AC5-2, I can
  still sign in with Google on the same account (Decision D-1: both
  methods remain available).
- [ ] AC5-4: After adding a password via the reset flow, my paper-trading
  portfolio, positions, watchlist, and subscription entitlements are
  unchanged — no data loss from the identity merge/link operation.
- [ ] AC5-5: If the architect determines that Supabase creates a separate
  `auth.users` row for the email+password identity (rather than linking it
  to the existing Google identity), this story is blocked and must be
  re-scoped.  This AC serves as the QA gate for the architectural risk
  flagged in requirement 27.

### Story 6 — Admin and staff accounts cannot use password login

**As a** platform operator, **I want** admin and staff email addresses to be
rejected by the password auth flows **so that** privileged accounts cannot
be accessed via a weaker credential path and must continue to use Google OAuth.

**Acceptance Criteria:**

- [ ] AC6-1: Given an email address that matches the hardcoded `ADMIN_EMAIL`
  (`leonardsim.sm@gmail.com`), when that email is submitted to
  `POST /api/auth/email-login` with any password, the backend returns
  HTTP 403 with a message that does not reveal the user's password.
- [ ] AC6-2: Given an email address that has a row in `platform_staff` with
  `is_active = true`, when that email is submitted to
  `POST /api/auth/email-login`, the backend returns HTTP 403.
- [ ] AC6-3: Given the admin email or an active staff email is submitted to
  the sign-up endpoint, the backend returns HTTP 403 (staff/admin cannot
  create a new password-based account via the subscriber sign-up path).
- [ ] AC6-4: Given a non-admin, non-staff email is submitted to
  `POST /api/auth/email-login`, AC6-1 and AC6-2 do not apply — the
  subscriber proceeds through the normal sign-in flow.
- [ ] AC6-5: The admin portal (accessed via `GET /api/auth/google?portal=admin`)
  is not affected by this feature; it continues to work exactly as today.

---

## 6. Out of Scope

- Real-money brokerage connections: OptionsDesk is a paper-trading platform
  and no real broker authentication is involved.
- Social login providers other than Google (Apple, GitHub, etc.).
- Multi-factor authentication (MFA / TOTP).
- Single sign-on (SAML, OpenID Connect enterprise federation).
- Admin-panel password-based authentication (decided out of scope per
  Decision D-2; admin portal login continues to use Google OAuth only).
- Password strength meter UI beyond the minimum-length rule (may be added in
  a later iteration).
- Magic-link (passwordless) login.
- Explicit account-merging UI: a subscriber cannot manually link or unlink
  a Google identity and an email+password identity through a UI in this
  release.  The natural "add a password to a Google account" path (Story 5)
  relies on Supabase's internal identity handling; this is flagged as an
  architectural risk (requirement 27) but a user-facing merge wizard is
  out of scope.

---

## 7. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| Supabase Auth is unavailable | Sign-in and sign-up endpoints return HTTP 503; the frontend displays "Authentication service unavailable. Please try again shortly." |
| Reset link token is malformed or tampered with | Supabase returns an error; the app shows the "expired or already used" message. |
| Subscriber uses the reset link on a different device or browser | Supabase's token exchange works cross-device; no issue expected, but should be verified in QA. |
| Subscriber submits the reset-request form multiple times in quick succession | The backend rate-limit (Supabase Auth built-in or custom) blocks repeated sends; the form shows a generic "If an account exists, a reset link has been sent." message on each attempt to avoid revealing the rate-limit state. |
| Subscriber's email provider delays delivery (reset email not received) | The subscriber can re-submit the reset form; the previous link is invalidated when a new one is issued (Supabase behaviour — confirm with architect). |
| Invite-only mode is enabled (platform setting) | A new subscriber who registers with email+password but is not in `user_whitelist` will be rejected at first login by `_sync_profile` (HTTP 403). The sign-up endpoint itself does not check the whitelist; the check happens at login time. The frontend must display the "invite-only" denial message correctly on the first sign-in attempt post-verification. |
| Platform maintenance mode | Sign-in attempt returns HTTP 503; the frontend shows the maintenance message. |
| Account deactivated | `_sync_profile` raises HTTP 403 with `X-Error-Code: account_suspended`; the frontend shows the suspension message. |
| `signUpWithEmail` called but `SUPABASE_SERVICE_KEY` is not configured | Backend returns 503; the frontend shows a generic error (no key detail exposed). |
| Reset link opened before token is fully propagated | Edge case at Supabase infrastructure level; treated the same as an expired link by the frontend. |
| New subscriber attempts sign-in before clicking the verification email | Supabase returns an email-not-confirmed error; the backend translates this to a user-facing message: "Please verify your email address before signing in. Check your inbox." |

---

## 8. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|--------------|
| Supabase Auth | `sign_up`, `sign_in_with_password`, `reset_password_for_email`, token exchange, `admin.update_user_by_id` | No hard quota at current scale; Supabase Auth rate-limits (100 sign-ups/hour free tier) could be hit if signup is abused — see OQ-4 for email sender. |
| Supabase Postgres | `user_profiles` upsert on first login after email verification; `user_whitelist` read in `_sync_profile` | No new query patterns; existing load. |
| Email delivery (Supabase built-in SMTP or custom) | Verification emails, password-reset emails | Supabase free plan sends via shared SMTP with limited deliverability; custom SMTP (SendGrid, Resend) recommended for production — see OQ-4. |
| Claude API | Not touched by this feature | No impact. |
| Reddit PRAW | Not touched by this feature | No impact. |
| yfinance / Synthetic BS | Not touched by this feature | No impact. |

---

## 9. Subscription Tier Impact

This feature is purely an authentication/access mechanism.  It is not gated by subscription tier.  A subscriber on any tier — free, starter, pro, or enterprise — uses the same sign-up, sign-in, and reset flows.

| Tier | Behaviour |
|------|----------|
| free | Full access to all three flows. Tier entitlements are unchanged. |
| starter | Full access to all three flows. Tier entitlements are unchanged. |
| pro | Full access to all three flows. Tier entitlements are unchanged. |
| enterprise | Full access to all three flows. Tier entitlements are unchanged. |

No new scan-count or watchlist-limit implications.  The existing `_sync_profile`
tier-resolution logic is unchanged; this feature only changes how the user
arrives at the first valid JWT.

---

## 10. Open Questions

The following decisions must be made by the product owner before the architect
proceeds.  Each is listed with the available options and a BA recommendation.
OQ-1 (Google vs. password) and OQ-2 (admin/staff scope) have already been
decided and are recorded in Section 2 above.

---

**OQ-1 — How does a new subscriber start: self-service sign-up, admin
invite, or post-Stripe checkout?**

Today there is no self-service sign-up backend.  Subscribers exist in Supabase
Auth only after Google OAuth or after an admin adds them to `user_whitelist`.

- **Option A — Self-service sign-up:** Any visitor can register with
  email+password.  `_sync_profile`'s invite-only check gates access at first
  login.  This is the lowest-friction path.
- **Option B — Admin-invite only:** Admin sends an invite email (via Supabase
  Auth's `admin.invite_user_by_email` API or a custom invite link).  The
  subscriber clicks the link, sets a password, and is logged in.  No self-
  service sign-up form needed.
- **Option C — Post-Stripe checkout:** After a successful Stripe checkout,
  the backend sends the subscriber an invite/set-password email.  Applies
  only to paid tiers; free-tier sign-up still needs a path.

**BA recommendation:** Option A for free tier (self-service, low-friction),
combined with Option B for admin-initiated invites for paid subscribers
(post-Stripe checkout email could use the same invite mechanism).  This
covers all cases: anyone can register, whitelist/invite-only mode controls
who gets in.  Option B alone would require the admin to manually invite every
free-tier subscriber, which does not scale.

---

**OQ-2 — Is email verification required before first login?**

Supabase Auth can be configured to require email confirmation before a
`sign_in_with_password` call succeeds.

- **Option A — Required:** The subscriber cannot sign in until they click the
  verification link.  Standard security practice; prevents typo-squatting.
- **Option B — Not required:** The subscriber can sign in immediately after
  sign-up without verifying their email.

**BA recommendation:** Option A (required).  Email verification is a minimal
security control that prevents "I accidentally registered someone else's
address" scenarios.  The frontend already shows a success banner prompting
verification (the string is in `LoginPage.tsx` on line 213).  Supabase's
default is to require confirmation; keeping the default is simpler.

---

**OQ-3 — Email-already-registered behaviour on sign-up**

If a subscriber submits the sign-up form with an email that already exists in
Supabase Auth:

- **Option A — Silent success (no enumeration):** Return the same
  "check your email" message regardless.  The subscriber receives an email
  telling them an account already exists and offering a sign-in link.  This
  is the most privacy-preserving approach and is used by Auth0, Clerk, and
  Supabase's hosted UI.
- **Option B — Explicit error:** Return "An account with that email already
  exists. Sign in instead."  Leaks enumeration data but is more user-friendly.

**BA recommendation:** Option A.  Enumeration enables credential-stuffing
pre-checks.  The minor UX cost (subscriber does not know immediately that
the address is taken) is worth the security improvement.

---

**OQ-4 — Who sends the verification and reset emails, and from what address?**

- **Option A — Supabase built-in SMTP (default):** No configuration needed.
  Emails come from `noreply@mail.supabase.io` on the free plan.  Shared IP;
  deliverability is unreliable for production use.
- **Option B — Custom SMTP (SendGrid, Resend, AWS SES, etc.):** Configured in
  Supabase project → Authentication → Email Settings.  Sends from a
  custom `from` address (e.g., `noreply@optionscompass.app`).  Better
  deliverability and branding.

**BA recommendation:** Option B for production.  Supabase shared SMTP is
adequate for development and QA but not for a subscriber-facing product.
The choice of provider (SendGrid, Resend, etc.) and the `from` address are
operational decisions outside this spec's scope.

---

## 11. Product Owner Annotations

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — Sign in with email+password | | |
| Story 2 — New-subscriber sign-up | | |
| Story 3 — Request password reset | | |
| Story 4 — Complete reset via link | | |
| Story 5 — Google-only subscriber adds a password | | |
| Story 6 — Admin/staff accounts cannot use password login | | |

**MVP boundary:** [Stories in v1]

**Deferred to backlog:** [Stories deferred]

**PO gate decision:** ☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

# Gate Approvals — Subscriber Password Login

**Feature folder:** `docs/FeatureRequests/password-auth-16Nov2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | leonard.simgt@gmail.com |
| **Date** | 2026-11-16 |
| **Notes** | Decisions: D-1 Google sign-in kept as an alternative; D-2 subscribers only, admin/staff stay Google-only and are refused password login; OQ-1 self-service sign-up (existing whitelist / invite-only gate still applies at first login); OQ-2 email verification required before first login; OQ-3 sign-up with an existing email returns the same neutral response (no enumeration); OQ-4 originally Supabase built-in email sender; superseded 2026-11-17: custom SMTP is required before release, because the built-in sender only delivers to members of the Supabase organisation (owner will configure it); password minimum stays as LoginPage already enforces. |

☑ Approved &nbsp; ☐ Changes Requested

---

## Gate 2 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | leonard.simgt@gmail.com |
| **Date** | 2026-11-16 |
| **Notes** | Approved with one amendment: the admin/staff guard fails closed — if the staff lookup errors, password login, sign-up and reset are refused. Dashboard steps were corrected before approval (email templates must be edited to send a token hash; there is no flow-type setting). |

☑ Approved &nbsp; ☐ Changes Requested

---

## Gate 3 — Implementation Diff

| | |
|---|---|
| **Branch / PR** | `claude/modest-davinci-sxz7lv` (backend 77f4673, frontend 1554d44) |
| **Approved by** | leonard.simgt@gmail.com |
| **Date** | 2026-11-16 |
| **Key files changed** | `backend/routes/auth_routes.py`, `backend/tests/test_password_auth.py`, `frontend/src/context/AuthContext.tsx`, `frontend/src/components/LoginPage.tsx`, `frontend/src/components/ResetPasswordPage.tsx`, `frontend/src/App.tsx`, `frontend/src/api/client.ts`, `frontend/e2e/pages/password-auth.spec.ts` |
| **Notes** | Backend 599 tests passing (47 new); frontend build clean; new e2e spec 18/18, all against mocked Supabase. Review fixes: staff lookup escapes ilike wildcards; recovery session signed out after reset. Beyond design: admin/staff guard also added to update-password. For Gate 5: staff emails are distinguishable via the 403 on sign-up/reset-request; non-outage Supabase sign-up errors are swallowed. Pre-existing: login.spec.ts / login-email.spec.ts fail 54 of 57 on main as well. |

☑ Approved &nbsp; ☐ Changes Requested

---

## Gate 4 — Test Report

| | |
|---|---|
| **Document** | `04-test-report.md`, `04-manual-test-plan.md` |
| **Automated tests added** | 47 backend pytest; `password-auth.spec.ts` (28 tests); `login.spec.ts` and `login-email.spec.ts` rewritten |
| **All AC covered** | No — loading state, keyboard-only sign-in and the suspended-account message have no automated test; Story 5 (Google account adds a password) is manual only |
| **Approved by** | |
| **Date** | |
| **Notes** | Automated portion complete 2026-11-16: backend 599 passing; login/password specs 46 passing, 0 failing. NOT yet approved: the manual test plan has not been run against the real Supabase project, and it depends on the dashboard template changes and custom SMTP. Owner asked on 2026-11-17 for Gate 5 to start in parallel. |

☐ Approved &nbsp; ☐ Changes Requested

---

## Gate 5 — Security Review

| | |
|---|---|
| **Document** | `05-security-review.md` |
| **Overall decision** | Reviewer: FAIL (H01). All High and Medium code findings since fixed; not re-reviewed |
| **Critical findings** | 0 |
| **High findings** | 1 (H01 — fixed) |
| **Approved by** | |
| **Date** | |
| **Notes** | Owner decisions 2026-11-17, superseding the spec and design where they differ: staff/admin addresses get the neutral response on sign-up and reset-request (was 403); backend rate limiting added now; minimum password length 12 (was 8). Still open: M03 (manual test E-06), and re-review of the fixes. |

☐ Approved &nbsp; ☐ Changes Requested

---

## Gate 6 — Deployment & Documentation

| | |
|---|---|
| **Document** | `06-release-note.md` |
| **Deployed to** | Railway |
| **Deployment date** | |
| **User Guide updated** | Yes / No / N/A |
| **Approved by** | |
| **Date** | |

☐ Released

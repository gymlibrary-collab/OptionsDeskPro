# Approvals Log — Multi-Tenanted SaaS Conversion

> Authorisation context: the product owner (leonardsim.sm@gmail.com) pre-authorised
> the full gate sequence on 12 Jun 2026 17:19 UTC ("go ahead to develop this app as a
> business platform as you deem fit based on the requirement above. i will check in the
> morning") including merge-to-main auto-deploy. Decisions below were made by the
> orchestrator on the product owner's behalf under that authorisation and are subject
> to morning review.

## Gate 1 — BA Spec

**Status:** APPROVED (pre-authorised) — 12 Jun 2026

### Open question resolutions

| OQ | Decision | Rationale |
|----|----------|-----------|
| OQ-1 | Free tier is **card-free** at signup | BA recommendation; maximises top-of-funnel, card collected at first upgrade |
| OQ-2 | Keep current free limits (5 watchlist symbols, 10 scans/month) | Limits become editable in the admin pricing manager, so they can be tuned without code changes |
| OQ-3 | Support staff get **full read-only** subscriber dashboard access, with every impersonation session audit-logged (who, whom, when, duration) | Most useful for support; audit log mitigates PII concern; no write/trade actions ever |
| OQ-4 | **Retain the existing four tiers** (free/starter/pro/enterprise). The L1/L2/L3 + add-ons model from `multi-tenanted-saas.md` is deferred | Least disruptive — entire codebase and tier_limits.py already use these tiers; add-ons double Stripe complexity for no launch value |
| OQ-5 | Phone verification **deferred** to post-launch | BA recommendation; avoids Twilio dependency at launch |
| OQ-6 | Enterprise is **sales-led / admin-provisioned**; pricing page shows "Contact us", no Stripe checkout for it | Avoids self-serve edge cases for a tier that implies custom terms |
| OQ-7 | Domain is **not yet chosen** — all subdomain/CORS logic must be driven by env config (`PLATFORM_DOMAIN`), with Railway-provided URLs working in the interim | Flagged for product owner: choose and purchase a domain, then set one env var |
| OQ-8 | **Same Supabase project**, separate `platform_staff` table with its own role column; hard separation enforced in every admin route | BA recommendation; avoids second-project operational overhead |
| OQ-9 | On cancellation, paper-trading data is **retained indefinitely** (account downgrades to free tier). Purge happens only on account deletion | Maximises win-back; storage cost negligible |

### Additional decision

- The existing **whitelist** becomes an optional "invite-only mode" platform setting
  (default **off** once self-signup ships) rather than being deleted outright — keeps
  the closed-beta option reversible.

## Gate 2 — Architecture

**Status:** APPROVED (pre-authorised) — 12 Jun 2026

- Design: 02-design.md; ADRs 0003–0006 in docs/adr/
- Notable: Stripe Checkout + Customer Portal (hosted redirects, minimal PCI scope);
  two Railway frontend services differentiated by VITE_PORTAL_MODE; DB-backed plans
  catalog with 60 s cache and hardcoded fallback; price changes grandfather existing
  subscribers; migration 006_saas_conversion.sql is additive-only.

## Gate 3 — Implementation

**Status:** APPROVED (pre-authorised) — 12 Jun 2026

- Backend commit 8fc7812: migration 006, Stripe service, billing/platform/public routes,
  entitlements, staff auth (owner/support/finance), audit logging, metrics counter.
  Import sanity check passed with only SUPABASE_URL/SUPABASE_SERVICE_KEY set.
- Frontend commit 8c46c0d: portal mode switch (VITE_PORTAL_MODE), email/password auth,
  onboarding, pricing/settings/FAQ pages, entitlement gating, full admin portal
  (revenue, health, subscribers, pricing manager, FAQ editor, staff manager).
  `npm run build` passes (tsc strict).
- Orchestrator fix: AuthContext admin email regression corrected back to
  leonardsim.sm@gmail.com.

## Gate 4 — Test

**Status:** APPROVED (pre-authorised) — 12 Jun 2026

- Automated: 140/140 Playwright tests pass (commit a7156a1); 7 new spec files,
  8 pre-existing specs repaired. Report: 04-test-report.md.
- Manual/exploratory: tester identified 15 findings (F-001..F-015) incl. 1 critical
  (support-view no-op), plus a critical billing-safety gap in account deletion.
- Remediation: backend commit c16d022 (8 fixes incl. deletion abort-on-Stripe-failure,
  webhook idempotency INSERT-first, maintenance_mode enforcement, migration 007
  onboarding backfill); frontend commit 6086773 (9 fixes incl. inline support view,
  downgrade UI, role-gated admin nav + platform settings panel, typed CANCEL/DOWNGRADE
  confirmations, safe markdown FAQ renderer, /settings deep-link handling).
- Post-remediation: tsc + vite build clean, 140/140 tests still pass.
- Deferred (accepted): F-007 (low-probability webhook/db race on pending downgrade),
  Stripe-hosted flows untestable in mocked E2E (need live test-mode verification —
  see pre-launch checklist in 06-release-note.md).

## Gate 5 — Security

**Status:** PASS — 12 Jun 2026

All 7 findings from the initial FAIL closed by commits c16d022 (backend) + df545fc (frontend):
- CRITICAL-001: admin email mismatch fixed across all migrations, CLAUDE.md
- CRITICAL-002: per-request deactivation check in verify_token(), cache invalidated immediately on staff action
- HIGH-001: webhook secret guard — raises 500 loudly when unset
- HIGH-002: PostgREST search injection sanitised with whitelist regex
- HIGH-003: python-jose removed from requirements.txt
- MEDIUM-001: migration 008_rls_hardening.sql — RLS enabled on all 8 new tables
- MEDIUM-002: CSV export uses authenticated blob fetch, not window.open
Accepted operational note: deactivation cache is in-process (60 s TTL); acceptable for
single-worker Railway; must move to shared cache before horizontal scaling.

## Gate 6 — Release

**Status:** APPROVED (pre-authorised) — 12 Jun 2026

- 06-release-note.md: full migration order (006→007→008), env var matrix, Stripe setup
  steps, rollback procedure, known limitations accepted for launch.
- UserGuide.tsx updated with self-signup, settings, tier-gating, FAQ, and role-aware
  admin portal sections (owner/support/finance). Fixed TS prop destructuring bug.
- Ops runbook: docs/ops/2026-06-12-saas-launch-runbook.md
- Nightly CI: .github/workflows/e2e-nightly.yml updated — parallel client + admin portal jobs.
- All gates complete. Merging to main.

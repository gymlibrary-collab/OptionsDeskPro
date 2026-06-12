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

**Status:** pending

## Gate 3 — Implementation

**Status:** pending

## Gate 4 — Test

**Status:** pending

## Gate 5 — Security

**Status:** pending

## Gate 6 — Release

**Status:** pending

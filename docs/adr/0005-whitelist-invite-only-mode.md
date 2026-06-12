# ADR 0005 — Whitelist retirement: invite-only mode platform setting

**Date:** 12 Jun 2026
**Status:** Accepted
**Feature:** Multi-Tenanted SaaS Conversion

---

## Context

The current `user_whitelist` table and the whitelist check in `POST /api/auth/login`
gate access to the entire application. FR-1 removes this gate for the client portal.
Two approaches were considered:

1. **Hard-delete the whitelist**: drop the table, remove the check from the login
   route entirely. Cleanest migration; no dead code.

2. **Convert to an optional invite-only mode**: keep the table but add a
   `platform_settings` table with an `invite_only_mode` boolean flag (default `false`
   once the migration runs). The login route checks the flag; if `true`, it falls
   back to the whitelist check; if `false`, it allows any email through.

The Gate 1 approval log records the following binding decision:
> "The existing whitelist becomes an optional 'invite-only mode' platform setting
> (default off once self-signup ships) rather than being deleted outright — keeps
> the closed-beta option reversible."

---

## Decision

Implement **option 2: invite-only mode platform setting**.

The `user_whitelist` table is retained. A `platform_settings` table is created
with an `invite_only_mode` boolean, defaulting to `false`. The login route reads
this setting at request time (cached 60 s, same pattern as plans cache). When
`invite_only_mode = false`, the whitelist check is bypassed entirely and any
authenticated Supabase user can log in.

---

## Rationale

The Gate 1 decision is binding. The architectural implication is that this is not a
code deletion but a code path addition, and the `user_whitelist` table must not be
dropped in migration 006.

The invite-only mode is operationally useful: if the platform owner wants to
temporarily close self-signup (e.g., capacity constraint, abuse response), they can
flip the flag in the admin portal without a code deployment.

Reading the flag on every login is acceptable because login is not a high-frequency
operation. Caching it for 60 s prevents a DB hit per login while ensuring flag
changes propagate promptly.

---

## Consequences

- `platform_settings` table is created in migration 006 with a single seed row
  (`invite_only_mode = false`).
- `POST /api/auth/login` gains a conditional: if `invite_only_mode` is `true`, the
  existing whitelist check runs as before. If `false`, the check is skipped and any
  authenticated email proceeds.
- `user_whitelist` table is retained unchanged.
- The admin portal exposes a toggle in the Platform Settings panel (Owner only) that
  calls `PATCH /api/platform/settings` to flip `invite_only_mode`.
- The existing `AdminPanel.tsx` whitelist UI is not moved to the new admin portal in
  the MVP — the platform admin portal is the operational home for staff, and the
  whitelist is a legacy concept. Owners can manage the whitelist directly in the
  Supabase dashboard if invite-only mode is re-enabled. A dedicated UI for whitelist
  management in the admin portal is deferred to iteration 2.

---

## Rejected alternatives

**Option 1 (hard delete)**: Contradicts the binding Gate 1 decision. Also removes
the ability to re-enable closed beta without code changes.

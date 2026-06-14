# Release Note — Legal Terms Acknowledgment Gate

**Release date:** 14Jun2026
**Version / PR:** Branch: `claude/modest-davinci-sxz7lv`
**Author:** Technical Writer + DevOps Engineer

---

## What changed

- **Legal document management system**: Admins can now publish versioned Terms of Service documents from the Admin Panel > Legal tab, with immediate activation.
- **Acknowledgment gate on protected routes**: Subscribers must read and accept the current Terms of Service before accessing trading features (Strategy Scanner, Deep Analysis, Positions, Orders, Watchlist, Trading Desk, Risk Monitor). The gate appears as a full-screen modal after login when acknowledgment is pending.
- **Legal acknowledgment check**: Subscribers cannot place trades or access protected features until they scroll through the entire ToS, check the acknowledgment box, and submit.
- **Admin bypass**: Admin users (including email `leonardsim.sm@gmail.com`) see the legal gate with an admin badge and can skip it to access the platform immediately.
- **Immutable audit trail**: All legal versions and user acknowledgments are immutable in the database — versions cannot be edited or deleted after publication, and acknowledgments cannot be modified or deleted after recording.

---

## Why it changed

Regulatory and risk management: the platform now enforces explicit subscriber acknowledgment of the Risk Disclosure & Indemnification Agreement and other critical terms before allowing trading activity, creating a verifiable audit trail and protecting the company from liability claims from users who claim they did not read the terms.

---

## Who it affects

| Tier | Available | Notes |
|------|-----------|-------|
| free | Yes | Free subscribers must acknowledge before accessing the platform. |
| starter | Yes | Starter subscribers must acknowledge before accessing protected features. |
| pro | Yes | Pro subscribers must acknowledge before accessing protected features. |
| enterprise | Yes | Enterprise subscribers must acknowledge before accessing protected features. |

All tiers are gated. Admin accounts bypass the gate entirely.

---

## Action required by users

**Subscribers**: On your next login, you will see the legal acknowledgment gate. Read the full Terms of Service, scroll to the bottom, check the "I have read and agree" box, and click "I Agree & Continue" to proceed. Once acknowledged, the gate will not re-appear unless the terms are updated.

**Admin users**: No action required. The gate is automatically bypassed for admins.

---

## Known limitations

- **Version changes mid-flow**: If an admin publishes a new legal version while a subscriber is reading the acknowledgment form, the subscriber receives a HTTP 409 error and is prompted to reload and re-read the updated terms. The modal will re-fetch the new version automatically.
- **Database errors are fail-open**: If the legal-acknowledgment database becomes temporarily unavailable, the gate does not block subscribers (logged at ERROR level). However, a user should not be able to enter the platform without some acknowledgment on file in the long term; monitor logs if DB issues are suspected.
- **No re-acknowledgment for minor updates**: Material changes to the ToS require a new version number and re-acknowledgment. The current implementation does not provide a mechanism to require re-acknowledgment for non-material corrections (e.g., typo fixes); such changes should be published as version 1.0 with an identical document version number if re-acknowledgment is not desired.

---

## Deployment steps

1. Apply migration `backend/migrations/012_legal_acknowledgments.sql` in Supabase SQL editor.
   - Creates `legal_document_versions` and `legal_acknowledgments` tables.
   - Installs immutability triggers and RLS policies.
   - Seeds version 1.0 of the Risk Disclosure & Indemnification Agreement.
   - Registers `publish_legal_version()` SECURITY DEFINER RPC.

2. Apply migration `backend/migrations/013_legal_function_search_path.sql` in Supabase SQL editor.
   - Hardens the `publish_legal_version()` function against search-path injection attacks.
   - Security requirement from Gate 5 review.

3. Deploy backend service on Railway.
   - No new environment variables required.
   - Backend now includes `/api/legal/current-version` (GET, public) and `/api/legal/acknowledge` (POST, authenticated).
   - All business-logic routes are gated with the `legal_gate_dep` dependency: `/api/orders`, `/api/positions`, `/api/trades/*`, `/api/watchlist`, `/api/strategies/scan`, `/api/trading/*`.

4. Deploy frontend service on Railway.
   - New `LegalAcknowledgmentGate.tsx` component displays the blocking modal.
   - New `LegalVersionManager.tsx` admin component in Admin Panel > Legal tab.
   - `AuthContext.tsx` extended with `pendingLegalAcknowledgment` flag set by login response.
   - App.tsx gates all tab rendering until legal acknowledgment is confirmed.

5. Verify with smoke test:
   - **New subscriber login**: Sign up or log in with a fresh account. Confirm the legal gate appears after login and blocks access to all tabs.
   - **Admin login**: Log in as admin. Confirm the gate shows with an admin badge and can be skipped.
   - **Acknowledgment flow**: Scroll the ToS to the bottom, check the box, and click "I Agree & Continue". Confirm the gate dismisses and all tabs become accessible.
   - **Admin publishing**: From Admin Panel > Legal tab, publish a new legal version. Confirm existing subscribers are prompted to acknowledge the new version on next page interaction.

---

## Rollback procedure

1. Revert to previous Railway deployments (backend and frontend). Note the previous deploy IDs from Railway's deployment history.

2. Reverse both migrations in Supabase SQL editor (in order):
   ```sql
   -- Reverse migration 013 (search_path hardening)
   ALTER FUNCTION public.publish_legal_version(
       text, text, text, text, date, uuid
   ) RESET search_path;

   -- Reverse migration 012 (drop tables and functions)
   DROP FUNCTION IF EXISTS public.publish_legal_version(
       text, text, text, text, date, uuid
   );
   DROP TRIGGER IF EXISTS trg_legal_acknowledgments_immutable ON legal_acknowledgments;
   DROP FUNCTION IF EXISTS public.trg_legal_acknowledgments_immutable();
   DROP TRIGGER IF EXISTS trg_legal_document_versions_immutable ON legal_document_versions;
   DROP FUNCTION IF EXISTS public.trg_legal_document_versions_immutable();
   DROP TABLE IF EXISTS legal_acknowledgments;
   DROP TABLE IF EXISTS legal_document_versions;
   ```

3. Verify rollback:
   - Fresh subscriber login: Confirm the legal gate no longer appears and all tabs are immediately accessible.
   - Admin Panel: Confirm the Legal tab is no longer present.

---

## Post-deployment monitoring

- **Error rate on /api/legal/***:
  - Watch for 404s on `/api/legal/current-version` (indicates no active version has been published).
  - Watch for 451s on other routes (HTTP 451 = "Unavailable For Legal Reasons"; indicates legal gate is blocking a subscriber).
  - Watch for 500s (indicates DB errors).

- **Database integrity**:
  - Monitor `legal_document_versions` for unexpected rows.
  - Monitor `legal_acknowledgments` for high insert rates (should match login rates for new subscribers).
  - Confirm immutability triggers are firing: attempt to UPDATE a legal_document_versions row and verify the database rejects it.

- **Admin publishing**:
  - Monitor that only expected versions appear in `legal_document_versions` with `is_active = true`.
  - Confirm the unique partial index on `is_active` prevents multiple active versions.

- **Fail-open logging**:
  - Monitor application logs for `legal_service: require_legal_acknowledgment DB error` at ERROR level.
  - If errors spike, the legal-DB path is experiencing issues and the gate will allow subscribers through (verify this is acceptable per risk policy).

---

## Deployment & Ops

_Added by DevOps Engineer — Gate 6._

### Deployment order

Execute these steps in order. Do not deploy the frontend before the backend, and do not deploy the backend before both migrations are confirmed applied.

1. **Apply Supabase migration 012** (`backend/migrations/012_legal_acknowledgments.sql`) in the Supabase SQL Editor.
   Creates `legal_document_versions`, `legal_acknowledgments`, immutability triggers, RLS policies, indexes, and the `publish_legal_version()` SECURITY DEFINER RPC function. Verify by running `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('legal_document_versions', 'legal_acknowledgments')` — both rows must appear before proceeding.

2. **Apply Supabase migration 013** (`backend/migrations/013_legal_function_search_path.sql`) in the Supabase SQL Editor.
   Hardens `publish_legal_version()` by adding `SET search_path = public`. Must be applied after 012 because it references the function created in 012. Verify by running `SELECT proconfig FROM pg_proc WHERE proname = 'publish_legal_version'` — the result must contain `search_path=public`.

3. **Deploy backend** (Railway auto-deploys from `main` after merge). New routes `/api/legal/*` and `/api/platform/legal/*` become live. Confirm the health endpoint returns 200: `GET https://<backend-url>/api/health`.

4. **Deploy frontend** (Railway builds from `dist/` after merge). The legal acknowledgment gate and onboarding step become active for subscribers. Deploy only after the backend is confirmed healthy and at least one active legal version exists (see pre-deployment checklist below).

### Pre-deployment checklist

- [ ] Migration 012 applied — both `legal_document_versions` and `legal_acknowledgments` exist in `information_schema.tables`.
- [ ] Migration 013 applied — `SELECT proconfig FROM pg_proc WHERE proname = 'publish_legal_version'` contains `search_path=public`.
- [ ] At least one active legal version exists before the frontend is deployed. Check: `SELECT version_number, is_active FROM legal_document_versions WHERE is_active = true`. If no row is returned, sign in to the admin portal as the Owner and publish v1.0 before deploying the frontend. Without an active version the modal shows an error state for any subscriber flagged as pending.
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set on the backend Railway service.
- [ ] The published legal document text contains no placeholder values (`[COMPANY NAME]`, `[STATE]`, `[TBD]`, `Lorem ipsum`, or equivalent).
- [ ] E2E nightly workflow run manually via `workflow_dispatch` against the feature branch — all jobs pass. The new `frontend/e2e/pages/legal-acknowledgment.spec.ts` is automatically included in both client and admin portal Playwright jobs; no workflow file changes are required.

### Post-deployment verification

- **Admin logs in** → Legal tab visible in Admin Panel → can view version history, pending count, and (as Owner) publish a new version.
- **Subscriber logs in** → if `pending_legal_acknowledgment: true` in login response → full-screen blocking modal appears → subscriber can scroll, check checkbox, and acknowledge → dashboard becomes accessible.
- **After acknowledgment** → full app access restored; no modal on subsequent logins until a new version is published.
- **API call without acknowledgment** → authenticated subscriber with no current acknowledgment record calling a gated route (e.g. `GET /api/strategies/scan`) → HTTP 451 returned.
- **Admin user** → `leonardsim.sm@gmail.com` login response shows `pending_legal_acknowledgment: false` → no gate, no modal, full dashboard access immediately.

### Rollback procedure

**Code rollback (primary path):**

1. In the Railway dashboard, navigate to the backend service Deployments tab. Select the most recent successful pre-feature deployment and click Redeploy. Railway instant rollback takes effect within approximately 30 seconds.
2. Repeat for the frontend service.
3. No migration rollback is needed. Migrations 012 and 013 are fully additive — no existing columns are dropped, no existing tables are modified, and no existing data is deleted. The new tables and RPC function remain in the database; they are inert when the rolled-back backend does not reference them.

**Emergency gate disable (without code rollback):**

If the modal causes widespread subscriber access issues and a code rollback is not immediately feasible, apply the following to Supabase SQL Editor using the service role:

```sql
-- Deactivate all legal versions.
-- With no active version, pending_legal_acknowledgment returns false for all
-- subscribers and the gate is not shown (fail-open behaviour per design).
UPDATE legal_document_versions SET is_active = false WHERE is_active = true;
```

This takes effect on the next login for each subscriber (the in-process cache TTL is 60 seconds). Re-enable the gate by publishing a new active version from the admin portal once the underlying bug is resolved.

**Do not** run `DROP TABLE legal_document_versions` or `DROP TABLE legal_acknowledgments` as part of a rollback. These tables contain the audit trail and dropping them destroys compliance records.

### Monitoring

Watch the Railway log stream for the backend service immediately after the frontend deploy goes live.

- **HTTP 451 spike** — expected in the first one to two hours post-deploy as existing subscribers log in and are shown the gate. The count should taper toward zero as subscribers complete acknowledgment. A sustained 451 rate after several hours indicates subscribers are not completing the flow — investigate the gate UI.
- **HTTP 409 on `/api/legal/acknowledge`** — indicates a version was published while a subscriber was reading the gate (race condition). Should be very rare in practice. A sustained stream of 409s would indicate a bug in the cache invalidation path following a publish.
- **HTTP 500 on `/api/legal/acknowledge`** — means the acknowledgment write to Supabase failed. Subscribers cannot proceed past the gate. Investigate Supabase connectivity immediately if 5xx counts are elevated.
- **`legal_acknowledgments` row count** — should grow monotonically as subscribers log in and acknowledge. Query: `SELECT COUNT(*) FROM legal_acknowledgments`. A flat count after the first hour of normal login traffic suggests the gate may not be recording acknowledgments correctly.
- **Fail-open log entries** — the backend logs at `ERROR` level when `get_pending_legal_acknowledgment` fails open due to a DB error. A spike in these log lines means the gate is silently disabled for affected users. Treat as an incident requiring immediate investigation.

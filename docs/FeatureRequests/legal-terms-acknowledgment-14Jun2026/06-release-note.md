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

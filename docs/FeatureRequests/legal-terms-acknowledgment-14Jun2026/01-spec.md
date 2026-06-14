# Feature Spec — Legal Terms Acknowledgment Gate

**Date:** 14Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

OptionsDesk currently allows subscribers to reach the dashboard after completing the onboarding plan-selection step without having acknowledged any legal terms. This feature introduces a mandatory Risk Disclosure & Indemnification Agreement gate that every subscriber must pass before accessing the platform. The gate appears as a step within the existing onboarding flow for new subscribers, and as a blocking re-acknowledgment modal on login for existing subscribers whenever the platform Owner publishes a new document version. Each acknowledgment is recorded immutably in a new `legal_acknowledgments` table and is surfaced as a per-subscriber history in the admin portal. The feature also adds document version management capability to the admin portal, restricted to the Owner staff role.

This feature directly protects the company from legal liability arising from subscriber trading decisions based on platform advisories, and satisfies basic due-diligence obligations before subscribers access any options strategy content.

---

## 2. User Personas

| Persona | Tier / Role | Job-to-be-done |
|---------|-------------|----------------|
| New Subscriber | free / starter / pro / enterprise (pre-onboarding) | Complete sign-up and reach the dashboard |
| Existing Subscriber | Any tier (post-onboarding) | Log in and reach the dashboard; re-acknowledge if required |
| Platform Owner | platform_staff (staff_role = 'owner') | Publish new legal document versions; view subscriber acknowledgment history |
| Platform Support Staff | platform_staff (staff_role = 'support') | View subscriber acknowledgment history for dispute resolution |
| Platform Finance Staff | platform_staff (staff_role = 'finance') | View acknowledgment history where relevant to subscription disputes |

---

## 3. Functional Requirements

### 3.1 Legal Document Version Management

1. The system shall maintain a `legal_document_versions` table containing one row per version of the Risk Disclosure & Indemnification Agreement, with fields: `id`, `version_number` (semver text, e.g. "1.0"), `display_name`, `effective_date` (date), `published_at` (timestamptz), `published_by` (FK to auth.users), `full_text` (text), `text_hash` (SHA-256 hex of `full_text`), `is_active` (boolean), `created_at`.

2. Exactly one row in `legal_document_versions` shall have `is_active = true` at any given time. This row is the "current active version." All other rows shall have `is_active = false`.

3. The system shall not permit deletion or update of any column on `legal_document_versions` rows once inserted, with the sole exception of `is_active` on the previously active row being set to `false` when a new version is published (i.e., rows are logically deactivated but never deleted and their text is never changed).

4. The platform Owner shall be able to publish a new document version from the admin portal by entering: version number, effective date, and the full agreement text. On submission, the system shall compute the SHA-256 hash of the full text, insert a new row, set it as active, and set the previously active row to `is_active = false`.

5. When a new version is published, the system shall flag all subscribers whose most recent acknowledgment is for a prior version (i.e., `legal_acknowledgments.version_number != new_version_number`) as "pending re-acknowledgment." This flag shall be a derived state, not a stored column: the backend determines pending status by comparing the subscriber's latest acknowledgment version against the current active version.

### 3.2 Acknowledgment Gate — New Subscribers (Onboarding Flow)

6. The onboarding flow (`OnboardingFlow.tsx`) shall include a new step, inserted after plan selection and before the "complete" step, that presents the current active version of the Risk Disclosure & Indemnification Agreement to the subscriber.

7. The acknowledgment step shall display the full agreement text in a scrollable container. The subscriber must scroll to or past the bottom of the text before the "I Agree" checkbox becomes enabled. This requirement ensures the subscriber has been exposed to the full text.

8. The acknowledgment step shall include a mandatory checkbox with the label: "I have read and agree to the Risk Disclosure & Indemnification Agreement (Version [X.Y])." The checkbox shall be unchecked by default and shall not be pre-checked by the system.

9. An "I Agree" button shall only become enabled when the checkbox is checked. Clicking "I Agree" shall:
   (a) Call `POST /api/legal/acknowledge` with the active version number;
   (b) On success, advance the onboarding flow to the "complete" step;
   (c) On failure, display an error message and keep the subscriber on the acknowledgment step.

10. The subscriber shall have no mechanism to skip or bypass the acknowledgment step within the onboarding flow. There shall be no "Skip," "Later," or "Close" action on this step.

11. The system shall persist the onboarding step as "legal_acknowledgment" in `user_profiles.onboarding_step` when the subscriber reaches this step, so that a page refresh or session interruption returns them to the acknowledgment step rather than re-starting onboarding.

### 3.3 Acknowledgment Gate — Existing Subscribers (Re-Acknowledgment Modal)

12. On every login, the backend `POST /api/auth/login` response shall include a boolean field `pending_legal_acknowledgment` (true if the subscriber's most recent acknowledgment version does not match the current active document version, or if the subscriber has no acknowledgment record).

13. When `pending_legal_acknowledgment` is true, the frontend shall display a full-screen blocking modal immediately after the auth flow completes, before rendering any dashboard content. The modal shall present the current active agreement text in a scrollable container with the same scroll-and-checkbox interaction as the onboarding gate (FR 7–10).

14. The re-acknowledgment modal shall not have a dismiss button, close button, or any other mechanism to bypass it. The subscriber shall not be able to access any dashboard tab, the scanner, or any other platform feature until they have acknowledged the current active version.

15. On successful re-acknowledgment, the modal shall dismiss and the subscriber shall be shown the dashboard.

### 3.4 Acknowledgment Record

16. The system shall maintain a `legal_acknowledgments` table with the following fields: `id` (uuid PK), `user_id` (FK to auth.users), `version_number` (text), `document_text_hash` (text, SHA-256 hex), `acknowledged_at` (timestamptz, default now(), UTC), `ip_address` (text, nullable), `user_agent` (text, nullable), `created_at` (timestamptz, default now()).

17. The `POST /api/legal/acknowledge` endpoint shall:
   (a) Verify the subscriber's JWT;
   (b) Verify that the submitted `version_number` matches the current active version (reject with HTTP 409 if it does not, to prevent acknowledgment of a superseded version in a race condition);
   (c) Insert one row into `legal_acknowledgments` capturing: `user_id`, `version_number`, `document_text_hash` (from the `legal_document_versions` row), `acknowledged_at` (server-side UTC now()), `ip_address` (from the `x-forwarded-for` header or request client host), `user_agent` (from the `User-Agent` request header);
   (d) Return `{"ok": true, "version_number": "..."}`.

18. The `legal_acknowledgments` table shall be append-only. The backend shall not expose any DELETE or UPDATE endpoint for this table. Database-level RLS shall permit INSERT (service role) and SELECT (service role) only; no UPDATE or DELETE policy shall be defined.

19. If a subscriber acknowledges the same version more than once (e.g., due to a retry after a network error), the system shall accept the duplicate insert (both records are retained — they do not constitute an error and serve as additional evidence).

### 3.5 Admin Portal — Acknowledgment History

20. The admin portal shall include a "Legal" section accessible to staff with `staff_role` of 'owner', 'support', or 'finance'.

21. Within the Legal section, the Owner shall be able to view a list of all published document versions, their version numbers, effective dates, publish dates, and status (active / superseded).

22. Staff with 'owner', 'support', or 'finance' roles shall be able to view any individual subscriber's full acknowledgment history: a chronological list of all versions acknowledged, with `acknowledged_at` timestamp (UTC), `ip_address`, and `user_agent` for each record.

23. The admin portal shall expose a "Publish New Version" action visible only to the Owner. This action shall open a form with fields for version number, effective date, and full agreement text. A preview of the computed SHA-256 text hash shall be displayed before the Owner submits.

24. Publishing a new version shall be logged to the existing `platform_audit_log` table with `action_type = 'legal_version_publish'` and `payload` containing the new version number, effective date, and text hash.

25. The admin portal shall display a count of subscribers currently in "pending re-acknowledgment" state (i.e., whose latest acknowledgment version is not the current active version) as a dashboard metric on the Legal section landing page.

### 3.6 Security and Data Integrity

26. The `MARKETDATA_API_TOKEN`, `SUPABASE_SERVICE_KEY`, and all other backend-only secrets shall not be exposed to the frontend in connection with this feature.

27. The acknowledgment endpoint (`POST /api/legal/acknowledge`) shall require a valid subscriber JWT. It shall reject requests without a valid token with HTTP 401.

28. The current active document version (`GET /api/legal/current-version`) shall be accessible to any authenticated subscriber (JWT required). It shall not be publicly accessible without authentication.

29. All writes to `legal_acknowledgments` and `legal_document_versions` shall use the Supabase service role key on the backend, consistent with the existing pattern for all backend DB writes.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — New Subscriber Acknowledges Terms During Onboarding

**As a** new subscriber completing the onboarding flow, **I want** to read and acknowledge the Risk Disclosure & Indemnification Agreement before I access the dashboard **so that** I understand the legal terms governing my use of the platform.

**Acceptance Criteria:**
- [ ] AC1.1: After selecting a plan in the onboarding flow, the next screen presented is the legal acknowledgment step, not the "You are all set!" completion screen.
- [ ] AC1.2: The full agreement text is visible in a scrollable container on the acknowledgment step.
- [ ] AC1.3: The "I Agree" checkbox is disabled (greyed out) when the page loads; it becomes enabled only after the subscriber has scrolled to the bottom of the agreement text.
- [ ] AC1.4: The "I Agree" button remains disabled (not clickable) while the checkbox is unchecked.
- [ ] AC1.5: Checking the checkbox and clicking "I Agree" successfully calls the acknowledge endpoint; the subscriber advances to the "You are all set!" step.
- [ ] AC1.6: After acknowledging, the subscriber can reach the dashboard by clicking "Go to dashboard."
- [ ] AC1.7: There is no "Skip," "Later," "Close," or equivalent button on the acknowledgment step.
- [ ] AC1.8: If the subscriber refreshes the page before acknowledging, they are returned to the legal acknowledgment step (not sent back to plan selection).

### Story 2 — New Subscriber Cannot Bypass the Acknowledgment Gate

**As a** platform operator, **I want** the acknowledgment step to be unbypassable by the subscriber **so that** every subscriber has a recorded acknowledgment before accessing any platform feature.

**Acceptance Criteria:**
- [ ] AC2.1: Navigating directly to `/` or any tab URL in the browser address bar while in the onboarding flow with `onboarding_step = 'legal_acknowledgment'` and no acknowledgment record does not grant access to the dashboard — the acknowledgment step is shown instead.
- [ ] AC2.2: A subscriber with `onboarding_completed = false` and no acknowledgment record cannot successfully call `GET /api/strategies/analyze/{symbol}`, `GET /api/strategies/scan`, or any protected endpoint without the backend validating their acknowledgment status. (Note: enforcement at the backend gate is defined in the architecture phase; this AC validates that the frontend does not render the dashboard until acknowledgment is complete.)
- [ ] AC2.3: The "I Agree" button does not become enabled by programmatic manipulation of the DOM when the checkbox is unchecked (the button is disabled via the disabled HTML attribute, not only via CSS opacity).

### Story 3 — Existing Subscriber is Gated on Re-Acknowledgment After a New Version is Published

**As an** existing subscriber who last agreed to version 1.0, **I want** to be informed of the updated agreement and required to re-acknowledge it **so that** my continued use of the platform reflects my consent to the current terms.

**Acceptance Criteria:**
- [ ] AC3.1: After the Owner publishes version 1.1, an existing subscriber who acknowledged only version 1.0 sees a full-screen blocking modal on their next login before any dashboard content is shown.
- [ ] AC3.2: The blocking modal displays the full text of version 1.1 with the version number clearly labeled.
- [ ] AC3.3: The blocking modal has no dismiss button, close button, keyboard-escape handler, or background-click-to-close behaviour.
- [ ] AC3.4: The subscriber can scroll through the full agreement text within the modal.
- [ ] AC3.5: The "I Agree" checkbox in the modal is disabled until the subscriber has scrolled to the bottom of the text within the modal.
- [ ] AC3.6: After checking the checkbox and clicking "I Agree," the modal closes and the subscriber reaches the dashboard.
- [ ] AC3.7: The subscriber who has not yet re-acknowledged cannot access the Scanner, Positions, Chain, or any other tab — these are hidden or inaccessible behind the modal overlay.

### Story 4 — Acknowledgment Record is Created and Immutable

**As a** platform operator, **I want** each subscriber's acknowledgment to be recorded immutably with a timestamp, IP address, and document hash **so that** the record is usable as evidence in a legal dispute.

**Acceptance Criteria:**
- [ ] AC4.1: After a subscriber acknowledges the agreement, a row exists in the `legal_acknowledgments` table containing: `user_id` matching the subscriber, `version_number` matching the version they acknowledged, a non-null `document_text_hash`, a non-null `acknowledged_at` timestamp in UTC.
- [ ] AC4.2: The `ip_address` column in the acknowledgment row is populated with the subscriber's IP address (or the first value from `x-forwarded-for` if behind a proxy).
- [ ] AC4.3: No `DELETE /api/legal/acknowledgments` endpoint exists. Attempting to delete an acknowledgment row via the Supabase REST API without a service role key returns an RLS-denied error.
- [ ] AC4.4: No `UPDATE /api/legal/acknowledgments` endpoint exists. Attempting to update any column of an acknowledgment row via the Supabase REST API without a service role key returns an RLS-denied error.
- [ ] AC4.5: The `document_text_hash` stored in the acknowledgment matches the SHA-256 hash of the `full_text` in the corresponding `legal_document_versions` row, verifiable by manually computing the hash of the document text and comparing.

### Story 5 — Owner Publishes a New Document Version

**As a** platform Owner, **I want** to publish a new version of the Risk Disclosure & Indemnification Agreement from the admin portal **so that** all existing subscribers are required to re-acknowledge the updated terms.

**Acceptance Criteria:**
- [ ] AC5.1: The admin portal Legal section is visible in the navigation only to authenticated staff (staff_role = 'owner', 'support', or 'finance').
- [ ] AC5.2: The "Publish New Version" button or form is visible only to staff with `staff_role = 'owner'`; support and finance staff do not see it.
- [ ] AC5.3: Submitting the "Publish New Version" form with a valid version number, effective date, and full text results in a new row in `legal_document_versions` with `is_active = true`.
- [ ] AC5.4: After publishing, the previously active version row has `is_active = false`.
- [ ] AC5.5: After publishing, a subscriber with a prior-version acknowledgment sees `pending_legal_acknowledgment: true` in the `POST /api/auth/login` response on their next login.
- [ ] AC5.6: A new publish action creates a row in `platform_audit_log` with `action_type = 'legal_version_publish'` and a non-null `payload` containing the new version number and text hash.
- [ ] AC5.7: The "Publish New Version" form displays the computed SHA-256 hash of the entered text before the Owner submits, allowing them to record it independently.

### Story 6 — Admin Views Subscriber Acknowledgment History

**As a** platform staff member (Owner, Support, or Finance), **I want** to view a subscriber's complete acknowledgment history **so that** I can confirm their consent to each version of the agreement and provide evidence in a dispute.

**Acceptance Criteria:**
- [ ] AC6.1: The admin portal Legal section includes a subscriber search or subscriber list that allows staff to select a subscriber and view their acknowledgment history.
- [ ] AC6.2: The acknowledgment history for a subscriber shows all rows from `legal_acknowledgments` for that user, in chronological order, with: version number, `acknowledged_at` timestamp (UTC), IP address, and user agent.
- [ ] AC6.3: The history view correctly shows multiple acknowledgment rows if a subscriber has acknowledged more than one version or acknowledged the same version more than once.
- [ ] AC6.4: A subscriber who has never acknowledged any version shows an empty acknowledgment history (not an error).
- [ ] AC6.5: The "Pending Acknowledgment" metric on the Legal section landing page shows a count of subscribers whose latest acknowledgment version is not the current active version. After the Owner publishes a new version, this count increases by the number of subscribers who had previously acknowledged any prior version.

### Story 7 — Admin Cannot Bypass Subscriber's Acknowledgment Requirement

**As a** platform operator, **I want** to ensure that platform staff cannot acknowledge terms on behalf of a subscriber or suppress the gate for specific subscribers **so that** every consent record is genuine.

**Acceptance Criteria:**
- [ ] AC7.1: The `POST /api/legal/acknowledge` endpoint does not accept a `user_id` body parameter that differs from the authenticated subscriber's JWT user ID. Any such submission is either ignored (the authenticated user's ID is always used) or rejected with HTTP 400.
- [ ] AC7.2: There is no admin endpoint that sets `pending_legal_acknowledgment` to false or inserts an acknowledgment record on behalf of a subscriber.
- [ ] AC7.3: The admin portal does not expose a "Mark as Acknowledged" or equivalent override action for a subscriber.

---

## 5. Out of Scope

- Email notifications to subscribers when a new version is published (notifications are not in scope for this release; the gate on next login is the sole enforcement mechanism).
- PDF generation or download of the agreement for subscribers.
- Electronic signature integration with DocuSign or any similar provider.
- Multi-language versions of the agreement (only English is required for v1).
- Subscriber-initiated account deletion triggered by disagreement with new terms (this is handled by the existing `DELETE /api/auth/account` endpoint).
- Any change to the subscription billing or cancellation flow in connection with acknowledgment.
- Storage of the full agreement text in the acknowledgment record itself (the `document_text_hash` plus a foreign key to `legal_document_versions` is sufficient; the full text is in the document version table).
- Automated legal review or parsing of agreement text entered by the Owner.
- Integration with any external compliance or legal document management system.
- A public-facing (unauthenticated) URL for the current agreement (out of scope for v1; the document is presented only within the authenticated gate).
- Subscriber opt-out or partial acknowledgment — acknowledgment is binary (agreed or not).
- Admin portal Finance role ability to publish new versions (Finance is read-only on legal history).

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|--------------------|
| Subscriber submits acknowledgment for a version that has just been superseded by a new publish (race condition) | Backend rejects with HTTP 409 ("Version mismatch — please reload"); frontend prompts subscriber to reload to get the current version. |
| Backend `POST /api/legal/acknowledge` returns a 5xx error | Frontend displays an inline error message ("Could not record your acknowledgment — please try again") and keeps the subscriber on the acknowledgment step. The subscriber cannot advance until the record is successfully created. |
| `GET /api/legal/current-version` returns an error or is unavailable | Frontend displays an error state ("Unable to load the legal agreement — please refresh") rather than rendering an empty agreement or allowing bypass. |
| Subscriber has no acknowledgment record at all (e.g., legacy user predating this feature) | `POST /api/auth/login` returns `pending_legal_acknowledgment: true`; the re-acknowledgment modal is shown on next login. |
| Subscriber clears local storage / cookies mid-onboarding before acknowledging | `user_profiles.onboarding_step` is 'legal_acknowledgment' in the database; on re-login the backend returns this step and the frontend resumes from the acknowledgment step. |
| Owner attempts to publish a version with a version number already in use | Backend rejects with HTTP 409 ("Version number already exists"). The version number must be unique. |
| Network timeout during acknowledgment submission | The acknowledgment may or may not have been written. Frontend must not assume success; on retry the backend accepts a second insert for the same user and version (both records are kept). |
| Subscriber is the platform admin (leonardsim.sm@gmail.com) | The admin bypasses all subscriber gates including the acknowledgment gate, consistent with the existing admin bypass pattern for whitelist and onboarding. |
| Support or Finance staff view subscriber with thousands of acknowledgment rows | The history view is paginated (page size defined in the architecture phase) and does not time out. |
| Owner publishes a new version with empty full text | Backend rejects with HTTP 422 ("Agreement text must not be empty"). |
| IP address is not determinable (e.g., request arrives without `x-forwarded-for` and no client host) | `ip_address` is stored as null; the record is still written. Null IP does not prevent acknowledgment. |

---

## 7. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|--------------|
| Supabase (Postgres) | Stores `legal_document_versions`, `legal_acknowledgments`; RLS policies; service role writes | No quota risk; additive schema only |
| Supabase Auth | JWT verification on `POST /api/legal/acknowledge`; IP extraction from request | No change to auth flow |
| FastAPI (Railway backend) | New routes: `GET /api/legal/current-version`, `POST /api/legal/acknowledge`, `GET /api/admin/legal/versions`, `POST /api/admin/legal/versions`, `GET /api/admin/legal/subscribers/{user_id}/history`, `GET /api/admin/legal/pending-count` | No third-party quota impact |
| Claude API (Anthropic) | Not involved in this feature | No impact |
| Market Data App | Not involved in this feature | No impact |
| Reddit PRAW | Not involved in this feature | No impact |

---

## 8. Subscription Tier Impact

All subscription tiers are equally gated by the acknowledgment requirement. The acknowledgment step is not a tier feature — it is a pre-access compliance gate. There is no tier that bypasses the gate, and there is no tier that sees a different version of the agreement.

| Tier | Behaviour |
|------|-----------|
| free | Must acknowledge current active version before accessing dashboard |
| starter | Must acknowledge current active version before accessing dashboard |
| pro | Must acknowledge current active version before accessing dashboard |
| enterprise | Must acknowledge current active version before accessing dashboard |

The platform admin (leonardsim.sm@gmail.com) bypasses the acknowledgment gate, consistent with the existing admin bypass pattern. Platform staff who are not also subscribers are not subject to the gate (the gate applies only to subscribers who log in via the subscriber app).

---

## 9. Data Model Sketch

The following is an informal sketch for the architect's reference. Exact DDL is the architect's responsibility.

**`legal_document_versions`**
- `id` uuid PK
- `version_number` text NOT NULL UNIQUE (e.g. "1.0", "1.1", "2.0")
- `display_name` text (e.g. "Risk Disclosure & Indemnification Agreement v1.0")
- `effective_date` date NOT NULL
- `published_at` timestamptz NOT NULL default now()
- `published_by` uuid NOT NULL FK auth.users
- `full_text` text NOT NULL
- `text_hash` text NOT NULL (SHA-256 hex of `full_text`)
- `is_active` boolean NOT NULL default false
- `created_at` timestamptz NOT NULL default now()
- No UPDATE permitted on `full_text`, `text_hash`, `version_number`, `effective_date`, `published_by`, `created_at`. Only `is_active` may change (from true to false when a new version is published).

**`legal_acknowledgments`**
- `id` uuid PK default gen_random_uuid()
- `user_id` uuid NOT NULL FK auth.users
- `version_number` text NOT NULL (denormalised from `legal_document_versions.version_number`)
- `document_text_hash` text NOT NULL (denormalised from `legal_document_versions.text_hash`)
- `acknowledged_at` timestamptz NOT NULL default now()
- `ip_address` text (nullable)
- `user_agent` text (nullable)
- `created_at` timestamptz NOT NULL default now()
- No UPDATE, no DELETE. INSERT only via service role.
- Index on `(user_id, acknowledged_at DESC)` for history queries.

**`user_profiles` changes (additive)**
- No new column required for acknowledgment state. The "pending" state is derived at login time by comparing the subscriber's latest `legal_acknowledgments.version_number` to the current active `legal_document_versions.version_number`.
- `onboarding_step` gains a new valid value: `'legal_acknowledgment'` (in addition to the existing `'plan_selection'`, `'payment'`, `'complete'`).

**`platform_audit_log` — new `action_type` value**
- `'legal_version_publish'` — payload: `{version_number, effective_date, text_hash, previous_active_version}`

---

## 10. API Contract Sketch

Again, exact contracts are the architect's responsibility. These are the minimum endpoints implied by the functional requirements.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/legal/current-version` | JWT (subscriber) | Returns version number, display name, effective date, full text of the current active version |
| POST | `/api/legal/acknowledge` | JWT (subscriber) | Records acknowledgment; body: `{version_number: string}` |
| GET | `/api/admin/legal/versions` | JWT (platform staff) | Lists all document versions (all staff roles) |
| POST | `/api/admin/legal/versions` | JWT (Owner only) | Publishes a new version; body: `{version_number, effective_date, full_text, display_name}` |
| GET | `/api/admin/legal/subscribers/{user_id}/history` | JWT (platform staff) | Returns full acknowledgment history for a subscriber |
| GET | `/api/admin/legal/pending-count` | JWT (platform staff) | Returns count of subscribers with pending re-acknowledgment |

The `POST /api/auth/login` response shall include one new field:
- `pending_legal_acknowledgment: boolean` — true if the authenticated subscriber's latest acknowledgment version does not match the current active version, or if they have no acknowledgment record. False for the platform admin.

---

## 11. Product Owner Annotations

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — New subscriber acknowledges during onboarding | | |
| Story 2 — Gate cannot be bypassed | | |
| Story 3 — Existing subscriber re-acknowledgment gate | | |
| Story 4 — Immutable acknowledgment record | | |
| Story 5 — Owner publishes new version | | |
| Story 6 — Admin views acknowledgment history | | |
| Story 7 — Admin cannot fake acknowledgment | | |

**MVP boundary:** [To be defined by product-owner agent]

**Deferred to backlog:** [To be defined by product-owner agent]

**PO gate decision:** [ ] Approved [ ] Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

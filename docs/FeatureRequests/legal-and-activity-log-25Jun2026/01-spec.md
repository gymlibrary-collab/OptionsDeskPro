# Feature Spec — Legal T&C Acknowledgment Tracking and Subscriber Activity Log

**Date:** 25Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

This spec covers two related features that together give the platform operator visibility into subscriber compliance and in-app behaviour.

**Feature A — Legal T&C Acknowledgment Tracking (admin visibility layer).** The database schema and backend service for tracking legal acknowledgments already exist (`legal_document_versions`, `legal_acknowledgments`, `legal_service.py`, migration 012). The login response already includes a `pending_legal_acknowledgment` flag, and the `legal_gate_dep` FastAPI dependency already blocks business-logic routes with HTTP 451 when a user has not acknowledged. What does not yet exist is an admin-facing view of which subscribers have and have not acknowledged the currently active version, and a T&C acknowledgment event in the activity log so admins can see exactly when each subscriber agreed.

**Feature B — Subscriber Activity Log (scope clarification and admin UX).** The `user_action_log` table (migration 015) and `activity_logger.py` service already exist. The `GET /admin/activity-log` endpoint and the `UserActionsTab` in `AdminPanel.tsx` already provide a paginated, filtered activity log. The gaps are: (1) the `ai_features_enabled` per-session event type does not exist in the `ACTION_TYPES` set; (2) the `tc_acknowledged` event type does not exist; (3) there is no one-click shortcut in the Users tab to jump to the activity log pre-filtered for a specific subscriber; (4) the retention window is currently 30 days (GitHub Actions workflow) and the confirmed requirement is also 30 days — no change required (OQ-5 resolved).

Both features serve the admin persona exclusively. No subscriber-facing UI changes are required beyond the existing T&C modal and gate that are already in scope for the pre-existing legal gate implementation.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Platform admin | admin (email bypass) | Know which subscribers have not yet accepted the current T&C version so any compliance follow-up can be targeted |
| Platform admin | admin | Trace a specific subscriber's in-app activity from a single click in the Users tab without manually typing their email into the filter |
| Platform admin | admin | Be confident that the activity log does not grow unbounded and that data older than 14 days is automatically removed |
| Subscriber (any tier) | free / starter / pro / enterprise | Be prompted to accept the T&C on first login and again when a new version is published, and not be blocked from any feature once they have accepted |

---

## 3. Functional Requirements

### Feature A — Legal T&C Acknowledgment Tracking

1. The admin Users tab must display, alongside each subscriber row, whether that subscriber has acknowledged the currently active T&C version. The indicator must show one of three states: Acknowledged (with the date), Pending (has not yet acknowledged), or N/A (admin account — exempt from the gate).

2. Clicking the subscriber's acknowledgment status indicator must open the User Actions tab pre-filtered to that subscriber's email and to the `tc_acknowledged` action type, so the admin can view the timestamped acknowledgment record directly.

3. When a subscriber successfully acknowledges the T&C (via `POST /api/legal/acknowledge`), the backend must write a `tc_acknowledged` event row to `user_action_log` with the version number and content hash stored in the `detail` JSONB field.

4. The `tc_acknowledged` action type must be added to the `ACTION_TYPES` frozenset in `activity_logger.py` and to the `CHECK` constraint on `user_action_log.action_type` in a new migration. It must also appear as a selectable option in the `UserActionsTab` action-type filter dropdown.

5. The admin Users tab must retrieve T&C acknowledgment status for all subscribers in a single backend call, not one call per subscriber row. The endpoint must join `user_profiles` against `legal_acknowledgments` for the currently active `version_id` and return an `ack_status` field per user (values: `acknowledged`, `pending`, `exempt`).

6. When no active T&C version has been published (the `legal_document_versions` table has no row with `is_active = true`), the acknowledgment status column in the Users tab must display "No version published" for all rows without error.

7. The `GET /admin/users` endpoint (or a new dedicated endpoint) must include the `tc_ack_status` and `tc_ack_at` fields for each user row so the frontend does not need a separate call.

### Feature B — Subscriber Activity Log

8. A new `ai_features_enabled` action type must be added to `ACTION_TYPES` in `activity_logger.py` and to the `user_action_log.action_type` CHECK constraint. It must be fired once per session when the user first enables the AI Features tab (i.e. when the AI tab is opened for the first time after a login). The `detail` field must record `{"tab": "ai"}`.

9. The existing `strategy_scan` action (already fired from `GET /api/strategies/scan`) must include the list of scanned symbols in its `detail` field. This is already implemented (`"symbols": symbol_list`) and requires no change. This requirement documents the current behaviour as a testable baseline.

10. The existing `options_chain_view` action (already fired from `GET /api/options/chain/{symbol}`) must include the queried symbol in its `detail` field. This is already implemented (`"symbol": symbol.upper()`) and requires no change. This requirement documents the current behaviour as a testable baseline.

11. The existing `paper_trade_placed` action (already fired from `POST /api/orders` and `POST /api/trades/record`) must include at minimum the symbol and strategy name in its `detail` field. This is already implemented and requires no change. This requirement documents the current behaviour as a testable baseline.

12. The existing `ai_query` action (already fired from the strategies analysis route — to be confirmed by the architect) must record when a deep-analysis narrative is generated. If `ai_query` is not currently fired from the analysis route, the architect must identify the correct hook point and add it.

13. The Users tab in AdminPanel must show a "View Activity" button (or a clickable activity icon) next to each subscriber row. Clicking it must switch the admin panel to the `user_actions` tab and pre-populate the email filter with that subscriber's email, then auto-execute the search. The navigation must be achievable without page reload.

14. The GitHub Actions cron workflow `purge-user-action-log.yml` retains its current 30-day deletion interval — confirmed as the correct retention window (OQ-5 resolved). No change to the SQL or schedule is required.

15. The `UserActionsTab` action-type filter dropdown must include `tc_acknowledged` and `ai_features_enabled` as selectable options once those types are added in requirements 4 and 8.

16. The `UserActionsTab` must accept an externally controlled initial filter state (email pre-fill) so that the "View Activity" shortcut from the Users tab (requirement 13) can set the filter before the tab renders. The implementation detail of how this state is threaded through `AdminPanel` is left to the architect, but the behaviour must be testable: after clicking "View Activity" for subscriber X, the email filter field must contain X's email and the results must be filtered accordingly.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Admin sees T&C acknowledgment status per subscriber

**As a** platform admin, **I want** to see at a glance which subscribers have and have not acknowledged the current T&C version **so that** I know who still needs to complete the legal gate before they can use the platform.

**Acceptance Criteria:**
- [ ] AC1: Sign in as admin and open the Users tab. Each subscriber row shows one of three status values: Acknowledged, Pending, or Exempt (for the admin account itself).
- [ ] AC2: For a subscriber who has acknowledged the current version, the status shows the date/time of acknowledgment.
- [ ] AC3: For a subscriber who has not yet acknowledged, the status shows "Pending" (no date shown).
- [ ] AC4: If no active T&C version has been published, all rows show "No version published" and no error is thrown.
- [ ] AC5: The Users tab loads all subscriber data (including acknowledgment status) in a single round trip — verifiable by checking the Network tab in browser devtools: only one `/admin/users` call fires on tab load.

---

### ~~Story 2 — Subscriber is prompted to acknowledge T&C on first login and on version update~~ *(ALREADY IMPLEMENTED — out of scope)*

> This story is fully delivered by the existing `OnboardingFlow.tsx` modal and `POST /api/legal/acknowledge` endpoint (shipped with migration 012). No further work required. Removed from the delivery scope of this feature.

---

### Story 3 — T&C acknowledgment event is recorded in the activity log

**As a** platform admin, **I want** each subscriber's T&C acknowledgment to appear as a timestamped event in the activity log **so that** I have an auditable record of when each subscriber accepted each version.

**Acceptance Criteria:**
- [ ] AC1: After a subscriber clicks "I Agree" on the T&C modal, a `tc_acknowledged` row appears in the `user_action_log` table with the correct `user_id`, `user_email`, and a `detail` field containing at minimum `{"version_number": "X.Y", "content_hash": "..."}`.
- [ ] AC2: In the `UserActionsTab`, selecting `tc_acknowledged` from the action-type filter and clicking Apply returns the row for that subscriber with the correct timestamp.
- [ ] AC3: The `tc_acknowledged` event row is immutable — no UPDATE or DELETE is performed on it after insert. This is enforced by the existing `user_action_log` RLS (service-role-only writes, no user-facing delete policy) and requires no additional migration.
- [ ] AC4: If the subscriber acknowledges the T&C but the log_action call fails (network error, DB timeout), the acknowledgment is still recorded in `legal_acknowledgments` and the user is not blocked. The activity log event is fire-and-forget (same pattern as all other action types).

---

### Story 4 — Admin views the full activity log, paginated, newest first

**As a** platform admin, **I want** to browse all subscriber activity events in a paginated table sorted newest first **so that** I can monitor what users are doing in the platform without scrolling through thousands of unfiltered rows.

**Acceptance Criteria:**
- [ ] AC1: Open the User Actions tab. Events are displayed in descending timestamp order (most recent first). The first row's timestamp is later than or equal to the second row's timestamp.
- [ ] AC2: The page size selector (or default of 50 rows per page) is visible. Navigating to page 2 shows the next 50 rows without repeating any row from page 1.
- [ ] AC3: The total count displayed (e.g. "Showing 1–50 of 312") matches the actual count returned by `GET /admin/activity-log`.
- [ ] AC4: The table shows at minimum: user email, action type, detail summary, and timestamp for each row.

---

### Story 5 — Admin filters activity log by action type

**As a** platform admin, **I want** to filter the activity log to a specific action type **so that** I can quickly see all paper trades placed, or all AI analyses generated, across all subscribers.

**Acceptance Criteria:**
- [ ] AC1: The action-type dropdown contains all currently registered types: `login`, `logout`, `ticker_search`, `strategy_scan`, `options_chain_view`, `paper_trade_placed`, `watchlist_update`, `ai_query`, `tc_acknowledged`, `ai_features_enabled`.
- [ ] AC2: Selecting `paper_trade_placed` and clicking Apply returns only rows with `action_type = 'paper_trade_placed'`. No rows of other types appear.
- [ ] AC3: Selecting `tc_acknowledged` returns acknowledgment events with `detail` showing version number. Rows from before the new action type was added (i.e. before this feature shipped) do not appear.
- [ ] AC4: Clearing the action-type filter returns to showing all action types.

---

### Story 6 — Admin clicks subscriber row to filter activity log to that subscriber

**As a** platform admin, **I want** to click a "View Activity" button on a subscriber row in the Users tab **so that** the activity log is instantly pre-filtered to that subscriber's email without me having to manually copy-paste their address.

**Acceptance Criteria:**
- [ ] AC1: In the Users tab, each subscriber row has a "View Activity" button (or equivalent clickable control).
- [ ] AC2: Clicking "View Activity" for subscriber alice@example.com switches the admin panel to the User Actions tab, populates the email filter with `alice@example.com`, and auto-executes the search. No page reload occurs.
- [ ] AC3: The resulting activity log shows only rows where `user_email` matches (case-insensitively) the subscriber's email.
- [ ] AC4: Clearing the email filter in the User Actions tab and clicking Apply returns the unfiltered log (not locked to that subscriber).
- [ ] AC5: If the subscriber has no logged events (new account, never used the platform), the filtered view shows "No results" rather than an error.

---

### Story 7 — Activity log retention is confirmed at 30 days *(no code change required)*

**As a** platform admin, **I want** the activity log to automatically delete entries older than 30 days **so that** the `user_action_log` table does not grow indefinitely.

> OQ-5 resolved: the 30-day retention already in production is the confirmed requirement. The workflow and SQL require no modification. This story is retained as a testable baseline.

**Acceptance Criteria:**
- [ ] AC1: The GitHub Actions workflow `purge-user-action-log.yml` runs on its scheduled cron (daily at 3:00 AM UTC) and deletes rows from `user_action_log` where `created_at < now() - interval '30 days'`.
- [ ] AC2: After the workflow runs, no rows with `created_at` older than 30 days remain in the table. Verifiable by running `SELECT COUNT(*) FROM public.user_action_log WHERE created_at < now() - interval '30 days'` immediately after a purge — result must be 0.
- [ ] AC3: Rows created within the past 30 days are not deleted by the purge run.
- [ ] AC4: The workflow can be manually triggered via `workflow_dispatch` for on-demand purge. Manual trigger produces the same deletion result as the scheduled run.
- [ ] AC5: The purge is idempotent — running it twice in succession (manual + scheduled overlap) produces no error and no additional deletions.

---

### Story 8 — AI Features tab open event is logged

**As a** platform admin, **I want** the activity log to record when a subscriber first opens the AI Features tab in a session **so that** I can track AI feature adoption across subscriber tiers.

**Acceptance Criteria:**
- [ ] AC1: A subscriber who opens the AI Features tab for the first time in a session generates an `ai_features_enabled` row in `user_action_log` with `detail: {"tab": "ai"}`.
- [ ] AC2: If the subscriber switches away from the AI tab and back in the same session, no duplicate `ai_features_enabled` event is logged for that session (the event fires once per session, not once per tab click). Implementation of the per-session deduplication is left to the architect; this AC defines the testable outcome.
- [ ] AC3: Filtering the User Actions tab by `ai_features_enabled` shows only these session-open events, not general `ai_query` events.

---

## 5. Data Model Sketch

### Existing tables used (no schema changes required for core functionality)

| Table | Role |
|-------|------|
| `legal_document_versions` | Source of truth for the current active T&C version. Already exists (migration 012). |
| `legal_acknowledgments` | Immutable acknowledgment records. Already exists (migration 012). Used to compute T&C status per user. |
| `user_action_log` | Granular per-action event log. Already exists (migration 015). Receives two new action types. |
| `user_profiles` | Source of subscriber list in Users tab. Already exists. |

### Schema changes required

**Migration 024 — Extend user_action_log CHECK constraint:**

The `user_action_log.action_type` column has an inline CHECK constraint (migration 015) that lists all valid values. Adding `tc_acknowledged` and `ai_features_enabled` requires either:
- Dropping and recreating the CHECK constraint with the expanded set, or
- Altering the constraint in place (Postgres syntax: `ALTER TABLE ... DROP CONSTRAINT ... ; ALTER TABLE ... ADD CONSTRAINT ...`).

The architect must decide which approach is safer given the existing constraint name. The `ACTION_TYPES` frozenset in `activity_logger.py` must be updated in the same PR.

**No new tables are required.** The `legal_acknowledgments` table already provides the authoritative acknowledgment record. The `user_action_log` provides the event trail. The admin acknowledgment-status query is a JOIN at query time, not a materialised column.

### Admin endpoint data shape (illustrative, not prescriptive)

The enriched user row returned by the admin users endpoint must include:

```
{
  "id": "uuid",
  "email": "...",
  "full_name": "...",
  "role": "...",
  "is_active": true,
  "cash": 100000.00,
  "last_login_at": "...",
  "login_count_today": 3,
  "tc_ack_status": "acknowledged" | "pending" | "exempt" | "no_version",
  "tc_ack_at": "2026-06-20T10:00:00Z" | null
}
```

The architect determines whether this is achieved by extending `GET /admin/users` or by adding a new `GET /admin/users/tc-status` endpoint that the frontend merges client-side.

---

## 6. Impact Assessment — Files That Change

| File | Change |
|------|--------|
| `backend/services/activity_logger.py` | Add `tc_acknowledged` and `ai_features_enabled` to `ACTION_TYPES` frozenset |
| `backend/routes/admin_routes.py` | Extend `GET /admin/users` response with `tc_ack_status` and `tc_ack_at` fields per user, using a join against `legal_acknowledgments` for the active version |
| `backend/routes/auth_routes.py` | In the `POST /api/legal/acknowledge` route (if not yet created) or wherever the acknowledgment is recorded, fire a `tc_acknowledged` action via `log_action` |
| `backend/migrations/024_extend_action_types.sql` | Drop and recreate (or alter) the `action_type` CHECK constraint on `user_action_log` to add `tc_acknowledged` and `ai_features_enabled` |
| `frontend/src/components/AdminPanel.tsx` | (1) Add `tc_ack_status` and `tc_ack_at` columns to the Users table; (2) Add "View Activity" button per subscriber row; (3) Thread a controlled-filter prop or shared state into `UserActionsTab` so the Users tab can pre-populate and trigger the filter |
| `frontend/src/api/client.ts` | Update `UserRow` interface to include `tc_ack_status` and `tc_ack_at`; update `ACTION_TYPES` array constant used by `UserActionsTab` dropdown |
| `.github/workflows/purge-user-action-log.yml` | No change — 30-day interval confirmed correct (OQ-5 resolved) |

**Files that do not change:**
- `legal_service.py` — no changes required; existing logic is correct
- `legal_acknowledgments` table — no schema changes required; already immutable
- `legal_document_versions` table — no schema changes required
- `migration 012` — already in production; no alterations permitted to existing migrations
- `migration 015` — already in production; the new migration 024 supersedes the constraint

---

## 7. Out of Scope

- Creating a new admin UI for publishing new T&C versions. The admin currently uses the `publish_legal_version` SQL function directly. A UI for this is a separate feature.
- Displaying the T&C content to subscribers within the admin panel. The admin views status only, not the full document text.
- Per-subscriber T&C acknowledgment history (showing all versions a subscriber has ever acknowledged, not just the current one). The admin view shows current-version status only.
- Subscriber-visible activity log. Subscribers do not see their own event history. The `user_action_log` is admin-only; RLS already enforces this.
- Changing the T&C modal layout or copy. The modal is already implemented and gate-tested. Only the logging of the acknowledgment event is in scope.
- Modifying the retention window of `user_action_log`. The 30-day purge schedule is confirmed correct (OQ-5) and stays unchanged.
- Real-time push or webhook notification when a subscriber acknowledges the T&C. The admin sees the status on next Users tab load.
- Any real-money broker connection or real trading activity. This is a paper-trading platform.
- Email notifications to subscribers when a new T&C version is published. Out of scope for this feature.
- `ticker_search` logging. The `ticker_search` action type exists in the enum but is not currently fired from any route (no route calls `log_action` with `action_type="ticker_search"`). Wiring it up is not in scope for this feature.

---

## 8. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|--------------------|
| No active T&C version published | `GET /admin/users` returns `tc_ack_status: "no_version"` for all non-admin users. Users tab shows "No version published" in that column. No error is thrown. |
| Admin account in the Users list | `tc_ack_status: "exempt"` is returned for the admin email. No acknowledgment check is performed. |
| Subscriber acknowledges but `log_action` fails | The `legal_acknowledgments` insert succeeds first; `log_action` is fire-and-forget. The user is not blocked. A WARNING is written to the backend log. |
| `user_action_log` CHECK constraint not yet migrated | If migration 024 has not been applied and a `tc_acknowledged` event is fired, the DB insert will fail. `log_action` swallows the exception and logs a WARNING. The acknowledgment itself (in `legal_acknowledgments`) is unaffected. |
| Subscriber clicks "View Activity" for a user with no events | The `UserActionsTab` renders with zero results and the message "No results for this filter" (or equivalent). No error. |
| Purge workflow runs while admin is viewing activity log | No rows currently in view are deleted mid-render (the frontend already holds a page snapshot). On next load, rows older than 14 days will not appear. |
| Large subscriber list (hundreds of users) | The admin users query must not issue one `legal_acknowledgments` lookup per user. It must use a single `IN (user_id_1, user_id_2, ...)` or equivalent set query joined against the active version ID. The architect must enforce this in the implementation. |
| Supabase unavailable when admin loads Users tab | The Users tab fails to load (existing behaviour — no special handling required for the new columns). The ack status column is part of the same response so it fails together with the rest. |
| Multiple active T&C versions (should not occur) | The `legal_document_versions_one_active` partial unique index prevents this at the DB level. If somehow two rows have `is_active = true`, the query must use `LIMIT 1` with `ORDER BY published_at DESC` as a safety fallback. |

---

## 9. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|-------------|
| Supabase | All DB reads/writes for user_profiles, legal_acknowledgments, legal_document_versions, user_action_log | Service-role key used server-side only; no key exposure to frontend. Supabase RLS already blocks direct client access to user_action_log. |
| GitHub Actions | Hosts the purge cron (`purge-user-action-log.yml`). Retention change from 30 to 14 days is a one-line YAML and SQL edit. | Requires `SUPABASE_DB_URL` secret to be set in the repo's Actions secrets. This secret already exists for the current 30-day purge. |
| yfinance | Not used by either feature | N/A |
| Claude / Gemini API | Not used by either feature | N/A |
| Reddit PRAW | Not used by either feature | N/A |

**Security invariant:** The `SUPABASE_SERVICE_KEY` and `SUPABASE_DB_URL` must not be exposed to the frontend. All T&C status queries and activity log writes are handled server-side by the FastAPI backend. The frontend never calls Supabase REST directly for these tables.

---

## 10. Subscription Tier Impact

| Tier | Behaviour |
|------|----------|
| free | Subject to the T&C gate. After acknowledging, full free-tier access as before. Activity events logged identically to all other tiers. |
| starter | Same as free. |
| pro | Same as free. |
| enterprise | Same as free. |
| admin (exempt) | Never shown the T&C modal. `tc_ack_status: "exempt"` in the admin Users tab. Admin's own actions are not logged to `user_action_log` for the specific admin email (the legal gate bypass is already in `legal_service.py`). Admin activity logging behaviour is unchanged. |

No tier-gating applies to either feature. The T&C gate and activity log are platform-level concerns that apply uniformly to all tiers.

---

## 11. Open Questions for Product Owner and Architect

| # | Question | Who Answers | Impact |
|---|----------|-------------|--------|
| OQ-1 | Is the activity log (User Actions tab) admin-only, or should subscribers be able to see their own event history? The current RLS on `user_action_log` is service-role-only, meaning subscribers cannot access it. The feature request assumes admin-only. If a subscriber-visible history is wanted, a separate RLS policy and a subscriber-facing API endpoint must be scoped. | Product Owner | Scope, security review |
| OQ-2 | ~~Do the T&C modal and `POST /api/legal/acknowledge` already exist?~~ **RESOLVED:** Both are confirmed present — `OnboardingFlow.tsx` (frontend modal) and `legal_routes.py` (POST endpoint). Story 2 has been removed from scope. | Resolved | — |
| OQ-3 | ~~How frequently should AI feature use be logged — per session or per invocation?~~ **RESOLVED:** Log every invocation, no deduplication. Each time the user triggers an AI feature, a new `ai_query` or `ai_features_enabled` row is written regardless of whether they triggered the same feature earlier in the session. | Resolved | FR-8, FR-12 |
| OQ-4 | The `ticker_search` action type exists in the enum and database but is not fired from any route currently. Should it be wired up as part of this feature (e.g. when the options chain symbol is searched)? It is marked out of scope in Section 7, but the Product Owner should confirm whether this is deferred or permanently out of scope. | Product Owner | Out-of-scope boundary |
| OQ-5 | ~~Retention: should the interval change from 30 to 14 days?~~ **RESOLVED:** Keep 30 days. The existing purge workflow and SQL require no modification. | Resolved | Story 7 |
| OQ-6 | The "View Activity" shortcut from the Users tab to the User Actions tab requires shared state or a URL-based navigation approach (e.g. a query param or React context). Since the admin panel is a single-page component with tab state managed by `useState`, the current architecture does not support URL-encoded tab state. Should the architect introduce a URL-based approach (adding `?tab=user_actions&email=X` routing) or keep it as internal React state? URL-based would allow the admin to bookmark a filtered view; internal state would be simpler. | Architect | Implementation complexity |

---

## 12. Product Owner Annotations

_Filled in by the product-owner agent — 25Jun2026._

### Priority Scores

| Story | Priority (1=must/2=should/3=nice) | Rationale |
|-------|-----------------------------------|-----------|
| Story 1 — Admin sees T&C acknowledgment status per subscriber | **1 — Must Have** | Core compliance visibility. Without this, the admin has no way to identify subscribers who are blocked by the legal gate without inspecting the DB directly. Directly serves the solo-operator workflow. Ships in v1. |
| ~~Story 2~~ — Already implemented (OnboardingFlow + legal_routes) | **N/A — shipped** | Removed from scope. No further action. |
| Story 3 — T&C acknowledgment event recorded in activity log | **1 — Must Have** | Auditability of legal consent is a non-negotiable compliance requirement. The `legal_acknowledgments` table is the authoritative record, but the timestamped event in `user_action_log` provides the admin with a searchable, filterable trail without DB access. Must ship in the same PR as Story 1 — the two are inseparable from a compliance standpoint. |
| Story 4 — Admin views full activity log paginated newest first | **1 — Must Have (baseline)** | The paginated `UserActionsTab` is already built and already ships. This story is retained as a testable baseline to confirm the existing behaviour is not regressed by the new action types. No new development required beyond what Stories 3 and 8 deliver. |
| Story 5 — Admin filters activity log by action type | **1 — Must Have (partial new work)** | The filter dropdown is already built. However, `tc_acknowledged` and `ai_features_enabled` are not yet in the `ACTION_TYPES` array in `AdminPanel.tsx` (confirmed by reading the source — the array currently lists 8 types, neither new type is present). Adding them is a one-line change per type but is required for the filter to function correctly for the new event types. Treat as part of the Stories 3 and 8 delivery, not a standalone work item. |
| Story 6 — Admin clicks subscriber row to filter activity log | **1 — Must Have** | Admin visibility shortcut with high UX leverage. The solo operator's workflow is: open Users tab, spot a subscriber, investigate their activity. Without this button, that workflow requires manually switching tabs and typing the email. Given the small subscriber base, the implementation is low-risk and the payoff is immediate. Ships in v1. |
| Story 7 — Activity log 30-day retention confirmed (no change) | **1 — Must Have (baseline)** | No code change required. Retained as a testable baseline and as documentation that the retention decision was explicitly reviewed. The purge workflow and SQL are correct as-is. |
| Story 8 — AI Features tab open event logged | **2 — Should Have** | Useful for tracking AI adoption by tier, but not operationally critical for compliance or immediate admin workflows. The `ai_features_enabled` event is nice-to-have telemetry. It defers gracefully: if the frontend hook point is awkward to implement cleanly (e.g. requires threading session state through multiple components), defer to a follow-up. However, given that the backend change (adding the action type to `ACTION_TYPES` and the CHECK constraint) must happen anyway for Story 3, and the frontend hook is a small addition, there is no strong reason to defer the backend half. Ship the backend type registration in v1 alongside Story 3; defer the frontend event-firing hook only if implementation risk materialises. |

---

### OQ-4 Resolution (PO Answer)

OQ-4 asked whether `ticker_search` wiring should be included in this feature. **Decision: permanently deferred, not in scope for this feature or the near-term backlog.** The action type already exists in the enum and the CHECK constraint. Wiring it requires identifying the correct route (the options chain symbol search, or the strategy analysis entry point) and deciding whether every symbol lookup counts as a "ticker search" or only the initial chain request. That scope question belongs in a dedicated analytics feature. Adding it here would bloat the feature without adding compliance or admin-visibility value. The out-of-scope declaration in Section 7 is confirmed.

---

### MVP Boundary

**Ships in v1 (this feature):**

- Story 1: T&C acknowledgment status column in the Users tab (new `tc_ack_status` and `tc_ack_at` fields from the admin users endpoint, rendered as Acknowledged/date, Pending, Exempt, or No version published).
- Story 3: `tc_acknowledged` event type wired from `POST /api/legal/acknowledge`, added to `ACTION_TYPES` frozenset and CHECK constraint (migration 024), and added to the `ACTION_TYPES` array in `AdminPanel.tsx`.
- Story 4 (baseline): Confirm existing paginated log is not regressed. No new dev.
- Story 5 (partial): Add `tc_acknowledged` and `ai_features_enabled` to the frontend `ACTION_TYPES` array and confirm the dropdown renders them. The backend registration is delivered by Stories 3 and 8.
- Story 6: "View Activity" button per subscriber row in the Users tab, switching to the `user_actions` tab and pre-populating the email filter.
- Story 7 (baseline): Confirm purge workflow is unchanged. No new dev.
- Story 8 (backend half only): Add `ai_features_enabled` to `ACTION_TYPES` frozenset and migration 024. The frontend event-firing hook (detecting first AI tab open in a session) is in v1 if the architect judges the implementation clean; otherwise deferred.

**Deferred to backlog:**

- Story 8 (frontend firing hook): If threading per-session dedup state into the AI tab open event proves invasive, defer the frontend hook to a follow-up. The backend type registration still ships in v1 so the constraint is ready.
- OQ-6 (URL vs internal state for "View Activity" navigation): Left to the architect. The spec correctly defers this. My preference is internal React state (simpler, no routing changes), but I will not block the architect from choosing URL-based if they judge it more maintainable. This is not a PO decision.
- Per-subscriber T&C history (all versions acknowledged, not just current): Out of scope as stated in Section 7. Confirmed deferred indefinitely.
- Subscriber-visible activity log (OQ-1): Confirmed admin-only. Subscriber-facing history is a separate feature requiring new RLS policy and a subscriber API endpoint. Not in this feature.
- `ticker_search` wiring (OQ-4): Permanently deferred as decided above.

---

### Scope Clarifications Required Before Architecture Begins

The following items must be addressed in the architecture document (02-design.md); none require spec changes before the architect proceeds:

1. **Story 3 hook point**: Confirm whether `POST /api/legal/acknowledge` already calls `log_action` or whether it needs to be added. The spec states "if not yet created" which suggests uncertainty. The architect must read `auth_routes.py` (or whichever file handles the legal acknowledge route) and confirm the exact line where `log_action("tc_acknowledged", ...)` is inserted.

2. **Story 1 endpoint strategy**: The spec leaves open whether `tc_ack_status` is added to the existing `GET /admin/users` response or exposed via a new endpoint. I require a single-call solution — the Users tab must not fire a second request on load. The architect must choose one approach and document it. My preference is extending `GET /admin/users` in-place, as this avoids a parallel fetch and keeps the `UserRow` interface coherent.

3. **Story 8 per-session dedup**: OQ-3 resolved `ai_query` as "log every invocation." But Story 8 AC2 explicitly says `ai_features_enabled` fires once per session. These are two different event types with different dedup rules. The architect must confirm how "per session" is implemented on the frontend (e.g. `useRef` flag reset on login, sessionStorage key). Do not introduce server-side dedup — keep the log append-only.

4. **Migration 024 constraint approach**: The spec correctly notes the architect must decide between dropping/recreating vs. altering the CHECK constraint. This is a pure architectural decision; the spec is clear on what the outcome must be.

---

### Tier Gate Validation

No tier gate changes are required. T&C acknowledgment and activity logging are platform-level infrastructure that apply uniformly across all subscriber tiers. No feature that was previously free-tier-only is being promoted behind a paywall, and no pro-tier value is being exposed to free-tier users. The admin visibility features are admin-only by definition. The existing `legal_gate_dep` dependency already enforces the subscriber-facing gate regardless of tier.

---

### Core Value Loop Check

This feature does not touch the subscriber-facing value loop (ticker entry → IV environment → strategy recommendations → narrative → paper trade). It is pure admin infrastructure. There is no risk of cannibalising the narrative experience or bypassing tier gates. The feature strengthens platform trustworthiness (compliance auditability) without adding subscriber-facing complexity. No narrative UX changes. Approved on this dimension.

---

### PO Gate Decision

**X Approved** — architect may proceed to `02-design.md`.

The spec is well-scoped. Story 2 correctly removed. The four true deliverables (Stories 1, 3, 6, 8) are well-defined. Stories 4, 5, and 7 are correctly characterised as baseline documentation with minimal incremental work. The open questions (OQ-4, OQ-6) are correctly deferred to the architect. No changes to the spec are required before architecture begins.

_Approved by:_ Product Owner &nbsp;&nbsp; _Date:_ 25Jun2026

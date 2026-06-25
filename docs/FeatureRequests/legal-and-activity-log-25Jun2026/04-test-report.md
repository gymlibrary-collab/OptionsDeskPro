# Test Report — Gate 4
## Feature: Legal T&C Acknowledgment Tracking and Subscriber Activity Log
**Date:** 25 Jun 2026
**Branch:** `claude/modest-davinci-sxz7lv`

---

## Part 1 — Manual Exploratory Test Plan

**Scope:** Admin panel — Users tab T&C Status column, badge click navigation, View Activity button, UserActionsTab filter state, ai_features_enabled session dedup, tc_acknowledged event logging, edge cases, mobile viewport

### Source files examined

- `docs/FeatureRequests/legal-and-activity-log-25Jun2026/01-spec.md`
- `docs/FeatureRequests/legal-and-activity-log-25Jun2026/02-design.md`
- `frontend/src/components/AdminPanel.tsx`
- `backend/routes/legal_routes.py`
- `backend/routes/admin_routes.py`
- `backend/routes/activity_routes.py`

---

### Implementation observations (load-bearing for test design)

1. `TcAckBadge` renders "Exempt" for both `status === 'exempt'` AND `status` being falsy or undefined. A missing `tc_ack_status` silently shows "Exempt" — a potential false-positive for admin visibility.

2. The T&C badge is only clickable when `tc_ack_status === 'acknowledged' || tc_ack_status === 'pending'`. For `no_version` and `exempt` there is no pointer cursor or interactivity.

3. The "View Activity" button is suppressed for admin-role users (`u.role !== 'admin'` guard). The admin row shows "Exempt" non-clickable badge only.

4. `handleViewActivity` sets both `userActionsInitialEmail`/`userActionsInitialActionType` and immediately sets `activeTab = 'user_actions'`. The `UserActionsTab` only mounts when `activeTab === 'user_actions'`, so on first click it mounts fresh.

5. The `useEffect` in `UserActionsTab` fires when `initialEmail` is truthy. It sets both `filters` and `appliedFilters`, bypassing `handleApply` (date range validation is skipped — acceptable for email/action_type navigation).

6. `activity_routes.py` accepts only `ai_features_enabled` in `CLIENT_CALLABLE_ACTION_TYPES`. Any subscriber attempt to POST `tc_acknowledged` or any other type returns 422.

7. The `acknowledge_legal` early-return path deliberately does NOT fire `tc_acknowledged`. Re-submitting the modal produces no duplicate log event.

8. The date formatting in `TcAckBadge` uses `toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })` — output depends on host OS and browser locale.

---

### Group A — T&C Status column (badge rendering)

**TC-A-01** — Acknowledged badge shows green text and formatted date
- Precondition: Admin signed in. At least one subscriber has a row in `legal_acknowledgments` for the active version.
- Steps: Open Admin Panel → Users tab. Locate the acknowledged subscriber row.
- Expected: T&C Status column shows "Acknowledged 25 Jun 2026" (or actual date) in green (#22c55e). No console error.
- Priority: critical

**TC-A-02** — Acknowledged badge with null acknowledgment timestamp
- Precondition: A subscriber row in `legal_acknowledgments` exists but `acknowledged_at` is null.
- Expected: Badge reads "Acknowledged" with no date suffix rather than "Acknowledged undefined" or a crash. The `ackedAt ? \` ${dateStr}\` : ''` guard handles this silently.
- Priority: major

**TC-A-03** — Pending badge shows orange text
- Precondition: Active T&C version exists. At least one subscriber has NOT yet acknowledged.
- Expected: T&C Status column shows "Pending" in orange (#f97316). No date shown. No error.
- Priority: critical

**TC-A-04** — Exempt badge shows for admin-role users
- Expected: T&C Status column shows "Exempt" in muted grey (#64748b). Not clickable (no pointer cursor, clicking produces no tab switch). No View Activity button on this row.
- Priority: critical

**TC-A-05** — No version published state
- Precondition: No active T&C version exists.
- Expected: Every non-admin subscriber row shows "No version published" in muted grey. Not clickable. Admin row still shows "Exempt".
- Priority: major

**TC-A-06** — Missing tc_ack_status field renders as Exempt (documented false positive)
- Precondition: Backend running a version without `tc_ack_status` in the response.
- Expected (current code): All rows show "Exempt" because `!status` is truthy when undefined. **This is a false positive** — "Exempt" misleads the admin. Missing-field state should ideally render a dash or error indicator. Flag for developer review.
- Priority: major

**TC-A-07** — T&C Status column is the eighth column in the Users table
- Expected: Nine columns — Name, Email, Role, Cash, Last Login, Today's Logins, Status, T&C Status, (actions). Headers match this order exactly.
- Priority: minor

---

### Group B — T&C badge click navigates to filtered User Actions tab

**TC-B-01** — Clicking acknowledged badge navigates to User Actions filtered by email + tc_acknowledged
- Steps: Open Users tab. Click the green acknowledged badge for alice@example.com.
- Expected: Switches to User Actions tab (no page reload). Email filter = "alice@example.com". Action Type = "tc_acknowledged". Results auto-load showing only tc_acknowledged rows for that email.
- Priority: critical

**TC-B-02** — Clicking pending badge navigates to tc_acknowledged filter with zero results
- Steps: Click the orange "Pending" badge for bob@example.com.
- Expected: Same navigation. Tab switches. Email = bob, action_type = tc_acknowledged. Results show zero rows. Empty state message shown.
- Priority: critical

**TC-B-03** — Exempt badge is not clickable
- Expected: No pointer cursor. Clicking produces no navigation, no tab switch, no console error.
- Priority: minor

**TC-B-04** — "No version published" badge is not clickable
- Expected: No pointer cursor. Clicking produces nothing.
- Priority: minor

---

### Group C — View Activity button

**TC-C-01** — View Activity button present for every non-admin subscriber
- Expected: Every subscriber with role "user" has a "View Activity" button. The admin-role row does not.
- Priority: critical

**TC-C-02** — View Activity click pre-populates email with All action types
- Steps: Click "View Activity" for carol@example.com.
- Expected: Tab switches to User Actions. Email = "carol@example.com". Action Type dropdown shows "All". Results auto-load showing all action types for carol. No page reload.
- Note: Key distinction from badge click — no `actionType` passed so action_type filter = '' = "All".
- Priority: critical

**TC-C-03** — View Activity for subscriber with no logged events shows empty state
- Expected: Tab switches, email pre-populated, results show "No actions recorded matching the current filters." No error or infinite loading.
- Priority: major

**TC-C-04** — View Activity for different subscriber resets correctly
- Steps: (1) Click View Activity for alice. (2) Return to Users tab. (3) Click View Activity for bob.
- Expected: Email filter shows bob@example.com, not alice. Results are for bob.
- Priority: critical

**TC-C-05** — Rapid double-click on View Activity button
- Expected: Tab switches exactly once. Single API call. The React batch update prevents doubled navigation.
- Note: Double-click could invoke `handleViewActivity` twice before `onEmailConsumed` clears parent state. Check Network tab for duplicate requests.
- Priority: major

---

### Group D — Clearing the email filter after View Activity navigation

**TC-D-01** — Clearing email filter returns to unfiltered log
- Steps: Arrived via "View Activity" for alice. Clear the email input. Click Apply.
- Expected: Results reload showing all users' actions. No lock-in mechanism forces alice's email back.
- Priority: critical

**TC-D-02** — Clearing email then returning to Users tab and clicking View Activity again works
- Steps: Clear email filter, Apply, click Users tab, click View Activity for alice again.
- Expected: User Actions reopens with alice@example.com pre-populated. Results filtered to alice.
- Priority: major

**TC-D-03** — Clearing action_type filter after badge click navigation
- Steps: Arrived via acknowledged badge (email=alice, action_type=tc_acknowledged). Select "All" from dropdown. Apply.
- Expected: Results show all action types for alice. Email filter remains.
- Priority: major

**TC-D-04** — Clearing both filters returns fully unfiltered log
- Steps: Clear email input. Set action_type to "All". Apply.
- Expected: All rows from all users and action types appear, paginated.
- Priority: major

---

### Group E — ai_features_enabled — once-per-session dedup

**TC-E-01** — First AI tab open fires ai_features_enabled event
- Steps: Note current row count for ai_features_enabled. Click AI Features tab.
- Expected: POST to `/api/activity/log-action` fires with `{"action_type": "ai_features_enabled", "detail": {"tab": "ai"}}`. Visible in browser Network tab. New row appears in activity log.
- Priority: major

**TC-E-02** — Switching away and back does NOT fire a second event in the same session
- Steps: Click another tab. Click back to AI Features.
- Expected: No second POST fires. Only one `ai_features_enabled` event in the log for this session. `aiTabLoggedRef.current` is true and blocks the call.
- Note: Proving the absence of a network call is timing-dependent — prime scenario for exploratory testing, not automation.
- Priority: major

**TC-E-03** — Logout and login within same browser tab re-fires ai_features_enabled
- Steps: Click AI tab (event fires). Log out. Log back in. Click AI tab again.
- Expected: Second `ai_features_enabled` event fires. `useRef` is destroyed on Dashboard unmount (logout), so the next login gets a fresh `false` ref. Two rows in the log — one per session.
- Note: Cannot be tested by automated Playwright — fixture auth bypass does not simulate Dashboard unmount/remount.
- Priority: major

**TC-E-04** — ai_features_enabled does NOT fire when AI Features tab is globally disabled
- Expected: When AI features are disabled, the redirect effect (`setActiveTab('chain')`) fires. Verify whether the logging `useEffect` also fires once before the redirect completes — both effects watch `activeTab`. Potential single spurious event — flag for developer review.
- Priority: major

**TC-E-05** — ai_features_enabled fires once even across multiple Dashboard re-renders
- Expected: Only one event total. `useRef` is not reset by re-renders.
- Priority: minor

---

### Group F — tc_acknowledged event logging

**TC-F-01** — "I Agree" fires tc_acknowledged with correct detail
- Steps: Log in as subscriber. Modal appears. Click "I Agree". Check User Actions tab as admin.
- Expected: One tc_acknowledged row with correct user_email, action_type, and detail containing version_id, version_number, content_hash.
- Priority: critical

**TC-F-02** — Re-submitting already-acknowledged version does NOT create a duplicate event
- Steps: Simulate second POST to `/api/legal/acknowledge` for the same version.
- Expected: Backend returns `{"already_acknowledged": True}`. No new row in `legal_acknowledgments` or `user_action_log`. Early-return path bypasses `log_action`.
- Priority: critical

**TC-F-03** — tc_acknowledged appears in the action_type dropdown
- Expected: "tc_acknowledged" is selectable alongside all other 9 action types. All 10 must be present.
- Priority: major

**TC-F-04** — Filtering by tc_acknowledged returns only tc_acknowledged rows
- Expected: Results table shows only tc_acknowledged rows. No other action types appear.
- Priority: major

**TC-F-05** — tc_acknowledged detail field is readable in the UI
- Expected: Detail cell shows version_id, version_number, content_hash. Content_hash (64 chars) may be truncated by the 120-char limit — verify readability.
- Priority: minor

---

### Group G — Edge cases

**TC-G-01** — Subscriber with no activity shows empty state (see TC-C-03)

**TC-G-02** — Admin row T&C shows "Exempt" and is non-interactive (see TC-A-04, TC-B-03)

**TC-G-03** — No active T&C version — all rows show "No version published"
- Extended: Verify backend `list_users` does not throw when `legal_document_versions` is empty. Verify frontend shows "No version published" (not "Exempt"). No JavaScript console error.
- Priority: major

**TC-G-04** — Backend returns tc_ack_status undefined — renders as "Exempt" (documented false positive, see TC-A-06)

**TC-G-05** — Large subscriber list loads T&C status in a single API call
- Steps: Open Network tab. Navigate to Admin Panel → Users.
- Expected: Exactly one `GET /admin/users` call. No secondary T&C-specific calls. No per-user calls. Response includes `tc_ack_status` and `tc_ack_at` for every row.
- Priority: major

**TC-G-06** — Supabase unavailable — whole Users tab fails together
- Expected: Unified error state, not partial render with missing T&C columns.
- Priority: major

**TC-G-07** — T&C version changes mid-acknowledgment flow (race condition)
- Steps: Session A loads modal (V1). Session B publishes V2, deactivates V1. Session A clicks "I Agree".
- Expected: Backend returns 409 "Legal document version has changed." No acknowledgment recorded, no tc_acknowledged event, no `legal_acknowledgments` row.
- Priority: major

**TC-G-08** — activity_routes rejects non-whitelisted action types from subscribers
- Steps: POST to `/api/activity/log-action` with `action_type: "paper_trade_placed"`.
- Expected: HTTP 422 with detail "action_type 'paper_trade_placed' is not client-callable". No row inserted.
- Priority: major (security invariant)

**TC-G-09** — Subscriber cannot log events for another user
- Steps: POST to `/api/activity/log-action` with a spoofed `user_id`/`user_email` in the request body.
- Expected: Endpoint ignores body identity fields. Inserted row always uses the verified JWT identity. Subscriber A cannot log as subscriber B.
- Priority: critical (security invariant)

---

### Group H — Mobile viewport

**TC-H-01** — Users table horizontally scrollable at 375px viewport
- Expected: Table wraps in `overflowX: 'auto'` container. All nine columns accessible by scrolling. T&C Status and actions columns not cut off.
- Note: Nine columns at 375px is very wide. T&C badge at 11px may have touch target under 44px Apple HIG minimum.
- Priority: major

**TC-H-02** — T&C badge click works on touch
- Expected: Tap fires navigation. Flag if touch target feels unreliable (11px font at ~24px tap area).
- Priority: major

**TC-H-03** — View Activity button touch target on mobile
- Expected: Button triggers navigation. `padding: 3px 10px` at 12px font ≈ 24px height — below 44px minimum. Risk of misfire onto adjacent row button.
- Priority: major

**TC-H-04** — User Actions filter bar wraps on narrow viewport
- Expected: Filter controls wrap via `flexWrap: 'wrap'`. Apply button below filters. Note 240px email input on 375px viewport may cause subtle layout overflow.
- Priority: minor

**TC-H-05** — Admin panel tab bar accessible on mobile (7 tabs including new "User Actions")
- Expected: Tab bar scrolls horizontally or wraps. "User Actions" tab accessible without layout breakage.
- Priority: major

---

### Group I — Cross-tab state and session behaviour

**TC-I-01** — Navigating away from User Actions and back resets to unfiltered state
- Steps: Arrive via View Activity for alice. Click another tab. Click User Actions tab directly.
- Expected: Component unmounts and remounts (conditional render). Alice filter is gone. `userActionsInitialEmail` was already cleared by `onEmailConsumed`. Default empty filter state shown.
- Priority: major

**TC-I-02** — Page refresh while on User Actions resets all state
- Expected: After re-auth, Admin Panel opens at default "users" tab. No pre-populated filter state survives.
- Priority: minor

**TC-I-03** — Switching away from Admin Panel to another app section and back
- Expected: Verify whether AdminPanel unmounts (conditional render) or stays mounted. State reset behaviour matches user expectations.
- Priority: minor

---

### Scenarios that automated Playwright tests cannot realistically cover

1. **TC-E-02** — Proving absence of a network call after second tab click
2. **TC-E-03** — Session reset on logout/login (fixture auth bypass does not simulate Dashboard unmount)
3. **TC-E-04** — Two `useEffect`s racing on same `activeTab` change
4. **TC-H-02/TC-H-03** — Touch target adequacy (physical test)
5. **TC-A-02** — Null `tc_ack_at` from Supabase (requires DB row with deliberate null)
6. **TC-G-07** — Version mismatch race condition (requires two concurrent browser sessions)
7. **TC-F-02** — No duplicate tc_acknowledged on re-submit (requires replaying POST)
8. **TC-H-01–H-05** — Mobile layout (Playwright emulation doesn't fully replicate overflow behaviour)
9. **TC-A-06** — Undefined `tc_ack_status` renders as Exempt (requires deliberately degraded API)
10. **TC-B-05** — Rapid double-click (touch device event coalescing not reproduced accurately)

---

### Findings from code review

**Finding 1 — Severity: Major**
`TcAckBadge` treats `!status` (undefined or empty string) identically to `status === 'exempt'`, rendering "Exempt" for both. If the backend omits `tc_ack_status`, every subscriber row silently displays "Exempt" — the highest-trust status. The admin has no indication the field is missing. Should render "—" or "Unknown" rather than "Exempt" for undefined state.
File: `frontend/src/components/AdminPanel.tsx`, line 65.

**Finding 2 — Severity: Minor**
When a subscriber is elevated to admin via role change, the View Activity button disappears immediately (optimistic local state update) without a Users tab reload. The admin cannot jump to the activity log for a just-promoted admin user without demoting them first.
File: `frontend/src/components/AdminPanel.tsx`, lines 271–281, 407.

**Finding 3 — Severity: Minor**
`onEmailConsumed` callback is called inside the `useEffect` that runs when `initialEmail` changes. In React Strict Mode (development), double-invocation may call the callback twice, clearing parent state before filters are fully applied. Production builds are unaffected, but development-mode tests should account for this.
File: `frontend/src/components/AdminPanel.tsx`, lines 1003–1010.

**Finding 4 — Severity: Minor / Cosmetic**
T&C badge date format uses `'en-GB'` locale hardcoded in `TcAckBadge`. On some OS/browser combinations, month abbreviation casing or separator may differ despite the explicit locale argument. Could cause automated snapshot tests to fail cross-environment.
File: `frontend/src/components/AdminPanel.tsx`, line 72.

**Finding 5 — Severity: Cosmetic**
`renderDetail` shows `content_hash` for `tc_acknowledged` rows. The 64-character hex hash is truncated at 120 characters and is not useful at a glance. A tc_acknowledged-specific rendering that shows `version_number` prominently and abbreviates/omits the hash would be clearer for admins.
File: `frontend/src/components/AdminPanel.tsx`, lines 974–981.

---

### Test environment prerequisites

- Active Supabase instance with migrations 001–024 applied
- At least one active T&C version published in `legal_document_versions`
- Minimum three subscriber accounts: one acknowledged, one pending, one brand-new
- Admin account (email bypass) visible in Users tab
- Way to disable the active T&C version to test the `no_version` state
- Browser DevTools open to observe Network calls for TC-G-05, TC-E-01, TC-E-02
- Mobile device or DevTools emulation at 375px for Group H
- Ability to replay a POST request for TC-F-02 (devtools or curl with valid JWT)

---

## Part 2 — Automated Playwright E2E Tests

*(To be appended when the qa-engineer agent completes test file output)*

See `frontend/e2e/pages/legal-activity-log.spec.ts` for the automated suite.

---

## Part 3 — Test Summary

| Section | Cases | Critical | Major | Minor |
|---------|-------|----------|-------|-------|
| Group A — Badge rendering | 7 | 3 | 3 | 1 |
| Group B — Badge click navigation | 4 | 2 | 0 | 2 |
| Group C — View Activity button | 5 | 3 | 2 | 0 |
| Group D — Filter clearing | 4 | 1 | 3 | 0 |
| Group E — ai_features_enabled dedup | 5 | 0 | 4 | 1 |
| Group F — tc_acknowledged logging | 5 | 2 | 2 | 1 |
| Group G — Edge cases | 9 | 2 | 5 | 0 |
| Group H — Mobile viewport | 5 | 0 | 4 | 1 |
| Group I — Cross-tab state | 3 | 0 | 1 | 2 |
| **Total** | **47** | **13** | **24** | **8** |

**Findings requiring developer attention before Gate 5:**
- Finding 1 (Major): `undefined` tc_ack_status renders as "Exempt" — false positive

**Findings deferred (minor/cosmetic, acceptable for Gate 5):**
- Finding 2, 3, 4, 5

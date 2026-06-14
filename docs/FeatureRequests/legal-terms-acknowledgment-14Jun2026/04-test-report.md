## Manual Test Plan

**Feature:** Legal Terms Acknowledgment Gate
**Tester role:** Manual / Exploratory
**Date written:** 14 Jun 2026
**Source documents:** 01-spec.md (38 acceptance criteria across 7 stories), 02-design.md
**Components under test:**
- `frontend/src/components/LegalAcknowledgmentGate.tsx` — re-acknowledgment modal for existing subscribers
- `frontend/src/components/OnboardingFlow.tsx` — embedded `LegalAcknowledgmentStep` for new subscribers
- `frontend/src/components/admin/LegalVersionManager.tsx`
- `frontend/src/components/admin/SubscriberDetail.tsx` — Legal Acknowledgment History section
- `backend/routes/legal_routes.py`, `backend/routes/platform_routes.py`, `backend/routes/auth_routes.py`
- `backend/migrations/012_legal_acknowledgments.sql` — DB immutability triggers and RLS

---

### Observations from code review before test execution

These observations are noted before any live test is run. They inform which test cases need extra attention and flag risks found in the implementation.

**OBS-1 (Major — potential gate bypass via keyboard):** In `App.tsx` lines 421-422, the re-acknowledgment gate renders `<Dashboard />` first and overlays `<LegalAcknowledgmentGate />` on top of it via `position: fixed; z-index: 9999`. The dashboard HTML is live in the DOM while the gate is visible. No explicit focus trap is visible in the component code. A keyboard user pressing Tab repeatedly may be able to navigate focus through the fixed overlay into dashboard interactive elements. Test case AC-MODAL-05 must probe this specifically. This may also be visible to screen readers. Flag as major if keyboard focus escapes the modal.

**OBS-2 (Minor — field name divergence between spec/design and implementation):** The spec (FR 3.4.16) and design API contract use `document_text_hash`, `full_text`, and `text_hash`. The frontend `client.ts` (lines 858-868) uses `content_hash` and `content_markdown` on `LegalVersion`. The `AcknowledgeRequest` sends `content_hash` not `document_text_hash`. The backend field names must match what the frontend reads. If the backend uses the spec field names and the frontend reads `content_hash` / `content_markdown`, the gate will display blank text and submit an undefined hash. This must be verified in live testing as a first priority.

**OBS-3 (Minor — duplicate acknowledgment response field unused):** `AcknowledgeResponse` in `client.ts` includes `already_acknowledged?: boolean`, but neither `LegalAcknowledgmentGate.tsx` nor `LegalAcknowledgmentStep` reads or displays this field. If the backend returns `already_acknowledged: true` on a retry, the UI silently advances — which is correct per FR 3.4.19. Verify this is intentional.

**OBS-4 (Minor — no Retry button in the re-acknowledgment modal on fetch error):** `LegalAcknowledgmentGate.tsx` (lines 154-158) shows the fetch error message but renders no Retry button. Compare to `OnboardingFlow.tsx` (lines 119-122) which does include a Retry button. If `GET /api/legal/current-version` fails, a subscriber using the re-acknowledgment modal has no way to retry without hard-refreshing the page. Flag as minor UX deficiency.

**OBS-5 (Minor — user_agent column absent from subscriber legal history table):** `SubscriberDetail.tsx` (lines 489-504) renders the legal history table with columns Version, Acknowledged At, IP Address. Spec AC6.2 requires user_agent to also be shown. The user_agent column is absent. Flag for developer confirmation whether this is intentional or an omission against the acceptance criterion.

**OBS-6 (Cosmetic — four-step indicator shown for free-tier subscribers):** `OnboardingFlow.tsx` line 221 always includes `'payment'` in the `STEPS` array. Free-tier subscribers will never visit a payment screen, yet they see a "3 — payment" dot in the progress indicator. The design document states free-tier ordering should be `plan_selection → legal_acknowledgment → complete`. This may confuse free-tier users.

---

### Preconditions common to all sections

Unless a test case states otherwise:
- A live test environment is running (local dev or staging) with both FastAPI backend and React frontend reachable.
- Supabase is connected and migration 012 has been applied.
- At least one non-admin subscriber account exists in the whitelist.
- The admin email `leonardsim.sm@gmail.com` is accessible.
- Browser DevTools are available (Chrome or Firefox recommended).
- A second browser window or incognito session is available for concurrent-session tests.

---

## Section A — New Subscriber Onboarding Gate

**Context:** Tests for `LegalAcknowledgmentStep` embedded inside `OnboardingFlow.tsx`. A "new subscriber" has `onboarding_completed = false` in `user_profiles`. Unless stated, an active legal version exists.

---

**AC-ONBOARD-01**
- ID: AC-ONBOARD-01
- Description: Legal step appears immediately after plan selection, before the completion screen
- Preconditions: Subscriber has `onboarding_step = 'plan_selection'`. Active legal version exists.
- Steps:
  1. Sign in as the new subscriber.
  2. Observe the plan selection (PricingPage) screen.
  3. Select any plan (free or paid).
  4. Observe which screen appears next.
- Expected result: The Risk Disclosure & Indemnification Agreement text is shown. The "You are all set!" completion screen is NOT shown. The step progress indicator shows step 2 (legal_acknowledgment) as active.
- Covers: AC1.1

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-02**
- ID: AC-ONBOARD-02
- Description: Agreement text is visible and scrollable on the onboarding legal step
- Preconditions: Subscriber is on the legal_acknowledgment step. Agreement text is longer than one viewport height.
- Steps:
  1. Observe the content area containing the agreement text.
  2. Scroll up and down within the agreement text container.
  3. Confirm the full text is readable with adequate font size and line height.
- Expected result: Agreement text renders in full inside a scrollable panel. No text is clipped at the edges. The container scrolls smoothly.
- Covers: AC1.2

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-03**
- ID: AC-ONBOARD-03
- Description: Checkbox is disabled before scrolling to the bottom — verified via DevTools
- Preconditions: Subscriber is on the legal_acknowledgment step. Agreement text is longer than one screen.
- Steps:
  1. Without scrolling, observe the checkbox in the footer.
  2. Attempt to click the checkbox.
  3. Open DevTools → Elements → inspect the `<input type="checkbox">` element.
  4. Confirm the presence of the `disabled` HTML attribute on the element (not merely `opacity: 0.45`).
  5. Confirm the instructional text "Please scroll to the bottom of the agreement to enable the checkbox." is visible.
- Expected result: The checkbox cannot be checked. DevTools confirms `disabled` is an HTML attribute on the input, not only a CSS styling. The instructional hint is displayed.
- Covers: AC1.3, AC2.3

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-04**
- ID: AC-ONBOARD-04
- Description: "I Agree & Continue" button has the HTML disabled attribute while checkbox is unchecked
- Preconditions: Subscriber has scrolled to the bottom (checkbox is now enabled). Checkbox is unchecked.
- Steps:
  1. Scroll fully to the bottom of the agreement text.
  2. Do not check the checkbox.
  3. Open DevTools → Elements → inspect the `<button>` element labelled "I Agree & Continue".
  4. Confirm `disabled` attribute is present.
  5. Attempt to click the button.
  6. Confirm no network request to `/api/legal/acknowledge` is made (DevTools → Network).
- Expected result: Button is unclickable. The HTML `disabled` attribute is present on the button element. No API call is initiated.
- Covers: AC1.4, AC2.3

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-05**
- ID: AC-ONBOARD-05
- Description: Happy path — scroll to bottom, check checkbox, click "I Agree & Continue", advance to completion
- Preconditions: Subscriber is on the legal_acknowledgment step. Active version exists.
- Steps:
  1. Scroll the agreement text container fully to the bottom.
  2. Confirm the checkbox becomes enabled (observe `disabled` attribute removed in DevTools).
  3. Check the checkbox. Confirm "I Agree & Continue" button becomes enabled (colour changes, `disabled` removed).
  4. Click "I Agree & Continue".
  5. Watch DevTools → Network for the POST request.
  6. Observe the next screen.
- Expected result: A POST to `/api/legal/acknowledge` is made. On 200 response, the view advances to "You are all set!" (free tier) or to payment redirect (paid tier). No error message is shown.
- Covers: AC1.5

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-06**
- ID: AC-ONBOARD-06
- Description: After acknowledging on free tier, subscriber can reach the dashboard
- Preconditions: Subscriber has just completed AC-ONBOARD-05 with a free plan and is on "You are all set!".
- Steps:
  1. Click "Go to dashboard".
  2. Observe what renders.
- Expected result: The main dashboard renders (tabs visible: Options Chain, Strategy Scanner, Positions, etc.). The onboarding flow is no longer shown. No legal gate appears.
- Covers: AC1.6

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-07**
- ID: AC-ONBOARD-07
- Description: No skip, close, or bypass mechanism exists on the legal step
- Preconditions: Subscriber is on the legal_acknowledgment step.
- Steps:
  1. Examine the entire UI for any "Skip", "Later", "Close", "X", "Cancel", "Back", or equivalent affordance.
  2. Check the DOM in DevTools for any hidden or off-screen buttons.
  3. Press the Escape key.
  4. Click anywhere in the page background area (if applicable to the onboarding layout).
- Expected result: No skip or close mechanism exists. Escape has no effect on the step. The only interactive elements are the scrollable text, the checkbox (after scroll), and the "I Agree & Continue" button.
- Covers: AC1.7, AC2.1

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-08**
- ID: AC-ONBOARD-08
- Description: Hard refresh during legal step returns subscriber to legal step, not plan selection
- Preconditions: Subscriber is on the legal_acknowledgment step (plan has been selected, acknowledgment not yet completed).
- Steps:
  1. Before refreshing, verify in Supabase SQL Editor: `SELECT onboarding_step FROM user_profiles WHERE id = '<subscriber_uuid>'` — should show `legal_acknowledgment`.
  2. Hard-refresh the page (Ctrl+Shift+R / Cmd+Shift+R).
  3. Wait for auth and profile load to complete.
  4. Observe which step is shown.
- Expected result: The subscriber is returned to the legal_acknowledgment step. They are NOT sent back to plan_selection. Scroll state resets to top (checkbox disabled again).
- Covers: AC1.8

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-09**
- ID: AC-ONBOARD-09
- Description: Direct URL navigation while in onboarding does not grant dashboard access
- Preconditions: Subscriber has `onboarding_completed = false` and `onboarding_step = 'legal_acknowledgment'`. No acknowledgment record exists.
- Steps:
  1. While the legal step is displayed, type `/` in the browser address bar and press Enter.
  2. Observe whether the dashboard renders.
- Expected result: The onboarding flow (legal step) is shown, not the dashboard. The frontend gate prevents dashboard rendering when `onboarding_completed = false`.
- Covers: AC2.1, AC2.2

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-10**
- ID: AC-ONBOARD-10
- Description: Rapid double-click on "I Agree & Continue" does not produce an unhandled error
- Preconditions: Subscriber has scrolled to bottom and checked the checkbox.
- Steps:
  1. Click "I Agree & Continue" twice as fast as possible (within approximately 200ms — simulate a mobile double-tap using quick successive mouse clicks).
  2. Observe the Network tab in DevTools for the number of POST requests to `/api/legal/acknowledge`.
  3. Observe the UI for any error state.
- Expected result: Either (a) only one POST is sent because the button enters `submitting = true` on first click which sets `disabled = true`, blocking the second click, or (b) two POSTs are sent and both return 200 without error (FR 3.4.19 accepts duplicate records). The subscriber must not be shown an error state.
- Note: This timing-dependent scenario cannot be reliably covered by Playwright. Must be verified manually, including on a real or simulated mobile device.
- Covers: AC1.5, FR 3.4.19

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-11**
- ID: AC-ONBOARD-11
- Description: 5xx error on acknowledgment submission shows inline error and keeps subscriber on step
- Preconditions: Subscriber has scrolled to bottom and checked the checkbox. Backend error is simulated by blocking the URL in DevTools → Network → Block request URL → `/api/legal/acknowledge`.
- Steps:
  1. Block the POST `/api/legal/acknowledge` request in DevTools.
  2. Click "I Agree & Continue".
  3. Observe the UI.
  4. Unblock the URL and click "I Agree & Continue" again.
- Expected result: An inline error message appears: "Could not record your acknowledgment. Please try again." The subscriber remains on the legal step. The button is re-enabled after the error. On retry with the block removed, the submission succeeds and the subscriber advances.
- Covers: spec edge case — 5xx error on acknowledgment

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ONBOARD-12**
- ID: AC-ONBOARD-12
- Description: No active version published — legal step shows graceful error, not blank agreement
- Preconditions: No row in `legal_document_versions` has `is_active = true`. (Test on a fresh DB or after running `UPDATE legal_document_versions SET is_active = false WHERE is_active = true` in Supabase SQL Editor.)
- Steps:
  1. Select a plan in the onboarding flow.
  2. The legal step loads and calls `GET /api/legal/current-version`, which returns 404.
  3. Observe the UI.
- Expected result: The error message "Unable to load the legal agreement. Please refresh." is shown inside the card. A Retry button is visible (from the `fetchError` block in `LegalAcknowledgmentStep`). No blank or empty agreement container is shown. The subscriber cannot advance.
- Covers: spec edge case — GET current-version returns 404

- [ ] Pass  [ ] Fail  [ ] Blocked

---

## Section B — Existing Subscriber Re-Acknowledgment Modal

**Context:** Tests for `LegalAcknowledgmentGate.tsx`, rendered as a full-screen fixed overlay in `App.tsx` when `pendingLegalAcknowledgment` is true and the user is not the admin email.

**Setup to simulate pending state:**

- Method 1 (publish new version — preferred): As the Owner in the admin portal, publish v1.1. Any subscriber who acknowledged only v1.0 is now pending.
- Method 2 (zero acknowledgment records): In Supabase SQL Editor with service role, delete the subscriber's acknowledgment row: `DELETE FROM legal_acknowledgments WHERE user_id = '<uuid>'`. This bypasses the immutability trigger because the trigger blocks DELETE from *within the application* using the service role via the backend, but the SQL Editor also uses the service role and will be stopped by the trigger. To truly delete for testing, the migration trigger must be temporarily disabled — avoid this if possible and use Method 1 instead.

---

**AC-MODAL-01**
- ID: AC-MODAL-01
- Description: Re-acknowledgment modal appears on next login after a new version is published
- Preconditions: Subscriber has acknowledged v1.0. Owner has published v1.1 (run AC-ADMIN-02 first).
- Steps:
  1. Sign out as the subscriber.
  2. Sign back in.
  3. In DevTools → Network, inspect the POST `/api/auth/login` response body.
  4. Observe the screen after auth completes.
- Expected result: The login response JSON shows `"pending_legal_acknowledgment": true`. The "Updated Legal Terms" modal appears covering the full viewport before any dashboard content is accessible. The modal header subtitle displays the v1.1 version number and effective date.
- Covers: AC3.1, AC3.2

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-02**
- ID: AC-MODAL-02
- Description: Modal cannot be dismissed by clicking outside, pressing Escape, or via any hidden close button
- Preconditions: Re-acknowledgment modal is visible.
- Steps:
  1. Click on the dark overlay area outside the card boundary.
  2. Press the Escape key.
  3. Inspect the DOM in DevTools for any hidden or zero-opacity close/dismiss button.
  4. Attempt browser keyboard shortcuts (Alt+F4, Cmd+W — these close the tab, which is acceptable; reopen and verify modal returns).
- Expected result: The modal does not close under any of the above actions. No dismiss mechanism exists in the UI or DOM.
- Covers: AC3.3

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-03**
- ID: AC-MODAL-03
- Description: Scroll enforcement works inside the modal — checkbox disabled until bottom is reached
- Preconditions: Re-acknowledgment modal is visible. Agreement text is longer than one viewport height.
- Steps:
  1. Without scrolling, inspect the checkbox in DevTools — confirm `disabled` attribute is present.
  2. Attempt to click the checkbox. Confirm it does not check.
  3. Slowly scroll to the bottom of the text within the modal.
  4. Observe the checkbox after the bottom is reached (within 10px threshold per implementation).
- Expected result: The `disabled` attribute is removed from the checkbox input only after scrolling to within 10px of the bottom of the scrollable container. The instructional text "Please scroll to the bottom of the agreement to enable the checkbox." disappears after scroll completes.
- Covers: AC3.4, AC3.5

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-04**
- ID: AC-MODAL-04
- Description: Happy path — scroll, check, agree, modal dismisses without page reload
- Preconditions: Re-acknowledgment modal is visible.
- Steps:
  1. Scroll to the bottom of the agreement text.
  2. Check the checkbox.
  3. Click "I Agree & Continue".
  4. Watch DevTools → Network for the POST to `/api/legal/acknowledge`.
  5. Observe the result.
- Expected result: POST to `/api/legal/acknowledge` returns 200. The modal disappears without a full page reload (state is cleared via `clearLegalAcknowledgmentPending()` in AuthContext). The dashboard is now fully rendered and accessible.
- Covers: AC3.6

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-05**
- ID: AC-MODAL-05
- Description: Dashboard tabs and content are inaccessible while modal is visible — including keyboard
- Preconditions: Re-acknowledgment modal is visible.
- Steps:
  1. Press the Tab key repeatedly and observe where keyboard focus goes. Note: the modal has `position: fixed; z-index: 9999` but no explicit focus trap in the visible code.
  2. Attempt to click on any dashboard tab or button visible through the overlay.
  3. In DevTools Console, try: `document.querySelectorAll('button')[0].click()` to see if a dashboard button behind the overlay can be activated programmatically.
- Expected result: Pointer clicks on the dashboard are blocked by the overlay. If keyboard Tab navigates to dashboard elements behind the modal, this is a defect — flag as major (see OBS-1). Confirm that no dashboard functionality can be triggered.
- Covers: AC3.7

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-06**
- ID: AC-MODAL-06
- Description: 409 race condition — new version published while subscriber is reading the modal
- Preconditions: Subscriber has re-acknowledgment modal open showing v1.1. A second browser session is available for the Owner.
- Steps:
  1. Subscriber (Browser A): scroll to bottom, check the checkbox. Do NOT click "I Agree & Continue" yet.
  2. Owner (Browser B): publish version v1.2 from the admin portal. Confirm publish succeeds.
  3. Subscriber (Browser A): now click "I Agree & Continue".
  4. Observe the response in Browser A.
- Expected result: Backend returns 409 because the submitted `version_id` matches v1.1, which is no longer active. The frontend displays: "The legal terms have been updated since this page loaded. Please scroll through the updated text and re-read before agreeing." The component then fetches v1.2, resets `hasScrolledToBottom = false` and `checkboxChecked = false`, and displays v1.2 for the subscriber to re-read.
- Note: This is a timing-dependent race condition that Playwright cannot reliably reproduce. Must be tested manually with two concurrent sessions.
- Covers: spec edge case — race condition on version supersession

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-07**
- ID: AC-MODAL-07
- Description: Admin email bypasses the re-acknowledgment modal entirely
- Preconditions: A new version has been published. Test with the admin email `leonardsim.sm@gmail.com`.
- Steps:
  1. Sign in as `leonardsim.sm@gmail.com`.
  2. Observe whether the re-acknowledgment modal appears.
  3. Inspect the POST `/api/auth/login` response in DevTools → Network → confirm `pending_legal_acknowledgment: false`.
- Expected result: No legal gate is shown. The dashboard renders immediately. Both the backend (returns `false` for admin email) and the frontend (`user.email !== ADMIN_EMAIL` check in App.tsx) enforce the bypass.
- Covers: spec edge case — admin bypass

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-08**
- ID: AC-MODAL-08
- Description: Legacy subscriber with zero acknowledgment records is gated on login
- Preconditions: A subscriber has no rows in `legal_acknowledgments`. An active version exists.
- Steps:
  1. Sign in as the subscriber with no acknowledgment record.
  2. Observe the POST `/api/auth/login` response — confirm `pending_legal_acknowledgment: true`.
  3. Observe the screen after login.
- Expected result: The re-acknowledgment modal appears. The subscriber must complete the acknowledgment before accessing the dashboard.
- Covers: spec edge case — legacy user with no acknowledgment record

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-09**
- ID: AC-MODAL-09
- Description: No active version published — no gate shown, subscriber reaches dashboard directly
- Preconditions: No row in `legal_document_versions` has `is_active = true`.
- Steps:
  1. Sign in as any subscriber.
  2. Inspect POST `/api/auth/login` response.
  3. Observe what renders.
- Expected result: Login response shows `pending_legal_acknowledgment: false`. Dashboard renders without any legal gate.
- Covers: design section 4 — pending_legal_acknowledgment logic condition 2

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-10**
- ID: AC-MODAL-10
- Description: GET /api/legal/current-version failure during modal load shows error with no bypass
- Preconditions: Subscriber triggers re-acknowledgment modal. Simulate API failure by blocking `/api/legal/current-version` in DevTools → Network → Block request URL.
- Steps:
  1. Block the GET request before logging in.
  2. Log in as the pending subscriber.
  3. Observe the modal state.
- Expected result: The modal renders an error: "Unable to load the legal agreement. Please refresh the page." The subscriber has no way to reach the dashboard. Note: unlike the onboarding step, no Retry button is present (see OBS-4). The subscriber must hard-refresh. Flag the absence of a Retry button.
- Covers: spec edge case — GET current-version unavailable in re-acknowledgment modal

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MODAL-11**
- ID: AC-MODAL-11
- Description: Cross-tab behaviour — acknowledging in one tab does not auto-clear gate in another
- Preconditions: Re-acknowledgment is pending. Two browser tabs are open on the same session.
- Steps:
  1. Open the app in Tab A — modal is visible.
  2. Open the same URL in Tab B (same browser session) — modal is also visible.
  3. In Tab A, complete the acknowledgment.
  4. Switch to Tab B without refreshing.
  5. Observe Tab B.
- Expected result: Tab B still shows the modal after Tab A acknowledges, because state is not synchronised between tabs without a server push. Tab B clears only on manual refresh. Document what is observed. Flag if Tab B renders the dashboard while Tab A's state change is unrelated (unexpected auth desynchronisation).
- Covers: cross-tab exploratory

- [ ] Pass  [ ] Fail  [ ] Blocked

---

## Section C — Admin LegalVersionManager

**Context:** Tests for `LegalVersionManager.tsx` in the admin portal. Write operations require `staff_role = 'owner'`. Read operations are available to all three staff roles.

---

**AC-ADMIN-01**
- ID: AC-ADMIN-01
- Description: Legal section is visible only to staff; Publish button visible only to owner
- Preconditions: Three staff accounts: owner, support, finance. One non-staff subscriber account.
- Steps:
  1. Log in to admin portal as owner — navigate to Legal section. Confirm visible. Confirm "Publish New Version" button is present.
  2. Log in as support staff — navigate to Legal section. Confirm visible. Confirm "Publish New Version" button is NOT present.
  3. Log in as finance staff — same as support.
  4. Attempt to access the Legal section as a non-staff subscriber.
- Expected result: All three staff roles see the Legal section. Only the owner sees the publish button. Non-staff cannot access the section.
- Covers: AC5.1, AC5.2

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-02**
- ID: AC-ADMIN-02
- Description: Publish a new version (v1.1) — full workflow with hash preview
- Preconditions: Logged in as owner. v1.0 is the current active version. At least one subscriber has acknowledged v1.0.
- Steps:
  1. Navigate to Admin Portal → Legal.
  2. Note the current Pending Acknowledgments count.
  3. Click "Publish New Version".
  4. Fill in: version number = "1.1", title = "Risk Disclosure & Indemnification Agreement v1.1", effective date = a valid future date, full text = a meaningful agreement update.
  5. Observe the SHA-256 hash preview field as you type — confirm it updates dynamically and shows a 64-character hex string.
  6. Type "PUBLISH" in the confirmation field.
  7. Confirm "Publish Version" button becomes enabled (changes from disabled grey to red).
  8. Click "Publish Version".
  9. Observe the result.
- Expected result: POST to `/api/platform/legal/versions` succeeds. Success banner: "Version 1.1 published successfully." Form closes. Version history table now shows v1.1 as ACTIVE, v1.0 as superseded. Current Active Version panel updates to v1.1.
- Covers: AC5.3, AC5.4, AC5.7

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-03**
- ID: AC-ADMIN-03
- Description: Pending count increases after publishing v1.1
- Preconditions: AC-ADMIN-02 has completed. At least one subscriber acknowledged v1.0.
- Steps:
  1. After publishing v1.1, observe the Pending Acknowledgments counter.
  2. Compare to the count noted in AC-ADMIN-02 step 2.
- Expected result: Pending count has increased to reflect the number of subscribers who previously acknowledged v1.0. The label reads "N subscribers pending re-acknowledgment" with the current version number displayed.
- Covers: AC6.5

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-04**
- ID: AC-ADMIN-04
- Description: SHA-256 hash preview updates dynamically as agreement text is typed
- Preconditions: Logged in as owner. Publish form is open.
- Steps:
  1. Leave the "Agreement text" field empty. Confirm no hash preview is shown.
  2. Type a single character into the text area. Confirm a 64-character hash preview appears below.
  3. Add more text. Confirm the hash changes.
  4. Clear the field. Confirm the hash preview disappears.
- Expected result: Hash preview is present only when text field is non-empty. It updates on each change (asynchronously via Web Crypto API). Displayed in monospace font in the informational panel.
- Covers: AC5.7

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-05**
- ID: AC-ADMIN-05
- Description: "PUBLISH" typed confirmation gate is case-sensitive and exact
- Preconditions: Publish form is open with all fields filled.
- Steps:
  1. Leave confirmation field empty — confirm "Publish Version" button is disabled.
  2. Type "publish" (lowercase) — confirm button remains disabled.
  3. Type "PUBLIS" (incomplete) — confirm button remains disabled.
  4. Type "PUBLISH" (exact) — confirm button becomes enabled.
  5. Delete one character — confirm button becomes disabled again.
- Expected result: Button enables only on the exact string "PUBLISH". Wrong case or partial string keeps it disabled.
- Covers: Owner safeguard on publish action

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-06**
- ID: AC-ADMIN-06
- Description: Duplicate version number is rejected with a clear error
- Preconditions: v1.1 already exists in `legal_document_versions`.
- Steps:
  1. Open the publish form and enter "1.1" as the version number with valid other fields.
  2. Type "PUBLISH" and click "Publish Version".
  3. Observe the result.
- Expected result: Backend returns 409. Frontend shows: "Version number already exists. Choose a different version number." No new row is inserted. Publish form remains open with entered data intact.
- Covers: spec edge case — duplicate version number

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-07**
- ID: AC-ADMIN-07
- Description: Empty or whitespace-only agreement text is rejected
- Preconditions: Publish form is open.
- Steps:
  1. Fill in version number, title, and effective date. Leave the text area empty.
  2. Type "PUBLISH" and attempt to click "Publish Version".
  3. Observe the result.
  4. Repeat with whitespace-only content (spaces and newlines only) in the text area.
- Expected result: Frontend validation fires before the API call for empty text: `setPublishError('All fields are required.')` is displayed. For whitespace-only, `publishContent.trim()` is falsy and the same frontend error fires. If the frontend is somehow bypassed, the backend returns 422. No version is published.
- Covers: spec edge case — empty full text

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-08**
- ID: AC-ADMIN-08
- Description: Version history table shows all published versions with correct statuses
- Preconditions: Both v1.0 and v1.1 have been published.
- Steps:
  1. Navigate to Admin Portal → Legal → Version History table.
  2. Inspect the rows.
- Expected result: Two rows are shown. v1.1 has the green "ACTIVE" badge. v1.0 has the grey "superseded" badge. v1.1 appears first (ordered by `published_at DESC`). All five columns (Version, Title, Effective Date, Published At, Status) are populated correctly and match the values entered at publish time.
- Covers: AC5.3, AC5.4

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-09**
- ID: AC-ADMIN-09
- Description: Support and finance staff see read-only legal data; no publish button
- Preconditions: Support staff and finance staff accounts are available.
- Steps:
  1. Log in as support staff. Navigate to Legal section. Observe pending count, version history, current active version panels.
  2. Confirm "Publish New Version" button is absent.
  3. Repeat for finance staff.
- Expected result: All read panels are visible and populated. The "Publish New Version" button does not appear in support or finance sessions (the component checks `isOwner` before rendering it).
- Covers: AC5.1, AC5.2

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-10**
- ID: AC-ADMIN-10
- Description: Cancelling out of publish form makes no API call and clears no data
- Preconditions: Publish form is open with some data entered.
- Steps:
  1. Enter partial data (version number only, leave other fields blank).
  2. Click "Cancel".
  3. Observe the UI. Check DevTools → Network for any request fired.
  4. Click "Publish New Version" again.
- Expected result: The form closes. No API call is made. Re-opening the form shows blank fields (form state resets).
- Covers: general UX safety

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-ADMIN-11**
- ID: AC-ADMIN-11
- Description: Publish action creates an audit log entry
- Preconditions: Owner has published v1.1 (AC-ADMIN-02 completed).
- Steps:
  1. In Supabase SQL Editor, run:
     ```sql
     SELECT * FROM platform_audit_log
     WHERE action_type = 'legal_version_publish'
     ORDER BY created_at DESC LIMIT 5;
     ```
  2. Inspect the returned row.
- Expected result: A row exists with `action_type = 'legal_version_publish'`. The `payload` JSON contains the new version number, effective date, text_hash, and the previous active version identifier. The `created_at` timestamp matches the publish time.
- Covers: AC5.6, FR 3.1.4

- [ ] Pass  [ ] Fail  [ ] Blocked

---

## Section D — Audit Trail and Immutability

**Context:** These tests verify the database-level immutability constraints from migration 012. DB tests require Supabase SQL Editor access (service role). RLS tests require a non-service-role client.

---

**AC-DB-01**
- ID: AC-DB-01
- Description: Acknowledgment row is created with all required fields populated
- Preconditions: A subscriber has just completed acknowledgment (AC-ONBOARD-05 or AC-MODAL-04).
- Steps:
  1. In Supabase SQL Editor, run:
     ```sql
     SELECT id, user_id, version_number, document_text_hash,
            acknowledged_at, ip_address, user_agent, created_at
     FROM legal_acknowledgments
     WHERE user_id = '<subscriber_uuid>'
     ORDER BY acknowledged_at DESC
     LIMIT 1;
     ```
  2. Inspect all columns.
- Expected result: Row exists with correct `user_id`, `version_number`, non-null `document_text_hash` (64-char hex), non-null `acknowledged_at` in UTC, non-null `user_agent` matching the test browser. `ip_address` is populated or null (null is acceptable if the test environment does not propagate `x-forwarded-for`).
- Note: Verify column name is `document_text_hash` (spec name) not `content_hash` (frontend name) — this is the OBS-2 field name verification point.
- Covers: AC4.1, AC4.2

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-DB-02**
- ID: AC-DB-02
- Description: document_text_hash in the acknowledgment matches the SHA-256 of the full agreement text
- Preconditions: AC-DB-01 row exists. The `document_text_hash` value is known.
- Steps:
  1. In Supabase SQL Editor, retrieve the document text:
     ```sql
     SELECT full_text, text_hash FROM legal_document_versions
     WHERE version_number = '1.0';
     ```
     Note: column name may be `content_markdown` per frontend — verify actual DB column name.
  2. Copy the `full_text` value.
  3. Compute SHA-256 independently using `printf '%s' '<text>' | sha256sum` in a terminal (using UTF-8, no trailing newline) or an online SHA-256 tool.
  4. Compare computed hash to `text_hash` in the version row and to `document_text_hash` in the acknowledgment row.
- Expected result: All three values match exactly. The hash in the acknowledgment row is a faithful snapshot of the document the subscriber saw.
- Covers: AC4.5

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-DB-03**
- ID: AC-DB-03
- Description: DELETE on legal_acknowledgments is blocked by the immutability trigger
- Preconditions: At least one row exists in `legal_acknowledgments`.
- Steps:
  1. In Supabase SQL Editor (service role), run:
     ```sql
     DELETE FROM legal_acknowledgments
     WHERE id = '<any_acknowledgment_uuid>';
     ```
  2. Observe the error message.
  3. Verify with `SELECT COUNT(*) FROM legal_acknowledgments WHERE id = '<uuid>'` — count should remain 1.
- Expected result: Statement fails with: "legal_acknowledgments rows are immutable and cannot be deleted." Zero rows are deleted.
- Covers: AC4.3, FR 3.4.18

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-DB-04**
- ID: AC-DB-04
- Description: UPDATE on legal_acknowledgments is blocked by the immutability trigger
- Preconditions: At least one row exists in `legal_acknowledgments`.
- Steps:
  1. In Supabase SQL Editor (service role), run:
     ```sql
     UPDATE legal_acknowledgments
     SET ip_address = '1.2.3.4'
     WHERE id = '<any_acknowledgment_uuid>';
     ```
  2. Observe the error message.
- Expected result: Statement fails with: "legal_acknowledgments rows are immutable and cannot be updated." The ip_address value is unchanged.
- Covers: AC4.4, FR 3.4.18

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-DB-05**
- ID: AC-DB-05
- Description: DELETE on legal_document_versions is blocked by the immutability trigger
- Preconditions: At least one superseded (is_active = false) version row exists.
- Steps:
  1. In Supabase SQL Editor (service role), run:
     ```sql
     DELETE FROM legal_document_versions
     WHERE version_number = '1.0';
     ```
  2. Observe the error.
- Expected result: Statement fails with: "legal_document_versions rows are immutable and cannot be deleted."
- Covers: FR 3.1.3

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-DB-06**
- ID: AC-DB-06
- Description: UPDATE of full_text on legal_document_versions is blocked by the immutability trigger
- Preconditions: At least one version row exists.
- Steps:
  1. In Supabase SQL Editor (service role), run:
     ```sql
     UPDATE legal_document_versions
     SET full_text = 'tampered content'
     WHERE version_number = '1.0';
     ```
  2. Observe the error.
- Expected result: Statement fails with: "legal_document_versions.full_text is immutable after insert." The text value is unchanged.
- Covers: FR 3.1.3

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-DB-07**
- ID: AC-DB-07
- Description: RLS blocks a non-service-role subscriber client from deleting their own acknowledgment row
- Preconditions: A subscriber has at least one acknowledgment row. Test uses Supabase REST API with the anon key and the subscriber's JWT.
- Steps:
  1. Using the subscriber's authenticated Supabase client (anon key + JWT, e.g. from the browser console), attempt:
     ```js
     const { error } = await supabase
       .from('legal_acknowledgments')
       .delete()
       .eq('user_id', '<subscriber_uuid>')
     console.log(error)
     ```
  2. Alternatively, send a DELETE via the Supabase REST endpoint with the anon key and Bearer token.
  3. Inspect the error and verify no rows were deleted.
- Expected result: The request is blocked. Either the immutability trigger fires (if the row is reached) or RLS blocks it because no DELETE policy is defined for the `authenticated` role. Zero rows are deleted.
- Covers: AC4.3

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-DB-08**
- ID: AC-DB-08
- Description: Admin subscriber detail view shows legal acknowledgment history correctly
- Preconditions: A subscriber has acknowledged at least two different versions. Logged in to admin portal as owner or support.
- Steps:
  1. Navigate to Admin Portal → Subscribers → select the subscriber.
  2. Scroll to "Legal Acknowledgment History" section.
  3. Click "Load legal history".
  4. Inspect the table.
- Expected result: Each row shows version number, acknowledged_at timestamp (with timezone label), and IP address (or "—" if null). Rows are in most-recent-first order. The table contains all acknowledgment rows for this subscriber, including duplicates if any. Note: user_agent column is currently absent — flag against AC6.2 if it should be present (see OBS-5).
- Covers: AC6.1, AC6.2, AC6.3

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-DB-09**
- ID: AC-DB-09
- Description: Subscriber with no acknowledgment records shows empty history, not an error
- Preconditions: A subscriber exists with no rows in `legal_acknowledgments`.
- Steps:
  1. Navigate to Admin Portal → Subscribers → select this subscriber.
  2. Click "Load legal history".
  3. Observe the result.
- Expected result: The section displays "No acknowledgments on record." — not an error message, not an empty table with headers, and not a blank panel. This tests the `legalHistory.length === 0` branch in `SubscriberDetail.tsx`.
- Covers: AC6.4

- [ ] Pass  [ ] Fail  [ ] Blocked

---

## Section E — Edge Cases and Exploratory

---

**AC-EDGE-01**
- ID: AC-EDGE-01
- Description: Submitting acknowledgment twice returns success, no error, and two rows are retained
- Preconditions: A subscriber has already acknowledged the current active version once.
- Steps:
  1. In the browser console on the authenticated frontend, manually send a second POST:
     ```js
     fetch('/api/legal/acknowledge', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': 'Bearer <jwt_from_network_tab>'
       },
       body: JSON.stringify({ version_id: '<current_version_id>', content_hash: '<content_hash>' })
     }).then(r => r.json()).then(console.log)
     ```
  2. Note the response shape — look for `acknowledged: true` or `already_acknowledged: true`.
  3. In Supabase SQL Editor:
     ```sql
     SELECT COUNT(*) FROM legal_acknowledgments
     WHERE user_id = '<uuid>' AND version_number = '<version>';
     ```
- Expected result: Second POST returns HTTP 200 with a valid success body. Two rows now exist in `legal_acknowledgments` for this subscriber and version. No error is returned to the caller. The UI (if visible) does not display an error.
- Covers: FR 3.4.19, spec edge case — duplicate acknowledgment

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-EDGE-02**
- ID: AC-EDGE-02
- Description: Hard refresh mid-modal resets scroll and checkbox state, modal reappears
- Preconditions: Re-acknowledgment modal is visible. Subscriber has partially scrolled.
- Steps:
  1. Scroll partway through the agreement — not to the bottom.
  2. Hard-refresh the page.
  3. Wait for the page to reload and auth to complete.
  4. Observe the modal state.
- Expected result: The modal reappears. Scroll position resets to the top. The checkbox is disabled again. The subscriber must re-scroll.
- Covers: spec edge case — subscriber clears session mid-acknowledgment

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-EDGE-03**
- ID: AC-EDGE-03
- Description: Injecting a foreign user_id in the acknowledge request body is ignored
- Preconditions: A subscriber is authenticated. A second subscriber's UUID is known.
- Steps:
  1. In the browser console, construct a POST to `/api/legal/acknowledge` with the authenticated subscriber's JWT but with an extra `user_id` field pointing to another subscriber:
     ```js
     fetch('/api/legal/acknowledge', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <jwt>' },
       body: JSON.stringify({
         version_id: '<version_id>',
         content_hash: '<hash>',
         user_id: '<other_subscriber_uuid>'
       })
     }).then(r => r.json()).then(console.log)
     ```
  2. In Supabase SQL Editor, check which `user_id` is on the new acknowledgment row.
- Expected result: The acknowledgment row is created for the JWT owner's UUID, not the injected UUID. The extra `user_id` field in the body is either ignored or rejected (AC7.1). The other subscriber's record is unaffected.
- Covers: AC7.1

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-EDGE-04**
- ID: AC-EDGE-04
- Description: No admin UI action exists to mark a subscriber as acknowledged or clear their pending status
- Preconditions: Logged in to admin portal as owner.
- Steps:
  1. In the subscriber detail page, check all sections for any "Mark as Acknowledged", "Clear Pending", "Override", or equivalent action.
  2. In the LegalVersionManager, check for any per-subscriber override action.
  3. Inspect the network calls made by the admin portal for any write call to `legal_acknowledgments` on behalf of another user.
- Expected result: No such action exists in the UI. No admin endpoint inserts an acknowledgment on behalf of a subscriber.
- Covers: AC7.2, AC7.3

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-EDGE-05**
- ID: AC-EDGE-05
- Description: POST /api/legal/acknowledge without a valid JWT is rejected with 401
- Preconditions: No active session. Access to a tool that can send raw HTTP requests (curl or browser console before login).
- Steps:
  1. Send a POST to `/api/legal/acknowledge` with no Authorization header:
     ```
     curl -X POST https://<backend>/api/legal/acknowledge \
       -H "Content-Type: application/json" \
       -d '{"version_id":"<any-uuid>","content_hash":"abc"}'
     ```
  2. Observe the response code and body.
- Expected result: Response is 401 Unauthorized. No acknowledgment row is created.
- Covers: AC FR 3.2.27

- [ ] Pass  [ ] Fail  [ ] Blocked

---

## Section F — Mobile Viewport

**Context:** All mobile tests run at 375px wide (iPhone SE) and 390px wide (iPhone 14), using browser DevTools device simulation with touch events enabled.

---

**AC-MOB-01**
- ID: AC-MOB-01
- Description: Re-acknowledgment modal is usable and fully visible on 375px viewport
- Preconditions: Re-acknowledgment modal is pending. DevTools set to 375x667 (iPhone SE).
- Steps:
  1. Set DevTools to 375px wide, 667px tall, mobile user agent.
  2. Log in as a pending subscriber.
  3. Observe the modal layout — check for horizontal overflow, clipped text, or overlapping elements.
  4. Scroll the agreement text using touch simulation.
  5. Tap the checkbox after scrolling to bottom.
  6. Tap "I Agree & Continue".
- Expected result: The modal card fits within the viewport (12px padding on mobile per `isMobile ? '12px' : '24px'`). Text is readable at 13px. The scrollable container is operable via simulated touch. The checkbox is at least 16x16px. The full-width button is easily tappable (44px effective tap height with padding). No horizontal scroll is needed.
- Covers: AC3.4 (mobile), AC3.5 (mobile), AC3.6 (mobile)

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MOB-02**
- ID: AC-MOB-02
- Description: Onboarding legal step is usable on 375px viewport
- Preconditions: New subscriber in onboarding on 375px viewport.
- Steps:
  1. Set DevTools to 375px.
  2. Select a plan. Observe the legal step layout.
  3. Verify the text area height is 40vh (approximately 267px) — meaningful but still requires scrolling.
  4. Confirm the step progress indicator fits without horizontal overflow — dots use 16px connectors on mobile.
  5. Complete the full flow (scroll, check, agree).
- Expected result: Layout is correct at 375px. No horizontal overflow. Text is legible. Step indicator is readable. The flow completes successfully on mobile dimensions.
- Covers: AC1.2, AC1.3 (mobile)

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MOB-03**
- ID: AC-MOB-03
- Description: Admin LegalVersionManager is usable on mobile (basic layout check)
- Preconditions: Logged in to admin portal as owner on a 375px viewport.
- Steps:
  1. Set DevTools to 375px.
  2. Navigate to Legal section.
  3. Observe the Version History table — confirm `overflowX: auto` allows horizontal scrolling within the table.
  4. Open the Publish form — confirm fields stack vertically, text area is usable, SHA-256 hash preview wraps with `wordBreak: 'break-all'`.
  5. Confirm Cancel and Publish buttons wrap or stack correctly.
- Expected result: No content is permanently hidden or inaccessible on mobile. Table scrolls horizontally within its container. Form is fully operable.
- Covers: admin mobile layout (exploratory)

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-MOB-04**
- ID: AC-MOB-04
- Description: iOS-style pull-to-refresh gesture does not dismiss the re-acknowledgment modal
- Preconditions: Re-acknowledgment modal visible. Using Chrome mobile simulation with touch events.
- Steps:
  1. On a mobile device or DevTools touch simulation, attempt a downward pull gesture on the modal overlay (mimicking iOS pull-to-refresh).
  2. Attempt horizontal swipe on the modal card.
- Expected result: The modal does not close or move. A pull-to-refresh that triggers a browser-level page reload will cause the page to reload and show the modal again on re-login — this is acceptable. The modal is never dismissed by a swipe alone.
- Covers: AC3.3 (mobile gesture bypass)

- [ ] Pass  [ ] Fail  [ ] Blocked

---

## Section G — Legal Document Content Review

**Context:** Human readability and completeness check. No automated test can perform this review.

---

**AC-CONTENT-01**
- ID: AC-CONTENT-01
- Description: Agreement text contains no unfilled placeholder values
- Preconditions: v1.0 (or first published version) is active and displayable in the gate.
- Steps:
  1. Trigger the legal gate and read the full agreement text — scroll from top to bottom.
  2. Search for the following placeholder strings: `[COMPANY NAME]`, `[STATE]`, `[EFFECTIVE DATE]`, `[DATE]`, `[YOUR NAME]`, `[ADDRESS]`, `[INSERT`, `[TBD]`, `[TO BE`, `__________`, `Lorem ipsum`, `XYZ Inc`.
  3. Note any occurrence of these strings.
- Expected result: Zero placeholder strings are found. All blanks are replaced with real entity names, dates, and jurisdictions. If any placeholder is found, this is a CRITICAL finding — the feature must not go live.
- Covers: pre-launch content quality check (legal risk)

- [ ] Pass  [ ] Fail  [ ] Blocked — CRITICAL if any placeholder found

---

**AC-CONTENT-02**
- ID: AC-CONTENT-02
- Description: Agreement contains all required legal sections and renders legibly
- Preconditions: Same as AC-CONTENT-01.
- Steps:
  1. Read through the full agreement text.
  2. Confirm the document has a logical structure (numbered sections or headed clauses).
  3. Confirm the document includes at minimum: a preamble/introduction, a risk disclosure clause, an indemnification clause, a limitation of liability clause, a governing law/jurisdiction clause, and an acceptance/effective date statement.
  4. Check whether markdown formatting characters (##, **, *, ---) appear as literal characters in the `<pre>` rendered text — flag if the document was authored in markdown but renders raw syntax.
- Expected result: The document is complete and legible. No sections are missing or truncated. If markdown characters appear as literal text, confirm with the author whether plain-text format is intentional.

- [ ] Pass  [ ] Fail  [ ] Blocked

---

**AC-CONTENT-03**
- ID: AC-CONTENT-03
- Description: Version number and effective date shown in the modal header match the published record
- Preconditions: v1.0 is the active version.
- Steps:
  1. Observe the subtitle text beneath the modal title.
  2. Note the displayed version number and effective date.
  3. In Supabase SQL Editor, run:
     ```sql
     SELECT version_number, effective_date FROM legal_document_versions
     WHERE is_active = true;
     ```
  4. Compare.
- Expected result: Displayed version number and effective date match the database values exactly.
- Covers: AC3.2 (version number clearly labeled)

- [ ] Pass  [ ] Fail  [ ] Blocked

---

## Summary — scenarios that Playwright automated tests cannot realistically cover

| Test ID | Reason Playwright cannot cover it |
|---------|------------------------------------|
| AC-ONBOARD-10 | Rapid double-tap at 200ms timing — Playwright's `click()` calls have built-in sequential execution and cannot simulate true concurrent double-taps at hardware speed |
| AC-MODAL-06 | Requires two concurrent browser sessions with coordinated timing; the race condition window is milliseconds |
| AC-MOB-04 | iOS pull-to-refresh is a native OS gesture not reliably reproducible in Playwright's desktop Chromium context |
| AC-DB-01 through AC-DB-09 | Require direct Supabase SQL Editor access; Playwright tests do not have DB access |
| AC-EDGE-03 | Requires manually constructed HTTP request with injected body fields not present in the normal UI flow |
| AC-CONTENT-01 | Content quality — placeholder detection requires human reading and legal judgement |
| AC-CONTENT-02 | Document completeness and legal section structure require human evaluation |
| AC-MODAL-05 (keyboard) | Tab-key focus traversal through a fixed overlay requires manual keyboard testing and screen reader verification |
| AC-MODAL-11 | Cross-tab state synchronisation timing is non-deterministic in automated environments |

---

## Pre-recorded findings (from code review, before live test execution)

| Finding ID | Severity | Related test | Description |
|------------|----------|--------------|-------------|
| FIND-001 | Major | AC-MODAL-05 | `LegalAcknowledgmentGate` is rendered as a sibling *after* `<Dashboard />` in `App.tsx`, not instead of it. The dashboard DOM is live while the gate is visible. No explicit focus trap is coded. Keyboard users may Tab into dashboard elements behind the overlay — potential accessibility bypass path. |
| FIND-002 | Minor | AC-DB-01, AC-DB-02 | Field names diverge: spec/design use `document_text_hash`, `full_text`, `text_hash`; frontend `client.ts` uses `content_hash`, `content_markdown`. If the backend uses spec field names, the gate will show blank text and submit an undefined hash. Verify backend response field names match the frontend's `LegalVersion` interface before sign-off. |
| FIND-003 | Minor | AC-MODAL-10 | `LegalAcknowledgmentGate.tsx` has no Retry button on fetch error. Subscriber must hard-refresh the page to retry. `LegalAcknowledgmentStep` in `OnboardingFlow.tsx` does have a Retry button. Inconsistent UX within the same feature. |
| FIND-004 | Minor | AC-DB-08 | `SubscriberDetail.tsx` legal history table omits the `user_agent` column required by AC6.2. Either the spec acceptance criterion is unmet or the column was intentionally omitted and the AC should be updated. |
| FIND-005 | Cosmetic | AC-ONBOARD-06 | The four-step progress indicator always includes the `payment` step, visible to free-tier subscribers who will never visit a payment screen. Spec / design states free-tier ordering should skip payment. May confuse free-tier users. |

_Additional findings will be recorded in this table during live test execution._

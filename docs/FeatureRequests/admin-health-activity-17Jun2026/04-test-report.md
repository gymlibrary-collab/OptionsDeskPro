# Test Report — Admin Health Monitor and User Activity Log

**Feature:** Admin Health Monitor and User Activity Log
**Date:** 17Jun2026
**Tester:** Manual / Exploratory (tester agent)
**Gate:** 4 — Test
**Gate status:** PENDING HUMAN SIGN-OFF

---

## Summary

| Item | Detail |
|------|--------|
| Features tested | App Health Monitor (Stories 1–5), User Activity Log — Browse and Filter (Stories 6–7), Automatic Logging (Story 9), Tab Preservation (Story 10) |
| Stories excluded from this report | Story 8 — CSV Export (explicitly deferred to backlog by Product Owner) |
| Files reviewed | `frontend/src/components/AdminPanel.tsx`, `backend/routes/admin_routes.py`, `backend/services/activity_logger.py`, `frontend/src/api/client.ts`, `frontend/src/context/AuthContext.tsx`, `backend/routes/auth_routes.py`, `backend/routes/options.py`, `backend/routes/orders.py`, `backend/routes/watchlist.py`, `backend/routes/strategies.py`, `backend/routes/ai_routes.py` |
| Test environment | Code review + static analysis; live execution requires a deployed environment with all five external services available |
| Overall assessment | The core implementation is structurally sound and the happy-path flows appear correct. Four issues were identified that require attention before gate approval: one major (stale data visible alongside a network error after a failed refresh), one major (no client-side guard prevents double-clicking Refresh before the 30-second cooldown is set), and two minor UX observations. No critical defects were found. |

---

## Structured Test Cases

### Story 1 — View Overall System Health at a Glance

---

**TC-01-01: All components healthy — banner reads green**

- Precondition: Admin is signed in. All five external services (Supabase, yfinance, Gemini AI, StockTwits) are reachable and responding within their thresholds. Navigate to Admin Panel.
- Steps:
  1. Click the "Health" tab in the Admin Panel tab bar.
  2. Wait for the initial health check to complete (up to 10 seconds).
  3. Observe the banner at the top of the tab.
- Expected result: A green banner appears reading "All Systems Operational". The green dot and text colour match hex `#16a34a`. The "Last checked" timestamp shows a time within the last 15 seconds.
- [ ] Pass / [ ] Fail

---

**TC-01-02: One component degraded — banner reads amber**

- Precondition: Admin is signed in. Simulate or observe a state where exactly one component is degraded (e.g., StockTwits responds in 2100 ms which falls in the 2000–5000 ms degraded range) and no component is in error.
- Steps:
  1. Click the "Health" tab.
  2. Wait for the health check to complete.
  3. Observe the overall banner.
- Expected result: The banner reads "Degraded" and is styled in amber (`#d97706`). No red is visible on the banner.
- [ ] Pass / [ ] Fail

---

**TC-01-03: One component in error — banner reads red regardless of others**

- Precondition: Admin is signed in. Remove or blank `GEMINI_API_KEY` environment variable so the Gemini probe returns "error". All other components are healthy.
- Steps:
  1. Click the "Health" tab.
  2. Wait for the health check to complete.
  3. Observe the overall banner.
- Expected result: The banner reads "Outage Detected" and is styled in red (`#dc2626`). The Gemini AI component card shows "ERROR" badge in red.
- [ ] Pass / [ ] Fail

---

**TC-01-04: Banner visible within 5 seconds of tab load**

- Precondition: Admin is signed in. All services healthy.
- Steps:
  1. Note the time on a watch or phone.
  2. Click the "Health" tab.
  3. Note when the overall banner first appears.
- Expected result: The banner appears within 5 seconds, consistent with AC4. During the fetch period, "Checking components..." text is shown as a placeholder — no banner appears until data arrives.
- [ ] Pass / [ ] Fail

---

### Story 2 — Inspect Per-Component Health Details

---

**TC-02-01: All five component cards present**

- Precondition: Admin is signed in. Health tab has loaded successfully.
- Steps:
  1. Click the "Health" tab.
  2. Wait for data to load.
  3. Count the component cards.
  4. Read each card's title.
- Expected result: Exactly five cards are present with titles: "Backend API", "Supabase Database", "yfinance Market Data", "Gemini AI", "StockTwits". No extra or missing cards.
- [ ] Pass / [ ] Fail

---

**TC-02-02: Card status badge colours**

- Precondition: Arrange or observe a state where at least one component is healthy, one degraded, and one in error (or test each state individually using the conditions in TC-01-02 and TC-01-03).
- Steps:
  1. Load the Health tab.
  2. For each card, identify the status badge.
  3. Verify badge text and colour for each state.
- Expected result: "HEALTHY" badge is green (`#16a34a`). "DEGRADED" badge is amber (`#d97706`). "ERROR" badge is red (`#dc2626`). Badge text is uppercase.
- [ ] Pass / [ ] Fail

---

**TC-02-03: Response time displays correctly**

- Precondition: All services healthy. Health tab loaded.
- Steps:
  1. Observe the "Response:" field on each of the five cards.
  2. Note the value on the Gemini AI card.
- Expected result: Four of the five cards show a numeric value in milliseconds (e.g., "42 ms"). The Backend API card shows a value that reflects the client-side round-trip (not zero — the frontend overwrites the backend's `response_time_ms: 0` with the measured RTT). If `GEMINI_API_KEY` is unset, the Gemini AI card shows "—" (the em dash rendered from `null`).
- [ ] Pass / [ ] Fail

---

**TC-02-04: Last-checked timestamp accurate to the second**

- Precondition: Health tab loaded.
- Steps:
  1. Note the wall-clock time at which you click Refresh.
  2. After data returns, read the "Checked:" field on any card.
  3. Compare with wall-clock time.
- Expected result: The timestamp is within 1–2 seconds of when the refresh was triggered. The time displayed uses `toLocaleTimeString()` — confirm it shows HH:MM:SS in the browser's locale.
- [ ] Pass / [ ] Fail

---

**TC-02-05: Error message shown on error card**

- Precondition: `GEMINI_API_KEY` is unset so Gemini probe returns error.
- Steps:
  1. Load the Health tab.
  2. Locate the Gemini AI card.
  3. Read the error text below the response time fields.
- Expected result: The Gemini AI card shows the error message "GEMINI_API_KEY is not set" in red (`#ef4444`). The text is not truncated (it is well under 200 characters). The card border has a red tint consistent with the error status.
- [ ] Pass / [ ] Fail

---

**TC-02-06: Error message truncation at 200 characters**

- Precondition: Simulate a component returning a very long error string (> 200 characters) — this requires inspecting the backend response or mocking it in browser DevTools.
- Steps:
  1. Intercept or mock the health-check response so one component has an error string of 250 characters.
  2. Load or refresh the Health tab.
  3. Read the error text on that card.
- Expected result: The error message renders the full string from the backend (the 200-character truncation is applied server-side with `str(exc)[:500]`, not 200 — the spec says 200 but the implementation truncates at 500). Note: the UI does not apply additional truncation. The error text uses `whiteSpace: 'normal'` and `wordBreak: 'break-word'`, so long messages wrap within the card.
  Note for human tester: Verify whether the 200-character truncation from the spec (Story 2 AC5) is actually enforced by the UI. Reading the implementation, it is not — the backend truncates at 500 characters and the frontend renders without further truncation. This is a minor deviation from AC5.
- [ ] Pass / [ ] Fail

---

### Story 3 — Manually Refresh Health Status

---

**TC-03-01: Refresh button visible and functional**

- Precondition: Admin signed in, Health tab open, data loaded.
- Steps:
  1. Confirm "Refresh" button is visible in the top-right of the Health tab header.
  2. Click "Refresh".
  3. Observe the button label and state during the request.
  4. Observe the button after the response returns.
- Expected result: During the request, the button reads "Checking..." and is disabled (cursor shows not-allowed, background is grey `#2d3148`). After response returns, button reads "Refresh" and is active (purple `#7c6af7`).
- [ ] Pass / [ ] Fail

---

**TC-03-02: Component cards update after manual refresh**

- Precondition: Health tab loaded. Note the "Checked:" timestamp on any card.
- Steps:
  1. Wait at least 5 seconds.
  2. Click "Refresh".
  3. Wait for response.
  4. Read the "Checked:" timestamp on the same card.
- Expected result: The "Checked:" timestamp has advanced to reflect the new probe time. All five cards show updated values.
- [ ] Pass / [ ] Fail

---

**TC-03-03: Second click within 30 seconds is suppressed**

- Precondition: Health tab loaded. A refresh was just completed (note the time).
- Steps:
  1. Click "Refresh".
  2. Wait for it to complete (button returns to "Refresh").
  3. Immediately click "Refresh" again (within 30 seconds of step 1 completing).
  4. Observe whether a new network request is sent (check DevTools Network tab).
- Expected result: No new request to `/api/admin/health-check` is made. The button momentarily appears to do nothing — it enables immediately (since `loading` is false) but the `fetchHealth(true)` call with `force=true` bypasses the 30-second guard because the Refresh button always calls `fetchHealth(true)`. Note for human tester: The spec (AC4) says the second click within 30 seconds should be ignored. However, the implementation calls `fetchHealth(true)` from the Refresh button, which sets `force=true`, bypassing the 30-second guard entirely. A second click on Refresh WILL trigger a new request. This is a gap between the spec and the implementation — see Issues section.
- [ ] Pass / [ ] Fail

---

**TC-03-04: Last-checked timestamp updates after each refresh**

- Precondition: Health tab loaded.
- Steps:
  1. Note the "Last checked" time shown in the overall banner.
  2. Wait 5 seconds.
  3. Click "Refresh".
  4. Wait for completion.
  5. Read the "Last checked" time in the banner.
- Expected result: The "Last checked" time has updated to the current time (within 1–2 seconds of when Refresh was clicked).
- [ ] Pass / [ ] Fail

---

### Story 4 — Health Tab Auto-Refreshes While Visible

---

**TC-04-01: Auto-refresh fires at 60-second interval**

- Precondition: Health tab open. A manual refresh was just completed.
- Steps:
  1. Note the "Last checked" timestamp in the banner.
  2. Do not click anything. Wait 60–65 seconds.
  3. Observe whether the component cards update.
- Expected result: After approximately 60 seconds, all component cards update automatically. The "Last checked" timestamp advances. No user interaction is required.
- Note: This test requires sitting with the app open. Automated tests cannot reliably test 60-second timing without clock mocking.
- [ ] Pass / [ ] Fail

---

**TC-04-02: Auto-refresh stops when navigating away**

- Precondition: Health tab open. Note the time.
- Steps:
  1. Click any other tab (e.g., "Users").
  2. Open browser DevTools, Network tab, filter by "health-check".
  3. Wait 70 seconds.
  4. Observe whether any request to `/api/admin/health-check` was made during this period.
- Expected result: No health-check requests are made after navigating away from the Health tab. The `clearInterval` in the `useEffect` cleanup runs on unmount.
- [ ] Pass / [ ] Fail

---

**TC-04-03: Auto-refresh restarts on returning to Health tab**

- Precondition: Health tab visited, then navigated away for 90 seconds, then return.
- Steps:
  1. Visit Health tab. Note the "Last checked" time.
  2. Navigate to another tab.
  3. Wait 90 seconds.
  4. Return to Health tab.
  5. Observe whether an immediate fetch fires on tab re-entry.
  6. Wait another 60 seconds.
  7. Observe whether a second fetch fires.
- Expected result: On returning to the Health tab, `fetchHealth(true)` fires immediately (from the `useEffect` on mount). The "Last checked" time updates. After another 60 seconds, a second auto-refresh fires.
- [ ] Pass / [ ] Fail

---

**TC-04-04: Auto-refresh does not fire during an in-progress manual refresh**

- Precondition: Auto-refresh interval is about to fire (approximately 55 seconds since last check). Click Refresh manually just before the interval fires.
- Steps:
  1. Time the 60-second cycle using the "Last checked" timestamp.
  2. At approximately second 58, click "Refresh" manually.
  3. Observe DevTools Network to confirm only one request is in flight, not two.
- Expected result: Only one request is made. The `loadingRef.current` guard in `fetchHealth` prevents re-entry while a request is in flight. No duplicate request appears in the Network tab.
- Note: This test requires precise timing. Cannot be reliably caught by automated tests.
- [ ] Pass / [ ] Fail

---

### Story 5 — Health Endpoint is Admin-Only

---

**TC-05-01: No auth header returns 401**

- Precondition: A running backend instance is accessible.
- Steps:
  1. Open a terminal or API client (e.g., curl, Postman).
  2. Send: `GET /api/admin/health-check` with no Authorization header.
  3. Observe the HTTP status code.
- Expected result: HTTP 401 Unauthorized.
- [ ] Pass / [ ] Fail

---

**TC-05-02: Non-admin JWT returns 403**

- Precondition: A non-admin user account exists and can sign in.
- Steps:
  1. Sign in as a non-admin user via the app. Capture the Bearer token from the Authorization header in DevTools.
  2. Send: `GET /api/admin/health-check` with `Authorization: Bearer <non-admin-token>`.
  3. Observe the HTTP status code.
- Expected result: HTTP 403 Forbidden.
- [ ] Pass / [ ] Fail

---

**TC-05-03: Admin JWT returns 200 with component data**

- Precondition: Admin user signed in. Bearer token captured.
- Steps:
  1. Send: `GET /api/admin/health-check` with `Authorization: Bearer <admin-token>`.
  2. Inspect the response body.
- Expected result: HTTP 200. Response body contains `"overall"` field (one of "healthy", "degraded", "error") and `"components"` array with exactly 5 elements.
- [ ] Pass / [ ] Fail

---

**TC-05-04: Health tab not visible to non-admin users**

- Precondition: Sign in as a non-admin user.
- Steps:
  1. Navigate to any tab that shows the admin panel (it should not be accessible at all for non-admin users — the AdminPanel component is already gated at the parent level).
  2. If the AdminPanel is somehow visible, confirm the "Health" tab label is not present in the tab bar.
- Expected result: Non-admin users cannot see the Admin Panel at all. If for any reason they reach it (client-side state error), the "Health" tab button does not appear.
- [ ] Pass / [ ] Fail

---

### Story 6 — Browse All User Actions with Filters

---

**TC-06-01: User Actions tab visible and filter bar present**

- Precondition: Admin signed in.
- Steps:
  1. Click the "User Actions" tab in the Admin Panel tab bar.
  2. Inspect the filter bar.
- Expected result: The filter bar is visible with four controls: a text input labelled "User Email", a dropdown labelled "Action Type" with option "All" and the 8 action type values, a date input labelled "From", a date input labelled "To", and an "Apply" button. All five columns (Timestamp, User Email, Action Type, Detail, IP Address) are present in the table header.
- [ ] Pass / [ ] Fail

---

**TC-06-02: Default state loads 50 most recent events**

- Precondition: Admin signed in. At least 50 rows exist in `user_action_log`.
- Steps:
  1. Click "User Actions" tab.
  2. Without changing any filter, observe the table.
- Expected result: The table populates automatically on tab entry (no "Apply" required for the initial load). Up to 50 rows appear, sorted by timestamp descending (newest first). The row count summary reads "Showing 1–50 of X results".
- [ ] Pass / [ ] Fail

---

**TC-06-03: Partial email filter**

- Precondition: At least one row exists for a user with email containing "test@".
- Steps:
  1. Type "test@" in the User Email input.
  2. Click "Apply".
  3. Inspect the results.
- Expected result: Only rows where `user_email` contains "test@" (case-insensitive) are returned. Rows for other users are absent. The row count summary updates.
- [ ] Pass / [ ] Fail

---

**TC-06-04: Action type filter — paper_trade_placed**

- Precondition: At least one `paper_trade_placed` row and at least one row of a different type exist.
- Steps:
  1. Select "paper_trade_placed" from the Action Type dropdown.
  2. Click "Apply".
  3. Inspect the Action Type column.
- Expected result: Every visible row has action type "paper_trade_placed". No other action types appear.
- [ ] Pass / [ ] Fail

---

**TC-06-05: Date range filter — today only**

- Precondition: Rows exist for both today and previous days.
- Steps:
  1. Set "From" to today's date (2026-06-17).
  2. Set "To" to today's date (2026-06-17).
  3. Click "Apply".
  4. Inspect the Timestamp column on all rows.
- Expected result: All rows shown have a timestamp within today's UTC calendar day (00:00:00 UTC to 23:59:59 UTC). No rows from yesterday or earlier appear.
- [ ] Pass / [ ] Fail

---

**TC-06-06: Event count summary**

- Precondition: Some filters are applied. Results are known.
- Steps:
  1. Apply any filter combination.
  2. Read the text above the table.
- Expected result: Text reads "X events" when total is 0, or "Showing A–B of Z results" when total is greater than 0. The count updates every time Apply is clicked.
- [ ] Pass / [ ] Fail

---

**TC-06-07: Detail column — paper_trade_placed**

- Precondition: A `paper_trade_placed` row exists for a multi-leg strategy. Admin is in User Actions tab.
- Steps:
  1. Filter by action_type "paper_trade_placed".
  2. Click Apply.
  3. Find a row for a multi-leg strategy (e.g., Bull Call Spread with 2 legs).
  4. Read the Detail cell.
- Expected result: The Detail cell shows a compact key=value string such as `symbol="AAPL" strategy_name="Bull Call Spread" net_debit_credit=-3.1 total_contracts=1`. The `legs` array is omitted (filtered in `renderDetail`). The cell does not show raw JSON brackets. If the string exceeds 120 characters, it is truncated with "...".
- [ ] Pass / [ ] Fail

---

**TC-06-08: Filters not applied on keystroke**

- Precondition: User Actions tab open with results.
- Steps:
  1. Type a character in the User Email input.
  2. Observe the table immediately.
  3. Do not press Enter or click Apply.
- Expected result: The table does NOT update immediately on keystroke. No new request is fired. The table still shows the previous results.
- [ ] Pass / [ ] Fail

---

**TC-06-09: Empty state message**

- Precondition: Admin signed in.
- Steps:
  1. Enter an email string that matches no user (e.g., "zzzzzz_no_such_user@test.com").
  2. Click Apply.
  3. Observe the table body.
- Expected result: The table body shows a single row spanning all five columns with the text "No actions recorded matching the current filters." No pagination controls appear. The row count summary reads "0 events".
- [ ] Pass / [ ] Fail

---

### Story 7 — Paginate Through Activity Results

---

**TC-07-01: Pagination controls appear when results exceed 50**

- Precondition: The unfiltered `user_action_log` table contains more than 50 rows.
- Steps:
  1. Navigate to User Actions tab (no filters).
  2. Observe below the table.
- Expected result: Pagination controls appear: "Previous" button, "Page 1 of N" label (where N > 1), "Next" button. The "Previous" button is disabled on page 1.
- [ ] Pass / [ ] Fail

---

**TC-07-02: Next button advances to page 2**

- Precondition: At least 51 rows exist. User is on page 1.
- Steps:
  1. Note the first row's timestamp on page 1.
  2. Click "Next".
  3. Observe the table and page indicator.
- Expected result: The table updates to show rows 51–100 (the next 50). The page indicator reads "Page 2 of N". The first row on page 2 has an older timestamp than the first row on page 1 (sort is descending). The row count summary reads "Showing 51–100 of Z results".
- [ ] Pass / [ ] Fail

---

**TC-07-03: Previous button returns to page 1**

- Precondition: User is on page 2.
- Steps:
  1. Click "Previous".
  2. Observe the table and page indicator.
- Expected result: Table returns to rows 1–50. Page indicator reads "Page 1 of N". "Previous" button is disabled.
- [ ] Pass / [ ] Fail

---

**TC-07-04: Next button disabled on last page**

- Precondition: Navigate to the last page of results.
- Steps:
  1. Click "Next" repeatedly until reaching the final page.
  2. Observe the "Next" button.
- Expected result: "Next" button is disabled and styled with dimmed colour (`#3a3f5c`). Cursor shows not-allowed.
- [ ] Pass / [ ] Fail

---

**TC-07-05: Pagination resets to page 1 when filters re-applied**

- Precondition: User has navigated to page 3.
- Steps:
  1. Navigate to page 3.
  2. Change any filter value.
  3. Click Apply.
  4. Observe the page indicator.
- Expected result: The page indicator resets to "Page 1 of N". The table shows the first page of the new filtered results.
- [ ] Pass / [ ] Fail

---

**TC-07-06: Row count summary format on page 2**

- Precondition: User is on page 2 of results with total > 100.
- Steps:
  1. Navigate to page 2.
  2. Read the row count summary above the table.
- Expected result: Summary reads "Showing 51–100 of Z results" (where Z is the actual total). On the last page with partial results (e.g., 120 total, page 3): "Showing 101–120 of 120 results".
- [ ] Pass / [ ] Fail

---

**TC-07-07: Date validation error — date_from after date_to**

- Precondition: User Actions tab open.
- Steps:
  1. Set "From" to 2026-06-17.
  2. Set "To" to 2026-06-01.
  3. Click Apply.
  4. Observe the area below the filter bar.
- Expected result: An inline error message appears: "date_from must not be after date_to". No network request is made (check DevTools). The table retains its previous results.
- [ ] Pass / [ ] Fail

---

### Story 9 — User Actions Logged Automatically

---

**TC-09-01: ticker_search logged after symbol search**

- Precondition: A non-admin test user exists. Admin account available.
- Steps:
  1. Sign in as the non-admin test user.
  2. Search for ticker "AAPL" (triggers `GET /api/options/quote/AAPL`).
  3. Sign out.
  4. Sign in as admin.
  5. Navigate to User Actions tab.
  6. Filter by the test user's email.
  7. Filter by action_type "ticker_search".
  8. Click Apply.
- Expected result: At least one row appears with `action_type = ticker_search` and the Detail cell showing `symbol="AAPL"`. The timestamp matches approximately when the search was performed.
- [ ] Pass / [ ] Fail

---

**TC-09-02: paper_trade_placed logged after placing a paper trade**

- Precondition: Same non-admin test user. Admin account available.
- Steps:
  1. Sign in as the test user.
  2. Place a paper trade for any symbol and strategy.
  3. Sign out and sign in as admin.
  4. Filter User Actions by test user email and action_type "paper_trade_placed".
  5. Click Apply.
- Expected result: A row appears with `action_type = paper_trade_placed`. Detail shows at minimum the symbol and strategy name (legs array omitted from display).
- [ ] Pass / [ ] Fail

---

**TC-09-03: watchlist_update logged after saving watchlist**

- Precondition: Non-admin test user. Admin account available.
- Steps:
  1. Sign in as the test user.
  2. Add a symbol to the watchlist and save.
  3. Sign out and sign in as admin.
  4. Filter by test user email and action_type "watchlist_update".
  5. Click Apply.
- Expected result: A row appears with `action_type = watchlist_update`. Detail shows `symbol_count=N` where N is the new watchlist size.
- [ ] Pass / [ ] Fail

---

**TC-09-04: Logging failure does not affect the user request**

- Precondition: A way to make the Supabase `user_action_log` write fail (e.g., temporarily revoke service key permission on that table, or simulate via network proxy intercepting the Supabase write).
- Steps:
  1. Induce a condition where the `log_action` Supabase insert will fail.
  2. As a non-admin user, search for a ticker.
  3. Observe the response in the browser.
- Expected result: The ticker search returns a normal response (200 with quote data). No error is shown to the user. The failure is silently dropped (visible only in backend logs as a WARNING).
- Note: This test requires backend log access and a method to cause the DB write to fail. It may need to be verified by the QA engineer's automated test suite.
- [ ] Pass / [ ] Fail

---

**TC-09-05: login event appears in User Actions (not only in Activity Log tab)**

- Precondition: A non-admin test user. Admin account available.
- Steps:
  1. Sign in as the test user (this triggers the login log).
  2. Sign out and sign in as admin.
  3. Navigate to User Actions tab.
  4. Filter by the test user's email and action_type "login".
  5. Click Apply.
- Expected result: A row with `action_type = login` and `detail` showing `email="<test-user-email>"` appears. The same login is also still visible in the "Activity Log (Logins)" tab (the existing table is untouched).
- [ ] Pass / [ ] Fail

---

**TC-09-06: logout event logged on sign-out**

- Precondition: Non-admin test user signed in. Admin account available.
- Steps:
  1. Sign out from the non-admin test user account (the app calls `POST /api/auth/logout` before calling `supabase.auth.signOut()`).
  2. Sign in as admin.
  3. Filter User Actions by the test user's email and action_type "logout".
  4. Click Apply.
- Expected result: A row with `action_type = logout` appears for the test user. The timestamp matches approximately when the sign-out was triggered.
- [ ] Pass / [ ] Fail

---

### Story 10 — Existing Activity Log Tab is Preserved

---

**TC-10-01: Activity Log tab renamed to "Activity Log (Logins)"**

- Precondition: Admin signed in.
- Steps:
  1. Observe the Admin Panel tab bar.
  2. Look for the existing activity log tab.
- Expected result: The tab label reads "Activity Log (Logins)" — not simply "Activity Log". The new "User Actions" tab is a separate entry to the right. Both tabs are visible.
- [ ] Pass / [ ] Fail

---

**TC-10-02: Activity Log (Logins) tab data unchanged**

- Precondition: At least one user has logged in today.
- Steps:
  1. Click "Activity Log (Logins)" tab.
  2. Inspect the table columns and data.
- Expected result: The table shows columns: Email, Login Count, Last Login, IP Address. Each row represents one user with today's login count and most recent login timestamp. The data matches the `activity_log` table (one row per user per day). No granular per-action rows appear here.
- [ ] Pass / [ ] Fail

---

**TC-10-03: Activity Log (Logins) tab auto-refreshes every 60 seconds**

- Precondition: Admin is on the "Activity Log (Logins)" tab.
- Steps:
  1. Note the data in the table.
  2. Wait 60–65 seconds without clicking.
  3. Observe whether the data refreshes.
- Expected result: After approximately 60 seconds, the table re-fetches from `/api/admin/activity`. No user interaction is needed. (Existing behaviour unchanged.)
- [ ] Pass / [ ] Fail

---

**TC-10-04: No data lost from activity_log table**

- Precondition: Access to Supabase dashboard or a DB query tool.
- Steps:
  1. Query `SELECT COUNT(*) FROM public.activity_log WHERE log_date = CURRENT_DATE` before and after the migration is applied.
  2. Confirm the count is identical.
  3. Query `SELECT COUNT(*) FROM public.user_action_log` to confirm it is a new, separate table.
- Expected result: The `activity_log` row count is unchanged by the migration. The `user_action_log` table exists independently.
- [ ] Pass / [ ] Fail

---

## Exploratory Testing Notes

These observations do not map to a single acceptance criterion but are relevant to the overall quality of the feature. Each is derived from reading the implementation.

### EX-01 — Visual: overall banner prominence on first load

The overall status banner is rendered conditionally: `{healthData && (<div>...banner...</div>)}`. During the initial fetch (typically 3–10 seconds depending on probe latency), `healthData` is null, so the banner is absent. The user sees only "Checking components..." text during this period. This is acceptable UX, but the admin should be aware that the absence of a banner does not mean the system is healthy — it means data has not yet loaded. The loading text is low-contrast grey (`#64748b`) and small (13px). Consider whether a more prominent loading placeholder (e.g., pulsing skeleton cards) would better communicate that a fetch is in progress, rather than a plain text string that could be overlooked.

Severity: minor

### EX-02 — Timing: stale cards visible alongside error message on failed refresh

When `healthData` is already populated and a subsequent refresh attempt fails (e.g., network dropped mid-session), the implementation sets `fetchError` and leaves `healthData` unchanged. The rendered output will show:
1. The previous overall status banner (based on stale data)
2. The error message box (new, in red)
3. The five stale component cards (from the previous successful fetch)

The stale cards have a "Last checked" timestamp that is now 60+ seconds old. An admin reading the screen sees a green "All Systems Operational" banner from the previous check, an error box saying the refresh failed, and component cards with old timestamps. The stale data and the fresh error coexist without a clear visual hierarchy. Spec edge case: "A UI-level error message replaces the component cards" — the spec implies replacement, but the implementation shows both. This is a meaningful distinction during an incident: the admin may not notice the error box sitting between the banner and the (stale-looking) cards.

Severity: major

### EX-03 — Timing: the 30-second rapid-click guard does not protect against double-clicking Refresh

The spec (Story 3 AC4) states: "If the user clicks Refresh and then clicks again within 30 seconds, the second click is ignored." The implementation calls `fetchHealth(true)` from the Refresh button. The `true` argument sets `force = true` in `fetchHealth`, which bypasses the 30-second guard (`if (!force && now - lastFetchRef.current < 30_000) return`). The re-entrant guard via `loadingRef.current` does prevent a second request while the first is still in flight (button is also disabled during `loading`). However, once the first request completes and the button re-enables (in under 30 seconds on a fast network), a second click will issue a new request to all five external services. The spec explicitly requires that after a successful refresh, clicking again within 30 seconds should be a no-op. This is not implemented. On a fast backend (sub-2s response), the admin could click Refresh 5–6 times within 30 seconds, triggering 5–6 concurrent live probes of yfinance, Gemini, and StockTwits.

Severity: major

### EX-04 — Timing: the 30-second guard is reset on every successful fetch, including auto-refresh

When the 60-second auto-refresh fires and succeeds, `lastFetchRef.current` is updated. This is correct. However, if the auto-refresh fires at second 59 and the admin clicks Refresh at second 60, `lastFetchRef.current` was just updated 1 second ago. The guard would suppress the manual click (since `now - lastFetchRef.current < 30_000`). This is technically correct per spec (which says "within 30 seconds"), but may surprise an admin who wants an immediate manual check right after an auto-refresh. Worth documenting as expected behaviour.

Severity: cosmetic

### EX-05 — Detail column: 4-leg paper trade rendering

The `renderDetail` function filters out the `legs` key and renders remaining top-level keys as `key="value"` pairs. For a 4-leg iron condor trade, the detail JSONB from `record_trade` would be approximately: `{"symbol": "SPY", "strategy_name": "Iron Condor", "net_debit_credit": -1.45, "total_contracts": 1}`. After the legs filter, the rendered string would be: `symbol="SPY" strategy_name="Iron Condor" net_debit_credit=-1.45 total_contracts=1` — approximately 75 characters. This fits within the 120-character limit without truncation. The full 4-leg detail (with legs included) would be ~400–600 characters of JSON, so the filtering is doing useful compression. The resulting string is readable. No defect.

Verify: a strategy with an unusually long name (e.g., "Asymmetric Broken Wing Butterfly Spread") combined with a long symbol and decimal net_debit_credit could approach or exceed 120 characters. Exercise this manually.

Severity: informational

### EX-06 — Long email address in the filter input

The User Email filter input has a fixed width of 240px (`s.input` style). A very long email address (e.g., `averylongemail.address.with.many.dots@subdomain.example.com`) will overflow the input's visible width. The `<input>` element will scroll internally (standard browser behaviour), so the value is not lost, but the admin cannot see the full value at a glance. The table's User Email column has `maxWidth: '180px'` with `overflow: 'hidden'` and `textOverflow: 'ellipsis'`, meaning long emails in results are also clipped without a tooltip. An admin investigating a specific user with a long email must type carefully into the filter and cannot verify the full address from the table.

Severity: minor

### EX-07 — Loading state: User Actions tab shows a "Loading..." row within the table body

During data fetch, the `UserActionsTab` renders a `<td colSpan={5}>Loading...</td>` inside `<tbody>`. This means the table header is visible but the body shows a single "Loading..." row. The overall banner and filter bar remain interactive while loading. This is a reasonable approach, though a spinner animation (rather than plain text) would better communicate activity. More importantly: the "Loading..." text uses the same styling as the "0 events" row count summary. If the admin glances at the row count summary area while the table is loading, they see an empty string (`data` is null, so the ternary renders `''`). The row count summary is blank during loading — no "Loading..." indicator there. Minor UX inconsistency.

Severity: minor

### EX-08 — Error recovery: failed health check followed by successful refresh clears the error

After a network error sets `fetchError`, clicking Refresh calls `fetchHealth(true)` which sets `setFetchError(null)` before the request. If the subsequent request succeeds, `fetchError` remains null and `healthData` is updated. The error box disappears and the component cards update correctly. This is the correct recovery flow. However, during the new request (between the `setFetchError(null)` call and the response arriving), the error box is gone but the stale cards are still shown. The "Checking..." button label is the only indication that a refresh is in progress during this window. This is acceptable.

Severity: informational

### EX-09 — Tab label clarity: "Activity Log (Logins)" vs "User Actions"

The renamed tab "Activity Log (Logins)" is distinguishable from "User Actions" by name. However, visually in the tab bar, the two tabs sit adjacent. An admin seeing the tab bar for the first time may not immediately understand that these are two different sources of truth: one is a daily login aggregate (`activity_log`), the other is a per-event granular log (`user_action_log`). The "Activity Log (Logins)" tab has a small note "Auto-refreshes every 60s" but no explanation of why it is different from "User Actions". A short subtitle or tooltip on each tab would reduce confusion.

Severity: minor

### EX-10 — Mobile viewport: admin panel is declared desktop-first

The spec's Out of Scope section explicitly states "Mobile-specific layout optimisations for the two new tabs" are out of scope. The tab bar has seven tabs at small screen widths. On a 375px viewport (iPhone), the seven tabs will cause horizontal overflow. The `tableWrap` container has `overflowX: 'auto'` to handle table scrolling, but the tab bar itself has `display: 'flex'` with no `overflowX: 'auto'` or wrapping strategy. The Health tab's component card grid uses `auto-fill` with `minmax(260px, 1fr)` — on a 375px viewport this will show a single column of cards, which is actually readable. The filter bar in User Actions tab uses `flexWrap: 'wrap'` so filters will stack vertically on narrow screens, which is functional.

The Health tab and User Actions tab are admin-only features used by a single administrator. Given the desktop-first declaration in the spec, the mobile rendering is not a blocking issue but should be noted.

Severity: minor (acknowledged out of scope)

### EX-11 — Cross-tab behaviour: does leaving the Health tab mid-fetch cause issues?

If the admin navigates away from the Health tab while a fetch is in progress, the `useEffect` cleanup calls `clearInterval` (stopping future auto-refresh). The in-flight `fetchHealth` call will still resolve (or reject), and `setHealthData`, `setLoading`, `setFetchError` will be called on an unmounted component. In React 18, calling state setters on unmounted components does not throw an error (the warning was removed in React 18), but the state update is effectively a no-op. There is no abort controller or request cancellation. The 30-second axios timeout on `/admin/health-check` means the in-flight request could run for up to 30 seconds after the tab is left. This is harmless but represents a minor resource leak for slow environments (e.g., when a Gemini probe takes 9 seconds and the admin navigates away at second 1).

Severity: cosmetic

### EX-12 — watchlist_update is logged even when the DB write fails

In `watchlist.py`, the `log_action` call for `watchlist_update` is placed after `_write_symbols(...)` regardless of whether `err` is set. This means if the watchlist save fails (returns an error string), the activity log will still record `watchlist_update` with `symbol_count = N`. The admin reviewing the activity log will see an event suggesting a watchlist was updated when in fact the write may have failed. The design document acknowledges this explicitly ("Log always — the user's action was taken regardless of DB outcome"), so this is a deliberate choice, but it is worth noting as a diagnostic nuance: `watchlist_update` in the log does not guarantee the watchlist was saved.

Severity: informational

---

## Issues Summary

| ID | Severity | Story | Description |
|----|----------|-------|-------------|
| ISSUE-01 | Major | Story 3 (AC4) | The 30-second rapid-click guard is bypassed when the Refresh button is used (`force=true` skips the guard). After a successful refresh, a second Refresh click immediately issues a new health-check request to all five external services. Spec requires the second click be ignored. |
| ISSUE-02 | Major | Story 4 / Edge case | After a failed refresh (network error), stale component cards remain visible alongside the error message. The spec's edge-case table says the error "replaces" the component cards, but the implementation shows both simultaneously. An admin may misread the stale green banner as current during an outage investigation. |
| ISSUE-03 | Minor | Story 2 (AC5) | Error messages are truncated at 500 characters on the backend (`str(exc)[:500]`), not 200 as stated in AC5. The frontend applies no truncation. This is a minor spec deviation — the frontend should truncate to 200 characters before rendering, or the spec's 200-character limit should be updated to 500 to match the implementation. |
| ISSUE-04 | Minor | Story 6 | Long email addresses in the User Email filter input (> ~35 characters) overflow the fixed 240px input width. The admin cannot see the full address at a glance. The User Email column in the table also clips long emails without a tooltip, making it difficult to verify a full address match for long emails. |

---

## Scenarios Not Reliably Coverable by Automated Tests

1. The 30-second rapid-click guard (EX-03, ISSUE-01) — a Playwright test can click twice in rapid succession but cannot easily verify that the second request is suppressed without sophisticated network interception.
2. The 60-second auto-refresh timer (TC-04-01) — Playwright would need to mock the system clock or `setInterval` to avoid a 60-second real wait in the test suite.
3. Auto-refresh stops when navigating away (TC-04-02) — requires monitoring the network for the absence of a request over 70+ seconds; not practical in automated tests without clock mocking.
4. Race condition: navigating away during an in-flight health-check fetch (EX-11) — hard to reproduce deterministically.
5. Visual colour verification — whether the banner hex colours `#16a34a`, `#d97706`, `#dc2626` are actually visually distinct and readable against the dark background at a glance; automated tests cannot replicate human colour perception.
6. The stale-cards-plus-error-box issue (ISSUE-02) — requires a network failure mid-session after a prior successful fetch; hard to trigger deterministically in a Playwright test without network proxy tooling.

---

## Gate 4 Decision

**Status: PENDING HUMAN SIGN-OFF**

Two major issues (ISSUE-01, ISSUE-02) and two minor issues (ISSUE-03, ISSUE-04) were identified through static review. The implementation is functionally complete for all stories in scope (1–7, 9, 10). No critical defects were found. The feature can be approved at gate 4 subject to the human reviewer's assessment of whether the major issues require a fix before release or can be accepted as-is given the admin-only, low-stakes context of these features.

Recommended pre-approval actions:
1. Fix ISSUE-01: change the Refresh button handler to call `fetchHealth(false)` instead of `fetchHealth(true)`, or add a separate time check in the handler before calling `fetchHealth`.
2. Fix ISSUE-02: when `fetchError` is set, do not render the stale component cards. Replace them with the error message, or add a visual "data may be stale" label to the banner.
3. Address ISSUE-03 in either code (add `?.slice(0, 200)` on the error string before rendering) or spec (update AC5 to say 500 characters).

_Approved by:_ [ ] human reviewer &nbsp;&nbsp; _Date:_ ___________


# Feature Spec — Admin Health Monitor and User Activity Log

**Date:** 17Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

This spec covers two new sections within the existing AdminPanel component, each surfaced as a new tab inside the admin portal.

**Feature 1 — App Health Monitor** gives the platform administrator a real-time view of the health status of every underlying component that OptionsDesk depends on: the FastAPI backend itself, Supabase database connectivity, yfinance market data, the Gemini AI service, and the StockTwits social-data client (currently named `reddit.py` in the codebase but actually calling the StockTwits API). The monitor shows a per-component status badge, response time in milliseconds, last-checked timestamp, and any error message. A manual Refresh button and a 60-second auto-refresh keep the view current. The immediate problem this solves: the admin currently has no in-app way to know which sub-system is causing a user-visible failure without SSH-ing into Railway logs.

**Feature 2 — User Activity Log** replaces the existing "Activity Log" admin tab, which today shows only today's login events from the `activity_log` table (one aggregated row per user per day). The new feature introduces a separate persistent event table — `user_action_log` — that records granular per-action events (login, logout, ticker search, strategy scan, options chain view, paper trade placed, watchlist update, AI query) for all users, with email, timestamp, action type, a detail payload field, and IP address. The admin can filter by user email, date range, and action type, paginate through results (newest first), see a running total count, and export to CSV. The job-to-be-done is operational visibility: understanding what users are actually doing in the platform, diagnosing support requests, and verifying whether features are being used.

Both features are exclusively admin-gated. No tier-level implication for regular users. No real money, no real broker connections. Paper-trading constraint is unaffected.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Platform Admin (leonard.simgt@gmail.com or any user with role='admin') | Enterprise (admin always gets enterprise entitlements) | Diagnose which sub-system is degraded when users report errors; understand platform-wide usage patterns; produce audit evidence of user activity |
| Platform Admin | Enterprise | Investigate a specific user's session history for support purposes |

No non-admin persona interacts with either feature. Both tabs must be invisible to non-admin users.

---

## 3. Functional Requirements

### Feature 1 — App Health Monitor

1. A new "Health" tab must appear in the AdminPanel tab bar alongside the existing tabs (Users, Whitelist, Activity Log, Leaderboard, Platform Settings), visible only when `isAdmin` is true.

2. The Health tab must display one status card per component. The required components are: Backend API, Supabase Database, yfinance Market Data, Gemini AI, and StockTwits (social data). Each card must show: component name, status badge (Healthy / Degraded / Error), response time in milliseconds (where a round-trip measurement is possible), last-checked timestamp (ISO local time), and an error message string when status is not Healthy.

3. Status badge semantics must be deterministic and testable:
   - **Healthy**: component responded successfully within a defined threshold (see FR-8).
   - **Degraded**: component responded but exceeded the threshold, or responded with a non-fatal warning.
   - **Error**: component did not respond, returned an error, or the API key is absent.

4. An "Overall System Status" indicator must be shown at the top of the tab, summarising the worst-case component status: all Healthy → "All Systems Operational"; any Degraded → "Degraded"; any Error → "Outage Detected".

5. A "Refresh" button must trigger an immediate re-poll of all five components. The button must be disabled while a refresh is in progress and must re-enable when complete.

6. The Health tab must auto-refresh all component checks every 60 seconds while the admin is viewing the tab. The auto-refresh must stop when the admin navigates away from the tab.

7. The health check endpoint `GET /api/admin/health-check` must be implemented as a new backend route, gated by `require_admin()`, and must execute all five component probes server-side. The frontend must not probe external services directly; all credentials and service clients remain on the backend.

8. Per-component probe definitions and pass/degraded thresholds:
   - **Backend API**: The endpoint returns HTTP 200. Response time measured as the round-trip from the frontend to `GET /api/admin/health-check` itself (measured client-side). Threshold: Healthy < 1000 ms, Degraded 1000–3000 ms, Error > 3000 ms or non-200.
   - **Supabase Database**: Backend executes a `SELECT 1` query against the Supabase Postgres database using the service client. Threshold: Healthy < 500 ms, Degraded 500–2000 ms, Error > 2000 ms or exception.
   - **yfinance Market Data**: Backend calls `yf.Ticker("SPY").fast_info` (or equivalent lightweight probe) and confirms a non-null price is returned. Threshold: Healthy < 3000 ms, Degraded 3000–6000 ms, Error > 6000 ms or exception or null price.
   - **Gemini AI**: Backend checks that `GEMINI_API_KEY` environment variable is set and non-empty. If set, it performs a minimal API call (e.g., a single-token generation with a short prompt). Threshold: Healthy < 5000 ms, Degraded 5000–10000 ms, Error > 10000 ms or exception or key absent.
   - **StockTwits**: Backend calls the StockTwits API (`https://api.stocktwits.com/api/2/streams/symbol/SPY.json`) and confirms an HTTP 200 response. Threshold: Healthy < 2000 ms, Degraded 2000–5000 ms, Error > 5000 ms or non-200 or exception.

9. All five component probes must be executed concurrently (parallel async tasks) so the total endpoint latency is bounded by the slowest individual probe, not the sum of all five.

10. The response body of `GET /api/admin/health-check` must be a JSON object with a top-level `overall` field (string: "healthy" | "degraded" | "error") and a `components` array. Each element in `components` must include: `name` (string), `status` (string: "healthy" | "degraded" | "error"), `response_time_ms` (integer or null), `checked_at` (ISO 8601 timestamp), and `error` (string or null).

11. The health check endpoint must not be called more than once every 30 seconds from any single admin session, enforced client-side with a timestamp guard, to prevent accidental hammering of external services.

12. No health check result must be cached or returned to non-admin callers. The endpoint returns 403 for non-admin JWTs.

### Feature 2 — User Activity Log

13. A new Supabase table `user_action_log` must be introduced via a new migration. Schema: `id` (UUID PK), `user_id` (UUID FK to auth.users, NOT NULL), `user_email` (text, denormalised for query convenience), `action_type` (text, constrained enum, NOT NULL), `detail` (JSONB, nullable — action-specific payload), `ip_address` (text, nullable), `created_at` (timestamptz, default now(), indexed DESC). Unique constraint: none (multiple events per user per second are valid). RLS enabled; service role writes only.

14. The permissible `action_type` values for `user_action_log` must be exactly: `login`, `logout`, `ticker_search`, `strategy_scan`, `options_chain_view`, `paper_trade_placed`, `watchlist_update`, `ai_query`. No other values may be inserted; the column must have a CHECK constraint.

15. The backend must write a `user_action_log` row at the following trigger points:
    - `login`: on successful `POST /api/auth/login` (after whitelist check passes and profile is upserted). Detail: `{"email": "<email>"}`.
    - `logout`: this is a client-side Supabase auth event; the frontend must call `POST /api/auth/logout` which the backend logs. Detail: `{}`.
    - `ticker_search`: on `GET /api/options/quote/{symbol}`. Detail: `{"symbol": "<symbol>"}`.
    - `strategy_scan`: on `GET /api/strategies/scan`. Detail: `{"symbols": ["<sym1>", ...]}`.
    - `options_chain_view`: on `GET /api/options/chain/{symbol}`. Detail: `{"symbol": "<symbol>"}`.
    - `paper_trade_placed`: on successful `POST /api/orders` and on successful `POST /api/trades/record` (status="filled"). Detail: `{"symbol": "<symbol>", "action": "<buy|sell>", "strategy": "<strategy_name or null>"}`.
    - `watchlist_update`: on `PUT /api/watchlist`. Detail: `{"symbol_count": <int>}`.
    - `ai_query`: on any authenticated call to the AI routes (`/api/ai/*`). Detail: `{"query_type": "<narrative|chat|risk_summary|reasoning|earnings_awareness|morning_briefing>"}`.

16. Activity logging writes must be best-effort (fire-and-forget, wrapped in try/except). A logging failure must never cause the parent request to fail or return a non-2xx response to the user.

17. A new backend route `GET /api/admin/activity-log` must be implemented, gated by `require_admin()`. It must accept the following query parameters: `user_email` (string, optional, partial match), `action_type` (string, optional, exact match against the enum), `date_from` (ISO date string, optional), `date_to` (ISO date string, optional), `page` (integer, default 1), `page_size` (integer, default 50, max 200). It must return: `{"total": <int>, "page": <int>, "page_size": <int>, "results": [{...}]}`. Default sort is `created_at DESC`.

18. Each result row in the activity log API response must include: `id` (UUID), `user_email` (string), `action_type` (string), `detail` (object or null), `ip_address` (string or null), `created_at` (ISO 8601 timestamp).

19. The existing "Activity Log" admin tab in `AdminPanel.tsx` must be renamed "Activity Log (Logins)" and must remain unchanged in behaviour, sourcing its data from the existing `activity_log` table. The new feature is a separate tab labelled "User Actions" that sources its data from the new `user_action_log` table via `GET /api/admin/activity-log`.

20. The "User Actions" tab must display a filter bar with: a text input for user email (partial match), a dropdown for action type (All + each of the 8 enum values), a date-from date picker, a date-to date picker, and an "Apply" button. Filters must not be applied on keystroke — only on "Apply" or pressing Enter.

21. The activity table must display columns: Timestamp (formatted local time), User Email, Action Type, Detail (rendered as a compact key=value or JSON string, truncated to 120 characters), IP Address. All columns must be visible without horizontal scroll on a 1280px-wide desktop viewport.

22. Pagination controls must show: current page, total pages, "Previous" and "Next" buttons (disabled at boundaries), and a row count summary ("Showing X–Y of Z results"). Page size is fixed at 50 rows per page.

23. An "Export CSV" button must trigger a client-side download of all currently filtered results (not just the current page). The backend must provide a separate `GET /api/admin/activity-log/export` endpoint that accepts the same filter parameters as FR-17 but returns `text/csv` content with headers: `timestamp,user_email,action_type,detail,ip_address`. The export must be capped at 10,000 rows maximum; if the result set exceeds 10,000 rows the response header must include `X-Truncated: true` and the CSV must contain exactly the 10,000 most recent rows.

24. The "User Actions" tab must display the total result count (e.g., "2,341 events") above the filter bar, updated whenever filters are applied.

25. The "User Actions" tab must not auto-refresh. Data is loaded on tab entry and on filter application only.

26. The `user_action_log` table must have no maximum retention enforced by this feature. Data accumulation is the operator's responsibility; this is noted as an explicit operational concern.

---

## 4. User Stories and Acceptance Criteria

### Story 1 — View Overall System Health at a Glance

**As a** platform admin, **I want** to see a single overall system status indicator in the Health tab **so that** I can immediately know whether the platform is fully operational, degraded, or experiencing an outage without inspecting each component individually.

**Acceptance Criteria:**
- [ ] AC1: Navigate to Admin tab, click "Health". The top of the tab shows an "Overall System Status" banner. When all five components are Healthy, the banner reads "All Systems Operational" and is styled in green.
- [ ] AC2: If any single component returns status "degraded" and none return "error", the banner reads "Degraded" and is styled in amber.
- [ ] AC3: If any component returns status "error", the banner reads "Outage Detected" and is styled in red, regardless of other component statuses.
- [ ] AC4: The admin must be able to read the overall status banner and its colour within 5 seconds of the tab loading, assuming the backend health-check endpoint responds within its defined thresholds.

---

### Story 2 — Inspect Per-Component Health Details

**As a** platform admin, **I want** to see a status card for each underlying component showing its status badge, response time, last-checked timestamp, and any error message **so that** I can pinpoint which specific sub-system is causing a degradation without guessing.

**Acceptance Criteria:**
- [ ] AC1: The Health tab displays exactly five component cards: "Backend API", "Supabase Database", "yfinance Market Data", "Gemini AI", "StockTwits".
- [ ] AC2: Each card displays a status badge with one of three values: "Healthy" (green), "Degraded" (amber), "Error" (red).
- [ ] AC3: Each card displays a response time in milliseconds. For components where a response time cannot be measured (e.g., API key absence check for Gemini when key is missing), the field shows "N/A".
- [ ] AC4: Each card displays a "Last checked" timestamp accurate to the second.
- [ ] AC5: When a component's status is "Error", its card displays the error message string returned by the backend. The message is truncated to 200 characters in the UI if longer.
- [ ] AC6: Repeat AC2–AC5 with the Gemini API key intentionally unset: the Gemini card must show "Error" with message "GEMINI_API_KEY is not set".

---

### Story 3 — Manually Refresh Health Status

**As a** platform admin, **I want** to trigger an immediate re-poll of all components by clicking a "Refresh" button **so that** I can check whether a previously reported error has resolved without waiting for the 60-second auto-refresh cycle.

**Acceptance Criteria:**
- [ ] AC1: A "Refresh" button is visible in the Health tab at all times.
- [ ] AC2: Clicking "Refresh" triggers a new `GET /api/admin/health-check` request. While the request is in-flight, the button is disabled and shows a "Checking..." label or spinner.
- [ ] AC3: After the response returns, the button re-enables, shows "Refresh" again, and all five component cards update with fresh data.
- [ ] AC4: If the user clicks Refresh and then clicks again within 30 seconds, the second click is ignored (button remains enabled but the request is not sent; the existing data remains displayed).
- [ ] AC5: The "Last checked" timestamp on each component card updates to reflect the time of the most recent successful probe.

---

### Story 4 — Health Tab Auto-Refreshes While Visible

**As a** platform admin, **I want** the Health tab to automatically re-poll all components every 60 seconds while I am viewing it **so that** I do not have to manually refresh to stay aware of a deteriorating or recovering system.

**Acceptance Criteria:**
- [ ] AC1: On entering the Health tab, a 60-second countdown begins. After 60 seconds, all component cards refresh automatically without any user action.
- [ ] AC2: If the admin navigates away from the Health tab (to any other tab), the auto-refresh timer stops. No further `GET /api/admin/health-check` calls are made until the admin returns to the Health tab.
- [ ] AC3: On returning to the Health tab, the auto-refresh cycle restarts from 0.
- [ ] AC4: The auto-refresh does not fire if a manual refresh is already in progress.

---

### Story 5 — Health Endpoint is Admin-Only

**As a** platform admin, **I want** the health-check endpoint to be protected by admin authentication **so that** the credentials and service connectivity details of underlying systems are never exposed to non-admin users.

**Acceptance Criteria:**
- [ ] AC1: Call `GET /api/admin/health-check` with no Authorization header. The response is HTTP 401.
- [ ] AC2: Call `GET /api/admin/health-check` with a valid JWT for a non-admin user. The response is HTTP 403.
- [ ] AC3: Call `GET /api/admin/health-check` with a valid JWT for an admin user. The response is HTTP 200 with the component array in the body.
- [ ] AC4: The "Health" tab is not visible in the AdminPanel tab bar for any non-admin user. (The AdminPanel itself is already admin-gated, but this AC confirms the tab label does not leak through any client-side state error.)

---

### Story 6 — Browse All User Actions with Filters

**As a** platform admin, **I want** to view a paginated, filterable table of all user actions recorded in the platform **so that** I can understand what users are doing, investigate support requests, and verify feature adoption.

**Acceptance Criteria:**
- [ ] AC1: Click the "User Actions" tab in the Admin panel. A filter bar is visible with: a text input labelled "User Email", an "Action Type" dropdown (options: All, login, logout, ticker_search, strategy_scan, options_chain_view, paper_trade_placed, watchlist_update, ai_query), a "Date From" date input, a "Date To" date input, and an "Apply" button.
- [ ] AC2: With all filters at their defaults (empty/All), clicking "Apply" loads the 50 most recent events across all users, sorted by timestamp descending. The table shows columns: Timestamp, User Email, Action Type, Detail, IP Address.
- [ ] AC3: Enter a partial email string (e.g., "test@") in the User Email filter and click Apply. Only rows where `user_email` contains that string are returned.
- [ ] AC4: Select "paper_trade_placed" from the Action Type dropdown and click Apply. Only rows with `action_type = 'paper_trade_placed'` are returned.
- [ ] AC5: Set Date From to today's date and Date To to today's date and click Apply. Only rows where `created_at` falls within today (UTC or local — must be consistent and documented) are returned.
- [ ] AC6: A row count summary above the table reads "X events" (or "0 events" when no rows match), updating on every Apply.
- [ ] AC7: The Detail column renders a compact human-readable string. For `paper_trade_placed` it shows "symbol=AAPL action=buy strategy=Bull Call Spread" (or equivalent). The cell is truncated at 120 characters with a trailing ellipsis if longer.

---

### Story 7 — Paginate Through Activity Results

**As a** platform admin, **I want** pagination controls on the User Actions table **so that** I can browse through large result sets without the browser loading thousands of rows at once.

**Acceptance Criteria:**
- [ ] AC1: When the filtered result set contains more than 50 rows, pagination controls appear below the table showing: "Previous" button, "Page X of Y" label, "Next" button.
- [ ] AC2: "Previous" is disabled on page 1. "Next" is disabled on the last page.
- [ ] AC3: Clicking "Next" loads the next 50 rows. The table updates and the page indicator increments.
- [ ] AC4: Clicking "Previous" loads the preceding 50 rows. The table updates and the page indicator decrements.
- [ ] AC5: When filters are re-applied, the pagination resets to page 1.
- [ ] AC6: The row count summary reads "Showing X–Y of Z results" (e.g., "Showing 51–100 of 2341 results").

---

### Story 8 — Export User Actions to CSV

**As a** platform admin, **I want** to export the currently filtered User Actions results to a CSV file **so that** I can share activity data with stakeholders or analyse it in a spreadsheet outside the app.

**Acceptance Criteria:**
- [ ] AC1: An "Export CSV" button is visible in the User Actions tab at all times (not only when results are present).
- [ ] AC2: Clicking "Export CSV" triggers a file download in the browser. The file is named `user-actions-<YYYY-MM-DD>.csv` using the current date.
- [ ] AC3: The CSV has a header row: `timestamp,user_email,action_type,detail,ip_address`. All data rows follow in descending timestamp order.
- [ ] AC4: The export applies the same active filters as the currently displayed table (user_email, action_type, date_from, date_to). If no filters are set, all records are exported (up to 10,000 rows).
- [ ] AC5: If the filtered result set exceeds 10,000 rows, the exported CSV contains exactly 10,000 rows (the most recent), and a warning banner appears in the UI: "Export truncated to 10,000 rows. Refine your filters to export a smaller dataset."
- [ ] AC6: The CSV encodes properly: fields containing commas or newlines are double-quoted. Email addresses with commas in the local part are handled without breaking the CSV structure.
- [ ] AC7: If the filtered result set is empty, clicking "Export CSV" downloads a CSV with only the header row (no data rows) and no error is shown.

---

### Story 9 — User Actions are Logged Automatically Without User Awareness

**As a** platform admin, **I want** user actions to be silently recorded on the backend whenever a user interacts with a key feature **so that** the activity log is complete without requiring the user to opt in or take any extra step.

**Acceptance Criteria:**
- [ ] AC1: Sign in as a non-admin user. Search for ticker "AAPL" (triggering `GET /api/options/quote/AAPL`). Sign in as admin, open the User Actions tab, filter by the test user's email. A row with `action_type = 'ticker_search'` and `detail.symbol = 'AAPL'` appears.
- [ ] AC2: As the same non-admin user, place a paper trade. Admin sees a row with `action_type = 'paper_trade_placed'` and `detail.symbol` set to the traded ticker.
- [ ] AC3: As the same non-admin user, update the watchlist. Admin sees a row with `action_type = 'watchlist_update'` and `detail.symbol_count` set to the new watchlist size.
- [ ] AC4: A logging write failure (simulated by temporarily making the DB unavailable) does not cause the originating user request to return an error. The user's action completes successfully.
- [ ] AC5: The `login` event appears in the User Actions table (not only in the existing Activity Log tab). The login event's detail includes the user's email.

---

### Story 10 — Existing Activity Log Tab is Preserved

**As a** platform admin, **I want** the existing login-based activity view to remain available **so that** today's login count and last-login-at data I already rely on is not disrupted by the introduction of the new User Actions tab.

**Acceptance Criteria:**
- [ ] AC1: The existing "Activity Log" tab (sourcing data from the `activity_log` table) remains in the AdminPanel tab bar. Its label is "Activity Log (Logins)" to distinguish it from the new tab.
- [ ] AC2: The "Activity Log (Logins)" tab continues to show: Email, Login Count (today), Last Login, IP Address. Data matches the current `activity_log` table behaviour (one row per user per day, upserted on each login).
- [ ] AC3: The "Activity Log (Logins)" tab continues to auto-refresh every 60 seconds while visible (existing behaviour unchanged).
- [ ] AC4: No data is removed from or altered in the `activity_log` table by any migration introduced for this feature.

---

## 5. Out of Scope

- Real-time streaming of health status or activity events (WebSocket or SSE). The Health tab polls on a 60-second interval; no push mechanism is required.
- Per-component drill-down (e.g., recent yfinance query log, Gemini token usage). Component cards show one status badge and one response time only.
- Alerting or notifications when a component goes into Error state (e.g., email, Slack). Manual observation only.
- Historical health status chart or uptime percentage calculation. The Health tab shows current state only; no historical storage of probe results.
- User-facing activity history (allowing a regular user to see their own action log). This is admin-only.
- GDPR-compliant data deletion hooks for `user_action_log`. Retention policy tooling is deferred.
- Automatic deduplication or rate-limiting of activity log writes (e.g., suppressing repeated `options_chain_view` events for the same symbol within 10 seconds). Every qualifying backend call produces exactly one log row.
- Admin-to-admin impersonation or support session logging via `user_action_log`. That concern is handled separately by `platform_audit_log` (migration 006).
- Any change to the `platform_audit_log` table or its readers. That table records admin actions; `user_action_log` records subscriber actions.
- Mobile-specific layout optimisations for the two new tabs. The admin portal is desktop-first; the existing horizontal scroll wrapper handles overflow.
- Stripe webhook events or billing-related events appearing in `user_action_log`. Those are recorded in `stripe_webhook_events`.
- CSV export scheduled delivery or email attachment. Browser-initiated download only.
- Modification of the existing `GET /api/admin/activity` endpoint. It remains unchanged and feeds the renamed "Activity Log (Logins)" tab.
- Adding an `action_type` of `logout` to routes that do not yet have a `POST /api/auth/logout` endpoint. If the endpoint does not exist at the time of implementation, `logout` logging is deferred to the backend developer, who must create the endpoint as part of this feature's implementation scope.

---

## 6. Edge Cases and Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| All five health probes time out simultaneously | Health tab shows all five cards as "Error". Overall status is "Outage Detected". The page does not hang; a reasonable per-probe timeout (10 seconds maximum) is enforced server-side so the endpoint always returns within 10 seconds. |
| Supabase is unreachable during a health check | Supabase component shows "Error" with the exception message. The other four probes complete independently (they run concurrently). |
| GEMINI_API_KEY is set but the key is invalid (Gemini returns 401) | Gemini component shows "Error" with message from Gemini API. |
| yfinance returns a NaN price for SPY (edge case on market holidays) | yfinance component shows "Degraded" with message "Price unavailable (NaN returned)". It does not show "Healthy" when the returned value cannot be confirmed as a valid number. |
| StockTwits rate-limits the health probe (HTTP 429) | StockTwits component shows "Degraded" with message "Rate limited (429)". |
| Admin loads Health tab, then loses internet connectivity | The next auto-refresh (60 s) or manual Refresh fails with a network error. A UI-level error message "Health check failed: network error" replaces the component cards until the next successful fetch. |
| User Actions tab loaded with zero rows | Table body shows an empty-state message: "No actions recorded matching the current filters." No pagination controls are shown. Export CSV still works (downloads header-only file). |
| `user_action_log` write fails mid-request (Supabase unavailable) | The outer API request continues and returns 200 to the user. The activity log row is silently dropped. No retry mechanism is specified. |
| Admin applies Date From > Date To | The backend returns HTTP 422 with detail "date_from must not be after date_to". The frontend displays this as an inline validation error next to the date filters; no network request is made. |
| Page number exceeds total pages (e.g., direct URL navigation) | Backend returns HTTP 422 with detail "page exceeds total pages". Frontend falls back to page 1. |
| Export with 0 filters on a large dataset (>10,000 rows) | CSV contains exactly 10,000 rows (most recent). UI banner warns of truncation. No error. |
| Non-admin user attempts to access `/api/admin/health-check` or `/api/admin/activity-log` | HTTP 403 returned. Frontend never renders these tabs for non-admin users; 403 is a defence-in-depth response. |
| Admin visits Health tab for the first time (cold load) | All five probes execute immediately on tab entry (not waiting for the 60-second auto-refresh cycle). Data is populated within the probe response time. |

---

## 7. External Dependencies

| Service | Usage in these features | Quota / Risk |
|---------|------------------------|-------------|
| Supabase Postgres | Health probe (SELECT 1); persistent store for `user_action_log`; reads for `GET /api/admin/activity-log` and export | No additional quota cost. Service-role key used on backend only; never exposed to frontend. New table adds row storage. |
| yfinance | Health probe only: `yf.Ticker("SPY").fast_info`. Not used for chain data in this feature. | yfinance is rate-limited by Yahoo Finance; one SPY probe per health check (max once per 30 seconds per admin session) is well within limits. |
| Gemini AI (Google AI Studio) | Health probe: one minimal generation call per health check. No user-facing AI calls are introduced. | GEMINI_API_KEY must be set. Free tier quota: 60 requests/minute. One probe per health check is negligible. Cost: effectively zero for a short probe prompt. |
| StockTwits API | Health probe: one GET request to `streams/symbol/SPY.json` per health check. | Rate limit: ~200 req/hour. At one request per 60 seconds maximum, peak usage is 60 req/hour — comfortably under limit. No auth token required. |
| FastAPI (backend itself) | Health endpoint `GET /api/admin/health-check` added to `admin_routes.py`. Activity log endpoint `GET /api/admin/activity-log` and `GET /api/admin/activity-log/export` added to `admin_routes.py`. `POST /api/auth/logout` may need to be created. | No Railway deployment constraint. Both endpoints are lightweight. |
| Supabase Auth | `POST /api/auth/logout` verifies the JWT before logging the logout event. No change to the OAuth flow. | No quota impact. |

---

## 8. Subscription Tier Impact

Neither feature introduces any change to subscriber-facing behaviour or entitlements.

| Tier | Behaviour |
|------|----------|
| free | No change. These features are admin-only. Free users cannot see the Admin tab. |
| starter | No change. Starter users cannot see the Admin tab. |
| pro | No change. Pro users cannot see the Admin tab. |
| enterprise | No change for enterprise subscribers who are not admins. Admin users (who always receive enterprise entitlements) gain access to the two new tabs. |

The admin email (`leonardsim.sm@gmail.com`) and any user with `role='admin'` in `user_profiles` are the only principals who can access these features. The `require_admin()` dependency in `auth_utils.py` already enforces this on all `/api/admin/*` routes.

---

## 9. Schema Notes for Architect

These are observations for the architect's attention, not implementation decisions.

- The existing `activity_log` table uses a one-row-per-user-per-day upsert pattern (`UNIQUE (user_id, log_date)`). This makes it unsuitable for granular event logging. A new `user_action_log` table is required; it must not alter or replace `activity_log`.
- The `user_action_log.detail` column is JSONB. The architect should decide whether to add a GIN index on `detail` for future query performance, or restrict indexed access to `created_at` and `user_email` only.
- The export endpoint may benefit from server-side streaming (`StreamingResponse` in FastAPI) if row counts approach the 10,000-row cap. The architect should specify this in the design document.
- The `user_action_log` table will grow unboundedly. The architect should note an operational concern about periodic archival or a Supabase scheduled function for pruning rows older than N months.
- The health probe for Gemini makes a live API call; the architect must specify a per-probe timeout and confirm whether `asyncio.wait_for` or `concurrent.futures` with a timeout is used.

---

## 10. Product Owner Annotations

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — Overall System Health | 1 — Must Have | The banner is the entire value proposition of the Health tab. Without it the per-component cards have no summary anchor and the admin cannot triage at a glance. |
| Story 2 — Per-Component Detail | 1 — Must Have | The specific component cards are the diagnostic payload that replaces SSH-ing into Railway logs. No cards, no value. |
| Story 3 — Manual Refresh | 1 — Must Have | Incident recovery requires the admin to confirm that a fix has taken effect without waiting 60 seconds. The workaround (wait for auto-refresh) is operationally unacceptable during an active outage. |
| Story 4 — Auto-Refresh | 2 — Should Have | Manual refresh (Story 3) covers the active-monitoring need. Auto-refresh is a quality-of-life improvement for when the admin leaves the tab open unattended. Worth shipping in v1 alongside the other health stories, but if scope pressure arises it is the one deferrable story in Feature 1. |
| Story 5 — Health Endpoint Auth | 1 — Must Have | Security constraint, not a feature. Error messages from component probes can reveal service topology, API key absence, and connection strings. Must be admin-gated from day one. No exceptions. |
| Story 6 — Browse User Actions | 1 — Must Have | The primary reason Feature 2 exists. Without the table UI, the logging infrastructure (Story 9) has nowhere to surface and the admin has zero improvement in visibility. |
| Story 7 — Pagination | 1 — Must Have | The platform is in active growth. The table will accumulate thousands of rows within days of launch. An unpaginated view capped at 50 rows with no navigation would be misleading and unusable. Pagination is part of the correct contract for this UI from the start and the implementation cost is low relative to the alternative of retrofitting it later. |
| Story 8 — CSV Export | 3 — Nice to Have | On day 1, the in-app filter table provides sufficient operational visibility. Stakeholder reporting and offline analysis are future concerns. This is the clearest deferral in the entire spec. |
| Story 9 — Automatic Logging | 1 — Must Have | Without the backend injection points, the `user_action_log` table is empty and Story 6 shows zero rows. This is the engine of the entire feature. The `POST /api/auth/logout` endpoint adds modest complexity but is already scoped and documented by the architect. |
| Story 10 — Preserve Existing Tab | 1 — Must Have | This is a constraint, not a feature. Shipping without it would be a regression in existing admin functionality. There is no workaround. |

**MVP boundary (v1 — ships together):**

Stories 1, 2, 3, 4, 5, 6, 7, 9, 10.

This set delivers: a fully functional Health tab (all five component probes, overall banner, manual refresh, 60-second auto-refresh, admin auth gate), a fully functional User Actions tab (browsable and filterable table with pagination, backed by automatic logging across all eight action types), and preservation of the existing Activity Log (Logins) tab. The admin moves from zero in-app visibility to meaningful operational coverage in one release.

**Deferred to backlog:**

- Story 8 — CSV Export. The backend export endpoint (`GET /api/admin/activity-log/export`) and the frontend "Export CSV" button are explicitly deferred. The `GET /api/admin/activity-log` endpoint (Story 6) is sufficient for day-1 visibility. Export should be picked up in the next admin tooling iteration, once the admin has used the filter table and can confirm what export format and filter scope they actually need in practice.

**PO notes:**

- Story 4 (Auto-Refresh) is Priority 2 by strict classification but is included in v1 scope. The implementation cost is a single `setInterval` / `clearInterval` in the `HealthTab` component — there is no meaningful reason to defer it given it is already fully designed. The Priority 2 rating signals that if the sprint hits a hard constraint, it is the first item to drop without breaking the feature.
- Story 7 (Pagination) is classified Priority 1 rather than 2 despite a workaround existing (50-row hard limit on first load). The workaround is misleading: an admin who sees 50 rows has no signal that more exist. Shipping a paginated table from the start avoids a confusing v1 that has to be retrofitted. The implementation is described in full in the spec and design; there is no incremental cost argument for deferral.
- The `logout` action type (FR-14, FR-15) and the `POST /api/auth/logout` endpoint are part of Story 9 (Priority 1). The spec's own Out of Scope clause notes that if the endpoint does not exist at implementation time, logout logging is deferred to the backend developer as part of this feature's scope. The architect has confirmed the endpoint in the design. This is not a reason to reduce Story 9's priority — it is a scoping note for the backend developer.
- CSV Export (Story 8) is deferred not because it is technically difficult but because it adds a second backend endpoint, a streaming response implementation, truncation handling, and a UI warning banner — all for a use case (offline analysis, stakeholder reporting) that has not been demonstrated as a day-1 need for a single-admin platform in early growth. Revisit when the admin has expressed a concrete need.
- No tier gate changes are required. Both features are admin-only. The existing `require_admin()` dependency covers backend auth. No free/starter/pro entitlement logic is touched.

**PO gate decision:** Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 17Jun2026

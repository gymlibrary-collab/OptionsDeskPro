# Release Note — Admin Health Monitor and User Activity Log

**Date:** 17Jun2026  
**Version:** Included in next deployment

---

## What's new

Two new admin-only tabs — **Health** and **User Actions** — give the platform administrator real-time visibility into system component status and granular user activity events. The existing Activity Log tab is renamed "Activity Log (Logins)" to distinguish it from the new feature. No impact on end users or subscription tiers.

---

## Admin — Health Monitor

The **Health** tab displays real-time status for five critical platform components:

- **Backend API** — confirms the backend is reachable and shows API response time measured client-side.
- **Supabase Database** — health probe executes a lightweight database query and reports response time.
- **yfinance Market Data** — probes the market data service with an SPY quote request.
- **Gemini AI** — confirms the API key is configured and executes a minimal generation call.
- **StockTwits** — probes the social data API endpoint.

Each component displays a status badge (Healthy / Degraded / Error), response time in milliseconds, timestamp of last check, and any error message.

**Overall System Status banner** at the top shows one of three states:
- **All Systems Operational** (green) — all five components are healthy.
- **Degraded** (amber) — at least one component is degraded; none are in error.
- **Outage Detected** (red) — at least one component is in error.

**Manual Refresh button** triggers an immediate re-poll of all five components. The button is disabled while a check is in progress.

**Auto-refresh** runs automatically every 60 seconds while you are viewing the Health tab. Auto-refresh stops when you navigate away and resumes when you return.

**Client-side rate limiting** prevents accidental hammering of external services: manual refreshes are throttled to once per 30 seconds.

---

## Admin — User Actions

The **User Actions** tab shows a paginated, filterable log of all user activity events (distinct from the existing login-only Activity Log). Records include:

- **Timestamp** — when the event occurred (ISO 8601, local time).
- **User Email** — email of the user who triggered the event.
- **Action Type** — one of: login, logout, ticker_search, strategy_scan, options_chain_view, paper_trade_placed, watchlist_update, ai_query.
- **Detail** — action-specific context (e.g. symbol name, trade strategy, leg details, IP address).
- **IP Address** — client IP extracted from the request (X-Forwarded-For preferred, falls back to request source).

**Filter bar** accepts:
- **User Email** — partial match (e.g. "alice@" finds "alice@example.com").
- **Action Type** — exact match against the 8 enum values, or "All".
- **Date From** — ISO date (YYYY-MM-DD); includes all times from 00:00:00 UTC.
- **Date To** — ISO date (YYYY-MM-DD); includes all times through 23:59:59 UTC.
- **Apply button** — runs the filtered query. Filters do not apply on keystroke.

**Pagination** shows 50 rows per page. Navigation controls display current page, total pages, and a row count summary ("Showing X–Y of Z results").

**Empty state** when no rows match: "No actions recorded matching the current filters."

**Total event count** displayed above the table and updated whenever filters are applied.

**Data retention** — user action events are retained for 30 days and automatically purged daily at 3:00 AM UTC by a scheduled pg_cron job.

---

## Activity Logging

User actions are recorded automatically and require no configuration:

- **Login** — recorded when the user completes successful authentication.
- **Logout** — recorded when the user signs out (calls the new `POST /api/auth/logout` endpoint before invalidating the Supabase session).
- **Ticker Search** — recorded on `GET /api/options/quote/{symbol}` (authenticated users only).
- **Options Chain View** — recorded on `GET /api/options/chain/{symbol}` (authenticated users only).
- **Strategy Scan** — recorded on `GET /api/strategies/scan` (authenticated users only).
- **Paper Trade Placed** — recorded on successful trade execution (buy, sell, or multi-leg strategies).
- **Watchlist Update** — recorded on `PUT /api/watchlist`.
- **AI Query** — recorded on any authenticated call to an AI generation endpoint (chat, risk summary, narrative, earnings awareness, morning briefing, trade journal, roll advisor, greeks coaching).

**Fire-and-forget logging** — if a logging write fails (e.g. Supabase unavailable), the failure is silently dropped and does not affect the user's request. Activity log misses are logged internally at WARNING level but never block user operations.

---

## Deployment steps

1. Deploy the backend code containing the new routes:
   - `GET /api/admin/health-check` — health check endpoint (admin-gated).
   - `GET /api/admin/activity-log` — paginated activity log query (admin-gated).
   - `POST /api/auth/logout` — logout event logging endpoint (authenticated users).
   - Activity logging injection points in `options.py`, `orders.py`, `strategies.py`, `watchlist.py`, `auth_routes.py`, and `ai_routes.py`.

2. Run the Supabase migration `015_user_action_log.sql`:
   - Creates the `user_action_log` table with indexes on `created_at DESC` and `user_email`.
   - Enables RLS (service role writes and admin reads only; no direct user access).
   - Schedules a pg_cron job to purge rows older than 30 days daily at 3:00 AM UTC.
   - **Prerequisite:** pg_cron extension must be enabled in your Supabase project (via Dashboard → Database → Extensions). If pg_cron is unavailable, the migration will fail on the `cron.schedule()` call; consult the operator or enable the extension and re-run.

3. Deploy the frontend code containing:
   - `HealthTab` sub-component and state management.
   - `UserActionsTab` sub-component with filters, pagination, and detail rendering.
   - Updated tab bar in `AdminPanel.tsx` (add "Health" and "User Actions" tabs; rename "Activity Log" to "Activity Log (Logins)").
   - New API functions in `client.ts`: `getHealthCheck()`, `getActivityLog()`, `postLogout()`.
   - Updated `AuthContext.tsx` to call `postLogout()` on sign-out.

4. Verify:
   - Sign in as an admin user.
   - Navigate to the Admin panel.
   - Confirm the "Health" tab appears and displays all five component cards.
   - Click Refresh and confirm all components update.
   - Confirm the "User Actions" tab appears and shows activity from the past 30 days.
   - Confirm the "Activity Log (Logins)" tab still shows login aggregates (unchanged).

---

## Rollback procedure

If a critical issue is discovered post-deployment:

1. **Revert the frontend code** to the previous deployment. The Admin panel will hide both new tabs automatically (the conditional render will be removed).
2. **Revert the backend routes** (health-check, activity-log, logout) and remove activity logging injection points from route handlers.
3. **Skip the migration rollback.** The `user_action_log` table and pg_cron job can remain in place; they are inert until the backend writes to them. Do not drop the table mid-deployment as it may cause transient 500 errors if a write in-flight attempts to access it.
4. If you must drop the table: connect to Supabase SQL Editor, disable the pg_cron job (`select cron.unschedule('purge-user-action-log-30d')` if cron access is available), then `DROP TABLE user_action_log CASCADE`. Verify the app still functions before completing the rollback.

---

## Known limitations

- **CSV Export deferred** — The export-to-CSV button and `GET /api/admin/activity-log/export` endpoint were deferred per product owner decision at Gate 2. The filter and pagination UI are complete; export will be added in the next admin tooling iteration.
- **pg_cron prerequisite** — If the Supabase project does not have pg_cron enabled, the migration's `cron.schedule()` call will fail. Contact the operator to enable the extension via the Supabase Dashboard, or manually delete the `cron.schedule()` statement from the migration and implement retention pruning via an alternative mechanism (e.g. Supabase Edge Function or external Lambda).
- **IP spoofing** — Client IP is extracted from X-Forwarded-For header (set by Railway's reverse proxy) or request.client.host. If a user is behind a proxy or CDN that strips X-Forwarded-For, the captured IP may not be accurate. This is informational only and not a security control.
- **No real-time push** — The Health tab polls on a 60-second cycle with a 30-second manual refresh throttle. No WebSocket or Server-Sent Events. Component failures are not broadcast; admins must view the tab to see updates.
- **No alerting** — No automated notifications (email, Slack) when a component goes into error state. Manual observation only.
- **No drill-down** — Component cards show one status, one response time, and one error message. No nested detail view of per-component logs or metrics.
- **No historical tracking** — Health probe results are not persisted. The tab shows only the current state; uptime percentages and historical charts are not available.

---

## Operator Assessment

_To be filled by operator agent._

---

## Deployment Checklist

Pre-deployment:
- [ ] pg_cron extension enabled in Supabase Dashboard → Database → Extensions
- [ ] Run migration `015_user_action_log.sql` in Supabase SQL editor
- [ ] Confirm migration completed without errors (check for pg_cron WARNING if extension not enabled — WARNING is acceptable, ERROR is not)

Deployment:
- [ ] Push to main triggers Railway auto-deploy for backend service
- [ ] Push to main triggers Railway auto-deploy for frontend (client + admin) services
- [ ] Monitor Railway deploy logs for startup errors

Post-deployment verification:
- [ ] Sign in as admin, navigate to admin portal
- [ ] Click "Health" tab — verify 5 component cards load within 15 seconds
- [ ] Verify "All Systems Operational" banner (or expected degraded status if a service is down)
- [ ] Click "Refresh" — verify button disables during fetch, re-enables after
- [ ] Click "User Actions" tab — verify filter bar and table load
- [ ] Perform a test action as a non-admin user (e.g., search a ticker)
- [ ] Return to User Actions tab, filter by test user's email, verify event appears
- [ ] Verify "Activity Log (Logins)" tab still works and is labelled correctly
- [ ] Sign out — verify logout succeeds normally (postLogout() must not block signout)

Rollback:
- [ ] Revert the Railway deployment to the previous backend/frontend image via Railway dashboard
- [ ] Migration 015 does NOT need to be rolled back — the new table is additive and unused by old code

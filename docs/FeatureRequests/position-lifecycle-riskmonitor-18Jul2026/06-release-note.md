# Release Note — Position Lifecycle & Risk Monitor Improvements

**Release date:** 19Jul2026
**Branch:** `claude/modest-davinci-sxz7lv` (commits f14375a frontend, 6cb44bd backend)
**Author:** Technical Writer + DevOps Engineer

---

## What changed

- **Expired positions now auto-close.** Open the Positions tab and any position whose option contracts expired (expiry date is in the past) will automatically settle. The system records a closing order at the settlement value, removes the position from Open Positions, and displays the outcome in a new "Closed Positions" section collapsed below the Open Positions table. The section shows the past 90 days of closed trades.

- **Settlement source badges show how price was determined.** Each closed position displays a badge indicating which of three methods was used: **Market** (system found a last-traded price), **Intrinsic** (calculated from the underlying's official close on the expiry date), or **Expired Worthless** (contract expired out-of-the-money and no price data was available).

- **Close price is now editable.** When closing a position from the Positions tab, a "Closing price (per contract)" field appears pre-populated with the current mark price. Edit it to any non-negative value (including $0.00) to record the price you actually got, then click Confirm Close. The proceeds/cost estimate updates as you type.

- **Risk Monitor shows underlying spot price per trade.** Each trade row in the Risk Monitor left panel and the detail panel header now displays the current stock price of the underlying next to the strategy name.

- **Underlying ticker chip added to Risk Monitor trade headers.** Each trade in the Risk Monitor list panel is labelled with the underlying ticker symbol (e.g. "Long Call Vertical Spread · INTC") for instant identification. The same ticker appears in the detail panel header.

- **ENTRY→NOW price line now stays on one line.** The "ENTRY→NOW $X.XX → $Y.YY" text in Risk Monitor leg cards no longer wraps at any viewport width, reducing eye strain when scanning entries and current prices.

---

## Why it changed

Expired positions were lingering in Open Positions with stale prices; users couldn't see what happened to them without manual digging. Closed Positions makes the final outcome visible automatically with a source badge so you know the settlement method.

Close price is now editable so paper trades match the actual fills you simulated, not the app's mark. Risk Monitor gets spot price and ticker so you can see where each trade is positioned without switching tabs. The ENTRY→NOW wrap fix improves readability on all screen sizes.

---

## Who it affects

| Tier | Available | Notes |
|------|-----------|-------|
| free | Yes | Auto-close (FR-1) and manual close price (FR-5) available. Risk Monitor features (FR-2/3/4) controlled by existing `risk_monitor` tier gate. |
| starter | Yes | Same as free. Risk Monitor features follow existing tier config. |
| pro | Yes | Same as free. Risk Monitor features follow existing tier config. |
| enterprise | Yes | Full access to all five changes. |

---

## Action required by users

None. The features work automatically when you open the Positions or Risk Monitor tabs.

---

## Known limitations

- **Manual close price has no server-side upper bound.** A user can enter $999,999 as a close price in paper trading. This is accepted as intentional for a paper-trading tool; suitability guards are out of scope. A future update may add an optional warning.

- **Closed trades from before this release do not appear in Closed Positions.** Only trades closed (or auto-settled) after this deploy show in the section. Historical closed orders still exist in the Orders tab and can be filtered there.

- **First load after a long absence may settle slowly.** If you have many expired positions (e.g. you haven't opened the app in weeks), the system settles a maximum of 10 per request to prevent event-loop blocking. Remaining expired positions settle on the next Positions tab open. Manual Refresh button can speed this up.

- **Settlement interrupted by a crash can leave an orphaned position.** If the server crashes between the point where an expired position's closing order is recorded and its cash is credited, the position row and order row may be out of sync. See ADR-0015 for reconciliation guidance. This is rare and deferred to a future reconciliation task.

---

## Deployment steps

1. **Apply the Supabase migration** (additive, safe on a live database):
   ```bash
   # In Supabase SQL editor, run:
   # backend/migrations/025_position_lifecycle.sql
   ```
   This adds nullable columns (`leg_role`, `settlement_metadata`) to the `orders` table and extends the `user_action_log` action type constraint. Idempotent — safe to run multiple times.

2. **Merge the branch to main:**
   ```bash
   git checkout main && git pull origin main
   git merge --ff-only origin/claude/modest-davinci-sxz7lv
   git push origin main
   ```

3. **Railway auto-deploys backend and frontend.**
   - Backend redeploy triggered; new code calls `auto_settle_expired()` on `GET /api/positions`, `GET /api/portfolio`, and `GET /api/positions/risk`.
   - Frontend redeploy; new components render Closed Positions accordion, editable close price modal, spot price and ticker in Risk Monitor.

4. **Smoke test (5 min):**
   - Ensure at least one test account has an expired position in Supabase `positions` table (set `expiry` to yesterday's date).
   - Sign in and open the Positions tab.
   - Verify the expired position does NOT appear in the Open Positions table.
   - Verify a row appears in the Closed Positions section (collapsed by default) with:
     - Symbol, strategy name, expiry date, settlement price, realised P&L ($ and %), and a source badge (Market / Intrinsic / Expired Worthless).
     - Cash balance in the portfolio summary adjusted by the settlement proceeds (e.g. long call settled at $1.50 = +$150 cash).
   - Click a position's Close button and verify the modal shows an editable "Closing price (per contract)" field pre-filled with the mark price.
   - Change the price and verify the "Est. proceeds" line updates in real time.
   - If `risk_monitor` is enabled on the test account, open Risk Monitor and verify:
     - Each trade row shows the underlying's current spot price (e.g. "$456.78").
     - Underlying ticker appears as a chip next to the strategy name (e.g. "Bull Call Spread · AAPL").
     - Leg card ENTRY→NOW text stays on one line when resized to 320px width.

---

## Rollback procedure

1. **Revert the merge commit:**
   ```bash
   git checkout main && git pull origin main
   git reset --hard origin/main~1
   git push origin main --force
   ```
   (Only necessary if the deploy caused production incidents. Ask DevOps before force-pushing.)

2. **Redeploy the previous backend and frontend builds on Railway** to the versions active before the merge.

3. **Verify rollback:**
   - Open Positions tab; expired positions should reappear as open (old behaviour).
   - Close button should not show the editable price field.
   - Risk Monitor should not show spot price or ticker chips (if it was enabled).
   - ENTRY→NOW text may wrap again.

4. **Migration 025 can remain in place** (it is additive and nullable). Old code will not use the new columns. No rollback SQL is required.

---

## Post-deployment monitoring

Watch for the following in the first 24 hours:

- **Supabase write load:** Settlement runs on every Positions / Portfolio / Risk Monitor load. Monitor Supabase query performance and connection count for unexpected spikes. If query times degrade, check for the M01 fix (asyncio.to_thread + 10-position-per-request cap); the fix is in place to prevent event-loop blocking.

- **Error rate on `/api/positions`, `/api/portfolio`, `/api/positions/risk`:** Watch Railway logs for 5xx errors. Common failure modes: yfinance timeouts (fallback to intrinsic value, not an error), missing underlying historical data (settles at $0, logged as "Expired Worthless"). All are graceful.

- **User action log growth:** `position_auto_settled` actions are now logged to `user_action_log` for each settlement. Monitor table size; no purge policy is in place yet (backlog item).

- **Closed Positions queries:** If the "Closed Positions" section is slow to render, check that the `orders` table query filtering on `status = 'auto_settled' OR status = 'filled'` and `role = 'close'` is optimised with an index on `(user_id, status, role)` if not already present.

---

## Post-release notes

- **Late-sweep settlement pricing:** On the first load after a user's long absence, settlement computes intrinsic value using yfinance's `ticker.history(start=expiry_date, end=expiry_date+1day)` for the underlying. This reliably returns the official close price even for dates weeks in the past. If yfinance is slow or returns no data, the settlement falls back to $0.00 worthless.

- **Idempotency guaranteed by row absence:** Auto-settle is re-entrant safe because the logic deletes the `positions` row before returning. Calling settle on an already-settled position finds no row and exits silently.

- **Paper trading only:** No real-money or real-broker implications. All settlement is calculated on paper; no API calls to Alpaca or other brokers occur.

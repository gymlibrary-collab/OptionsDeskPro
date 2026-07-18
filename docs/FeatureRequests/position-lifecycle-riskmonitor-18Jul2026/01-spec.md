# Feature Spec — Position Lifecycle & Risk Monitor Improvements

**Date:** 18Jul2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

This bundle closes five gaps in the position management and Risk Monitor surfaces. Two items are substantive backend changes (auto-closing expired contracts, manual closing price at close time). Three items are small, targeted UI fixes to the Risk Monitor (show underlying spot price per trade, prevent the ENTRY→NOW price line from wrapping, add the underlying ticker to the trade header).

All five items share the same user population: any authenticated, whitelisted user who holds paper trades. There is no new entitlement gate — these are quality-of-life improvements to existing tier-gated features (`positions` and `risk_monitor`). The feature has no real-money implications; it operates entirely within the paper-trading sandbox.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Active paper trader | free / starter / pro / enterprise | Know what happened to contracts that expired without being manually closed — see the final outcome without having to hunt for it |
| Risk Monitor user (desktop) | starter / pro / enterprise | Read each trade card without eye-strain caused by wrapping text and missing context |
| Risk Monitor user (mobile) | starter / pro / enterprise | Same as above; the ENTRY→NOW wrap is worse on small screens |
| Any user closing a trade | free / starter / pro / enterprise | Record the actual fill price rather than the app's stale mark |

---

## 3. Functional Requirements

### FR-1 — Auto-close expired positions (backend + frontend)

1. The system must detect positions whose `expiry` date is strictly in the past (i.e. `expiry < today`).
2. On detection, the system must compute a settlement value for each expired leg and record a closing order at that value, then remove the position row from `positions`.
3. For the settlement value the system must apply this priority chain:
   a. If yfinance can still return a last-traded price for the expired contract symbol, use that price.
   b. Otherwise compute intrinsic value from the underlying's last close on the expiry date: `max(spot_on_expiry − strike, 0)` for calls and `max(strike − spot_on_expiry, 0)` for puts. If the option expired OTM, intrinsic value is `0.00`.
   c. If the underlying's historical close on the expiry date cannot be fetched, use `0.00` (expired worthless) and flag the settlement as estimated.
4. The closing order recorded to `orders` must carry `action = 'sell'` (for long positions) or `action = 'buy'` (for short positions), `status = 'auto_settled'`, and the settlement price in the `price` column. The `strategy_key`, `strategy_name`, and `profit_target_pct` from the original position must be preserved.
5. Cash must be adjusted on settlement: long contracts receive `settlement_price × |quantity| × 100`; short contracts pay `settlement_price × |quantity| × 100` (subtracted from cash).
6. The auto-settle process must run server-side. It must be triggerable on every call to `GET /api/positions` and `GET /api/positions/risk` (lazy evaluation: check only when those endpoints are hit, not on a cron schedule). This avoids requiring a background worker or Railway scheduled task.
7. Auto-settle must be idempotent: re-running on an already-settled position must have no effect.
8. The final outcome of each settled trade (strategy name, symbol, expiry, settlement price, realised P&L) must be visible to the user in a "Closed Positions" section rendered below the Open Positions table in the Positions tab. The section must be collapsible and default to collapsed to keep the page uncluttered. It reads from the `orders` table filtered to `status = 'auto_settled'` or `status = 'filled'` on close-leg orders (role = `'close'`).

   _Design proposal for placement:_ A collapsible accordion labelled "Closed Positions" directly under the open-positions table in `Positions.tsx`. Each row shows: symbol, strategy, expiry, settlement price, realised P&L ($), realised P&L (%), and a settlement source badge ("Market" / "Intrinsic" / "Expired Worthless"). This proposal is subject to architect sign-off.

9. The auto-settle process must log its actions to the existing `activity_log` infrastructure so the admin panel's activity feed reflects settlements.

### FR-2 — Underlying spot price in Risk Monitor

10. Each trade row in the Risk Monitor list panel (`RiskListRow`) and each trade detail panel (`RightPanelHeader`) must display the current spot price of the underlying stock.
11. The spot price must be sourced from the same `stockPrices` map already fetched by `RiskMonitor` on load (the component already calls `getQuote` for each unique symbol and stores results in `stockPrices`). No additional API calls are required.
12. The spot price display must include the dollar sign, formatted to two decimal places.
13. If the spot price for a symbol is unavailable (fetch failed), the field must be omitted silently — no placeholder or error text.

### FR-3 — Fix ENTRY→NOW line wrap in Risk Monitor leg cards

14. In `LegCard`, the bottom row containing "ENTRY→NOW $X.XX → $Y.YY" and the P&L dollar figure must render on a single line at all supported viewport widths.
15. The fix must not truncate the price values. If horizontal space is genuinely too narrow, the P&L dollar figure may wrap below the ENTRY→NOW text, but the ENTRY→NOW text itself must remain on one line (`white-space: nowrap`).
16. The fix must be a CSS-only change confined to `LegCard`. No data model changes.

### FR-4 — Show underlying ticker next to trade header in Risk Monitor

17. In `RiskListRow` (left panel list item), the strategy/trade label (e.g. "Long Call Vertical Spread") must be accompanied by the underlying ticker symbol (e.g. "INTC") on the same header row.
18. The ticker must be visually distinguished from the strategy name — for example, rendered as a small chip or parenthetical in a muted/accent colour so the eye naturally reads "Long Call Vertical Spread · INTC".
19. The ticker is already present on the `StrategyGroup` object via `group.positions[0].symbol`. No new data fetching is needed.
20. The same ticker display must also appear in `RightPanelHeader` (the detail panel header), adjacent to the strategy name.

### FR-5 — Manual closing price on close

21. When the user clicks "Close" on a position row in the Positions tab, the confirmation modal must expose a price input field pre-populated with the position's current mark price (`closingPos.current_price`).
22. The user must be able to edit this price to any non-negative value before confirming. The field must reject negative values with an inline error.
23. When the user confirms, the system must use the user-entered price (not `closingPos.current_price`) as the `price` field in the closing order leg sent to `POST /api/trades/record`.
24. The estimated proceeds / cost line in the modal must update reactively as the user types a new price: `user_entered_price × closeQty × 100`.
25. The existing behaviour — price pre-populated from current mark — must be preserved as the default so users who do not edit the field continue to get the same outcome as today.
26. No backend schema change is required for FR-5: the `price` column in `orders` already accepts any `numeric(10,4)` value.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Auto-close expired positions

**As a** paper trader, **I want** the app to automatically settle and close positions whose option contracts have expired **so that** I can see my final P&L on those trades without them lingering as open positions with stale/zero prices.

**Acceptance Criteria:**
- [ ] AC1-1: Open the Positions tab with at least one position whose `expiry` date is yesterday or earlier. The position must not appear in the Open Positions table. A matching row must appear in the Closed Positions section with the settlement price and realised P&L.
- [ ] AC1-2: The Closed Positions section is collapsed by default and expands on click. When there are no closed positions, the section is not rendered.
- [ ] AC1-3: A closed position row shows: symbol, strategy name (or "Manual"), expiry date, settlement price, realised P&L ($), realised P&L (%), and a source badge. If the underlying historical close was used, the source badge reads "Intrinsic"; if the option expired OTM and settled at zero, the source badge reads "Expired Worthless"; if a live/last market price was available, the source badge reads "Market".
- [ ] AC1-4: The cash balance in the portfolio summary reflects the settlement proceeds. For a long call that settled at $1.50 on 1 contract: cash increases by $150. For a short put that settled at $0.00: cash is unchanged (contract expired worthless, premium already collected at open).
- [ ] AC1-5: Refreshing the page does not re-settle an already-settled position. The closed position appears only once in the Closed Positions section.
- [ ] AC1-6: Reloading `GET /api/positions/risk` also triggers auto-settle if unexpired positions remain; the Risk Monitor shows only open, non-expired positions.

### Story 2 — Underlying spot price in Risk Monitor

**As a** Risk Monitor user, **I want** to see the current stock price of the underlying next to each trade **so that** I can immediately gauge where the underlying is trading relative to my strike without switching tabs.

**Acceptance Criteria:**
- [ ] AC2-1: In the left-panel list, each trade row displays the current underlying spot price, formatted as e.g. "$47.83", adjacent to or below the strategy name.
- [ ] AC2-2: In the detail panel header (`RightPanelHeader`), the current spot price of the underlying is visible, formatted to two decimal places.
- [ ] AC2-3: If the spot price fetch for a given symbol fails, neither the list row nor the detail panel shows an error or placeholder text — those elements are simply omitted.
- [ ] AC2-4: The spot price in both locations updates when the Risk Monitor refreshes (every 5 minutes or on manual Refresh click).

### Story 3 — Fix ENTRY→NOW line wrap

**As a** Risk Monitor user, **I want** the "ENTRY→NOW $X.XX → $Y.YY" text in a leg card to stay on one line **so that** I can read entry and current price at a glance without the line breaking mid-read.

**Acceptance Criteria:**
- [ ] AC3-1: Open the Risk Monitor with at least one open position. Inspect any LegCard at 320px viewport width (minimum mobile breakpoint) and at 1440px (desktop). In both cases the text "ENTRY→NOW $X.XX → $Y.YY" renders on a single line.
- [ ] AC3-2: The fix is applied by adding `white-space: nowrap` (or equivalent) to the ENTRY→NOW span element. No price values are truncated.
- [ ] AC3-3: The P&L dollar figure on the same row may wrap below on very narrow viewports, but the ENTRY→NOW text itself must not break.

### Story 4 — Underlying ticker in Risk Monitor trade header

**As a** Risk Monitor user, **I want** to see which underlying stock each trade is on, next to the strategy name **so that** I can identify the trade instantly without opening the detail panel.

**Acceptance Criteria:**
- [ ] AC4-1: In the left-panel list, each trade row displays the underlying ticker symbol adjacent to the strategy/trade label. Example: "Long Call Vertical Spread · INTC" or "INTC" rendered as a chip after the label.
- [ ] AC4-2: In the detail panel header, the underlying ticker is displayed adjacent to the strategy name.
- [ ] AC4-3: For single-leg trades with no strategy name (label falls back to the symbol itself), the ticker is not duplicated — it appears once, not twice.
- [ ] AC4-4: The ticker display is consistent across desktop (split panel) and mobile (accordion) layouts.

### Story 5 — Manual closing price

**As a** paper trader, **I want** to enter my own closing price when closing a position **so that** my paper-trade record reflects the price I actually simulated getting, not a potentially stale mark that the app fetched.

**Acceptance Criteria:**
- [ ] AC5-1: Clicking "Close" on any position in the Positions tab opens the confirmation modal. The modal contains a price input field labelled "Close price" (or similar) pre-populated with the current mark price.
- [ ] AC5-2: Editing the price field to a valid positive number and clicking "Confirm Close" records the closing order with the user-entered price, not the original mark.
- [ ] AC5-3: Entering a negative number in the price field shows an inline validation error ("Price must be ≥ 0") and disables the Confirm Close button until corrected.
- [ ] AC5-4: The "Est. proceeds / cost" line in the modal updates in real time as the user types a new price. Example: qty=2, price typed as 3.50 → est. proceeds = $700.00.
- [ ] AC5-5: Leaving the price field at its pre-populated value and clicking "Confirm Close" produces the same outcome as the current behaviour (closes at the current mark price).
- [ ] AC5-6: A partial close (qty < max) at a user-entered price records the correct qty and price combination.

---

## 5. Out of Scope

- Real-money broker integration: settlement data from a real broker (Alpaca or similar) is explicitly excluded per CLAUDE.md invariants.
- Automatic daily cron job for expiry processing: the auto-settle is lazy (triggered on endpoint call), not scheduled. A background scheduler is out of scope for this bundle.
- Pin-to-settled-price for P&L chart: the `pnl_snapshots` table already captures portfolio value at the time of each snapshot. No retroactive snapshot backfill for the settlement date is required.
- Push notifications or email on expiry: no notification system exists in the platform and none is added by this bundle.
- Manual override of the settlement source (e.g., the user choosing to use intrinsic value instead of market price): the system applies the priority chain automatically.
- Edit of the closing price after confirmation: once an order is recorded in the `orders` table, it is an immutable audit record. The existing "Edit avg cost" feature in the Positions tab provides a workaround for cost basis corrections.
- UI redesign of the Closed Positions section: the layout is intentionally minimal for this iteration.
- Leaderboard impact remediation: the admin leaderboard reads from `pnl_snapshots.total_pnl`, which already includes settled positions (their P&L flows through `portfolio_value` at snapshot time). No leaderboard schema changes are required.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| yfinance cannot return the expired contract | System falls back to intrinsic-value calculation using underlying's historical close. Source badge = "Intrinsic". |
| yfinance cannot return the underlying's historical close on the expiry date | System settles at $0.00 (expired worthless). Source badge = "Expired Worthless". Cash impact: long position loses full premium (already deducted at open), short position retains full premium (already credited at open). |
| Position has already been auto-settled (position row deleted, order row exists with `status = 'auto_settled'`) | Auto-settle logic finds no position row; exits without action. Idempotency guaranteed by the absence of a positions row. |
| User enters $0.00 as a manual closing price | Treated as a valid close at zero (e.g. expired worthless on a long). Not blocked — $0.00 is a legitimate closing price. |
| User enters a price far above the theoretical maximum (e.g. $99,999) | Accepted without server-side rejection in this iteration. This is a paper-trading tool; suitability guards on order price are out of scope. A future BA spec may add a "sanity check" warning. |
| stockPrices fetch times out in Risk Monitor | Spot price columns are omitted silently (FR-2, AC2-3). No error state shown. |
| Multi-leg strategy where some legs expired and some did not | This cannot occur in practice because all legs of a strategy share the same expiry date in the current data model. The auto-settle logic processes by `positions` row (one row per leg), so all rows for the strategy will be settled independently on the same trigger. |
| Portfolio has no positions / no expired positions | Positions tab shows empty state for Open Positions; Closed Positions section is not rendered. Risk Monitor shows "No open positions to monitor". |
| Admin user viewing admin panel leaderboard after auto-settle runs | Leaderboard reads from the most recent `pnl_snapshots` row per user. If no snapshot was taken on the settlement day, the leaderboard shows the most recent prior snapshot. No action required. |

---

## 7. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|--------------|
| yfinance | FR-1: Look up last-traded price of expired contract and historical close of underlying on expiry date. FR-2: Already in use via `getQuote`. | Rate-limited; no hard daily cap but may be throttled under heavy use. The lazy-settle on endpoint call (not cron) keeps load proportional to user activity. |
| Supabase Postgres | FR-1: Write `orders` row (auto_settled), delete `positions` row, update `portfolios.cash`. FR-5: No schema change; existing `orders.price` column stores user-entered value. | Standard write operations; no new tables required in this bundle. |
| Claude API | Not used by any of the five items in this bundle. | No impact. |
| Reddit PRAW | Not used. | No impact. |

**Design consideration — expired option price availability in yfinance:**
yfinance typically drops expired option contract data within a day of expiry. The `get_options_chain` function already handles the "no chain returned" path. For FR-1 the primary settlement path will therefore almost always fall through to intrinsic-value calculation. The architect must design the `get_historical_close(symbol, date)` helper accordingly: yfinance's `ticker.history(start=expiry_date, end=expiry_date + 1 day)` reliably returns closing OHLCV for the underlying even for past dates, making this path robust. This is called out explicitly because it affects the reliability guarantee in AC1-3 and AC1-4.

---

## 8. Subscription Tier Impact

All five items affect features that are already gated by the `positions` and `risk_monitor` entitlements. No new tier gates are introduced.

| Tier | Behaviour |
|------|-----------|
| free | `positions` feature is included per current tier config. Auto-settle (FR-1) runs for free-tier users. Manual close price (FR-5) available. Risk Monitor entitlement (`risk_monitor`) controls access to FR-2/3/4 — behaviour unchanged: free tier access follows existing config. |
| starter | Same as free for FR-1/5. `risk_monitor` access as per current entitlement config. FR-2/3/4 visible to entitled users. |
| pro | Full access to all five items. |
| enterprise | Full access to all five items. |

No scan-count deductions, watchlist-slot consumption, or AI-token costs are associated with any of these items.

---

## 9. Open Questions for Product Owner Decision

The following questions must be answered before the architect can finalise the design:

**OQ-1 (FR-1 — Closed Positions placement):** The spec proposes a collapsible "Closed Positions" accordion below the open-positions table in the Positions tab. An alternative is a dedicated sub-tab within the Positions tab (e.g. "Open | Closed" toggle at the top). Which layout does the product owner prefer?

**OQ-2 (FR-1 — Retention period for closed positions):** Should the Closed Positions section show all historical closed trades (possibly hundreds over time) or only the most recent N (e.g. 30 days)? The `orders` table has no purge policy. Without a limit, the section could become very long for active users.

**OQ-3 (FR-1 — Auto-settle trigger timing):** The spec proposes lazy settlement triggered on `GET /api/positions` and `GET /api/positions/risk`. Should it also trigger on `GET /api/portfolio`? The portfolio summary currently shows unrealised P&L on expired (but not yet settled) positions at $0, which looks wrong until the next settle trigger fires. Including `GET /api/portfolio` as a trigger would fix this but adds one extra DB write per portfolio fetch.

**OQ-4 (FR-1 — Cash treatment for short positions that expired in-the-money):** For a short call that expired ITM, the option was exercised against the user. In real trading this causes assignment (100 shares sold at strike). In paper trading, should the system simulate assignment cash flow (`−(strike − expiry_close) × 100 × qty` debited) or simply treat settlement as "buy to close at intrinsic value" (same economic outcome, simpler)? The spec currently uses the "buy to close at intrinsic" model. Confirm this is acceptable.

**OQ-5 (FR-5 — Price field label):** The current modal row is labelled "Close price (current)". After the change it should reflect user editability. Suggested label: "Close price". Does the product owner prefer a different label or helper text (e.g. "Edit if your fill differed from the mark")?

---

## 10. Product Owner Annotations

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — Auto-close expired positions | | |
| Story 2 — Spot price in Risk Monitor | | |
| Story 3 — Fix ENTRY→NOW wrap | | |
| Story 4 — Ticker in trade header | | |
| Story 5 — Manual closing price | | |

**MVP boundary:** [Stories in v1]

**Deferred to backlog:** [Stories deferred]

**PO gate decision:** ☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

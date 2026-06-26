# Feature Spec — Risk Monitor Layout Redesign (Master-Detail Split)

**Date:** 27Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

The Risk Monitor tab (`frontend/src/components/RiskMonitor.tsx`) currently renders all open positions as a vertical stack of large tile cards (`PositionCard` / `StrategyGroupCard`). Each card expands with metric tiles and defensive narrative. As a user accumulates 10+ open positions across multiple strategy groups, the page becomes unworkably long: there is no way to see all trades at a glance, to compare their relative urgency, or to navigate directly to the one that needs attention.

This feature replaces the current single-column layout with a **Master-Detail Split (Layout C)** design. A fixed-width left panel lists every open strategy group in one compact row each, sorted newest-first by trade entry date, with colour-coded left-border risk indicators and mini progress bars. Clicking a row loads the full position detail in a right panel — leg cards, action plan, and defensive narrative — without leaving the page or losing sight of the other trades. On mobile (viewport width 768px or less) the layout collapses to a single-column accordion.

A supporting backend change adds `entered_at` (ISO date string, e.g. `"2026-06-25"`) to every item in the `GET /api/positions/risk` response. This field is the date the position was first opened (sourced from the earliest matching `orders.created_at` for that strategy group) and is used by the frontend for the left-panel sort and entry-date display.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Active paper trader | starter / pro | Scan all open trades in one view and immediately identify which ones need action today, without scrolling through every card |
| Beginner learner | free / starter | See that a recently entered trade has turned red and navigate to its full detail and action plan in one tap |
| Strategy researcher | pro / enterprise | Compare DTE, P&L, and risk level across multiple strategy groups opened on different dates to prioritise adjustment decisions |
| Admin | admin | Verify that the layout renders correctly for accounts with 0, 1, and 10+ open positions across multiple strategy groups |

---

## 3. Functional Requirements

### Backend

1. `GET /api/positions/risk` must include an `entered_at` field (ISO date string, e.g. `"2026-06-25"`) on every response item. The value is the calendar date of the earliest `orders.created_at` row in Supabase that matches the position by `(user_id, symbol, expiry, strike, option_type, strategy_key)`. If no matching order row is found, `entered_at` falls back to the `positions.created_at` date.

2. For positions belonging to a strategy group (shared `strategy_key`), the `entered_at` value must reflect the earliest entry order across all legs of that group — not the individual leg's first order. All legs in the same strategy group must share the same `entered_at` value in the response.

3. The `entered_at` field must be a date-only ISO string (`"YYYY-MM-DD"`), not a full timestamp, to avoid time-zone rendering issues on the frontend.

4. The `entered_at` field must be present for every item in the response array, including ungrouped positions (`strategy_key` is null or `"manual"`). It must never be null or omitted.

5. All existing fields on `PositionRisk` (`symbol`, `expiry`, `strike`, `option_type`, `quantity`, `avg_cost`, `current_price`, `pnl`, `strategy_key`, `strategy_name`, `profit_target_pct`, `entry_action`, `dte`, `pnl_pct`, `risk_level`, `iv_rank`, `iv_environment`, `bias`, `signals`, `narrative`) must be unchanged.

### Frontend — Left Panel

6. The left panel must be approximately 270px wide, fixed (non-scrolling relative to the page), with its own independent vertical scroll when the list is taller than the viewport.

7. The left panel must list one row per strategy group (or per ungrouped position). The grouping logic must remain identical to the current `StrategyGroupCard` approach: positions sharing a non-null, non-`"manual"` `strategy_key` form one group; all others appear as individual rows.

8. Rows must be sorted newest-first by the group's `entered_at` date (most recently entered trade at the top).

9. Date separator rows must divide the list by entry date. Each separator displays the full date in the format "DD Mon YYYY" (e.g. "25 Jun 2026"). Consecutive rows sharing the same `entered_at` date appear under one separator.

10. Each list row must display: the strategy name (or `symbol + option_type` for ungrouped positions), an entry-date chip reading "Entered DD Mon", the worst risk badge for the group, the highest DTE among the group's legs, the net P&L for the group (sum across all legs), and a mini P&L progress bar.

11. Each list row must have a 3px left border coloured by the group's worst risk level: `#ef4444` for red, `#eab308` for yellow, `#22c55e` for green.

12. Clicking a list row must load that group's detail in the right panel. The clicked row must be visually highlighted (distinct background from non-selected rows) until another row is clicked or the data refreshes.

13. The first row in the list must be automatically selected and its detail displayed when the component mounts (or after a data refresh), provided at least one position exists.

### Frontend — Right Panel

14. The right panel must fill the remaining horizontal width and scroll independently.

15. The right panel must display a header containing: the strategy name (or symbol), the worst risk badge, the net P&L (sum across all legs), a sub-line showing leg count, the nearest expiry date, and the IV Rank of the underlying (if available), and an entry-date banner reading "Trade entered DD Mon YYYY — N days ago" derived from `entered_at`.

16. The right panel body must display one leg card per position leg in the selected group. Each leg card must show: the symbol, BUY/SELL badge, CALL/PUT badge, the strike and expiry, a per-leg entry-date chip reading "Entered DD Mon YYYY", the leg's own risk badge, and metric tiles for DTE, Qty, Entry price, Current price, P&L, IV Rank. For short (sell) legs, the metric tiles must also include a Collected tile showing `avg_cost × qty × 100` in dollars. For long (buy) legs, the Collected tile is replaced by a Cost tile showing `avg_cost × qty × 100` in dollars. The leg card must show the signals for that leg beneath the metric tiles.

17. Below all leg cards, the right panel must display the action plan box. For groups with a losing net P&L (combined P&L < 0), the action plan box must display the full defensive narrative content (Financial Reality, Paths Forward, Summary Box) currently produced by `DefensiveNarrativeGroup` or `DefensiveNarrativeSingle`, and the close instructions currently produced by `CloseInstructions`. For groups with a non-negative net P&L, the action plan box must display the strategy-context narrative currently produced by `DefensiveNarrativeGroup` when `combinedPnl >= 0`. The action plan box must always be visible in the right panel (not hidden behind a toggle), replacing the current "Action Plan" accordion/toggle pattern.

18. If the selected group has a `narrative` object (trade narrative from the scanner), the right panel header must include a "Trade Narrative" expandable section that renders the profit/loss/defensive narrative fields from `NarrativePanel`. This section must default to collapsed.

19. The AI Risk Overview button and its result panel must remain below the split panel, visible when the user scrolls to the bottom of the right panel. The button behaviour (call to `aiRiskSummary`, loading state, error state, result display) must be unchanged.

### Frontend — Header Strip

20. The portfolio summary stat chips (Portfolio P&L, Positions count, red/yellow/green counts) must remain in their current position in the Risk Monitor header, above the split panel.

21. The Refresh button and last-updated timestamp must remain in the Risk Monitor header.

### Frontend — Empty and Loading States

22. When there are no open positions, the component must display the existing "No open positions to monitor" message centred in the content area (the split panel layout does not render).

23. The loading state must display the existing "Analysing your positions…" message centred in the content area. The split panel must not render until data has loaded.

24. If the data fetch fails, the existing error message must be displayed centred in the content area.

### Frontend — Mobile Layout

25. On viewports with width 768px or less, the split layout must collapse to a single-column accordion. The list of strategy group rows appears at the top. Tapping a row expands an inline detail section directly below that row (the same content as the right panel). Only one row may be expanded at a time; tapping an already-expanded row collapses it.

26. On mobile, the entry-date chip and mini progress bar must remain visible on each list row. The risk badge must remain visible. Strategy name may truncate with ellipsis if it exceeds available width.

### API Client

27. The `PositionRisk` TypeScript interface in `frontend/src/api/client.ts` must be extended with `entered_at: string` as a required field.

28. The `getPositionsRisk()` function signature must not change. No new API call is introduced for this feature.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Scan All Trades at a Glance

**As an** active paper trader with 10 open positions across 5 strategy groups, **I want** to see all my trades summarised in a compact left panel sorted by entry date **so that** I can immediately see which ones are newest, which are highest risk, and which have the worst P&L without scrolling through a long page.

**Acceptance Criteria:**
- [ ] AC1: Open the positions tab with 5+ strategy groups. Without scrolling, the left panel is visible and shows all group rows, each fitting on a single line with strategy name, entry-date chip, risk badge, DTE, P&L, and mini progress bar.
- [ ] AC2: The most recently entered strategy group appears at the top of the left panel list. Open the orders table and confirm the top row's `entered_at` date matches the latest `created_at` in the orders table for that strategy group.
- [ ] AC3: A date separator row (e.g. "25 Jun 2026") appears between groups entered on different dates. Two groups entered on the same date appear under a single separator.
- [ ] AC4: Each list row has a 3px left border. Red-risk groups have a red border (`#ef4444`), yellow-risk groups have a yellow border (`#eab308`), green-risk groups have a green border (`#22c55e`).

---

### Story 2 — Navigate to Full Position Detail

**As a** paper trader, **I want** to click a strategy group row in the left panel and see its full leg detail and action plan in the right panel **so that** I can review and act on one position without losing sight of the rest of my portfolio.

**Acceptance Criteria:**
- [ ] AC1: Click any row in the left panel. Within 100ms, the right panel updates to show the detail for that group without a page reload or full-component remount.
- [ ] AC2: The clicked row is visually highlighted (distinct background). The previously selected row reverts to the default background.
- [ ] AC3: The right panel header shows the strategy name, risk badge, net P&L, leg count, nearest expiry, IV Rank (if available), and an entry-date banner ("Trade entered DD Mon YYYY — N days ago").
- [ ] AC4: Clicking a different row in the left panel replaces the right panel content with the new group's detail. The left panel position (scroll) does not reset.

---

### Story 3 — View Leg-Level Detail in the Right Panel

**As a** paper trader reviewing a multi-leg iron condor, **I want** to see a separate card for each leg in the right panel **so that** I can understand which individual leg is driving the overall risk signal.

**Acceptance Criteria:**
- [ ] AC1: Select a two-leg strategy group (e.g. a vertical spread). The right panel body shows exactly two leg cards.
- [ ] AC2: Each leg card displays the symbol, BUY or SELL badge, CALL or PUT badge, strike and expiry, per-leg entry-date chip, risk badge, and metric tiles: DTE, Qty, Entry price, Current price, P&L, IV Rank.
- [ ] AC3: A SELL leg card shows a Collected tile displaying `avg_cost × |qty| × 100` rounded to the nearest dollar (e.g. "$120"). A BUY leg card shows a Cost tile with the same formula.
- [ ] AC4: Each leg card displays the signals for that leg (red and yellow signals displayed prominently; green signals displayed at reduced prominence).

---

### Story 4 — Action Plan Always Visible

**As a** beginner paper trader with a losing iron condor, **I want** the defensive narrative and action plan to be immediately visible in the right panel without having to find and click a toggle **so that** I see the guidance as soon as I select that trade.

**Acceptance Criteria:**
- [ ] AC1: Select a strategy group with a negative combined P&L. Without clicking any toggle or "Action Plan" button, the right panel displays the Financial Reality section, the Paths Forward section, and the Summary Box below the leg cards.
- [ ] AC2: For a group with a positive combined P&L, the right panel displays the strategy-context narrative (the green "net profitable" version), also without requiring a toggle click.
- [ ] AC3: The content of the Financial Reality, Paths Forward, Summary Box, and Close Instructions sections is word-for-word identical to what the current `DefensiveNarrativeGroup` / `DefensiveNarrativeSingle` / `CloseInstructions` components produce for the same position data. No narrative text is changed by this feature.

---

### Story 5 — Entry Date Displayed and Used for Sort

**As a** paper trader, **I want** to see the date each trade was entered on both the left-panel row and in the right-panel header **so that** I can understand how long I have held each position and whether it is approaching my intended hold window.

**Acceptance Criteria:**
- [ ] AC1: Each left-panel row shows a chip reading "Entered DD Mon" (e.g. "Entered 25 Jun"). The date matches the `entered_at` value returned by `GET /api/positions/risk`.
- [ ] AC2: The right-panel entry-date banner reads "Trade entered DD Mon YYYY — N days ago", where N is the number of calendar days between `entered_at` and today's date. For a trade entered on 25 Jun 2026 viewed on 27 Jun 2026, N = 2.
- [ ] AC3: Call `GET /api/positions/risk` directly (e.g. via the browser devtools network tab or curl). Confirm every item in the response array has an `entered_at` field formatted as `"YYYY-MM-DD"` (e.g. `"2026-06-25"`), and the value is never null.
- [ ] AC4: Place a new paper trade for a new strategy. Navigate to the Risk Monitor. Confirm the new strategy group appears at the top of the left panel (today's date, newest-first sort).

---

### Story 6 — Backend `entered_at` Accuracy

**As a** platform operator, **I want** the `entered_at` value to reflect the actual date the trade was placed (not the date the position row was last updated) **so that** the sort order and "N days ago" display are accurate for positions that have been partially closed and reopened.

**Acceptance Criteria:**
- [ ] AC1: For a position with multiple matching order rows (e.g. two buy orders placed on different dates for the same symbol/strategy), `entered_at` in the API response equals the date of the earliest order (`MIN(created_at)` across matching orders), not the most recent one.
- [ ] AC2: For a strategy group with two legs placed simultaneously, both legs share the same `entered_at` value in the API response. Confirm by inspecting the raw JSON.
- [ ] AC3: For an ungrouped (manual) position with no matching order row (edge case: order was deleted), `entered_at` falls back to the date portion of `positions.created_at` for that row.

---

### Story 7 — Mobile Accordion Layout

**As a** paper trader on a mobile device (viewport width ≤ 768px), **I want** the Risk Monitor to switch to a single-column accordion layout **so that** I can still access all my position details without horizontal scrolling or a cramped split view.

**Acceptance Criteria:**
- [ ] AC1: Resize the browser to 375px width (or open on a mobile device). The left/right split panel is not visible. A vertical list of strategy group rows is shown instead.
- [ ] AC2: Tap any list row. An inline detail section expands directly below that row, showing the same content as the right panel on desktop (header, leg cards, action plan box). The other rows remain visible above and below the expanded section.
- [ ] AC3: Tap a second row. The previously expanded section collapses and the new row's detail expands. Only one row is expanded at a time.
- [ ] AC4: On mobile, each list row still shows the strategy name (truncated with ellipsis if needed), entry-date chip, risk badge, DTE, and P&L. The 3px left-border risk colour is preserved.

---

### Story 8 — No Regression on Existing Functionality

**As a** platform operator, **I want** to confirm that the Risk Monitor redesign does not break any existing functionality **so that** users who depend on the current signal logic, AI overview, and portfolio summary are not disrupted.

**Acceptance Criteria:**
- [ ] AC1: The risk signal logic (red/yellow/green, DTE thresholds, P&L thresholds, IV regime, directional bias) produces identical output in the redesigned layout. Verify by placing a position that is past the 50% loss threshold and confirming the red badge and P&L signal appear correctly.
- [ ] AC2: The AI Risk Overview button appears below the split panel. Clicking it triggers the AI summary fetch, shows the loading state, and renders the result in the same `#1a1440` panel as before.
- [ ] AC3: The portfolio summary strip (Portfolio P&L, Positions count, red/yellow/green counts) is present in the Risk Monitor header and shows correct totals.
- [ ] AC4: The 5-minute auto-refresh still triggers. After 5 minutes, the data reloads silently, the left panel re-sorts with updated `entered_at` values, and the currently selected row remains selected (or defaults to the first row if it no longer exists after the refresh).

---

## 5. Out of Scope

- Changes to the risk signal calculation logic in `backend/routes/positions.py` (`_assess_risk` function). Signal thresholds, DTE buckets, P&L stop rules, IV regime alerts, and directional bias alerts are unchanged.
- Changes to the defensive narrative content (Financial Reality, Paths Forward, Summary Box, Close Instructions). This feature moves the content, not the text.
- Changes to order entry, the OrderEntry component, or trade placement in any tab.
- Changes to the Positions tab, the PnL chart, or the Portfolio summary.
- Changes to the Strategy Scanner tab or the OptionsChain tab.
- Any new filter, sort toggle, or search box in the left panel beyond the fixed newest-first entry-date sort.
- Drag-to-reorder or user-configurable sort order in the left panel.
- Pinning or starring individual positions.
- Any new API endpoint. The `entered_at` field is added to the existing `GET /api/positions/risk` response only.
- Changes to the `paper_trades` table (no such table exists; orders are stored in the `orders` table).
- Any change to the AI Risk Summary logic or the `aiRiskSummary` API call.
- A database migration to add a new column. The `entered_at` value is derived at query time from `orders.created_at` — no schema change is required.
- Changes to tier-gated entitlements. The Risk Monitor is gated on the `risk_monitor` feature flag in `EntitlementFeatures`; this feature does not alter that gate.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| No open positions | "No open positions to monitor" message centred in the content area; left/right split does not render |
| Exactly one position / one strategy group | Left panel shows one row (no date separator needed if it is the only entry); the row is auto-selected and the right panel shows its detail |
| All positions belong to the same entry date | Date separator appears once at the top of the list; all rows appear below it without additional separators |
| A position has `entered_at` matching today's date | Left-panel chip reads "Entered DD Mon"; right-panel banner reads "Trade entered DD Mon YYYY — 0 days ago" |
| Market data unavailable (yfinance fails) | Existing behaviour: `current_price` falls back to Black-Scholes or `avg_cost`; risk signals and P&L still render; IV Rank tile shows "--" if `iv_rank` is null |
| `entered_at` is null in the API response (should not occur per FR-4, but defensive) | Frontend must not crash; display "—" in place of entry date chip and banner |
| Strategy group has legs with different `entered_at` values on the API response (should not occur per FR-2) | Frontend must use the earliest `entered_at` value among the group's legs for sort and display |
| AI quota exhausted | AI Risk Overview button remains visible; existing error state ("AI summary failed — please try again.") renders below the split panel; no impact on left/right panel layout |
| AI feature disabled (`risk_summary_enabled == false`) | AI Risk Overview section does not render, as today. The split panel layout is unaffected |
| User is on a tier without `risk_monitor` entitlement | The tab is not accessible (handled by existing entitlement gate in App.tsx); this feature makes no change to that gate |
| Admin user | No special behaviour; admin sees the same layout as any authenticated user |
| 50+ open positions | Left panel scrolls independently; right panel scrolls independently; performance must not degrade visibly (no change to the underlying data-fetch strategy — it remains a single `GET /api/positions/risk` call) |
| Mobile viewport exactly at 768px breakpoint | The mobile accordion layout applies (breakpoint is "≤ 768px" inclusive) |

---

## 7. External Dependencies

| Service | Usage in This Feature | Quota / Risk |
|---------|----------------------|--------------|
| Supabase Postgres | `GET /api/positions/risk` performs an additional query to `orders` table to derive `entered_at` per position. No new table or column. The query joins on `(user_id, symbol, expiry, strike, option_type, strategy_key)` and selects `MIN(created_at)`. | Low risk; the orders table already has an index on `(user_id, created_at desc)`. The new query is per user, not per contract. |
| yfinance | Unchanged. Market data fetches for `current_price`, `iv_rank`, `bias` are unchanged. | Same rate-limit exposure as today. |
| Claude API | AI Risk Overview (`aiRiskSummary`) is unchanged. | Per-token cost unchanged. |
| Reddit PRAW | Not used by Risk Monitor. Not affected. | N/A |

---

## 8. Subscription Tier Impact

The Risk Monitor is already gated on the `risk_monitor` feature entitlement. This feature does not change any tier gate. The layout change applies equally to all tiers that have access to the Risk Monitor.

| Tier | Behaviour |
|------|-----------|
| free | Risk Monitor not accessible (existing gate unchanged). |
| starter | Risk Monitor accessible. New master-detail layout applies. `entered_at` returned by API. |
| pro | Risk Monitor accessible. New master-detail layout applies. `entered_at` returned by API. |
| enterprise | Risk Monitor accessible. New master-detail layout applies. `entered_at` returned by API. |

---

## 9. Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| OQ-1 | For a position that has been partially closed and then re-entered (e.g. BUY 2 on day 1, SELL 1 to close on day 10, BUY 1 again on day 15), should `entered_at` reflect day 1 (the original entry) or day 15 (the most recent entry)? The spec defines `MIN(created_at)` across all matching orders, which gives day 1. But the user may consider day 15 the "real" entry date for the remaining quantity. | Architect / Product | If ambiguous, the sort order and "N days ago" figure may not match user mental model. Recommend confirming with a concrete example in the architecture doc. |
| OQ-2 | The `positions` table has a unique constraint on `(user_id, symbol, expiry, strike, option_type)` but not on `strategy_key`. If a user places two separate strategy trades on the same contract (same symbol/expiry/strike/option_type) with different strategy keys, they produce two separate position rows. The `entered_at` lookup joins on `strategy_key` — confirm that the `orders` table also stores `strategy_key` and that this join produces the correct per-strategy result. (Migration 003 adds `strategy_key` to both tables, so this should be safe, but the architect should verify the join condition.) | Architect | Risk of `entered_at` returning the wrong date for overlapping strategies on the same contract. |
| OQ-3 | The approved design description mentions a "mini progress bar" in the left panel row but does not specify what percentage it displays. The existing `ProgressBar` component shows `pnl_pct` against `profit_target_pct`. Confirm this is the correct metric for the left-panel mini bar, or define an alternative. | Product / Architect | If undefined, the developer will default to `pnl_pct` vs `profit_target_pct`, which may not be the intended behaviour for multi-leg groups where `pnl_pct` is per-leg. |
| OQ-4 | The right panel's "Trade Narrative" section (FR-18) conditionally renders if the group has a non-null `narrative` object. Confirm whether the narrative section should default to collapsed or expanded when the user first selects a row. The spec says "default to collapsed" — confirm this is intentional (the action plan is the primary content; the trade narrative is supplementary). | Product | Affects discoverability of trade narrative for users who do not know to expand it. |
| OQ-5 | The `orders` index is on `(user_id, created_at desc)`. The new `entered_at` query groups by strategy key and selects `MIN(created_at)` filtered by position fields. Confirm with the architect that this query plan is efficient for users with 200+ order rows (the current `get_orders` limit is 200). If not, an additional index on `(user_id, strategy_key, symbol, expiry, strike, option_type)` may be warranted. | Architect | If query is slow, it adds latency to the already-slow `GET /api/positions/risk` endpoint (current timeout is 60 seconds). |

---

## 10. Product Owner Annotations

_Filled in by: product-owner | Date: 27Jun2026_

---

### PO Priority Scores

| Story | Priority | Rationale |
|-------|----------|-----------|
| Story 1 — Scan All Trades at a Glance | **1 — Must Have** | This is the entire reason for the redesign. Without the compact left-panel list, the feature does not exist. All other stories are subordinate to this one. |
| Story 2 — Navigate to Full Position Detail | **1 — Must Have** | Click-to-detail is inseparable from Story 1. A list without a detail view is useless. These two stories ship as one atomic unit. |
| Story 3 — View Leg-Level Detail in the Right Panel | **1 — Must Have** | Multi-leg positions are the majority of paper trades on this platform. Showing only group-level data without per-leg cards removes the diagnostic value that makes the right panel useful. |
| Story 4 — Action Plan Always Visible | **1 — Must Have** | The defensive narrative content (Financial Reality, Paths Forward, Summary Box) is the core risk-management value of this tab. It must be visible on selection, not hidden behind a toggle. Non-negotiable per product principle. |
| Story 5 — Entry Date Displayed and Used for Sort | **1 — Must Have** | The user approved Layout C specifically because of the entry-date sort. If `entered_at` is absent, the layout degrades to an unsorted list and the "N days ago" banner is blank. This is the structural backbone of the design. |
| Story 6 — Backend `entered_at` Accuracy | **1 — Must Have** | Story 5 is worthless without backend accuracy. `MIN(created_at)` from the orders table is the correct derivation. This is not separable from Story 5 for v1. |
| Story 7 — Mobile Accordion Layout | **2 — Should Have** | Mobile is in scope and the breakpoint behaviour is fully specified. However, the solo-operator user base primarily uses desktop for active trading review. Mobile accordion is a correctness expectation for responsive design, not a blocking gap on desktop. If the sprint is threatened, mobile can defer one sprint. Desktop-first delivery is acceptable for v1 if mobile is tracked as a priority 2 immediately following. |
| Story 8 — No Regression on Existing Functionality | **1 — Must Have** | This is not optional. The risk signal logic, AI overview, portfolio summary, and 5-minute refresh must all continue to work. Any regression blocks release. |

---

### Open Question Resolutions

**OQ-1 — Partial close / re-entry: which entry date?**

Decision: use `MIN(created_at)` across all matching orders as specified. This is the correct semantic for a paper-trading education tool — it tells the user how long this strategy has been active in their portfolio. In practice, if a user fully closed a position and re-entered it, the position row in Supabase would have been brought to zero or removed; the MIN approach therefore reflects the current active trade's actual opening date in all normal cases. No change to the spec. The architect should document this semantic in the design doc with the partial-close example noted in OQ-1.

**OQ-2 — strategy_key join correctness on orders table**

Decision: accepted as written. Migration 003 adds `strategy_key` to both `orders` and `positions`. The architect must verify in 02-design.md that the join condition `(user_id, symbol, expiry, strike, option_type, strategy_key)` produces a unique per-strategy result for overlapping contracts. If the column is absent or null on older order rows, the fallback to `positions.created_at` (FR requirement 1) covers the gap safely. No spec change required; confirm in architecture.

**OQ-3 — Mini progress bar metric for multi-leg groups**

Decision: the mini progress bar in the left panel must show the group's worst-leg `pnl_pct` value, clamped to the range 0–100% for display. Rationale: for a multi-leg group, the most informative single signal is the leg under the most pressure, because that leg drives the group's risk badge. Using the worst-leg `pnl_pct` (i.e. the most negative, or the one furthest from zero) is consistent with how the group's worst risk badge is already derived. Summing P&L across legs and dividing by a theoretical max profit is architecturally fragile because `max_theoretical_profit` is not currently available in the risk endpoint response and adding it would expand scope. The worst-leg approach requires no new data. The architect should confirm this interpretation and specify the exact field used (e.g. `Math.min(...legs.map(l => l.pnl_pct))`). Update FR-10 accordingly in the architecture doc — the spec wording "mini P&L progress bar" is deliberately underspecified here and the architect owns the implementation definition.

**OQ-4 — Trade Narrative section: collapsed or expanded by default?**

Decision: collapsed by default, as written in FR-18. The right panel's primary content is the action plan (leg cards + Financial Reality + Paths Forward + Summary Box). The trade narrative from the scanner is supplementary context — it was generated at scan time and may be stale relative to the current market. Defaulting to collapsed ensures the user's first view is the live risk picture, not the historical narrative. Users who want the scanner narrative can expand it. No change to the spec.

**OQ-5 — `entered_at` second Supabase query: acceptable for MVP?**

Decision: yes, the second query is acceptable for MVP. This is a single-operator paper-trading app; order table volume is low (the existing `get_orders` limit is 200 rows per user). The existing index on `(user_id, created_at desc)` is sufficient for a `MIN(created_at)` query filtered by `user_id` — Postgres will use the index to find the user's rows and the MIN aggregation is cheap across a small set. The `GET /api/positions/risk` endpoint already carries a 60-second timeout to absorb yfinance latency; an indexed MIN query adds negligible time. No additional composite index is required for v1. The architect may add an optional index on `(user_id, strategy_key, symbol, expiry, strike, option_type)` as a post-launch optimisation if profiling reveals a bottleneck, but this must not gate the v1 release.

---

### MVP Boundary

**Ships in v1 (this release):**
- Story 1 — Scan All Trades at a Glance
- Story 2 — Navigate to Full Position Detail
- Story 3 — View Leg-Level Detail in the Right Panel
- Story 4 — Action Plan Always Visible
- Story 5 — Entry Date Displayed and Used for Sort
- Story 6 — Backend `entered_at` Accuracy
- Story 7 — Mobile Accordion Layout (in scope; may defer one sprint if delivery is at risk — see priority 2 note above)
- Story 8 — No Regression on Existing Functionality

**Deferred to backlog (not in this release):**
- Any filter, search, or sort toggle beyond the fixed newest-first entry-date sort (explicitly out of scope per Section 5 and remains deferred indefinitely until user demand is evidenced)
- Pinning or starring positions
- Drag-to-reorder
- Composite index on orders table (post-launch optimisation if profiling warrants it)
- Any change to `max_theoretical_profit` surfacing in the risk endpoint (would enable a cleaner progress bar metric but is out of scope for this feature)

---

### Tier Gate Review

No change to the `risk_monitor` entitlement gate. Free-tier users do not gain access to the Risk Monitor through this change. The layout improvement applies uniformly to starter, pro, and enterprise. Confirmed: this feature does not bypass or restructure any tier limit.

### Non-Cannibalisation Check

This feature moves and reorganises existing content — it does not shortcut or replace the defensive narrative. The Financial Reality, Paths Forward, and Summary Box remain the centrepiece of the right panel, now more prominent than before (always visible, no toggle required). The AI Risk Overview is preserved and unchanged. The feature strengthens the risk management value loop rather than bypassing it.

---

**PO gate decision:** Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 27Jun2026

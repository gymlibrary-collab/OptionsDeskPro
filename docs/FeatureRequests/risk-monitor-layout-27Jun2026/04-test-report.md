# Test Report — Risk Monitor Layout Redesign (v1.9.0)

**Feature folder:** `docs/FeatureRequests/risk-monitor-layout-27Jun2026/`
**Date:** 27Jun2026
**Status:** Manual test plan complete — awaiting execution

---

## Automated Test Coverage

_To be completed by qa-engineer._

---

## Manual Test Plan

**Prepared by:** tester
**Date:** 27Jun2026
**Scope:** Exploratory and structured manual tests covering visual correctness, timing behaviour, and scenarios that Playwright cannot reliably catch.

**Test environment notes:**
- Desktop baseline: Chromium, 1440×900, standard network.
- Mobile baseline: DevTools device emulation, 375×812 (iPhone SE profile), touch events enabled.
- Boundary mobile viewport: 768px width exactly — use DevTools responsive mode.
- Auth states required: authenticated non-admin with open positions; authenticated non-admin with zero positions; authenticated admin.
- Pre-condition for most tests: at least one paper trade recorded so that `GET /api/positions/risk` returns data. Record trades via the Trading Desk or Order Entry before starting the test session.

---

### Area A — Left Panel Visual Layout and Proportions

**Why automation cannot cover this:** Playwright can assert element existence but cannot reliably verify pixel-accurate panel widths, independent scroll containment, or visual truncation with ellipsis on variable-length strategy names.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| A-01 | Left panel is approximately 270px wide and does not shrink when the right panel content is long | 1. Open Risk Monitor with 3+ strategy groups. 2. Open DevTools. 3. Inspect the left panel `div` (the sibling of the right panel inside the split container). | Computed width is 270px (± 2px tolerance). The `flex-shrink` is 0. The panel does not collapse or narrow as right panel content expands. | |
| A-02 | Left panel scrolls independently when list is taller than viewport | 1. Open Risk Monitor with 10+ strategy groups (create dummy trades if needed). 2. Hover mouse over the left panel. 3. Scroll down using the mouse wheel. | Left panel list scrolls down; the right panel content and the header strip remain stationary. Page-level scroll does not activate. | |
| A-03 | Right panel scrolls independently when content is taller than viewport | 1. Select a strategy group that has 3+ legs and a losing P&L (so the full defensive narrative renders). 2. Hover over the right panel. 3. Scroll down using the mouse wheel. | Right panel content scrolls; the left panel list and the header strip remain stationary. | |
| A-04 | Strategy name truncates with ellipsis in left panel when it is long | 1. Record a trade using a strategy with a long name (e.g. "Long Strangle", "Iron Condor", or a manually entered strategy name). 2. Open Risk Monitor. 3. Observe the strategy name text in the left panel row. | Strategy name does not overflow the row width. If the name is longer than the available space (after the risk badge), it truncates with a trailing ellipsis. No horizontal scroll appears inside the row. | |
| A-05 | Selected row has a visually distinct background from non-selected rows | 1. Open Risk Monitor with 2+ strategy groups. 2. Note the background colour of the second row (unselected). 3. Click the second row. 4. Note the background colour of both rows. | The newly selected row background changes to `#1e2135`. The previously selected row reverts to the default (`#1a1d27`). The distinction is clearly visible. | |
| A-06 | 3px left border colour matches risk level | 1. Arrange trades so that at least one group is red-risk, one is yellow-risk, one is green-risk. 2. Inspect the left border of each left-panel row in DevTools. | Red-risk rows: `border-left: 3px solid #ef4444`. Yellow-risk rows: `border-left: 3px solid #eab308`. Green-risk rows: `border-left: 3px solid #22c55e`. No mismatches between the badge colour and the border colour on the same row. | |
| A-07 | Right panel fills remaining horizontal width | 1. Open Risk Monitor on a 1440px viewport. 2. Inspect the right panel `div`. | Right panel `flex: 1` and `minWidth: 0`. Its computed width equals the total split container width minus 270px minus border width. It does not overflow or leave a gap. | |
| A-08 | Split panel does not render during loading state | 1. Throttle network to "Slow 3G" in DevTools. 2. Navigate to Risk Monitor or click Refresh. 3. Observe the component while the loading spinner / message is shown. | The "Analysing your positions…" message is centred in the content area. No left panel or right panel is visible. The header strip and Refresh button are visible. | |
| A-09 | Split panel does not render in error state | 1. Disconnect the network or set the backend URL to a bad value temporarily (by blocking the request in DevTools). 2. Refresh the Risk Monitor. | The error message appears in the content area. No left or right panel renders. | |

---

### Area B — Entry-Date Sort Correctness

**Why automation cannot cover this:** Playwright tests use mock data with controlled dates. Real `orders.created_at` timestamps depend on the actual time trades were placed. Verifying sort correctness against live data requires a human cross-referencing the left panel order against the Orders table timestamps.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| B-01 | Most recently entered trade appears at top of left panel | 1. Record a new paper trade for a new strategy (note the date). 2. Navigate to Risk Monitor. 3. Read the order of rows in the left panel. | The newly entered strategy appears at the top of the left panel list. Its date separator (if different from the previously top-most trade) appears above it. | |
| B-02 | Sort is newest-first by `entered_at` date, cross-referenced against Orders table | 1. Open the Orders tab and note the `created_at` date for each strategy group. 2. Open Risk Monitor. 3. Compare the left panel order from top to bottom against the orders dates from newest to oldest. | The left panel order matches the newest-first order of the `entered_at` dates observed in the Orders table. No group appears above a group that was entered more recently. | |
| B-03 | Date separator rows appear between groups with different entered_at dates | 1. Open Risk Monitor with strategy groups entered on at least two different calendar dates. 2. Inspect the left panel list. | A separator row (formatted "DD Mon YYYY", e.g. "25 Jun 2026") appears at the boundary between each date group. All groups entered on the same date are grouped under one separator, with no separator between them. | |
| B-04 | When all groups share the same entered_at date, only one separator appears | 1. Record two or more trades today. 2. Ensure no older trades exist, OR verify which trades share today's date. 3. Open Risk Monitor. | Exactly one date separator is visible, showing today's date. No separator appears between the groups entered today. | |
| B-05 | Tiebreak by worst risk level when two groups share the same entered_at | 1. Record two different strategy groups on the same calendar date; ensure one is red-risk and one is green-risk. 2. Open Risk Monitor. 3. Observe the order within the same date group. | Within a date separator group, the red-risk group appears above the green-risk group. (Secondary sort: worst risk first, per the design section 4.6.) | |
| B-06 | Left panel scroll position does not reset when clicking a different row | 1. Open Risk Monitor with enough groups that the left panel scrolls (10+ groups). 2. Scroll the left panel to the bottom. 3. Click a row near the bottom. | The left panel scroll position remains at the bottom. The right panel updates to show the selected group's detail. The left panel does not jump to the top. | |

---

### Area C — "N Days Ago" Date Calculation Accuracy

**Why automation cannot cover this:** The `daysAgo` function uses `new Date()` at render time. Playwright mocks use a fixed date. A human tester can verify the arithmetic against today's actual calendar date.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| C-01 | Trade entered today shows "0 days ago" | 1. Record a new paper trade today. 2. Open Risk Monitor. 3. Select the new strategy group. 4. Read the entry-date banner in the right panel header. | Banner reads: "Trade entered DD Mon YYYY — 0 days ago" (where DD Mon YYYY is today's date). | |
| C-02 | Trade entered yesterday shows "1 day ago" | 1. Identify a trade entered yesterday (check Orders table for yesterday's date). 2. Open Risk Monitor. 3. Select that strategy group. 4. Read the entry-date banner. | Banner reads: "Trade entered DD Mon YYYY — 1 day ago" (singular, not "1 days ago"). | |
| C-03 | Trade entered 2 days ago shows "2 days ago" | 1. Identify a trade entered 2 calendar days before today. 2. Select it in Risk Monitor. | Banner reads: "Trade entered DD Mon YYYY — 2 days ago". | |
| C-04 | daysAgo arithmetic is based on calendar days, not 24-hour periods | 1. If a trade was entered at 11:59pm two calendar days ago and it is currently 12:01am, verify the count. | Banner should read "2 days ago", not "1 day ago". The calculation uses `Math.floor((today - entered) / 86400000)` with `new Date()` at the current moment. Note: this test is timing-sensitive and best performed or confirmed by reading the implementation — the formula is verified in code, but the tester should record the observed value and compare to manual arithmetic. | |
| C-05 | Left panel chip shows "Entered DD Mon" (no year) | 1. Select any group in Risk Monitor. 2. Read the chip text in the left panel row. | Chip reads "Entered DD Mon" (e.g. "Entered 25 Jun"). The year is absent from the chip. The year is present only in the right panel header banner and in the per-leg PositionCard chip. | |
| C-06 | Right panel per-leg chip shows "Entered DD Mon YYYY" (with year) | 1. Select a strategy group in Risk Monitor. 2. Inspect each leg card in the right panel. | Each leg card has a chip reading "Entered DD Mon YYYY" (e.g. "Entered 25 Jun 2026"). The format includes the year, unlike the left panel chip. | |
| C-07 | fmtChipDate edge case: January (month index 0) | 1. If a trade exists with an entered_at of "YYYY-01-DD", select it. Otherwise, use DevTools to temporarily override `group.enteredAt` to "2026-01-05". | Left panel chip reads "Entered 5 Jan" (not "Entered 5 undefined" or "Entered 5 Feb"). | |

---

### Area D — Right Panel Default Selection on Load

**Why automation cannot cover this:** React state initialisation with a callback pattern (`setSelectedGroupKey(prev => ...)`) is hard to test reliably in Playwright when the callback depends on data fetched asynchronously. A human tester can observe the actual first-render state.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| D-01 | First row is auto-selected on initial load | 1. Navigate away from Risk Monitor. 2. Navigate back to Risk Monitor. 3. Observe the left panel and right panel as soon as data loads (before any clicks). | The top row in the left panel is highlighted (selected background `#1e2135`). The right panel immediately shows that group's detail — no "Select a position from the list" placeholder is shown. | |
| D-02 | Most recently entered trade is shown in right panel on initial load | 1. Note which strategy group was entered most recently (from Orders table). 2. Navigate to Risk Monitor. | The right panel on initial load shows the most recently entered strategy group (the one at the top of the left panel list). | |
| D-03 | After 5-minute auto-refresh, current selection is preserved if the group still exists | 1. Select the second row (not the top row). 2. Wait for the 5-minute auto-refresh to trigger (or trigger it manually by temporarily setting `REFRESH_MS` to a shorter value in a dev build, if available; otherwise observe the "Updating…" indicator after 5 minutes). 3. After the refresh completes, observe the left and right panels. | The second row remains selected. The right panel continues to show that group's detail. The left panel list re-sorts if dates changed, but if the selected group still exists it is still highlighted. | |
| D-04 | After auto-refresh where selected group no longer exists, falls back to first row | 1. Select a group. 2. Close that position (via Order Entry, place a closing trade so the position quantity reaches zero and disappears from the risk response). 3. Click Refresh manually. | The now-missing group is no longer in the left panel. The right panel switches to showing the first remaining group. No crash, no blank right panel beyond a brief transition. | |
| D-05 | Initial selection with exactly one group | 1. Ensure only one strategy group exists in open positions. 2. Navigate to Risk Monitor. | Left panel shows one row (auto-selected). Right panel immediately shows that group's detail. No separator may be needed (one entry). | |

---

### Area E — Action Plan Always Visible (No Toggle Required)

**Why automation cannot cover this:** The toggle was a genuine interactive element in the previous version. A Playwright test written before this feature would assert the toggle exists. The manual tester needs to confirm the toggle is absent and the content is immediately visible.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| E-01 | Defensive narrative is visible without clicking anything — losing single-leg group | 1. Select a strategy group with one leg and a negative P&L. 2. Observe the right panel below the leg card. | The Financial Reality section, Two/Three Paths Forward section, and Summary Box are all visible immediately below the leg card. No "Action Plan" button or toggle is shown. No click is required. | |
| E-02 | Defensive narrative is visible without clicking anything — losing multi-leg group | 1. Select a multi-leg strategy group with a negative combined P&L. 2. Observe the right panel below the last leg card. | The Financial Reality — Strategy section, Paths Forward section, Summary Box, and (if it is a credit strategy) the challenged leg detail are all visible without any toggle. | |
| E-03 | Strategy context narrative is visible for a profitable group — no toggle | 1. Select a strategy group with a positive combined P&L. 2. Observe the right panel below the leg card(s). | The "Strategy Context" NarrativeBox (green-bordered, stating "net profitable") is visible immediately. No toggle required. The Summary Box below it is also visible. | |
| E-04 | Single-leg group with positive P&L shows nothing in the action plan area | 1. Select a single-leg group with a positive P&L (pos.pnl >= 0). 2. Observe the right panel below the leg card. | Nothing is rendered below the leg card in the action plan area. No error, no empty box, no stale content from the previous group. `DefensiveNarrativeSingle` returns null for pnl >= 0 per implementation — verify this does not produce a visible gap or unexpected whitespace. | |
| E-05 | No legacy "Action Plan" toggle button appears anywhere in the right panel | 1. Open Risk Monitor and click through several different strategy groups (positive, negative, single-leg, multi-leg). 2. Inspect each right panel for any toggle or button labelled "Action Plan" or "Hide Action Plan". | No such button is present in the right panel for any group in any P&L state. The toggle-based pattern from the old layout is gone. (Note: within the leg cards, the per-card expand/collapse button for green signals may still appear — this is acceptable and expected. Only the "Action Plan" toggle at the bottom of each card should be absent when `isInGroup=true`.) | |
| E-06 | CloseInstructions appear for a losing single-leg group | 1. Select a single-leg group with a negative P&L. 2. Scroll to the bottom of the right panel. | The "How to close this position" ordered list is visible below the defensive narrative, with the correct symbol, expiry, strike, type, and close action (BUY or SELL as appropriate to close). | |

---

### Area F — Mini Progress Bar Accuracy

**Why automation cannot cover this:** The MiniProgressBar fill width is a computed inline style. Playwright can read inline style values but cannot easily verify they are visually meaningful — a human tester can compare the bar fill against the expected value and confirm it matches the worst-leg pnl_pct.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| F-01 | Mini progress bar fill corresponds to worst-leg pnl_pct | 1. Note the `pnl_pct` value for each leg in a multi-leg group (visible in the leg cards or from the API via devtools network tab). 2. Identify the worst (most negative) `pnl_pct`. 3. Inspect the MiniProgressBar `div` inside the left panel row for that group. | The inner div's `width` style equals `Math.min(Math.abs(worstLegPnlPct), 100)%`. For example, if the worst leg is at -34.5% pnl_pct, the bar fill is 34.5% wide. | |
| F-02 | Mini progress bar colour is red/yellow/green matching worst risk level | 1. Identify groups with each risk level. 2. Inspect the MiniProgressBar fill colour for each. | Red-risk group: fill is `#ef4444`. Yellow-risk group: fill is `#eab308`. Green-risk group (negative pnl_pct): fill is `#ef4444` or `#eab308` (based on risk level). Green-risk group (positive pnl_pct): fill is `#22c55e`. Confirm: when `worstLegPnlPct >= 0`, the colour is always green regardless of risk badge. | |
| F-03 | Mini progress bar clamps at 100% for a catastrophic loss | 1. Arrange a position that is down more than 100% of entry cost (e.g. pnl_pct = -150). 2. Observe the MiniProgressBar. | The bar fill is 100% wide, not 150%. The bar does not overflow its container. | |
| F-04 | Mini progress bar has zero width for a group where all legs have pnl_pct = 0 | 1. Arrange a scenario where avg_cost equals current_price (so pnl = 0, pnl_pct = 0) for all legs. 2. Observe the bar. | Bar fill is 0% wide (empty). No fill div is visible. The grey background track remains. | |

---

### Area G — Mobile Accordion Behaviour (375px and 768px viewports)

**Why automation cannot cover this:** Playwright tests can set viewport width, but the accordion interaction (tap to expand, tap again to collapse, only one open at a time) has subtle timing and visual state concerns that benefit from real touch-device emulation or physical device testing.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| G-01 | At 375px viewport, split layout is absent, accordion is shown | 1. In DevTools, set viewport to 375px wide. 2. Navigate to Risk Monitor with 3+ strategy groups. | No left panel / right panel side-by-side layout is visible. A vertical list of strategy group rows is shown instead, each row spanning the full width. | |
| G-02 | At 768px viewport exactly, mobile accordion applies | 1. Set viewport to exactly 768px wide. 2. Navigate to Risk Monitor. | Mobile accordion layout is shown (not the split layout). This confirms the breakpoint is "≤ 768px" inclusive. | |
| G-03 | At 769px viewport, desktop split layout applies | 1. Set viewport to 769px wide. 2. Navigate to Risk Monitor. | Desktop split layout is shown (left panel + right panel). | |
| G-04 | Tapping a mobile accordion row expands inline detail below it | 1. At 375px viewport, tap a strategy group row. | The row's detail (RightPanelDetail content: header, leg cards, action plan) appears inline directly below the tapped row. The rows above and below remain visible. No page navigation occurs. | |
| G-05 | Tapping an already-expanded row collapses it | 1. Expand a row (per G-04). 2. Tap the same row again. | The inline detail collapses. The row returns to its default (non-selected) background. No other row expands. | |
| G-06 | Only one row is expanded at a time | 1. Expand row A. 2. Tap row B (a different row). | Row A's detail collapses. Row B's detail expands. At no point are two rows simultaneously expanded. | |
| G-07 | Mobile row shows all required elements within 375px width | 1. At 375px viewport, inspect each row in the accordion. | Each row shows: strategy name (or symbol/option_type for ungrouped), entry-date chip ("Entered DD Mon"), risk badge, DTE value, P&L value, and MiniProgressBar. All elements are visible without horizontal scrolling. Strategy name truncates with ellipsis if too long. 3px left border risk colour is preserved. | |
| G-08 | Mobile accordion entry-date chip is visible and correctly formatted | 1. At 375px viewport, observe the entry-date chip on any row. | Chip reads "Entered DD Mon" — identical formatting to desktop. The chip is not hidden, clipped, or overflowing the row. | |
| G-09 | Mobile: tapping a row within 200ms of another tap does not expand two rows | 1. At 375px viewport, tap row A. 2. Within 200ms, tap row B. | Only row B ends up expanded. Row A does not flash open or leave residual expanded state. (This tests whether the mobileExpandedKey toggle is atomic — since it is a React state toggle, rapid taps on different rows should produce a single final expanded state.) | |
| G-10 | Mobile: AI Risk Overview section appears below the accordion list | 1. At 375px viewport with AI enabled, scroll to the bottom of the Risk Monitor tab. | The AI Risk Overview button is visible below the accordion list. Tapping it triggers the AI fetch and renders the result below the accordion. The accordion rows above are not affected. | |
| G-11 | Mobile: right panel header in expanded detail shows entry-date banner | 1. Expand a row on mobile. 2. Read the RightPanelHeader inside the expanded section. | The entry-date banner reads "Trade entered DD Mon YYYY — N days ago", same as desktop. The emoji calendar icon is visible. | |

---

### Area H — Right Panel Detail Correctness

**Why automation cannot cover this:** Content accuracy (correct leg count, correct expiry shown, correct IV Rank source, correct strategy name) requires a human cross-referencing what is displayed against the underlying trade data.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| H-01 | Right panel header shows correct leg count | 1. Select a two-leg strategy group. 2. Read the sub-line in the RightPanelHeader. | Sub-line reads "2 legs · Expiry DD-MM-YYYY · IV Rank NN" (or without IV Rank if null). Leg count matches the number of PositionCard elements visible below. | |
| H-02 | Nearest expiry in right panel header is the earliest among all legs | 1. Select a multi-leg group where one leg expires in September and another in December. 2. Read the expiry in the right panel header. | Header shows the September expiry (the earlier one). | |
| H-03 | IV Rank in header comes from the first leg with a non-null iv_rank | 1. Select a multi-leg group. 2. Inspect the `GET /api/positions/risk` response in devtools for that group's legs. 3. Identify which leg has the first non-null `iv_rank`. 4. Read the IV Rank in the right panel header. | Header IV Rank matches the `iv_rank` value from the first leg (in array order) that has a non-null value. | |
| H-04 | IV Rank is absent from header when all legs have null iv_rank | 1. If a synthetic/fallback position exists (yfinance data unavailable), select it. 2. Observe the header sub-line. | "· IV Rank NN" text is absent from the sub-line. No "IV Rank undefined" or "IV Rank --" appears in the header. | |
| H-05 | Leg cards are sorted by worst risk level first in the right panel | 1. Select a multi-leg group where one leg is red-risk and one is green-risk. 2. Observe the order of leg cards in the right panel body. | The red-risk leg card appears above the green-risk leg card. | |
| H-06 | SELL leg shows "Collected" tile label; BUY leg shows "Cost" tile label | 1. Select a strategy group that has both BUY and SELL legs (e.g. a vertical spread). 2. Inspect the fifth metric tile on each leg card. | SELL leg card: the tile label reads "Collected". BUY leg card: the tile label reads "Cost". The dollar value on both tiles is `avg_cost × qty × 100` (total premium). | |
| H-07 | Trade Narrative section is collapsed by default when narrative exists | 1. Ensure a position was recorded via the Strategy Scanner (so it has a narrative object). 2. Select that group in Risk Monitor. 3. Observe the right panel immediately after selecting (before any clicks). | A "Trade Narrative" button with a "▼" arrow is visible. The profit/loss/defensive narrative content is NOT visible until the button is clicked. The default state is collapsed. | |
| H-08 | Clicking Trade Narrative button expands the narrative | 1. With a group that has a narrative, click the "Trade Narrative ▼" button. | The button label changes to "▲ Trade Narrative". The NarrativePanel content (IF IT WORKS, IF IT DOESN'T, IF IT GOES WRONG sections) appears below the button. | |
| H-09 | Clicking Trade Narrative button a second time collapses the narrative | 1. Expand the Trade Narrative. 2. Click "▲ Trade Narrative". | The narrative content collapses. The button reverts to "▼ Trade Narrative". | |
| H-10 | Trade Narrative section is absent when group has no narrative | 1. Select a group that was entered manually via Order Entry (no narrative — narrative field is null). 2. Observe the right panel. | No "Trade Narrative" button or section is visible. The right panel goes directly from RightPanelHeader to the leg cards. | |
| H-11 | Selecting a new row resets the Trade Narrative section to collapsed | 1. Select a group that has a narrative. 2. Expand the Trade Narrative. 3. Click a different group row in the left panel. | The new group's right panel detail is shown. If the new group also has a narrative, its Trade Narrative section starts collapsed (the expanded state from the previous group does not carry over). | |

---

### Area I — Rapid Interaction / Double-Tap Scenarios

**Why automation cannot cover this:** Playwright has configurable timing between actions; real users on mobile devices can produce sub-200ms tap intervals. These tests target state integrity under rapid input.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| I-01 | Double-clicking a left panel row does not cause any error or blank state | 1. On desktop, double-click a left panel row rapidly (within 200ms). | No visual flash, blank right panel, or JavaScript error in the console. The right panel continues to show the correct group detail. `selectedGroupKey` remains stable. | |
| I-02 | Rapid clicks across multiple left panel rows settle on the last-clicked group | 1. Click row A, then immediately click row B, then row C in rapid succession (three clicks within 500ms). | The right panel shows row C's detail. The left panel highlights row C. No partial states from rows A or B are visible. No console errors. | |
| I-03 | Rapid tap on mobile accordion row while it is expanding does not result in two open rows | 1. At 375px viewport, tap row A. 2. Before the expansion animation completes (within 100ms), tap row B. | Only one row is expanded in the final state (row B). Row A is not simultaneously expanded. (React state updates are batched; this verifies no intermediate state leaks.) | |
| I-04 | Double-tap the Refresh button does not trigger two simultaneous fetches | 1. Double-click the Refresh button in the header strip within 200ms. | The "Updating…" indicator shows once. A single fetch completes. No duplicate data appears in the left panel. No JavaScript error in the console about concurrent state updates. | |
| I-05 | Rapid click on AI Risk Overview button while request is in-flight | 1. Click "Get AI Risk Overview". 2. While the loading state is shown ("Analysing portfolio…"), click the button again. | The button is in a disabled state (`disabled` attribute, `opacity: 0.6`) while loading. A second click has no effect. Only one AI request is in flight. | |

---

### Area J — Edge Cases: 0 Positions, 1 Position, All Same Date, Null entered_at

**Why automation cannot cover this:** These edge cases require specific data conditions that are difficult to reproduce reliably in a CI environment against a live Supabase instance.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| J-01 | Zero positions: correct empty state, no split panel | 1. Close all open positions (bring all quantities to zero). 2. Navigate to Risk Monitor. | "No open positions to monitor" message is centred in the content area. No left panel, no right panel, no split container renders. The header strip and Refresh button are still visible. | |
| J-02 | Zero positions: summary stat chips are absent | 1. With zero positions, observe the area below the header strip. | No portfolio P&L chip, no positions count, no red/yellow/green count chips are rendered. (The chips only render when `data.length > 0`.) | |
| J-03 | Exactly one position, one strategy group | 1. Record exactly one paper trade. 2. Open Risk Monitor. | Left panel shows one row. No date separator may be required (one entry under one date). The row is auto-selected. The right panel shows the detail for that single group. No "Select a position from the list" placeholder is shown. | |
| J-04 | Exactly one group: no date separator above the single row | 1. With one group, observe the left panel. | A single DateSeparatorRow appears above the one RiskListRow (the separator shows the date). Only one separator, not two. The separator does not appear below the row or between non-existent rows. | |
| J-05 | All strategy groups share the same entered_at date | 1. Record multiple trades on the same calendar day. 2. Open Risk Monitor. | Exactly one date separator appears at the top of the left panel list. All rows appear below that single separator. No separator appears between rows that share the date. | |
| J-06 | Strategy group where one leg was added on a later date (group.enteredAt reflects the earliest) | 1. If possible, place the first leg of a strategy on day 1 and note that `entered_at` for the group is day 1. (This requires backend verification via devtools — inspect the raw JSON from `GET /api/positions/risk`.) 2. Confirm the group shows the day 1 date in the left panel chip and right panel banner. | The date chip reads "Entered DD Mon" with day 1's date, not the later date. The "N days ago" count reflects day 1. The group sorts as if entered on day 1 (below any groups entered after day 1 and above any entered before day 1). | |
| J-07 | Defensive frontend: entered_at is empty string (edge case, should not occur from API) | 1. Use DevTools to intercept the `GET /api/positions/risk` response and set `entered_at` to `""` on one item. 2. Reload Risk Monitor. | The application does not crash. The entry-date chip in the left panel row is absent (the `group.enteredAt && (...)` guard suppresses it). The right panel header entry-date banner is absent (the `group.enteredAt && (...)` guard suppresses it). No "Entered undefined undefined" or "NaN NaN" text appears. | |
| J-08 | 50+ positions: left panel remains scrollable, right panel does not lag | 1. Create 50+ individual paper trades (or use a staging environment with volume data). 2. Open Risk Monitor. 3. Scroll the left panel from top to bottom. 4. Click rows at both the top and bottom of the list. | Left panel scrolls smoothly through all rows. Right panel updates immediately on each click. No visible lag or browser jank. No JavaScript memory or render errors in the console. | |

---

### Area K — API Response Verification (entered_at Accuracy)

**Why automation cannot cover this:** Verifying backend query correctness (MIN(created_at) accuracy, group-min enforcement, fallback to positions.created_at) requires cross-referencing raw Supabase query output against what the API returns, which is a human-in-the-loop inspection.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| K-01 | Every item in /api/positions/risk has entered_at as a non-null YYYY-MM-DD string | 1. Open DevTools Network tab. 2. Trigger a Risk Monitor load. 3. Inspect the raw JSON of the `GET /api/positions/risk` response. | Every item in the array has an `entered_at` field. The value is a string in the format `"YYYY-MM-DD"` (exactly 10 characters, hyphens in positions 5 and 8). No item has `entered_at: null` or `entered_at` absent. | |
| K-02 | All legs of a strategy group share the same entered_at value | 1. In the API response, find all items sharing the same `strategy_key`. 2. Compare their `entered_at` values. | All legs in the same strategy group have identical `entered_at` strings. No leg has a later date than the others in the same group (backend group-min enforcement pass). | |
| K-03 | entered_at matches the earliest order date for that strategy group | 1. In the Orders tab (or via a direct Supabase query), find all orders for a specific `(symbol, expiry, strike, option_type, strategy_key)` combination. 2. Identify the earliest `created_at` date. 3. In the `/api/positions/risk` response, find the matching item's `entered_at`. | `entered_at` in the API response matches the date portion (`YYYY-MM-DD`) of the earliest order's `created_at`. | |
| K-04 | ungrouped (manual) positions each have their own entered_at | 1. Record a trade with no strategy_key (or strategy_key = null / "manual"). 2. In the API response, find the item with `strategy_key` null or absent. | The ungrouped position has an `entered_at` value that reflects its own order date, not a shared group date. Multiple ungrouped positions may have different `entered_at` values. | |

---

### Area L — Regression: Existing Functionality Outside RiskMonitor

**Why automation cannot cover this:** A full regression across all tabs requires a human tester who can spot unexpected visual or behavioural regressions that are outside the scope of the feature-specific Playwright tests.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| L-01 | Options Chain tab loads correctly and is unaffected | 1. Navigate to the Options Chain tab. 2. Enter a ticker symbol. 3. View the chain. | Options chain loads, expiry picker works, calls/puts tables render with greeks. No console errors related to RiskMonitor. | |
| L-02 | Strategy Scanner tab loads and scans correctly | 1. Navigate to the Strategy Scanner. 2. Trigger a watchlist scan or deep analysis. | Scanner runs, strategy cards display, narrative accordion works. No regression. | |
| L-03 | Positions tab, PnL chart, and portfolio summary are unaffected | 1. Navigate to the Positions tab. 2. Observe the portfolio summary and PnL chart. | Open positions list, portfolio value, and the 90-day PnL chart all render correctly. No regression from the RiskMonitor changes. | |
| L-04 | Orders tab shows existing trades correctly | 1. Navigate to the Orders tab. 2. Review the order history. | Order history table renders correctly. Order rows include the expected fields. | |
| L-05 | Admin Panel is unaffected (admin user only) | 1. Log in as an admin user. 2. Navigate to the Admin Panel. 3. Check user list, whitelist management, and stats. | Admin panel functions normally. Whitelist management, leaderboard, and stats all render. | |
| L-06 | Risk Monitor header strip and stat chips survive a full page reload | 1. Navigate to Risk Monitor. 2. Press F5 (full page reload). 3. Wait for data to load. | Header strip ("Risk Monitor", subtitle, Refresh button, last-updated time) is visible. Summary stat chips (Portfolio P&L, Positions, risk counts) appear correctly after data loads. | |
| L-07 | AI Risk Overview button remains below the split panel and is functional | 1. Scroll to the bottom of the Risk Monitor right panel on desktop. 2. Below the split panel, locate the "Get AI Risk Overview" button. 3. Click it. | The AI button is below the split panel (not inside the right panel scroll area — it is outside the split container). Clicking it triggers the fetch, shows "Analysing portfolio…", and renders the result in the `#1a1440` panel. | |
| L-08 | Portfolio summary stat chips show correct risk-level counts | 1. Arrange positions with known risk levels (e.g. 2 red, 1 yellow, 1 green by observing the badges in Risk Monitor). 2. Read the stat chips in the header. | "High Risk" chip shows 2, "Watch" chip shows 1, "In the money" chip shows 1. Note: the chip counts are per-leg (raw `data.length` items), not per group. Verify this is understood and consistent. | |
| L-09 | Cross-tab: navigate away from Risk Monitor mid-load and return | 1. Click Refresh on Risk Monitor. 2. Immediately navigate to the Options Chain tab. 3. Wait 3 seconds. 4. Navigate back to Risk Monitor. | Risk Monitor resumes in its last-rendered state (either loaded or loading). No JavaScript error about state updates on unmounted components. No duplicate data in the left panel. | |
| L-10 | 5-minute auto-refresh does not interfere with active right-panel reading | 1. Select a group and begin reading the defensive narrative in the right panel. 2. After exactly 5 minutes, observe the auto-refresh behaviour. | The "Updating…" label appears in the header. Data reloads silently. If the selected group still exists, the right panel content does not change. Scroll position in the right panel is not reset. Reading is not interrupted. | |

---

### Area M — Visual Regression Near Changed Code (Fragility Observations)

These are scenarios where the code structure creates risk of subtle regressions that are easy to miss.

| Test ID | Description | Steps | Expected Result | Pass/Fail |
|---------|-------------|-------|-----------------|-----------|
| M-01 | PositionCard action plan toggle is fully absent when isInGroup=true | 1. In the right panel, observe multiple leg cards. 2. Specifically look for the yellow "⚠ Action Plan" text button that was present in the old layout. | No such button appears on any leg card when viewed in the right panel (where `isInGroup` is always `true`). The action plan content is delivered by `ActionPlanBox` at the panel level only. | |
| M-02 | PositionCard still shows the expand/collapse button for green signals | 1. Select a leg that has green-level signals. 2. Observe the top-right of the PositionCard in the right panel. | The "▼/▲" expand button is still present on each leg card (this is the existing `expanded` state toggle for green signals, not the action plan toggle). Clicking it still works to show/hide green signals. | |
| M-03 | lastRenderedDate mutable variable in render: separator appears for each new date on re-render | 1. With groups spanning 3 different dates, observe the left panel. 2. Trigger a manual Refresh. | After refresh, date separators still appear correctly — exactly one separator per distinct date. The `lastRenderedDate = ''` reset at the top of `renderDesktopSplit()` ensures a clean separator pass on each render. | |
| M-04 | Mobile: mobileExpandedKey resets when navigating away and back | 1. On mobile viewport, expand a row. 2. Navigate to another tab. 3. Navigate back to Risk Monitor. | The Risk Monitor remounts and `mobileExpandedKey` resets to `null`. No row is auto-expanded on mobile. (This is distinct from desktop where the first row is auto-selected.) | |
| M-05 | buildGroups called twice per render (once in render, once in setSelectedGroupKey callback) does not cause visible duplication | 1. Open Risk Monitor with positions. 2. Open React DevTools or check the console for any warnings about duplicate keys or excessive renders. | No React "Warning: Encountered two children with the same key" errors. No visible duplication of rows in the left panel. `buildGroups` is a pure function with no side effects, so calling it twice is safe. | |
| M-06 | ungrouped positions display symbol/option_type concatenation (not key "_ungrouped") | 1. Record a manual trade with no strategy_key. 2. Open Risk Monitor. 3. Read the strategy name in the left panel row for that group. | The row shows the symbol (e.g. "AAPL") or multiple symbols joined with ", " — not the internal key `_ungrouped`. In the right panel header, the name is displayed as "AAPL / TSLA" (forward-slash-separated) for multiple ungrouped positions. | |

---

## Scenarios Automation Cannot Realistically Cover — Summary

1. **Pixel-accurate panel proportions (270px left panel width, independent scroll)** — Playwright `toBoundingBox()` can approximate this but does not catch flex calculation edge cases across browser zoom levels.
2. **"N days ago" arithmetic verified against the actual calendar** — Mock data in Playwright uses fixed dates; only a human can verify the formula against `new Date()` at real execution time.
3. **Sort order cross-referenced against live Orders table timestamps** — CI runs against a mock API; the real `MIN(created_at)` query result depends on actual Supabase data.
4. **Visual correctness of entry-date format edge cases (January = month index 0, 1-digit day)** — Requires non-trivial date seeding in Playwright that the current mock-data setup does not cover.
5. **Sub-200ms rapid-tap race conditions on mobile** — Playwright's `tap()` adds artificial delay; real touch events on a physical device or with `fastclick` semantics may differ.
6. **Action plan toggle absence (old pattern gone, new pattern present)** — Playwright tests written before this feature may assert the toggle exists; a human tester confirms the correct post-feature state.
7. **Trade Narrative section collapsed-by-default state persisting across row selection** — React `useState(false)` inside `TradeNarrativeSection` resets on each new group selection because `RightPanelDetail` receives a new `group` prop and remounts. A human tester verifies no stale open state carries over between groups.
8. **Auto-refresh at exactly 5 minutes preserving right-panel reading position** — CI tests do not run for 5 minutes. Right-panel scroll position preservation during silent refresh is a real-world UX concern.
9. **Backend `entered_at` accuracy: MIN(created_at) vs actual earliest order** — The backend Python aggregation logic can only be fully verified by a human cross-referencing the Supabase `orders` table directly.
10. **Visual regression across non-RiskMonitor tabs** — Full cross-tab regression requires human navigation and visual inspection.

---

## Known Fragile Areas Observed in Code Review

1. **`lastRenderedDate` mutable variable inside `renderDesktopSplit()` and `renderMobileAccordion()`** (lines 1034, 1093): This is a `let` variable mutated during the render pass to track date separator state. If React ever re-renders the list in a non-sequential order (e.g. concurrent mode reordering, StrictMode double-invocation), the separator logic could produce incorrect output (duplicate separators or missing separators). Test M-03 covers this. Severity: minor in production (React 18 concurrent mode does not reorder list items), but worth flagging as a pattern to watch.

2. **`daysAgo()` uses `new Date()` without timezone normalisation** (line 43): The calculation `Math.floor((today.getTime() - entered.getTime()) / 86400000)` computes the difference in milliseconds and floors it. Because `new Date("2026-06-25")` is parsed as midnight UTC but `new Date()` is local time, a user in UTC+10 viewing a trade entered as "2026-06-25" at 6pm local time on 25 Jun might see "0 days ago" on the evening of 25 Jun but "1 day ago" at midnight UTC (1am local time on 26 Jun). This is a timezone boundary edge case. Test C-04 documents the expected behaviour; actual observed behaviour may vary by timezone. Severity: minor cosmetic.

3. **`fmtChipDate` and `fmtFullDate` do not validate the input string format** (lines 29-41): If `iso` is an empty string or does not contain exactly two hyphens, the destructuring `const [, mm, dd] = iso.split('-')` will produce `undefined` values, resulting in "NaN undefined" text in the chip. The edge-case guard (`group.enteredAt && (...)` at lines 773 and 895) prevents rendering when `enteredAt` is empty, but the functions themselves are undefended. Test J-07 covers the defensive guard path. Severity: minor (cannot occur in production per backend guarantee, but the functions are fragile helpers).

4. **`buildGroups` is called twice per render cycle when positions exist** (lines 978-981 inside `setSelectedGroupKey` callback and line 1028): Because `buildGroups` is a pure function this is safe, but if the data array is large the double invocation adds marginal CPU work. Not a correctness issue. Severity: cosmetic / performance note.

5. **`ActionPlanBox` for single-leg groups with positive P&L renders `null`** (lines 849-852): The comment in the code confirms this is intentional. However, the gap between the last leg card and the end of the right panel may appear as unexplained empty space for users with profitable single-leg positions. No spec violation, but it may confuse users. Test E-04 covers this observation. Severity: cosmetic.


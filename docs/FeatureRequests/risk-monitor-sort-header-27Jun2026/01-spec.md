# Feature Spec — Risk Monitor Sort Header ("Trades · N" bar + sort dropdown)

**Date:** 27Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

The Risk Monitor left panel currently has no count or sort control above the list of strategy
groups. The order of groups is fixed at newest-entry-first with a same-date risk-level tiebreak,
and the user has no way to reprioritise the list without manually scanning each row.

This feature adds a **"Trades · N" header bar** above the left-panel group list (desktop) and
above the accordion list (mobile). The bar displays the number of strategy groups currently
visible (e.g. "Trades · 4") and provides a **sort dropdown** with three mutually exclusive
options:

- **Newest first** (default) — preserves the existing date-rail grouping and `DateRail` blocks,
  identical to the current layout.
- **Risk first** — flat ranked list, red groups first then yellow then green; date rails are
  removed and each row shows a small "Entered DD Mon" date chip instead.
- **Worst P&L first** — flat ranked list ordered by `combinedPnl` ascending (most negative
  first); date rails removed; date chip shown per row.

The sort choice is session-only state (`useState`); it is not persisted to the database or
`localStorage` in v1. The dropdown and the date chip in flat mode are purely frontend changes
confined to `RiskMonitor.tsx`. No backend route, API contract, or database schema changes are
required.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Active multi-leg strategy trader | starter / pro | Open the Risk Monitor and instantly see how many strategies are being tracked, then re-sort by actual risk or P&L damage when managing a losing book |
| Beginner with a few paper trades | free / starter | Glance at "Trades · 3" to confirm all positions are being tracked, and sort by Worst P&L first to know which trade to address first |
| Pro trader actively managing a multi-position portfolio | pro / enterprise | Triage the list during a volatile session by switching to Risk first so the red groups surface to the top without manually hunting for them across date rails |
| Admin / platform operator | admin | Confirm the trade count matches expectations after an order; use sort to spot discrepancies quickly |

---

## 3. Functional Requirements

All requirements are frontend-only. No backend route, `PositionRisk` interface, `buildGroups`
core logic, or database schema is altered beyond what is described here.

### Header bar

1. A "Trades · N" header bar must appear directly above the left-panel group list on desktop
   (inside the split container, below the existing summary stat chips) and directly above the
   accordion list on mobile, whenever `data.length > 0` and the component is not in a loading
   or error state.

2. The **N** in "Trades · N" must equal `groups.length` — the count of `StrategyGroup` objects
   returned by `buildGroups(data)`, not the count of individual `PositionRisk` legs in `data`.
   This is the same count the user perceives as "number of strategies I have open".

3. The header bar must contain the label "Trades · N" on the left side and a sort dropdown on
   the right side, on the same horizontal row.

4. The header bar must be visually distinct from the list rows (e.g. a different background
   using `C.surface2`, a bottom border, consistent padding). It must not be confused with the
   existing summary stat chip row or the main Risk Monitor title strip.

5. The header bar and sort dropdown must be rendered on both the desktop master-detail left
   panel and the mobile accordion layout. The same `sortMode` state drives both.

### Sort dropdown

6. The sort dropdown must offer exactly three options in this order:
   - **Newest first** (value: `'newest'`)
   - **Risk first** (value: `'risk'`)
   - **Worst P&L first** (value: `'pnl'`)

7. The default value when the component first mounts must be `'newest'` (Newest first). This
   preserves current layout as the out-of-the-box experience.

8. The sort choice must be held in a `useState` variable (e.g. `sortMode`) local to the
   `RiskMonitor` component. It must not be persisted to `localStorage`, Supabase, or any other
   store in v1.

9. Changing the dropdown selection must immediately re-render the list without a loading spinner
   or API call. The sort is a client-side transform on the already-loaded `groups` array.

### Newest first mode

10. When `sortMode === 'newest'`, the list must render identically to the current implementation:
    `groupByEntryDate(groups)` is called, `DateRail` blocks are shown, and `RiskListRow`
    components are rendered inside date blocks exactly as today. No visual or behavioural
    regression is permitted.

### Risk first mode

11. When `sortMode === 'risk'`, the list must render as a **flat list** with no `DateRail`
    components and no date-block wrapping. The groups are ordered:
    - All red groups first, then yellow, then green.
    - Tiebreak within the same `groupLevel` colour: lowest `combinedPnl` (most negative) first.
      If `combinedPnl` is also identical (unlikely but possible with paper trades at zero P&L):
      most recent `enteredAt` date first (descending string comparison on `'YYYY-MM-DD'`).

12. Each `RiskListRow` in Risk first mode must display a **"Entered DD Mon"** date chip (e.g.
    "Entered 24 Jun") below the P&L line. This chip must use the `fmtFullDate` helper already
    present in `RiskMonitor.tsx`, formatted as `DD Mon` (day number + 3-letter month abbreviation,
    no year). The chip must be visually small and muted (consistent with the `C.muted` colour
    palette), and must not conflict with the existing risk badge, DTE span, or P&L display.

13. The date chip in flat mode must be implemented by passing a prop to `RiskListRow` (e.g.
    `showDateChip?: boolean` and `enteredAt: string`) or by rendering the chip inside
    `RiskListRow` conditionally. The exact mechanism is the architect's decision; the requirement
    is that the chip appears only in flat mode (Risk first and Worst P&L first), never in
    Newest first mode where the `DateRail` already communicates the date.

### Worst P&L first mode

14. When `sortMode === 'pnl'`, the list must render as a **flat list** with no `DateRail`
    components. The groups are ordered by `combinedPnl` ascending (most negative value first —
    the most money-losing strategy appears at the top).
    - Tiebreak when `combinedPnl` values are equal: most recent `enteredAt` date first
      (descending string comparison).

15. Each `RiskListRow` in Worst P&L first mode must show the same "Entered DD Mon" date chip
    as described in FR-12 and FR-13.

### Selection preservation

16. When the user changes `sortMode`, the selected group in the right panel (desktop) or the
    expanded accordion item (mobile) must be preserved **if the selected group key still exists
    in the re-sorted list**. If the selected group still exists, its key remains selected and
    the right panel continues to show its detail.

17. If the currently selected group key is somehow absent from the groups after a sort change
    (which should not occur because sort is a pure reorder with no filtering), the selection
    must fall back to the first group in the new order. This is a defensive fallback only.

18. The sort change itself must not auto-scroll the list or automatically change the selected
    group unless the fallback in FR-17 triggers. The user's eye is on the right panel; an
    unexpected selection change would be disorienting.

19. After a silent 5-minute refresh (`load(true)`), the `sortMode` must be preserved. The
    refresh reloads `data`, rebuilds `groups`, and re-applies the current `sortMode` transform.
    The selected group key is preserved if still present (existing `load` logic already handles
    this for `selectedGroupKey`).

### Mobile

20. On mobile (when `isMobile === true`), the "Trades · N" bar and sort dropdown must appear
    above the accordion list, inside the same container as the accordion. The `mobileExpandedKey`
    state (which accordion row is open) must be preserved across sort changes in the same way
    `selectedGroupKey` is preserved on desktop (FR-16 to FR-18).

21. The date chip in flat mode (FR-12 to FR-13) must be visible on mobile within `RiskListRow`.
    No separate mobile-only implementation is needed; the same `showDateChip` prop (or equivalent)
    applies to the single `RiskListRow` component used by both layouts.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — "Trades · N" Bar Shows Correct Group Count

**As a** paper trader with multiple strategy groups open, **I want** to see "Trades · N" above
the Risk Monitor list **so that** I immediately know how many strategies are being monitored
without counting rows manually.

**Acceptance Criteria:**
- [ ] AC1: Open the Risk tab with 4 strategy groups in paper trading. The header bar above the
  left-panel list reads "Trades · 4". A human tester can verify this in under 30 seconds by
  opening the tab and reading the bar.
- [ ] AC2: N counts strategy groups, not legs. A 3-leg Iron Condor and a 2-leg Bull Put Spread
  = 2 groups = "Trades · 2", not "Trades · 5". Verify by confirming the number of distinct
  list rows matches N.
- [ ] AC3: The bar is not present when there are no positions ("No open positions" empty state).
  With zero groups, the bar is hidden. Verify by ensuring all paper trades are closed and
  confirming the bar is absent.
- [ ] AC4: The bar is not present during the initial loading state ("Analysing your positions…"
  spinner). Verify by doing a hard refresh and confirming the bar only appears after the list
  loads.
- [ ] AC5: On mobile, the same "Trades · N" bar appears above the accordion list with the
  correct count. Verify by switching to a mobile viewport (or device) and confirming the bar
  is present and the count matches the number of accordion rows.

---

### Story 2 — Sort Dropdown Defaults to Newest First

**As a** paper trader opening the Risk Monitor, **I want** the sort to default to "Newest first"
**so that** the current layout (date rails, newest group at top) is preserved and I experience
no change in my default workflow.

**Acceptance Criteria:**
- [ ] AC1: On first load (component mount), the sort dropdown displays "Newest first" as the
  selected option. No user interaction required.
- [ ] AC2: In Newest first mode, the left panel renders `DateRail` blocks exactly as before this
  feature was added. A tester who checks the Risk tab without touching the dropdown sees no
  visual difference from the current production layout.
- [ ] AC3: The dropdown contains exactly three options: "Newest first", "Risk first",
  "Worst P&L first" — in that order. No other options are present.
- [ ] AC4: Navigating away from the Risk tab and back (tab switch) resets the sort dropdown to
  "Newest first" because `sortMode` is session-local component state (not persisted). This is
  expected and acceptable in v1. Verify by switching to Sort = Risk first, navigating to the
  Chain tab, returning to the Risk tab, and confirming the dropdown has reverted to Newest first.

---

### Story 3 — Risk First Sort Surfaces Red Groups to the Top With Date Chips

**As a** pro trader managing a volatile session, **I want** to select "Risk first" from the
dropdown **so that** all HIGH RISK (red) groups rise to the top of the list, allowing me to
triage the most urgent positions without scrolling past healthy green groups.

**Acceptance Criteria:**
- [ ] AC1: Select "Risk first" from the dropdown. The list immediately re-renders as a flat list
  (no `DateRail` blocks). All red-badged groups appear above all yellow-badged groups, which
  appear above all green-badged groups. Verify by confirming the order visually when at least
  one group of each colour is present.
- [ ] AC2: Within the red tier, the group with the most negative `combinedPnl` appears first.
  If two red groups exist with `combinedPnl` of -$820 and -$310, the -$820 group is listed
  first. Verify with at least two red groups.
- [ ] AC3: Each row in Risk first mode shows a small date chip reading "Entered DD Mon"
  (e.g. "Entered 24 Jun"). The chip is visible below the P&L line in each `RiskListRow`. No
  `DateRail` is present anywhere in the list. Verify by inspecting each visible row.
- [ ] AC4: Switching back to "Newest first" restores the `DateRail` layout and removes all date
  chips. The date chips must not appear in Newest first mode. Verify by toggling the dropdown.
- [ ] AC5: On mobile, selecting "Risk first" applies the same flat sort with date chips to the
  accordion list. Verify in a mobile viewport.

---

### Story 4 — Worst P&L First Sort Puts the Most Losing Strategy at the Top

**As a** paper trader reviewing losses at end of session, **I want** to select "Worst P&L first"
**so that** the strategy losing the most money appears at the top and I can immediately open
its detail without hunting through the list.

**Acceptance Criteria:**
- [ ] AC1: Select "Worst P&L first". The list immediately re-renders as a flat list (no
  `DateRail` blocks). The group with the lowest (most negative) `combinedPnl` value is first.
  Verify with at least two groups of different P&L signs.
- [ ] AC2: A profitable group (e.g. `combinedPnl = +$340`) appears below all losing groups when
  Worst P&L first is selected, regardless of risk badge colour or entry date.
- [ ] AC3: Two groups with equal `combinedPnl` are ordered by most recent `enteredAt` first
  (the group entered later appears above the group entered earlier). This tiebreak is unlikely
  in practice but must be implemented. Testable by constructing two paper trades on different
  dates with the same opening debit/credit and no market movement.
- [ ] AC4: Each row shows the "Entered DD Mon" date chip (same as Risk first mode, FR-12).
  No `DateRail` is present. Verify visually.
- [ ] AC5: On mobile, Worst P&L first applies the same flat sort with date chips to the
  accordion list. Verify in a mobile viewport.

---

### Story 5 — Selection Is Preserved When Sort Changes

**As a** paper trader reading the right-panel detail for a specific strategy group, **I want**
the right panel to stay on that group when I change the sort dropdown **so that** I do not lose
my place mid-review.

**Acceptance Criteria:**
- [ ] AC1: With the "AAPL Bull Put Spread" group selected and visible in the right panel, change
  the dropdown from "Newest first" to "Risk first". The right panel continues to show the
  "AAPL Bull Put Spread" detail. The group's new list position may differ (e.g. it has moved
  from row 1 to row 3), but the right-panel content does not change.
- [ ] AC2: Change the dropdown back to "Newest first". The right panel still shows the "AAPL
  Bull Put Spread" detail.
- [ ] AC3: The left-panel list highlights the row that corresponds to the currently selected
  group in every sort mode (the same selected-row styling — accent glow ring — is visible on
  the correct row in the new sort order).
- [ ] AC4: On mobile, the expanded accordion item remains expanded (showing its detail inline)
  after a sort change, provided that group is still in the list. The accordion row moves to
  its new position in the flat list but remains expanded.
- [ ] AC5: The silent 5-minute refresh does not reset `sortMode`. After a background refresh,
  the dropdown continues to show the user's last-chosen sort option and the list order does
  not change.

---

### Story 6 — Sort Applies Consistently on Mobile

**As a** mobile user monitoring open trades, **I want** the "Trades · N" bar and sort dropdown
to be present and functional on mobile **so that** I can use the same triage tools on my phone
that I have on desktop.

**Acceptance Criteria:**
- [ ] AC1: On a mobile viewport (< 768px), the "Trades · N" bar and dropdown appear above the
  accordion list. The bar is not hidden or clipped. Verify by resizing the browser or using
  device emulation in DevTools.
- [ ] AC2: Selecting each of the three sort options on mobile produces the correct list order
  (Newest first = date-rail accordion, Risk first = flat sorted accordion, Worst P&L first =
  flat P&L-sorted accordion) with the same behaviour as desktop.
- [ ] AC3: In flat mode (Risk first or Worst P&L first) on mobile, the date chip "Entered DD
  Mon" is visible within each accordion row header without being truncated or overflowing.
  Verify by expanding a row in flat mode and confirming the chip renders.
- [ ] AC4: Tapping a row to expand it in mobile flat mode shows the same `RightPanelDetail`
  inline content as in Newest first mode. The sort change does not affect the content of the
  expanded detail, only the row order.

---

### Story 7 — Flat Mode Date Chip Replaces Date Rail Information

**As a** paper trader using Risk first or Worst P&L first sort, **I want** each row to show
when the trade was entered **so that** I retain date context even though the `DateRail` blocks
have been removed.

**Acceptance Criteria:**
- [ ] AC1: In Risk first or Worst P&L first mode, every `RiskListRow` displays an "Entered DD
  Mon" chip (e.g. "Entered 27 Jun"). No row is missing the chip. Verify by confirming all
  visible rows show the chip.
- [ ] AC2: The date shown in the chip matches the `enteredAt` field of the group (the earliest
  leg entry date across all legs in the group), which is the same date the `DateRail` would
  have shown. Verify by cross-referencing with Newest first mode: the chip date matches the
  `DateRail` label for that group.
- [ ] AC3: The date chip uses `DD Mon` format (e.g. "27 Jun", "4 Jul") — day number without
  leading zero and 3-letter month abbreviation. The year is omitted. The full `fmtFullDate`
  output ("27 Jun 2026") must be trimmed to `DD Mon` for the chip.
- [ ] AC4: In Newest first mode, the date chip is absent from all rows. The `DateRail` is the
  only date display mechanism in that mode. Verify by confirming the chip text does not appear
  anywhere in the list when "Newest first" is selected.

---

## 5. Out of Scope

- Persisting `sortMode` to `localStorage`, Supabase, or any other store. Session-only `useState`
  is the v1 implementation. Persistence may be added in a later iteration once user preference
  patterns are established.
- A fourth sort option ("Alphabetical", "Most legs", etc.). Only the three specified options
  are in scope for v1.
- Filtering the left-panel list (e.g. show only red groups). The dropdown is a sort control
  only — it reorders; it never hides groups.
- Pagination or virtual scrolling of the list. All groups are rendered.
- Any change to `buildGroups` core logic, `groupLevel` derivation, or `groupPnlPct`
  computation. Those were shipped in the risk-monitor-group-risk-27Jun2026 feature. This feature
  consumes `groupLevel` and `combinedPnl` as read-only inputs to the sort.
- Any change to the `DateRail` component itself. It is shown or hidden depending on `sortMode`,
  but its implementation is unchanged.
- Any change to `RightPanelDetail`, `RightPanelHeader`, `LegCard`, `DefensiveNarrativeSingle`,
  `DefensiveNarrativeGroup`, `CloseInstructions`, `ActionPlanBox`, or `TradeNarrativeSection`.
  The right panel is entirely unaffected.
- Any change to the summary stat chips (Portfolio P&L, Positions, High Risk count, Watch count,
  Green count) in the existing Risk Monitor header strip.
- Any change to the existing "Risk Monitor" title strip (the top header bar with the title,
  HIGH RISK indicator, last-updated time, and Refresh button). The new "Trades · N" bar is a
  separate bar below the summary stat chips.
- Any change to the AI Risk Overview section at the bottom of the component.
- Any change to `QuoteBar`, `OptionsChain`, `Positions`, `Orders`, `StrategyScanner`,
  `AdminPanel`, or any other component outside `RiskMonitor.tsx`.
- Any backend route change. `GET /api/positions/risk` is unchanged. No new API endpoint.
- Any database migration.
- Any subscription tier gate change. The sort feature is available to all tiers that have
  access to the Risk Monitor.
- Saving the sort preference when the user navigates away and returns (tab switch resets to
  Newest first). This is the expected v1 behaviour, not a bug.
- The count N reflecting anything other than `groups.length`. Individual leg count, position
  count, or order count are out of scope for the "Trades · N" label.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| Zero positions (empty state) | The "Trades · N" bar is hidden. The sort dropdown is not rendered. The empty state message is displayed unchanged. No regression. |
| One position / one group | "Trades · 1" is shown. All three sort modes produce the same single-row list. Flat mode shows the date chip; Newest first shows a single-date `DateRail`. No crash. |
| All groups share the same `enteredAt` date | In Newest first mode, a single `DateRail` block contains all groups (current behaviour). In Risk first and Worst P&L first modes, flat list renders normally with date chips all showing the same date. No visual defect. |
| All groups have identical `groupLevel` (all red) | In Risk first, tiebreak by `combinedPnl` ascending applies to the full list. No groups are in the wrong tier; the tiebreak alone determines order. |
| All groups have identical `combinedPnl` | In Worst P&L first, tiebreak by `enteredAt` descending applies. The most recently entered group appears first. No crash or undefined order. |
| All groups have identical `groupLevel` and `combinedPnl` | In Risk first, the final tiebreak by `enteredAt` descending applies. Result is deterministic. |
| Sort change while right panel is showing a group that moves position | Right panel content does not change (FR-16). Only the list row position changes. No re-fetch, no loading state. |
| Silent 5-minute refresh mid-sort | `sortMode` state is not reset by the refresh. `load(true)` updates `data` and `groups`; the current `sortMode` is re-applied as a computed sort on the updated groups. The right-panel selected group is preserved if still present (existing logic). |
| Mobile: sort change while an accordion row is expanded | The expanded row moves to its new position in the flat list and remains expanded. The accordion expand state (`mobileExpandedKey`) is preserved by group key, not by position index. No collapse or content change. |
| Groups returned by `buildGroups` with empty `enteredAt` (all legs have no `entered_at` from backend) | `enteredAt` is `''` (empty string) as per current `buildGroups` logic. In Newest first mode, the `DateRail` already handles `''` gracefully (renders `'—'` for day). In flat mode, the date chip would render as "Entered  " (blank day and month). FR-13 should handle this defensively: if `enteredAt` is empty, the chip is omitted or rendered as "Entered —". Architect to confirm. |
| Loading state (initial `loading === true`) | The "Trades · N" bar and dropdown are hidden. The loading message is shown. No partial renders. |
| Error state (`error` is non-empty) | The "Trades · N" bar and dropdown are hidden. The error message is shown unchanged. |
| `groups.length` changes after silent refresh (a position expires and disappears) | N updates automatically on the next render. If the previously selected group is gone, the existing fallback in `load` already selects the first group in the current order; the `sortMode` determines which group that is. |

---

## 7. External Dependencies

| Service | Usage in This Feature | Quota / Risk |
|---------|----------------------|--------------|
| Supabase | Not affected. No new query, no schema change. | None. |
| yfinance | Not affected. `getPositionsRisk()` is unchanged. | None. |
| Claude API | Not affected. `aiRiskSummary` is unchanged. | None. |
| Reddit PRAW | Not used by Risk Monitor. Not affected. | None. |

This feature has zero external dependency risk. All sort fields required (`groupLevel`,
`combinedPnl`, `enteredAt`) are already present on `StrategyGroup` and computed entirely
from data already returned by `GET /api/positions/risk`. The sort is a pure client-side
array operation.

---

## 8. Subscription Tier Impact

No tier gate is added or changed. The sort header is available to all tiers that currently
have access to the Risk Monitor tab. Tier access to the Risk Monitor is an existing gate and
is out of scope here.

| Tier | Behaviour |
|------|-----------|
| free | Risk Monitor not accessible per existing gate. Sort header not visible. Unchanged. |
| starter | Risk Monitor accessible. All three sort modes available. No quota impact. |
| pro | Risk Monitor accessible. All three sort modes available. No quota impact. |
| enterprise | Risk Monitor accessible. All three sort modes available. No quota impact. |

---

## 9. Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| OQ-1 | **Count: groups vs. legs.** The spec defines N = `groups.length` (number of strategy groups). The user's example screenshot shows "Trades · 4" where there are 4 strategy groups. Should N ever reflect something else (e.g. total individual option legs, or number of underlying symbols)? Recommend: N = groups. Confirm with PO. | Product Owner | If unresolved: developer uses `groups.length`. This matches the user's screenshot intent and the most intuitive user-facing unit ("how many trades am I monitoring"). |
| OQ-2 | **Bar placement on desktop — inside the left-panel scroll area or pinned above it?** If pinned (sticky) above the scrollable left-panel list, the header stays visible as the user scrolls a long list, which is more useful for sort. If inside the scroll area, it scrolls away. Given the left panel has a fixed height (`maxHeight: 'calc(100vh - 260px)'` with `overflowY: auto`), pinning the bar at the top of the left panel (outside the scroll container) is recommended. Architect to confirm the DOM structure. | Architect | If unresolved: developer pins the bar above the scrollable area inside the left-panel column. |
| OQ-3 | **Bar placement on mobile — inside the scrollable accordion or pinned?** The mobile layout is a single scrolling column. Recommend rendering the "Trades · N" bar as a non-sticky row at the top of the accordion section (it will scroll with the list). Sticky on mobile is complex and rarely necessary for a 4-item list. Confirm with PO. | Product Owner | If unresolved: developer renders the bar as a non-sticky row at the top of the mobile accordion section. |
| OQ-4 | **Date chip format.** The spec requires "Entered DD Mon" (e.g. "Entered 24 Jun"). The `fmtFullDate` helper returns "DD Mon YYYY" (e.g. "24 Jun 2026"). The year must be stripped for the chip. Should the chip read "Entered 24 Jun" or just "24 Jun" (without the "Entered" prefix)? Recommend including the prefix "Entered" for clarity, matching the right-panel "Trade entered 24 Jun 2026" banner style. Confirm with PO. | Product Owner | If unresolved: developer renders "Entered DD Mon" (with prefix, without year). |
| OQ-5 | **Selection after sort change — first row vs. keep current.** FR-16 to FR-18 specify that the selection is preserved if the key is still in the list. If the currently selected group is the only group in the list and a sort change occurs, the selection is preserved (trivially). The ambiguous case: if the user has NOT yet clicked any row (e.g. on first load the first row is auto-selected), and then changes sort, the auto-selected group moves. Should the right panel continue showing the original auto-selected group (now in a different position) or should the right panel snap to whichever group is now first? The spec (FR-16) says preserve if present — the original auto-selection is preserved. Confirm this is the preferred behaviour. | Product Owner | If unresolved: developer preserves the current `selectedGroupKey` across sort changes regardless of its new list position. No auto-snap to first. |
| OQ-6 | **Empty `enteredAt` date chip.** If a group has `enteredAt === ''` (possible when all legs have no `entered_at` on the backend), the date chip in flat mode would render empty. Should the chip be omitted, or should it render "Entered —"? Recommend omitting the chip when `enteredAt` is empty. Architect to confirm the defensive rendering decision and check whether the backend always populates `entered_at` for paper trades. | Architect | If unresolved: developer omits the chip (renders nothing) when `enteredAt` is empty or blank. Safer than showing a broken "Entered  " string. |
| OQ-7 | **No backend change required — confirm.** All three sort keys (`groupLevel`, `combinedPnl`, `enteredAt`) are already present on `StrategyGroup` as of the risk-monitor-group-risk-27Jun2026 spec. The architect should confirm there is no field missing from the `StrategyGroup` type that the sort requires. If any field turns out to be absent, the architect must add it in the design doc as an addendum to the `StrategyGroup` interface. | Architect | If unresolved: developer proceeds on the assumption that all required fields are present. A compile error will surface any missing field immediately. |

---

## 10. Product Owner Annotations

**Annotated by:** product-owner
**Date:** 28Jun2026

---

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Count: groups vs. legs | CONFIRMED: N = `groups.length`. The count reflects the number of `StrategyGroup` objects returned by `buildGroups(data)`, not individual legs or underlying symbols. This matches the "Trades · 4" screenshot and the user's intuitive unit of "how many trades am I monitoring". Developer must not deviate from this. |
| OQ-2 — Bar placement on desktop | CONFIRMED: The "Trades · N" bar is pinned OUTSIDE the left panel's scroll container so it stays visible above the scrolling list at all times. It must not be part of the `overflowY: auto` scroll region. This is a left-panel-only bar — it does not span the full component width or the title header strip. The existing summary stat chip strip remains in place above the bar. Architect must specify the exact DOM placement (the bar sits between the stat chip strip and the scroll container `div`) in `02-design.md`. |
| OQ-3 — Bar placement on mobile | CONFIRMED: The bar is a non-sticky row rendered at the top of the mobile accordion section (inside the same container, scrolls with the list). Sticky on mobile is not required for a short list and adds unwanted complexity. Developer renders the bar as a static top row within the accordion container. |
| OQ-4 — Date chip wording | CONFIRMED: The chip reads "Entered DD Mon" (e.g. "Entered 24 Jun"). The "Entered" prefix is included for clarity, matching the right-panel "Trade entered DD Mon YYYY" banner style. No year in the chip. Developer must strip the year from `fmtFullDate` output for the chip. |
| OQ-5 — Selection after sort change | CONFIRMED: If the currently selected group key is still present in the re-sorted list (which it always will be, since sort never filters), the right panel keeps showing that group. The sort change does not snap to the first row. On mobile, the expanded accordion row is preserved by key in the same way. The fallback to first-row applies only when the selected key is absent — treat it as a defensive guard, not expected behaviour. |
| OQ-6 — Empty enteredAt chip | CONFIRMED: When `enteredAt` is `''` or blank, the date chip is OMITTED entirely. No "Entered  " broken string is rendered. This applies in both Risk first and Worst P&L first modes. For sort purposes in Newest first mode, groups with empty `enteredAt` sort last (current behaviour unchanged). Architect to confirm the sort comparator handles the empty string gracefully. |
| OQ-7 — No backend change required | CONFIRMED: No backend route, API contract, or database schema change. The architect must verify that all three sort fields (`groupLevel`, `combinedPnl`, `enteredAt`) are present on `StrategyGroup` following the risk-monitor-group-risk-27Jun2026 feature. If any field is missing from the TypeScript interface, the architect adds it as a read-only addendum in `02-design.md`. |

---

### Additional Binding Decisions

- **Default sort:** "Newest first" on component mount. Preserves the existing layout as the out-of-the-box experience. No deviation permitted.
- **Sort persistence:** Session-only `useState`. No `localStorage`, no Supabase, no cross-reload persistence in v1. Tab-switch resets to Newest first. This is expected behaviour, not a bug. Persistence is a v2 candidate once preference patterns are established.
- **Bar scope:** Left-panel only. The bar does not span the full component header. The existing title strip (Risk Monitor title, HIGH RISK indicator, refresh button) and summary stat chip row are entirely unchanged.
- **Flat mode date chip — Newest first excluded:** The date chip must never appear in Newest first mode. The `DateRail` is the sole date display mechanism in that mode. This is a non-negotiable — rendering the chip alongside the `DateRail` would be redundant and visually cluttered.

---

### Priority Scores

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — "Trades · N" bar shows correct group count | 1 — Must Have | The count label is the anchor of the feature. Without it, there is no "Trades · N" bar and the sort dropdown has no anchor context. Ships as the foundational UI element. |
| Story 2 — Sort dropdown defaults to Newest first | 1 — Must Have | The default must preserve the current layout exactly. Any regression in the out-of-the-box Newest first experience is a defect, not an acceptable trade-off. The dropdown itself is the core interaction surface. |
| Story 3 — Risk first sort surfaces red groups with date chips | 1 — Must Have | The triage use case (volatile session, red groups to the top) is the primary reason a pro or starter user reaches for the sort control. This is the highest-value sort option. |
| Story 4 — Worst P&L first puts most losing strategy at top | 1 — Must Have | The end-of-session loss review use case is the second core use case. The "which trade is hurting me most" question is fundamental to paper trading learning. |
| Story 5 — Selection preserved when sort changes | 1 — Must Have | Without selection preservation, changing the sort unexpectedly clears the right panel and breaks the user's reading flow. This is a UX integrity requirement, not a nice-to-have. |
| Story 6 — Sort applies consistently on mobile | 1 — Must Have | The spec commits to parity between desktop and mobile for sort behaviour. A mobile-only gap here would be a spec defect. The implementation is the same `RiskListRow` component; no separate mobile build is needed. |
| Story 7 — Flat mode date chip replaces date rail information | 1 — Must Have | Without the date chip, flat mode removes date context entirely. The chip is the direct substitute for the `DateRail` in flat mode. It is part of Stories 3 and 4's acceptance criteria and cannot be deferred without breaking those stories. |

---

### MVP Boundary

**All 7 stories ship in v1.** There is nothing to defer. The feature is a single frontend file (`RiskMonitor.tsx`), all stories are tightly coupled (the bar and dropdown are meaningless without sort behaviour; sort behaviour in flat mode is incomplete without the date chip; mobile parity is a spec commitment), and all stories are Priority 1. Splitting this across iterations would create a partially broken UI.

**Deferred to backlog (not part of this spec):**
- Sort persistence across tab switches or browser sessions (v2 candidate).
- A fourth sort option (alphabetical, most legs, etc.).
- Filtering the list (hide/show groups by risk tier).
- Migrating summary stat chips to group-level counts (separate story, out of scope here).

---

### Tier Gate Assessment

No tier gate changes. The sort header is available to all tiers that currently have access to the Risk Monitor (starter, pro, enterprise). Free tier does not have Risk Monitor access; this feature does not change that. No pro-tier value is exposed to free-tier users. Confirmed clean.

---

### Core Value Assessment

This feature accelerates the triage step of the core value loop: the user opens Risk Monitor and instantly understands how many strategies are being tracked (the count), then re-orders the list to surface the most urgent positions without manual scanning. It makes the loop faster and more trustworthy without touching the narrative, the strategy recommendations, or the paper trade record flow. There is no cannibalisation risk. The right panel (narrative, action plan, leg cards) is explicitly unchanged.

---

**PO gate decision:** Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 28Jun2026

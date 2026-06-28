# Gate Approvals — Risk Monitor Sort Header ("Trades · N" bar + sort dropdown)

**Feature folder:** `docs/FeatureRequests/risk-monitor-sort-header-27Jun2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | business-analyst |
| **Date** | 27Jun2026 |
| **Notes** | Spec covers 7 user stories, functional requirements for the "Trades · N" header bar, sort dropdown (Newest first / Risk first / Worst P&L first), flat-mode date chip, selection and mobile accordion preservation, and edge case table. Frontend-only scope confirmed: no backend route, no API contract change, no schema change, no tier gate change. All sort fields (`groupLevel`, `combinedPnl`, `enteredAt`) confirmed as present on `StrategyGroup` from the prior risk-monitor-group-risk-27Jun2026 feature. Seven open questions identified for PO and architect resolution. Accepted as written. |

Approved

---

## Gate 2 — Product Owner Review

| | |
|---|---|
| **Document** | `01-spec.md` (PO annotations in Section 10) |
| **Approved by** | product-owner |
| **Date** | 28Jun2026 |
| **Notes** | See full rationale in Section 10 of the spec. All open questions resolved with binding decisions (see table below). MVP boundary confirmed: all 7 stories ship in v1 — the feature is a single file, stories are tightly coupled, splitting would leave a partially broken UI. All stories are Priority 1. No tier gate changes required. No cannibalisation of the core narrative experience — the right panel is explicitly unchanged. Frontend-only change confirmed. |

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Count: groups vs. legs | N = `groups.length` (strategy groups, not legs). Matches the "Trades · 4" screenshot. |
| OQ-2 — Bar placement on desktop | Bar pinned OUTSIDE the left panel's scroll container — between the stat chip strip and the scroll container `div`. Left-panel only; does not span the full component header. Architect must specify exact DOM placement in `02-design.md`. |
| OQ-3 — Bar placement on mobile | Non-sticky row at the top of the mobile accordion section; scrolls with the list. No sticky behaviour on mobile. |
| OQ-4 — Date chip wording | "Entered DD Mon" (e.g. "Entered 24 Jun"). "Entered" prefix included; year omitted. Developer strips year from `fmtFullDate` output. |
| OQ-5 — Selection after sort change | Preserve the current `selectedGroupKey` if still present (always the case — sort never filters). No auto-snap to first row on sort change. Fallback to first row is a defensive guard for the absent-key case only. On mobile: same rule applies to `mobileExpandedKey`. |
| OQ-6 — Empty enteredAt chip | Chip is OMITTED (renders nothing) when `enteredAt` is `''` or blank. In Newest first mode, groups with empty `enteredAt` sort last. Architect must confirm sort comparator handles empty string gracefully. |
| OQ-7 — No backend change | Confirmed. Architect must verify all three sort fields are present on `StrategyGroup` post risk-monitor-group-risk-27Jun2026. Any missing field added as a read-only interface addendum in `02-design.md`. |

### Additional Binding Decisions

- Default sort: "Newest first" on component mount. No deviation.
- Sort persistence: session-only `useState`. No `localStorage`, no Supabase. Tab-switch resets to Newest first. Expected behaviour in v1.
- Bar scope: left-panel only. Title strip and summary stat chip row are unchanged.
- Date chip in Newest first mode: chip must NEVER appear. `DateRail` is the sole date display in that mode.

### Priority Scores

| Story | Priority |
|-------|----------|
| Story 1 — "Trades · N" bar shows correct group count | 1 — Must Have |
| Story 2 — Sort dropdown defaults to Newest first | 1 — Must Have |
| Story 3 — Risk first sort surfaces red groups with date chips | 1 — Must Have |
| Story 4 — Worst P&L first puts most losing strategy at top | 1 — Must Have |
| Story 5 — Selection preserved when sort changes | 1 — Must Have |
| Story 6 — Sort applies consistently on mobile | 1 — Must Have |
| Story 7 — Flat mode date chip replaces date rail information | 1 — Must Have |

**GO — proceed to Gate 3 (Architecture Design).**

The solution architect may begin. The design doc must address:

1. The exact DOM placement of the "Trades · N" bar: between the summary stat chip strip and the scroll container `div` on desktop; as a non-sticky top row inside the mobile accordion container.
2. The `sortMode` state type (`'newest' | 'risk' | 'pnl'`), its `useState` declaration inside `RiskMonitor`, and the fact that it is not passed to any parent or persisted anywhere.
3. The sort transform functions for Risk first (red → yellow → green by `groupLevel` rank, tiebreak: lowest `combinedPnl` first, then most recent `enteredAt` descending) and Worst P&L first (`combinedPnl` ascending, tiebreak: most recent `enteredAt` descending).
4. How the sort transform is applied as a derived constant (not a `useEffect`) computed from `groups` and `sortMode` on every render.
5. The `showDateChip` prop (or equivalent) added to `RiskListRow`, and the conditional rendering of the "Entered DD Mon" chip below the P&L line — visible only when `showDateChip` is true and `enteredAt` is non-empty.
6. The date formatting for the chip: `fmtFullDate` output trimmed to `DD Mon` (year stripped). The exact string manipulation or a dedicated `fmtChipDate` helper.
7. The `DateRail` show/hide logic: `DateRail` rendered only when `sortMode === 'newest'`; the flat list (no `DateRail`) rendered for `sortMode === 'risk'` and `sortMode === 'pnl'`.
8. Selection preservation: how the existing `selectedGroupKey` and `mobileExpandedKey` states are unchanged by a sort mode change (the sort is applied to the render output, not to the state itself).
9. The empty `enteredAt` defensive guard: when `enteredAt === ''`, the chip is not rendered (not even "Entered —"). Confirm the sort comparator pushes empty `enteredAt` strings to the end in all modes.
10. Confirmation that `buildGroups`, `groupLevel` derivation, `combinedPnl` computation, `RightPanelDetail`, `RightPanelHeader`, `LegCard`, `DefensiveNarrativeSingle`, `DefensiveNarrativeGroup`, `CloseInstructions`, `ActionPlanBox`, `TradeNarrativeSection`, `DateRail` (implementation), and all summary stat chips are unchanged.
11. Confirmation that no backend route, API call, or database schema is altered.

Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 28Jun2026

---

## Gate 3 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | solution-architect |
| **Date** | 28Jun2026 |
| **Notes** | Frontend-only change confined to `RiskMonitor.tsx`. No backend, no migration, no new package. Key decisions: `sortMode` as session-only `useState<'newest' \| 'risk' \| 'pnl'>` (default `'newest'`); `sortGroups` as a module-level pure function (not a `useEffect`) with explicit empty-`enteredAt` guards in all comparators; `SortBar` uses native `<select>` for accessibility; `showDateChip` optional prop on `RiskListRow` gates the "Entered DD Mon" chip; `fmtChipDate` helper reintroduced; desktop left column restructured as a flex column so `SortBar` sits outside the `overflowY:auto` scroll div (pinned above the list); mobile bar is a static row at the top of the accordion container (non-sticky). All binding PO decisions implemented as specified. OQ-7 field verification confirms `groupLevel`, `combinedPnl`, and `enteredAt` are all present on `StrategyGroup` — no interface addendum required. `buildGroups`, `groupByEntryDate`, `DateRail`, all right-panel components, summary stat chips, header strip, and AI overview section are confirmed unchanged. |

Approved

_Approved by:_ solution-architect &nbsp;&nbsp; _Date:_ 28Jun2026

---

## Gate 4 — Test Report

| | |
|---|---|
| **Document** | `04-test-report.md` |
| **Automated** | `frontend/e2e/pages/risk-monitor-sort-header.spec.ts` (36 new) — 117 passed / 0 failed across all risk-monitor suites (Chromium); zero regressions |
| **Manual plan** | 58-case exploratory plan, 12 areas + 7 fragility findings (tester) |
| **Approved by** | qa-engineer (automated), tester (manual) |
| **Date** | 28Jun2026 |
| **Notes** | No existing test needed changing — the SortBar + left-column flex restructure broke nothing. New suites verify: "Trades · N" = group count; default Newest first with date rails (no chip); Risk first flat list red→yellow→green with chips; Worst P&L first flat list most-negative first; selection preserved across sort changes; mobile parity; edge cases. Tester fragility findings actioned: FRAG-001/FRAG-007 (a11y) fixed in-place — added `aria-label="Sort trades"` and an accent focus ring (focus/blur handlers) to the sort `<select>`; spec re-run 36/36 green after the fix. FRAG-002 (hard-refresh selection falls back to newest-first first row when the selected key is gone) logged as a minor known quirk for future polish. Documented automated gaps (tab-reset, equal-pnl tiebreak, silent-refresh sortMode retention) covered structurally / by the manual plan. |

Approved

---

## Gate 5 — Security Review

| | |
|---|---|
| **Document** | `05-security-review.md` |
| **Approved by** | security-reviewer |
| **Date** | 28Jun2026 |
| **Notes** | Frontend-only, presentation-only change. Zero Critical or High findings. Two Informational findings: unchecked enum cast on native `<select>` onChange (no security consequence — value only drives a client-side array sort) and duplicate MONTHS constant (maintainability only). All CLAUDE.md invariants confirmed satisfied. No backend touched; no auth, secret, SQL, or injection surface introduced. Overall decision: PASS. |

Approved

_Approved by:_ security-reviewer &nbsp;&nbsp; _Date:_ 28Jun2026

---

## Gate 6 — Deployment & Documentation

| | |
|---|---|
| **Document** | `06-release-note.md` |
| **Approved by** | |
| **Date** | |
| **Notes** | |

Pending

---

## Overall Status

**Gates complete: 4 of 6**

- Gate 1 (BA Spec) — approved 27Jun2026
- Gate 2 (Product Owner) — approved with binding OQ decisions 28Jun2026
- Gate 3 (Architecture) — approved 28Jun2026
- Gate 4 (Test) — pending
- Gate 5 (Security) — approved 28Jun2026
- Gate 6 (Release & Documentation) — pending

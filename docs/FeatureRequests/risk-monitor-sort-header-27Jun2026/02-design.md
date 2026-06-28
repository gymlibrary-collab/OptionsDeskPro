# Technical Design — Risk Monitor Sort Header ("Trades · N" bar + sort dropdown)

**Date:** 28Jun2026
**Author:** Solution Architect
**Status:** Approved

---

## 1. Overview

This is a purely frontend change confined to a single file: `frontend/src/components/RiskMonitor.tsx`. No backend route, API call, database schema, migration, or environment variable is added. The feature introduces a `sortMode` state variable (`'newest' | 'risk' | 'pnl'`) inside the `RiskMonitor` component, a `sortGroups` pure function that applies a client-side sort transform to the already-built `groups` array, and a "Trades · N" bar (label + native `<select>` dropdown) inserted between the existing summary stat chip strip and the scrollable list container on desktop and at the top of the accordion container on mobile. The `newest` mode preserves the existing `groupByEntryDate` + `DateRail` rendering path without any alteration. The `risk` and `pnl` modes render a flat `.map` of `RiskListRow` components with no `DateRail`, and pass a new optional `showDateChip` prop to `RiskListRow` which conditionally renders an "Entered DD Mon" chip when `group.enteredAt` is non-empty. Selection state (`selectedGroupKey`, `mobileExpandedKey`) is never reset by a sort change.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `frontend/src/components/RiskMonitor.tsx` | Modified | Only file changed. Adds `sortMode` state, `fmtChipDate` helper, `sortGroups` function, `SortBar` inline component, `showDateChip` prop on `RiskListRow`, date chip rendering inside `RiskListRow`, updated `renderDesktopSplit`, updated `renderMobileAccordion`. |

No other file is changed.

---

## 3. Database Schema Changes

None. No migration is required.

---

## 4. API Contracts

None. No new or modified backend endpoint. `GET /api/positions/risk` is called exactly as before; its response shape and all fields used by the sort (`groupLevel`, `combinedPnl`, `enteredAt`) are already present on `StrategyGroup` after the risk-monitor-group-risk-27Jun2026 feature.

### OQ-7 field verification

All three sort fields are confirmed present on the `StrategyGroup` interface in the current `RiskMonitor.tsx`:

| Field | Type | Source | Confirmed |
|-------|------|--------|-----------|
| `groupLevel` | `'green' \| 'yellow' \| 'red'` | Computed in `buildGroups` | Line 577 |
| `combinedPnl` | `number` | Computed in `buildGroups` | Line 575 |
| `enteredAt` | `string` (`'YYYY-MM-DD'` or `''`) | Min `entered_at` across legs in `buildGroups` | Line 573 |

No addendum to the `StrategyGroup` interface is required.

---

## 5. Caching Strategy

Not applicable. No external data call is introduced.

---

## 6. External Dependency Fallback Chain

Not applicable. The sort is a pure client-side array operation on data already in React state.

---

## 7. Frontend State Management

### 7.1 `sortMode` state

**Declaration** (inside `RiskMonitor`, alongside the existing `useState` declarations):

```tsx
type SortMode = 'newest' | 'risk' | 'pnl'
const [sortMode, setSortMode] = useState<SortMode>('newest')
```

- Default: `'newest'`. Preserves current layout on component mount.
- Scope: local to `RiskMonitor`. Not passed to any parent. Not persisted to `localStorage`, Supabase, or any other store.
- Lifecycle: reset to `'newest'` on tab navigation away and back because `RiskMonitor` unmounts (React tab routing), which is the intended v1 behaviour described in the spec.
- The silent 5-minute `load(true)` call does not touch `sortMode` — it only updates `data` and conditionally updates `selectedGroupKey`. The current `sortMode` is re-applied as a derived sort on each render after the state update.

### 7.2 `fmtChipDate` helper

A small pure function placed near `fmtFullDate`:

```tsx
function fmtChipDate(iso: string): string {
  // "2026-06-24" → "24 Jun"  (year stripped from fmtFullDate output)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const parts = iso.split('-')
  if (parts.length !== 3) return ''
  const day = parseInt(parts[2], 10)
  const mon = MONTHS[parseInt(parts[1], 10) - 1]
  if (!mon || isNaN(day)) return ''
  return `${day} ${mon}`
}
```

This reintroduces the `fmtChipDate` helper that was removed in an earlier iteration. It reuses the same `MONTHS` constant already defined at module level for `DateRail`. The function returns an empty string for malformed input rather than throwing, which covers the defensive guard for the empty `enteredAt` case (described in §7.5 below).

### 7.3 `sortGroups` pure function

Placed as a module-level function (not a `useEffect`, not inside the component — it has no side effects and no closure dependencies):

```tsx
const riskRank: Record<string, number> = { red: 0, yellow: 1, green: 2 }

function sortGroups(groups: StrategyGroup[], mode: SortMode): StrategyGroup[] {
  if (mode === 'newest') {
    // buildGroups already returns groups sorted newest-first with risk tiebreak.
    // Re-assert here for clarity and safety (no-op in practice).
    return [...groups].sort((a, b) => {
      if (b.enteredAt > a.enteredAt) return 1
      if (b.enteredAt < a.enteredAt) return -1
      return riskRank[a.groupLevel] - riskRank[b.groupLevel]
    })
  }
  if (mode === 'risk') {
    return [...groups].sort((a, b) => {
      // Primary: risk tier ascending (red=0 first)
      const rankDiff = riskRank[a.groupLevel] - riskRank[b.groupLevel]
      if (rankDiff !== 0) return rankDiff
      // Tiebreak 1: most negative combinedPnl first (ascending)
      if (a.combinedPnl !== b.combinedPnl) return a.combinedPnl - b.combinedPnl
      // Tiebreak 2: most recent enteredAt first (descending string compare; '' sorts last)
      if (a.enteredAt === '' && b.enteredAt === '') return 0
      if (a.enteredAt === '') return 1   // empty sorts last
      if (b.enteredAt === '') return -1  // empty sorts last
      return b.enteredAt.localeCompare(a.enteredAt)
    })
  }
  // mode === 'pnl'
  return [...groups].sort((a, b) => {
    // Primary: most negative combinedPnl first (ascending)
    if (a.combinedPnl !== b.combinedPnl) return a.combinedPnl - b.combinedPnl
    // Tiebreak: most recent enteredAt first (descending string compare; '' sorts last)
    if (a.enteredAt === '' && b.enteredAt === '') return 0
    if (a.enteredAt === '') return 1
    if (b.enteredAt === '') return -1
    return b.enteredAt.localeCompare(a.enteredAt)
  })
}
```

Key design notes:
- Always spreads (`[...groups]`) before sorting to avoid mutating the original `groups` array that `buildGroups` returns. This is important because `groups` is a constant derived on each render; the spread ensures the sort comparator sees a stable snapshot.
- The `riskRank` constant is moved from inside `buildGroups` to module level so `sortGroups` can reference it without duplication.
- `newest` mode re-asserts the `buildGroups` order rather than returning the array as-is. This is a defensive guard: if future refactoring changes the `buildGroups` sort order, `newest` mode will continue to behave correctly.
- Empty `enteredAt` tiebreak: empty strings sort last (after all groups with a date) in all three modes. The `>` / `localeCompare` comparison of `''` vs `'YYYY-MM-DD'` would already produce this result for string comparison, but the explicit `if (a.enteredAt === '')` guards make the intent unambiguous and eliminate any engine-specific edge cases.

### 7.4 Derived sorted list — computed inline on every render

Immediately after the existing `const groups = buildGroups(data)` line:

```tsx
const groups = buildGroups(data)
const sortedGroups = sortGroups(groups, sortMode)
const selectedGroup = sortedGroups.find(g => g.key === selectedGroupKey) ?? null
```

`sortedGroups` is a derived constant recomputed on every render. It is not stored in state and is not computed inside a `useEffect`. The existing `selectedGroup` derivation is updated to reference `sortedGroups` instead of `groups` (the selected key lookup still works because sort never removes groups — the `.find` result is identical regardless of order).

`N` (the count shown in the "Trades · N" bar) is `sortedGroups.length`, which equals `groups.length` — the same value regardless of sort mode, because sort never filters.

### 7.5 Empty `enteredAt` defensive guard

The date chip in `RiskListRow` is only rendered when `showDateChip === true` AND `group.enteredAt` is non-empty. Specifically, `fmtChipDate` is only called when `group.enteredAt !== ''`, and the chip is only rendered when `fmtChipDate` returns a non-empty string. This double guard ensures "Entered  " (blank date) is never shown. See §7.7 for the exact conditional.

### 7.6 `SortBar` — the "Trades · N" bar

A small inline component defined just above `renderDesktopSplit` (or alternatively as a local function inside `RiskMonitor` — either is acceptable; the inline component pattern is preferred here to avoid prop-threading `setSortMode`):

```tsx
// Rendered as:
// <SortBar count={sortedGroups.length} sortMode={sortMode} onSortChange={setSortMode} />

function SortBar({
  count,
  sortMode,
  onSortChange,
}: {
  count: number
  sortMode: SortMode
  onSortChange: (m: SortMode) => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 12px',
      background: C.surface2,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>
        Trades · {count}
      </span>
      <select
        value={sortMode}
        onChange={e => onSortChange(e.target.value as SortMode)}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '5px',
          color: C.text,
          fontSize: '11px',
          padding: '2px 6px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="newest">Newest first</option>
        <option value="risk">Risk first</option>
        <option value="pnl">Worst P&amp;L first</option>
      </select>
    </div>
  )
}
```

Design choices for `SortBar`:
- Native `<select>` is used rather than a custom dropdown. This is correct for accessibility (keyboard navigation, screen readers, mobile OS native pickers), avoids introducing a third-party dependency, and is consistent with the existing `<button>` / `<select>` patterns elsewhere in the codebase.
- `C.surface2` background distinguishes the bar from the list rows (`C.surface` and `C.bg`) and from the summary stat chip strip which uses `C.surface` with `borderBottom`.
- The `<select>` inherits the dark theme via explicit inline styles on `background`, `border`, `color` — no CSS class is needed.
- `onSortChange` is typed as `(m: SortMode) => void` and wired directly to `setSortMode` at the call site.

### 7.7 `RiskListRow` — `showDateChip` prop addition

The existing `RiskListRow` signature:

```tsx
function RiskListRow({ group, isSelected, onClick, isLast }: {
  group: StrategyGroup
  isSelected: boolean
  onClick: () => void
  isLast?: boolean
})
```

New signature (one optional prop added):

```tsx
function RiskListRow({ group, isSelected, onClick, isLast, showDateChip }: {
  group: StrategyGroup
  isSelected: boolean
  onClick: () => void
  isLast?: boolean
  showDateChip?: boolean   // true only in flat modes (risk / pnl)
})
```

The chip is inserted immediately after the `<MiniProgressBar>` line (the last element in the row body), so it appears below the P&L line and progress bar:

```tsx
{showDateChip && group.enteredAt !== '' && (
  <div style={{
    marginTop: '5px',
    fontSize: '10px',
    color: C.muted,
    letterSpacing: '0.03em',
  }}>
    Entered {fmtChipDate(group.enteredAt)}
  </div>
)}
```

Placement rationale: below the `MiniProgressBar` keeps the chip visually subordinate — it is contextual metadata, not a primary row element. It does not conflict with the risk badge (top right), DTE span, or P&L value (all in the rows above the progress bar). The `C.muted` colour and `10px` font size match the existing muted-label style used for the DTE span.

The `showDateChip` prop defaults to `undefined` (falsy) when omitted, so all existing call sites in `newest` mode pass no prop and the chip is never rendered — no regression.

### 7.8 DOM placement — desktop

Current `renderDesktopSplit` structure (simplified):

```
<div>                              ← outer split container (overflow:hidden)
  <div>                            ← left panel (overflowY:auto, width:290px)
    {blocks.map(...DateRail rows)}
  </div>
  <div>                            ← right panel (overflowY:auto, flex:1)
    ...
  </div>
</div>
```

The `SortBar` is inserted OUTSIDE the left panel's `overflowY:auto` `div`, between the left panel header column and the scrollable block. To achieve "pinned above the scroll list, left-panel-only", the desktop left column is restructured as a column flex container:

```tsx
{/* Left column wrapper — flex column so SortBar sits above the scroll div */}
<div style={{
  width: '290px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRight: `1px solid ${C.border}`,
  background: C.bg,
}}>
  {/* SortBar — pinned above the scroll list, does not scroll */}
  <SortBar count={sortedGroups.length} sortMode={sortMode} onSortChange={setSortMode} />

  {/* Scrollable list */}
  <div style={{ overflowY: 'auto', flex: 1 }}>
    {sortMode === 'newest'
      ? /* groupByEntryDate blocks with DateRail */
      : /* flat sortedGroups.map with showDateChip */
    }
  </div>
</div>
```

The outer split container's `maxHeight: 'calc(100vh - 260px)'` and `overflow: 'hidden'` remain on the outer `div`. The left column wrapper takes the full height via the flex column layout; the inner scroll `div` uses `flex: 1` to fill remaining height after the `SortBar`. The right panel `div` is unchanged.

The `SortBar` is NOT inside the `overflowY:auto` div, so it never scrolls out of view — it is always visible above the list regardless of scroll position. This satisfies the PO binding decision (OQ-2).

### 7.9 DOM placement — mobile

Current `renderMobileAccordion` structure:

```
<div>                              ← accordion container (borderTop)
  {blocks.map(...DateRail rows)}
</div>
```

The `SortBar` is inserted as the first child inside the accordion container `div`:

```tsx
<div style={{ borderTop: `1px solid ${C.border}` }}>
  {/* SortBar — non-sticky, scrolls with the list */}
  <SortBar count={sortedGroups.length} sortMode={sortMode} onSortChange={setSortMode} />

  {sortMode === 'newest'
    ? /* groupByEntryDate blocks with DateRail */
    : /* flat sortedGroups.map with showDateChip */
  }
</div>
```

The bar is a static row (no `position: sticky`), so it scrolls with the list. This satisfies the PO binding decision (OQ-3).

### 7.10 Rendering branch — `newest` vs flat modes

Both `renderDesktopSplit` and `renderMobileAccordion` share the same branch logic (described here once):

```
if sortMode === 'newest':
  const blocks = groupByEntryDate(sortedGroups)
  render blocks.map → <DateRail> + <RiskListRow showDateChip={undefined}>
else:
  render sortedGroups.map → <RiskListRow showDateChip={true}>
  (no DateRail, no groupByEntryDate)
```

`groupByEntryDate` is only called when `sortMode === 'newest'`. The `DateRail` component is only rendered when `sortMode === 'newest'`. The flat map passes `showDateChip={true}` and the `group.enteredAt` is already available on the `group` prop — no additional prop is required to carry the date through.

For the flat list `isLast` prop: in the flat map, `isLast` is `gi === sortedGroups.length - 1` (the last element in the flat array), consistent with the existing `isLast` logic in date blocks.

### 7.11 Selection preservation across sort changes

`selectedGroupKey` and `mobileExpandedKey` are plain `useState` variables. The `setSortMode` call from the dropdown `onChange` does not call `setSelectedGroupKey` or `setMobileExpandedKey`. Therefore:

1. The user selects a group. `selectedGroupKey = 'AAPL_bull_put_spread'`.
2. User changes sort dropdown. `setSortMode('risk')` fires.
3. React re-renders. `sortedGroups = sortGroups(groups, 'risk')` produces a new order. `selectedGroup = sortedGroups.find(g => g.key === 'AAPL_bull_put_spread')` — finds the same group at a different index. The right panel renders the same `RightPanelDetail`.
4. The left-panel `RiskListRow` for that key receives `isSelected={true}` by key match, not by position index. The accent glow ring appears on the row's new position.

The fallback-to-first-row guard remains in the existing `load` callback only (where a group can genuinely disappear after a refresh). There is no fallback-to-first logic triggered by `setSortMode`.

### 7.12 State and props summary

| State / Constant | Owner | Type | Persisted |
|------------------|-------|------|-----------|
| `sortMode` | `RiskMonitor` | `'newest' \| 'risk' \| 'pnl'` | No — session only |
| `selectedGroupKey` | `RiskMonitor` | `string \| null` | No (existing) |
| `mobileExpandedKey` | `RiskMonitor` | `string \| null` | No (existing) |
| `sortedGroups` | Derived constant | `StrategyGroup[]` | N/A |

| Component | New prop | Type | Notes |
|-----------|----------|------|-------|
| `RiskListRow` | `showDateChip` | `boolean \| undefined` | Optional; defaults to `undefined` (falsy). Chip shown only when `true` and `enteredAt !== ''`. |
| `SortBar` | `count` | `number` | `sortedGroups.length` |
| `SortBar` | `sortMode` | `SortMode` | Current sort mode |
| `SortBar` | `onSortChange` | `(m: SortMode) => void` | Wired to `setSortMode` |

---

## 8. Subscription Tier Enforcement

No change. The sort header is available to all tiers that currently have access to the Risk Monitor. The existing tier gate (not in `RiskMonitor.tsx` itself) is unchanged.

---

## 9. New Environment Variables

None.

---

## 10. What Is Confirmed Unchanged

The following are explicitly confirmed as having zero code changes in this feature:

- `buildGroups` function — not modified. `sortGroups` is an entirely separate function that consumes the output of `buildGroups`.
- `groupLevel` derivation inside `buildGroups` — not modified.
- `combinedPnl` computation inside `buildGroups` — not modified.
- `groupByEntryDate` function — not modified.
- `DateRail` component — not modified. It is shown/hidden by the rendering branch, but its implementation is unchanged.
- `RightPanelDetail` — not modified.
- `RightPanelHeader` — not modified.
- `LegCard` — not modified.
- `DefensiveNarrativeSingle` — not modified.
- `DefensiveNarrativeGroup` — not modified.
- `CloseInstructions` — not modified.
- `ActionPlanBox` — not modified.
- `TradeNarrativeSection` — not modified.
- Summary stat chips block — not modified. The chip strip counts (`redCount`, `yellowCount`, `greenCount`, `totalPnl`) are derived from `data` (individual `PositionRisk` legs), not from `groups`, and are not affected by `sortMode`.
- Header strip (title, HIGH RISK indicator, last-updated time, Refresh button) — not modified.
- AI Risk Overview section — not modified.
- `load` callback — not modified. `sortMode` is not referenced inside `load`.
- `GET /api/positions/risk` backend route — not modified.
- All other components in the repository — not modified.

---

## 11. ADR References

No ADR is required. This feature makes no technology choice, introduces no new dependency, and rejects no significant alternative that future maintainers would need to trace. The native `<select>` choice over a custom dropdown is a straightforward preference for accessibility and zero-dependency simplicity, not a decision with long-term architectural implications.

---

## 12. Edge Case Handling Summary

| Edge case | Handling |
|-----------|----------|
| `groups.length === 0` | `SortBar` not rendered (gated by `!loading && !error && data.length > 0`). No crash. |
| `groups.length === 1` | "Trades · 1" shown. All three sort modes produce the same single-row list. |
| `enteredAt === ''` on a group | `showDateChip` is true but `group.enteredAt !== ''` check prevents chip render. No broken "Entered  " string. In sort comparators, explicit `if (a.enteredAt === '') return 1` pushes empty-date groups to the end of tiebreaks. |
| All groups same `enteredAt` | In `newest`: single DateRail block. In `risk`/`pnl`: flat list, all chips show the same date. No visual defect. |
| All groups same `groupLevel` | In `risk`: tiebreak by `combinedPnl` then `enteredAt` applies across the full list. Deterministic. |
| All groups same `combinedPnl` | In `pnl`: tiebreak by `enteredAt` descending. Deterministic. |
| All groups same `groupLevel` and `combinedPnl` | In `risk`: final tiebreak by `enteredAt` descending. Deterministic. |
| Sort change while right panel shows a group | `selectedGroupKey` unchanged. `sortedGroups.find` locates the group at its new index. Right panel content unchanged. |
| Silent 5-minute refresh mid-sort | `load(true)` updates `data`; `sortMode` state is untouched; `sortedGroups` is recomputed with current `sortMode` on next render. `selectedGroupKey` is preserved by existing `load` logic. |
| Mobile: sort change while accordion row expanded | `mobileExpandedKey` unchanged. Row moves to new position in flat list; remains expanded by key match. |

---

## 13. Architect Gate Decision

Approved

_Approved by:_ solution-architect &nbsp;&nbsp; _Date:_ 28Jun2026

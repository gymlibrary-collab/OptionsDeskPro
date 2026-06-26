# Technical Design — Risk Monitor Layout Redesign (Master-Detail Split)

**Feature folder:** `docs/FeatureRequests/risk-monitor-layout-27Jun2026/`
**Author:** solution-architect
**Date:** 27Jun2026
**Status:** Draft — awaiting Gate 3 approval

---

## 1. Scope Summary

This design covers:

- One backend change: add `entered_at: str` to every item in the `GET /api/positions/risk` response, sourced from `MIN(created_at)` in the `orders` table.
- One frontend rewrite: replace `RiskMonitor.tsx`'s single-column tile layout with a Master-Detail Split (desktop) and single-column accordion (mobile ≤ 768px).
- One TypeScript interface change: extend `PositionRisk` with `entered_at: string`.
- No new API endpoints. No database schema changes. No new Python packages.

---

## 2. Backend Change — `entered_at` on `GET /api/positions/risk`

### 2.1 Where the change lives

File: `backend/routes/positions.py`, function `get_positions_risk`.

The `entered_at` derivation is a single additional Supabase query inserted at the top of the handler, before the market-data fan-out. It has no dependency on IV or bias data and does not need to be inside the `ThreadPoolExecutor`.

### 2.2 Exact Supabase query

The query fetches one row per `(symbol, expiry, strike, option_type, strategy_key)` group, selecting the minimum `created_at` across all order rows for that group, filtered to the authenticated user.

```python
sb = get_supabase()
entered_at_result = (
    sb.table("orders")
    .select("symbol, expiry, strike, option_type, strategy_key, created_at")
    .eq("user_id", user_id)
    .execute()
)
```

Because the Supabase Python client does not expose SQL `GROUP BY` + `MIN()` directly in the query builder, the aggregation is performed in Python over the returned rows:

```python
from collections import defaultdict

# Build a map: (symbol, expiry, strike, option_type, normalised_strategy_key) → earliest ISO date
entered_at_map: dict[tuple, str] = {}
raw_rows = entered_at_result.data or []
for row in raw_rows:
    norm_key = row.get("strategy_key") or "manual"
    map_key = (
        row["symbol"],
        str(row["expiry"]),
        str(row["strike"]),
        row["option_type"],
        norm_key,
    )
    iso_date = row["created_at"][:10]  # "YYYY-MM-DD"
    if map_key not in entered_at_map or iso_date < entered_at_map[map_key]:
        entered_at_map[map_key] = iso_date
```

The `[:10]` slice extracts the date portion from the ISO 8601 timestamp string that Supabase returns (e.g. `"2026-06-25T14:30:00+00:00"` → `"2026-06-25"`). This is safe because Supabase always returns `created_at` in ISO 8601 format with the date in the first 10 characters.

The normalisation `row.get("strategy_key") or "manual"` matches the `_strategy_group()` helper already used in `user_portfolio.py`. Older order rows that were inserted before migration 003 may have `strategy_key = NULL`; they are bucketed under `"manual"` identically to how positions are grouped.

### 2.3 Merging `entered_at` into the risk response

After the risk items are computed, the `entered_at` is attached per item:

```python
for item in risk_items:
    norm_key = item.get("strategy_key") or "manual"
    map_key = (
        item["symbol"],
        item["expiry"],
        str(item["strike"]),
        item["option_type"],
        norm_key,
    )
    item["entered_at"] = entered_at_map.get(map_key)
```

If no order row matches (edge case: the order record was deleted after the position was created), `entered_at` will be `None` at this stage. The next step applies the fallback.

### 2.4 Fallback to `positions.created_at`

When `entered_at` is `None`, the fallback is the `positions.created_at` for that position row. Because `get_positions_risk` delegates to `user_portfolio.get_positions()`, which returns `Position` objects without `created_at`, a second positions query is needed only for the fallback case.

To avoid a second query in the common case, the fallback is handled lazily:

```python
# Collect positions that need fallback
missing = [item for item in risk_items if item.get("entered_at") is None]
if missing:
    pos_rows = (
        sb.table("positions")
        .select("symbol, expiry, strike, option_type, strategy_key, created_at")
        .eq("user_id", user_id)
        .execute()
        .data or []
    )
    pos_fallback: dict[tuple, str] = {}
    for row in pos_rows:
        norm_key = row.get("strategy_key") or "manual"
        map_key = (
            row["symbol"],
            str(row["expiry"]),
            str(row["strike"]),
            row["option_type"],
            norm_key,
        )
        pos_fallback[map_key] = row["created_at"][:10]

    for item in missing:
        norm_key = item.get("strategy_key") or "manual"
        map_key = (
            item["symbol"],
            item["expiry"],
            str(item["strike"]),
            item["option_type"],
            norm_key,
        )
        item["entered_at"] = pos_fallback.get(map_key, str(date.today()))
```

The final fallback `str(date.today())` ensures `entered_at` is never `None` or absent in the response, satisfying FR-4.

### 2.5 Strategy group `entered_at` consistency (OQ-2 resolution)

The spec requires that all legs of a strategy group share the same `entered_at` value — the earliest entry date across all legs in the group (FR-2). After per-leg assignment, a second pass enforces this:

```python
# Enforce group-level minimum: all legs of a strategy share the same entered_at
from collections import defaultdict
group_min: dict[str, str] = defaultdict(lambda: "9999-99-99")
for item in risk_items:
    sk = item.get("strategy_key") or "manual"
    if sk != "manual" and item["entered_at"] < group_min[sk]:
        group_min[sk] = item["entered_at"]

for item in risk_items:
    sk = item.get("strategy_key") or "manual"
    if sk != "manual":
        item["entered_at"] = group_min[sk]
```

Ungrouped/manual positions retain their individual `entered_at` values.

### 2.6 OQ-2: `strategy_key` join correctness

Migration 023 (`023_positions_strategy_unique.sql`) extended the positions unique index to include `COALESCE(strategy_key, 'manual')`, confirming that the same contract can appear in two separate position rows under different `strategy_key` values. Migration 003 added `strategy_key` to the `orders` table as well. The join condition in the `entered_at_map` key tuple — `(symbol, expiry, strike, option_type, normalised_strategy_key)` — exactly mirrors this per-strategy isolation. The result is correct: an order placed under `strategy_key = "bull_call_spread"` for AAPL 200C 2026-12 is matched only to the position row with the same strategy_key, not to a separate manual position on the same contract.

### 2.7 OQ-1: Partial-close / re-entry semantic

Using `MIN(created_at)` means `entered_at` reflects the date the first order was placed for that `(symbol, expiry, strike, option_type, strategy_key)` tuple. In a partial-close scenario (BUY 2 on Day 1, SELL 1 on Day 10, BUY 1 again on Day 15), the partial re-buy on Day 15 is an order row with `action = "buy"` under the same key. `MIN(created_at)` across all three order rows is Day 1. This is correct because:

1. The position was never fully closed — the position row persisted through the partial close with a reduced quantity.
2. `entered_at = Day 1` accurately reflects how long the position has been active.
3. If the user had fully closed (quantity reaches 0, position row deleted) and then re-entered, the position row would be a new row created at Day 15. The orders query for `MIN(created_at)` would still return Day 1 (the old orders still exist). This is the edge case. The PO decision (Gate 2, OQ-1) is that `MIN(created_at)` is the correct semantic for a paper-trading education tool, representing how long this strategy configuration has been held. The developer should document this behaviour in an inline code comment.

### 2.8 OQ-5: Query performance

The `orders` table has an index on `(user_id, created_at desc)` (migration 001). The query `SELECT ... FROM orders WHERE user_id = $1` uses this index to filter to the user's rows efficiently. With a limit of 200 order rows per user (the existing `get_orders` cap), the Python-side `MIN` aggregation operates on at most 200 rows in memory — this is negligible. No composite index is required for v1.

The `entered_at` query is executed once per request, synchronously on the event loop (not in the ThreadPoolExecutor), because it is a fast indexed Supabase read, not a blocking market-data HTTP call. It executes before the market-data fan-out, adding approximately 20–50ms to the total request time, which is well within the 60-second timeout.

### 2.9 Response field added

The `entered_at` field is appended to each item in the array returned by `GET /api/positions/risk`. Its type is `str`, format `"YYYY-MM-DD"`. It is never `null` or absent in a successful response (guaranteed by the fallback chain in 2.4).

Example response item (new field highlighted):

```json
{
  "symbol": "AAPL",
  "expiry": "2026-09-19",
  "strike": 200.0,
  "option_type": "call",
  "quantity": 1,
  "avg_cost": 5.20,
  "current_price": 4.10,
  "pnl": -110.0,
  "strategy_key": "bull_call_spread",
  "strategy_name": "Bull Call Spread",
  "profit_target_pct": 50.0,
  "entry_action": "buy",
  "dte": 84,
  "pnl_pct": -21.2,
  "risk_level": "green",
  "iv_rank": 32.1,
  "iv_environment": "NORMAL",
  "bias": "BULLISH",
  "signals": [...],
  "narrative": null,
  "entered_at": "2026-06-25"
}
```

No other existing fields are changed.

---

## 3. TypeScript Interface Change

File: `frontend/src/api/client.ts`

The `PositionRisk` interface gains one required field:

```typescript
export interface PositionRisk {
  // ... all existing fields unchanged ...
  entered_at: string   // "YYYY-MM-DD" — never null per backend guarantee
}
```

Making `entered_at` required (not optional) is intentional: the backend guarantees its presence, and making it optional would require defensive null-checks throughout the new components that are unnecessary. The edge-case defensive rendering (display "—" in place of the date chip) is triggered by checking whether `entered_at` is an empty string, which cannot occur from the backend but is a TypeScript-level safety net.

The `getPositionsRisk()` function signature does not change.

---

## 4. Frontend Component Design

### 4.1 Existing components removed from the main render path

The following components currently render in the main vertical list and are replaced by the new layout. They are not deleted from the file — they are preserved verbatim and reused in the right panel:

| Component | Current use | New use |
|-----------|-------------|---------|
| `PositionCard` | One card per leg in the vertical stack | One leg card per leg in the right panel body |
| `StrategyGroupCard` | One large card per group | Removed from main render; replaced by left-panel rows + right-panel detail |
| `NarrativePanel` | Inside `StrategyGroupCard` header | Inside right-panel `TradeNarrativeSection` (collapsed by default) |
| `DefensiveNarrativeSingle` | Inside `PositionCard` / `StrategyGroupCard` action plan | Inside right-panel `ActionPlanBox` (always visible) |
| `DefensiveNarrativeGroup` | Inside `StrategyGroupCard` action plan | Inside right-panel `ActionPlanBox` (always visible) |
| `CloseInstructions` | Inside single-leg action plan | Inside right-panel `ActionPlanBox` for single-leg groups with negative P&L |
| `ProgressBar` | Inside `PositionCard` | Reused as `MiniProgressBar` in left panel rows (different props — see 4.3) |
| `SignalRow` | Inside `PositionCard` | Unchanged, reused in leg cards in right panel |

`PositionCard` is modified in one specific way: the `isInGroup` prop currently controls whether the action plan toggle is shown inside the card. In the new layout, all leg cards in the right panel are always "in group" (action plan is handled by `ActionPlanBox` at the panel level, not per-leg card). The prop remains but is always passed as `true` from the new right-panel code path. No change to the `PositionCard` component internals beyond this usage change.

### 4.2 New components to add (all within `RiskMonitor.tsx`)

All new components are added to the same single-file `RiskMonitor.tsx`. The file grows but does not gain external dependencies.

#### `RiskListRow`

A single row in the left panel or mobile accordion list.

Props:
```typescript
interface RiskListRowProps {
  group: StrategyGroup        // existing type, extended with entered_at
  isSelected: boolean
  onClick: () => void
}
```

Renders:
- 3px left border coloured by `worstLevel` of the group
- Background: `#1e2135` when selected, `C.surface` otherwise
- Strategy name (truncated with `text-overflow: ellipsis` on overflow)
- "Entered DD Mon" chip (formatted from `group.enteredAt`)
- Worst risk badge (reuses `riskLabel` / `riskColor` helpers)
- Highest DTE among group legs
- Net combined P&L (sum across all legs)
- `MiniProgressBar` (see 4.3)

#### `MiniProgressBar`

A thin 3px-high horizontal bar for the left panel row.

Props:
```typescript
interface MiniProgressBarProps {
  worstLegPnlPct: number  // Math.min(...group.positions.map(p => p.pnl_pct))
  level: 'green' | 'yellow' | 'red'
}
```

The `worstLegPnlPct` is the most negative `pnl_pct` value across the group's legs (PO decision, OQ-3). The display value is `Math.abs(worstLegPnlPct)`, clamped to 0–100%. Colour follows `riskColor(level)` for negative values, `C.green` for non-negative. The bar fill represents progress toward/past zero, not toward a profit target, because the worst-leg approach does not have a meaningful profit target denominator.

#### `DateSeparatorRow`

A static divider row between date groups in the left panel list.

Props:
```typescript
interface DateSeparatorRowProps {
  dateStr: string  // "YYYY-MM-DD"
}
```

Renders the date as "DD Mon YYYY" (e.g. "25 Jun 2026") using a helper function `fmtFullDate(iso: string): string`.

#### `RightPanelHeader`

The header section of the right panel for the selected group.

Props:
```typescript
interface RightPanelHeaderProps {
  group: StrategyGroup
  today: Date
}
```

Renders:
- Strategy name (large, bold)
- Worst risk badge
- Combined net P&L (coloured green/red)
- Sub-line: leg count, nearest expiry (min expiry across legs), IV Rank of the underlying if available (uses `iv_rank` from the first leg that has a non-null `iv_rank`)
- Entry date banner: `"Trade entered DD Mon YYYY — N days ago"` where N is `Math.floor((today - new Date(group.enteredAt)) / 86400000)`

#### `ActionPlanBox`

Renders the action plan content (always visible, no toggle). Replaces the current collapsible "Action Plan" section in `StrategyGroupCard`.

Props:
```typescript
interface ActionPlanBoxProps {
  group: StrategyGroup
  stockPrices: Record<string, number>
}
```

Logic:
- If group has exactly one position and combined P&L < 0: renders `<DefensiveNarrativeSingle>` + `<CloseInstructions>` (same as the current single-leg action plan, now always visible).
- If group has multiple positions: renders `<DefensiveNarrativeGroup>` (which handles both the `combinedPnl >= 0` case and the losing case internally — existing behaviour is preserved).
- If combined P&L >= 0 for a single-leg group: renders nothing (the `DefensiveNarrativeSingle` component already returns `null` for non-losing positions; this is pre-existing behaviour).

#### `TradeNarrativeSection`

Collapsible section in the right panel header for the `narrative` object.

Props:
```typescript
interface TradeNarrativeSectionProps {
  narrative: Record<string, unknown>
}
```

State: `const [open, setOpen] = useState(false)` — collapsed by default (PO decision, OQ-4).

Renders a "Trade Narrative ▼/▲" button and, when open, `<NarrativePanel narrative={narrative} />` (reused verbatim).

#### `RightPanelDetail`

The full right-panel content for a selected group.

Props:
```typescript
interface RightPanelDetailProps {
  group: StrategyGroup
  stockPrices: Record<string, number>
  today: Date
}
```

Renders (in order):
1. `<RightPanelHeader>`
2. If `group.narrative`: `<TradeNarrativeSection narrative={group.narrative} />`
3. One `<PositionCard pos={leg} stockPrice={...} isInGroup={true} />` per leg in the group, sorted by worst risk level first (same sort as current `StrategyGroupCard`)
4. `<ActionPlanBox group={group} stockPrices={stockPrices} />`

Each `PositionCard` receives a per-leg entry-date chip. This is a new addition to `PositionCard`. To avoid coupling `PositionCard` to `entered_at` at the prop level (which would require passing it through the existing `PositionRisk` interface used everywhere else), the chip is rendered by inspecting `pos.entered_at` directly, since `entered_at` is now a field on `PositionRisk`. No new prop required.

The per-leg entry-date chip reads "Entered DD Mon YYYY" using `fmtFullDate(pos.entered_at)`.

### 4.3 Extended `StrategyGroup` type

The existing local `StrategyGroup` interface in `RiskMonitor.tsx` is extended:

```typescript
interface StrategyGroup {
  key: string
  label: string
  positions: PositionRisk[]
  narrative: Record<string, unknown> | undefined
  enteredAt: string   // "YYYY-MM-DD" — min entered_at across all legs of the group
  worstLevel: 'green' | 'yellow' | 'red'
  combinedPnl: number
  worstLegPnlPct: number  // Math.min(...positions.map(p => p.pnl_pct))
}
```

`worstLevel`, `combinedPnl`, and `worstLegPnlPct` are precomputed during group assembly (the same loop that currently builds `groupMap`). This avoids recomputing them in multiple render paths.

`enteredAt` is the minimum `entered_at` across all positions in the group. Per FR-2 and the backend's group-min enforcement pass (section 2.5), all legs in a named strategy group already share the same `entered_at` value from the API. The frontend takes `Math.min` across legs' `entered_at` strings (string lexicographic comparison is valid for `"YYYY-MM-DD"` format) as a defensive frontend measure.

### 4.4 State management in `RiskMonitor`

The existing state variables (`data`, `loading`, `refreshing`, `lastUpdated`, `error`, `aiEnabled`, `aiSummary`, `aiLoading`, `aiError`, `stockPrices`) are unchanged.

Two new state variables are added:

```typescript
const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
const [mobileExpandedKey, setMobileExpandedKey] = useState<string | null>(null)
```

`selectedGroupKey` tracks which group is shown in the right panel (desktop). `mobileExpandedKey` tracks the single expanded accordion row (mobile).

#### Default selection on load

After data loads, the selected group defaults to the first item in the sorted list (most recently entered trade). This is implemented in the `load` callback:

```typescript
const load = useCallback(async (silent = false) => {
    // ... existing fetch logic ...
    const result = await getPositionsRisk()
    setData(result)
    // After building groups from result, auto-select the first group
    // The group sort runs in the render path, so we replicate the sort key here
    // to find the first group key without duplicating the full grouping logic:
    setSelectedGroupKey(prev => {
        const built = buildGroups(result)  // extracted helper (see 4.5)
        if (built.length === 0) return null
        // On silent refresh: keep current selection if it still exists
        if (silent && prev && built.some(g => g.key === prev)) return prev
        return built[0].key
    })
    // ...
}, [])
```

On auto-refresh (`silent = true`): if the currently selected group still exists in the refreshed data, it remains selected. If it no longer exists (the position was fully closed during the refresh window), selection falls back to the first item in the new sorted list.

### 4.5 Group assembly extracted to `buildGroups`

The current inline IIFE group-assembly block in `RiskMonitor` is extracted to a named function `buildGroups(data: PositionRisk[]): StrategyGroup[]` at the module level (inside the file). This makes it callable from both the render path and the `load` callback (for default selection). No logic changes — the existing grouping, narrative assignment, and sorting logic is preserved, with the sort changed from risk-level order to newest-first `enteredAt` order (see 4.6).

### 4.6 Sort order

The current sort in `groups` is by worst risk level (`riskRank`). The new sort is newest-first by `enteredAt`:

```typescript
return [...groupMap.values()].sort((a, b) => {
    // Primary: newest entered_at first (descending string comparison)
    if (b.enteredAt > a.enteredAt) return 1
    if (b.enteredAt < a.enteredAt) return -1
    // Secondary: worst risk level first (existing tiebreaker)
    return aWorst - bWorst
})
```

When two groups share the same `enteredAt` (e.g. two strategies opened on the same date), the secondary sort by worst risk level preserves the existing prioritisation logic.

### 4.7 Desktop layout structure

```
<RiskMonitor>                               // outer container
  <Header strip>                            // unchanged
  <Summary stat chips>                      // unchanged (conditional on data.length > 0)
  <SplitContainer>                          // flex row, height: calc(100vh - Npx), overflow: hidden
    <LeftPanel>                             // width: 270px, flex-shrink: 0, overflow-y: auto
      <DateSeparatorRow> (when date changes)
      <RiskListRow> × N
    </LeftPanel>
    <RightPanel>                            // flex: 1, overflow-y: auto
      <RightPanelDetail>                    // rendered when selectedGroupKey != null
    </RightPanel>
  </SplitContainer>
  <AI section>                              // below split, unchanged
</RiskMonitor>
```

The `SplitContainer` does not render when `loading`, `error`, or `data.length === 0`. Those states continue to render the existing centred messages.

The left and right panels scroll independently via `overflow-y: auto` on each panel. The outer container has `overflow: hidden` to prevent the split from causing page-level scroll in the Risk Monitor tab.

Panel heights: `SplitContainer` uses `maxHeight: 'calc(100vh - 260px)'` (approximate — the implementer should measure the actual header strip + stat chips height and adjust). Both panels use `height: '100%'` to fill the container.

### 4.8 Mobile layout (≤ 768px)

The breakpoint is detected using the existing `useWindowSize` hook from `frontend/src/hooks/useWindowSize.ts`. The hook already exposes an `isMobile` boolean (breakpoint: 768px). No new hook is needed.

```typescript
const { isMobile } = useWindowSize()
```

When `isMobile` is `true`, the component renders a single-column accordion instead of the split layout:

```
<MobileAccordion>
  for each group (sorted newest-first):
    <RiskListRow onClick={() => toggleExpand(group.key)} />
    {mobileExpandedKey === group.key && (
      <RightPanelDetail group={group} ... />  // inline detail
    )}
</MobileAccordion>
```

`mobileExpandedKey` holds at most one expanded key. Tapping an already-expanded row sets `mobileExpandedKey` to `null` (collapses it). Tapping a different row sets `mobileExpandedKey` to the new key.

The `RiskListRow` component is reused identically for both desktop and mobile. On mobile, the strategy name may truncate with ellipsis. The risk badge, entry-date chip, DTE, and P&L are all visible per the spec.

The AI Risk Overview section remains below the accordion list on mobile.

### 4.9 PositionCard per-leg entry date chip

`PositionCard` is modified to render a per-leg entry-date chip when `pos.entered_at` is present. This chip is displayed in the card header row alongside the existing symbol/badge/strike/expiry line:

```tsx
{pos.entered_at && (
  <span style={{ fontSize: '10px', background: '#1a1d27', border: '1px solid #2d3148',
    color: '#64748b', padding: '1px 6px', borderRadius: '6px' }}>
    Entered {fmtShortDate(pos.entered_at)}
  </span>
)}
```

`fmtShortDate("2026-06-25")` returns `"25 Jun 2026"` for the right-panel chip. The left-panel chip uses `fmtChipDate` which returns `"Entered 25 Jun"` (without year) to fit the compact row.

Two helper functions are added:

```typescript
function fmtChipDate(iso: string): string {
  // "2026-06-25" → "25 Jun"
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [, mm, dd] = iso.split('-')
  return `${parseInt(dd, 10)} ${MONTHS[parseInt(mm, 10) - 1]}`
}

function fmtFullDate(iso: string): string {
  // "2026-06-25" → "25 Jun 2026"
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [yyyy, mm, dd] = iso.split('-')
  return `${parseInt(dd, 10)} ${MONTHS[parseInt(mm, 10) - 1]} ${yyyy}`
}
```

The existing `fmtDate` function (which converts `"YYYY-MM-DD"` to `"DD-MM-YYYY"` for expiry display) is unchanged.

### 4.10 Leg card metric tiles — Collected vs Cost tile

The spec (FR-16) requires that SELL legs show a "Collected" tile and BUY legs show a "Cost" tile, both computing `avg_cost × |qty| × 100`. The current `PositionCard` already renders "Cost" and "Value" tiles for all legs. In the new right-panel context (where `isInGroup = true`), the card is modified to:

- Replace the generic "Cost" tile label with "Collected" for SELL legs and "Cost" for BUY legs.
- The formula and value are unchanged: `pos.avg_cost × Math.abs(pos.quantity) × 100`.

This change is applied inside `PositionCard` by inspecting `entryAction`:

```tsx
const tileLabel = isSell ? 'Collected' : 'Cost'
```

This is a cosmetic label change only — the number displayed is already `totalCost` (which equals `avg_cost × qty × 100`).

---

## 5. No Database Migration Required

The `entered_at` field is derived at query time from `orders.created_at`. No new column, no new table, no schema change is required. This is confirmed by the spec (Section 5: "A database migration to add a new column" is explicitly out of scope).

---

## 6. Files Changed

| File | Type of change |
|------|---------------|
| `backend/routes/positions.py` | Add `entered_at` derivation query and merge into `risk_items` |
| `frontend/src/api/client.ts` | Add `entered_at: string` to `PositionRisk` interface |
| `frontend/src/components/RiskMonitor.tsx` | Replace layout; add new components; extend `StrategyGroup`; change sort; add `selectedGroupKey` state |

No new files. No new packages. No migration file.

---

## 7. External Quota Impact

| Service | Impact |
|---------|--------|
| Supabase Postgres | One additional `SELECT` from `orders` per `GET /api/positions/risk` request. Indexed on `user_id`. Low cost; 200 rows maximum per user. No quota concern. |
| yfinance | Unchanged. |
| Claude API | Unchanged. |
| Reddit PRAW | Not used by Risk Monitor. Unchanged. |

---

## 8. Caching Strategy

This feature introduces no new external API calls. The `entered_at` derivation reads from Supabase (internal database), not an external service. No caching layer is required or appropriate — the value must be fresh on each request, as a new order placed seconds before the Risk Monitor loads must immediately appear with today's `entered_at`.

The existing 5-minute auto-refresh in `RiskMonitor` (the `setInterval` calling `load(true)`) continues to govern how often the full risk response is fetched. `entered_at` is refreshed as part of that same response.

---

## 9. Auth and Security

No changes to auth. `GET /api/positions/risk` already requires a valid bearer token via `verify_token`. The new `orders` query is filtered strictly by `user_id = get_user_id(payload)`. A user cannot see another user's `entered_at` values.

The `get_supabase()` call for the `entered_at` query is made inside the `get_positions_risk` handler function body (not at module level), preserving the existing invariant.

---

## 10. Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| No open positions | `data.length === 0` — split panel does not render; existing "No open positions to monitor" message shown |
| One position / one group | Left panel shows one row (no date separator needed); auto-selected; right panel shows detail |
| All positions same `entered_at` | Single date separator at top; all rows grouped under it |
| `entered_at` today | Left chip: "Entered DD Mon"; right banner: "Trade entered DD Mon YYYY — 0 days ago" |
| `entered_at` absent in response (should not occur) | `pos.entered_at` is truthy-checked before rendering chip; banner shows "—" |
| Group's legs have different `entered_at` (should not occur per backend) | Frontend takes `Math.min` across legs for `group.enteredAt` as defensive measure |
| 50+ positions | Left panel scrolls; right panel scrolls; single Supabase `orders` query handles all |
| Mobile at exactly 768px | `isMobile` is `width <= 768` inclusive; accordion applies |
| Auto-refresh while user has selected a row | If group still exists: selection preserved; if not: defaults to first item |
| AI quota exhausted | AI section remains below split panel; existing error state unchanged |

---

## 11. ADR

One ADR is warranted for the `entered_at` derivation strategy.

**ADR-0014: `entered_at` Derived at Query Time from `orders.created_at` Rather Than Stored as a Column**

The decision was to derive `entered_at` as `MIN(orders.created_at)` at request time rather than adding a stored column to the `positions` table. The alternatives were:

1. Add `entered_at date` column to `positions`, populated at insert time and updated on re-entry. Rejected because it requires a migration, a backfill for existing rows, and application logic to keep it in sync with the orders table — three new failure modes for a value that can be computed directly from the source-of-truth data that already exists.

2. Store `entered_at` on orders as a denormalised field. Rejected as redundant — `orders.created_at` is already the canonical entry timestamp.

3. Derive at query time (chosen). Requires no schema change, no backfill, and stays accurate through partial closes and re-entries without any maintenance. The cost is one additional Supabase query per `GET /api/positions/risk` request, which is acceptable given the low order volume and existing 60-second timeout.

This ADR will be written to `docs/adr/0014-entered-at-derived-at-query-time.md`.

---

## 12. Open Questions Resolved

All five open questions from the spec have been resolved by the PO (Gate 2) and are addressed in this design:

| OQ | Spec resolution | Design section |
|----|----------------|----------------|
| OQ-1 — Partial-close entry date | `MIN(created_at)` — correct for paper trading | Section 2.7 |
| OQ-2 — `strategy_key` join correctness | Verified by migration 023 | Section 2.6 |
| OQ-3 — Mini progress bar metric | Worst-leg `pnl_pct`, clamped 0–100% | Sections 4.2, 4.3 |
| OQ-4 — Trade Narrative default state | Collapsed by default | Section 4.2 `TradeNarrativeSection` |
| OQ-5 — Second query performance | Acceptable; existing index sufficient | Section 2.8 |

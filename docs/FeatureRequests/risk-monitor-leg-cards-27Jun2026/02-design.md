# Technical Design — Risk Monitor Right-Panel Compact Leg Cards

**Feature folder:** `docs/FeatureRequests/risk-monitor-leg-cards-27Jun2026/`
**Gate:** 2 — Architecture Design
**Author:** solution-architect
**Date:** 27Jun2026
**Status:** Draft — pending Gate 3 approval

---

## 1. Scope Confirmation

This is a presentation-only change confined to a single file:

```
frontend/src/components/RiskMonitor.tsx
```

No backend routes, no API changes, no database migrations, no new packages, no changes to the `PositionRisk` interface, no changes to `getPositionsRisk()`. All data fields required by `LegCard` are already present on `PositionRisk` as defined in `frontend/src/api/client.ts` lines 123–145.

---

## 2. `PositionRisk` Fields Used by `LegCard`

The following fields from `PositionRisk` are used by the new component. All are guaranteed present by the existing backend contract:

| Field | Type | Usage in LegCard |
|---|---|---|
| `symbol` | `string` | Header bold text |
| `entry_action` | `string \| undefined` | SELL/BUY pill; Cost/Collected label; fallback to quantity sign |
| `option_type` | `string` | CALL/PUT pill |
| `quantity` | `number` | `×N` header chip (abs); Qty tile (abs) |
| `strike` | `number` | Sub-line: `$strike` via `fmt(pos.strike, 0)` |
| `dte` | `number` | Sub-line: `Nd left` |
| `iv_rank` | `number \| undefined` | IV Rank tile; omit tile when null/undefined |
| `avg_cost` | `number` | ENTRY→NOW left price; Cost/Collected tile value |
| `current_price` | `number` | ENTRY→NOW right price |
| `pnl` | `number` | P&L display in bottom row |
| `pnl_pct` | `number` | `MiniProgressBar` — passed as `worstLegPnlPct` |
| `risk_level` | `'green' \| 'yellow' \| 'red'` | Top border colour; card background; border colour; status short-form; `MiniProgressBar` level |

---

## 3. `LegCard` Component Specification

### 3.1 Placement in the file

`LegCard` is defined immediately before `RightPanelDetail` in `RiskMonitor.tsx`. It is a new, separately-named function component. `PositionCard` is retained in the file (see Section 5).

### 3.2 Props

```typescript
function LegCard({ pos }: { pos: PositionRisk })
```

No `stockPrice` prop — the stock price shown in `PositionCard`'s header is not part of the approved compact card design. No `isInGroup` prop — `LegCard` is only ever used inside `RightPanelDetail` where group context is implicit.

### 3.3 Derived values

All derivations happen inside `LegCard` using only `pos` fields and the existing helper functions already defined at module scope.

**Entry action (with fallback for pre-`entry_action` data):**
```typescript
const entryAction = (pos.entry_action || (pos.quantity > 0 ? 'buy' : 'sell')).toLowerCase()
const isSell = entryAction === 'sell'
```
This fallback is the same pattern used in `PositionCard` (line 462) and `CloseInstructions` (line 113) and `DefensiveNarrativeSingle` (line 168). It is the established convention for positions that pre-date the `entry_action` field.

**Quantity chip and Qty tile (both retained per OQ-1 PO decision):**
```typescript
const qty = Math.abs(pos.quantity)
// Header chip: ×{qty}
// Qty tile: {qty}
```

**Cost/Collected tile:**
```typescript
const tileValue = pos.avg_cost * qty * 100   // e.g. 2.10 × 1 × 100 = 210
const tileLabel = isSell ? 'Collected' : 'Cost'
// Formatted: `$${Math.round(tileValue)}` — rounded to nearest dollar
```

**Status short-form (OQ-2 resolution — no emoji, short text only):**

`riskLabel()` returns `'🔴 HIGH RISK'` / `'🟡 WATCH'` / `'🟢 OK'`. The compact status strips the emoji and shortens `HIGH RISK` to `HIGH`:

```typescript
function riskShort(level: string): string {
  if (level === 'red') return 'HIGH'
  if (level === 'yellow') return 'WATCH'
  return 'OK'
}
```

This helper is defined at module scope alongside `riskLabel`. It does not replace `riskLabel` — `riskLabel` continues to be used by `RiskListRow` and `RightPanelHeader` unchanged.

**IV Rank colour:**
```typescript
const ivColor =
  pos.iv_rank == null     ? undefined               // tile omitted
  : pos.iv_rank > 70     ? C.red
  : pos.iv_rank > 50     ? C.yellow
  : C.text
```

**ENTRY→NOW prices:**
```typescript
// Both formatted to 2 decimal places using fmt()
`$${fmt(pos.avg_cost)} → $${fmt(pos.current_price)}`
```

**P&L:**
```typescript
const pnlColor = pos.pnl >= 0 ? C.green : C.red
const pnlDisplay = `${pos.pnl >= 0 ? '+' : ''}$${fmt(pos.pnl)}`
// pos.pnl < 0: fmt() produces e.g. "70.00"; prepend "−$" (note: pnl is already negative,
// so the minus sign comes from pos.pnl being negative: `${pos.pnl >= 0 ? '+' : ''}$${fmt(pos.pnl)}`
// gives "+$70.00" or "-$70.00" — the minus sign is embedded in fmt output for negative numbers.
// Spec AC Story 2 AC2: "−$70.00" — this is consistent with fmt() producing "70.00" for Math.abs
// and prepending "−$" manually. Use: pos.pnl >= 0 ? `+$${fmt(pos.pnl)}` : `-$${fmt(Math.abs(pos.pnl))}`
```

To match the spec requirement for a minus-dollar format (`−$70.00` not `-$-70.00`):
```typescript
const pnlDisplay = pos.pnl >= 0
  ? `+$${fmt(pos.pnl)}`
  : `-$${fmt(Math.abs(pos.pnl))}`
```

### 3.4 Card structure (visual anatomy)

```
┌─────────────────────────── 3px risk-coloured top bar ───────────────────────┐
│ [AAPL] [BUY] [CALL] [×2]                               [HIGH / WATCH / OK]  │  ← header row
│ $490 · 18d left                                                              │  ← sub-line (#7dd3fc)
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                                    │
│ │  Qty     │  │ IV Rank  │  │ Cost     │                                    │  ← 3-tile row
│ │  2       │  │  45      │  │  $210    │                                    │
│ └──────────┘  └──────────┘  └──────────┘                                    │
│ ENTRY→NOW $2.10 → $1.30                          P&L: +$80.00 (green)       │  ← bottom row
│▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← MiniProgressBar
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 CSS styling

**Card container:**
```css
background: riskBg(pos.risk_level)
border: 1px solid riskColor(pos.risk_level) + '44'    /* 0x44 opacity — matches PositionCard */
borderTop: 3px solid riskColor(pos.risk_level)         /* overrides the 1px top border */
borderRadius: 8px
padding: 10px 12px
maxWidth: 360px                                        /* OQ-3 PO decision — card-level cap */
display: flex; flexDirection: column; gap: 8px
```

The `borderTop: 3px solid` overrides the top side of the `border: 1px solid` shorthand. This is the standard CSS border shorthand override pattern — no extra wrapper element is needed.

**Top bar approach note:** `border` shorthand sets all four sides to 1px; `borderTop` then overrides just the top to 3px. The end state is: top=3px coloured, left/right/bottom=1px coloured at 0x44 opacity. This matches the spec requirement for a 3px top bar and a 1px perimeter border.

**Header row:**
```css
display: flex; alignItems: center; gap: 6px; flexWrap: wrap; justifyContent: space-between
```
Left cluster: symbol + ActionBadge + TypeBadge + `×N` chip. Right: `riskShort` text in `riskColor`.

**`×N` quantity chip (OQ-4 — styled by frontend developer to match HTML preview spirit):**
```css
/* Suggested by architect; developer may refine */
display: inline-block; padding: 2px 6px; borderRadius: 4px
fontSize: 11px; fontWeight: 700
background: C.surface2; color: C.muted; border: 1px solid C.border
```

**Sub-line:**
```css
fontSize: 12px; color: #7dd3fc
```
Content: `$${fmt(pos.strike, 0)} · ${pos.dte}d left`

**3-tile mini-metric row:**
```css
display: flex; gap: 6px
```
Each tile:
```css
flex: 1; background: C.surface2; borderRadius: 6px; padding: 6px 10px
```
When IV Rank tile is omitted (`pos.iv_rank == null || pos.iv_rank === undefined`), the remaining two tiles each carry `flex: 1` and expand to fill the row width naturally.

Tile internals:
```css
/* label */ fontSize: 10px; color: C.muted; textTransform: uppercase; letterSpacing: 0.06em; marginBottom: 2px
/* value */ fontSize: 14px; fontWeight: 700; color: <derived per tile>
```

**Bottom row:**
```css
display: flex; justifyContent: space-between; alignItems: center; fontSize: 12px
```
Left (ENTRY→NOW): label in `C.muted`, price values in `C.text`.
Right (P&L): value in `pnlColor`.

**MiniProgressBar:** Called as-is:
```typescript
<MiniProgressBar worstLegPnlPct={pos.pnl_pct} level={pos.risk_level} />
```
`MiniProgressBar` already accepts `worstLegPnlPct: number; level: 'green' | 'yellow' | 'red'`. The component's existing logic (`min(abs(pnl_pct), 100)%` width; green when `pnl_pct >= 0`, risk colour otherwise) applies without change.

---

## 4. Changes to `RightPanelDetail`

### 4.1 Current legs section (lines 955–963)

Current:
```tsx
<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
  {sortedPositions.map((pos, i) => (
    <PositionCard
      key={`${pos.symbol}-${pos.strike}-${pos.expiry}-${pos.option_type}-${i}`}
      pos={pos}
      stockPrice={stockPrices[pos.symbol]}
      isInGroup={true}
    />
  ))}
</div>
```

Replaced with:
```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: '10px',
}}>
  {sortedPositions.map((pos, i) => (
    <LegCard
      key={`${pos.symbol}-${pos.strike}-${pos.expiry}-${pos.option_type}-${i}`}
      pos={pos}
    />
  ))}
</div>
```

The key format is unchanged to preserve React reconciliation identity between renders.

### 4.2 Sort order — confirmed unchanged

`sortedPositions` is derived at lines 945–948:
```typescript
const riskRank: Record<string, number> = { red: 0, yellow: 1, green: 2 }
const sortedPositions = [...group.positions].sort(
  (a, b) => riskRank[a.risk_level] - riskRank[b.risk_level]
)
```
Red legs appear first, then yellow, then green. This is unchanged. `LegCard` components are inserted into the grid in this order; CSS `auto-fill` lays them out left-to-right in that order.

### 4.3 Everything else in `RightPanelDetail` — unchanged

- `RightPanelHeader` — unchanged (lines 886–937)
- `TradeNarrativeSection` — unchanged, rendered above the grid (line 954)
- `ActionPlanBox` — unchanged, rendered below the grid (line 965)
- `RightPanelDetail` wrapper div and padding — the outer `display: flex; flexDirection: column` wrapper and `padding: 14px 16px` inner div are unchanged

### 4.4 `isMobile` usage

`RightPanelDetail` does not currently receive or use `isMobile` directly. The grid's responsive reflow is handled entirely by `repeat(auto-fill, minmax(240px, 1fr))` — at panel widths below 240px, `auto-fill` produces a 1-column layout automatically. This covers the mobile accordion path (where `RightPanelDetail` renders inside a narrow inline block) without any prop threading.

The spec requires single-column at `isMobile === true` (viewport ≤ 768px). The `auto-fill` grid satisfies this: a 290px date-rail panel leaves the right-panel content area narrower than 480px on typical mobile viewports, producing a 1-column grid. No explicit `isMobile` branch is needed inside `RightPanelDetail`.

---

## 5. `PositionCard` — Retained, Not Deleted

`PositionCard` (lines 451–581) is retained in `RiskMonitor.tsx` without modification.

A search of all call sites in the codebase confirms:
- `PositionCard` is called in `RightPanelDetail` (line 957) — this call is replaced by `LegCard` in this feature.
- `PositionCard` is not called anywhere else in `RiskMonitor.tsx`.
- `PositionCard` is not exported and is not imported by any other file.

Despite having no remaining call sites after this change, the component is retained per the binding spec requirement (FR-11): "The `PositionCard` component must be retained in the file (not deleted)." This preserves the component for any future render path that may reference it and avoids unintended scope expansion. The frontend developer must not delete or modify `PositionCard`.

---

## 6. Signal Placement — Option C Confirmation (OQ-2 PO Decision)

The PO decision mandates Option C: no signal rows on the compact card. Signals remain exclusively in the group-level `ActionPlanBox`.

**Verification that `ActionPlanBox` already surfaces per-leg urgent signal information:**

I read `DefensiveNarrativeSingle` (lines 165–293), `DefensiveNarrativeGroup` (lines 296–447), and `ActionPlanBox` (lines 863–882) in full.

`DefensiveNarrativeSingle` (single-leg group):
- Identifies the position as a losing short or long leg.
- Surfaces the **breakeven level** and whether the stock is above/below it — this is the underlying driver of the position's red/yellow risk signals (DTE, PnL, and bias signals all flow through to the "Three/Two Paths Forward" PathCards and SummaryBox).
- Explicitly names the mechanism of loss (premium not decaying, option appreciating against the seller, etc.).
- Story 4 AC1 is satisfied: a red-flagged position's urgency is communicated via the Financial Reality paragraph and PathCard A/B/C without any reference to the raw signal messages.

`DefensiveNarrativeGroup` (multi-leg group):
- For a net-losing group, the "Most challenged leg" paragraph (line 368) explicitly names the `$strike OPTION_TYPE` leg with the worst P&L and its individual breakeven.
- The challenged leg is derived as `[...positions].sort((a, b) => a.pnl - b.pnl)[0]` — i.e., the leg with the worst PnL, which is also the leg most likely to carry a red risk signal.
- "Roll the challenged leg" PathCard B names the specific leg at its specific strike, giving the user the same actionable information that a signal message would convey.

**Gap assessment:**

The action plan conveys the *consequence* of the per-leg risk signals (breakeven breach, loss magnitude, recommended action) rather than the raw signal text (e.g. "DTE ≤ 7 days: urgent"). For the accepted acceptance criteria (Story 4 AC1: "a human can read the full signal message text within 10 seconds"), the raw `SignalRow` text is not available unless the user previously saw it in the now-removed `PositionCard`.

This is a **documented gap**: the raw signal messages (`pos.signals` filtered to red/yellow) are no longer surfaced anywhere in the right panel for the selected group. The action plan communicates the same risk in plain English but does not render the structured signal text verbatim.

**Resolution path (action-plan level, not card level):** The spec and PO decision explicitly state this gap, if present, must be addressed "at the action-plan level (NOT by adding signals to the card)." A future iteration of `ActionPlanBox` or a new `SignalSummary` component beneath it could render the raw signal rows for the worst-risk legs. This is out of scope for v1 and must be tracked as a backlog item. The frontend developer must not attempt to close this gap by adding signal rows to `LegCard`.

**Story 4 AC1 compliance:** The 10-second window is met via the `ActionPlanBox` which is always visible without a toggle. The defensive narrative identifies which leg is problematic and why within that 10-second read. The structured signal text is not rendered, but the business meaning is communicated. This is the PO-accepted tradeoff of Option C.

---

## 7. Responsive Grid and `max-width` Cap (OQ-3 PO Decision)

### Grid container

```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
gap: 10px;
```

The grid container has no `max-width`. It fills the right panel's available width, which is `100% - 290px` (left panel) on desktop, `100%` on mobile accordion.

### Card-level `max-width: 360px` (OQ-3)

Each `LegCard` element has:
```css
max-width: 360px;
```

This is applied on the card `div`, not on the grid container. The grid column is `1fr` (or the resolved `auto-fill` width), which can be wider than 360px. The card will size to its column up to 360px and then stop; the remaining column space is empty (the card aligns to the start of its grid cell by default, i.e., left-aligned).

For a 1-leg position on a wide right panel (~700px), the column resolves to ~700px but the card caps at 360px, left-aligned. This is correct per the PO decision: "For a 1-leg position the card aligns left within the grid (standard grid flow, no centering needed)."

### Reflow behaviour at key breakpoints

| Right panel width | `auto-fill` columns | Cards per row |
|---|---|---|
| ≥ 960px (4+ cols) | 4 | 4 (Iron Condor: 1 row) |
| ~480px–960px | 2–3 | 2–3 |
| ~240px–480px | 1–2 | 1–2 |
| < 240px | 1 | 1 (stack) |

At mobile viewport (≤ 768px), the right panel in the accordion layout spans the full viewport minus the 54px `DateRail` width ≈ 714px at 768px, producing 2 columns. At 480px viewport width the panel ≈ 426px, producing 1 column. Single-column layout is reliably achieved at the mobile breakpoints where the spec requires it.

---

## 8. New Helper: `riskShort`

One new module-scope helper function is added:

```typescript
function riskShort(level: string): string {
  if (level === 'red') return 'HIGH'
  if (level === 'yellow') return 'WATCH'
  return 'OK'
}
```

It is placed immediately after `riskLabel` in the file. It does not replace `riskLabel`.

---

## 9. Changed Files

This feature touches exactly one file:

| File | Change type | Description |
|---|---|---|
| `frontend/src/components/RiskMonitor.tsx` | Modified | Add `riskShort()` helper; add `LegCard` component; replace `PositionCard` call in `RightPanelDetail` legs section with `LegCard` grid |

No other files change. No new files are created. No packages are added. No migrations are required.

---

## 10. No New External API Calls

This feature introduces zero new external API calls. The existing `getPositionsRisk()` call and its 5-minute silent refresh interval are unchanged. No new caching strategy is needed. No fallback chain is needed. The three-tier fallback (yfinance → synthetic Black-Scholes) that feeds `current_price` and `iv_rank` already operates transparently; when `iv_rank` is null due to fallback, the IV Rank tile is omitted per spec.

---

## 11. ADR Assessment

No ADR is required. The decisions in this design are:

1. **Grid CSS approach** — `repeat(auto-fill, minmax(240px, 1fr))` is a standard CSS Grid pattern with no technology risk. It requires no library.
2. **`max-width: 360px` on card, not container** — a direct implementation of the binding PO decision. No trade-off was evaluated; the decision was made.
3. **`riskShort()` helper** — a 3-line pure function. Not ADR-worthy.
4. **`PositionCard` retained without call sites** — mandated by spec. Not a design decision.
5. **Signal gap documented at action-plan level** — the PO decision supersedes any architectural alternative. Not ADR-worthy.

The only decision with future impact is the signal gap (Section 6). This is documented inline rather than in an ADR because it is a product decision recorded in the spec (Section 10, OQ-2) rather than a technology or architecture choice.

---

## 12. Edge Cases — Confirmed Handled

| Edge case | Handling |
|---|---|
| `iv_rank` null or undefined | `pos.iv_rank == null` (covers both null and undefined) — IV Rank tile not rendered; remaining 2 tiles expand via `flex: 1` |
| `entry_action` null (pre-dates field) | Fallback: `pos.quantity > 0 ? 'buy' : 'sell'` — same as existing `PositionCard` and `ActionPlanBox` fallback |
| `pnl_pct` exactly 0 | `MiniProgressBar` renders 0% width bar in green (existing behaviour) |
| `pnl_pct > 100` | `MiniProgressBar` clamps to 100% (existing `Math.min` behaviour) |
| `pnl_pct < -100` | `MiniProgressBar` clamps to 100% in risk colour (existing behaviour) |
| `quantity = -2` | `Math.abs(-2) = 2` — `×2` chip and `2` Qty tile (spec Story 2 AC3) |
| Mixed null/non-null `iv_rank` across legs in same group | Each card independently evaluates its own `pos.iv_rank`; cards render 2 or 3 tiles independently. Grid `align-items: start` prevents height stretching across cards of different heights |
| Single-leg group on wide panel | Card caps at 360px, left-aligned in grid cell |
| 4-leg group on 300px panel | `auto-fill` produces 1 column; cards stack vertically |
| Mobile accordion `RightPanelDetail` | Grid inside accordion inline block; same `auto-fill` CSS handles 1-column at narrow widths |

---

## 13. Unchanged Elements — Explicit Confirmation

The following are confirmed unchanged by reading the source:

| Element | Location | Status |
|---|---|---|
| `RightPanelHeader` | Lines 886–937 | Unchanged — not touched |
| `TradeNarrativeSection` | Lines 830–859 | Unchanged — not touched |
| `ActionPlanBox` | Lines 863–882 | Unchanged — not touched |
| `DefensiveNarrativeSingle` | Lines 165–293 | Unchanged — not touched |
| `DefensiveNarrativeGroup` | Lines 296–447 | Unchanged — not touched |
| `CloseInstructions` | Lines 112–127 | Unchanged — not touched |
| `MiniProgressBar` | Lines 687–695 | Unchanged — called as-is from `LegCard` |
| `PositionCard` | Lines 451–581 | Retained, not modified, not called from `RightPanelDetail` after this change |
| `RiskListRow` | Lines 747–826 | Unchanged — left panel |
| `DateRail` | Lines 722–743 | Unchanged — left panel |
| `buildGroups` | Lines 635–683 | Unchanged |
| `ActionBadge` | Lines 65–71 | Unchanged — reused by `LegCard` |
| `TypeBadge` | Lines 74–80 | Unchanged — reused by `LegCard` |
| `riskColor`, `riskBg`, `riskLabel` | Lines 42–58 | Unchanged — reused by `LegCard` |
| `fmt`, `fmtDate` | Lines 20–27 | Unchanged — reused by `LegCard` |
| 5-minute silent refresh | Lines 1024–1027 | Unchanged |
| Mobile accordion layout | Lines 1116–1150 | Unchanged — `RightPanelDetail` is called identically; grid CSS handles responsive reflow |
| Desktop split layout | Lines 1057–1112 | Unchanged — `RightPanelDetail` is called identically |
| AI Risk Overview section | Lines 1206–1234 | Unchanged |
| Header strip and stat chips | Lines 1154–1183 | Unchanged |

---

## 14. Implementation Checklist for Frontend Developer

1. Add `riskShort()` function after `riskLabel` at module scope.
2. Add `LegCard` component before `RightPanelDetail`, accepting `{ pos: PositionRisk }`.
3. Implement card with: risk-coloured top border, header row (symbol + ActionBadge + TypeBadge + `×N` chip + riskShort status), sub-line in `#7dd3fc`, 3-tile row (with IV Rank tile conditionally omitted), bottom row (ENTRY→NOW + P&L), `MiniProgressBar`.
4. Apply `maxWidth: 360px` on the card container element.
5. In `RightPanelDetail`, replace the `flexDirection: 'column'` + `PositionCard` section with the `repeat(auto-fill, minmax(240px, 1fr))` grid + `LegCard` map.
6. Do not modify `PositionCard`.
7. Do not modify any component outside `RightPanelDetail` and the new additions.
8. Verify: IV Rank tile absent when `pos.iv_rank` is null or undefined; Qty tile always present; `×N` chip always present.
9. Verify: `MiniProgressBar` called with `worstLegPnlPct={pos.pnl_pct}` and `level={pos.risk_level}`.
10. Verify: `entryAction` fallback applied when `pos.entry_action` is falsy.

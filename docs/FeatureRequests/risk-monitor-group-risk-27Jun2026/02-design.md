# Technical Design — Risk Monitor Group Risk Badge (Group-Based, Not Worst-Leg-Based)

**Date:** 27Jun2026
**Author:** Solution Architect
**Status:** Approved

---

## 1. Overview

This is a frontend-only change confined to a single file: `frontend/src/components/RiskMonitor.tsx`. The change adds two new fields — `groupLevel` and `groupPnlPct` — to the `StrategyGroup` interface and computes them inside `buildGroups`. Both fields replace `worstLevel`/`worstLegPnlPct` at every display read-site (badge colour, badge text, left-border, `MiniProgressBar` props in `RiskListRow`, badge in `RightPanelHeader`, and the same-date sort tiebreak). The existing `worstLevel` and `worstLegPnlPct` fields are retained on the interface because they continue to be computed in `buildGroups` and are deliberately kept for future component use; removing them would require a type audit that is out of scope. No backend routes, database schema, API contracts, `PositionRisk` interface, narrative components, `LegCard`, `MiniProgressBar`, or `ActionPlanBox` are modified.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `frontend/src/components/RiskMonitor.tsx` | Modified | `StrategyGroup` interface extended; `buildGroups` updated; `RiskListRow` read-sites updated; `RightPanelHeader` read-sites updated; sort tiebreak updated |

No other file changes. No migration. No new environment variables. No new packages.

---

## 3. Database Schema Changes

None. This feature makes no database changes.

---

## 4. API Contracts

No new or modified API endpoints. The existing `GET /api/positions/risk` endpoint and the `PositionRisk` TypeScript interface in `frontend/src/api/client.ts` are untouched. All fields required by the new computation (`pos.pnl`, `pos.risk_level`, `pos.avg_cost`, `pos.quantity`, `pos.dte`, `pos.strategy_key`, `pos.pnl_pct`, `pos.entered_at`) are already present on `PositionRisk`.

---

## 5. Caching Strategy

Not applicable. This feature contains no external data calls. `buildGroups` is a pure transformation of the already-fetched `PositionRisk[]` array; it runs on every render and on every silent 5-minute refresh. No additional caching mechanism is needed.

---

## 6. External Dependency Fallback Chain

Not applicable. No external dependencies are introduced.

---

## 7. StrategyGroup Interface Diff

### Current interface (lines 568–577 of RiskMonitor.tsx)

```typescript
interface StrategyGroup {
  key: string
  label: string
  positions: PositionRisk[]
  narrative: Record<string, unknown> | undefined
  enteredAt: string
  worstLevel: 'green' | 'yellow' | 'red'
  combinedPnl: number
  worstLegPnlPct: number    // Math.min(...positions.map(p => p.pnl_pct))
}
```

### Required interface after this change

```typescript
interface StrategyGroup {
  key: string
  label: string
  positions: PositionRisk[]
  narrative: Record<string, unknown> | undefined
  enteredAt: string
  worstLevel: 'green' | 'yellow' | 'red'      // RETAINED — kept for potential future use
  combinedPnl: number
  worstLegPnlPct: number                        // RETAINED — kept for potential future use
  groupLevel: 'green' | 'yellow' | 'red'        // NEW — group-aware badge level
  groupPnlPct: number                            // NEW — combined P&L as % of combined cost basis
}
```

**Fate of `worstLevel` and `worstLegPnlPct`:** Both fields are retained on the type and continue to be computed in `buildGroups`. After this change no display component reads them directly, but they remain on the object to avoid a breaking type change and to leave a hook for any future component that may want per-leg worst-case data. The TypeScript compiler flag `noUnusedLocals` applies to local variables, not interface fields, so retaining these fields does not produce a compile error.

---

## 8. buildGroups Rule Chain (Full Pseudocode)

The new computation slots in immediately after the existing `worstLevel`, `combinedPnl`, and `worstLegPnlPct` derivations in the `map` callback:

```
for each group g:

  // 1. Existing fields (unchanged)
  worstLevel   = most severe risk_level across all legs (unchanged)
  combinedPnl  = Σ pos.pnl across legs (unchanged)
  worstLegPnlPct = Math.min(...positions.map(p => p.pnl_pct)) (unchanged)

  // 2. New: combined cost basis
  combinedCostBasis = Σ Math.abs(pos.avg_cost × pos.quantity × 100) across all legs

  // 3. New: groupPnlPct
  if combinedCostBasis > 0:
    groupPnlPct = (combinedPnl / combinedCostBasis) × 100
  else:
    groupPnlPct = 0    // zero-cost-basis defensive default

  // 4. New: groupLevel
  if group is single-leg / ungrouped  (key starts with "_ungrouped_"):
    groupLevel = positions[0].risk_level   // unchanged per-leg pass-through

  else if group is named multi-leg (strategy_key is non-null):

    if combinedPnl >= 0:   // net profitable — NEVER red
      allLegsGreen = every pos in positions has risk_level === 'green'
      if allLegsGreen:
        groupLevel = 'green'
      else:
        groupLevel = 'yellow'   // at least one stressed leg, but group is up
      // No DTE-based escalation in the profitable path (OQ-4 binding decision)

    else:   // combinedPnl < 0 — net losing
      // Escalation bands mirror the per-leg _assess_risk loss_limit defaults of 50%
      if groupPnlPct <= -100:
        groupLevel = 'red'    // loss equals or exceeds total premium at risk
      else if groupPnlPct <= -50:
        groupLevel = 'red'    // group-level stop-loss threshold
      else:
        // Check DTE trigger
        minDte = Math.min(...positions.map(p => p.dte))
        if minDte <= 7:
          groupLevel = 'red'  // imminent expiry with net losing group
        else if groupPnlPct <= -25:
          groupLevel = 'yellow'  // meaningful loss, not yet at stop
        else:
          // Small net loss (better than -25%), all individual legs may be green
          // Any leg red/yellow? escalate to yellow; otherwise stay green is wrong
          // for a net-losing position, so minimum is yellow
          groupLevel = 'yellow'

  // Note: the -100 check is listed first even though -50 would also catch it.
  // Ordering matters here: the -100 branch is a conceptually distinct condition
  // (loss exceeds total premium, relevant for complex structures where combinedPnl
  // can exceed combinedCostBasis). Keep both explicit for clarity and auditability.
```

### Clarification: the small net-loss branch

When `combinedPnl < 0` and none of the three red triggers fire (groupPnlPct > -50, minDte > 7), the result is always `'yellow'`, not `'green'`. A group with a net negative P&L is at minimum a WATCH situation regardless of how small the loss is or how green the individual legs appear. This avoids a surprising outcome where a group that has just turned negative still shows OK. The -25% boundary within the yellow branch is retained in the pseudocode to document the full range cleanly, but the outcome is the same on both sides of it: yellow.

### Ungrouped key detection

The existing codebase assigns `key = pos.strategy_key || \`_ungrouped_${ungroupedIdx++}\`` to each group. An ungrouped group therefore always has exactly one position, and its key begins with `_ungrouped_`. The single-leg branch in `groupLevel` detection can equivalently be written as `positions.length === 1 && key.startsWith('_ungrouped_')`, which is equivalent to the key check because named single-leg strategy groups are treated as multi-leg by the rules (spec edge case, section 6) — their logic is algebraically equivalent since the only leg's `risk_level` propagates through all branches anyway.

---

## 9. Sort Comparator Change

The tiebreak in `buildGroups` currently uses a per-leg `worstLevel` rank derived from iterating `positions` directly (lines 625–627). Per OQ-2 binding decision, the tiebreak must switch to `groupLevel` rank.

### Current tiebreak (lines 622–628)

```typescript
return groups.sort((a, b) => {
  if (b.enteredAt > a.enteredAt) return 1
  if (b.enteredAt < a.enteredAt) return -1
  const aWorst = a.positions.reduce<number>((w, p) => Math.min(w, riskRank[p.risk_level]), 2)
  const bWorst = b.positions.reduce<number>((w, p) => Math.min(w, riskRank[p.risk_level]), 2)
  return aWorst - bWorst
})
```

### Required tiebreak after this change

```typescript
return groups.sort((a, b) => {
  if (b.enteredAt > a.enteredAt) return 1
  if (b.enteredAt < a.enteredAt) return -1
  // Tiebreak by groupLevel rank (red=0 sorts first, green=2 sorts last)
  return riskRank[a.groupLevel] - riskRank[b.groupLevel]
})
```

The `riskRank` map (`{ red: 0, yellow: 1, green: 2 }`) is already defined at the top of `buildGroups` and is reused here. The tiebreak now sorts by the same level that the displayed badge shows, eliminating the confusing case where a lower-badged group appeared above a higher-badged group in the same date rail.

---

## 10. Read-Site Checklist — Exhaustive List of Changes

### 10.1 RiskListRow (lines 693–772)

This component has **five distinct read-sites** for `worstLevel`/`worstLegPnlPct` that must all switch to `groupLevel`/`groupPnlPct`:

| Line (current) | Expression | Change Required |
|---|---|---|
| 700 | `const borderColor = riskColor(group.worstLevel)` | Change to `riskColor(group.groupLevel)` |
| 746 | `background: riskBg(group.worstLevel)` | Change to `riskBg(group.groupLevel)` |
| 747–748 | `border: \`1px solid ${borderColor}44\`` | Derives from `borderColor` — covered by line 700 fix |
| 753 | `{riskLabel(group.worstLevel)}` | Change to `riskLabel(group.groupLevel)` |
| 769 | `<MiniProgressBar worstLegPnlPct={group.worstLegPnlPct} level={group.worstLevel} />` | Change to `worstLegPnlPct={group.groupPnlPct} level={group.groupLevel}` |

Note on `borderColor`: this variable is declared once at line 700 and reused at lines 709 (selected left-border), 744 (badge text color), and 747–748 (badge border). A single fix at line 700 propagates to all three uses. The frontend developer must not create a second `borderColor` variable — just change the one declaration.

Note on `isSelected` border (line 709): `borderLeft: \`4px solid ${borderColor}\`` — this is the accent glow ring shown when the row is selected. It currently uses `worstLevel`-derived colour. After the fix it uses `groupLevel`-derived colour, which is the correct and consistent behaviour.

### 10.2 RightPanelHeader (lines 832–883)

This component has **four read-sites** all using `group.worstLevel`:

| Line (current) | Expression | Change Required |
|---|---|---|
| 847 | `color: riskColor(group.worstLevel)` | Change to `riskColor(group.groupLevel)` |
| 848 | `background: riskBg(group.worstLevel)` | Change to `riskBg(group.groupLevel)` |
| 849 | `border: \`1px solid ${riskColor(group.worstLevel)}44\`` | Change to `riskColor(group.groupLevel)` |
| 854 | `{riskLabel(group.worstLevel)}` | Change to `riskLabel(group.groupLevel)` |

Note: lines 847 and 849 both call `riskColor(group.worstLevel)`. The developer should extract a local `const groupBadgeColor = riskColor(group.groupLevel)` at the top of the component to avoid calling `riskColor` three times with the same argument, consistent with how `borderColor` is used in `RiskListRow`.

### 10.3 Sort comparator in buildGroups

As described in section 9 above. The two-line inner sort body replaces the four-line `aWorst`/`bWorst` reduce block.

### 10.4 Summary stat chips (lines 995–997 and 1107)

These remain on `data` (per-leg `risk_level` counts). Do not touch these. Per OQ-1 binding decision, chip counts stay per-leg in v1.

---

## 11. Components Confirmed Unchanged

The following components and logic are explicitly confirmed as requiring no modification under this spec. The frontend developer must not alter any of these:

| Component / Function | Location | Reason Unchanged |
|---|---|---|
| `MiniProgressBar` | Lines 633–641 | Signature and implementation untouched. Only the props passed to it from `RiskListRow` change. |
| `LegCard` | Lines 423–527 | Reads `pos.risk_level` (per-leg backend value) throughout. `groupLevel` must not propagate here. |
| `RightPanelDetail` sort | Lines 891–893 | Sorts legs by per-leg `risk_level` — unchanged. |
| `DefensiveNarrativeSingle` | Lines 137–265 | Reads `pos.pnl` directly — no reference to `worstLevel` or `groupLevel`. |
| `DefensiveNarrativeGroup` | Lines 268–419 | Reads `combinedPnl` and per-leg data directly. No reference to `worstLevel` or `groupLevel`. |
| `CloseInstructions` | Lines 84–99 | Reads per-leg `pos` data. Unchanged. |
| `TradeNarrativeSection` | Lines 776–805 | Reads `narrative` prop. Unchanged. |
| `ActionPlanBox` | Lines 809–828 | Reads `group.combinedPnl` and `group.positions`. Unchanged. |
| `NarrativePanel` | Lines 531–564 | Reads `narrative` prop. Unchanged. |
| Header strip chips | Lines 995–997, 1107, 1118–1130 | Per-leg `risk_level` counts from raw `data` array. Unchanged per OQ-1. |
| `groupByEntryDate` / `DateRail` | Lines 654–689 | Unchanged. |
| Mobile accordion expand/collapse | Lines 1064–1098 | Unchanged. |
| `LegCard` inside `RiskListRow` at line 524 | `MiniProgressBar worstLegPnlPct={pos.pnl_pct} level={pos.risk_level}` | This is the per-leg bar inside `LegCard`, not `RiskListRow`. It reads per-leg values and is unchanged. |

---

## 12. Zero-Cost-Basis Defensive Default

When `combinedCostBasis === 0` (every leg has `avg_cost === 0` or `quantity === 0`), dividing `combinedPnl` by `combinedCostBasis` is undefined. The defensive default is:

```
groupPnlPct = 0
```

With `groupPnlPct = 0`, the net-profit/loss gate (`combinedPnl >= 0` vs `< 0`) still operates correctly because it reads `combinedPnl` directly, not `groupPnlPct`. If `combinedPnl >= 0`, the profitable-group rule applies. If `combinedPnl < 0`, the losing-group rule applies but the percentage-threshold checks (`<= -50`, `<= -100`, `<= -25`) will not fire (since `groupPnlPct = 0`), so only the DTE trigger can escalate to red. The result falls to `'yellow'` if DTE > 7, which is the most conservative safe default for a net-losing position whose loss magnitude cannot be computed. This is intentional and documented.

In practice, zero-cost-basis positions should not occur in OptionsDesk's paper-trading flow because every trade entry requires an `avg_cost`. This case is a pure defensive guard.

---

## 13. Ratio-Spread Cost-Basis Caveat (Known Limitation — OQ-3)

The combined cost basis formula is:

```
combinedCostBasis = Σ Math.abs(pos.avg_cost × pos.quantity × 100)
```

This sums the absolute premium committed to (or collected from) each leg, giving a "total premium at risk" figure. For vanilla credit and debit spreads (equal-quantity legs, one long and one short), this is the correct and intuitive denominator: if you pay $2.00 for one leg and collect $1.00 on another, combinedCostBasis = $300 and a combined loss of $150 correctly reports as -50%.

For ratio spreads (where one side has disproportionately more contracts, e.g. buying 1 call and selling 2 calls), the denominator inflates in proportion to the extra contracts. This means the combined-loss percentage appears smaller than the trader's intuitive "amount at risk," because the sold premium from the extra contracts increases the denominator. The practical consequence is that ratio spreads may reach the -50% group red trigger later than a pure equal-quantity spread would. This is an acceptable and conservative failure mode: the group badge stays at WATCH longer, which does not produce a false alarm; it merely delays escalation. The per-leg `LegCard` signals continue to show individual-leg stress immediately.

This limitation should be revisited if user feedback surfaces distorted readings on ratio spread groups. A future enhancement could compute a net-premium-at-risk denominator that accounts for the bounded max-loss profile of capped structures. That work requires a product decision on the formula and is out of scope for v1.

---

## 14. Worked Example — Put Broken Wing Butterfly

**Given:**
- Strategy group: "Put Broken Wing Butterfly" (named, 3 legs, strategy_key non-null)
- Leg A (long put, decayed): pnl = +$1,702, risk_level = 'green' *(net profitable leg)*
- Leg B (short put body): pnl = -$524, risk_level = 'yellow'
- Leg C (short put wing): pnl = -$541, risk_level = 'red' *(decayed -96% of its own cost)*

**Step 1: combinedPnl**
```
combinedPnl = +1702 + (-524) + (-541) = +637
```
combinedPnl >= 0, so the net-profitable path applies.

**Step 2: combinedCostBasis**
This requires `avg_cost`, `quantity`, and the 100 multiplier per leg. The exact numbers depend on real position data, but since combinedPnl > 0, we know the group is profitable. For illustration, assume:
- Leg A: avg_cost $3.50, qty 1 → |3.50 × 1 × 100| = $350
- Leg B: avg_cost $2.00, qty -1 (short) → |2.00 × -1 × 100| = $200
- Leg C: avg_cost $0.60, qty -1 (short) → |0.60 × -1 × 100| = $60
- combinedCostBasis = $350 + $200 + $60 = $610

**Step 3: groupPnlPct**
```
groupPnlPct = (637 / 610) × 100 = +104.4%
```
groupPnlPct is positive (> 0).

**Step 4: groupLevel**
```
combinedPnl >= 0  →  profitable path
allLegsGreen?     →  No (Leg B is yellow, Leg C is red)
groupLevel        =  'yellow'
```

**Step 5: MiniProgressBar**
```
worstLegPnlPct prop = groupPnlPct = +104.4%
level prop         = 'yellow' (groupLevel)
bar color          = C.green (because worstLegPnlPct >= 0)
bar width          = Math.min(|104.4|, 100) = 100%
```

**Result:**
- Left panel badge: WATCH (yellow) — not HIGH RISK (red)
- Right panel header badge: WATCH (yellow)
- Left panel progress bar: green, 100% width
- Per-leg LegCard for Leg C: still shows HIGH RISK (red top-border, "HIGH" text) — unchanged
- DefensiveNarrativeGroup: still shows green "Strategy Context" box — unchanged

**The intentional tension documented here:** The badge shows WATCH (yellow) and the progress bar shows green. These two signals are deliberately different and are not a bug. The badge says "look, a leg is stressed — be aware." The bar says "the group is net profitable — it is above water." A trader scanning the left panel quickly sees a yellow badge (there is something to check in this group) and a green bar (but the group is not in financial distress). The combination is more informative than either signal alone. The per-leg LegCard is where the trader discovers which specific leg is stressed when they click through.

---

## 15. Frontend State Management

No new state is introduced. `buildGroups` is a pure function called at line 1000 (`const groups = buildGroups(data)`) and at the `setSelectedGroupKey` call inside `load`. Both call-sites continue to work correctly because `buildGroups` returns `StrategyGroup[]` and the new fields are added to the returned objects. No component owns any new state for `groupLevel` or `groupPnlPct`; they are derived values on the group objects, consumed directly at render time.

| Component | State owned | Change |
|---|---|---|
| `RiskMonitor` (main) | `data`, `selectedGroupKey`, etc. | No change to state shape |
| `RiskListRow` | None | Reads `group.groupLevel`, `group.groupPnlPct` instead of `worstLevel`/`worstLegPnlPct` |
| `RightPanelHeader` | None | Reads `group.groupLevel` instead of `worstLevel` |
| `buildGroups` | Pure function | Computes two additional fields on each group |

---

## 16. Subscription Tier Enforcement

Unchanged. The Risk Monitor remains gated on the `risk_monitor` entitlement. The corrected badge logic applies equally to all tiers with access. No tier gate check is modified.

---

## 17. New Environment Variables

None.

---

## 18. ADR References

No ADR is required for this feature. The design decisions are all directly traceable to the PO's binding OQ resolutions recorded in `01-spec.md` Section 10 and `03-approvals.md`. The only choices made by the architect (zero-cost-basis defensive default, handling of the small-net-loss branch) are documented inline above and involve no technology selection or significant irreversible trade-off that would require a separate ADR.

---

## 19. Architect Gate Decision

Approved

_Approved by:_ solution-architect &nbsp;&nbsp; _Date:_ 27Jun2026

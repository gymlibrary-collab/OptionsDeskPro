# Feature Spec — Risk Monitor Group Risk Badge (Group-Based, Not Worst-Leg-Based)

**Date:** 27Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

The Risk Monitor's left-panel list row and right-panel header both display a coloured risk badge
(HIGH RISK / WATCH / OK) for each strategy group. Today that badge is computed in `buildGroups`
(`frontend/src/components/RiskMonitor.tsx`, lines 607–610) as `worstLevel` — the most severe
`risk_level` across all individual legs. The per-leg `risk_level` is computed on the backend by
`_assess_risk` (`backend/routes/positions.py`, line 89), which applies a 50% per-leg stop-loss
threshold independently to every position.

This produces a verified, user-reported contradiction: a Put Broken Wing Butterfly group that is
**net profitable at +$637** displays a **HIGH RISK badge** because one long-put wing has decayed
−96% of its own cost. In a debit butterfly, the long wing is designed to decay while the short
body carries the profit. The defensive narrative already recognises this — it reads "net profitable
… evaluate by net P&L, not individual legs" — but the badge directly above the narrative says
HIGH RISK. The badge contradicts its own narrative.

This feature replaces `worstLevel` with a new `groupLevel` computation that makes the group badge
a function of **combined group P&L** rather than the worst single leg. Per-leg card colours and
signals remain unchanged. The per-leg `risk_level` from the backend is unchanged. Only the
derived group-level badge changes, and only for named multi-leg strategy groups. Single / ungrouped
positions continue to use their own leg's `risk_level` as the badge (no change in that path).

This is a **frontend-only change** confined to `buildGroups` in `RiskMonitor.tsx`, with a
corresponding update to the `StrategyGroup` type to carry a `groupLevel` field and a
`groupPnlPct` field alongside the retained `worstLevel` and `worstLegPnlPct`. Both display
surfaces that read the current `group.worstLevel` for badge rendering — `RiskListRow` and
`RightPanelHeader` — will be updated to read `groupLevel` instead.

The left-panel `MiniProgressBar` inside `RiskListRow` has the same group-vs-leg inconsistency
as the badge. Today it receives `worstLegPnlPct={group.worstLegPnlPct}` (the most-negative
single leg's `pnl_pct`) and `level={group.worstLevel}`. For the Put Broken Wing Butterfly
example this renders a partial amber bar even though the group is net profitable, because the
worst leg is down −96%. This fix also corrects the bar: for named multi-leg groups the bar
length and colour will derive from the group's combined P&L percentage (`groupPnlPct`), not
the worst leg. Single / ungrouped positions are unaffected (their group P&L equals their leg
P&L).

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Multi-leg strategy trader (active) | starter / pro | Glance at the Risk Monitor list and instantly know whether any named strategy group genuinely needs attention — without being falsely alarmed by a HIGH RISK badge on a profitable spread |
| Beginner learner (multi-leg position) | free / starter | Trust that a badge labelled HIGH RISK actually means the strategy is in trouble — not that one leg in a profitable butterfly has decayed as designed |
| Strategy researcher | pro / enterprise | Compare group risk badges across multiple open strategies and triage correctly — the highest-badged group should be the one most needing action, not the one with the most aggressive per-leg stop breach |
| Admin / platform operator | admin | Confirm that the summary stat chips (High Risk count, Watch count) accurately reflect the number of positions or groups in distress, and that a profitable strategy group does not inflate the High Risk chip count |

---

## 3. Functional Requirements

All requirements are frontend-only. No backend route, database schema, `PositionRisk` TypeScript
interface, `_assess_risk` logic, or defensive narrative content is altered.

### Group-level risk derivation

1. `buildGroups` must compute a new field `groupLevel: 'green' | 'yellow' | 'red'` on each
   `StrategyGroup` object, in addition to retaining the existing `worstLevel` field. `worstLevel`
   must not be removed; it is used internally by `LegCard` sort order (`RightPanelDetail`) and
   may be referenced by future components.

2. For **single / ungrouped positions** (groups whose `key` begins with `_ungrouped_`, i.e. groups
   containing exactly one position with no `strategy_key`), `groupLevel` must equal that position's
   own `risk_level`. The badge for ungrouped positions is unchanged.

3. For **named multi-leg strategy groups** (groups with a non-null `strategy_key`, containing two
   or more positions), `groupLevel` is derived from combined group conditions using the following
   ordered rules:

   a. **Net profitable group (combined P&L >= 0):**
      - If every leg individually has `risk_level === 'green'` → `groupLevel = 'green'`.
      - If at least one leg has `risk_level === 'yellow'` or `risk_level === 'red'`, but the
        combined P&L is >= 0 → `groupLevel = 'yellow'`. The group badge is never `'red'` when
        the combined P&L is non-negative.

   b. **Net losing group (combined P&L < 0):**
      - Compute `groupPnlPct`: combined P&L divided by combined cost basis, expressed as a
        percentage. Combined cost basis is the sum of `Math.abs(pos.avg_cost * pos.quantity * 100)`
        across all legs (absolute value, so BUY and SELL legs both contribute positively to basis).
      - If `groupPnlPct <= -100` → `groupLevel = 'red'` (combined loss equals or exceeds total
        premium at risk).
      - If `groupPnlPct <= -50` → `groupLevel = 'red'` (combined loss meets or exceeds the 50%
        group-level stop, mirroring the per-leg stop-loss threshold used by `_assess_risk`).
      - If the soonest-expiring leg has DTE <= 7 **and** combined P&L < 0 → `groupLevel = 'red'`
        (imminent expiry with a losing group is a genuine escalation trigger).
      - If none of the above red triggers fire → `groupLevel = 'yellow'` (net losing but not yet
        at group stop-loss or critical DTE).

4. The `StrategyGroup` TypeScript interface must be extended to include:
   - `groupLevel: 'green' | 'yellow' | 'red'`
   - `groupPnlPct: number` — defined as `(combinedPnl / combinedCostBasis) * 100` where
     `combinedCostBasis = sum of Math.abs(pos.avg_cost * pos.quantity * 100)` across all legs.
     When `combinedCostBasis === 0`, `groupPnlPct` defaults to `0`. For ungrouped single
     positions, `groupPnlPct` equals that position's own `pnl_pct`.

### Badge rendering — RiskListRow and RightPanelHeader

5. `RiskListRow` must read `group.groupLevel` (not `group.worstLevel`) when determining:
   - The left-border colour (`borderColor = riskColor(group.groupLevel)`).
   - The badge text (`riskLabel(group.groupLevel)`).
   - The badge background and border colour (`riskBg(group.groupLevel)`, `riskColor(group.groupLevel)`).
   - The selection-highlight left-border colour when `isSelected` is true.
   - The `level` prop passed to `MiniProgressBar` (currently `group.worstLevel`, must become
     `group.groupLevel`).

6. `RiskListRow` must pass `group.groupPnlPct` (not `group.worstLegPnlPct`) as the
   `worstLegPnlPct` prop to `MiniProgressBar` for named multi-leg strategy groups. The existing
   `MiniProgressBar` component is not modified — only the value passed to it changes:
   - Bar length: `Math.min(Math.abs(group.groupPnlPct), 100)%` (same formula, different input).
   - Bar colour: green when `group.groupPnlPct >= 0` (group is net profitable); otherwise
     `riskColor(group.groupLevel)` (the new group-level risk colour, not the worst-leg colour).
   - Result for the Put Broken Wing example: `groupPnlPct` is positive (net profit), so the bar
     renders green regardless of the worst leg being −96%.
   - For ungrouped single positions, `group.groupPnlPct === pos.pnl_pct`, so behaviour is
     identical to current.

7. `RightPanelHeader` must read `group.groupLevel` (not `group.worstLevel`) when determining:
   - The badge text (`riskLabel(group.groupLevel)`).
   - The badge text colour (`riskColor(group.groupLevel)`).
   - The badge background (`riskBg(group.groupLevel)`).
   - The badge border colour.

8. No other visual element in `RiskListRow` or `RightPanelHeader` is changed. The combined P&L
   display, DTE, leg count, nearest expiry, IV Rank, and entry-date banner are unchanged.

### Per-leg cards — unchanged

9. `LegCard` must continue to read `pos.risk_level` (the per-leg backend value) for all
   per-card styling: top-border colour, card background, card border, risk-status text
   (OK / WATCH / HIGH in the card header), and the `level` prop passed to `MiniProgressBar`.
   `groupLevel` must not propagate to individual `LegCard` components.

10. The sort order of `LegCard` instances within `RightPanelDetail` (red first, yellow, green)
    continues to be derived from per-leg `risk_level`, not `groupLevel`.

### Narrative components — unchanged

11. `DefensiveNarrativeSingle`, `DefensiveNarrativeGroup`, `CloseInstructions`, and the
    `TradeNarrativeSection` accordion must not be modified in content, logic, or position.
    They already operate on combined P&L and per-leg data directly; they do not read
    `worstLevel` or `groupLevel` at all.

### Summary stat chips

12. The summary stat chips in the Risk Monitor header strip (lines 1118–1130 of `RiskMonitor.tsx`)
    currently count **per-leg** `risk_level` values across `data` (the raw `PositionRisk[]`
    array). This feature does not change those counts in v1. The chips continue to reflect
    per-leg counts. This is flagged as an open question (OQ-1) for the product owner to resolve:
    whether the chips should be recounted per-group using `groupLevel` is a separate, explicit
    decision that must not be made silently by the developer.

13. The header strip "HIGH RISK" indicator (line 1107, `{redCount > 0 && ...}`) reads `redCount`,
    which is derived from per-leg `risk_level`. This is likewise unchanged in v1, pending OQ-1
    resolution.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Net-Profitable Multi-Leg Group Shows WATCH, Not HIGH RISK, When a Leg Is Stressed

**As a** multi-leg strategy trader with an open Put Broken Wing Butterfly that is net profitable,
**I want** the group badge to show WATCH (not HIGH RISK) when one leg has individually decayed
**so that** I am not falsely alarmed about a strategy that is performing as designed.

**Acceptance Criteria:**
- [ ] AC1: Open the Risk Monitor with the Put Broken Wing Butterfly selected. The group badge in
  the left-panel list row reads "WATCH" (yellow) — not "HIGH RISK" (red) — despite one leg
  individually showing HIGH at the per-leg card level. This can be verified by confirming
  `combinedPnl >= 0` for the group and observing the left-panel badge colour is yellow, not red.
- [ ] AC2: The right-panel header badge for the same group also reads "WATCH" (yellow). The
  combined P&L displayed in the header (e.g. +$637) is green and unchanged.
- [ ] AC3: The per-leg `LegCard` for the stressed long-put wing still shows its own HIGH RISK
  status (red top-border, "HIGH" text in the card header). The per-card risk display is
  unchanged by this fix.
- [ ] AC4: The `DefensiveNarrativeGroup` below the leg cards continues to read "net profitable"
  and the green Strategy Context narrative box is displayed — unchanged from before the fix.
- [ ] AC5: A human tester can confirm all four of the above in under 5 minutes by opening the
  Risk Monitor, selecting the butterfly group, and reading the badges in the left panel, right
  panel header, individual leg cards, and narrative box.

---

### Story 2 — Net-Profitable Group With All Green Legs Shows OK

**As a** paper trader with a multi-leg credit spread where all legs are individually green (no
per-leg stop or DTE trigger has fired), **I want** the group badge to show OK (green)
**so that** the badge accurately reflects the healthy state of the strategy.

**Acceptance Criteria:**
- [ ] AC1: With a 2-leg Bull Put Spread where both legs are individually `risk_level === 'green'`
  and `combinedPnl >= 0`, the group badge in the left panel shows "OK" (green left border,
  green badge text).
- [ ] AC2: The right-panel header badge for the same group also shows "OK" (green).
- [ ] AC3: If the combined P&L subsequently moves negative (simulated by manually editing a
  position's current price in paper trade data or waiting for a market move) and a group red
  trigger fires (e.g. `groupPnlPct <= -50`), the badge escalates to RED on the next refresh
  without requiring a page reload. The 5-minute silent refresh cycle picks up the change.
- [ ] AC4: A group where `combinedPnl >= 0` and all legs are `risk_level === 'green'` never
  shows a WATCH or HIGH RISK group badge.

---

### Story 3 — Net-Losing Group Escalates to HIGH RISK on Genuine Group-Level Triggers

**As a** paper trader with a multi-leg strategy that has turned net losing and breached a group
stop threshold, **I want** the group badge to escalate to HIGH RISK **so that** I receive a
genuine alert when the combined position — not just an individual leg — is in distress.

**Acceptance Criteria:**
- [ ] AC1: A net-losing group where `groupPnlPct <= -50` (combined loss >= 50% of combined cost
  basis) displays a HIGH RISK (red) group badge in both the left-panel list row and the
  right-panel header.
- [ ] AC2: A net-losing group where `groupPnlPct <= -100` (combined loss equals or exceeds total
  premium at risk) displays a HIGH RISK (red) group badge.
- [ ] AC3: A net-losing group where the soonest-expiring leg has DTE <= 7 displays a HIGH RISK
  (red) group badge, even if `groupPnlPct` has not yet reached -50%.
- [ ] AC4: A net-losing group that does not meet any red trigger (e.g. `groupPnlPct = -20`,
  soonest DTE = 15) displays WATCH (yellow), not HIGH RISK (red) and not OK (green).
- [ ] AC5: For each scenario above (AC1–AC4), the per-leg `LegCard` risk colours are unchanged
  — each leg displays whatever `risk_level` the backend computed for it individually.

---

### Story 4 — Single / Ungrouped Positions Are Unchanged

**As a** paper trader with a single naked put or covered call (no strategy group), **I want**
the Risk Monitor badge for that position to continue using the per-leg `risk_level` from the
backend **so that** the existing per-leg stop-loss alerting is unaffected for ungrouped trades.

**Acceptance Criteria:**
- [ ] AC1: A single position with `risk_level === 'red'` (e.g. down more than 50% of cost) shows
  HIGH RISK (red) in the left-panel badge and right-panel header badge, identical to the
  behaviour before this fix.
- [ ] AC2: A single position with `risk_level === 'yellow'` shows WATCH (yellow). A single
  position with `risk_level === 'green'` shows OK (green). Neither is affected by the new
  `groupLevel` derivation logic.
- [ ] AC3: After this change ships, a tester with only ungrouped positions open in paper trading
  sees no visual difference in any Risk Monitor badge compared to the prior version.

---

### Story 5 — Per-Leg Card Colours and Signals Are Unchanged for All Group Types

**As a** paper trader, **I want** each individual `LegCard` within a group to continue showing
its own independent risk colour and status text **so that** I can still identify which specific
leg is under stress even when the group badge has been capped to WATCH.

**Acceptance Criteria:**
- [ ] AC1: In a net-profitable butterfly where `groupLevel = 'yellow'`, the individual leg card
  for the stressed long-put wing still has a red top-border and the "HIGH" status text. The card
  colour has not been changed to yellow to match the group badge.
- [ ] AC2: In the same group, the profitable short-put legs have green top-borders. Each card
  independently reflects its own `pos.risk_level`.
- [ ] AC3: The `MiniProgressBar` inside each `LegCard` is driven by `pos.pnl_pct` and
  `pos.risk_level` — the per-leg values — not by `groupLevel` or `groupPnlPct`.
- [ ] AC4: The sort order of legs within the right panel (highest per-leg risk first) is
  unchanged. The stressed leg appears at the top of the grid regardless of `groupLevel`.

---

### Story 6 — Narrative Components Are Unchanged

**As a** paper trader reading the defensive narrative for a strategy group, **I want** the
narrative text and colour to remain exactly as before **so that** the advice I receive is not
accidentally altered by a badge-logic change.

**Acceptance Criteria:**
- [ ] AC1: For the net-profitable butterfly, `DefensiveNarrativeGroup` renders the green
  "Strategy Context" box with the same text as before this fix. No word, colour, or layout
  change is visible in the narrative.
- [ ] AC2: For a net-losing credit spread, `DefensiveNarrativeGroup` renders the red
  "Financial Reality — Strategy" box with the same text as before. The group badge changing
  to reflect `groupLevel` does not alter the narrative box colour (the narrative reads
  `combinedPnl` directly, independent of `groupLevel`).
- [ ] AC3: `TradeNarrativeSection` (Trade Narrative accordion) is collapsed by default,
  expands on click, and collapses on a second click — unchanged.
- [ ] AC4: `DefensiveNarrativeSingle` and `CloseInstructions` for ungrouped single positions
  are word-for-word unchanged in content and display logic.

---

### Story 7 — Left-Panel Progress Bar Reflects Group Net P&L, Not Worst Leg

**As a** multi-leg strategy trader scanning the left-panel list, **I want** the progress bar
beneath each named strategy group to reflect the group's combined P&L percentage, not the
worst individual leg's P&L percentage, **so that** the bar colour and length are consistent
with the group badge above it and do not misrepresent a profitable spread as amber or red.

**Acceptance Criteria:**
- [ ] AC1: For the Put Broken Wing Butterfly group with combined P&L = +$637 and a worst leg at
  −96% of its own cost, the left-panel `MiniProgressBar` renders **green** (not amber/yellow),
  with a bar length proportional to the group's combined P&L percentage
  (`|combinedPnl / combinedCostBasis * 100|`, capped at 100%). A human tester can verify this
  by opening the Risk Monitor and observing the bar colour under the butterfly list row.
- [ ] AC2: For a net-profitable group where `groupPnlPct = +12%`, the bar is green and
  approximately 12% wide. The exact pixel width need not be verified; the colour must be green
  and the bar must be clearly shorter than for a group at `groupPnlPct = +80%`.
- [ ] AC3: For a net-losing group that has triggered `groupLevel = 'red'` (e.g. `groupPnlPct =
  −55%`), the bar renders in red (`C.red`) and approximately 55% wide.
- [ ] AC4: For a net-losing group at `groupLevel = 'yellow'` (e.g. `groupPnlPct = −25%`), the
  bar renders in yellow (`C.yellow`) and approximately 25% wide.
- [ ] AC5: For a single / ungrouped position, the bar behaviour is visually identical to the
  current behaviour. No regression is observable by a tester who has only ungrouped positions.
- [ ] AC6: The `MiniProgressBar` component itself is not modified. Only the props passed to it
  from `RiskListRow` change (`worstLegPnlPct` receives `group.groupPnlPct`, and `level`
  receives `group.groupLevel`).

---

## 5. Out of Scope

- Any change to `_assess_risk` in `backend/routes/positions.py`. Per-leg `risk_level` is
  computed on the backend exactly as before; this feature does not touch backend logic.
- Any change to the `PositionRisk` TypeScript interface or `getPositionsRisk()` API call.
- Any change to `LegCard` risk colouring, `LegCard` sort order, or `MiniProgressBar` inside
  leg cards.
- Any change to `DefensiveNarrativeSingle`, `DefensiveNarrativeGroup`, `CloseInstructions`,
  or `TradeNarrativeSection`.
- The `ActionPlanBox` component and its children.
- Any change to `RightPanelHeader` elements other than the risk badge (combined P&L display,
  DTE, leg count, nearest expiry, IV Rank, entry-date banner are all unchanged).
- Any change to `RiskListRow` elements other than the badge and its left-border colour (combined
  P&L, nearest DTE, `MiniProgressBar` on list rows are all unchanged).
- Changing the summary stat chips (High Risk count, Watch count, Green count) to group-based
  counts. This is an open question (OQ-1) that requires an explicit product decision before
  implementation; a developer must not make this change silently under the scope of this spec.
- Changing the header-strip "HIGH RISK" indicator to reflect group-level counts (same boundary
  as the chips, pending OQ-1).
- Adding any new UI component (filter, sort toggle, search, pin).
- The AI Risk Overview section.
- The `buildGroups` sort logic (newest-entered-first, risk tiebreak) is unchanged.
- The `groupByEntryDate` / `DateRail` layout is unchanged.
- The mobile accordion expand/collapse behaviour is unchanged.
- The `worstLevel` field on `StrategyGroup` is retained; only `groupLevel` is newly added.
- Deletion of `worstLevel` or any downstream component that might depend on it.
- Changes to Orders, Positions, PnL Chart, Strategy Scanner, Options Chain, or Admin Panel.
- Any subscription tier gate change.
- Modifications to the `MiniProgressBar` component itself. The component is reused without
  change; only the props supplied to it by `RiskListRow` are updated (see FR-6 and Story 7).

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| Single-leg position (`_ungrouped_` key) | `groupLevel` equals the position's own `risk_level`. Badge behaviour identical to current. No regression. |
| Multi-leg group where combined cost basis is zero (all legs at zero average cost) | `groupPnlPct` cannot be computed. `groupPnlPct` defaults to `0`. Net P&L rule applies: if `combinedPnl >= 0`, apply profitable-group rule; if `combinedPnl < 0`, fall back to `groupLevel = 'yellow'` (cannot determine percentage stop breach without basis). Architect to confirm defensive default in design doc. |
| Group with `combinedPnl` exactly equal to zero | Treated as net profitable (`combinedPnl >= 0`). If any leg is stressed, `groupLevel = 'yellow'`; if all legs green, `groupLevel = 'green'`. |
| Net-losing group with DTE = 7 on soonest leg | DTE <= 7 red trigger fires. `groupLevel = 'red'`. |
| Net-losing group with DTE = 8 on soonest leg, `groupPnlPct = -30` | No red trigger fires. `groupLevel = 'yellow'`. |
| All legs of a multi-leg group are `risk_level === 'green'` but `combinedPnl < 0` | Net-losing group rules apply (combined P&L is the primary gate, not per-leg colour). `groupLevel` is at least `'yellow'`; escalates to `'red'` if a group red trigger fires. |
| Group where soonest DTE is 0 and group is net losing | DTE <= 7 trigger fires. `groupLevel = 'red'`. Backend per-leg signal for 0-DTE will separately mark that leg red; the group badge alignment with the per-leg card is coincidental but consistent. |
| Group where soonest DTE is 0 but group is net profitable | DTE trigger does not apply to the net-profitable path (rule 3a). `groupLevel` is `'green'` or `'yellow'` depending on per-leg colours. Architect may want to flag this edge case in design doc as a potential future enhancement. |
| Market data unavailable (yfinance fallback or synthetic) | `pos.pnl` values on the `PositionRisk` objects may be approximated. `groupLevel` computation uses whatever P&L values the API returns. No special handling needed; the computation is algebraically correct regardless of data source. |
| Silent 5-minute refresh | `buildGroups` is called with fresh `data` on every refresh (`groups = buildGroups(data)` at line 1000). `groupLevel` recomputes automatically. No additional refresh mechanism needed. |
| User has no positions | The Risk Monitor shows the "No open positions" empty state. `buildGroups([])` returns `[]`. No badge rendered. No regression. |
| Two groups have the same entry date but different `groupLevel` values | Tiebreak sort in `buildGroups` currently uses `worstLevel` rank. The architect must decide whether the tiebreak should be updated to use `groupLevel` rank instead and document the decision. See OQ-2. |
| `strategy_key` is non-null but the group has only one leg (e.g. a single-legged named strategy) | Treat as multi-leg group (rule 3 applies) because `strategy_key` is the discriminator. The result is mathematically equivalent to the ungrouped path (one leg's `risk_level` informs all conditions). No special case needed; the logic is consistent. |

---

## 7. External Dependencies

| Service | Usage in This Feature | Quota / Risk |
|---------|----------------------|--------------|
| Supabase | Not affected. No new query, no schema change. | None. |
| yfinance | Not affected. `getPositionsRisk()` is unchanged. `pos.pnl` values are whatever the existing backend computes. | None. |
| Claude API | Not affected. `aiRiskSummary` is unchanged. | None. |
| Reddit PRAW | Not used by Risk Monitor. Not affected. | None. |

This feature has zero external dependency risk. All data required by `groupLevel` computation
(`pos.pnl`, `pos.risk_level`, `pos.avg_cost`, `pos.quantity`, `pos.dte`, `pos.strategy_key`) is
already present on `PositionRisk` and returned by the existing `GET /api/positions/risk` endpoint.

---

## 8. Subscription Tier Impact

No tier gate is changed. The Risk Monitor is gated on the `risk_monitor` entitlement. The
corrected group badge logic applies equally to all tiers that have Risk Monitor access.

| Tier | Behaviour |
|------|-----------|
| free | Risk Monitor not accessible (existing gate unchanged). |
| starter | Risk Monitor accessible. Group badge uses `groupLevel` for named multi-leg groups. Per-leg card colours unchanged. |
| pro | Risk Monitor accessible. Same group badge logic. |
| enterprise | Risk Monitor accessible. Same group badge logic. |

---

## 9. Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| OQ-1 | The summary stat chips (High Risk: N, Watch: N, Green: N) and the header-strip "HIGH RISK" indicator currently count per-leg `risk_level` values from the raw `data` array (lines 995–997 and 1107 of `RiskMonitor.tsx`). This means a 4-leg Iron Condor with one red leg contributes 1 to the High Risk count even if the group badge is WATCH because the group is net profitable. Should these chips be recounted per-group using `groupLevel`? Changing this would mean the chip counts reflect groups (the user-visible unit) rather than legs (an internal unit the user does not directly trade). The user complaint was specifically about the group badge; the chips were not reported as incorrect. Recommend addressing chips in a separate, explicit decision to avoid silent scope creep. | Product Owner | If unresolved: developer must leave chip counts unchanged (per-leg). The gap between a WATCH group badge and a High Risk chip count remains but is not the reported problem. If the PO decides chips should be group-based, that decision requires explicit sign-off and the developer must recount from `groups` not `data`. |
| OQ-2 | The tiebreak sort in `buildGroups` (lines 623–628) uses per-leg `worstLevel` rank when two groups share the same `enteredAt` date. After this change, should the tiebreak use `groupLevel` rank instead (so the genuinely riskier group, by group assessment, sorts first)? Using `groupLevel` is more semantically consistent with the corrected badge; using `worstLevel` preserves current sort behaviour exactly. | Architect | If unresolved: developer defaults to leaving the tiebreak on `worstLevel` (zero behaviour change). The tiebreak only affects display order within a single entry date and has no functional risk impact. |
| OQ-3 | The combined cost basis formula in FR-3b sums `Math.abs(pos.avg_cost * pos.quantity * 100)` across all legs. For credit legs (`entry_action === 'sell'`), `avg_cost` is premium collected; for debit legs it is premium paid. Summing absolute values gives a "total premium at risk" figure, which is the correct denominator for a strategy-level stop percentage. However, for some complex structures (e.g. ratio spreads where one side has many more contracts), this denominator may differ from what the user thinks of as "amount at risk." The architect should confirm this formula is the right group-level cost basis or propose an alternative. | Architect | If unresolved: developer uses the `Math.abs` sum formula. The -50% and -100% red trigger levels are reasonable bounds regardless of denominator edge cases, and the result is always conservative (may under-estimate the percentage loss on some structures, which means the red trigger fires later — an acceptable failure mode that does not produce false alarms). |
| OQ-4 | For a net-profitable group where the soonest-expiring leg has DTE <= 7, no red trigger fires under the current spec (the DTE trigger is inside the net-losing branch). Should a profitable group approaching expiry with a short-DTE leg get a WATCH escalation specifically for DTE? The current spec produces at most WATCH for profitable groups regardless of DTE, which may be sufficient given the per-leg card will already show a yellow or red DTE signal on the affected leg. Recommend no change in v1 unless the PO disagrees. | Product Owner | If unresolved: no DTE-based escalation within the profitable-group path. Acceptable for v1. |
| OQ-5 | The left-panel `MiniProgressBar` bar length is currently `Math.min(abs(pnl_pct), 100)%` — it shows loss magnitude for losing positions and profit magnitude for profitable positions. For a net-profitable group at +$637 over a $1,200 cost basis (`groupPnlPct ≈ +53%`), the bar would render green and approximately 53% wide. An alternative would be to fill toward a profit target (e.g. fill 100% when `groupPnlPct >= profit_target_pct`, which is typically 50%). Recommend net P&L magnitude for consistency with current per-leg bar behaviour, but the architect should confirm whether the profit-target fill variant is preferable. The `MiniProgressBar` component currently has no profit-target concept, so the target-fill variant would require either passing an extra prop or computing the fill pct before calling the component. | Architect | If unresolved: developer uses `group.groupPnlPct` as the `worstLegPnlPct` prop (net P&L magnitude fill). This matches the intent of the existing component and requires no component modification. |

---

## 10. Product Owner Annotations

_Filled in by the product-owner agent — 27Jun2026._

---

### Open Question Decisions (binding)

**OQ-1 — Summary stat chips (High Risk: N, Watch: N, Green: N)**

Decision: KEEP CHIPS PER-LEG in v1. The chips continue to count per-leg `risk_level` values from the raw `data` array. The residual inconsistency is accepted: a profitable butterfly with one red leg will still increment the High Risk chip count by 1 even though the group badge now correctly shows WATCH. This is a known, accepted gap. The rationale is (a) the user complaint was specifically about the group badge, not the chips; (b) making the chips group-based in the same change silently expands scope and changes a second observable metric the user may be watching; (c) the chips counting legs gives a more conservative signal — if anything, over-counting High Risk is a safer failure mode than under-counting. The developer must not touch chip count logic under this spec. A follow-on story should explicitly decide whether chips should count groups; that decision deserves its own spec entry and user confirmation.

**OQ-2 — Same-date sort tiebreak**

Decision: SWITCH TIEBREAK TO groupLevel. When two groups share the same `enteredAt` date, the sort tiebreak must use `groupLevel` rank (red > yellow > green) rather than `worstLevel` rank. The displayed badge is now `groupLevel`; the sort order must match what the user sees. Sorting by a field the user cannot see (`worstLevel`) when the badge shows `groupLevel` creates a confusing inconsistency where a lower-badged group can appear above a higher-badged group in the same date rail. The behaviour change is contained to the within-date tiebreak only and has no functional risk impact. Architect must implement this in `buildGroups` sort comparator.

**OQ-3 — Combined cost basis formula**

Decision: ACCEPT BA FORMULA FOR v1. Sum of `Math.abs(pos.avg_cost * pos.quantity * 100)` across all legs is confirmed as the v1 denominator. This is a "total premium committed" figure — it is correct for vanilla debit and credit spreads and produces a conservative (fires-later) result for ratio spreads, which is an acceptable failure mode. The -50% and -100% threshold levels are calibrated against this denominator and remain appropriate. The architect must document the ratio-spread caveat in `02-design.md` as a known limitation and flag it as a candidate for refinement in a future iteration if user feedback surfaces distorted readings on ratio structures. No formula change is needed for v1.

**OQ-4 — DTE escalation inside the profitable-group path**

Decision: NO GROUP-LEVEL DTE ESCALATION when the group is net profitable. A net-profitable group approaching expiry stays at OK or WATCH — it does not escalate to HIGH RISK on DTE alone. The per-leg `LegCard` for the soon-to-expire leg will already display its own DTE-triggered yellow or red signal; the user has that information at the leg level. Escalating the group badge to red for a profitable group approaching expiry would contradict the core fix we are shipping: the fix is that a profitable group should not show HIGH RISK. A profitable group at DTE 3 is, if anything, closer to full profit realisation. The defensive narrative already handles this case. Confirmed: no DTE escalation in the profitable-group path.

**OQ-5 — Bar fill direction for profitable groups**

Decision: NET P&L MAGNITUDE fill, consistent with current per-leg bar behaviour. The `MiniProgressBar` receives `group.groupPnlPct` as-is; bar length is `Math.min(Math.abs(group.groupPnlPct), 100)%`. No profit-target concept is introduced. The profit-target fill variant would require either a new prop on `MiniProgressBar` or pre-computation of a normalised fill percentage before calling the component; both options expand scope and require a product decision on what the target percentage should be (50% is conventional but not universal). That is a separate feature. The architect must not modify `MiniProgressBar` under this spec.

---

### Priority Scores

| Story | Priority (1=must/2=should/3=nice) | Rationale |
|-------|-----------------------------------|-----------|
| Story 1 — Net-profitable group shows WATCH not HIGH RISK | 1 — Must Have | This is the reported user problem. A profitable strategy showing HIGH RISK is a trust-destroying contradiction. The core narrative already says "net profitable — evaluate by net P&L"; the badge must agree. Cannot ship without this. |
| Story 2 — Net-profitable all-green group shows OK | 1 — Must Have | Logically inseparable from Story 1. If a profitable group with stressed legs is WATCH, a profitable group with all-green legs must be OK. Shipping Story 1 without Story 2 would leave a visible gap in the group-level logic. |
| Story 3 — Net-losing group escalates on genuine triggers | 1 — Must Have | The fix must not remove alerting — it must only make it accurate. Without Story 3, a genuinely distressed multi-leg position could show WATCH indefinitely. The -50% group stop and DTE <= 7 triggers are the replacement escalation mechanism. Required for correctness and user safety. |
| Story 4 — Single / ungrouped positions unchanged | 1 — Must Have | Non-regression is a must-have by definition. Any single-position user must see zero change. This is a guard story that the developer must verify explicitly. |
| Story 5 — Per-leg card colours unchanged | 1 — Must Have | The per-leg card is where the user sees which specific leg is stressed. If `groupLevel` were to leak into `LegCard`, the user would lose the leg-level signal that explains the WATCH badge. Non-negotiable. |
| Story 6 — Narrative components unchanged | 1 — Must Have | The defensive narrative is the core differentiator of OptionsDesk. Any accidental modification to `DefensiveNarrativeGroup`, `DefensiveNarrativeSingle`, or `CloseInstructions` is unacceptable. Guard story; developer must confirm in code review. |
| Story 7 — Left-panel progress bar reflects group net P&L | 1 — Must Have | The bar was explicitly called out as part of the approved fix scope ("approve fixing the left-panel progress bar in the same change"). An amber bar under a profitable group is the same contradiction as the badge. Shipping Stories 1–6 without Story 7 would leave a visible half-fix in the left panel. |

---

### MVP Boundary

**All 7 stories ship in v1.** No story is deferred.

This is a tightly scoped, frontend-only change to `buildGroups` and two call sites (`RiskListRow`, `RightPanelHeader`). All 7 stories are mechanically coupled to the same `groupLevel` / `groupPnlPct` computation: adding those two fields to `StrategyGroup` and propagating them correctly automatically satisfies Stories 1–5 and 7. Story 6 is satisfied by not touching the narrative components. There is no story here that requires a separate implementation decision or disproportionate effort — deferring any of them would leave a visible inconsistency and defeat the purpose of the fix.

**Deferred to backlog (not in scope for this feature):**
- Chip counts switching to group-based (OQ-1 residual — needs its own spec and user confirmation).
- DTE escalation for profitable groups near expiry (OQ-4 future enhancement — needs evidence of user need first).
- Profit-target bar fill variant (OQ-5 — needs a product decision on target percentage and a `MiniProgressBar` component change).

---

**PO gate decision:** Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 27Jun2026

# Release Note — v1.11.0 — Risk Monitor Group-Based Risk Badge

**Date:** 27Jun2026
**Version:** v1.11.0
**Tier availability:** Starter+
**Deployment:** Frontend-only redeploy on Railway. No backend. No migration. No env var.

---

## What's Fixed

The Risk Monitor's group risk badge (left-panel row and right-panel header) and the left-panel progress bar are now **group-based, not worst-leg-based**. This corrects a contradiction where a net-profitable multi-leg strategy would show **HIGH RISK** simply because one leg was individually underwater.

### The Problem (Resolved)

A Put Broken Wing Butterfly that is **net profitable at +$637** displayed a **HIGH RISK badge** because one long-put wing had decayed −96% of its own cost basis. In a debit butterfly, the long wing is designed to decay while the short body carries the profit. The defensive narrative already read "net profitable — evaluate by net P&L, not individual legs," yet the badge directly above it said HIGH RISK. The badge contradicted the narrative it was supposed to reinforce.

### What Changed

**Group risk badge logic (both left panel and right panel header):**

- **Net-profitable multi-leg group:** The badge shows OK (green) only if all legs are individually green. If any leg is stressed but the group is net profitable, the badge shows WATCH (yellow) — a "look closer" signal, not a false alarm. The group badge is **never red** when the combined P&L is non-negative.

- **Net-losing multi-leg group:** The badge shows HIGH RISK (red) only on a genuine group-level trigger:
  - Combined loss ≥ 50% of combined cost basis (group-level stop-loss threshold), OR
  - Combined loss ≥ 100% of combined cost basis, OR
  - Soonest-expiring leg has ≤ 7 days to expiration AND the group is net losing.
  
  Otherwise, the badge shows WATCH (yellow) for any net loss not yet at a trigger threshold.

- **Single/ungrouped positions:** Unchanged — the badge continues to reflect the position's own per-leg risk status.

### Worked Example — Put Broken Wing Butterfly

- **Position:** 3-leg Put Broken Wing Butterfly, net +$637
- **Leg breakdown:** Long put +$1,702 (green), short put body −$524 (yellow), short put wing −$541 (red, decayed −96%)
- **Before fix:** Badge showed HIGH RISK (worst-leg rule). Bar was partial amber (worst-leg P&L).
- **After fix:** Badge shows WATCH (group is profitable but a leg is stressed). Bar is **green** (group P&L is positive).
- **Per-leg cards:** The red wing still displays its own HIGH RISK status and red top-border — unchanged.

### Left-Panel Progress Bar

The progress bar under each strategy group now reflects the **whole strategy's net P&L**, not the worst individual leg:

- **Profitable groups** (combined P&L ≥ 0): Bar is green, length proportional to the group's combined P&L percentage.
- **Losing groups** (combined P&L < 0): Bar is red or yellow (matching the group's risk level), length proportional to the group's combined loss percentage.

For the Put Broken Wing example above, the bar now renders **green at ~104% width** (the group's combined profit) instead of partial amber (the worst leg's decay).

---

## Intentional Behaviours (Not Bugs)

**WATCH badge above a GREEN bar is expected.** The badge says "a leg is stressed — be aware." The bar says "the group is net profitable — it is above water." For a net-profitable butterfly with one red leg, this pairing is informative: glancing at the left panel, you see a yellow badge (something to check) and green underneath (the group is not in financial distress). You click in to see which leg is stressed; the per-leg card shows it immediately.

**All-green-legged group that is net-losing shows WATCH.** Per the new rules, any net loss is at minimum a WATCH situation. All legs can be green (no individual trigger has fired) yet the group's combined P&L can still go negative if the legs' losses sum up. This is intentional and conservative.

**Summary stat chips and header "HIGH RISK" indicator still count per-leg.** The chips (`High Risk: N`, `Watch: N`, `Green: N`) and the header-strip "HIGH RISK" indicator continue to count individual leg risk levels, not group levels. This means a profitable butterfly with one red leg still contributes 1 to the High Risk chip count even though its group badge is WATCH. This per-leg vs per-group split is intentional for v1.11.0 to avoid silent scope creep; a future cleanup may align the chips. See the Known Limitation section below.

---

## Known Limitation

**Ratio spreads (e.g. 1×2) use an absolute combined-cost-basis denominator.** The group percentage loss is computed as: combined loss / (sum of absolute value per-leg cost basis). For structures where one side has many more contracts (ratio spreads, front-ratio spreads), this denominator inflates proportionally. The practical consequence is that the group's combined-loss percentage fires more conservatively — the badge stays WATCH longer before hitting the −50% group red trigger. This is acceptable because it avoids false alarms. The per-leg card signals show individual stress immediately regardless of this formula. If user feedback surfaces distorted readings on ratio structures, a future enhancement can refine the cost-basis calculation for capped structures.

---

## What Does NOT Change

- **Per-leg card colours and status:** Each `LegCard` continues to display its own risk level (red/yellow/green top border, HIGH/WATCH/OK status text) exactly as before. `groupLevel` does not leak into the per-leg cards.
- **Narrative and action-plan content:** `DefensiveNarrativeGroup`, `DefensiveNarrativeSingle`, `CloseInstructions`, and `TradeNarrativeSection` are unchanged word-for-word.
- **Backend routes and data:** The `/api/positions/risk` endpoint is unchanged. Per-leg `risk_level` computation in `_assess_risk` is unchanged.
- **All other tabs:** Orders, Positions, P&L Chart, Strategy Scanner, Options Chain, Admin Panel remain unchanged.
- **Subscription tier gating:** The Risk Monitor remains gated on the `risk_monitor` entitlement (Starter+ tier).

---

## Deployment

**Environment:** Frontend only.

**Changes:** Single file modified: `frontend/src/components/RiskMonitor.tsx`. Two new fields added to the `StrategyGroup` TypeScript interface: `groupLevel: 'green' | 'yellow' | 'red'` and `groupPnlPct: number`. `buildGroups` function computes both. All badge and progress-bar read-sites in `RiskListRow` and `RightPanelHeader` switch from `worstLevel` / `worstLegPnlPct` to `groupLevel` / `groupPnlPct`. Same-date sort tiebreak switched to `groupLevel` rank.

**Backward compatibility:** No API change, no database schema change, no new environment variables. The `worstLevel` and `worstLegPnlPct` fields are retained on `StrategyGroup` for any future component use.

**Deploy steps:**
1. Merge feature branch to `main`.
2. Run `npm run build` on Railway frontend service.
3. Verify Risk Monitor loads without JS errors (open DevTools console).
4. Test with a paper-traded Put Broken Wing Butterfly or Iron Condor to confirm group badges reflect combined P&L.

---

## Rollback

Code revert only. No data migration needed. If the deployment surfaces unexpected behaviour, revert the commit and redeploy the prior version of `RiskMonitor.tsx`.

---

## Testing Summary

- **Automated:** 81 E2E tests passed (Chromium Playwright suite). 17 new tests covering net-profitable WATCH, all-green OK, net-losing red/yellow, single ungrouped, and bar colour scenarios. 64 pre-existing tests passed without modification.
- **Manual:** 42-case exploratory plan covering badge consistency, bar rendering, narrative preservation, summary-chip residual gap, sort tiebreak, mobile accordion, edge cases, and 5-minute silent refresh.

---

## User-Facing Documentation

The **User Guide** has been updated in the Risk Monitor section to explain that the **group risk badge and left-panel progress bar now reflect the whole strategy's net P&L**, not the worst single leg. The description clarifies that a profitable multi-leg strategy will not show HIGH RISK just because one leg is down; it shows WATCH so you look closer, while per-leg cards continue to flag individual stressed legs.

---

_Release prepared by:_ technical-writer &nbsp;&nbsp; _Date:_ 27Jun2026 &nbsp;&nbsp; _Approved for deployment:_ pending user approval

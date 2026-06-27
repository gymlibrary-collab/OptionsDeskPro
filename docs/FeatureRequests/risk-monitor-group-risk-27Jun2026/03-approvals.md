# Gate Approvals — Risk Monitor Group Risk Badge (Group-Based, Not Worst-Leg-Based)

**Feature folder:** `docs/FeatureRequests/risk-monitor-group-risk-27Jun2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | business-analyst |
| **Date** | 27Jun2026 |
| **Notes** | Spec covers 7 user stories, functional requirements for group-level risk derivation, badge rendering changes to `RiskListRow` and `RightPanelHeader`, left-panel `MiniProgressBar` fix, unchanged-elements list, edge case table, tier impact table, and 5 open questions. User-reported contradiction (profitable butterfly showing HIGH RISK) is precisely documented with the specific group and P&L figures. Frontend-only scope confirmed: no backend, no schema, no API change. Accepted as written. |

Approved

---

## Gate 2 — Product Owner Review

| | |
|---|---|
| **Document** | `01-spec.md` (PO annotations in Section 10) |
| **Approved by** | product-owner |
| **Date** | 27Jun2026 |
| **Notes** | See full rationale in Section 10 of the spec. All five open questions resolved with binding decisions. MVP boundary confirmed: all 7 stories ship in v1. No tier gate changes required. No cannibalisation of the core narrative value — the narrative components are explicitly preserved unchanged; the badge fix makes the narrative and the badge consistent with each other, strengthening trust. |

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Summary stat chips | KEEP PER-LEG in v1. Chips continue counting per-leg `risk_level` from the raw `data` array. Residual inconsistency accepted. Developer must not alter chip logic under this spec. Follow-on story required for any chip-to-group migration, with explicit user confirmation. |
| OQ-2 — Same-date sort tiebreak | SWITCH TO groupLevel rank. The sort tiebreak within a single entry-date rail must use `groupLevel` rank (red > yellow > green), not `worstLevel`. The displayed badge is `groupLevel`; the sort order must match. Architect implements in `buildGroups` sort comparator. |
| OQ-3 — Combined cost basis formula | ACCEPT BA FORMULA for v1. Sum of `Math.abs(pos.avg_cost * pos.quantity * 100)` confirmed as the denominator. Ratio-spread caveat must be documented in `02-design.md` as a known limitation flagged for future refinement. No formula change needed for v1. |
| OQ-4 — DTE escalation in the profitable-group path | NO DTE ESCALATION when net profitable. A profitable group near expiry stays at OK or WATCH. Per-leg `LegCard` already surfaces the DTE signal. Confirmed: profitable-group path has no DTE red trigger. |
| OQ-5 — Bar fill direction for profitable groups | NET P&L MAGNITUDE fill. `MiniProgressBar` receives `group.groupPnlPct` directly. No profit-target concept. `MiniProgressBar` component is not modified. |

### Priority Scores

| Story | Priority |
|-------|----------|
| Story 1 — Net-profitable group shows WATCH not HIGH RISK | 1 — Must Have |
| Story 2 — Net-profitable all-green group shows OK | 1 — Must Have |
| Story 3 — Net-losing group escalates on genuine triggers | 1 — Must Have |
| Story 4 — Single / ungrouped positions unchanged | 1 — Must Have |
| Story 5 — Per-leg card colours unchanged | 1 — Must Have |
| Story 6 — Narrative components unchanged | 1 — Must Have |
| Story 7 — Left-panel progress bar reflects group net P&L | 1 — Must Have |

**GO — proceed to Gate 3 (Architecture Design).**

The solution architect may begin. The design doc must address:

1. The `StrategyGroup` TypeScript interface extension: add `groupLevel: 'green' | 'yellow' | 'red'` and `groupPnlPct: number`, retaining `worstLevel` and `worstLegPnlPct` untouched.
2. The `buildGroups` function: where `groupLevel` and `groupPnlPct` are computed, the ordered rule chain (profitable path first, then losing path with -100%, -50%, DTE triggers), and the updated sort comparator using `groupLevel` rank for same-date tiebreaks (OQ-2 binding decision).
3. The `RiskListRow` changes: all six reads of `group.worstLevel` and `group.worstLegPnlPct` that must switch to `group.groupLevel` and `group.groupPnlPct`, including the `level` and `worstLegPnlPct` props passed to `MiniProgressBar`.
4. The `RightPanelHeader` changes: the three reads of `group.worstLevel` for badge text, colour, and background.
5. Confirmation that `MiniProgressBar` is not modified — only the props supplied to it change.
6. Documentation of the zero-cost-basis edge case defensive default (`groupPnlPct = 0`, fall to yellow for net-losing).
7. The ratio-spread cost basis caveat (OQ-3) documented as a known limitation.
8. Confirmation that `LegCard`, `DefensiveNarrativeSingle`, `DefensiveNarrativeGroup`, `CloseInstructions`, `TradeNarrativeSection`, and `ActionPlanBox` are not modified.
9. Confirmation that `worstLevel` is retained on `StrategyGroup` and that the per-leg sort order in `RightPanelDetail` continues to read per-leg `risk_level`, not `groupLevel`.

Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 27Jun2026

---

## Gate 3 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | solution-architect |
| **Date** | 27Jun2026 |
| **Notes** | Frontend-only. Single file changed: `RiskMonitor.tsx`. `StrategyGroup` interface extended with `groupLevel` and `groupPnlPct`; both `worstLevel` and `worstLegPnlPct` retained. `buildGroups` computes both new fields using the ordered profitable/losing rule chain with -100/-50/-25% bands and DTE <= 7 trigger. Sort tiebreak switched to `groupLevel` rank per OQ-2. Five read-sites in `RiskListRow` and four in `RightPanelHeader` switched to `groupLevel`/`groupPnlPct`. `MiniProgressBar` component signature unchanged — only props supplied to it change. Zero-cost-basis defensive default documented. Ratio-spread caveat documented as known limitation. Worked example (Put Broken Wing Butterfly) verified: groupLevel='yellow', bar green. Badge/bar intentional tension documented explicitly. No ADR required. |

Approved

_Approved by:_ solution-architect &nbsp;&nbsp; _Date:_ 27Jun2026

---

## Gate 4 — Test Report

| | |
|---|---|
| **Document** | `04-test-report.md` |
| **Approved by** | |
| **Date** | |
| **Notes** | |

Pending

---

## Gate 5 — Security Review

| | |
|---|---|
| **Document** | `05-security-review.md` |
| **Approved by** | |
| **Date** | |
| **Notes** | |

Pending

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

Gates complete: 3 of 6.

- Gate 1 (BA Spec) — approved
- Gate 2 (Product Owner) — approved with binding OQ decisions
- Gate 3 (Architecture) — approved
- Gate 4 (Test) — pending
- Gate 5 (Security) — pending
- Gate 6 (Release & Documentation) — pending

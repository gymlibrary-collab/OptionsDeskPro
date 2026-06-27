# Test Report — Risk Monitor Group-Based Risk Badge

**Feature:** Risk Monitor Group Risk Badge (Group-Based, Not Worst-Leg-Based)
**Date:** 27Jun2026
**QA Engineer:** qa-engineer
**Status:** PASS

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total tests run | 81 |
| Passed | 81 |
| Failed | 0 |
| Skipped | 0 |
| New tests added | 17 |
| Pre-existing tests (regression) | 64 |
| Test files touched | 3 |

All 81 tests passed on `npx playwright test` (Chromium project).

---

## 2. Files Changed

| File | Change |
|------|--------|
| `frontend/e2e/pages/risk-monitor-group-risk.spec.ts` | **Created** — 17 new tests in 5 suites |
| `frontend/e2e/pages/risk-monitor-layout.spec.ts` | **No changes** — all 34 pre-existing tests passed without modification |
| `frontend/e2e/pages/risk-monitor-leg-cards.spec.ts` | **No changes** — all 30 pre-existing tests passed without modification |
| `frontend/e2e/mock-data.ts` | **No changes** — new mock data was defined inline in the new spec |

---

## 3. Pre-Existing Test Audit

Both pre-existing suites were run before any changes were made to confirm the baseline and identify any tests that might have been asserting the old worst-leg group badge behaviour.

**Finding:** No pre-existing test required updating. The Iron Condor mock in both `risk-monitor-layout.spec.ts` and `risk-monitor-leg-cards.spec.ts` has `combinedPnl = -360` and `groupPnlPct = -53.7%` (≤ -50%), which puts it in the red HIGH RISK band under the new group-level logic — the same outcome as the old worst-leg logic for this specific mock. All assertions about that group's badge being HIGH RISK remained correct under the new rule. Per-leg card assertions (HIGH / WATCH / OK in LegCard) were unchanged throughout because `groupLevel` does not propagate to `LegCard`.

---

## 4. New Test Coverage

### Suite 1 — Net-profitable multi-leg group: WATCH not HIGH RISK (5 tests)

Mock: Put Broken Wing Butterfly — 3 legs, `combinedPnl = +$637` (net profitable), Leg C has `risk_level = 'red'`.
Expected `groupLevel`: `'yellow'` (WATCH) — profitable path, not all legs green.

| Test | AC Covered | Result |
|------|-----------|--------|
| S1-AC1 — left-panel badge shows WATCH, not HIGH RISK | Story 1 AC1 | PASS |
| S1-AC2 — right-panel header badge shows WATCH; P&L shows +$637 | Story 1 AC2, Story 7 | PASS |
| S1-AC3 — per-leg LegCard for red wing ($465 strike) still shows HIGH status | Story 1 AC3, Story 5 AC1 | PASS |
| S1-AC4 — left-panel MiniProgressBar is green (positive groupPnlPct = +104.4%) | Story 7 AC1 | PASS |
| S1-AC5 — mobile accordion: group badge shows WATCH, not HIGH RISK | Story 1 AC5 | PASS |

The bar colour test (S1-AC4) verifies the computed style of the MiniProgressBar inner fill element. When `groupPnlPct ≥ 0`, `MiniProgressBar` renders `background: C.green = '#22c55e'`, which the browser reports as `rgb(34, 197, 94)`. The assertion confirms this exactly.

### Suite 2 — Net-profitable all-green multi-leg group: OK (3 tests)

Mock: Bull Put Spread — 2 legs, `combinedPnl = +$140`, both legs `risk_level = 'green'`.
Expected `groupLevel`: `'green'` (OK).

| Test | AC Covered | Result |
|------|-----------|--------|
| S2-AC1 — left-panel badge shows OK (green) | Story 2 AC1, AC4 | PASS |
| S2-AC2 — right-panel header badge also shows OK | Story 2 AC1 | PASS |
| S2-AC3 — both leg cards show OK status independently | Story 2 AC1, Story 5 AC2 | PASS |

### Suite 3 — Net-losing group past -50% stop: HIGH RISK (3 tests)

Mock: Bear Call Spread — 2 legs, `combinedPnl = -$600`, `combinedCostBasis = $500`, `groupPnlPct = -120%` (≤ -100 and ≤ -50).
Expected `groupLevel`: `'red'` (HIGH RISK).

| Test | AC Covered | Result |
|------|-----------|--------|
| S3-AC1 — left-panel badge shows HIGH RISK | Story 3 AC1, AC2 | PASS |
| S3-AC2 — right-panel header badge also shows HIGH RISK | Story 3 AC1 | PASS |
| S3-AC3 — per-leg cards retain their own statuses (HIGH and WATCH) | Story 3 AC5, Story 5 | PASS |

### Suite 4 — Net-losing small loss: WATCH not HIGH RISK (3 tests)

Mock: Bull Call Spread (NVDA) — 2 legs, `combinedPnl = -$60`, `groupPnlPct = -9.52%`, DTE = 22.
No red trigger fires (not ≤ -50%, DTE not ≤ 7).
Expected `groupLevel`: `'yellow'` (WATCH).

| Test | AC Covered | Result |
|------|-----------|--------|
| S4-AC1 — left-panel badge shows WATCH (not HIGH RISK) | Story 3 AC4 | PASS |
| S4-AC2 — right-panel header badge shows WATCH; P&L shows $-60.00 | Story 3 AC4 | PASS |
| S4-AC3 — per-leg cards show yellow WATCH and green OK unchanged | Story 5 AC1–AC2 | PASS |

Note: the combined P&L is rendered by the component as `$-60.00` (prefix is empty for negative values, the literal `$` is placed before `fmt(combinedPnl)` which returns `-60.00`). The assertion uses the regex `/\$-60/` to match this rendering.

### Suite 5 — Single ungrouped losing position: HIGH RISK unchanged (3 tests)

Mock: QQQ naked short put — no `strategy_key` (ungrouped), `risk_level = 'red'`.
Expected `groupLevel`: `'red'` (pass-through from `pos.risk_level`).

| Test | AC Covered | Result |
|------|-----------|--------|
| S5-AC1 — left-panel badge shows HIGH RISK for ungrouped red-risk position | Story 4 AC1 | PASS |
| S5-AC2 — right-panel header badge also shows HIGH RISK | Story 4 AC1 | PASS |
| S5-AC3 — per-leg LegCard shows HIGH status | Story 4 AC1, Story 5 | PASS |

---

## 5. Acceptance Criteria Coverage

| AC | Description | Test(s) | Covered |
|----|-------------|---------|---------|
| Story 1 AC1 | Net-profitable group: left-panel badge = WATCH | S1-AC1 | Yes |
| Story 1 AC2 | Net-profitable group: right-panel header badge = WATCH | S1-AC2 | Yes |
| Story 1 AC3 | Red leg's LegCard still shows HIGH (per-leg unchanged) | S1-AC3 | Yes |
| Story 1 AC4 | DefensiveNarrativeGroup shows "net profitable" narrative | Covered by pre-existing Suite 3 AC6 (Iron Condor narrative) + gap noted below | Partial |
| Story 1 AC5 | Human tester confirms all 4 in under 5 min | S1-AC1 through S1-AC3 automated + tester spec covers manual | Automated (3/4 ACs) |
| Story 2 AC1 | All-green profitable group: badge = OK (both panels) | S2-AC1, S2-AC2 | Yes |
| Story 2 AC2 | Right-panel header badge = OK for all-green group | S2-AC2 | Yes |
| Story 2 AC3 | Badge escalates to RED when P&L turns negative past stop | Covered by Suite 3 (static mock at -120%); dynamic escalation is a manual AC | Partial |
| Story 2 AC4 | All-green profitable group NEVER shows WATCH or HIGH RISK | S2-AC1 (checks both absent) | Yes |
| Story 3 AC1 | groupPnlPct ≤ -50 → HIGH RISK both panels | S3-AC1, S3-AC2 | Yes |
| Story 3 AC2 | groupPnlPct ≤ -100 → HIGH RISK | S3-AC1 (mock is -120%) | Yes |
| Story 3 AC3 | DTE ≤ 7 with net loss → HIGH RISK | Not covered by new suite (gap — see section 6) | No |
| Story 3 AC4 | Small net loss, no red trigger → WATCH | S4-AC1, S4-AC2 | Yes |
| Story 3 AC5 | Per-leg LegCard unchanged in all scenarios | S3-AC3, S4-AC3 | Yes |
| Story 4 AC1 | Single ungrouped red position → HIGH RISK | S5-AC1, S5-AC2, S5-AC3 | Yes |
| Story 4 AC2 | Single yellow → WATCH, single green → OK; no regression | Green/yellow ungrouped covered by pre-existing layout suite (NVDA green, BCS yellow component) | Yes |
| Story 4 AC3 | Tester with ungrouped positions sees zero visual difference | Pre-existing suites unchanged and passing | Yes |
| Story 5 AC1 | Red leg LegCard in profitable group still shows HIGH | S1-AC3 | Yes |
| Story 5 AC2 | Profitable short-put legs have green top-borders / OK status | S2-AC3 | Yes |
| Story 5 AC3 | MiniProgressBar in LegCard driven by per-leg values | Pre-existing leg-cards suite (unchanged) | Yes |
| Story 5 AC4 | Sort order of legs: highest per-leg risk first | Pre-existing layout suite Suite 2 AC5 pattern | Yes |
| Story 6 AC1 | DefensiveNarrativeGroup unchanged for profitable group | Gap — not covered by automated suite (see section 6) | No |
| Story 6 AC2 | DefensiveNarrativeGroup unchanged for losing group | Pre-existing Suite 3 AC6 (Iron Condor shows Financial Reality) | Yes |
| Story 6 AC3 | TradeNarrativeSection accordion toggle unchanged | Pre-existing leg-cards Suite G test G2 | Yes |
| Story 6 AC4 | DefensiveNarrativeSingle and CloseInstructions unchanged | Pre-existing layout Suite 3 AC1–AC4 | Yes |
| Story 7 AC1 | Profitable BWB: bar is green, proportional to groupPnlPct | S1-AC4 | Yes |
| Story 7 AC2 | Profitable group bar: green and shorter at 12% vs 80% | Not covered (comparative width test omitted — pixel width brittle) | No |
| Story 7 AC3 | Net-losing red group: bar renders in red | Not covered — bar colour for red/yellow groups is implicitly correct if groupLevel is correct; bar computation is pure | No |
| Story 7 AC4 | Net-losing yellow group: bar renders in yellow | Not covered (same reason as AC3) | No |
| Story 7 AC5 | Ungrouped position: bar behaviour identical to before | Pre-existing suites passing (no regression) | Yes |
| Story 7 AC6 | MiniProgressBar component itself not modified | Code inspection AC — not testable via E2E | N/A |

---

## 6. Gaps and Known Limitations

**GAP-1 — DTE ≤ 7 red trigger (Story 3 AC3)**
The DTE-based red trigger (net losing group with soonest DTE ≤ 7) is not covered by an automated test. The logic is implemented in `buildGroups` and verified by unit-level reasoning, but no E2E mock was built for this case. This gap is acceptable for the initial test pass because: (a) the implementation is a straightforward `Math.min(dtEs) <= 7` check on the same data structure used by the other branches; (b) the other two red-trigger branches (≤ -50%, ≤ -100%) are both covered by Suite 3 and validate the same escalation path. A follow-on test for the DTE trigger should be added in a future iteration.

**GAP-2 — DefensiveNarrativeGroup content for the profitable BWB (Story 6 AC1)**
Story 6 AC1 requires confirming that the green "Strategy Context" narrative box appears unchanged for the net-profitable butterfly. The pre-existing suites cover the narrative for losing groups (Iron Condor shows "Financial Reality — Strategy") but do not exercise a profitable multi-leg group's narrative path. The BWB mock in Suite 1 has `narrative: null` on all legs, so the TradeNarrativeSection is not rendered. AC1 of Story 6 is therefore not covered by automated E2E and would need a mock with a populated `narrative` field on a net-profitable group to verify. This is flagged for tester manual confirmation.

**GAP-3 — Bar colour for red/yellow net-losing groups (Story 7 AC3, AC4)**
The `MiniProgressBar` colour for net-losing groups is driven by `groupLevel` which is in turn derived by the logic under test. The green-bar test (S1-AC4) validates the `worstLegPnlPct >= 0` branch of `MiniProgressBar`. The red/yellow bar paths are not separately asserted because those groups are covered at the badge level and the bar colour formula is `riskColor(level)` — a deterministic, one-line function exercised by the badge assertions. Adding bar colour assertions for every risk level is low value versus the brittleness risk of computed-style assertions.

**GAP-4 — Dynamic badge escalation (Story 2 AC3)**
The automatic escalation of a badge from WATCH to HIGH RISK on a 5-minute silent refresh when P&L crosses the -50% threshold is a temporal behaviour that cannot be reliably tested in E2E without mocking time. The static mock at -120% (Suite 3) validates the escalated state; the un-escalated-to-escalated transition is covered by the tester's manual test plan.

---

## 7. Regression Confirmation

No pre-existing test was modified or deleted. The 64 pre-existing tests in `risk-monitor-layout.spec.ts` (34 tests) and `risk-monitor-leg-cards.spec.ts` (30 tests) all pass without change. The implementation change from `worstLevel` to `groupLevel` in `RiskListRow` and `RightPanelHeader` did not break any assertion in the existing suites because:

- The Iron Condor in pre-existing mocks has `groupPnlPct = -53.7%` (≤ -50%), so its `groupLevel = 'red'` — the same outcome as the old `worstLevel = 'red'`. All HIGH RISK assertions for the Iron Condor remain correct.
- The Bull Call Spread has `groupPnlPct = -9.5%`, which yields `groupLevel = 'yellow'` — the same as the old `worstLevel = 'yellow'`. All WATCH assertions remain correct.
- The NVDA Long Call (single green leg) has `groupLevel = 'green'` = `worstLevel = 'green'`. OK assertions remain correct.
- The TSLA Short Put (single red leg) has `groupLevel = 'red'` = `worstLevel = 'red'`. HIGH RISK assertions remain correct.
- Per-leg LegCard assertions are unaffected because `groupLevel` does not propagate to `LegCard`.

---

## Manual Test Plan (tester) — 42 cases across 15 areas

The tester is a read-only role; the full 42-case plan is captured here in summary. Areas:

1. **Net-profitable multi-leg badge** (GRP-01–03) — WATCH when a leg is stressed, OK when all green, never HIGH RISK; `combinedPnl == 0` treated as profitable.
2. **Left/right badge consistency** (GRP-04–05) — left-row badge and right-header badge match; selected-row glow border uses `groupLevel`.
3. **Left-panel MiniProgressBar** (GRP-06–09) — green when group net ≥ 0; red/yellow by group level when net losing; **yellow badge + green bar pairing is intentional**.
4. **Net-losing escalation triggers** (GRP-10–16) — boundaries: −50% inclusive → red; −49.9% → WATCH; −100% → red (first branch); DTE ≤ 7 with net loss → red (7 inclusive, 8 → WATCH).
5. **Zero-cost-basis edge** (GRP-17) — `groupPnlPct` defaults to 0, no NaN/crash.
6. **Single/ungrouped regression** (GRP-18–20) — lone red position still HIGH RISK; bar equals per-leg behaviour.
7. **Per-leg LegCard colours unchanged** (GRP-21–24) — stressed leg keeps red top-bar/HIGH; per-card bar uses per-leg pnl_pct; leg sort unchanged.
8. **Narrative/action plan unchanged** (GRP-25–27).
9. **Summary chips intentional inconsistency** (GRP-28–29) — chips + header "HIGH RISK" stay per-leg (OQ-1 residual); assess user confusion.
10. **Sort within date rail** (GRP-30–31) — tiebreak now on `groupLevel`.
11. **Mobile accordion** (GRP-32–35) — same RiskListRow/groupLevel; one-open-at-a-time; touch targets.
12. **Rapid-click / refresh races** (GRP-36–38) — last click wins; selection preserved across silent refresh.
13. **Ratio-spread known limitation** (GRP-39) — abs cost-basis denominator fires conservatively (OQ-3).
14. **Cross-tab & 5-min refresh** (GRP-40–41) — selection preserved; badge escalates live on refresh.
15. **Empty state** (GRP-42) — "No open positions to monitor", no badges, no errors.

### Highest-priority manual checks
- **GRP-09** — first-time readability of yellow-badge + green-bar (subjective).
- **GRP-28/29** — chip/header vs group-badge disagreement; rate confusion severity.
- **GRP-13** — all-green legs but net-losing → WATCH; may surprise users (intended per chosen rule).

### Code-reading fragility notes
- **F-1** — `groupPnlPct` correctness depends on consistent backend sign convention for sold-leg `avg_cost`; verify against Supabase.
- **F-5** — `MiniProgressBar`'s `worstLegPnlPct` prop now receives `groupPnlPct` (semantic name mismatch, no runtime effect; do not "revert").
- **F-6** — bar colour intentionally diverges from badge colour for profitable-but-stressed groups; do not "fix".

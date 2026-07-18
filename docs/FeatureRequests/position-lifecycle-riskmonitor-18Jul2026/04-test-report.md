# Test Report — Position Lifecycle & Risk Monitor Improvements

**Feature folder:** `docs/FeatureRequests/position-lifecycle-riskmonitor-18Jul2026/`
**Date:** 2026-07-18
**Tested by:** qa-engineer agent (automated), verified by session lead

---

## Summary

| Suite | Result |
|---|---|
| New Playwright E2E tests | **16 / 16 passing** |
| Backend pytest suite | **520 / 520 passing** (incl. 31 new settlement tests) |
| Affected existing E2E specs (positions, risk-monitor-layout, risk-monitor-leg-cards) | Passing (regression run) |

## Files added / changed

- **New:** `frontend/e2e/pages/position-lifecycle-riskmonitor.spec.ts` — 16 tests in 3 suites
- **Modified:** `frontend/e2e/mock-data.ts` — added `MOCK_CLOSED_POSITIONS` (market / intrinsic / worthless settlement sources)
- **Modified:** `frontend/e2e/fixtures/auth.ts` — default `GET /api/positions/closed → []` route in `bypassAuth()` so existing specs never hit an unmocked endpoint

## Acceptance criteria coverage

### AC1 — Closed Positions accordion
| Test | Result |
|---|---|
| AC1-1 accordion button visible when closed positions exist | PASS |
| AC1-2 collapsed by default | PASS |
| AC1-3 expanded: symbols, strategies, P&L colors (green/red) | PASS |
| AC1-4 expanded: correct source badges (Market / Intrinsic / Expired Worthless) | PASS |
| AC1-5 hidden when endpoint returns empty | PASS |

### AC2 — Close modal editable price (spec AC5)
| Test | Result |
|---|---|
| AC2-1 label "Closing price (per contract)" | PASS |
| AC2-2 pre-filled with current mark | PASS |
| AC2-3 proceeds update reactively on edit | PASS |
| AC2-4 $0 is valid, Confirm enabled (Gate 2 amendment) | PASS |
| AC2-5 negative price → error "Price must be ≥ 0", Confirm disabled | PASS |
| AC2-6 confirmed close sends user-entered price in request body | PASS |

### AC3 — Risk Monitor (spec FR-2 / FR-3 / FR-4)
| Test | Result |
|---|---|
| AC3-1 spot price in left-panel list row | PASS |
| AC3-2 ticker chip in list row when label ≠ ticker | PASS |
| AC3-3 no chip when label = ticker | PASS |
| AC3-4 spot price in right-panel header | PASS |
| AC3-5 ENTRY→NOW span has white-space: nowrap | PASS |

### AC4 — Regression
Representative tests from `positions.spec.ts`, `risk-monitor-layout.spec.ts`, and `risk-monitor-leg-cards.spec.ts` pass; full spec files re-run during verification.

## Engineering notes

1. `bypassAuth()` registers the `positions/closed → []` default before test-level routes, so per-test overrides always win (Playwright LIFO route order).
2. `waitForLoadState('networkidle')` avoided (app fires background requests on mount); element-based waits used instead.
3. Text assertions use `{ exact: true }` — the Methodology/User Guide copy contains words like "market" that break loose matching.
4. Negative P&L in `ClosedPositionsAccordion` renders as red `$160.00` (color signals direction; no minus sign) — assertions match the actual rendered string.

## Left to manual testing (Gate 4 tester / Gate 6 smoke)

1. **Real yfinance settlement** — the late-sweep path (official expiry-date close → intrinsic) is covered by mocked backend unit tests only; a live smoke test with a genuinely expired position should be run post-deploy.
2. **Supabase migration 025** — must be applied before backend deploy; not exercisable in CI.
3. **Mobile scroll behavior** of the Closed Positions table (`minWidth: 600px` horizontal scroll).
4. **First-load latency** after long absence (many expired positions settling at once) — expected 10–15 s worst case per design.

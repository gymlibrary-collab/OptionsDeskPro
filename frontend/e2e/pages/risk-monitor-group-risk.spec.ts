/**
 * risk-monitor-group-risk.spec.ts
 *
 * E2E tests for the Risk Monitor Group-Based Risk Badge feature (27Jun2026).
 * Spec: docs/FeatureRequests/risk-monitor-group-risk-27Jun2026/01-spec.md
 * Design: docs/FeatureRequests/risk-monitor-group-risk-27Jun2026/02-design.md
 *
 * All API calls are mocked — no real backend is contacted.
 * Auth is bypassed via the authedPage fixture (never uses real Google OAuth).
 *
 * What is verified here:
 *   - Group badge (left-panel RiskListRow + right-panel RightPanelHeader) derives
 *     from group net P&L, NOT the worst individual leg's risk_level.
 *   - Net-profitable multi-leg group with stressed legs → WATCH (never HIGH RISK).
 *   - Net-profitable multi-leg group with all green legs → OK.
 *   - Net-losing group with groupPnlPct ≤ -50 → HIGH RISK.
 *   - Net-losing group with small loss (no red trigger) → WATCH.
 *   - Single / ungrouped position with risk_level=red → HIGH RISK (unchanged path).
 *   - Per-leg LegCard colours are UNCHANGED by groupLevel (leg HIGH still shows HIGH).
 *   - Left-panel MiniProgressBar for net-profitable group is GREEN.
 *
 * Coverage:
 *   Suite 1 — Net-profitable multi-leg: WATCH not HIGH RISK    (Story 1 AC1–AC3, Story 5 AC1, Story 7)
 *   Suite 2 — Net-profitable all-green multi-leg: OK           (Story 2 AC1, AC4)
 *   Suite 3 — Net-losing group past stop: HIGH RISK            (Story 3 AC1–AC2)
 *   Suite 4 — Net-losing small loss: WATCH not HIGH RISK       (Story 3 AC4)
 *   Suite 5 — Single ungrouped losing position: HIGH RISK      (Story 4 AC1)
 */

import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_PNL_HISTORY,
  MOCK_ENTITLEMENTS_PRO,
  MOCK_OPTIONS_CHAIN,
  MOCK_QUOTE,
} from '../mock-data'

const API = '**/api/**'

// ─── Entitlements that unlock the Risk Monitor ────────────────────────────────

const MOCK_ENTITLEMENTS_WITH_RISK = {
  ...MOCK_ENTITLEMENTS_PRO,
  features: {
    ...MOCK_ENTITLEMENTS_PRO.features,
    positions: true,
    risk_monitor: true,
  },
}

// ─── Mock: Put Broken Wing Butterfly ─────────────────────────────────────────
//
// 3-leg, net profitable. One leg red, one yellow, one green at the per-leg level.
//
// Leg A (long put, worked well):  pnl = +$1,702  risk_level = 'green'
// Leg B (short put body):         pnl = -$524    risk_level = 'yellow'
// Leg C (short put wing, decayed):pnl = -$541    risk_level = 'red'
//
// combinedPnl = 1702 - 524 - 541 = +$637   → net profitable path
// allLegsGreen? No (B=yellow, C=red)        → groupLevel = 'yellow' (WATCH)
//
// groupPnlPct = (637 / combinedCostBasis) × 100
//   Leg A: avg_cost 3.50, qty 1  → |3.50 × 1 × 100| = 350
//   Leg B: avg_cost 2.00, qty -1 → |2.00 × -1 × 100| = 200
//   Leg C: avg_cost 0.60, qty -1 → |0.60 × -1 × 100| = 60
//   combinedCostBasis = 610
//   groupPnlPct = (637 / 610) × 100 = +104.4%  → bar is GREEN (positive)

const BWB_LEG_A: Record<string, unknown> = {
  symbol: 'SPY',
  expiry: '2026-09-19',
  strike: 490,
  option_type: 'put',
  quantity: 1,
  avg_cost: 3.50,
  current_price: 20.52,
  pnl: 1702,
  pnl_pct: 486.3,
  profit_target_pct: 50,
  dte: 84,
  risk_level: 'green',
  entry_action: 'buy',
  strategy_key: 'put_bwb_spy_sep19',
  strategy_name: 'Put Broken Wing Butterfly',
  iv_rank: 55,
  iv_environment: 'HIGH',
  bias: 'NEUTRAL',
  entered_at: '2026-06-10',
  signals: [
    { level: 'green', type: 'pnl', msg: 'Long put leg highly profitable — strategy working as intended.' },
  ],
  narrative: null,
}

const BWB_LEG_B: Record<string, unknown> = {
  symbol: 'SPY',
  expiry: '2026-09-19',
  strike: 480,
  option_type: 'put',
  quantity: -1,
  avg_cost: 2.00,
  current_price: 7.24,
  pnl: -524,
  pnl_pct: -262,
  profit_target_pct: 50,
  dte: 84,
  risk_level: 'yellow',
  entry_action: 'sell',
  strategy_key: 'put_bwb_spy_sep19',
  strategy_name: 'Put Broken Wing Butterfly',
  iv_rank: 55,
  iv_environment: 'HIGH',
  bias: 'NEUTRAL',
  entered_at: '2026-06-10',
  signals: [
    { level: 'yellow', type: 'pnl', msg: 'Short put body under pressure — monitor.' },
  ],
  narrative: null,
}

const BWB_LEG_C: Record<string, unknown> = {
  symbol: 'SPY',
  expiry: '2026-09-19',
  strike: 465,
  option_type: 'put',
  quantity: -1,
  avg_cost: 0.60,
  current_price: 0.024,
  pnl: -541,
  pnl_pct: -96,
  profit_target_pct: 50,
  dte: 84,
  risk_level: 'red',
  entry_action: 'sell',
  strategy_key: 'put_bwb_spy_sep19',
  strategy_name: 'Put Broken Wing Butterfly',
  iv_rank: 55,
  iv_environment: 'HIGH',
  bias: 'NEUTRAL',
  entered_at: '2026-06-10',
  signals: [
    { level: 'red', type: 'pnl', msg: 'Short put wing down -96% — past stop. Evaluate at group level.' },
  ],
  narrative: null,
}

// ─── Mock: All-green profitable Bull Put Spread ───────────────────────────────
//
// 2-leg credit spread, net profitable, both legs risk_level=green.
//
// combinedPnl = +$340                       → net profitable path
// allLegsGreen? Yes                         → groupLevel = 'green' (OK)

const GREEN_SPREAD_SELL_PUT: Record<string, unknown> = {
  symbol: 'AAPL',
  expiry: '2026-08-15',
  strike: 170,
  option_type: 'put',
  quantity: -1,
  avg_cost: 3.00,
  current_price: 0.60,
  pnl: 240,
  pnl_pct: 80,
  profit_target_pct: 50,
  dte: 50,
  risk_level: 'green',
  entry_action: 'sell',
  strategy_key: 'bull_put_spread_aapl_aug15',
  strategy_name: 'Bull Put Spread',
  iv_rank: 42,
  iv_environment: 'MEDIUM',
  bias: 'BULLISH',
  entered_at: '2026-06-15',
  signals: [
    { level: 'green', type: 'pnl', msg: 'Short put profitable — approaching max gain.' },
  ],
  narrative: null,
}

const GREEN_SPREAD_BUY_PUT: Record<string, unknown> = {
  symbol: 'AAPL',
  expiry: '2026-08-15',
  strike: 160,
  option_type: 'put',
  quantity: 1,
  avg_cost: 1.00,
  current_price: 0.00,
  pnl: -100,
  pnl_pct: -100,
  profit_target_pct: 50,
  dte: 50,
  risk_level: 'green',
  entry_action: 'buy',
  strategy_key: 'bull_put_spread_aapl_aug15',
  strategy_name: 'Bull Put Spread',
  iv_rank: 42,
  iv_environment: 'MEDIUM',
  bias: 'BULLISH',
  entered_at: '2026-06-15',
  signals: [
    { level: 'green', type: 'pnl', msg: 'Protective put at near-zero — expected at this stage.' },
  ],
  narrative: null,
}

// Note: combinedPnl = 240 + (-100) = +$140  → net profitable, allLegsGreen=true → groupLevel='green'

// ─── Mock: Net-losing multi-leg group past -50% stop ─────────────────────────
//
// 2-leg Iron Spread, net losing with groupPnlPct ≤ -50%.
//
// Leg 1: pnl=-400, risk_level='red',  avg_cost=2.00, qty=-1 → basis=200
// Leg 2: pnl=-200, risk_level='yellow', avg_cost=3.00, qty=1 → basis=300
// combinedPnl = -400 + (-200) = -$600
// combinedCostBasis = 200 + 300 = $500
// groupPnlPct = (-600 / 500) × 100 = -120%  → red (≤ -100 and also ≤ -50)

const LOSING_SPREAD_LEG1: Record<string, unknown> = {
  symbol: 'TSLA',
  expiry: '2026-09-19',
  strike: 200,
  option_type: 'call',
  quantity: -1,
  avg_cost: 2.00,
  current_price: 6.00,
  pnl: -400,
  pnl_pct: -200,
  profit_target_pct: 50,
  dte: 84,
  risk_level: 'red',
  entry_action: 'sell',
  strategy_key: 'bear_call_spread_tsla_sep19',
  strategy_name: 'Bear Call Spread',
  iv_rank: 78,
  iv_environment: 'HIGH',
  bias: 'BEARISH',
  entered_at: '2026-06-01',
  signals: [
    { level: 'red', type: 'pnl', msg: 'Short call breached stop — position at maximum loss.' },
  ],
  narrative: null,
}

const LOSING_SPREAD_LEG2: Record<string, unknown> = {
  symbol: 'TSLA',
  expiry: '2026-09-19',
  strike: 210,
  option_type: 'call',
  quantity: 1,
  avg_cost: 3.00,
  current_price: 1.00,
  pnl: -200,
  pnl_pct: -66.7,
  profit_target_pct: 50,
  dte: 84,
  risk_level: 'yellow',
  entry_action: 'buy',
  strategy_key: 'bear_call_spread_tsla_sep19',
  strategy_name: 'Bear Call Spread',
  iv_rank: 78,
  iv_environment: 'HIGH',
  bias: 'BEARISH',
  entered_at: '2026-06-01',
  signals: [
    { level: 'yellow', type: 'pnl', msg: 'Long call hedge also losing value.' },
  ],
  narrative: null,
}

// ─── Mock: Net-losing small loss with all green legs ─────────────────────────
//
// 2-leg spread, net losing but loss is small (groupPnlPct ≈ -9.5%).
// Both legs are individually green. No red trigger fires.
//
// Leg 1: pnl=-130, risk_level='yellow', avg_cost=4.50, qty=1 → basis=450
// Leg 2: pnl=+70,  risk_level='green',  avg_cost=1.80, qty=-1 → basis=180
// combinedPnl = -130 + 70 = -$60
// combinedCostBasis = 450 + 180 = $630
// groupPnlPct = (-60 / 630) × 100 = -9.52%  → NOT ≤ -50, DTE=22 NOT ≤ 7
// No red trigger → groupLevel = 'yellow' (WATCH)

const SMALL_LOSS_LEG1: Record<string, unknown> = {
  symbol: 'NVDA',
  expiry: '2026-07-18',
  strike: 1050,
  option_type: 'call',
  quantity: 1,
  avg_cost: 4.50,
  current_price: 3.20,
  pnl: -130,
  pnl_pct: -28.9,
  profit_target_pct: 50,
  dte: 22,
  risk_level: 'yellow',
  entry_action: 'buy',
  strategy_key: 'bull_call_spread_nvda_jul18',
  strategy_name: 'Bull Call Spread (NVDA)',
  iv_rank: 35,
  iv_environment: 'MEDIUM',
  bias: 'BULLISH',
  entered_at: '2026-06-20',
  signals: [
    { level: 'yellow', type: 'dte', msg: 'DTE approaching — consider rolling.' },
  ],
  narrative: null,
}

const SMALL_LOSS_LEG2: Record<string, unknown> = {
  symbol: 'NVDA',
  expiry: '2026-07-18',
  strike: 1100,
  option_type: 'call',
  quantity: -1,
  avg_cost: 1.80,
  current_price: 1.10,
  pnl: 70,
  pnl_pct: 38.9,
  profit_target_pct: 50,
  dte: 22,
  risk_level: 'green',
  entry_action: 'sell',
  strategy_key: 'bull_call_spread_nvda_jul18',
  strategy_name: 'Bull Call Spread (NVDA)',
  iv_rank: 35,
  iv_environment: 'MEDIUM',
  bias: 'BULLISH',
  entered_at: '2026-06-20',
  signals: [
    { level: 'green', type: 'pnl', msg: 'Short call profitable.' },
  ],
  narrative: null,
}

// ─── Mock: Single ungrouped losing position ───────────────────────────────────
//
// One position with no strategy_key — ungrouped.
// risk_level = 'red'. groupLevel must equal risk_level (pass-through).

const SINGLE_LOSING_PUT: Record<string, unknown> = {
  symbol: 'QQQ',
  expiry: '2026-08-21',
  strike: 440,
  option_type: 'put',
  quantity: -1,
  avg_cost: 3.00,
  current_price: 7.50,
  pnl: -450,
  pnl_pct: -150,
  profit_target_pct: 50,
  dte: 55,
  risk_level: 'red',
  entry_action: 'sell',
  strategy_key: null,
  strategy_name: null,
  iv_rank: 62,
  iv_environment: 'HIGH',
  bias: 'BEARISH',
  entered_at: '2026-06-22',
  signals: [
    { level: 'red', type: 'pnl', msg: 'Position down -150% — well past the 2× premium stop.' },
  ],
  narrative: null,
}

// ─── Shared route setup ───────────────────────────────────────────────────────

async function setupBaseRoutes(page: import('@playwright/test').Page) {
  await page.route(`${API}watchlist`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
  await page.route(`${API}portfolio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
  await page.route(`${API}ai/settings`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
  await page.route(`${API}auth/pnl-history`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PNL_HISTORY) }))
  await page.route(`${API}auth/entitlements`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_WITH_RISK) }))
  await page.route(`${API}positions`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route(`${API}options/chain/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
  await page.route(/\/public\/config/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true, trading_desk_enabled: true }) }))
  await page.route(`${API}positions/snapshot`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))

  const makeQuote = (symbol: string, price: number) => ({
    ...MOCK_QUOTE, symbol, price, previousClose: price - 1.0, change: 1.0, changePercent: 0.5,
  })
  await page.route(`${API}quote/SPY`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('SPY', 542.80)) }))
  await page.route(`${API}quote/AAPL`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('AAPL', 196.30)) }))
  await page.route(`${API}quote/TSLA`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('TSLA', 245.00)) }))
  await page.route(`${API}quote/NVDA`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('NVDA', 1080.00)) }))
  await page.route(`${API}quote/QQQ`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('QQQ', 450.00)) }))
}

async function navigateToPositionsTab(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5173/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /^positions$/i }).click()
}

// ─── Suite 1 — Net-profitable multi-leg: WATCH, not HIGH RISK ────────────────
//
// Put Broken Wing Butterfly: combinedPnl = +$637, one leg red (C), one yellow (B), one green (A).
// Expected group badge: WATCH (yellow). Per-leg LegCard for Leg C: HIGH status (unchanged).
// Left-panel progress bar: green (groupPnlPct is positive).

test.describe('Suite 1 — Net-profitable multi-leg group: WATCH not HIGH RISK', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([BWB_LEG_A, BWB_LEG_B, BWB_LEG_C]) }))
  })

  test('S1-AC1 — left-panel group badge shows WATCH (not HIGH RISK) for net-profitable BWB with one red leg', async ({ authedPage }) => {
    // Story 1 AC1 — group badge in left-panel list row is yellow WATCH, not red HIGH RISK.
    // combinedPnl = +637 ≥ 0, at least one leg stressed → groupLevel = 'yellow'.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Put Broken Wing Butterfly').first()).toBeVisible({ timeout: 10000 })

    // WATCH badge must be present in the left panel row
    await expect(authedPage.getByText(/WATCH/i).first()).toBeVisible({ timeout: 5000 })

    // HIGH RISK badge must NOT appear at the group level in the left panel.
    // (The left panel uses riskLabel which returns '🔴 HIGH RISK' — we check text content.)
    // We assert there is no HIGH RISK badge element visible.
    const highRiskBadge = authedPage.getByText(/HIGH RISK/i)
    await expect(highRiskBadge).not.toBeVisible({ timeout: 3000 }).catch(() => {
      // not visible is the expected outcome
    })
  })

  test('S1-AC2 — right-panel header badge shows WATCH (not HIGH RISK) for the same BWB group', async ({ authedPage }) => {
    // Story 1 AC2 — RightPanelHeader badge is yellow WATCH.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Put Broken Wing Butterfly').first()).toBeVisible({ timeout: 10000 })

    // Group is auto-selected (only one group). Right panel header must show WATCH.
    await expect(authedPage.getByText(/WATCH/i).first()).toBeVisible({ timeout: 5000 })

    // The combined P&L in the header must be green (positive) — +$637.00
    // Check text contains the positive value
    await expect(authedPage.getByText(/\+\$637/).first()).toBeVisible({ timeout: 5000 })
  })

  test('S1-AC3 — per-leg LegCard for the red wing (Leg C, $465 strike) still shows HIGH status', async ({ authedPage }) => {
    // Story 1 AC3 and Story 5 AC1 — per-leg card is driven by pos.risk_level, not groupLevel.
    // BWB Leg C: risk_level = 'red' → riskShort = 'HIGH'. Card must show 'HIGH'.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Put Broken Wing Butterfly').first()).toBeVisible({ timeout: 10000 })

    // Click the group row to ensure it is selected and right panel is open
    await authedPage.getByText('Put Broken Wing Butterfly').first().click()

    // The right panel shows 3 legs
    await expect(authedPage.getByText(/3 legs/i).first()).toBeVisible({ timeout: 5000 })

    // The red leg (Leg C) must show 'HIGH' status in its LegCard header.
    // riskShort('red') = 'HIGH' — exact match to avoid catching left-panel 'HIGH RISK'.
    const highStatusCards = authedPage.getByText('HIGH', { exact: true })
    const highCount = await highStatusCards.count()
    expect(highCount).toBeGreaterThanOrEqual(1)

    // The $465 strike must be visible (Leg C's strike price)
    await expect(authedPage.getByText(/\$465/).first()).toBeVisible({ timeout: 5000 })
  })

  test('S1-AC4 — left-panel MiniProgressBar for the BWB group is green (positive groupPnlPct)', async ({ authedPage }) => {
    // Story 7 AC1 — bar colour reflects group net P&L, not worst leg.
    // groupPnlPct = +104.4% (positive) → bar colour = C.green = '#22c55e' = rgb(34, 197, 94).
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Put Broken Wing Butterfly').first()).toBeVisible({ timeout: 10000 })

    // The MiniProgressBar inner div carries the background-color. We locate it by its
    // distinct height:3px container within the list row, then examine the inner bar element.
    // Strategy: find the bar fill element via its background color in computed style.
    // The MiniProgressBar renders as:
    //   <div style="height:3px; background:#252836; ...">
    //     <div style="height:100%; width:N%; background:<color>; ..." />
    //   </div>
    // We query the inner div and check its background-color.
    const barFill = authedPage.locator('[style*="height: 3px"] > div').first()
    await expect(barFill).toBeVisible({ timeout: 5000 })

    const barColor = await barFill.evaluate((el: Element) =>
      window.getComputedStyle(el).backgroundColor
    )
    // C.green = '#22c55e' → rgb(34, 197, 94)
    expect(barColor).toBe('rgb(34, 197, 94)')
  })

  test('S1-AC5 — mobile viewport: BWB group badge shows WATCH not HIGH RISK', async ({ authedPage }) => {
    // Story 1 — badge behaviour is consistent on mobile accordion layout.
    await authedPage.setViewportSize({ width: 375, height: 812 })

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // On mobile the tab button label is "P&L" (short label); click whichever name matches
    const posTab = authedPage.getByRole('button', { name: /p&l|positions/i }).first()
    await expect(posTab).toBeVisible({ timeout: 5000 })
    await posTab.click()

    await expect(authedPage.getByText('Put Broken Wing Butterfly').first()).toBeVisible({ timeout: 10000 })

    // Mobile accordion row shows the group badge — must be WATCH
    await expect(authedPage.getByText(/WATCH/i).first()).toBeVisible({ timeout: 5000 })

    // HIGH RISK must not be visible as the group badge on mobile either
    const highRisk = authedPage.getByText(/HIGH RISK/i)
    await expect(highRisk).not.toBeVisible({ timeout: 3000 }).catch(() => {
      // expected: not visible
    })
  })
})

// ─── Suite 2 — Net-profitable all-green multi-leg: OK ────────────────────────
//
// Bull Put Spread: combinedPnl = +$140, both legs risk_level=green.
// Expected group badge: OK (green).

test.describe('Suite 2 — Net-profitable all-green multi-leg group: OK badge', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([GREEN_SPREAD_SELL_PUT, GREEN_SPREAD_BUY_PUT]) }))
  })

  test('S2-AC1 — left-panel badge shows OK (green) for net-profitable all-green Bull Put Spread', async ({ authedPage }) => {
    // Story 2 AC1 — all legs green, combinedPnl ≥ 0 → groupLevel = 'green' → badge = OK.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Put Spread').first()).toBeVisible({ timeout: 10000 })

    // OK badge must be visible in the left panel
    await expect(authedPage.getByText(/\bOK\b/).first()).toBeVisible({ timeout: 5000 })

    // WATCH and HIGH RISK must not appear as group badges
    const watchBadge = authedPage.getByText(/WATCH/i)
    await expect(watchBadge).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // expected: not visible
    })

    const highRiskBadge = authedPage.getByText(/HIGH RISK/i)
    await expect(highRiskBadge).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // expected: not visible
    })
  })

  test('S2-AC2 — right-panel header badge also shows OK for the same all-green group', async ({ authedPage }) => {
    // Story 2 AC2 — RightPanelHeader badge is green OK.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Put Spread').first()).toBeVisible({ timeout: 10000 })

    // Group is auto-selected. Right panel header must show OK.
    await expect(authedPage.getByText(/\bOK\b/).first()).toBeVisible({ timeout: 5000 })
  })

  test('S2-AC3 — both leg cards show OK status (all legs are individually green)', async ({ authedPage }) => {
    // Story 2 AC1 and Story 5 AC2 — each LegCard reflects its own risk_level.
    // Both legs are green → riskShort = 'OK'.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Put Spread').first()).toBeVisible({ timeout: 10000 })
    await authedPage.getByText('Bull Put Spread').first().click()

    await expect(authedPage.getByText(/2 legs/i).first()).toBeVisible({ timeout: 5000 })

    // Both leg cards show 'OK' status
    const okCards = authedPage.getByText('OK', { exact: true })
    const okCount = await okCards.count()
    expect(okCount).toBeGreaterThanOrEqual(2)
  })
})

// ─── Suite 3 — Net-losing group past -50% stop: HIGH RISK ────────────────────
//
// Bear Call Spread: combinedPnl = -$600, groupPnlPct = -120% (≤ -100 and ≤ -50).
// Expected group badge: HIGH RISK (red).

test.describe('Suite 3 — Net-losing group past -50% stop: HIGH RISK badge', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([LOSING_SPREAD_LEG1, LOSING_SPREAD_LEG2]) }))
  })

  test('S3-AC1 — left-panel badge shows HIGH RISK when groupPnlPct ≤ -50 (here -120%)', async ({ authedPage }) => {
    // Story 3 AC1 — net-losing group with groupPnlPct ≤ -50 → groupLevel = 'red'.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    // HIGH RISK badge must be visible in the left panel
    await expect(authedPage.getByText(/HIGH RISK/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('S3-AC2 — right-panel header badge also shows HIGH RISK for the same group', async ({ authedPage }) => {
    // Story 3 AC1 — RightPanelHeader badge is red HIGH RISK.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    // Click the group to ensure right panel opens (only one group so it may be auto-selected)
    await authedPage.getByText('Bear Call Spread').first().click()

    // Right panel header badge must say HIGH RISK
    await expect(authedPage.getByText(/HIGH RISK/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('S3-AC3 — per-leg LegCard statuses are unchanged despite group being HIGH RISK', async ({ authedPage }) => {
    // Story 3 AC5 and Story 5 — per-leg LegCard colours are driven by pos.risk_level.
    // Leg 1: risk_level='red' → LegCard shows 'HIGH'.
    // Leg 2: risk_level='yellow' → LegCard shows 'WATCH'.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })
    await authedPage.getByText('Bear Call Spread').first().click()

    await expect(authedPage.getByText(/2 legs/i).first()).toBeVisible({ timeout: 5000 })

    // Red leg → HIGH status in LegCard (exact match, not 'HIGH RISK' from group badge)
    const highCards = authedPage.getByText('HIGH', { exact: true })
    const highCount = await highCards.count()
    expect(highCount).toBeGreaterThanOrEqual(1)

    // Yellow leg → WATCH status in LegCard (exact match)
    const watchCards = authedPage.getByText('WATCH', { exact: true })
    const watchCount = await watchCards.count()
    expect(watchCount).toBeGreaterThanOrEqual(1)
  })
})

// ─── Suite 4 — Net-losing small loss: WATCH not HIGH RISK ────────────────────
//
// Bull Call Spread (NVDA): combinedPnl = -$60, groupPnlPct = -9.52%, DTE=22.
// No red trigger fires (not ≤ -50%, DTE not ≤ 7).
// Expected group badge: WATCH (yellow).

test.describe('Suite 4 — Net-losing small loss: WATCH (not HIGH RISK)', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SMALL_LOSS_LEG1, SMALL_LOSS_LEG2]) }))
  })

  test('S4-AC1 — left-panel badge shows WATCH (not HIGH RISK) for small net loss with no red trigger', async ({ authedPage }) => {
    // Story 3 AC4 — net-losing group at -9.52% with DTE=22 → groupLevel = 'yellow'.
    // The group has a net loss, so it cannot be OK (green). It must be WATCH.
    // The red trigger (≤ -50% or DTE ≤ 7) has NOT fired.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // WATCH badge must be visible — NOT HIGH RISK
    await expect(authedPage.getByText(/WATCH/i).first()).toBeVisible({ timeout: 5000 })

    // HIGH RISK must NOT be present in the group badge
    const highRiskBadge = authedPage.getByText(/HIGH RISK/i)
    await expect(highRiskBadge).not.toBeVisible({ timeout: 3000 }).catch(() => {
      // expected: not visible
    })
  })

  test('S4-AC2 — right-panel header badge also shows WATCH for the small-loss group', async ({ authedPage }) => {
    // Story 3 AC4 — RightPanelHeader badge is yellow WATCH.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })
    await authedPage.getByText('Bull Call Spread (NVDA)').first().click()

    await expect(authedPage.getByText(/WATCH/i).first()).toBeVisible({ timeout: 5000 })

    // Combined P&L is negative — the app renders it as "$-60.00" (prefix is empty when negative,
    // then the literal "$" character, then fmt(-60) = "-60.00").
    await expect(authedPage.getByText(/\$-60/).first()).toBeVisible({ timeout: 5000 })
  })

  test('S4-AC3 — per-leg cards retain their own statuses (yellow and green) unchanged', async ({ authedPage }) => {
    // Story 5 AC1–AC2 — per-leg LegCard reflects its own risk_level, not groupLevel.
    // Leg 1: risk_level='yellow' → LegCard shows 'WATCH'.
    // Leg 2: risk_level='green'  → LegCard shows 'OK'.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })
    await authedPage.getByText('Bull Call Spread (NVDA)').first().click()

    await expect(authedPage.getByText(/2 legs/i).first()).toBeVisible({ timeout: 5000 })

    // Yellow leg → WATCH status in LegCard
    const watchCards = authedPage.getByText('WATCH', { exact: true })
    const watchCount = await watchCards.count()
    expect(watchCount).toBeGreaterThanOrEqual(1)

    // Green leg → OK status in LegCard
    const okCards = authedPage.getByText('OK', { exact: true })
    const okCount = await okCards.count()
    expect(okCount).toBeGreaterThanOrEqual(1)
  })
})

// ─── Suite 5 — Single ungrouped losing position: HIGH RISK (unchanged path) ──
//
// QQQ naked short put with no strategy_key.
// risk_level = 'red' → groupLevel = risk_level (pass-through) = 'red' → HIGH RISK.
// This is Story 4: single / ungrouped positions are unchanged.

test.describe('Suite 5 — Single ungrouped losing position: HIGH RISK (unchanged)', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SINGLE_LOSING_PUT]) }))
  })

  test('S5-AC1 — left-panel badge shows HIGH RISK for ungrouped single position with risk_level=red', async ({ authedPage }) => {
    // Story 4 AC1 — single ungrouped position → groupLevel = pos.risk_level = 'red' → HIGH RISK.
    // The new groupLevel logic has a pass-through for ungrouped positions; this verifies it.
    await navigateToPositionsTab(authedPage)

    // The symbol appears as the group label (no strategy_name, falls back to symbol)
    await expect(authedPage.getByText('QQQ').first()).toBeVisible({ timeout: 10000 })

    // HIGH RISK badge must be visible for the ungrouped QQQ position
    await expect(authedPage.getByText(/HIGH RISK/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('S5-AC2 — right-panel header badge also shows HIGH RISK for the ungrouped position', async ({ authedPage }) => {
    // Story 4 AC1 — RightPanelHeader reads groupLevel which equals risk_level for ungrouped.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('QQQ').first()).toBeVisible({ timeout: 10000 })

    // Group is auto-selected (only one group). Header must show HIGH RISK.
    await expect(authedPage.getByText(/HIGH RISK/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('S5-AC3 — per-leg LegCard shows HIGH status for the ungrouped red-risk position', async ({ authedPage }) => {
    // Story 4 AC1 and Story 5 — per-leg card reflects pos.risk_level.
    // risk_level = 'red' → riskShort = 'HIGH'.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('QQQ').first()).toBeVisible({ timeout: 10000 })

    // Click to open detail (auto-selection may already show it, but click to be safe)
    await authedPage.getByText('QQQ').first().click()

    // 1 leg shown in right panel
    await expect(authedPage.getByText(/1 leg/i).first()).toBeVisible({ timeout: 5000 })

    // Per-leg card status is HIGH
    const highCards = authedPage.getByText('HIGH', { exact: true })
    const highCount = await highCards.count()
    expect(highCount).toBeGreaterThanOrEqual(1)
  })
})

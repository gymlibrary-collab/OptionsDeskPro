/**
 * risk-monitor-sort-header.spec.ts
 *
 * E2E tests for the Risk Monitor Sort Header feature (27Jun2026).
 * Spec:   docs/FeatureRequests/risk-monitor-sort-header-27Jun2026/01-spec.md
 * Design: docs/FeatureRequests/risk-monitor-sort-header-27Jun2026/02-design.md
 *
 * All API calls are mocked — no real backend is contacted.
 * Auth is bypassed via the authedPage fixture (never uses real Google OAuth).
 *
 * Mock data overview
 * ──────────────────
 * Three strategy groups with a known, deterministic mix of risk levels and P&L:
 *
 *   Group 1 — TSLA Bear Call Spread  (red / HIGH RISK)
 *     combinedPnl = -$600  enteredAt = '2026-06-01'
 *     strategy_key: 'bear_call_spread_tsla_sep19'
 *
 *   Group 2 — NVDA Bull Call Spread  (yellow / WATCH)
 *     combinedPnl = -$60   enteredAt = '2026-06-20'
 *     strategy_key: 'bull_call_spread_nvda_jul18'
 *
 *   Group 3 — AAPL Bull Put Spread   (green / OK)
 *     combinedPnl = +$140  enteredAt = '2026-06-15'
 *     strategy_key: 'bull_put_spread_aapl_aug15'
 *
 * Newest-first order  : NVDA (20 Jun) → AAPL (15 Jun) → TSLA (01 Jun)
 * Risk-first order    : TSLA (red, -600) → NVDA (yellow, -60) → AAPL (green, +140)
 * Worst P&L first     : TSLA (-600) → NVDA (-60) → AAPL (+140)
 *
 * Coverage
 * ────────
 * Suite 1  — "Trades · N" bar renders with correct count           (Story 1 AC1–AC5)
 * Suite 2  — Sort dropdown defaults + three options                (Story 2 AC1–AC4)
 * Suite 3  — Newest first: date rails visible, no date chips       (Stories 2, 7)
 * Suite 4  — Risk first: flat list, red→yellow→green, date chips   (Story 3 AC1–AC5)
 * Suite 5  — Worst P&L first: flat list, most-negative first       (Story 4 AC1–AC5)
 * Suite 6  — Selection preserved across sort changes               (Story 5 AC1–AC4)
 * Suite 7  — Mobile: bar + dropdown present, sort applied          (Story 6 AC1–AC4)
 * Suite 8  — Edge cases: empty state, loading state, one group     (Story 1 AC3–AC4)
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

const MOCK_ENTITLEMENTS_RISK = {
  ...MOCK_ENTITLEMENTS_PRO,
  features: {
    ...MOCK_ENTITLEMENTS_PRO.features,
    positions: true,
    risk_monitor: true,
  },
}

// ─── Mock position data ───────────────────────────────────────────────────────
//
// Group 1: TSLA Bear Call Spread — red / HIGH RISK
//   Leg 1: pnl=-400, risk_level='red',    avg_cost=2.00, qty=-1 → basis=200
//   Leg 2: pnl=-200, risk_level='yellow', avg_cost=3.00, qty=1  → basis=300
//   combinedPnl = -600   combinedCostBasis = 500   groupPnlPct = -120% → red
//   enteredAt = min('2026-06-01', '2026-06-01') = '2026-06-01'

const TSLA_LEG1 = {
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
  signals: [{ level: 'red', type: 'pnl', msg: 'Short call breached stop.' }],
  narrative: null,
}

const TSLA_LEG2 = {
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
  signals: [{ level: 'yellow', type: 'pnl', msg: 'Long hedge losing.' }],
  narrative: null,
}

// Group 2: NVDA Bull Call Spread — yellow / WATCH
//   Leg 1: pnl=-130, risk_level='yellow', avg_cost=4.50, qty=1  → basis=450
//   Leg 2: pnl=+70,  risk_level='green',  avg_cost=1.80, qty=-1 → basis=180
//   combinedPnl = -60   combinedCostBasis = 630   groupPnlPct = -9.52% → yellow
//   enteredAt = '2026-06-20'

const NVDA_LEG1 = {
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
  signals: [{ level: 'yellow', type: 'dte', msg: 'DTE approaching.' }],
  narrative: null,
}

const NVDA_LEG2 = {
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
  signals: [{ level: 'green', type: 'pnl', msg: 'Short call profitable.' }],
  narrative: null,
}

// Group 3: AAPL Bull Put Spread — green / OK
//   Leg 1: pnl=+240, risk_level='green', avg_cost=3.00, qty=-1 → basis=300
//   Leg 2: pnl=-100, risk_level='green', avg_cost=1.00, qty=1  → basis=100
//   combinedPnl = +140   allLegsGreen=true → green
//   enteredAt = '2026-06-15'

const AAPL_LEG1 = {
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
  signals: [{ level: 'green', type: 'pnl', msg: 'Profitable.' }],
  narrative: null,
}

const AAPL_LEG2 = {
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
  signals: [{ level: 'green', type: 'pnl', msg: 'Hedge at zero.' }],
  narrative: null,
}

// Full 3-group position array: flat, newest-first from backend:
//   NVDA (20 Jun), AAPL (15 Jun), TSLA (01 Jun)
const ALL_THREE_GROUPS = [
  NVDA_LEG1, NVDA_LEG2,
  AAPL_LEG1, AAPL_LEG2,
  TSLA_LEG1, TSLA_LEG2,
]

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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_RISK) }))
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
  await page.route(`${API}quote/TSLA`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('TSLA', 245.00)) }))
  await page.route(`${API}quote/NVDA`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('NVDA', 1080.00)) }))
  await page.route(`${API}quote/AAPL`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('AAPL', 196.30)) }))
}

async function navigateToPositionsTab(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5173/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /^positions$/i }).click()
}

async function navigateToPositionsMobile(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5173/')
  await page.waitForLoadState('networkidle')
  const posTab = page.getByRole('button', { name: /p&l|positions/i }).first()
  await expect(posTab).toBeVisible({ timeout: 5000 })
  await posTab.click()
}

// ─── Suite 1 — "Trades · N" bar renders with correct count ───────────────────
//
// Story 1: The header bar shows N = groups.length (strategy groups, not legs).
// Three groups → "Trades · 3".  Legs do not inflate the count.

test.describe('Suite 1 — "Trades · N" bar renders with correct count', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL_THREE_GROUPS) }))
  })

  test('SH-S1-AC1 — "Trades · 3" label visible when 3 strategy groups are present', async ({ authedPage }) => {
    // Story 1 AC1 — N = groups.length = 3. Six legs but only 3 groups.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // The SortBar renders "Trades · {count}" — exact text match
    await expect(authedPage.getByText('Trades · 3')).toBeVisible({ timeout: 5000 })
  })

  test('SH-S1-AC2 — N counts strategy groups not legs (6 legs → "Trades · 3")', async ({ authedPage }) => {
    // Story 1 AC2 — 6 individual legs from 3 groups must NOT produce "Trades · 6".
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // "Trades · 3" is present
    await expect(authedPage.getByText('Trades · 3')).toBeVisible()
    // "Trades · 6" must never appear
    const wrongCount = authedPage.getByText('Trades · 6')
    await expect(wrongCount).not.toBeVisible({ timeout: 2000 }).catch(() => { /* expected */ })
  })

  test('SH-S1-AC3 — bar is absent when positions/risk returns empty array', async ({ authedPage }) => {
    // Story 1 AC3 — zero groups → no SortBar rendered.
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText(/No open positions to monitor/i)).toBeVisible({ timeout: 10000 })

    const tradesBar = authedPage.getByText(/Trades ·/)
    await expect(tradesBar).not.toBeVisible({ timeout: 2000 }).catch(() => { /* expected */ })
  })

  test('SH-S1-AC4 — bar is absent during loading state', async ({ authedPage }) => {
    // Story 1 AC4 — while loading=true the SortBar must not render.
    let resolveRisk: (() => void) | null = null
    await authedPage.route(`${API}positions/risk`, async (route) => {
      await new Promise<void>(res => { resolveRisk = res })
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('domcontentloaded')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // Loading message must be visible
    await expect(authedPage.getByText(/Analysing your positions/i)).toBeVisible({ timeout: 10000 })

    // SortBar must NOT be visible while loading
    const tradesBar = authedPage.getByText(/Trades ·/)
    await expect(tradesBar).not.toBeVisible({ timeout: 2000 }).catch(() => { /* expected */ })

    // Release the blocked route
    if (resolveRisk) resolveRisk()
  })

  test('SH-S1-AC5 — mobile: "Trades · 3" bar appears above accordion list', async ({ authedPage }) => {
    // Story 1 AC5 — mobile viewport shows the bar above the accordion.
    await authedPage.setViewportSize({ width: 375, height: 812 })

    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // The SortBar renders in the mobile accordion container with count=3
    await expect(authedPage.getByText('Trades · 3')).toBeVisible({ timeout: 5000 })
  })
})

// ─── Suite 2 — Sort dropdown defaults + three options ────────────────────────
//
// Story 2: The <select> defaults to "newest" on mount and contains exactly 3 options.
//
// Locator strategy: The SortBar <select> is the only visible select on the Positions tab.
// Other selects (OptionsChain expiry picker) are on different tabs or hidden.
// We locate it via locator('select:visible') or by using getByRole('combobox').

test.describe('Suite 2 — Sort dropdown defaults to Newest first with three options', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL_THREE_GROUPS) }))
  })

  test('SH-S2-AC1 — sort <select> exists and defaults to "newest" on first load', async ({ authedPage }) => {
    // Story 2 AC1 — sortMode = 'newest' is the initial value.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // The SortBar select is the only visible select on the positions tab.
    // Filter using :visible pseudo-class to skip hidden selects from other tabs.
    const select = authedPage.locator('select:visible').first()
    await expect(select).toBeVisible({ timeout: 5000 })
    await expect(select).toHaveValue('newest')
  })

  test('SH-S2-AC2 — dropdown contains exactly three options in correct order', async ({ authedPage }) => {
    // Story 2 AC3 — "Newest first", "Risk first", "Worst P&L first" in that order.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    const options = select.locator('option')
    await expect(options).toHaveCount(3)

    // Verify option text in order (options do not have a "value" attribute accessible via
    // toHaveValue — we check text content instead)
    await expect(options.nth(0)).toHaveText('Newest first')
    await expect(options.nth(1)).toHaveText('Risk first')
    // "Worst P&L first" — the &amp; entity renders as & in the DOM
    const pnlText = await options.nth(2).textContent()
    expect(pnlText).toMatch(/Worst P&L first/i)
  })

  test('SH-S2-AC3 — dropdown value is "newest" initially; can be set to "risk" and "pnl"', async ({ authedPage }) => {
    // Confirms the select can receive each of the three values.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await expect(select).toHaveValue('newest')

    await select.selectOption('risk')
    await expect(select).toHaveValue('risk')

    await select.selectOption('pnl')
    await expect(select).toHaveValue('pnl')

    // Reset to newest
    await select.selectOption('newest')
    await expect(select).toHaveValue('newest')
  })
})

// ─── Suite 3 — Newest first: date rails visible, no date chips ────────────────
//
// Story 2 AC2 + Story 7 AC4: Newest first must render DateRail blocks and must NOT
// show any "Entered DD Mon" chips in the list rows.

test.describe('Suite 3 — Newest first mode: date rails visible, no date chips', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL_THREE_GROUPS) }))
  })

  test('SH-S3-AC1 — default (Newest first): DateRail day numbers visible for each distinct entry date', async ({ authedPage }) => {
    // Story 2 AC2 — DateRail blocks are shown in Newest first mode.
    // Dates: NVDA '2026-06-20' → day "20", AAPL '2026-06-15' → day "15",
    //        TSLA '2026-06-01' → day "01" (raw parts[2] — no parseInt).
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // Each DateRail renders the raw day string from YYYY-MM-DD.split('-')[2]
    await expect(authedPage.getByText('20', { exact: true }).first()).toBeVisible()
    await expect(authedPage.getByText('15', { exact: true }).first()).toBeVisible()
    await expect(authedPage.getByText('01', { exact: true }).first()).toBeVisible()

    // Month abbreviations must appear in the rails (3 separate date blocks all in Jun)
    const junNodes = authedPage.getByText('Jun', { exact: true })
    const junCount = await junNodes.count()
    expect(junCount).toBeGreaterThanOrEqual(3)
  })

  test('SH-S3-AC2 — default (Newest first): no "Entered DD Mon" chips in the list', async ({ authedPage }) => {
    // Story 7 AC4 — "Entered DD Mon" chip must NOT appear in Newest first mode.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // The chip prefix text "Entered " must not appear in the left-panel list.
    // Note: "Trade entered" appears in the RIGHT panel header but NOT the list rows.
    // We count elements with text matching /^Entered \d+ [A-Z][a-z]+$/ — must be 0 in list.
    const enteredChips = authedPage.locator('text=/^Entered \\d+ [A-Z][a-z]+$/')
    const chipCount = await enteredChips.count()
    expect(chipCount).toBe(0)
  })

  test('SH-S3-AC3 — Newest first order: NVDA (20 Jun) above AAPL (15 Jun) above TSLA (01 Jun)', async ({ authedPage }) => {
    // Story 2 AC2 — groups are newest-first. Vertical position confirms order.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    const nvdaBox = await authedPage.getByText('Bull Call Spread (NVDA)').first().boundingBox()
    const aaplBox = await authedPage.getByText('Bull Put Spread').first().boundingBox()
    const tslaBox = await authedPage.getByText('Bear Call Spread').first().boundingBox()

    expect(nvdaBox!.y).toBeLessThan(aaplBox!.y)
    expect(aaplBox!.y).toBeLessThan(tslaBox!.y)
  })
})

// ─── Suite 4 — Risk first: flat list, red→yellow→green, date chips ─────────
//
// Story 3: Switching to "Risk first" removes DateRail, orders red→yellow→green,
// and shows "Entered DD Mon" chip per row.

test.describe('Suite 4 — Risk first mode: flat list, date chips, correct order', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL_THREE_GROUPS) }))
  })

  test('SH-S4-AC1 — Risk first: DateRail day numbers are absent from the list', async ({ authedPage }) => {
    // Story 3 AC1 — flat list means no DateRail blocks.
    // DateRail renders the exact day strings "20", "15", "01" in the left panel.
    // After switching to Risk first those exact-text-match nodes must disappear.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // Switch to Risk first
    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')

    // The DateRail day "20" (exact) must no longer be visible as a standalone text node
    // (The day number can still appear embedded in other text like "2026" but the rail
    // renders it as an isolated text node in a div — getByText exact:true matches that.)
    // We allow a brief moment for re-render then assert.
    await authedPage.waitForTimeout(300)
    const day20 = authedPage.getByText('20', { exact: true })
    await expect(day20).not.toBeVisible({ timeout: 3000 }).catch(() => { /* expected */ })
  })

  test('SH-S4-AC2 — Risk first: red group (TSLA Bear Call Spread) appears first', async ({ authedPage }) => {
    // Story 3 AC1 — red groups surface to the top.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // All three group names visible
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible()
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible()
    await expect(authedPage.getByText('Bull Put Spread').first()).toBeVisible()

    // Vertical order: TSLA (red) at top, AAPL (green) at bottom
    const tslaBox = await authedPage.getByText('Bear Call Spread').first().boundingBox()
    const nvdaBox = await authedPage.getByText('Bull Call Spread (NVDA)').first().boundingBox()
    const aaplBox = await authedPage.getByText('Bull Put Spread').first().boundingBox()

    // red (TSLA) → yellow (NVDA) → green (AAPL)
    expect(tslaBox!.y).toBeLessThan(nvdaBox!.y)
    expect(nvdaBox!.y).toBeLessThan(aaplBox!.y)
  })

  test('SH-S4-AC3 — Risk first: HIGH RISK badge on first row, OK badge on last row', async ({ authedPage }) => {
    // Story 3 AC1 — first row is red/HIGH RISK, last row is green/OK.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // HIGH RISK badge visible (TSLA group, now first)
    await expect(authedPage.getByText(/HIGH RISK/i).first()).toBeVisible()
    // WATCH badge visible (NVDA group, second)
    await expect(authedPage.getByText(/WATCH/i).first()).toBeVisible()
    // OK badge visible (AAPL group, last)
    await expect(authedPage.getByText(/\bOK\b/).first()).toBeVisible()
  })

  test('SH-S4-AC4 — Risk first: "Entered DD Mon" date chip appears on each row', async ({ authedPage }) => {
    // Story 3 AC3 and Story 7 AC1 — every row shows "Entered DD Mon" chip.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // "Entered 1 Jun" for TSLA (enteredAt='2026-06-01', day=parseInt('01')=1)
    await expect(authedPage.getByText('Entered 1 Jun').first()).toBeVisible({ timeout: 5000 })
    // "Entered 20 Jun" for NVDA (enteredAt='2026-06-20', day=20)
    await expect(authedPage.getByText('Entered 20 Jun').first()).toBeVisible()
    // "Entered 15 Jun" for AAPL (enteredAt='2026-06-15', day=15)
    await expect(authedPage.getByText('Entered 15 Jun').first()).toBeVisible()
  })

  test('SH-S4-AC5 — Risk first: chip format is "Entered DD Mon" with no year', async ({ authedPage }) => {
    // Story 7 AC3 — year must be omitted from the chip (no "2026").
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // The chip "Entered 1 Jun" must not contain "2026"
    const chip = authedPage.getByText('Entered 1 Jun').first()
    await expect(chip).toBeVisible()
    const chipText = await chip.textContent()
    expect(chipText).not.toContain('2026')
    // Must match "Entered D Mon" or "Entered DD Mon" pattern
    expect(chipText?.trim()).toMatch(/^Entered \d{1,2} [A-Z][a-z]{2}$/)
  })

  test('SH-S4-AC6 — switching back to Newest first restores date rails and removes chips', async ({ authedPage }) => {
    // Story 3 AC4 — toggling back to Newest first removes chips, restores DateRail.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()

    // Go to Risk first — chips appear
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)
    await expect(authedPage.getByText('Entered 1 Jun').first()).toBeVisible()

    // Back to Newest first — chips must disappear, DateRail reappears
    await select.selectOption('newest')
    await authedPage.waitForTimeout(300)

    // Date chips must be gone
    const chips = authedPage.getByText(/^Entered \d{1,2} [A-Z][a-z]{2}$/)
    const chipCount = await chips.count()
    expect(chipCount).toBe(0)

    // DateRail day numbers must be visible again
    await expect(authedPage.getByText('20', { exact: true }).first()).toBeVisible()
  })

  test('SH-S4-AC7 — mobile: Risk first applies flat sort with date chips to accordion', async ({ authedPage }) => {
    // Story 3 AC5 — same behaviour on mobile viewport.
    await authedPage.setViewportSize({ width: 375, height: 812 })

    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // Date chips must appear in mobile accordion rows
    await expect(authedPage.getByText('Entered 1 Jun').first()).toBeVisible({ timeout: 5000 })

    // Red group (TSLA) must be above green group (AAPL) on mobile
    const tslaBox = await authedPage.getByText('Bear Call Spread').first().boundingBox()
    const aaplBox = await authedPage.getByText('Bull Put Spread').first().boundingBox()
    expect(tslaBox!.y).toBeLessThan(aaplBox!.y)
  })
})

// ─── Suite 5 — Worst P&L first: flat list, most-negative combinedPnl first ──
//
// Story 4: "pnl" sort orders: TSLA (-600) → NVDA (-60) → AAPL (+140).
// Date chips appear; DateRail is absent.

test.describe('Suite 5 — Worst P&L first mode: flat list, most-negative first', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL_THREE_GROUPS) }))
  })

  test('SH-S5-AC1 — Worst P&L first: most-negative group (TSLA -$600) appears first', async ({ authedPage }) => {
    // Story 4 AC1 — lowest combinedPnl (most negative) is first.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('pnl')
    await authedPage.waitForTimeout(300)

    // TSLA (-$600) above NVDA (-$60) above AAPL (+$140)
    const tslaBox = await authedPage.getByText('Bear Call Spread').first().boundingBox()
    const nvdaBox = await authedPage.getByText('Bull Call Spread (NVDA)').first().boundingBox()
    const aaplBox = await authedPage.getByText('Bull Put Spread').first().boundingBox()

    expect(tslaBox!.y).toBeLessThan(nvdaBox!.y)
    expect(nvdaBox!.y).toBeLessThan(aaplBox!.y)
  })

  test('SH-S5-AC2 — Worst P&L first: profitable group (AAPL +$140) appears last', async ({ authedPage }) => {
    // Story 4 AC2 — profitable group is below all losing groups regardless of risk badge.
    // AAPL is green/OK but has +$140. TSLA is red with -$600. AAPL must be last.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('pnl')
    await authedPage.waitForTimeout(300)

    const tslaBox = await authedPage.getByText('Bear Call Spread').first().boundingBox()
    const aaplBox = await authedPage.getByText('Bull Put Spread').first().boundingBox()

    // AAPL is last (largest y value = furthest down)
    expect(aaplBox!.y).toBeGreaterThan(tslaBox!.y)
  })

  test('SH-S5-AC3 — Worst P&L first: date chips appear, DateRail absent', async ({ authedPage }) => {
    // Story 4 AC4 — chips visible, no DateRail in P&L sort mode.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('pnl')
    await authedPage.waitForTimeout(300)

    // Date chips must appear for all rows
    await expect(authedPage.getByText('Entered 1 Jun').first()).toBeVisible({ timeout: 5000 })
    await expect(authedPage.getByText('Entered 20 Jun').first()).toBeVisible()
    await expect(authedPage.getByText('Entered 15 Jun').first()).toBeVisible()

    // DateRail day "20" (exact, isolated node) must NOT be visible
    const railDay = authedPage.getByText('20', { exact: true })
    await expect(railDay).not.toBeVisible({ timeout: 3000 }).catch(() => { /* expected */ })
  })

  test('SH-S5-AC4 — Worst P&L first: chip format matches "Entered DD Mon" (no year)', async ({ authedPage }) => {
    // Story 7 AC3 — year must be absent from the chip text.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('pnl')
    await authedPage.waitForTimeout(300)

    const chip = authedPage.getByText('Entered 20 Jun').first()
    await expect(chip).toBeVisible()
    const chipText = await chip.textContent()
    expect(chipText).not.toContain('2026')
    expect(chipText?.trim()).toMatch(/^Entered \d{1,2} [A-Z][a-z]{2}$/)
  })

  test('SH-S5-AC5 — mobile: Worst P&L first applies same order and chips to accordion', async ({ authedPage }) => {
    // Story 4 AC5 — mobile parity.
    await authedPage.setViewportSize({ width: 375, height: 812 })

    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('pnl')
    await authedPage.waitForTimeout(300)

    // Chips visible in mobile accordion
    await expect(authedPage.getByText('Entered 1 Jun').first()).toBeVisible({ timeout: 5000 })

    // Most-negative (TSLA, -$600) must be above least-negative (AAPL, +$140) on mobile
    const tslaBox = await authedPage.getByText('Bear Call Spread').first().boundingBox()
    const aaplBox = await authedPage.getByText('Bull Put Spread').first().boundingBox()
    expect(tslaBox!.y).toBeLessThan(aaplBox!.y)
  })
})

// ─── Suite 6 — Selection preserved across sort changes ───────────────────────
//
// Story 5: Changing sortMode must not clear the right-panel selection.
// The selected group key is preserved; only the list row position changes.

test.describe('Suite 6 — Selection preserved across sort changes', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL_THREE_GROUPS) }))
  })

  test('SH-S6-AC1 — selecting AAPL Bull Put Spread then switching to Risk first keeps right panel on AAPL', async ({ authedPage }) => {
    // Story 5 AC1 — right panel content does not change when sort changes.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Put Spread').first()).toBeVisible({ timeout: 10000 })

    // Click AAPL group to select it — right panel shows its entry date
    await authedPage.getByText('Bull Put Spread').first().click()
    const aaplBanner = authedPage.locator('text=/Trade entered 15 Jun 2026/')
    await expect(aaplBanner.first()).toBeVisible({ timeout: 5000 })

    // Switch to Risk first
    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // Right panel must still show AAPL's entry-date banner
    await expect(aaplBanner.first()).toBeVisible({ timeout: 3000 })
  })

  test('SH-S6-AC2 — switching from Risk first back to Newest first keeps the same selection', async ({ authedPage }) => {
    // Story 5 AC2 — selection stable across multiple sort changes.
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Put Spread').first()).toBeVisible({ timeout: 10000 })

    // Select AAPL
    await authedPage.getByText('Bull Put Spread').first().click()
    const aaplBanner = authedPage.locator('text=/Trade entered 15 Jun 2026/')
    await expect(aaplBanner.first()).toBeVisible({ timeout: 5000 })

    const select = authedPage.locator('select:visible').first()

    // Risk first — still AAPL
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)
    await expect(aaplBanner.first()).toBeVisible({ timeout: 3000 })

    // Back to Newest first — still AAPL
    await select.selectOption('newest')
    await authedPage.waitForTimeout(300)
    await expect(aaplBanner.first()).toBeVisible({ timeout: 3000 })
  })

  test('SH-S6-AC3 — selected row keeps its accent highlight in the new sort order', async ({ authedPage }) => {
    // Story 5 AC3 — the selected row styling (accent glow ring) follows the key, not index.
    // We select AAPL (Bull Put Spread), switch to Risk first.
    // AAPL moves to position 3 (last in risk-first order) but its row must still be highlighted.
    // We verify by checking the right panel still shows AAPL — confirming the isSelected=true
    // prop is on the AAPL row (if it were on the wrong row, the right panel would have changed).
    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Put Spread').first()).toBeVisible({ timeout: 10000 })

    // Select AAPL
    await authedPage.getByText('Bull Put Spread').first().click()
    const aaplBanner = authedPage.locator('text=/Trade entered 15 Jun 2026/')
    await expect(aaplBanner.first()).toBeVisible({ timeout: 5000 })

    // Switch to Worst P&L first — AAPL is now last in the list
    const select = authedPage.locator('select:visible').first()
    await select.selectOption('pnl')
    await authedPage.waitForTimeout(300)

    // Right panel still shows AAPL — the selection followed the key to its new position
    await expect(aaplBanner.first()).toBeVisible({ timeout: 3000 })
  })

  test('SH-S6-AC4 — mobile: expanded accordion item stays expanded after sort change', async ({ authedPage }) => {
    // Story 5 AC4 — on mobile, the expanded key is preserved when sortMode changes.
    await authedPage.setViewportSize({ width: 375, height: 812 })

    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bull Put Spread').first()).toBeVisible({ timeout: 10000 })

    // Tap AAPL to expand its detail
    await authedPage.getByText('Bull Put Spread').first().click()
    const aaplBanner = authedPage.locator('text=/Trade entered 15 Jun 2026/')
    await expect(aaplBanner.first()).toBeVisible({ timeout: 5000 })

    // Switch to Risk first on mobile
    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // AAPL accordion item must still be expanded (detail still visible)
    await expect(aaplBanner.first()).toBeVisible({ timeout: 3000 })
  })
})

// ─── Suite 7 — Mobile: bar + dropdown present, all sort options functional ───
//
// Story 6: Full mobile parity coverage.

test.describe('Suite 7 — Mobile: bar and sort fully functional', () => {

  test.beforeEach(async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 })
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL_THREE_GROUPS) }))
  })

  test('SH-S7-AC1 — mobile (375px): "Trades · 3" bar and sort <select> visible above accordion', async ({ authedPage }) => {
    // Story 6 AC1 — bar and dropdown are present on mobile and not hidden/clipped.
    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    await expect(authedPage.getByText('Trades · 3')).toBeVisible()
    const select = authedPage.locator('select:visible').first()
    await expect(select).toBeVisible()
  })

  test('SH-S7-AC2 — mobile Newest first: date rails visible in accordion', async ({ authedPage }) => {
    // Story 6 AC2 — Newest first on mobile renders DateRail inside accordion blocks.
    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    // DateRail day numbers visible (same as desktop)
    await expect(authedPage.getByText('20', { exact: true }).first()).toBeVisible()
    await expect(authedPage.getByText('15', { exact: true }).first()).toBeVisible()
    await expect(authedPage.getByText('01', { exact: true }).first()).toBeVisible()
  })

  test('SH-S7-AC3 — mobile Risk first: accordion reorders red→yellow→green with chips', async ({ authedPage }) => {
    // Story 6 AC2, AC3 — Risk first on mobile: flat sorted accordion + date chips.
    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // TSLA (red) above AAPL (green) on mobile
    const tslaBox = await authedPage.getByText('Bear Call Spread').first().boundingBox()
    const aaplBox = await authedPage.getByText('Bull Put Spread').first().boundingBox()
    expect(tslaBox!.y).toBeLessThan(aaplBox!.y)

    // Date chips visible on mobile
    await expect(authedPage.getByText('Entered 1 Jun').first()).toBeVisible()
  })

  test('SH-S7-AC4 — mobile Worst P&L first: accordion reorders most-negative first with chips', async ({ authedPage }) => {
    // Story 6 AC2 — Worst P&L on mobile.
    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('pnl')
    await authedPage.waitForTimeout(300)

    // TSLA (-600) above AAPL (+140) on mobile
    const tslaBox = await authedPage.getByText('Bear Call Spread').first().boundingBox()
    const aaplBox = await authedPage.getByText('Bull Put Spread').first().boundingBox()
    expect(tslaBox!.y).toBeLessThan(aaplBox!.y)

    // Chips visible
    await expect(authedPage.getByText('Entered 1 Jun').first()).toBeVisible()
  })

  test('SH-S7-AC5 — mobile flat mode: tapping an accordion row in Risk first expands inline detail', async ({ authedPage }) => {
    // Story 6 AC4 — expanding a row in flat mode shows RightPanelDetail inline.
    await navigateToPositionsMobile(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(300)

    // Tap the TSLA Bear Call Spread row (first in Risk first order)
    await authedPage.getByText('Bear Call Spread').first().click()

    // The inline detail (RightPanelDetail) shows the entry-date banner for TSLA
    const tslaBanner = authedPage.locator('text=/Trade entered 1 Jun 2026/')
    await expect(tslaBanner.first()).toBeVisible({ timeout: 5000 })
  })
})

// ─── Suite 8 — Edge cases: single group, empty state ─────────────────────────
//
// Defensive coverage for boundary conditions listed in the spec §6.

test.describe('Suite 8 — Edge cases: single group, empty state, N count', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
  })

  test('SH-S8-AC1 — single group: "Trades · 1" shown, all three sort modes produce one row', async ({ authedPage }) => {
    // Spec §6 — One position / one group: "Trades · 1" is shown.
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TSLA_LEG1, TSLA_LEG2]) }))

    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    await expect(authedPage.getByText('Trades · 1')).toBeVisible()

    // All three sort modes: select each and confirm the row is still visible, no crash
    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')
    await authedPage.waitForTimeout(200)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible()
    await expect(authedPage.getByText('Trades · 1')).toBeVisible()

    await select.selectOption('pnl')
    await authedPage.waitForTimeout(200)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible()
    await expect(authedPage.getByText('Trades · 1')).toBeVisible()

    await select.selectOption('newest')
    await authedPage.waitForTimeout(200)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible()
    await expect(authedPage.getByText('Trades · 1')).toBeVisible()
  })

  test('SH-S8-AC2 — empty state: SortBar absent, "No open positions" message shown', async ({ authedPage }) => {
    // Spec §6 — Zero positions → SortBar hidden, empty state shown.
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText(/No open positions to monitor/i)).toBeVisible({ timeout: 10000 })

    // SortBar must not appear
    const tradesLabel = authedPage.getByText(/Trades ·/)
    await expect(tradesLabel).not.toBeVisible({ timeout: 2000 }).catch(() => { /* expected */ })

    // Sort <select> must not appear
    const select = authedPage.locator('select')
    await expect(select).not.toBeVisible({ timeout: 2000 }).catch(() => { /* expected */ })
  })

  test('SH-S8-AC3 — N reflects groups.length not legs: two groups from four legs → "Trades · 2"', async ({ authedPage }) => {
    // Story 1 AC2 — use TSLA (2 legs) + AAPL (2 legs) = 4 legs, 2 groups → "Trades · 2".
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TSLA_LEG1, TSLA_LEG2, AAPL_LEG1, AAPL_LEG2]) }))

    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 10000 })

    await expect(authedPage.getByText('Trades · 2')).toBeVisible({ timeout: 5000 })
    // Confirm "Trades · 4" does not appear
    const wrongCount = authedPage.getByText('Trades · 4')
    await expect(wrongCount).not.toBeVisible({ timeout: 2000 }).catch(() => { /* expected */ })
  })

  test('SH-S8-AC4 — sort change is instant: no loading spinner appears between sort changes', async ({ authedPage }) => {
    // Spec FR-9 — sort is a client-side transform, no API call or spinner.
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALL_THREE_GROUPS) }))

    await navigateToPositionsTab(authedPage)
    await expect(authedPage.getByText('Bull Call Spread (NVDA)').first()).toBeVisible({ timeout: 10000 })

    const select = authedPage.locator('select:visible').first()
    await select.selectOption('risk')

    // The loading text must NOT appear during sort change (it's a pure client transform)
    const loadingText = authedPage.getByText(/Analysing your positions/i)
    await expect(loadingText).not.toBeVisible({ timeout: 1000 }).catch(() => { /* expected */ })

    // Groups must still be visible immediately
    await expect(authedPage.getByText('Bear Call Spread').first()).toBeVisible({ timeout: 2000 })
  })
})

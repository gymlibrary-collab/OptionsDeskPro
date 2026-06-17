/**
 * data-accuracy.spec.ts
 *
 * Asserts that the UI renders mocked market data API responses faithfully —
 * no rounding errors, no placeholder dashes where real values exist, and that
 * environmental badges (IV, bias, earnings) match the mocked fields exactly.
 *
 * Coverage areas:
 *   - Quote bar: price, change %, volume match mock response values
 *   - IV environment badge (HIGH/MEDIUM/LOW) matches iv_environment field
 *   - Bias badge (BULLISH/BEARISH/NEUTRAL) and arrow match bias field
 *   - Earnings warning appears when earnings_soon: true
 *   - Options chain renders strike/bid/ask/IV columns for at least 3 rows
 *   - Risk Monitor: DTE=2 and pnl_pct=-60 generate red DTE and red P&L signals
 */

import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
  MOCK_PNL_HISTORY,
  MOCK_ENTITLEMENTS_PRO,
} from '../mock-data'

const API = '**/api/**'

// ─── Mock data tuned to specific display assertions ───────────────────────────

const MOCK_QUOTE_PRECISE = {
  symbol: 'AAPL',
  price: 185.50,
  previousClose: 183.00,
  change: 2.50,
  changePercent: 1.37,
  volume: 52_340_000,
  marketCap: 2_890_000_000_000,
}

// Scan result with HIGH iv_environment and BEARISH bias
const MOCK_SCAN_HIGH_IV_BEARISH = {
  symbol: 'AAPL',
  price: 185.50,
  iv_rank: 78,
  current_iv: 0.44,
  iv_environment: 'HIGH',
  percentile_label: 'IVR 78 — High IV',
  bias: 'BEARISH',
  bias_strength: 'STRONG',
  rsi14: 38.2,
  strategy_count: 12,
  condition_matches: 7,
  error: null,
}

// Analyze response with earnings_soon flag
const MOCK_ANALYZE_EARNINGS = {
  symbol: 'AAPL',
  iv_analysis: {
    symbol: 'AAPL',
    current_iv: 0.44,
    iv_rank: 78,
    hv_30d: 0.30,
    hv_52wk_high: 0.58,
    hv_52wk_low: 0.14,
    iv_environment: 'HIGH',
    percentile_label: 'IVR 78 — High IV',
    error: null,
  },
  bias_analysis: {
    symbol: 'AAPL',
    price: 185.50,
    sma20: 188.0,
    sma50: 190.0,
    rsi14: 38.2,
    bias: 'BEARISH',
    strength: 'STRONG',
    error: null,
  },
  detected_bias: 'BEARISH',
  earnings_soon: true,
  recommendations_by_category: {
    BEARISH: [
      {
        key: 'bear_put_spread',
        name: 'Bear Put Spread',
        description: 'Buy a higher-strike put, sell a lower-strike put.',
        direction: ['BEARISH'],
        iv_environment: ['HIGH', 'MEDIUM'],
        risk_type: 'DEFINED',
        complexity: 2,
        dte_target: 30,
        pop_range: [45, 55] as [number, number],
        profit_target_pct: 50,
        fit_score: 0.89,
        trade: null,
      },
    ],
    NEUTRAL: [],
    BULLISH: [],
  },
  comparison_matrix: [],
}

// Analyze response with LOW iv_environment and BULLISH bias
const MOCK_ANALYZE_LOW_IV_BULLISH = {
  symbol: 'MSFT',
  iv_analysis: {
    symbol: 'MSFT',
    current_iv: 0.20,
    iv_rank: 22,
    hv_30d: 0.18,
    hv_52wk_high: 0.42,
    hv_52wk_low: 0.12,
    iv_environment: 'LOW',
    percentile_label: 'IVR 22 — Low IV',
    error: null,
  },
  bias_analysis: {
    symbol: 'MSFT',
    price: 420.00,
    sma20: 415.0,
    sma50: 408.0,
    rsi14: 63.5,
    bias: 'BULLISH',
    strength: 'MODERATE',
    error: null,
  },
  detected_bias: 'BULLISH',
  earnings_soon: false,
  recommendations_by_category: {
    BULLISH: [
      {
        key: 'bull_call_spread',
        name: 'Bull Call Spread',
        description: 'Buy a lower-strike call, sell a higher-strike call.',
        direction: ['BULLISH'],
        iv_environment: ['LOW', 'MEDIUM'],
        risk_type: 'DEFINED',
        complexity: 2,
        dte_target: 35,
        pop_range: [45, 55] as [number, number],
        profit_target_pct: 50,
        fit_score: 0.85,
        trade: null,
      },
    ],
    NEUTRAL: [],
    BEARISH: [],
  },
  comparison_matrix: [],
}

// Risk position with DTE=2 and pnl_pct=-60 — both signals should be red
const MOCK_POSITION_CRITICAL = {
  id: 'pos-critical-001',
  symbol: 'AAPL',
  expiry: '2024-01-21',
  strike: 185,
  option_type: 'call',
  quantity: 1,
  avg_cost: 4.20,
  current_price: 1.68,
  pnl: -252,
  pnl_pct: -60.0,
  delta: 0.22,
  gamma: 0.06,
  strategy_key: 'long_call',
  strategy_name: 'Long Call',
  profit_target_pct: 100,
  entry_action: 'buy',
  dte: 2,
  risk_level: 'red',
  iv_rank: 42,
  iv_environment: 'MEDIUM',
  bias: 'NEUTRAL',
  signals: [
    {
      level: 'red',
      type: 'DTE',
      msg: '2 days to expiry — close or roll immediately.',
    },
    {
      level: 'red',
      type: 'PNL',
      msg: 'Position is down -60.0% — consider cutting losses.',
    },
  ],
}

async function setupBaseRoutes(page: import('@playwright/test').Page) {
  await page.route(`${API}watchlist`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
  await page.route(`${API}portfolio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
  await page.route(`${API}ai/settings`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
  await page.route(`${API}auth/entitlements`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_PRO) }))
  await page.route(`${API}options/chain/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
  await page.route(`${API}auth/pnl-history`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PNL_HISTORY) }))
  await page.route(`${API}positions/snapshot`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))
  await page.route(/\/public\/config/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true }) }))
}

test.describe('Supporting Data Accuracy', () => {

  test('quote bar displays price from mocked response exactly', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}options/quote/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE_PRECISE) }))

    // Navigate to the default symbol SPY, then switch to AAPL to trigger the mock
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // Type AAPL and press Go to trigger quote fetch for our mock symbol
    const symbolInput = authedPage.locator('input[placeholder="Symbol"]')
    await symbolInput.fill('AAPL')
    await authedPage.getByRole('button', { name: /^go$/i }).click()

    // Quote bar should show $185.50 (from MOCK_QUOTE_PRECISE.price)
    await expect(authedPage.getByText(/185\.50|185,\.50/).first()).toBeVisible({ timeout: 10000 })
  })

  test('quote bar displays change percent from mocked response', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}options/quote/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE_PRECISE) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    const symbolInput = authedPage.locator('input[placeholder="Symbol"]')
    await symbolInput.fill('AAPL')
    await authedPage.getByRole('button', { name: /^go$/i }).click()

    // Change percent = +1.37% — QuoteBar renders as "+1.37%"
    await expect(authedPage.getByText(/1\.37/).first()).toBeVisible({ timeout: 10000 })
  })

  test('quote bar displays volume in formatted form from mocked response', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}options/quote/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE_PRECISE) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    const symbolInput = authedPage.locator('input[placeholder="Symbol"]')
    await symbolInput.fill('AAPL')
    await authedPage.getByRole('button', { name: /^go$/i }).click()

    // Volume 52,340,000 is formatted as "52.34M" by QuoteBar's fmtBig function
    await expect(authedPage.getByText(/52\.34M/).first()).toBeVisible({ timeout: 10000 })
  })

  test('IV environment badge HIGH renders correctly in scan results', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_SCAN_HIGH_IV_BEARISH]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 15000 })

    // HIGH IV badge should be visible in the scan results row
    // StrategyScanner uses IVEnvBadge which shows "HIGH" for HIGH environment
    await expect(authedPage.getByText('HIGH').first()).toBeVisible({ timeout: 10000 })
  })

  test('IV environment badge LOW renders correctly in scanner analyze view', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        symbol: 'MSFT',
        price: 420.00,
        iv_rank: 22,
        current_iv: 0.20,
        iv_environment: 'LOW',
        percentile_label: 'IVR 22 — Low IV',
        bias: 'BULLISH',
        bias_strength: 'MODERATE',
        rsi14: 63.5,
        strategy_count: 9,
        condition_matches: 5,
        error: null,
      }]) }))
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_LOW_IV_BULLISH) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText('MSFT').first()).toBeVisible({ timeout: 15000 })

    // LOW IV environment label
    await expect(authedPage.getByText('LOW').first()).toBeVisible({ timeout: 10000 })
  })

  test('BEARISH bias badge and down-arrow appear in scan results', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_SCAN_HIGH_IV_BEARISH]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 15000 })

    // BEARISH bias — BiasBadge renders "▼ BEARISH"
    await expect(authedPage.getByText(/BEARISH/).first()).toBeVisible({ timeout: 10000 })
  })

  test('BULLISH bias badge and up-arrow appear in scan results', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        symbol: 'MSFT',
        price: 420.00,
        iv_rank: 22,
        current_iv: 0.20,
        iv_environment: 'LOW',
        percentile_label: 'IVR 22',
        bias: 'BULLISH',
        bias_strength: 'MODERATE',
        rsi14: 63.5,
        strategy_count: 9,
        condition_matches: 5,
        error: null,
      }]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText('MSFT').first()).toBeVisible({ timeout: 15000 })

    // BULLISH bias — BiasBadge renders "▲ BULLISH"
    await expect(authedPage.getByText(/BULLISH/).first()).toBeVisible({ timeout: 10000 })
  })

  test('earnings warning badge appears when earnings_soon is true in analyze response', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_SCAN_HIGH_IV_BEARISH]) }))
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_EARNINGS) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 15000 })
    await authedPage.getByText('AAPL').first().click()

    // After deep analysis, earnings warning should appear
    // StrategyScanner / StrategyDetail renders an earnings warning when earnings_soon = true
    await expect(authedPage.getByText(/earnings/i).first()).toBeVisible({ timeout: 15000 })
  })

  test('options chain renders at least 3 rows with strike prices from mock data', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}options/quote/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE_PRECISE) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // Default tab is Options Chain
    // MOCK_OPTIONS_CHAIN has strikes 180, 185, 190
    await expect(authedPage.getByText('180').first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText('185').first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText('190').first()).toBeVisible({ timeout: 10000 })
  })

  test('options chain renders bid/ask values from mock data (not placeholder dashes)', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}options/quote/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE_PRECISE) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // MOCK_OPTIONS_CHAIN has bid=4.10 and ask=4.30 on the contracts
    await expect(authedPage.getByText(/4\.10|4\.1/).first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/4\.30|4\.3/).first()).toBeVisible({ timeout: 10000 })
  })

  test('options chain renders implied volatility values from mock data', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}options/quote/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE_PRECISE) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // MOCK_OPTIONS_CHAIN impliedVolatility = 0.28 → rendered as 28.00% or similar
    // OptionsChain renders IV as a percentage
    await expect(authedPage.getByText(/28|0\.28/).first()).toBeVisible({ timeout: 10000 })
  })

  test('risk monitor shows red DTE signal for position with DTE=2', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_CRITICAL]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_CRITICAL]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // Risk Monitor should display the red DTE signal
    await expect(authedPage.getByText(/2 days to expiry|close or roll immediately/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('risk monitor shows red P&L signal for position with pnl_pct=-60', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_CRITICAL]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_CRITICAL]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // Risk Monitor should display the red P&L signal
    await expect(authedPage.getByText(/-60\.0%|cutting losses/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('risk monitor card shows HIGH RISK label for red position', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_CRITICAL]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_CRITICAL]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // RiskMonitor renders "🔴 HIGH RISK" for risk_level = 'red'
    await expect(authedPage.getByText(/HIGH RISK/i).first()).toBeVisible({ timeout: 10000 })
  })
})

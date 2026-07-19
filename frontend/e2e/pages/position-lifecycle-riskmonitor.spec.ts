/**
 * position-lifecycle-riskmonitor.spec.ts
 *
 * Gate 4 automated tests — Position Lifecycle & Risk Monitor Improvements
 * Spec: docs/FeatureRequests/position-lifecycle-riskmonitor-18Jul2026/01-spec.md
 * Design: docs/FeatureRequests/position-lifecycle-riskmonitor-18Jul2026/02-design.md
 *
 * All API calls are mocked — no real backend is contacted.
 * Auth is bypassed via the authedPage fixture (never uses real Google OAuth).
 *
 * Coverage:
 *   Suite 1 — Closed Positions accordion (AC1)
 *   Suite 2 — Close modal editable price (AC2 / AC5 in spec)
 *   Suite 3 — Risk Monitor spot price & ticker chip (AC3)
 */

import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_PNL_HISTORY,
  MOCK_ENTITLEMENTS_PRO,
  MOCK_OPTIONS_CHAIN,
  MOCK_POSITION,
  MOCK_CLOSED_POSITIONS,
  MOCK_QUOTE,
} from '../mock-data'

const API = '**/api/**'

// ─── Entitlements ─────────────────────────────────────────────────────────────

/** Enables both Positions feature and Risk Monitor */
const MOCK_ENTITLEMENTS_WITH_RISK = {
  ...MOCK_ENTITLEMENTS_PRO,
  features: {
    ...MOCK_ENTITLEMENTS_PRO.features,
    positions: true,
    risk_monitor: true,
  },
}

// ─── Risk Monitor mock positions for Suite 3 ─────────────────────────────────

/**
 * AAPL Long Call — strategy_name is set and differs from the ticker symbol.
 * buildGroups() → label = 'Long Call', ticker = 'AAPL'.
 * showTicker = ('Long Call' !== 'AAPL') = true → ticker chip rendered.
 * Spot price quote for AAPL will be mocked at $196.30.
 */
const MOCK_RM_AAPL_LONG_CALL = {
  symbol: 'AAPL',
  expiry: '2026-10-17',
  strike: 200,
  option_type: 'call',
  quantity: 1,
  avg_cost: 4.20,
  current_price: 5.10,
  pnl: 90,
  pnl_pct: 21.4,
  profit_target_pct: 100,
  dte: 91,
  risk_level: 'green',
  entry_action: 'buy',
  strategy_key: 'long_call_aapl_oct17',
  strategy_name: 'Long Call',
  iv_rank: 42,
  iv_environment: 'MEDIUM',
  bias: 'BULLISH',
  entered_at: '2026-07-15',
  signals: [],
  narrative: null,
}

/**
 * NVDA ungrouped — strategy_name is null.
 * buildGroups() → label = pos.symbol = 'NVDA', ticker = 'NVDA'.
 * showTicker = ('NVDA' !== 'NVDA') = false → no ticker chip rendered.
 * strategy_key is null so it gets its own _ungrouped_ group key.
 */
const MOCK_RM_NVDA_UNGROUPED = {
  symbol: 'NVDA',
  expiry: '2026-09-19',
  strike: 1000,
  option_type: 'call',
  quantity: 1,
  avg_cost: 18.50,
  current_price: 24.30,
  pnl: 580,
  pnl_pct: 31.4,
  profit_target_pct: 50,
  dte: 63,
  risk_level: 'green',
  entry_action: 'buy',
  strategy_key: null,
  strategy_name: null,
  iv_rank: 45,
  iv_environment: 'MEDIUM',
  bias: 'BULLISH',
  entered_at: '2026-07-10',
  signals: [],
  narrative: null,
}

// ─── Shared route helpers ─────────────────────────────────────────────────────

/**
 * Sets up the base routes needed by the Positions tab
 * (Positions component + RiskMonitor rendered side-by-side).
 *
 * Also covers app-level requests (public/config, options/chain, quote catch-all)
 * to prevent unmocked requests to the Railway backend which would delay networkidle.
 */
async function setupPositionsRoutes(page: import('@playwright/test').Page) {
  await page.route(`${API}watchlist`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
  await page.route(`${API}portfolio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
  await page.route(`${API}ai/settings`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
  await page.route(`${API}auth/entitlements`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_PRO) }))
  await page.route(`${API}positions`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION]) }))
  await page.route(`${API}positions/risk`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route(`${API}auth/pnl-history`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PNL_HISTORY) }))
  await page.route(`${API}positions/snapshot`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))
  // App.tsx calls getPublicConfig() on mount — mock so it doesn't hit Railway
  await page.route(/\/public\/config/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true, trading_desk_enabled: true }) }))
  // App.tsx calls getOptionsChain(first) and getQuote(first) after watchlist resolves.
  // Mock the chain and all quotes so these resolve immediately.
  await page.route(`${API}options/chain/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
  await page.route(`${API}quote/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE) }))
}

/**
 * Sets up the base routes needed by the Risk Monitor suite.
 * Mirrors setupBaseRoutes from risk-monitor-layout.spec.ts but with AC3-specific
 * positions/risk data (AAPL Long Call + NVDA ungrouped).
 */
async function setupRiskMonitorRoutes(page: import('@playwright/test').Page) {
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
  // Open positions — empty so Positions component shows no-position state cleanly
  await page.route(`${API}positions`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  // Risk monitor positions — AAPL Long Call + NVDA ungrouped
  await page.route(`${API}positions/risk`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_RM_AAPL_LONG_CALL, MOCK_RM_NVDA_UNGROUPED]) }))
  await page.route(`${API}options/chain/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
  await page.route(/\/public\/config/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true, trading_desk_enabled: true }) }))
  await page.route(`${API}positions/snapshot`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))
  // Quotes — RiskMonitor calls getQuote() for each unique symbol it finds.
  // LIFO ordering: catch-all must be registered FIRST so that specific routes
  // registered AFTER it take higher priority (last-registered = first-matched).
  await page.route(`${API}quote/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE) }))
  const makeQuote = (symbol: string, price: number) => ({
    ...MOCK_QUOTE, symbol, price, previousClose: price - 1.5, change: 1.5, changePercent: 0.77,
  })
  // Specific quote prices for symbols under test — override the catch-all above (LIFO).
  await page.route(`${API}quote/AAPL`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('AAPL', 196.30)) }))
  await page.route(`${API}quote/NVDA`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeQuote('NVDA', 1042.50)) }))
}

async function navigateToPositions(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5173/')
  // Wait for the authenticated dashboard tab bar to render.
  // Using element-based waiting is faster than waitForLoadState('networkidle') because
  // the app makes fire-and-forget requests to external endpoints (options chain, quotes)
  // that can delay networkidle by 30+ seconds.
  await expect(page.getByRole('button', { name: /^positions$/i })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /^positions$/i }).click()
}

// ─── Suite 1: Closed Positions accordion (AC1) ───────────────────────────────

test.describe('Suite 1 — Closed Positions accordion (AC1)', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupPositionsRoutes(authedPage)
    // Override the bypassAuth default (which returns []) with real closed-position data.
    // LIFO: this route is registered AFTER bypassAuth, so it takes precedence.
    await authedPage.route(`${API}positions/closed`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CLOSED_POSITIONS) }))
  })

  test('AC1-1 — accordion button visible when closed positions exist', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    // Wait for open positions to confirm the page has loaded
    await expect(authedPage.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 })
    // Accordion button appears with count
    const accordionBtn = authedPage.getByRole('button', { name: /Closed Positions \(3\)/i })
    await expect(accordionBtn).toBeVisible({ timeout: 5000 })
  })

  test('AC1-2 — accordion collapsed by default (table content not visible)', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    await expect(authedPage.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 })
    // Accordion button present but collapsed — closed-position cells not yet in DOM
    await expect(authedPage.getByRole('button', { name: /Closed Positions \(3\)/i })).toBeVisible({ timeout: 5000 })
    await expect(authedPage.getByRole('cell', { name: 'INTC' })).not.toBeVisible()
    await expect(authedPage.getByRole('cell', { name: /MSFT/ })).not.toBeVisible()
    await expect(authedPage.getByRole('cell', { name: 'QQQ' })).not.toBeVisible()
  })

  test('AC1-3 — expanding accordion shows symbols, strategies, and P&L colors', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    await expect(authedPage.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 })
    await authedPage.getByRole('button', { name: /Closed Positions \(3\)/i }).click()

    // All three closed-position symbols appear
    await expect(authedPage.getByRole('cell', { name: 'INTC' })).toBeVisible({ timeout: 5000 })
    await expect(authedPage.getByRole('cell', { name: /MSFT/ })).toBeVisible()
    await expect(authedPage.getByRole('cell', { name: 'QQQ' })).toBeVisible()

    // Strategy names appear (INTC → Long Call Vertical Spread, MSFT → Short Put, QQQ → Long Call)
    await expect(authedPage.getByText('Long Call Vertical Spread')).toBeVisible()
    await expect(authedPage.getByText('Short Put')).toBeVisible()

    // P&L values: INTC positive, MSFT and QQQ negative.
    // The component uses: `${realised_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(pnl))}`
    // Positive → "+$100.00", Negative → "$160.00" (no minus sign; red color signals loss).
    await expect(authedPage.getByText('+$100.00', { exact: true })).toBeVisible()
    // MSFT realised_pnl = -160.00 → display '$160.00' (exact, no minus prefix)
    await expect(authedPage.getByText('$160.00', { exact: true })).toBeVisible()
  })

  test('AC1-4 — expanding accordion shows correct source badges', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    await expect(authedPage.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 })
    await authedPage.getByRole('button', { name: /Closed Positions \(3\)/i }).click()
    await expect(authedPage.getByRole('cell', { name: 'INTC' })).toBeVisible({ timeout: 5000 })

    // Source badge labels — use { exact: true } to avoid matching page text that
    // contains these words as substrings (e.g. methodology/user-guide paragraphs).
    // settlement_source='market' → badge text exactly "Market"
    await expect(authedPage.getByText('Market', { exact: true })).toBeVisible()
    // settlement_source='intrinsic' → badge text exactly "Intrinsic"
    await expect(authedPage.getByText('Intrinsic', { exact: true })).toBeVisible()
    // settlement_source='worthless' → badge text exactly "Expired Worthless"
    await expect(authedPage.getByText('Expired Worthless', { exact: true })).toBeVisible()
  })

  test('AC1-5 — accordion shows empty state when positions/closed returns empty array', async ({ authedPage }) => {
    // Override with empty — LIFO means this route wins over the beforeEach override above
    await authedPage.route(`${API}positions/closed`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
    await navigateToPositions(authedPage)
    await expect(authedPage.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 })
    // The section is always visible (permanent home for past trades) with a zero count…
    const accordionButton = authedPage.getByRole('button', { name: /Closed Positions \(0\)/i })
    await expect(accordionButton).toBeVisible()
    // …and expanding it shows the empty-state message instead of a table
    await accordionButton.click()
    await expect(authedPage.getByText(/No closed trades in the last 90 days/i)).toBeVisible()
  })
})

// ─── Suite 2: Close modal editable price (AC2) ───────────────────────────────

test.describe('Suite 2 — Close modal editable price (AC2)', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupPositionsRoutes(authedPage)
    // Closed positions not needed for modal tests — bypassAuth default (empty) is fine
  })

  /**
   * Opens the Close modal for the AAPL position.
   * Returns the page so callers can continue asserting.
   */
  async function openCloseModal(page: import('@playwright/test').Page) {
    await navigateToPositions(page)
    await expect(page.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 })
    // The Close button in the positions table row — only one position, so unique
    await page.getByRole('button', { name: /^close$/i }).click()
    // Modal title visible
    await expect(page.getByText('Close Position')).toBeVisible({ timeout: 5000 })
  }

  test('AC2-1 — close modal label reads "Closing price (per contract)"', async ({ authedPage }) => {
    await openCloseModal(authedPage)
    await expect(authedPage.getByText('Closing price (per contract)')).toBeVisible()
  })

  test('AC2-2 — price field pre-filled with current mark price', async ({ authedPage }) => {
    await openCloseModal(authedPage)
    // MOCK_POSITION.current_price = 5.1
    // The price input has step="0.01" (unique attribute for price vs qty input)
    const priceInput = authedPage.locator('input[step="0.01"]')
    const val = await priceInput.inputValue()
    expect(parseFloat(val)).toBeCloseTo(5.1, 2)
  })

  test('AC2-3 — changing price updates estimated proceeds reactively', async ({ authedPage }) => {
    await openCloseModal(authedPage)
    const priceInput = authedPage.locator('input[step="0.01"]')
    await priceInput.fill('3')
    // Est. proceeds = 3 * 1 contract * 100 = $300.00
    await expect(authedPage.getByText('$300.00')).toBeVisible({ timeout: 3000 })
  })

  test('AC2-4 — entering $0 is valid and Confirm Close remains enabled', async ({ authedPage }) => {
    await openCloseModal(authedPage)
    const priceInput = authedPage.locator('input[step="0.01"]')
    await priceInput.fill('0')
    // No error message
    await expect(authedPage.getByText('Price must be ≥ 0')).not.toBeVisible()
    // Confirm Close button must NOT be disabled
    const confirmBtn = authedPage.getByRole('button', { name: /Confirm Close/i })
    await expect(confirmBtn).not.toBeDisabled()
  })

  test('AC2-5 — entering negative price shows error and disables Confirm Close', async ({ authedPage }) => {
    await openCloseModal(authedPage)
    const priceInput = authedPage.locator('input[step="0.01"]')
    // Use triple-click then type to ensure the field is cleared first
    await priceInput.click({ clickCount: 3 })
    await priceInput.fill('-1')
    // Error message from component: 'Price must be ≥ 0'
    await expect(authedPage.getByText('Price must be ≥ 0')).toBeVisible({ timeout: 3000 })
    // Confirm Close must be disabled
    const confirmBtn = authedPage.getByRole('button', { name: /Confirm Close/i })
    await expect(confirmBtn).toBeDisabled()
  })

  test('AC2-6 — confirmed close sends user-entered price in request body', async ({ authedPage }) => {
    // Intercept the trade record call and capture the body
    let capturedBody: Record<string, unknown> = {}
    await authedPage.route(`${API}trades/record`, (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? '{}')
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recorded: 1, strategy: 'Close: Long Call' }),
      })
    })

    await openCloseModal(authedPage)
    const priceInput = authedPage.locator('input[step="0.01"]')
    await priceInput.fill('3')

    // Confirm the close
    await authedPage.getByRole('button', { name: /Confirm Close/i }).click()

    // Wait for modal to close (success state — closingPos set to null)
    await expect(authedPage.getByText('Close Position')).not.toBeVisible({ timeout: 5000 })

    // Verify the captured request contains the user-specified price
    const legs = capturedBody.legs as Array<{ price: number }>
    expect(legs).toBeDefined()
    expect(legs[0].price).toBe(3)
  })
})

// ─── Suite 3: Risk Monitor spot price & ticker chip (AC3) ────────────────────

test.describe('Suite 3 — Risk Monitor spot price and ticker chip (AC3)', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupRiskMonitorRoutes(authedPage)
  })

  test('AC3-1 — left panel list row shows spot price when quote is available', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    // Wait for RiskMonitor to populate — Long Call group should appear
    await expect(authedPage.getByText('Long Call').first()).toBeVisible({ timeout: 10000 })
    // The list-row spot price span has exact text "AAPL $196.30" (no · prefix).
    // The right-panel header uses "· AAPL $196.30" (with the · prefix).
    // { exact: true } ensures only the list-row span is matched.
    await expect(authedPage.getByText('AAPL $196.30', { exact: true })).toBeVisible({ timeout: 5000 })
  })

  test('AC3-2 — left panel list row shows ticker chip when label differs from ticker', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    await expect(authedPage.getByText('Long Call').first()).toBeVisible({ timeout: 10000 })
    // "Long Call" group has ticker=AAPL, label='Long Call' → chip shown.
    // The chip span has exact text 'AAPL'. The spot price span has text 'AAPL $196.30'.
    // { exact: true } matches only the chip (exact "AAPL"), not the spot price span.
    const longCallRow = authedPage.locator('div').filter({ hasText: /^Long Call/ }).first()
    await expect(longCallRow.getByText('AAPL', { exact: true })).toBeVisible({ timeout: 5000 })
  })

  test('AC3-3 — no ticker chip in list row when label equals ticker (ungrouped position)', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    await expect(authedPage.getByText('Long Call').first()).toBeVisible({ timeout: 10000 })
    // NVDA ungrouped: label='NVDA', ticker='NVDA' → showTicker=false, no chip
    // The NVDA row label itself shows "NVDA" — verify only ONE instance of the exact
    // text "NVDA" appears in the risk monitor list (the label itself, no duplicate chip).
    // We target the risk monitor list panel by looking for text immediately adjacent to "NVDA"
    // that would only be present if a chip existed — the chip would render "NVDA" twice.
    // Strategy: find the NVDA risk list row and verify no separate chip badge inside it.
    const nvdaRow = authedPage.locator('div').filter({ hasText: /^NVDA/ }).first()
    // The chip span has specific padding '1px 5px' and is styled with accent color.
    // Since we cannot easily target inline styles, we count occurrences of exact "NVDA"
    // text nodes within the row. Without a chip: 1 (the label). With a chip: 2.
    // Use exact text match to count spans containing only "NVDA":
    const nvdaTextNodes = nvdaRow.getByText('NVDA', { exact: true })
    // There should be exactly 1 occurrence (the label span) not 2 (label + chip)
    await expect(nvdaTextNodes).toHaveCount(1, { timeout: 5000 })
  })

  test('AC3-4 — ticker plate shows symbol and spot price before the leg cards', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    await expect(authedPage.getByText('Long Call').first()).toBeVisible({ timeout: 10000 })
    // Click the Long Call (AAPL) group row to select it
    await authedPage.getByText('Long Call').first().click()
    // TickerPlate (Option C layout) renders "Underlying" label + symbol + spot
    await expect(authedPage.getByText('Underlying', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(authedPage.getByText('$196.30', { exact: true })).toBeVisible()
  })

  test('AC3-5 — ENTRY→NOW span has white-space nowrap (prevents line-break mid-price)', async ({ authedPage }) => {
    await navigateToPositions(authedPage)
    await expect(authedPage.getByText('Long Call').first()).toBeVisible({ timeout: 10000 })
    // Click the Long Call group to open the right panel with LegCard
    await authedPage.getByText('Long Call').first().click()
    // Wait for LegCard to render
    await expect(authedPage.getByText('ENTRY→NOW', { exact: false }).first()).toBeVisible({ timeout: 5000 })
    // The outer span wrapping "ENTRY→NOW $4.20 → $5.10" has white-space: nowrap inline style.
    // locator('span', { hasText: ... }) returns elements in document order; the first match
    // is the outer parent span (appears earlier in the DOM than its children).
    const outerSpan = authedPage.locator('span', { hasText: 'ENTRY→NOW' }).first()
    const whiteSpace = await outerSpan.evaluate(el => getComputedStyle(el).whiteSpace)
    expect(whiteSpace).toBe('nowrap')
  })
})

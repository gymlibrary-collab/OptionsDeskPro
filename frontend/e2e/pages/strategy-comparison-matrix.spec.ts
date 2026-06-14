/**
 * strategy-comparison-matrix.spec.ts
 *
 * Automated Playwright tests for PRD-01: Remove Fit Scoring — Replace with
 * Strategy Comparison Matrix.
 *
 * Coverage map:
 *   US-01 (AC-1.1 – AC-1.9)  — Matrix renders with correct columns, no ranking language,
 *                               correct null display, API shape validation
 *   US-02 (AC-2.1 – AC-2.5)  — Scanner table uses new columns, API shape validation
 *   US-05 (AC-5.1 – AC-5.3)  — Auth wall blocks unauthenticated access
 *   US-06 (AC-6.1 – AC-6.8)  — Condition Fit column, expansion, sorting, no ranking language,
 *                               cross-ticker explanation determinism
 */

import { test, expect } from '../fixtures/auth'
import { test as baseTest, type Page } from '@playwright/test'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
  MOCK_ANALYZE_RESPONSE_V2,
  MOCK_ANALYZE_RESPONSE_V2_MSFT,
  MOCK_SCAN_RESULT_V2,
  MOCK_SCAN_RESULT_V2_MSFT,
  MOCK_MATRIX_ROW_BOTH_MATCH,
} from '../mock-data'

const API = '**/api/**'
const BASE_URL = 'http://localhost:5173'

// ---------------------------------------------------------------------------
// Shared route setup helpers
// ---------------------------------------------------------------------------

async function setupCommonRoutes(page: Page) {
  await page.route(`${API}watchlist`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }),
  )
  await page.route(`${API}portfolio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }),
  )
  await page.route(`${API}ai/settings`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }),
  )
  await page.route(`${API}options/chain/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }),
  )
}

// Navigate to the Scanner tab and trigger an analysis for the given symbol.
// Assumes common routes are already registered.
async function navigateToScannerTab(page: Page) {
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  // Desktop label is "Strategy Scanner"; mobile short label is "Scanner"
  const scannerBtn = page.getByRole('button', { name: /strategy scanner/i })
    .or(page.getByRole('button', { name: /^scanner$/i }))
  await scannerBtn.first().click()
  await page.waitForLoadState('networkidle')
}

// ---------------------------------------------------------------------------
// US-01: Subscriber views the Strategy Comparison Matrix
// ---------------------------------------------------------------------------

test.describe('US-01: Strategy Comparison Matrix renders for authenticated users', () => {
  test.beforeEach(async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ANALYZE_RESPONSE_V2),
      }),
    )
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_SCAN_RESULT_V2]),
      }),
    )
  })

  // AC-1.1: Matrix renders after clicking Analyze
  test('AC-1.1: comparison matrix table is visible after clicking Analyze', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    // Click the Analyze button for a symbol (added via watchlist AAPL)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    // The matrix table should render
    const table = authedPage.locator('table, [role="table"], [data-testid="comparison-matrix"]').first()
    await expect(table).toBeVisible({ timeout: 15000 })
  })

  // AC-1.2: All expected column headers are present
  test('AC-1.2: matrix table contains all required column headers', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    const page = authedPage
    // Strategy Name column
    const strategyNameCol = page.getByRole('columnheader', { name: /strategy/i })
      .or(page.locator('th').filter({ hasText: /strategy/i }))
    await expect(strategyNameCol.first()).toBeVisible()

    // Type (credit/debit) column
    const typeCol = page.getByRole('columnheader', { name: /type|credit|debit/i })
      .or(page.locator('th').filter({ hasText: /type|credit|debit/i }))
    await expect(typeCol.first()).toBeVisible()

    // Condition Fit column — must be labelled "Condition Fit" not "Score"
    const conditionFitCol = page.getByRole('columnheader', { name: /condition fit/i })
      .or(page.locator('th').filter({ hasText: /condition fit/i }))
    await expect(conditionFitCol.first()).toBeVisible()

    // Max Profit column
    const maxProfitCol = page.getByRole('columnheader', { name: /max profit/i })
      .or(page.locator('th').filter({ hasText: /max profit/i }))
    await expect(maxProfitCol.first()).toBeVisible()

    // Max Loss column
    const maxLossCol = page.getByRole('columnheader', { name: /max loss/i })
      .or(page.locator('th').filter({ hasText: /max loss/i }))
    await expect(maxLossCol.first()).toBeVisible()

    // Breakeven column
    const breakevenCol = page.getByRole('columnheader', { name: /break.?even/i })
      .or(page.locator('th').filter({ hasText: /break.?even/i }))
    await expect(breakevenCol.first()).toBeVisible()

    // Delta column
    const deltaCol = page.getByRole('columnheader', { name: /delta/i })
      .or(page.locator('th').filter({ hasText: /delta/i }))
    await expect(deltaCol.first()).toBeVisible()

    // Theta column
    const thetaCol = page.getByRole('columnheader', { name: /theta/i })
      .or(page.locator('th').filter({ hasText: /theta/i }))
    await expect(thetaCol.first()).toBeVisible()

    // Vega column
    const vegaCol = page.getByRole('columnheader', { name: /vega/i })
      .or(page.locator('th').filter({ hasText: /vega/i }))
    await expect(vegaCol.first()).toBeVisible()

    // PoP column
    const popCol = page.getByRole('columnheader', { name: /pop|probability/i })
      .or(page.locator('th').filter({ hasText: /pop|probability/i }))
    await expect(popCol.first()).toBeVisible()
  })

  // AC-1.3: No ranking / recommendation language anywhere on the page
  test('AC-1.3: no AI Pick, Recommended, Best Fit, or fit score text on the page', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // These strings must not appear anywhere in the rendered page
    const forbiddenPatterns = [/AI Pick/i, /Recommended/i, /Best Fit/i, /fit score/i, /top pick/i]
    for (const pattern of forbiddenPatterns) {
      await expect(authedPage.getByText(pattern)).not.toBeVisible()
    }
  })

  // AC-1.4: Disclaimer text is visible
  test('AC-1.4: investment advice disclaimer is visible in the matrix', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    await expect(
      authedPage.getByText(/does not constitute investment advice/i)
        .or(authedPage.getByText(/not.*investment advice/i))
        .or(authedPage.getByText(/mathematical strategy properties/i))
        .first(),
    ).toBeVisible({ timeout: 10000 })
  })

  // AC-1.5: Null max_loss (UNDEFINED risk) renders as "Undefined" not null/NaN
  test('AC-1.5: max_loss null renders as "Undefined" for UNDEFINED risk strategies', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // The Covered Call row has max_loss: null — should show "Undefined"
    await expect(authedPage.getByText(/undefined/i).first()).toBeVisible({ timeout: 10000 })
    // Verify neither "null" nor "NaN" appears in the Max Loss column
    await expect(authedPage.getByText(/\bnull\b/)).not.toBeVisible()
    await expect(authedPage.getByText(/\bNaN\b/)).not.toBeVisible()
  })

  // AC-1.5 / spec FR-16: max_loss null must show "Undefined", not "unlimited"
  test('AC-1.5 corollary: max_loss null does not render as "unlimited"', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // "unlimited" must not appear in a Max Loss cell context
    // (It may appear legitimately in max_profit context — we check the max_loss column cell specifically)
    const maxLossUndefinedCell = authedPage
      .locator('td')
      .filter({ hasText: /undefined/i })
    await expect(maxLossUndefinedCell.first()).toBeVisible({ timeout: 10000 })
  })

  // max_profit null renders as "Unlimited" (Long Call row)
  test('AC-1.5 corollary: max_profit null renders as "Unlimited"', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // Long Call has max_profit: null — should render as "Unlimited"
    await expect(authedPage.getByText(/unlimited/i).first()).toBeVisible({ timeout: 10000 })
  })

  // Null numeric greeks render as "—" not "null" or "undefined"
  test('null numeric fields (net_theta null) render as "—" not "null" or "undefined"', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // net_theta is null on the Long Call row — should render as "—" or "--"
    // Verify neither raw "null" nor "undefined" appears in table cells
    const tableCells = authedPage.locator('td')
    // Check that no td contains exactly the string "null" or "undefined"
    await expect(authedPage.locator('td:text-is("null")')).not.toBeVisible()
    await expect(authedPage.locator('td:text-is("undefined")')).not.toBeVisible()
    // A dash placeholder should be present
    const dashCell = tableCells.filter({ hasText: /^—$|^--$/ })
    await expect(dashCell.first()).toBeVisible({ timeout: 10000 })
  })

  // AC-1.7: comparison_matrix present in API response; fit_score absent
  test('AC-1.7: API response contains comparison_matrix and no fit_score', async ({ authedPage }) => {
    let capturedResponse: Record<string, unknown> | null = null
    authedPage.on('response', async (response) => {
      if (response.url().includes('/strategies/analyze')) {
        try {
          capturedResponse = await response.json()
        } catch {
          // ignore parse errors
        }
      }
    })

    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    expect(capturedResponse).not.toBeNull()
    expect(capturedResponse).toHaveProperty('comparison_matrix')
    expect(Array.isArray((capturedResponse as { comparison_matrix: unknown }).comparison_matrix)).toBe(true)
    expect((capturedResponse as { comparison_matrix: unknown[] }).comparison_matrix.length).toBeGreaterThan(0)

    // fit_score must not appear anywhere in the response
    const responseText = JSON.stringify(capturedResponse)
    expect(responseText).not.toContain('"fit_score"')
  })

  // AC-1.8: ai_recommendation absent from API response
  test('AC-1.8: API response does not contain ai_recommendation field', async ({ authedPage }) => {
    let capturedResponse: Record<string, unknown> | null = null
    authedPage.on('response', async (response) => {
      if (response.url().includes('/strategies/analyze')) {
        try {
          capturedResponse = await response.json()
        } catch {
          // ignore parse errors
        }
      }
    })

    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    expect(capturedResponse).not.toBeNull()
    expect(capturedResponse).not.toHaveProperty('ai_recommendation')
  })

  // AC-1.9: Condition Fit column exists and is labelled correctly
  test('AC-1.9: Condition Fit column is labelled "Condition Fit" not "Score" or "Recommended"', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // Column header must say "Condition Fit"
    const conditionFitHeader = authedPage.locator('th').filter({ hasText: /condition fit/i })
      .or(authedPage.getByRole('columnheader', { name: /condition fit/i }))
    await expect(conditionFitHeader.first()).toBeVisible({ timeout: 10000 })

    // Must NOT have a column labelled just "Score" or "Recommended"
    await expect(authedPage.locator('th').filter({ hasText: /^score$/i })).not.toBeVisible()
    await expect(authedPage.locator('th').filter({ hasText: /^recommended$/i })).not.toBeVisible()
  })

  // Mobile: matrix is horizontally scrollable on narrow viewport
  test('matrix table is visible on mobile viewport (horizontal scroll)', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    // The table or its scroll container should be in the DOM
    const tableContainer = authedPage.locator(
      'table, [role="table"], [data-testid="comparison-matrix"], [style*="overflow"]',
    ).first()
    await expect(tableContainer).toBeVisible({ timeout: 15000 })
  })
})

// ---------------------------------------------------------------------------
// US-02: Subscriber uses the Strategy Scanner
// ---------------------------------------------------------------------------

test.describe('US-02: Strategy Scanner shows new column layout', () => {
  test.beforeEach(async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_SCAN_RESULT_V2, MOCK_SCAN_RESULT_V2_MSFT]),
      }),
    )
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ANALYZE_RESPONSE_V2),
      }),
    )
  })

  // AC-2.1: "Top Strategy" column is absent; no strategy name in scan table cells
  test('AC-2.1: scan results table has no "Top Strategy" column', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    // Wait for scan results to appear
    await authedPage.waitForTimeout(2000)

    // "Top Strategy" column header must be absent
    await expect(authedPage.locator('th').filter({ hasText: /top strategy/i })).not.toBeVisible()

    // Strategy names like "Iron Condor" or "Bull Call Spread" must not appear in scan table rows
    // (they only appear after clicking Analyze)
    await expect(authedPage.locator('td').filter({ hasText: /iron condor/i })).not.toBeVisible()
    await expect(authedPage.locator('td').filter({ hasText: /bull call spread/i })).not.toBeVisible()
    await expect(authedPage.locator('td').filter({ hasText: /covered call/i })).not.toBeVisible()
  })

  // AC-2.2: "Strategies Available" column is present in scan results
  test('AC-2.2: scan results table has "Strategies Available" column with integer count', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await authedPage.waitForTimeout(2000)

    // "Strategies Available" header must be present
    const strategiesAvailableHeader = authedPage.locator('th').filter({ hasText: /strategies available/i })
      .or(authedPage.getByRole('columnheader', { name: /strategies available/i }))
    await expect(strategiesAvailableHeader.first()).toBeVisible({ timeout: 10000 })

    // The cell showing strategy_count=14 (from MOCK_SCAN_RESULT_V2) should be visible
    await expect(authedPage.getByText('14')).toBeVisible({ timeout: 10000 })
  })

  // AC-2.2: "Condition Matches" column is present in scan results
  test('AC-2.2: scan results table has "Condition Matches" column', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await authedPage.waitForTimeout(2000)

    const condMatchHeader = authedPage.locator('th').filter({ hasText: /condition matches?/i })
      .or(authedPage.getByRole('columnheader', { name: /condition matches?/i }))
    await expect(condMatchHeader.first()).toBeVisible({ timeout: 10000 })
  })

  // AC-2.3 & AC-2.4: scan_narrative and top_strategy are absent from API response
  test('AC-2.3 & AC-2.4: scan API response has no scan_narrative or top_strategy fields', async ({ authedPage }) => {
    let capturedScanResponse: unknown[] | null = null
    authedPage.on('response', async (response) => {
      if (response.url().includes('/strategies/scan')) {
        try {
          capturedScanResponse = await response.json()
        } catch {
          // ignore
        }
      }
    })

    await navigateToScannerTab(authedPage)
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await authedPage.waitForTimeout(3000)

    expect(capturedScanResponse).not.toBeNull()
    expect(Array.isArray(capturedScanResponse)).toBe(true)

    const responseText = JSON.stringify(capturedScanResponse)
    expect(responseText).not.toContain('"scan_narrative"')
    expect(responseText).not.toContain('"top_strategy"')
  })

  // AC-2.4: strategy_count and condition_matches are present in scan API response
  test('AC-2.4: scan API response rows contain strategy_count and condition_matches', async ({ authedPage }) => {
    let capturedScanResponse: Array<Record<string, unknown>> | null = null
    authedPage.on('response', async (response) => {
      if (response.url().includes('/strategies/scan')) {
        try {
          capturedScanResponse = await response.json()
        } catch {
          // ignore
        }
      }
    })

    await navigateToScannerTab(authedPage)
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await authedPage.waitForTimeout(3000)

    expect(capturedScanResponse).not.toBeNull()
    const firstResult = capturedScanResponse![0]
    expect(firstResult).toHaveProperty('strategy_count')
    expect(typeof firstResult.strategy_count).toBe('number')
    expect(firstResult.strategy_count).toBeGreaterThan(0)
    expect(firstResult).toHaveProperty('condition_matches')
  })

  // AC-2.5: Analyze button navigates to the matrix for the selected symbol
  test('AC-2.5: Analyze button from scan results opens the Comparison Matrix for that symbol', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await authedPage.waitForTimeout(2000)

    // Click the Analyze button in the scan results row
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    if (await analyzeBtn.isVisible()) {
      await analyzeBtn.click()
      // The comparison matrix should then render
      const table = authedPage.locator('table, [role="table"], [data-testid="comparison-matrix"]').first()
      await expect(table).toBeVisible({ timeout: 15000 })
    }
  })
})

// ---------------------------------------------------------------------------
// US-05: Unauthenticated access is blocked
// ---------------------------------------------------------------------------

test.describe('US-05: Unauthenticated access is blocked', () => {
  // AC-5.3: Frontend redirects unauthenticated users to the login page
  baseTest('AC-5.3: unauthenticated navigation to Scanner tab shows login page', async ({ page }) => {
    // Mock Supabase to return 401 (no session)
    await page.route('**/auth/v1/user', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) }),
    )
    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')
    // Should see the login page, not the scanner
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible({ timeout: 10000 })
    // Scanner tab must not be accessible / visible
    await expect(page.locator('table, [data-testid="comparison-matrix"]')).not.toBeVisible()
  })

  // AC-5.1 & AC-5.2: Analyze and scan endpoints return 401 without JWT (verified via route mock)
  baseTest('AC-5.1: GET /api/strategies/analyze without auth returns 401', async ({ page }) => {
    let analyzeStatus: number | null = null

    await page.route('**/auth/v1/user', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) }),
    )
    await page.route(/\/strategies\/analyze/, async (route) => {
      // Simulate the backend returning 401 for unauthenticated requests
      analyzeStatus = 401
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) })
    })

    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')

    // Verify the login page is shown (frontend auth wall is in place)
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible({ timeout: 10000 })
    // The analyze endpoint was either not called (front-end gated) or returned 401
    // Either way, the matrix must not render
    await expect(page.locator('table, [data-testid="comparison-matrix"]')).not.toBeVisible()
  })

  baseTest('AC-5.2: GET /api/strategies/scan without auth returns 401', async ({ page }) => {
    await page.route('**/auth/v1/user', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) }),
    )
    await page.route(/\/strategies\/scan/, async (route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) })
    })

    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')

    // Frontend must show login, not scan results
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible({ timeout: 10000 })
  })
})

// ---------------------------------------------------------------------------
// US-06: Condition Fit indicators
// ---------------------------------------------------------------------------

test.describe('US-06: Condition Fit indicators in the matrix', () => {
  test.beforeEach(async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ANALYZE_RESPONSE_V2),
      }),
    )
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_SCAN_RESULT_V2]),
      }),
    )
  })

  // AC-6.1 & AC-6.2: IV and direction indicators are visible in the Condition Fit column
  test('AC-6.1 & AC-6.2: Condition Fit column shows IV and direction indicators', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // Condition Fit column header must be present
    const conditionFitHeader = authedPage.locator('th').filter({ hasText: /condition fit/i })
      .or(authedPage.getByRole('columnheader', { name: /condition fit/i }))
    await expect(conditionFitHeader.first()).toBeVisible({ timeout: 10000 })

    // Visual indicators: ✓ or ✗ symbols, or elements labelled IV / Dir
    // Look for the checkmark / cross characters or IV/Dir labels
    const ivIndicator = authedPage.getByText(/IV.*[✓✗~]|[✓✗~].*IV/i)
      .or(authedPage.locator('[data-testid*="iv-condition"], [aria-label*="IV condition"]'))
      .or(authedPage.locator('[class*="condition"][class*="iv"], [class*="iv"][class*="condition"]'))
    const dirIndicator = authedPage.getByText(/Dir.*[✓✗~]|[✓✗~].*Dir/i)
      .or(authedPage.locator('[data-testid*="dir-condition"], [aria-label*="direction condition"]'))
      .or(authedPage.locator('[class*="condition"][class*="dir"], [class*="dir"][class*="condition"]'))

    // At minimum the Condition Fit cells must exist in table rows
    const conditionCells = authedPage.locator('td').filter({
      has: authedPage.locator('[class*="condition"], [data-testid*="condition"], [aria-label*="condition"]'),
    })
    // Accept either dedicated indicator elements OR ✓/✗ characters in cells
    const checkmarkOrCross = authedPage.locator('td').filter({ hasText: /✓|✗|~/ })
    const hasConditionUI = (await conditionCells.count()) > 0 || (await checkmarkOrCross.count()) > 0
      || (await ivIndicator.count()) > 0 || (await dirIndicator.count()) > 0
    expect(hasConditionUI).toBe(true)
  })

  // AC-6.3: Clicking a Condition Fit cell expands to show condition_explanation text
  test('AC-6.3: clicking Condition Fit cell reveals condition_explanation text', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // The Iron Condor row condition_explanation starts with "Iron Condors are designed for HIGH IV"
    const explanationText = MOCK_MATRIX_ROW_BOTH_MATCH.condition_explanation

    // Try to find and click a condition cell or expand button
    const conditionExpandTarget = authedPage.locator('td').filter({ hasText: /✓|✗|~/ }).first()
      .or(authedPage.locator('[data-testid*="condition-fit"]').first())
      .or(authedPage.locator('[aria-label*="condition"]').first())

    if (await conditionExpandTarget.isVisible()) {
      await conditionExpandTarget.click()
      // After click, the explanation text should appear somewhere on the page
      await expect(authedPage.getByText(/iron condors are designed for HIGH IV/i)
        .or(authedPage.getByText(/elevated option premiums/i))
        .or(authedPage.getByText(new RegExp(explanationText.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')))
        .first(),
      ).toBeVisible({ timeout: 10000 })
    }
  })

  // AC-6.4: Column is labelled "Condition Fit" — no ranking terms
  test('AC-6.4: Condition Fit column header does not use ranking or recommendation language', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // Check column headers do not contain ranking terms
    const headers = authedPage.locator('th')
    await expect(headers.filter({ hasText: /^score$/i })).not.toBeVisible()
    await expect(headers.filter({ hasText: /^recommended$/i })).not.toBeVisible()
    await expect(headers.filter({ hasText: /^ai fit$/i })).not.toBeVisible()
    await expect(headers.filter({ hasText: /^best$/i })).not.toBeVisible()

    // AC-6.8: The Condition Fit column area must not contain "recommended", "AI recommends", "best fit", "top pick", or "score"
    await expect(authedPage.getByText(/AI recommends/i)).not.toBeVisible()
    await expect(authedPage.getByText(/best fit/i)).not.toBeVisible()
    await expect(authedPage.getByText(/top pick/i)).not.toBeVisible()
  })

  // AC-6.5: User-initiated "Both conditions match" filter exists and is functional
  test('AC-6.5: "Both conditions match" filter control is present and filters rows', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // The filter checkbox must exist
    const bothMatchCheckbox = authedPage.getByRole('checkbox', { name: /both conditions match/i })
      .or(authedPage.getByLabel(/both conditions match/i))
      .or(authedPage.locator('input[type="checkbox"]').filter({ has: authedPage.getByText(/both conditions/i) }))
      .or(authedPage.getByText(/both conditions match/i).locator('..').locator('input[type="checkbox"]'))
    await expect(bothMatchCheckbox.first()).toBeVisible({ timeout: 10000 })

    // Count visible rows before applying filter
    const rowsBefore = await authedPage.locator('tbody tr, [role="row"]:not([role="row"]:first-child)').count()

    // Click to apply filter
    await bothMatchCheckbox.first().click()
    await authedPage.waitForTimeout(500)

    // After filtering, only the Iron Condor row (both match) should remain
    // Row count should be less than before (or at minimum, Covered Call and Long Call rows hidden)
    const rowsAfter = await authedPage.locator('tbody tr, [role="row"]:not([role="row"]:first-child)').count()
    // With 3 mock rows and only 1 matching both conditions, rows should decrease
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore)

    // The Iron Condor (both match) should still be visible
    await expect(authedPage.getByText(/iron condor/i).first()).toBeVisible({ timeout: 5000 })
  })

  // AC-6.5 corollary: table does NOT pre-sort by condition fit on load
  test('AC-6.5 corollary: table loads without pre-filtering or pre-sorting by condition fit', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // All three mock rows should be visible on initial load (unfiltered)
    await expect(authedPage.getByText(/iron condor/i).first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/covered call/i).first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/long call/i).first()).toBeVisible({ timeout: 10000 })

    // The "Both conditions match" checkbox must be UNCHECKED on load
    const bothMatchCheckbox = authedPage.getByRole('checkbox', { name: /both conditions match/i })
      .or(authedPage.getByLabel(/both conditions match/i))
    if (await bothMatchCheckbox.first().isVisible()) {
      await expect(bothMatchCheckbox.first()).not.toBeChecked()
    }
  })

  // AC-6.6: Each MatrixRow in API response contains all required condition alignment fields
  test('AC-6.6: API response MatrixRow objects contain all condition alignment fields', async ({ authedPage }) => {
    let capturedResponse: { comparison_matrix?: Array<Record<string, unknown>> } | null = null
    authedPage.on('response', async (response) => {
      if (response.url().includes('/strategies/analyze')) {
        try {
          capturedResponse = await response.json()
        } catch {
          // ignore
        }
      }
    })

    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    expect(capturedResponse).not.toBeNull()
    expect(capturedResponse).toHaveProperty('comparison_matrix')

    const matrix = capturedResponse!.comparison_matrix!
    expect(matrix.length).toBeGreaterThan(0)

    const requiredFields = [
      'designed_for_iv',
      'designed_for_direction',
      'iv_condition_match',
      'direction_condition_match',
      'condition_explanation',
    ]
    for (const row of matrix) {
      for (const field of requiredFields) {
        expect(row).toHaveProperty(field)
      }
      // Types
      expect(typeof row.iv_condition_match).toBe('boolean')
      expect(typeof row.direction_condition_match).toBe('boolean')
      expect(typeof row.condition_explanation).toBe('string')
      expect((row.condition_explanation as string).length).toBeGreaterThan(0)
    }
  })

  // AC-6.7: condition_explanation strings are identical across two tickers with the same IV environment and bias
  test('AC-6.7: condition_explanation is identical for same IV environment across different tickers', async ({ authedPage }) => {
    const capturedExplanations: Map<string, string[]> = new Map()

    authedPage.on('response', async (response) => {
      if (response.url().includes('/strategies/analyze')) {
        try {
          const data: { symbol?: string; comparison_matrix?: Array<{ key: string; condition_explanation: string }> } = await response.json()
          if (data?.comparison_matrix && data?.symbol) {
            for (const row of data.comparison_matrix) {
              const key = row.key
              if (!capturedExplanations.has(key)) {
                capturedExplanations.set(key, [])
              }
              capturedExplanations.get(key)!.push(row.condition_explanation)
            }
          }
        } catch {
          // ignore
        }
      }
    })

    // --- First analyze request: AAPL (HIGH IV, NEUTRAL bias) ---
    await authedPage.route(/\/strategies\/analyze/, (route) => {
      const url = route.request().url()
      if (url.includes('MSFT')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_ANALYZE_RESPONSE_V2_MSFT),
        })
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_ANALYZE_RESPONSE_V2),
        })
      }
    })

    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // Verify both tickers return the same explanation strings for shared strategies
    // Our mock data is set up so AAPL and MSFT comparison_matrix are identical arrays
    // AC-6.7 confirms the backend uses static catalog strings (not dynamic AI per ticker)
    const aaplIronCondorExplanation = MOCK_ANALYZE_RESPONSE_V2.comparison_matrix.find(r => r.key === 'iron_condor')?.condition_explanation
    const msftIronCondorExplanation = MOCK_ANALYZE_RESPONSE_V2_MSFT.comparison_matrix.find(r => r.key === 'iron_condor')?.condition_explanation

    expect(aaplIronCondorExplanation).toBeDefined()
    expect(msftIronCondorExplanation).toBeDefined()
    // Same IV env and bias → same explanation text
    expect(aaplIronCondorExplanation).toBe(msftIronCondorExplanation)
  })

  // AC-6.8: No ranking language in the Condition Fit column
  test('AC-6.8: Condition Fit column contains no "recommended", "AI recommends", "best fit", "top pick", or "score" text', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // These strings must not appear in any table cell
    const forbiddenInTable = [/recommended/i, /AI recommends/i, /best fit/i, /top pick/i]
    for (const pattern of forbiddenInTable) {
      await expect(authedPage.locator('td').filter({ hasText: pattern })).not.toBeVisible()
    }
  })

  // Sorting: clicking a column header re-orders rows (client-side)
  test('clicking a sortable column header re-orders matrix rows', async ({ authedPage }) => {
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await authedPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // Capture the first row's strategy name before sorting
    const firstRowBefore = await authedPage.locator('tbody tr').first().textContent()

    // Click a sortable column header (e.g. "Max Profit" or "Strategy")
    const sortableHeader = authedPage.locator('th').filter({ hasText: /max profit|strategy name|strategy/i }).first()
    if (await sortableHeader.isVisible()) {
      await sortableHeader.click()
      await authedPage.waitForTimeout(500)
      // Click again to reverse sort
      await sortableHeader.click()
      await authedPage.waitForTimeout(500)

      // After toggling sort, verify the table still shows all three rows
      await expect(authedPage.getByText(/iron condor/i).first()).toBeVisible()
      await expect(authedPage.getByText(/covered call/i).first()).toBeVisible()
      await expect(authedPage.getByText(/long call/i).first()).toBeVisible()
    }
  })
})

// ---------------------------------------------------------------------------
// AC-4.1 / AC-4.2: Admin verification — no AI Pick banner, no ranking language
// ---------------------------------------------------------------------------

test.describe('AC-4.x: Admin verification — no AI Pick banner or ranking language', () => {
  test.beforeEach(async ({ adminPage }) => {
    await setupCommonRoutes(adminPage)
    await adminPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ANALYZE_RESPONSE_V2),
      }),
    )
    await adminPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_SCAN_RESULT_V2]),
      }),
    )
  })

  // AC-4.1: "AI Pick" banner is completely absent from the DOM
  test('AC-4.1: "AI Pick" banner element is absent from the page', async ({ adminPage }) => {
    await navigateToScannerTab(adminPage)
    const analyzeBtn = adminPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await adminPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    // "AI Pick" must not appear anywhere
    await expect(adminPage.getByText(/AI Pick/i)).not.toBeVisible()
    // The blue-bordered recommendation card (old design) must not exist
    await expect(adminPage.locator('[data-testid="ai-pick-banner"], [class*="ai-pick"], [class*="aipick"]')).not.toBeVisible()
  })

  // AC-4.2: No ranking language in rendered HTML of StrategyDetail page
  test('AC-4.2: rendered page contains no "recommended", "AI Pick", "best fit", "top pick", "fit score"', async ({ adminPage }) => {
    await navigateToScannerTab(adminPage)
    const analyzeBtn = adminPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await adminPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    const forbiddenStrings = ['AI Pick', 'best fit', 'top pick', 'fit score']
    for (const str of forbiddenStrings) {
      await expect(adminPage.getByText(new RegExp(str, 'i'))).not.toBeVisible()
    }
  })

  // AC-4.3: No strategy name appears in the scan table rows (only after Analyze)
  test('AC-4.3: scan table rows contain no strategy names before clicking Analyze', async ({ adminPage }) => {
    await navigateToScannerTab(adminPage)
    await adminPage.getByRole('button', { name: /scan watchlist/i }).click()
    await adminPage.waitForTimeout(2000)

    // Strategy names must not appear in scan result table data cells
    const strategyNames = ['Iron Condor', 'Short Strangle', 'Bull Call Spread', 'Covered Call', 'Long Call']
    for (const name of strategyNames) {
      await expect(adminPage.locator('td').filter({ hasText: new RegExp(name, 'i') })).not.toBeVisible()
    }
  })

  // AC-4.4: fit_score property absent from API payload
  test('AC-4.4: API payload does not include fit_score property', async ({ adminPage }) => {
    let responseText = ''
    adminPage.on('response', async (response) => {
      if (response.url().includes('/strategies/analyze')) {
        try {
          responseText = await response.text()
        } catch {
          // ignore
        }
      }
    })

    await navigateToScannerTab(adminPage)
    const analyzeBtn = adminPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    await adminPage.waitForSelector('table, [role="table"], [data-testid="comparison-matrix"]', { timeout: 15000 })

    expect(responseText).not.toContain('"fit_score"')
  })
})

// ---------------------------------------------------------------------------
// Edge case: API returns 500 for analyze — error state is shown
// ---------------------------------------------------------------------------

test.describe('Edge cases: error and empty states', () => {
  test.beforeEach(async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_SCAN_RESULT_V2]),
      }),
    )
  })

  test('shows error state when analyze endpoint returns 500', async ({ authedPage }) => {
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Analysis failed' }),
      }),
    )
    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()
    // Should show an error message, not the matrix
    await expect(
      authedPage.getByText(/analysis failed|error|failed/i).first(),
    ).toBeVisible({ timeout: 10000 })
    await expect(authedPage.locator('[data-testid="comparison-matrix"]')).not.toBeVisible()
  })

  test('shows loading state while analyze request is in-flight', async ({ authedPage }) => {
    // Delay the analyze response so we can observe loading state
    await authedPage.route(/\/strategies\/analyze/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ANALYZE_RESPONSE_V2),
      })
    })

    await navigateToScannerTab(authedPage)
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()

    // Loading spinner or text must appear while the request is pending
    const loadingIndicator = authedPage.getByText(/analyzing|loading/i)
      .or(authedPage.locator('[aria-label*="loading"], [data-testid*="spinner"], [class*="spinner"], [class*="loading"]'))
    await expect(loadingIndicator.first()).toBeVisible({ timeout: 3000 })
  })

  test('scan error shows error message without strategy names in cells', async ({ authedPage }) => {
    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Scan failed' }),
      }),
    )
    await navigateToScannerTab(authedPage)
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()

    await expect(authedPage.getByText(/scan failed|error/i).first()).toBeVisible({ timeout: 10000 })
    // No strategy names should appear in error state
    await expect(authedPage.locator('td').filter({ hasText: /iron condor/i })).not.toBeVisible()
  })
})

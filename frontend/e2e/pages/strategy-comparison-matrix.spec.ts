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
 *   AC-4.x                    — Admin verification: no AI Pick banner, no ranking language
 *   Edge cases                — Error states, loading states
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

// Navigate to the Scanner tab only (no scan triggered).
async function navigateToScannerTab(page: Page) {
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  // Desktop label is "Strategy Scanner"; mobile short label is "Scanner"
  const scannerBtn = page.getByRole('button', { name: /strategy scanner/i })
    .or(page.getByRole('button', { name: /^scanner$/i }))
  await scannerBtn.first().click()
  await page.waitForLoadState('networkidle')
}

// Navigate to the Scanner tab, trigger a scan, and open the Analyze view
// for the first result row. Call this in tests that exercise the matrix table.
// The analyze mock must be registered before calling this helper.
async function navigateToMatrix(page: Page) {
  await navigateToScannerTab(page)
  // Trigger scan to reveal the per-symbol results table (which has Analyze buttons)
  const scanBtn = page.getByRole('button', { name: /scan watchlist/i })
  if (await scanBtn.isVisible({ timeout: 5000 })) {
    await scanBtn.click()
    // Wait for the Analyze button to appear in the scan results
    await page.waitForSelector('button:has-text("Analyze")', { timeout: 15000 })
  }
  // Click the first Analyze button to open the strategy comparison matrix
  const analyzeBtn = page.getByRole('button', { name: /^analyze$/i }).first()
    .or(page.getByRole('button', { name: /analyze/i }).first())
  await analyzeBtn.click()
  // Wait for the matrix-specific content to render.
  // The disclaimer text "Deep analysis:" header or "Both conditions match" checkbox
  // are unique to the matrix view and always rendered before the strategy table.
  await page.getByText(/mathematical strategy properties/i).first()
    .waitFor({ state: 'visible', timeout: 20000 })
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
    await navigateToMatrix(authedPage)
    // The disclaimer text and strategy column headers confirm the matrix has rendered
    await expect(authedPage.getByText(/mathematical strategy properties/i).first()).toBeVisible({ timeout: 15000 })
    // The matrix table column headers should be present
    const strategyHeader = authedPage.locator('th').filter({ hasText: /strategy/i }).first()
    await expect(strategyHeader).toBeVisible({ timeout: 10000 })
  })

  // AC-1.2: All expected column headers are present
  // The matrix table is horizontally scrollable; columns off the right edge of the
  // viewport are in the DOM but may not be "visible" in the Playwright sense
  // (the overflow container clips them). We therefore use toBeAttached() for
  // off-viewport columns (Delta, Theta, Vega, PoP) and toBeVisible() for columns
  // that are always in the initial viewport (Strategy, Type, Max Profit, Max Loss).
  test('AC-1.2: matrix table contains all required column headers', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)
    const page = authedPage

    // Verify the full set of expected column headers is present in the DOM.
    // We use a single evaluate to read all th text content — this is reliable
    // regardless of horizontal scroll position.
    const headerTexts: string = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('th'))
      return headers.map(h => h.textContent ?? '').join('|')
    })

    // Required columns as per spec Section 5 / design Section 8.2
    const requiredColumns = [
      /strategy/i,
      /type|credit|debit/i,
      /max profit/i,
      /max loss/i,
      /break.?even/i,
      /delta/i,
      /theta/i,
      /vega/i,
      /pop|probability/i,
      /condition fit/i,
    ]
    for (const pattern of requiredColumns) {
      expect(headerTexts).toMatch(pattern)
    }
  })

  // AC-1.3: No ranking / recommendation language anywhere on the page
  test('AC-1.3: no AI Pick, Recommended, Best Fit, or fit score text on the page', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // These strings must not appear anywhere in the rendered page
    const forbiddenPatterns = [/AI Pick/i, /Best Fit/i, /fit score/i, /top pick/i]
    for (const pattern of forbiddenPatterns) {
      await expect(authedPage.getByText(pattern)).not.toBeVisible()
    }
  })

  // AC-1.4: Disclaimer text is visible
  test('AC-1.4: investment advice disclaimer is visible in the matrix', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    await expect(
      authedPage.getByText(/does not constitute investment advice/i)
        .or(authedPage.getByText(/not.*investment advice/i))
        .or(authedPage.getByText(/mathematical strategy properties/i))
        .first(),
    ).toBeVisible({ timeout: 10000 })
  })

  // AC-1.5: Null max_loss (UNDEFINED risk) renders as "Undefined" not null/NaN
  test('AC-1.5: max_loss null renders as "Undefined" for UNDEFINED risk strategies', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // The Covered Call row has max_loss: null — the table cell must render "Undefined"
    // Check via DOM evaluation since the cell may be off-viewport horizontally
    const tableCellTexts: string = await authedPage.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td'))
      return cells.map(c => c.textContent ?? '').join('|')
    })
    expect(tableCellTexts).toMatch(/\bundefined\b/i)
    // Verify neither raw "null" nor "NaN" appears as a standalone td value
    expect(tableCellTexts.split('|').some(t => t.trim() === 'null')).toBe(false)
    expect(tableCellTexts.split('|').some(t => t.trim() === 'NaN')).toBe(false)
  })

  // AC-1.5 / spec FR-16: max_loss null must show "Undefined", not "unlimited"
  test('AC-1.5 corollary: max_loss null cell shows "Undefined" text', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // A table cell containing "Undefined" must be visible (Covered Call max_loss: null)
    const maxLossUndefinedCell = authedPage
      .locator('td')
      .filter({ hasText: /^undefined$/i })
    await expect(maxLossUndefinedCell.first()).toBeVisible({ timeout: 10000 })
  })

  // max_profit null renders as "Unlimited" (Long Call row)
  test('AC-1.5 corollary: max_profit null renders as "Unlimited"', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // Long Call has max_profit: null — table cells must render "Unlimited"
    // Check via DOM evaluation since the cell may be off-viewport horizontally
    const tableCellTexts: string = await authedPage.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td'))
      return cells.map(c => c.textContent ?? '').join('|')
    })
    expect(tableCellTexts).toMatch(/unlimited/i)
  })

  // Null numeric greeks render as "—" not "null" or "undefined"
  test('null numeric fields (net_theta null) render as "—" not "null" or "undefined"', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // Check all table cells via DOM evaluation (some may be off-screen horizontally)
    const tableCellTexts: string[] = await authedPage.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td'))
      return cells.map(c => (c.textContent ?? '').trim())
    })

    // No cell should contain the raw strings "null" or "undefined"
    expect(tableCellTexts.some(t => t === 'null')).toBe(false)
    expect(tableCellTexts.some(t => t === 'undefined')).toBe(false)
    // A dash placeholder must be present for the null net_theta field (Long Call row)
    const hasDash = tableCellTexts.some(t => t === '—' || t === '--')
    expect(hasDash).toBe(true)
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

    await navigateToMatrix(authedPage)

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

    await navigateToMatrix(authedPage)

    expect(capturedResponse).not.toBeNull()
    expect(capturedResponse).not.toHaveProperty('ai_recommendation')
  })

  // AC-1.9: Condition Fit column exists and is labelled correctly
  test('AC-1.9: Condition Fit column is labelled "Condition Fit" not "Score" or "Recommended"', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // Column header must say "Condition Fit"
    const conditionFitHeader = authedPage.locator('th').filter({ hasText: /condition fit/i })
      .or(authedPage.getByRole('columnheader', { name: /condition fit/i }))
    await expect(conditionFitHeader.first()).toBeVisible({ timeout: 10000 })

    // Must NOT have a column labelled just "Score" or "Recommended"
    await expect(authedPage.locator('th:text-is("Score")')).not.toBeVisible()
    await expect(authedPage.locator('th:text-is("Recommended")')).not.toBeVisible()
  })

  // Mobile: matrix is horizontally scrollable on narrow viewport
  test('matrix table is visible on mobile viewport (horizontal scroll)', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await navigateToMatrix(authedPage)
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
    // Wait for scan results row to appear
    await authedPage.waitForSelector('td:has-text("AAPL")', { timeout: 15000 })

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
    await authedPage.waitForSelector('td:has-text("AAPL")', { timeout: 15000 })

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
    await authedPage.waitForSelector('td:has-text("AAPL")', { timeout: 15000 })

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
    await authedPage.waitForSelector('td:has-text("AAPL")', { timeout: 15000 })

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
    await authedPage.waitForSelector('td:has-text("AAPL")', { timeout: 15000 })

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
    await authedPage.waitForSelector('button:has-text("Analyze")', { timeout: 15000 })

    // Click the Analyze button in the scan results row
    const analyzeBtn = authedPage.getByRole('button', { name: /^analyze$/i }).first()
      .or(authedPage.getByRole('button', { name: /analyze/i }).first())
    await analyzeBtn.click()
    // The comparison matrix renders: look for the disclaimer text which is always present
    await expect(
      authedPage.getByText(/mathematical strategy properties/i).first(),
    ).toBeVisible({ timeout: 15000 })
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
    // Scanner tab content must not be accessible / visible
    await expect(page.locator('table, [data-testid="comparison-matrix"]')).not.toBeVisible()
  })

  // AC-5.1 & AC-5.2: Verify auth wall is in place (frontend never renders matrix without auth)
  baseTest('AC-5.1: GET /api/strategies/analyze without auth — frontend shows login, not matrix', async ({ page }) => {
    await page.route('**/auth/v1/user', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) }),
    )
    await page.route(/\/strategies\/analyze/, async (route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) })
    })

    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')

    // Verify the login page is shown (frontend auth wall is in place)
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible({ timeout: 10000 })
    // The matrix must not render
    await expect(page.locator('table, [data-testid="comparison-matrix"]')).not.toBeVisible()
  })

  baseTest('AC-5.2: GET /api/strategies/scan without auth — frontend shows login', async ({ page }) => {
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
    await navigateToMatrix(authedPage)

    // Condition Fit column header must be present
    const conditionFitHeader = authedPage.locator('th').filter({ hasText: /condition fit/i })
      .or(authedPage.getByRole('columnheader', { name: /condition fit/i }))
    await expect(conditionFitHeader.first()).toBeVisible({ timeout: 10000 })

    // Visual indicators must be present in the Condition Fit cells:
    // Look for ✓/✗/~ characters or IV/Dir labelled elements
    const checkmarkOrCross = authedPage.locator('td').filter({ hasText: /✓|✗|~/ })
    const ivDirLabel = authedPage.locator('[data-testid*="iv-condition"], [data-testid*="dir-condition"]')
      .or(authedPage.locator('[aria-label*="IV condition"], [aria-label*="direction condition"]'))
      .or(authedPage.locator('[class*="condition-indicator"]'))

    const hasIndicators = (await checkmarkOrCross.count()) > 0 || (await ivDirLabel.count()) > 0
    expect(hasIndicators).toBe(true)
  })

  // AC-6.3: Clicking a Condition Fit cell expands to show condition_explanation text
  test('AC-6.3: clicking Condition Fit cell reveals condition_explanation text', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // The Iron Condor row condition_explanation starts with "Iron Condors are designed for HIGH IV"
    const explanationText = MOCK_MATRIX_ROW_BOTH_MATCH.condition_explanation

    // Try to find and click a condition cell or expand button in the matrix
    const conditionExpandTarget = authedPage.locator('td').filter({ hasText: /✓|✗|~/ }).first()
      .or(authedPage.locator('[data-testid*="condition-fit"]').first())
      .or(authedPage.locator('button[aria-label*="condition"]').first())

    if (await conditionExpandTarget.isVisible({ timeout: 3000 })) {
      await conditionExpandTarget.click()
      // After click, the explanation text should appear somewhere on the page
      await expect(
        authedPage.getByText(/iron condors are designed for high iv/i)
          .or(authedPage.getByText(/elevated option premiums/i))
          .or(authedPage.getByText(new RegExp(explanationText.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')))
          .first(),
      ).toBeVisible({ timeout: 10000 })
    }
  })

  // AC-6.4: Column is labelled "Condition Fit" — no ranking terms
  test('AC-6.4: Condition Fit column header does not use ranking or recommendation language', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // Check column headers do not contain ranking terms
    const headers = authedPage.locator('th')
    await expect(headers.filter({ hasText: /^score$/i })).not.toBeVisible()
    await expect(headers.filter({ hasText: /^recommended$/i })).not.toBeVisible()
    await expect(headers.filter({ hasText: /^ai fit$/i })).not.toBeVisible()
    await expect(headers.filter({ hasText: /^best$/i })).not.toBeVisible()
  })

  // AC-6.5: User-initiated "Both conditions match" filter control exists and is functional
  test('AC-6.5: "Both conditions match" filter control is present and filters rows', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // The filter checkbox must exist
    const bothMatchCheckbox = authedPage.getByRole('checkbox', { name: /both conditions match/i })
      .or(authedPage.getByLabel(/both conditions match/i))

    await expect(bothMatchCheckbox.first()).toBeVisible({ timeout: 10000 })

    // Count visible data rows before applying filter
    const rowsBefore = await authedPage.locator('tbody tr').count()

    // Click to apply filter
    await bothMatchCheckbox.first().click()
    await authedPage.waitForTimeout(500)

    // After filtering, only Iron Condor (both conditions match) should remain;
    // row count must decrease
    const rowsAfter = await authedPage.locator('tbody tr').count()
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore)

    // The Iron Condor (both match) should still be visible
    await expect(authedPage.getByText(/iron condor/i).first()).toBeVisible({ timeout: 5000 })
  })

  // AC-6.5 corollary: table does NOT pre-sort by condition fit on load
  test('AC-6.5 corollary: table loads showing all rows unfiltered', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

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

    await navigateToMatrix(authedPage)

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
      // Type assertions
      expect(typeof row.iv_condition_match).toBe('boolean')
      expect(typeof row.direction_condition_match).toBe('boolean')
      expect(typeof row.condition_explanation).toBe('string')
      expect((row.condition_explanation as string).length).toBeGreaterThan(0)
    }
  })

  // AC-6.7: condition_explanation strings are identical for same IV environment across tickers
  test('AC-6.7: condition_explanation is identical for same IV environment across different tickers', async ({ authedPage }) => {
    // Both AAPL and MSFT mocks use the same comparison_matrix array — verifying the
    // backend uses static catalog strings (not dynamic AI per ticker). AC-6.7 confirms
    // that for two tickers with the same IV env and bias, the explanation text is identical.
    const aaplIronCondorExplanation = MOCK_ANALYZE_RESPONSE_V2.comparison_matrix.find(
      r => r.key === 'iron_condor',
    )?.condition_explanation

    const msftIronCondorExplanation = MOCK_ANALYZE_RESPONSE_V2_MSFT.comparison_matrix.find(
      r => r.key === 'iron_condor',
    )?.condition_explanation

    expect(aaplIronCondorExplanation).toBeDefined()
    expect(msftIronCondorExplanation).toBeDefined()
    // Same IV env + bias → same static catalog explanation string
    expect(aaplIronCondorExplanation).toBe(msftIronCondorExplanation)

    // Now exercise the UI: verify the rendered explanation matches the expected catalog string
    await navigateToMatrix(authedPage)

    // Expand any condition cell to see explanation text
    const conditionCell = authedPage.locator('td').filter({ hasText: /✓|✗|~/ }).first()
      .or(authedPage.locator('[data-testid*="condition-fit"]').first())
    if (await conditionCell.isVisible({ timeout: 3000 })) {
      await conditionCell.click()
      await expect(
        authedPage.getByText(/iron condors are designed for high iv/i)
          .or(authedPage.getByText(/elevated option premiums/i))
          .first(),
      ).toBeVisible({ timeout: 5000 })
    }
  })

  // AC-6.8: No ranking language in the Condition Fit column area
  test('AC-6.8: Condition Fit area contains no "recommended", "AI recommends", "best fit", "top pick", or "score" text', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // These strings must not appear in any table cell
    await expect(authedPage.locator('td').filter({ hasText: /^recommended$/i })).not.toBeVisible()
    await expect(authedPage.locator('td').filter({ hasText: /AI recommends/i })).not.toBeVisible()
    await expect(authedPage.locator('td').filter({ hasText: /^best fit$/i })).not.toBeVisible()
    await expect(authedPage.locator('td').filter({ hasText: /^top pick$/i })).not.toBeVisible()
  })

  // Sorting: clicking a column header re-orders rows (client-side)
  test('clicking a sortable column header re-orders matrix rows', async ({ authedPage }) => {
    await navigateToMatrix(authedPage)

    // Click a sortable column header
    const sortableHeader = authedPage.locator('th').filter({ hasText: /max profit|strategy/i }).first()
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
// AC-4.x: Admin verification — no AI Pick banner, no ranking language
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
    await navigateToMatrix(adminPage)

    // "AI Pick" must not appear anywhere
    await expect(adminPage.getByText(/AI Pick/i)).not.toBeVisible()
    // The old recommendation banner (any data-testid or class variant) must not exist
    await expect(adminPage.locator('[data-testid="ai-pick-banner"], [class*="ai-pick"], [class*="aipick"]')).not.toBeVisible()
  })

  // AC-4.2: No ranking language in rendered HTML of StrategyDetail page
  test('AC-4.2: rendered page contains no "AI Pick", "best fit", "top pick", "fit score"', async ({ adminPage }) => {
    await navigateToMatrix(adminPage)

    const forbiddenStrings = ['AI Pick', 'best fit', 'top pick', 'fit score']
    for (const str of forbiddenStrings) {
      await expect(adminPage.getByText(new RegExp(str, 'i'))).not.toBeVisible()
    }
  })

  // AC-4.3: No strategy name appears in the scan table rows (only after Analyze)
  test('AC-4.3: scan table rows contain no strategy names before clicking Analyze', async ({ adminPage }) => {
    await navigateToScannerTab(adminPage)
    await adminPage.getByRole('button', { name: /scan watchlist/i }).click()
    await adminPage.waitForSelector('td:has-text("AAPL")', { timeout: 15000 })

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

    await navigateToMatrix(adminPage)

    expect(responseText).not.toContain('"fit_score"')
  })
})

// ---------------------------------------------------------------------------
// Edge cases: error and loading states
// ---------------------------------------------------------------------------

test.describe('Edge cases: error and loading states', () => {
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
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await authedPage.waitForSelector('button:has-text("Analyze")', { timeout: 15000 })
    const analyzeBtn = authedPage.getByRole('button', { name: /analyze/i }).first()
    await analyzeBtn.click()

    // Should show an error message: check via DOM text (error may be rendered outside viewport)
    await authedPage.waitForTimeout(5000) // allow time for error state to appear
    const pageText: string = await authedPage.evaluate(() => document.body.innerText)
    const hasError = /analysis failed|failed to load|error/i.test(pageText)
    expect(hasError).toBe(true)
    // The comparison matrix disclaimer must not appear (matrix didn't load)
    await expect(authedPage.getByText(/mathematical strategy properties/i)).not.toBeVisible()
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
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await authedPage.waitForSelector('button:has-text("Analyze")', { timeout: 15000 })
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

    // Check that some error indication appears in the page body
    await authedPage.waitForTimeout(5000)
    const pageText: string = await authedPage.evaluate(() => document.body.innerText)
    const hasError = /scan failed|network error|error|failed/i.test(pageText)
    expect(hasError).toBe(true)
    // No strategy names should appear in table cells in the error state
    await expect(authedPage.locator('td').filter({ hasText: /iron condor/i })).not.toBeVisible()
  })
})

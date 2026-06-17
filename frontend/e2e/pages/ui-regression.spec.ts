/**
 * ui-regression.spec.ts
 *
 * UI regression and accessibility checks across the OptionsDesk frontend.
 * All API calls are mocked — no real backend is contacted.
 *
 * Coverage areas:
 *   - Mobile responsive: login left panel hidden at 375×812
 *   - Login page: brand name, Google button, email/password inputs, sign-in/sign-up toggle
 *   - Tab navigation: all main tabs reachable and render without console error
 *   - Loading state: scanning shows a loading indicator before results appear
 *   - Error state: failed options chain API shows an error message
 *   - Empty state: empty positions array shows a meaningful empty state message
 *   - Colour-coded risk: positions with green/yellow/red risk_level render distinct indicators
 */

import { test, expect } from '../fixtures/auth'
import { test as baseTest } from '@playwright/test'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
  MOCK_PNL_HISTORY,
  MOCK_ENTITLEMENTS_PRO,
  MOCK_POSITION,
  MOCK_POSITION_RISK,
} from '../mock-data'

const API = '**/api/**'

// ─── Risk positions covering all three risk levels ────────────────────────────

const MOCK_POSITION_GREEN = {
  ...MOCK_POSITION_RISK,
  id: 'pos-green-001',
  symbol: 'AAPL',
  risk_level: 'green',
  pnl_pct: 35.0,
  dte: 30,
  signals: [
    { level: 'green', type: 'pnl', msg: 'Position is profitable at +35.0%.' },
    { level: 'green', type: 'dte', msg: '30 days to expiry — position has time.' },
  ],
}

const MOCK_POSITION_YELLOW = {
  ...MOCK_POSITION_RISK,
  id: 'pos-yellow-001',
  symbol: 'MSFT',
  strike: 420,
  option_type: 'call',
  risk_level: 'yellow',
  pnl_pct: -15.0,
  dte: 12,
  signals: [
    { level: 'yellow', type: 'DTE', msg: '12 days to expiry — consider rolling or closing.' },
    { level: 'yellow', type: 'PNL', msg: 'Position is down -15.0%.' },
  ],
}

const MOCK_POSITION_RED = {
  ...MOCK_POSITION_RISK,
  id: 'pos-red-001',
  symbol: 'TSLA',
  strike: 250,
  option_type: 'put',
  risk_level: 'red',
  pnl_pct: -65.0,
  dte: 3,
  signals: [
    { level: 'red', type: 'DTE', msg: '3 days to expiry — close or roll immediately.' },
    { level: 'red', type: 'PNL', msg: 'Position is down -65.0% — consider cutting losses.' },
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

// ─── Login page tests (no auth bypass needed) ─────────────────────────────────

baseTest.describe('UI Regression — Login page', () => {

  baseTest.beforeEach(async ({ page }) => {
    await page.route('**/auth/v1/user', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) }))
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) }))
    await page.route(/\/public\/config/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true }) }))
  })

  baseTest('mobile: login left marketing panel is hidden at 375x812 viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')

    // The .login-left-panel has CSS: @media (max-width: 768px) { display: none !important }
    // Playwright can check computed style
    const leftPanel = page.locator('.login-left-panel')
    await expect(leftPanel).not.toBeVisible({ timeout: 10000 })
  })

  baseTest('mobile: login form panel is visible at 375x812 viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')

    // The right-side form panel is always visible — it contains the Google button
    await expect(page.getByRole('button', { name: /sign in with google|continue with google/i })).toBeVisible({ timeout: 10000 })
  })

  baseTest('login page shows OptionsCompass brand name', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')

    // LoginPage renders "Options" + "Compass" in styled spans — combined they form "OptionsCompass"
    await expect(page.getByText(/OptionsCompass|Options.*Compass/i).first()).toBeVisible({ timeout: 10000 })
  })

  baseTest('login page shows Google OAuth button', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /google/i })).toBeVisible({ timeout: 10000 })
  })

  baseTest('login page shows email input field', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 })
  })

  baseTest('login page shows password input field', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10000 })
  })

  baseTest('sign-in / sign-up toggle switches the form header text', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')

    // Default mode is 'signin' — shows "Welcome back"
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10000 })

    // Click "Create Account" toggle button
    await page.getByRole('button', { name: /create account/i }).click()

    // Should now show "Create your account"
    await expect(page.getByText('Create your account')).toBeVisible({ timeout: 5000 })
  })

  baseTest('sign-up mode shows confirm password field', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')

    // Switch to sign-up mode
    await page.getByRole('button', { name: /create account/i }).click()

    // Should show two password fields (password + confirm password)
    const passwordInputs = page.locator('input[type="password"]')
    await expect(passwordInputs).toHaveCount(2, { timeout: 5000 })
  })
})

// ─── Authenticated dashboard tests ────────────────────────────────────────────

test.describe('UI Regression — Dashboard tab navigation', () => {

  test.beforeEach(async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
  })

  test('Options Chain tab is visible and renders chain content', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    await expect(authedPage.getByRole('button', { name: /options chain/i })).toBeVisible({ timeout: 10000 })
    // Default tab — chain content is already visible
    await expect(authedPage.getByText(/calls/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Positions tab is reachable and renders without console error', async ({ authedPage }) => {
    const consoleErrors: string[] = []
    authedPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_RISK]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 10000 })

    // Filter out expected React/network noise; only React invariant violations are fatal
    const reactErrors = consoleErrors.filter(e =>
      e.includes('Invariant') || e.includes('Minified React error'))
    expect(reactErrors).toHaveLength(0)
  })

  test('Strategy Scanner tab is reachable and renders without console error', async ({ authedPage }) => {
    const consoleErrors: string[] = []
    authedPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await authedPage.route(/\/strategies\/scan/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await expect(authedPage.getByText(/strategy scanner/i).first()).toBeVisible({ timeout: 10000 })

    const reactErrors = consoleErrors.filter(e =>
      e.includes('Invariant') || e.includes('Minified React error'))
    expect(reactErrors).toHaveLength(0)
  })

  test('User Guide tab is reachable and renders content', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /user guide/i }).click()

    // UserGuide renders help text — look for common guide content
    await expect(authedPage.getByText(/guide|help|strategy|how/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('AI Features tab is reachable and renders content', async ({ authedPage }) => {
    await authedPage.route(`${API}ai/settings`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /ai features/i }).click()

    // AISettings renders toggle controls for AI features
    await expect(authedPage.getByText(/ai|narrative|settings/i).first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('UI Regression — Loading and error states', () => {

  test('strategy scanner shows loading indicator while scan is in progress', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)

    // Delay scan response so the loading state is visible
    await authedPage.route(/\/strategies\/scan/, async (route) => {
      // Respond after a short delay — enough for the loading indicator to appear
      await new Promise(resolve => setTimeout(resolve, 1200))
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()

    // The loading indicator should appear before results (or empty state)
    // StrategyScanner shows "Scanning..." or similar loading text during the request
    await expect(authedPage.getByText(/scanning|loading|analysing|analyzing/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('options chain shows error message when chain endpoint returns 500', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)

    // Override chain route to return 500
    await authedPage.route(`${API}options/chain/**`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal server error' }) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // OptionsChain shows the Axios error message when the endpoint fails
    await expect(authedPage.getByText(/error|request failed|500/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('options chain does not show a blank panel when endpoint fails (error message instead)', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}options/chain/**`, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Service unavailable' }) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // The error text must be visible — a blank panel with no text would fail this assertion
    await expect(authedPage.getByText(/error|request failed|5\d\d/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('positions tab shows meaningful empty state when no positions exist', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // Positions component renders "No open positions" or similar
    await expect(authedPage.getByText(/no open|no positions|empty|no trades/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('risk monitor shows empty state message when no positions exist', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // RiskMonitor renders "No open positions to monitor" when data.length === 0
    await expect(authedPage.getByText(/no open positions to monitor/i)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('UI Regression — Colour-coded risk indicators', () => {

  test('green risk_level position renders OK label', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_GREEN]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // RiskMonitor renders "🟢 OK" for green risk_level
    await expect(authedPage.getByText(/OK/)).toBeVisible({ timeout: 10000 })
  })

  test('yellow risk_level position renders WATCH label', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    const yellowPosition = { ...MOCK_POSITION, symbol: 'MSFT', strike: 420 }
    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([yellowPosition]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_YELLOW]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // RiskMonitor renders "🟡 WATCH" for yellow risk_level
    await expect(authedPage.getByText(/WATCH/)).toBeVisible({ timeout: 10000 })
  })

  test('red risk_level position renders HIGH RISK label', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)
    const redPosition = { ...MOCK_POSITION, symbol: 'TSLA', strike: 250, option_type: 'put' }
    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([redPosition]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_RED]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // RiskMonitor renders "🔴 HIGH RISK" for red risk_level
    await expect(authedPage.getByText(/HIGH RISK/)).toBeVisible({ timeout: 10000 })
  })

  test('all three risk levels render visually distinct labels simultaneously', async ({ authedPage }) => {
    await setupBaseRoutes(authedPage)

    const positions = [
      { ...MOCK_POSITION, id: 'p1', symbol: 'AAPL' },
      { ...MOCK_POSITION, id: 'p2', symbol: 'MSFT', strike: 420 },
      { ...MOCK_POSITION, id: 'p3', symbol: 'TSLA', strike: 250, option_type: 'put' },
    ]

    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(positions) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        MOCK_POSITION_GREEN,
        MOCK_POSITION_YELLOW,
        MOCK_POSITION_RED,
      ]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // All three distinct risk labels must appear
    await expect(authedPage.getByText(/HIGH RISK/).first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/WATCH/).first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/OK/).first()).toBeVisible({ timeout: 10000 })
  })

  test('mobile viewport: risk labels are visible at 390x844', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await setupBaseRoutes(authedPage)

    await authedPage.route(`${API}positions`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION]) }))
    await authedPage.route(`${API}positions/risk`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_RED]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    const posTab = authedPage.getByRole('button', { name: /p&l|positions/i })
    if (await posTab.isVisible()) {
      await posTab.click()
    }

    await expect(authedPage.getByText(/HIGH RISK/).first()).toBeVisible({ timeout: 10000 })
  })
})

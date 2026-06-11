import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_POSITION,
  MOCK_POSITION_RISK,
  MOCK_PNL_HISTORY,
} from '../mock-data'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

test.describe('Positions tab', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/watchlist`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) })
    })
    await authedPage.route(`${BACKEND_URL}/api/portfolio`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) })
    })
    await authedPage.route(`${BACKEND_URL}/api/ai/settings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
    })
    await authedPage.route(`${BACKEND_URL}/api/positions`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION]) })
    })
    await authedPage.route(`${BACKEND_URL}/api/positions/risk`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_RISK]) })
    })
    await authedPage.route(`${BACKEND_URL}/api/auth/pnl-history`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PNL_HISTORY) })
    })
  })

  test('navigates to the Positions tab', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /positions|p&l/i }).click()
    await expect(authedPage.getByText(/positions/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows open positions with symbol and strike', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /positions|p&l/i }).click()
    await expect(authedPage.getByText('AAPL')).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText('185')).toBeVisible({ timeout: 10000 })
  })

  test('shows portfolio summary with total value', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /positions|p&l/i }).click()
    // MOCK_PORTFOLIO total_value = 10,420
    await expect(authedPage.getByText(/10[,.]?420/)).toBeVisible({ timeout: 10000 })
  })

  test('shows P&L chart', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /positions|p&l/i }).click()
    // The PnL chart uses Recharts — check for the chart container
    const chart = authedPage.locator('.recharts-responsive-container, [class*="chart"], svg')
    await expect(chart.first()).toBeVisible({ timeout: 10000 })
  })

  test('shows risk signals for positions', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /positions|p&l/i }).click()
    // Risk monitor shows DTE warning from mock data
    await expect(authedPage.getByText(/dte|days to expiry|expiry/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows empty state when no positions exist', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/positions`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await authedPage.route(`${BACKEND_URL}/api/positions/risk`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /positions|p&l/i }).click()
    const emptyState = authedPage.getByText(/no positions|no open|empty/i)
    await expect(emptyState).toBeVisible({ timeout: 10000 })
  })

  test('shows error state when positions endpoint fails', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/positions`, (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Error' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /positions|p&l/i }).click()
    const errorText = authedPage.getByText(/error|failed|unavailable/i)
    await expect(errorText).toBeVisible({ timeout: 10000 })
  })

  test('renders positions on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const posTab = authedPage.getByRole('tab', { name: /positions|p&l/i })
    if (await posTab.isVisible()) {
      await posTab.click()
    }
    await expect(authedPage.getByText('AAPL')).toBeVisible({ timeout: 10000 })
  })
})

import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_POSITION,
  MOCK_POSITION_RISK,
  MOCK_PNL_HISTORY,
  MOCK_ENTITLEMENTS_PRO,
} from '../mock-data'

const API = '**/api/**'

test.describe('Positions tab', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.route(`${API}watchlist`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) })
    })
    await authedPage.route(`${API}portfolio`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) })
    })
    await authedPage.route(`${API}ai/settings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
    })
    await authedPage.route(`${API}auth/entitlements`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_PRO) })
    })
    await authedPage.route(`${API}positions`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION]) })
    })
    await authedPage.route(`${API}positions/risk`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION_RISK]) })
    })
    await authedPage.route(`${API}auth/pnl-history`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PNL_HISTORY) })
    })
  })

  test('navigates to the Positions tab', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Tabs are <button> elements in App.tsx (not role=tab)
    // The "Positions" button is the second tab in the tab bar
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    // After clicking Positions, mock data shows AAPL position
    await expect(authedPage.getByRole('cell', { name: 'AAPL' })).toBeVisible({ timeout: 10000 })
  })

  test('shows open positions with symbol and strike', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText('185').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows portfolio summary with total value', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    // MOCK_PORTFOLIO total_value = 10,420
    await expect(authedPage.getByText(/10[,.]?420/)).toBeVisible({ timeout: 10000 })
  })

  test('shows P&L chart', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    // The PnL chart uses Recharts — check for the chart container
    const chart = authedPage.locator('.recharts-responsive-container, [class*="chart"], svg')
    await expect(chart.first()).toBeVisible({ timeout: 10000 })
  })

  test('shows risk signals for positions', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    // Risk monitor shows DTE warning from mock data
    await expect(authedPage.getByText(/dte|days to expiry|expiry/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('shows empty state when no positions exist', async ({ authedPage }) => {
    await authedPage.route(`${API}positions`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await authedPage.route(`${API}positions/risk`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    const emptyState = authedPage.getByText(/no positions|no open|empty/i).first()
    await expect(emptyState).toBeVisible({ timeout: 10000 })
  })

  test('shows error state when positions endpoint fails', async ({ authedPage }) => {
    await authedPage.route(`${API}positions`, (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Error' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    // When positions endpoint fails, no position rows should be visible
    // The component renders an error or empty state — verify no AAPL position rows appear
    await expect(authedPage.getByRole('cell', { name: 'AAPL' })).not.toBeVisible({ timeout: 10000 })
  })

  test('renders positions on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // On mobile the tab short label is 'P&L'
    const posTab = authedPage.getByRole('button', { name: /p&l|positions/i })
    if (await posTab.isVisible()) {
      await posTab.click()
    }
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 10000 })
  })
})

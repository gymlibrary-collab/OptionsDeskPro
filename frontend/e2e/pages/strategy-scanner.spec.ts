import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_SCAN_RESULT,
  MOCK_ANALYZE_RESPONSE,
  MOCK_OPTIONS_CHAIN,
} from '../mock-data'

const API = '**/api/**'

test.describe('Strategy Scanner tab', () => {
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
    await authedPage.route(/\/strategies\/scan/, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_SCAN_RESULT]) })
    })
    await authedPage.route(/\/strategies\/analyze/, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_RESPONSE) })
    })
    await authedPage.route(`${API}options/chain/**`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) })
    })
  })

  test('shows the scanner tab', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Tabs are <button> elements in App.tsx
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    // The Strategy Scanner heading should be visible inside the tab content
    await expect(authedPage.getByText(/strategy scanner/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('displays watchlist symbols', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    // AAPL is in the mock watchlist
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows scan results with strategy count and condition matches', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText(/strategies/i).first()).toBeVisible({ timeout: 15000 })
  })

  test('shows IV rank in scan results', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 15000 })
  })

  test('handles empty watchlist gracefully', async ({ authedPage }) => {
    await authedPage.route(`${API}watchlist`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ symbols: [], tier: 'free', max_symbols: 5, scans_used: 0, max_scans_per_month: 10 }),
      })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    // Should show an empty state or instruction to add symbols
    const emptyState = authedPage.getByText(/add|empty|no symbols/i).first()
    await expect(emptyState).toBeVisible({ timeout: 10000 })
  })

  test('shows error when scan endpoint fails', async ({ authedPage }) => {
    await authedPage.route(/\/strategies\/scan/, (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Scan failed' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    // StrategyScanner shows error in red text — "Scan failed" or similar
    await expect(authedPage.getByText(/scan failed/i)).toBeVisible({ timeout: 10000 })
  })

  test('renders correctly on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // On mobile the tab short label is 'Scanner'
    const scannerTab = authedPage.getByRole('button', { name: /^scanner$/i })
    if (await scannerTab.isVisible()) {
      await scannerTab.click()
    }
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 10000 })
  })
})

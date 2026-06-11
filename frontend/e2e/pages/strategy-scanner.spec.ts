import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_SCAN_RESULT,
  MOCK_ANALYZE_RESPONSE,
} from '../mock-data'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

test.describe('Strategy Scanner tab', () => {
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
    await authedPage.route(`${BACKEND_URL}/api/strategies/scan`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_SCAN_RESULT]) })
    })
    await authedPage.route(`${BACKEND_URL}/api/strategies/analyze/**`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_RESPONSE) })
    })
    await authedPage.route(`${BACKEND_URL}/api/options/chain/**`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ symbol: 'AAPL', quote: { price: 185.5 }, calls: [], puts: [], expirations: [] }) })
    })
  })

  test('shows the scanner tab', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Navigate to Scanner tab
    await authedPage.getByRole('tab', { name: /scanner/i }).click()
    await expect(authedPage.getByText(/scanner/i)).toBeVisible({ timeout: 10000 })
  })

  test('displays watchlist symbols', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /scanner/i }).click()
    // AAPL is in the mock watchlist
    await expect(authedPage.getByText('AAPL')).toBeVisible({ timeout: 10000 })
  })

  test('shows scan results with IV rank and top strategy', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /scanner/i }).click()
    // Trigger a scan
    const scanButton = authedPage.getByRole('button', { name: /scan/i })
    if (await scanButton.isVisible()) {
      await scanButton.click()
    }
    await expect(authedPage.getByText(/bull call spread/i)).toBeVisible({ timeout: 15000 })
  })

  test('shows IV rank in scan results', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /scanner/i }).click()
    const scanButton = authedPage.getByRole('button', { name: /scan/i })
    if (await scanButton.isVisible()) {
      await scanButton.click()
    }
    // IV rank of 42 from mock data
    await expect(authedPage.getByText(/42/)).toBeVisible({ timeout: 15000 })
  })

  test('handles empty watchlist gracefully', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/watchlist`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ symbols: [], tier: 'free', max_symbols: 5, scans_used: 0, max_scans_per_month: 10 }),
      })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /scanner/i }).click()
    // Should show an empty state or instruction to add symbols
    const emptyState = authedPage.getByText(/add|empty|no symbols/i)
    await expect(emptyState).toBeVisible({ timeout: 10000 })
  })

  test('shows error when scan endpoint fails', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/strategies/scan`, (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Scan failed' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /scanner/i }).click()
    const scanButton = authedPage.getByRole('button', { name: /scan/i })
    if (await scanButton.isVisible()) {
      await scanButton.click()
    }
    const errorText = authedPage.getByText(/error|failed/i)
    await expect(errorText).toBeVisible({ timeout: 10000 })
  })

  test('renders correctly on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Navigate to scanner on mobile
    const scannerTab = authedPage.getByRole('tab', { name: /scanner/i })
    if (await scannerTab.isVisible()) {
      await scannerTab.click()
    }
    await expect(authedPage.getByText('AAPL')).toBeVisible({ timeout: 10000 })
  })
})

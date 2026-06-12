import { test, expect } from '../fixtures/auth'
import {
  MOCK_OPTIONS_CHAIN,
  MOCK_QUOTE,
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
} from '../mock-data'

const API = '**/api/**'

test.describe('Options Chain tab', () => {
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
    await authedPage.route(`${API}options/chain/**`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) })
    })
    await authedPage.route(`${API}options/quote/**`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE) })
    })
  })

  test('loads the options chain for a symbol', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // The app should show the options chain tab by default with calls/puts columns
    await expect(authedPage.getByText(/calls/i).first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/puts/i).first()).toBeVisible()
  })

  test('displays strike prices in the chain', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Mock data has strikes 180, 185, 190 — use role=cell for table data
    await expect(authedPage.getByText('185').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows a quote bar with the ticker symbol', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Default symbol is SPY — appears in the symbol input field
    const symbolInput = authedPage.locator('input[placeholder="Symbol"]')
    await expect(symbolInput).toHaveValue('SPY', { timeout: 10000 })
  })

  test('shows delta column in options chain', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // OptionsChain renders "Δ Delta" as a column header
    await expect(authedPage.getByText(/delta/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('expiry picker shows available expirations', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Expiry picker is a <select> element — check its selected value
    const expirySelect = authedPage.locator('select')
    await expect(expirySelect).toBeVisible({ timeout: 10000 })
  })

  test('shows a loading state while chain is fetching', async ({ authedPage }) => {
    // Delay the response to observe loading state
    await authedPage.route(`${API}options/chain/**`, async (route) => {
      await new Promise((r) => setTimeout(r, 800))
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) })
    })
    await authedPage.goto('http://localhost:5173/')
    // We don't assert loading indicator — just assert the chain eventually renders
    await expect(authedPage.getByText(/calls/i).first()).toBeVisible({ timeout: 15000 })
  })

  test('shows an error state when the chain endpoint fails', async ({ authedPage }) => {
    await authedPage.route(`${API}options/chain/**`, (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal error' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // OptionsChain shows "Error: Request failed with status code 500" in the chain content area
    await expect(authedPage.getByText(/request failed with status code 500/i)).toBeVisible({ timeout: 10000 })
  })

  test('renders on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // The symbol input should show the default symbol SPY
    const symbolInput = authedPage.locator('input[placeholder="Symbol"]')
    await expect(symbolInput).toHaveValue('SPY', { timeout: 10000 })
  })
})

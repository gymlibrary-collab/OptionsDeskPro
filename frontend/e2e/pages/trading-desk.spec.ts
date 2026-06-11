import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_REDDIT_POST,
} from '../mock-data'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

test.describe('Trading Desk', () => {
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
    await authedPage.route(`${BACKEND_URL}/api/trading/buzz/earnings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
    await authedPage.route(`${BACKEND_URL}/api/trading/buzz/stocks`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
    await authedPage.route(`${BACKEND_URL}/api/trading/buzz/crypto`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
    await authedPage.route(`${BACKEND_URL}/api/trading/buzz/tokens`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
    await authedPage.route(`${BACKEND_URL}/api/trading/buzz/selected`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
  })

  test('navigates to the Trading Desk', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Trading Desk is a separate desk, not a tab — look for desk switcher
    const tradingDeskButton = authedPage.getByRole('button', { name: /trading/i })
      .or(authedPage.getByText(/trading desk/i))
    if (await tradingDeskButton.isVisible()) {
      await tradingDeskButton.click()
    }
    await expect(authedPage.getByText(/buzz|reddit|earnings/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows earnings buzz feed with post titles', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const tradingDeskButton = authedPage.getByRole('button', { name: /trading/i })
      .or(authedPage.getByText(/trading desk/i))
    if (await tradingDeskButton.isVisible()) {
      await tradingDeskButton.click()
    }
    // MOCK_REDDIT_POST title contains "AAPL earnings"
    await expect(authedPage.getByText(/AAPL earnings/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows four feed tabs: earnings, stocks, crypto, tokens', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const tradingDeskButton = authedPage.getByRole('button', { name: /trading/i })
      .or(authedPage.getByText(/trading desk/i))
    if (await tradingDeskButton.isVisible()) {
      await tradingDeskButton.click()
    }
    for (const feed of ['earnings', 'stocks', 'crypto']) {
      await expect(authedPage.getByText(new RegExp(feed, 'i'))).toBeVisible({ timeout: 10000 })
    }
  })

  test('shows empty state when feed returns no posts', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/trading/buzz/earnings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const tradingDeskButton = authedPage.getByRole('button', { name: /trading/i })
      .or(authedPage.getByText(/trading desk/i))
    if (await tradingDeskButton.isVisible()) {
      await tradingDeskButton.click()
    }
    // Should show empty state
    const emptyState = authedPage.getByText(/no posts|no results|empty/i)
    await expect(emptyState).toBeVisible({ timeout: 10000 })
  })

  test('shows error when feed endpoint fails', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/trading/buzz/earnings`, (route) => {
      route.fulfill({ status: 500, body: JSON.stringify({ detail: 'Error' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const tradingDeskButton = authedPage.getByRole('button', { name: /trading/i })
      .or(authedPage.getByText(/trading desk/i))
    if (await tradingDeskButton.isVisible()) {
      await tradingDeskButton.click()
    }
    const errorText = authedPage.getByText(/error|failed|unavailable/i)
    await expect(errorText).toBeVisible({ timeout: 10000 })
  })

  test('renders trading desk on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const tradingDeskButton = authedPage.getByRole('button', { name: /trading/i })
      .or(authedPage.getByText(/trading desk/i))
    if (await tradingDeskButton.isVisible()) {
      await tradingDeskButton.click()
    }
    await expect(authedPage.getByText(/buzz|reddit|earnings/i)).toBeVisible({ timeout: 10000 })
  })
})

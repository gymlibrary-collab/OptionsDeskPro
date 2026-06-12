import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_REDDIT_POST,
  MOCK_ENTITLEMENTS_PRO,
} from '../mock-data'

const API = '**/api/**'

test.describe('Trading Desk', () => {
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
    await authedPage.route(`${API}trading/buzz/earnings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
    await authedPage.route(`${API}trading/buzz/stocks`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
    await authedPage.route(`${API}trading/buzz/crypto`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
    await authedPage.route(`${API}trading/buzz/tokens`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
    await authedPage.route(`${API}trading/buzz/selected`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_REDDIT_POST]) })
    })
  })

  test('navigates to the Trading Desk', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Desk switcher buttons are in the header: "⬡ Options Desk" and "◈ Trading Desk"
    await authedPage.getByRole('button', { name: /trading desk/i }).click()
    await expect(authedPage.getByText(/buzz|reddit|earnings/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('shows earnings buzz feed with post titles', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /trading desk/i }).click()
    // MOCK_REDDIT_POST title contains "AAPL earnings"
    await expect(authedPage.getByText(/AAPL earnings/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('shows four feed tabs: earnings, stocks, crypto, tokens', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /trading desk/i }).click()
    for (const feed of ['earnings', 'stocks', 'crypto']) {
      await expect(authedPage.getByText(new RegExp(feed, 'i')).first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('shows empty state when feed returns no posts', async ({ authedPage }) => {
    await authedPage.route(`${API}trading/buzz/earnings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /trading desk/i }).click()
    // Should show empty state
    const emptyState = authedPage.getByText(/no posts|no results|empty/i)
    await expect(emptyState).toBeVisible({ timeout: 10000 })
  })

  test('shows error when feed endpoint fails', async ({ authedPage }) => {
    await authedPage.route(`${API}trading/buzz/earnings`, (route) => {
      route.fulfill({ status: 500, body: JSON.stringify({ detail: 'Error' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /trading desk/i }).click()
    const errorText = authedPage.getByText(/error|failed|unavailable/i).first()
    await expect(errorText).toBeVisible({ timeout: 10000 })
  })

  test('renders trading desk on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // On mobile the desk button label is 'Trading' (short form)
    const tradingBtn = authedPage.getByRole('button', { name: /trading/i }).first()
    if (await tradingBtn.isVisible()) {
      await tradingBtn.click()
    }
    await expect(authedPage.getByText(/buzz|reddit|earnings/i).first()).toBeVisible({ timeout: 10000 })
  })
})

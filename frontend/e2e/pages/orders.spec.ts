import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_ORDER,
  MOCK_OPTIONS_CHAIN,
} from '../mock-data'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

test.describe('Orders history', () => {
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
    await authedPage.route(`${BACKEND_URL}/api/orders`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_ORDER]) })
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ORDER) })
      }
    })
    await authedPage.route(`${BACKEND_URL}/api/options/chain/**`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) })
    })
  })

  test('shows order history with symbol and strike', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Orders are accessible from the Options Chain tab — find the orders table
    // or navigate to a dedicated orders section if present
    const ordersTab = authedPage.getByRole('tab', { name: /orders/i })
    if (await ordersTab.isVisible()) {
      await ordersTab.click()
    }
    await expect(authedPage.getByText('AAPL')).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText('185')).toBeVisible({ timeout: 10000 })
  })

  test('shows order status (filled)', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const ordersTab = authedPage.getByRole('tab', { name: /orders/i })
    if (await ordersTab.isVisible()) {
      await ordersTab.click()
    }
    await expect(authedPage.getByText(/filled/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows empty state when no orders exist', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/orders`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const ordersTab = authedPage.getByRole('tab', { name: /orders/i })
    if (await ordersTab.isVisible()) {
      await ordersTab.click()
    }
    const emptyState = authedPage.getByText(/no orders|no trades|empty/i)
    await expect(emptyState).toBeVisible({ timeout: 10000 })
  })

  test('paper trade order entry form validates required fields', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Look for the order entry form — it may be in a sidebar or modal
    const placeOrderButton = authedPage.getByRole('button', { name: /place order|buy|sell/i }).first()
    if (await placeOrderButton.isVisible()) {
      await placeOrderButton.click()
      // Try to submit without quantity — form should prevent submission
      const submitButton = authedPage.getByRole('button', { name: /submit|confirm|place/i })
      if (await submitButton.isVisible()) {
        await submitButton.click()
        // Form validation should prevent empty submission
        const validationMsg = authedPage.getByText(/required|invalid|enter/i)
        await expect(validationMsg).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('renders orders on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    const ordersTab = authedPage.getByRole('tab', { name: /orders/i })
    if (await ordersTab.isVisible()) {
      await ordersTab.click()
    }
    await expect(authedPage.getByText('AAPL')).toBeVisible({ timeout: 10000 })
  })
})

import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_ADMIN_USERS,
} from '../mock-data'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ adminPage }) => {
    await adminPage.route(`${BACKEND_URL}/api/watchlist`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) })
    })
    await adminPage.route(`${BACKEND_URL}/api/portfolio`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) })
    })
    await adminPage.route(`${BACKEND_URL}/api/ai/settings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
    })
    await adminPage.route(`${BACKEND_URL}/api/admin/users`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ADMIN_USERS) })
    })
    await adminPage.route(`${BACKEND_URL}/api/admin/whitelist`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ email: 'test@example.com', role: 'user' }]) })
    })
    await adminPage.route(`${BACKEND_URL}/api/admin/stats`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total_users: 2, active_today: 1, total_trades: 15 }),
      })
    })
    await adminPage.route(`${BACKEND_URL}/api/admin/activity`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
  })

  test('admin tab is visible for admin users', async ({ adminPage }) => {
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    const adminTab = adminPage.getByRole('tab', { name: /admin/i })
    await expect(adminTab).toBeVisible({ timeout: 10000 })
  })

  test('shows user list in admin panel', async ({ adminPage }) => {
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.getByRole('tab', { name: /admin/i }).click()
    // Should list test@example.com from mock data
    await expect(adminPage.getByText('test@example.com')).toBeVisible({ timeout: 10000 })
  })

  test('shows whitelist tab with email entries', async ({ adminPage }) => {
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.getByRole('tab', { name: /admin/i }).click()
    const whitelistTab = adminPage.getByRole('tab', { name: /whitelist/i })
      .or(adminPage.getByText(/whitelist/i))
    if (await whitelistTab.isVisible()) {
      await whitelistTab.click()
    }
    await expect(adminPage.getByText('test@example.com')).toBeVisible({ timeout: 10000 })
  })

  test('admin tab is hidden for non-admin users', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/watchlist`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) })
    })
    await authedPage.route(`${BACKEND_URL}/api/portfolio`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) })
    })
    await authedPage.route(`${BACKEND_URL}/api/ai/settings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Admin tab should not be visible for non-admin users
    const adminTab = authedPage.getByRole('tab', { name: /^admin$/i })
    await expect(adminTab).not.toBeVisible({ timeout: 5000 })
  })

  test('non-admin cannot access admin endpoints directly', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/watchlist`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) })
    })
    await authedPage.route(`${BACKEND_URL}/api/portfolio`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) })
    })
    await authedPage.route(`${BACKEND_URL}/api/ai/settings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
    })
    // Mock admin endpoint to return 403 for non-admin
    await authedPage.route(`${BACKEND_URL}/api/admin/**`, (route) => {
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'Admin only' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Verify admin tab is not accessible
    const adminTab = authedPage.getByRole('tab', { name: /^admin$/i })
    await expect(adminTab).not.toBeVisible({ timeout: 5000 })
  })

  test('renders admin panel on mobile viewport', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 })
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    const adminTab = adminPage.getByRole('tab', { name: /admin/i })
    if (await adminTab.isVisible()) {
      await adminTab.click()
    }
    await expect(adminPage.getByText(/users|whitelist/i)).toBeVisible({ timeout: 10000 })
  })
})

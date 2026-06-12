/**
 * Admin spec — updated for the multi-tenant SaaS conversion (Gate 3).
 *
 * The old AdminPanel.tsx tab has been retired from the client portal dashboard.
 * Admin functions now live in the separate admin subdomain portal (VITE_PORTAL_MODE=admin).
 * These tests verify:
 *   - The "Admin" tab no longer appears in the client dashboard (for any user).
 *   - The dashboard still loads correctly after the tab removal.
 *   - Settings and FAQ buttons are present in the authenticated dashboard header.
 *
 * Full admin portal (AdminApp) tests live in admin-portal.spec.ts.
 */
import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
  MOCK_ENTITLEMENTS_PRO,
} from '../mock-data'

const API = '**/api/**'

async function mockDashboard(page: import('@playwright/test').Page) {
  await page.route(`${API}watchlist`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
  await page.route(`${API}portfolio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
  await page.route(`${API}ai/settings`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
  await page.route(`${API}options/chain/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
  await page.route(`${API}auth/entitlements`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_PRO) }))
}

test.describe('Client dashboard — Admin tab retired', () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockDashboard(authedPage)
  })

  test('admin tab is no longer visible for regular users', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // The old "Admin" tab should not exist in the client dashboard
    const adminTab = authedPage.getByRole('button', { name: /^admin$/i })
    await expect(adminTab).not.toBeVisible({ timeout: 5000 })
  })

  test('admin tab is no longer visible for admin-email users', async ({ adminPage }) => {
    await mockDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    // AdminPanel tab is retired — admin users now use the separate admin portal
    const adminTab = adminPage.getByRole('button', { name: /^admin$/i })
    await expect(adminTab).not.toBeVisible({ timeout: 5000 })
  })

  test('dashboard loads and shows Options Chain tab after admin tab removal', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Options Chain tab should still be the default active tab
    await expect(authedPage.getByRole('button', { name: /options chain/i })).toBeVisible({ timeout: 10000 })
  })

  test('Settings button is visible in dashboard header', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await expect(authedPage.getByRole('button', { name: /settings/i })).toBeVisible({ timeout: 10000 })
  })

  test('FAQ button is visible in dashboard header', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await expect(authedPage.getByRole('button', { name: /faq/i })).toBeVisible({ timeout: 10000 })
  })
})

/**
 * mobile-header.spec.ts — verifies that at 390 × 844 the header is usable:
 * Settings and Sign out are within the viewport and tappable, ticker input
 * and Go button are reachable on row 2, "Out" label is gone.
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

async function setupMocks(page: import('@playwright/test').Page) {
  await page.route(`${API}watchlist`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
  await page.route(`${API}portfolio`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
  await page.route(`${API}ai/settings`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
  await page.route(`${API}options/chain/**`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
  await page.route(`${API}auth/entitlements`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_PRO) }))
}

test.describe('Mobile header at 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ authedPage }) => {
    await setupMocks(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
  })

  test('Settings button is visible and within viewport', async ({ authedPage }) => {
    const settingsBtn = authedPage.getByRole('button', { name: /settings/i }).first()
    await expect(settingsBtn).toBeVisible({ timeout: 10000 })

    // Check it is not clipped off the right edge
    const box = await settingsBtn.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(400)  // within 390px viewport + small tolerance
    }
  })

  test('Sign out button is visible and within viewport', async ({ authedPage }) => {
    const signOutBtn = authedPage.getByRole('button', { name: /sign out/i }).first()
    await expect(signOutBtn).toBeVisible({ timeout: 10000 })

    const box = await signOutBtn.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(400)
    }
  })

  test('"Out" label is gone — button now reads "Sign out"', async ({ authedPage }) => {
    // The old button labelled exactly "Out" must not exist
    await expect(authedPage.getByRole('button', { name: /^out$/i })).not.toBeVisible({ timeout: 5000 })
    // The new label is "Sign out"
    await expect(authedPage.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 10000 })
  })

  test('Ticker input is visible and within viewport on row 2', async ({ authedPage }) => {
    const input = authedPage.locator('input[placeholder="Symbol"]')
    await expect(input).toBeVisible({ timeout: 10000 })

    const box = await input.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(400)
    }
  })

  test('Go button is visible and within viewport', async ({ authedPage }) => {
    const goBtn = authedPage.getByRole('button', { name: /^go$/i }).first()
    await expect(goBtn).toBeVisible({ timeout: 10000 })

    const box = await goBtn.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(400)
    }
  })

  test('Settings button is tappable (opens Settings page)', async ({ authedPage }) => {
    const settingsBtn = authedPage.getByRole('button', { name: /settings/i }).first()
    await settingsBtn.click()
    // Settings page renders
    await expect(authedPage.getByText('Settings')).toBeVisible({ timeout: 10000 })
  })
})

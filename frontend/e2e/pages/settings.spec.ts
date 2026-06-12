/**
 * Settings page spec — covers FR-18 through FR-21, Story 7 (cancel), Story 8 (billing).
 *
 * Acceptance criteria covered:
 *   AC8.1 / FR-18c: Billing tab shows card brand, last4, expiry month/year (no full number).
 *   AC8.2 / FR-20: "Update card" / "Manage in Stripe" opens Stripe Customer Portal URL.
 *   AC8.3 / FR-19: Invoice list with PDF links rendered from mocked /api/billing/invoices.
 *   AC7.1 / FR-16: Cancel subscription requires deliberate confirmation; calls /api/billing/cancel.
 *   AC7.3 / FR-17: Reactivate button appears when cancel_at_period_end is true.
 *   AC21 / FR-21: Account deletion requires typing "DELETE"; calls /api/auth/account DELETE.
 *   FR-18a: Account tab renders profile information.
 *   FR-18b: Subscription tab renders current plan and entitlements.
 */
import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
  MOCK_ENTITLEMENTS_PRO,
  MOCK_ENTITLEMENTS_CANCEL_SCHEDULED,
  MOCK_INVOICES,
  MOCK_PAYMENT_METHOD,
  MOCK_PORTAL_SESSION,
  MOCK_CANCEL_RESPONSE,
  MOCK_REACTIVATE_RESPONSE,
} from '../mock-data'

const API = '**/api/**'

async function mockDashboard(page: import('@playwright/test').Page, entitlements = MOCK_ENTITLEMENTS_PRO) {
  await page.route(`${API}watchlist`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
  await page.route(`${API}portfolio`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
  await page.route(`${API}ai/settings`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
  await page.route(`${API}options/chain/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
  await page.route(`${API}auth/entitlements`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entitlements) }))
}

async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /settings/i }).click()
  await expect(page.getByText('Settings')).toBeVisible({ timeout: 10000 })
}

test.describe('Settings page — tab navigation', () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockDashboard(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
  })

  test('Settings page renders with four tabs', async ({ authedPage }) => {
    await openSettings(authedPage)
    await expect(authedPage.getByRole('button', { name: /^account$/i })).toBeVisible()
    await expect(authedPage.getByRole('button', { name: /^subscription$/i })).toBeVisible()
    await expect(authedPage.getByRole('button', { name: /^billing$/i })).toBeVisible()
    await expect(authedPage.getByRole('button', { name: /danger zone/i })).toBeVisible()
  })

  test('Back button closes Settings and returns to dashboard', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /back/i }).click()
    // Dashboard should reappear
    await expect(authedPage.getByRole('button', { name: /options chain/i })).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Settings page — Account tab', () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockDashboard(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
  })

  test('Account tab shows user email', async ({ authedPage }) => {
    await openSettings(authedPage)
    // Account is the default tab
    await expect(authedPage.getByText('test@example.com').first()).toBeVisible({ timeout: 10000 })
  })

  test('Account tab shows auth provider', async ({ authedPage }) => {
    await openSettings(authedPage)
    await expect(authedPage.getByText(/auth provider/i)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Settings page — Subscription tab', () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockDashboard(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
  })

  test('Subscription tab shows current plan tier', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^subscription$/i }).click()
    // MOCK_ENTITLEMENTS_PRO has effective_tier = 'pro'
    await expect(authedPage.getByText(/pro/i)).toBeVisible({ timeout: 10000 })
  })

  test('Subscription tab shows status Active for active subscription', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^subscription$/i }).click()
    await expect(authedPage.getByText(/active/i)).toBeVisible({ timeout: 10000 })
  })

  test('Subscription tab shows max symbols and scans from entitlements', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^subscription$/i }).click()
    // MOCK_ENTITLEMENTS_PRO: max_symbols=50, max_scans_per_month=null (Unlimited)
    await expect(authedPage.getByText('50')).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/unlimited/i)).toBeVisible({ timeout: 10000 })
  })

  test('Subscription tab shows Reactivate button when cancel_at_period_end is true', async ({ authedPage }) => {
    // Re-route entitlements for this specific test
    await authedPage.route(`${API}auth/entitlements`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_CANCEL_SCHEDULED) }))
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^subscription$/i }).click()
    await expect(authedPage.getByRole('button', { name: /reactivate/i })).toBeVisible({ timeout: 10000 })
  })

  test('Cancel subscription button shows inline typed-confirmation form (AC7.1)', async ({ authedPage }) => {
    let cancelCalled = false
    await authedPage.route(`${API}billing/cancel`, (route) => {
      cancelCalled = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CANCEL_RESPONSE) })
    })

    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^subscription$/i }).click()
    await expect(authedPage.getByRole('button', { name: /cancel subscription/i })).toBeVisible({ timeout: 10000 })

    // Click cancel — shows inline confirmation form (no window.confirm)
    await authedPage.getByRole('button', { name: /cancel subscription/i }).click()

    // Typed confirmation input should appear
    await expect(authedPage.getByPlaceholder('CANCEL')).toBeVisible({ timeout: 5000 })

    // Confirm button disabled until correct word typed
    const confirmBtn = authedPage.getByRole('button', { name: /confirm cancellation/i })
    await expect(confirmBtn).toBeDisabled()

    // Type CANCEL to enable the confirm button
    await authedPage.getByPlaceholder('CANCEL').fill('CANCEL')
    await expect(confirmBtn).toBeEnabled()

    // Click to confirm
    await confirmBtn.click()

    // Wait for the cancel API to be called
    await authedPage.waitForTimeout(1000)
    expect(cancelCalled).toBe(true)
  })

  test('Shows success message after cancellation with cancels_at date (AC7.2)', async ({ authedPage }) => {
    await authedPage.route(`${API}billing/cancel`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CANCEL_RESPONSE) }))

    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^subscription$/i }).click()

    // New inline typed-confirmation flow
    await authedPage.getByRole('button', { name: /cancel subscription/i }).click()
    await expect(authedPage.getByPlaceholder('CANCEL')).toBeVisible({ timeout: 5000 })
    await authedPage.getByPlaceholder('CANCEL').fill('CANCEL')
    await authedPage.getByRole('button', { name: /confirm cancellation/i }).click()

    // Should show a success message mentioning the cancellation date
    await expect(authedPage.getByText(/subscription will cancel/i)).toBeVisible({ timeout: 10000 })
  })

  test('Reactivate subscription button calls /api/billing/reactivate (AC7.3)', async ({ authedPage }) => {
    let reactivateCalled = false
    await authedPage.route(`${API}auth/entitlements`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_CANCEL_SCHEDULED) }))
    await authedPage.route(`${API}billing/reactivate`, (route) => {
      reactivateCalled = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_REACTIVATE_RESPONSE) })
    })

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^subscription$/i }).click()
    await authedPage.getByRole('button', { name: /reactivate/i }).click()

    await authedPage.waitForTimeout(1000)
    expect(reactivateCalled).toBe(true)
  })
})

test.describe('Settings page — Billing tab', () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockDashboard(authedPage)
    await authedPage.route(`${API}billing/invoices`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INVOICES) }))
    await authedPage.route(`${API}billing/payment-method`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PAYMENT_METHOD) }))
    await authedPage.route(`${API}billing/portal`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTAL_SESSION) }))
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
  })

  test('Billing tab renders card brand and last4 (AC8.1)', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    // MOCK_PAYMENT_METHOD: brand='visa', last4='4242'
    await expect(authedPage.getByText(/visa/i)).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/4242/)).toBeVisible({ timeout: 10000 })
  })

  test('Billing tab shows card expiry month and year — not full card number (AC8.1)', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    // MOCK_PAYMENT_METHOD: exp_month=12, exp_year=2028
    await expect(authedPage.getByText(/12\/2028/)).toBeVisible({ timeout: 10000 })
    // Full card number must NOT appear — we only have last4, never 16 digits
    const fullCardPattern = /\b\d{16}\b/
    const bodyText = await authedPage.locator('body').textContent()
    expect(bodyText).not.toMatch(fullCardPattern)
  })

  test('Invoice list shows rows from mocked /api/billing/invoices (AC8.3)', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    // Two invoices in mock — amount $29.00 and status "paid"
    const paidTexts = await authedPage.getByText('paid').all()
    expect(paidTexts.length).toBeGreaterThanOrEqual(1)
  })

  test('Invoice PDF link has correct href (AC8.3)', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    // PDF link should point to Stripe-hosted URL
    const pdfLink = authedPage.getByRole('link', { name: /pdf/i }).first()
    await expect(pdfLink).toBeVisible({ timeout: 10000 })
    const href = await pdfLink.getAttribute('href')
    expect(href).toContain('stripe.com')
  })

  test('Invoice PDF link opens in new tab (AC8.3)', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    const pdfLink = authedPage.getByRole('link', { name: /pdf/i }).first()
    await expect(pdfLink).toBeVisible({ timeout: 10000 })
    const target = await pdfLink.getAttribute('target')
    expect(target).toBe('_blank')
  })

  test('"Manage in Stripe" button calls /api/billing/portal (AC8.2)', async ({ authedPage }) => {
    let portalCalled = false
    await authedPage.route(`${API}billing/portal`, (route) => {
      portalCalled = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTAL_SESSION) })
    })

    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    await expect(authedPage.getByRole('button', { name: /manage in stripe/i })).toBeVisible({ timeout: 10000 })
    await authedPage.getByRole('button', { name: /manage in stripe/i }).click()

    await authedPage.waitForTimeout(500)
    expect(portalCalled).toBe(true)
  })

  test('Shows portal error toast when /api/billing/portal returns 503', async ({ authedPage }) => {
    await authedPage.route(`${API}billing/portal`, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Stripe unavailable' }) }))

    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    await authedPage.getByRole('button', { name: /manage in stripe/i }).click()

    await expect(authedPage.getByText(/unable to open billing portal/i)).toBeVisible({ timeout: 10000 })
  })

  test('Shows empty invoices state when no invoices exist', async ({ authedPage }) => {
    await authedPage.route(`${API}billing/invoices`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invoices: [] }) }))

    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    await expect(authedPage.getByText(/no invoices yet/i)).toBeVisible({ timeout: 10000 })
  })

  test('Shows error state when billing info fails to load', async ({ authedPage }) => {
    await authedPage.route(`${API}billing/invoices`, (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'error' }) }))
    await authedPage.route(`${API}billing/payment-method`, (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'error' }) }))

    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()

    await expect(authedPage.getByText(/unable to load billing/i)).toBeVisible({ timeout: 10000 })
  })

  test('Billing tab renders on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /^billing$/i }).click()
    await expect(authedPage.getByText(/visa/i)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Settings page — Danger Zone tab', () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockDashboard(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
  })

  test('Danger Zone tab renders delete account section', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /danger zone/i }).click()
    await expect(authedPage.getByText(/delete account/i)).toBeVisible({ timeout: 10000 })
  })

  test('"Delete my account" button shows confirmation form', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /danger zone/i }).click()
    await authedPage.getByRole('button', { name: /delete my account/i }).click()
    // Should now show the "Type DELETE" confirmation input
    await expect(authedPage.getByText(/type delete to confirm/i)).toBeVisible({ timeout: 10000 })
  })

  test('Confirm delete button disabled until user types DELETE (AC7.1 pattern / FR-21)', async ({ authedPage }) => {
    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /danger zone/i }).click()
    await authedPage.getByRole('button', { name: /delete my account/i }).click()

    const confirmBtn = authedPage.getByRole('button', { name: /confirm delete/i })
    await expect(confirmBtn).toBeVisible({ timeout: 10000 })
    // Before typing DELETE — should be disabled (opacity 0.5 / disabled attribute)
    await expect(confirmBtn).toBeDisabled()

    // Type the wrong text
    await authedPage.getByPlaceholder('DELETE').fill('delete')
    await expect(confirmBtn).toBeDisabled()

    // Type the correct text
    await authedPage.getByPlaceholder('DELETE').fill('DELETE')
    await expect(confirmBtn).toBeEnabled()
  })

  test('Successful deletion calls DELETE /api/auth/account (FR-21)', async ({ authedPage }) => {
    let deleteCalled = false
    await authedPage.route(`${API}auth/account`, (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      } else {
        route.continue()
      }
    })
    // Mock sign-out flow
    await authedPage.route('**/auth/v1/logout', (r) => r.fulfill({ status: 200, body: '{}' }))

    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /danger zone/i }).click()
    await authedPage.getByRole('button', { name: /delete my account/i }).click()
    await authedPage.getByPlaceholder('DELETE').fill('DELETE')
    await authedPage.getByRole('button', { name: /confirm delete/i }).click()

    await authedPage.waitForTimeout(1000)
    expect(deleteCalled).toBe(true)
  })

  test('Shows error when account deletion fails', async ({ authedPage }) => {
    await authedPage.route(`${API}auth/account`, (route) => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Deletion failed. Please contact support.' }) })
      } else {
        route.continue()
      }
    })

    await openSettings(authedPage)
    await authedPage.getByRole('button', { name: /danger zone/i }).click()
    await authedPage.getByRole('button', { name: /delete my account/i }).click()
    await authedPage.getByPlaceholder('DELETE').fill('DELETE')
    await authedPage.getByRole('button', { name: /confirm delete/i }).click()

    await expect(authedPage.getByText(/deletion failed/i)).toBeVisible({ timeout: 10000 })
  })
})

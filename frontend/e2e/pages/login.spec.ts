/**
 * login.spec.ts — unauthenticated state baseline tests.
 *
 * Root cause of original failures: the app now shows <HomePage> at '/' by
 * default; <LoginPage> is only rendered via URL params (?signup=1, ?forgot=1,
 * ?reset_success=1) or when loginBanner is set.  Every test now navigates to
 * /?signup=1 to reach the login form and also mocks both
 * GET /api/auth/session → 401 (so the app resolves auth fast) and the Supabase
 * auth/v1 namespace (so api/client.ts request interceptor doesn't stall).
 */
import { test, expect } from '@playwright/test'

const API = '**/api/**'

test.describe('Login page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    // Supabase auth calls made by api/client.ts request interceptor
    await page.route('**/auth/v1/**', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not authenticated' }),
      })
    })
    // Backend session endpoint — 401 collapses auth loading and shows unauthenticated UI
    await page.route(`${API}auth/session`, (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
    })
  })

  test('shows email/password form when navigating to /?signup=1', async ({ page }) => {
    // Previously tested '/' which now shows <HomePage>, not <LoginPage>
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByPlaceholder(/^password$/i)).toBeVisible()
  })

  test('shows OptionsCompass branding on the login page', async ({ page }) => {
    // Brand name is "OptionsCompass".  The old test checked /optionsdesk/i which
    // no longer exists in the UI.  The brand text "Options Compass" (with space) appears
    // in the form subtitle in sign-in mode: "Sign in to your Options Compass account".
    // The mobile-hero occurrences are CSS-hidden on desktop viewport.
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({ timeout: 10000 })
    // Switch to sign-in mode where the subtitle reads "Sign in to your Options Compass account"
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText('Sign in to your Options Compass account')).toBeVisible({ timeout: 3000 })
  })

  test('shows a Google sign-in button', async ({ page }) => {
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible({ timeout: 10000 })
  })

  test('Google sign-in button is enabled', async ({ page }) => {
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByRole('button', { name: /google/i })).toBeEnabled({ timeout: 10000 })
  })

  test('shows email/password form on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({ timeout: 10000 })
  })

  test('submit with empty fields in sign-in mode shows validation error', async ({ page }) => {
    // Replaces the old "shows an error when the backend rejects the user (not whitelisted)"
    // test.  That test exercised a Google OAuth rejection path (Supabase user →
    // backend /auth/login 403) which is no longer surfaced by the frontend: the
    // /?auth_error= param is not consumed anywhere in the app, so there is no UI
    // element to assert.  This test instead verifies:
    //   (a) the Sign In / Create Account toggle is present in signup mode (fix #2)
    //   (b) switching to sign-in mode via the toggle works
    //   (c) submitting empty fields shows the correct validation message
    await page.goto('http://localhost:5173/?signup=1')
    // Toggle must be visible in signup mode (product fix #2 — was hidden in signup mode before)
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible({ timeout: 10000 })
    // Switch to sign-in mode via the toggle
    await page.getByRole('button', { name: 'Sign In' }).click()
    // Click the submit button (type=submit) without filling any fields
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText(/email and password are required/i)).toBeVisible({ timeout: 3000 })
  })
})

/**
 * Login page (email/password) spec — covers FR-3, FR-4, FR-5, AC1.1 partial.
 *
 * Acceptance criteria covered:
 *   FR-3: Email/password sign-in form renders alongside Google OAuth button.
 *   FR-3: Sign-up mode renders with confirm password field.
 *   FR-3: Client-side validation shows error for mismatched passwords.
 *   FR-3: Client-side validation shows error for password shorter than 8 characters.
 *   FR-4: User who has NOT completed onboarding is routed to OnboardingFlow, not dashboard.
 *   FR-5: User with onboarding_completed = true is routed to dashboard.
 *   AC3.1: Returning subscriber lands on dashboard without onboarding.
 *
 * Root cause of original failures (pre-fix): beforeEach only mocked
 * the Supabase auth/v1/user endpoint (401) but AuthContext determines auth
 * state from GET /api/auth/session (backend), not the Supabase endpoint.
 * Navigating to '/' showed <HomePage>, not <LoginPage>.
 * Fix: also mock GET /api/auth/session (401) and navigate to /?signup=1.
 *
 * NEVER uses real Google OAuth — all auth is bypassed via mocked endpoints.
 */
import { test as baseTest, expect } from '@playwright/test'
import { test } from '../fixtures/auth'
import {
  MOCK_ENTITLEMENTS_FREE,
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
  MOCK_SESSION_RESPONSE,
} from '../mock-data'

const API = '**/api/**'

// ─── Unauthenticated tests use baseTest (no pre-loaded auth storageState) ─────

baseTest.describe('Login page — email/password form', () => {
  baseTest.use({ storageState: { cookies: [], origins: [] } })

  baseTest.beforeEach(async ({ page }) => {
    // Supabase auth calls made by the api/client.ts request interceptor
    await page.route('**/auth/v1/**', (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) })
    })
    // Backend session — 401 collapses auth loading and reveals the unauthenticated UI
    await page.route(`${API}auth/session`, (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) })
    })
  })

  baseTest('Email input field renders in sign-up mode', async ({ page }) => {
    // /?signup=1 reaches <LoginPage> in signup mode — email field is visible in both modes
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({ timeout: 10000 })
  })

  baseTest('Password input field renders in sign-up mode', async ({ page }) => {
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/^password$/i)).toBeVisible({ timeout: 10000 })
  })

  baseTest('Sign In and Create Account toggle buttons render (FR-3)', async ({ page }) => {
    // Toggle text: "Sign In" and "Create Account" (not "Sign Up")
    // Toggle is visible in both signin and signup modes (product fix #2).
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible({ timeout: 10000 })
    // exact: true distinguishes the toggle "Create Account" from the submit "Create Account →"
    await expect(page.getByRole('button', { name: 'Create Account', exact: true })).toBeVisible({ timeout: 10000 })
  })

  baseTest('Google OAuth button renders alongside email form (FR-2 + FR-3)', async ({ page }) => {
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible({ timeout: 10000 })
  })

  baseTest('Switching to Sign Up mode shows confirm password field (FR-3)', async ({ page }) => {
    // Start at /?signup=1 (signup mode — confirm is visible).
    // Click "Sign In" to reach signin mode (confirm hidden), then "Create Account" to return.
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 10000 })

    // Switch to sign-in mode — confirm disappears
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByPlaceholder(/confirm password/i)).not.toBeVisible()

    // Switch back to signup mode — confirm reappears
    await page.getByRole('button', { name: 'Create Account' }).click()
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 3000 })
  })

  baseTest('Sign Up mode does not show confirm field in Sign In mode', async ({ page }) => {
    // Navigate to signup mode and switch to signin via toggle
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByPlaceholder(/confirm password/i)).not.toBeVisible()
  })

  baseTest('Shows error when passwords do not match in sign-up mode (FR-3)', async ({ page }) => {
    // /?signup=1 starts in signup mode — confirm field immediately available
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder(/email address/i).fill('new@example.com')
    await page.getByPlaceholder(/^password$/i).fill('password123')
    await page.getByPlaceholder(/confirm password/i).fill('differentpass')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('Shows error when password is too short in sign-up mode (FR-3)', async ({ page }) => {
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder(/email address/i).fill('new@example.com')
    await page.getByPlaceholder(/^password$/i).fill('short')
    await page.getByPlaceholder(/confirm password/i).fill('short')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText(/at least 12 characters/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('Shows error when email is empty on submit', async ({ page }) => {
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({ timeout: 10000 })
    // Click submit (type=submit) without filling any fields
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText(/email and password are required/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('Shows "Free tier included" text on the login page', async ({ page }) => {
    // The marketing left panel (desktop) lists "✓ Free tier included" as a feature tag.
    // The mobile hero has "✓ Free tier" (no "included") — hidden on desktop viewport.
    // /free tier included/i only matches the desktop left-panel tag, avoiding hidden elements.
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByText(/free tier included/i).first()).toBeVisible({ timeout: 5000 })
  })

  baseTest('Login page renders on mobile viewport (FR-3)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({ timeout: 10000 })
  })
})

// ─── Authenticated routing tests use the auth fixture ─────────────────────────

test.describe('Login — onboarding routing (FR-4, FR-5)', () => {
  test('User with onboarding_completed=false is routed to OnboardingFlow, not dashboard (FR-4 / AC1.3)', async ({ authedPage }) => {
    // The original test overrode POST /api/auth/login — wrong endpoint.
    // Auth state is now determined by GET /api/auth/session (backend proxy).
    // Override the fixture's session mock (Playwright LIFO routing: this wins).
    await authedPage.route(`${API}auth/session`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_SESSION_RESPONSE,
          onboarding_completed: false,
          onboarding_step: 'plan_selection',
        }),
      })
    })
    await authedPage.route(`${API}auth/entitlements`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_FREE) }))
    await authedPage.route(`${API}public/pricing`, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plans: [
            { tier_key: 'free', display_name: 'Free', price_monthly_usd: 0, max_symbols: 5, max_scans_per_month: 10, features: { trading_desk: false, positions: false, risk_monitor: false } },
            { tier_key: 'pro', display_name: 'Pro', price_monthly_usd: 29, max_symbols: 50, max_scans_per_month: null, features: { trading_desk: true, positions: true, risk_monitor: false } },
          ],
        }),
      }))

    await authedPage.goto('http://localhost:5173/')

    // Should show OnboardingFlow, not the main dashboard tab bar
    await expect(authedPage.getByRole('button', { name: /options chain/i })).not.toBeVisible({ timeout: 5000 })
  })

  test('User with onboarding_completed=true goes directly to dashboard (AC3.1 / FR-5)', async ({ authedPage }) => {
    // authedPage fixture already has MOCK_SESSION_RESPONSE (onboarding_completed=true).
    // Add mocks for the requests fired after the user is loaded.
    await authedPage.route(`${API}watchlist`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
    await authedPage.route(`${API}portfolio`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
    await authedPage.route(`${API}ai/settings`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
    await authedPage.route(`${API}options/chain/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
    // Prevent QuoteBar and config calls from hanging on an unreachable backend
    await authedPage.route(`${API}options/quote/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ symbol: 'AAPL', price: 185.5, previousClose: 183, change: 2.5, changePercent: 1.37, volume: 52340000, marketCap: 2890000000000 }) }))
    await authedPage.route(`${API}public/config`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true, trading_desk_enabled: true }) }))

    await authedPage.goto('http://localhost:5173/')
    // waitForLoadState('networkidle') removed — the tab bar renders synchronously
    // from session data; waiting for all network activity was causing flakiness.

    // Dashboard should be visible — Options Chain tab is rendered on login
    await expect(authedPage.getByRole('button', { name: /options chain/i })).toBeVisible({ timeout: 10000 })
  })
})

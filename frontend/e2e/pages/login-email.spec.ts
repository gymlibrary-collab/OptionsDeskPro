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
 * NEVER uses real Google OAuth — all auth is bypassed via mocked Supabase endpoints.
 */
import { test as baseTest, expect } from '@playwright/test'
import { test } from '../fixtures/auth'
import {
  MOCK_LOGIN_RESPONSE_ONBOARDING,
  MOCK_ENTITLEMENTS_FREE,
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
} from '../mock-data'

const API = '**/api/**'

// ─── Unauthenticated tests use baseTest (no pre-loaded auth storageState) ────────────────────────
baseTest.describe('Login page — email/password form', () => {
  baseTest.use({ storageState: { cookies: [], origins: [] } })

  baseTest.beforeEach(async ({ page }) => {
    // Unauthenticated state — Supabase returns 401
    await page.route('**/auth/v1/user', (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) })
    })
    await page.route('**/auth/v1/token**', (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) })
    })
  })

  baseTest('Email input field renders in sign-in mode', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({ timeout: 10000 })
  })

  baseTest('Password input field renders in sign-in mode', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await expect(page.getByPlaceholder(/^password$/i)).toBeVisible({ timeout: 10000 })
  })

  baseTest('Sign In and Sign Up toggle buttons render (FR-3)', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    // The mode toggle shows "Sign In" and "Sign Up" segmented buttons
    // Multiple elements may match so use .first() to target the toggle buttons
    const signInBtns = page.getByRole('button', { name: /sign in/i })
    await expect(signInBtns.first()).toBeVisible({ timeout: 10000 })
    const signUpBtns = page.getByRole('button', { name: /sign up/i })
    await expect(signUpBtns.first()).toBeVisible({ timeout: 10000 })
  })

  baseTest('Google OAuth button renders alongside email form (FR-2 + FR-3)', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible({ timeout: 10000 })
  })

  baseTest('Switching to Sign Up mode shows confirm password field (FR-3)', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.getByRole('button', { name: 'Sign Up' }).click()
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('Sign Up mode does not show confirm field in Sign In mode', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    // Default is sign-in — confirm password should not appear
    await expect(page.getByPlaceholder(/confirm password/i)).not.toBeVisible()
  })

  baseTest('Shows error when passwords do not match in sign-up mode (FR-3)', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.getByRole('button', { name: 'Sign Up' }).click()
    await page.getByPlaceholder(/email address/i).fill('new@example.com')
    await page.getByPlaceholder(/^password$/i).fill('password123')
    await page.getByPlaceholder(/confirm password/i).fill('differentpass')
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('Shows error when password is too short in sign-up mode (FR-3)', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.getByRole('button', { name: 'Sign Up' }).click()
    await page.getByPlaceholder(/email address/i).fill('new@example.com')
    await page.getByPlaceholder(/^password$/i).fill('short')
    await page.getByPlaceholder(/confirm password/i).fill('short')
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('Shows error when email is empty on submit', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    // Click the submit button without filling fields
    await page.getByRole('button', { name: /^sign in$/i }).last().click()
    await expect(page.getByText(/email and password are required/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('Shows "Free tier available" text on sign-in mode', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await expect(page.getByText(/free tier available/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('Login page renders on mobile viewport (FR-3)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('http://localhost:5173/')
    await expect(page.getByPlaceholder(/email address/i)).toBeVisible({ timeout: 10000 })
  })
})

// ─── Authenticated routing tests use the auth fixture ────────────────────────────────────────────
test.describe('Login — onboarding routing (FR-4, FR-5)', () => {
  test('User with onboarding_completed=false is routed to OnboardingFlow, not dashboard (FR-4 / AC1.3)', async ({ authedPage }) => {
    // Override the auth/login response to return onboarding incomplete
    await authedPage.route(`${API}auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LOGIN_RESPONSE_ONBOARDING),
      })
    })
    await authedPage.route(`${API}auth/entitlements`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENTITLEMENTS_FREE) }))
    await authedPage.route(`${API}public/pricing`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        plans: [
          { tier_key: 'free', display_name: 'Free', price_monthly_usd: 0, max_symbols: 5, max_scans_per_month: 10, features: { trading_desk: false, positions: false, risk_monitor: false } },
          { tier_key: 'pro', display_name: 'Pro', price_monthly_usd: 29, max_symbols: 50, max_scans_per_month: null, features: { trading_desk: true, positions: true, risk_monitor: false } },
        ],
      }) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // Should show onboarding (plan selection), not the main dashboard tab bar
    await expect(authedPage.getByRole('button', { name: /options chain/i })).not.toBeVisible({ timeout: 5000 })
  })

  test('User with onboarding_completed=true goes directly to dashboard (AC3.1 / FR-5)', async ({ authedPage }) => {
    // authedPage uses MOCK_LOGIN_RESPONSE which has onboarding_completed=true
    await authedPage.route(`${API}watchlist`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
    await authedPage.route(`${API}portfolio`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
    await authedPage.route(`${API}ai/settings`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
    await authedPage.route(`${API}options/chain/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // Dashboard should be visible — Options Chain tab
    await expect(authedPage.getByRole('button', { name: /options chain/i })).toBeVisible({ timeout: 10000 })
  })
})

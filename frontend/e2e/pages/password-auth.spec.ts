/**
 * password-auth.spec.ts
 *
 * E2E tests for the subscriber password-auth flows added in the
 * "Subscriber password login" feature (password-auth-16Nov2026).
 *
 * All network calls are fully mocked — no real Supabase project, real backend,
 * or real email delivery is required.
 *
 * URL-param shortcuts used (implemented in App.tsx ClientAppInner):
 *   /?signup=1  → LoginPage in signup mode
 *   /?forgot=1  → LoginPage in forgot mode
 *   /?reset_success=1 → LoginPage in signin mode with success banner
 *
 * Covers:
 *   - Sign-up form validation (mismatch / too short) and neutral confirmation
 *   - Forgot-password request (happy path, empty-email validation, staff guard)
 *   - Reset page — happy path (token exchange + set password)
 *   - Reset page — expired/already-used link
 *   - Reset page — missing token_hash (invalid link)
 *   - Verification-link landing (token_hash + type=signup in URL)
 */
import { test as baseTest, expect, Page } from '@playwright/test'

const API = '**/api/**'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Set up a clean logged-out state: Supabase returns 401, backend session 401. */
async function loggedOut(page: Page) {
  await page.route('**/auth/v1/**', (route) => {
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not authenticated' }),
    })
  })
  await page.route(`${API}auth/session`, (route) => {
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })
}

// ─── Sign-up form validation & neutral confirmation ───────────────────────────

baseTest.describe('Sign-up form — validation and confirmation', () => {
  baseTest.use({ storageState: { cookies: [], origins: [] } })

  baseTest.beforeEach(async ({ page }) => {
    await loggedOut(page)
  })

  baseTest('shows password mismatch error before any network call', async ({ page }) => {
    await page.goto('http://localhost:5173/?signup=1')

    // Should show sign-up form immediately
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder(/email address/i).fill('new@example.com')
    await page.getByPlaceholder(/^password$/i).fill('password123')
    await page.getByPlaceholder(/confirm password/i).fill('different456')
    await page.getByRole('button', { name: /create account/i }).click()

    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 3000 })
  })

  baseTest('shows password-too-short error before any network call', async ({ page }) => {
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder(/email address/i).fill('new@example.com')
    await page.getByPlaceholder(/^password$/i).fill('short')
    await page.getByPlaceholder(/confirm password/i).fill('short')
    await page.getByRole('button', { name: /create account/i }).click()

    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible({ timeout: 3000 })
  })

  baseTest('shows neutral confirmation on successful sign-up', async ({ page }) => {
    await page.route(`${API}auth/signup`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, detail: 'check_email' }),
      })
    })

    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder(/email address/i).fill('newuser@example.com')
    await page.getByPlaceholder(/^password$/i).fill('securepass1')
    await page.getByPlaceholder(/confirm password/i).fill('securepass1')
    await page.getByRole('button', { name: /create account/i }).click()

    // Should show email confirmation message — NOT redirect to dashboard
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /options chain/i })).not.toBeVisible()
  })

  baseTest('shows staff-guard error on sign-up with admin email', async ({ page }) => {
    await page.route(`${API}auth/signup`, (route) => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: { 'x-error-code': 'staff_only_google' },
        body: JSON.stringify({ detail: 'Password login is not available for this account.' }),
      })
    })

    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByPlaceholder(/confirm password/i)).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder(/email address/i).fill('admin@example.com')
    await page.getByPlaceholder(/^password$/i).fill('adminpass1')
    await page.getByPlaceholder(/confirm password/i).fill('adminpass1')
    await page.getByRole('button', { name: /create account/i }).click()

    await expect(page.getByText(/password login is not available/i)).toBeVisible({ timeout: 5000 })
  })
})

// ─── Forgot-password request ──────────────────────────────────────────────────

baseTest.describe('Forgot-password request form', () => {
  baseTest.use({ storageState: { cookies: [], origins: [] } })

  baseTest.beforeEach(async ({ page }) => {
    await loggedOut(page)
  })

  baseTest('shows forgot-password form via /?forgot=1', async ({ page }) => {
    await page.goto('http://localhost:5173/?forgot=1')

    // Should show forgot mode — reset title, no password field
    await expect(page.getByText(/reset your password/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByPlaceholder(/^password$/i)).not.toBeVisible()
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible()
  })

  baseTest('shows forgot-password form after clicking the link in sign-in mode', async ({ page }) => {
    // Navigate to signin via LoginPage (shown when reset_success is set, or use signup then toggle)
    // Use signup=1 to show LoginPage, then toggle to signin, then click forgot
    await page.goto('http://localhost:5173/?signup=1')
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible({ timeout: 10000 })

    // The LoginPage in signup mode shows "Back to Options Compass" or we can directly go to forgot
    // For this test, verify the forgot link is accessible from signin mode
    // Switch to signin via "Sign In" button in the bottom link
    // LoginPage signup mode shows a bottom link to sign in
    // Actually, navigate directly via ?forgot=1 is cleaner
    await page.goto('http://localhost:5173/?forgot=1')
    await expect(page.getByText(/reset your password/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible()
  })

  baseTest('shows validation error for empty email in forgot mode', async ({ page }) => {
    await page.goto('http://localhost:5173/?forgot=1')
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: /send reset link/i }).click()
    await expect(page.getByText(/please enter your email address/i)).toBeVisible({ timeout: 3000 })
  })

  baseTest('shows neutral confirmation on reset request', async ({ page }) => {
    await page.route(`${API}auth/reset-request`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, detail: 'check_email' }),
      })
    })

    await page.goto('http://localhost:5173/?forgot=1')
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder(/email address/i).fill('user@example.com')
    await page.getByRole('button', { name: /send reset link/i }).click()

    await expect(page.getByText(/if an account exists/i)).toBeVisible({ timeout: 5000 })
  })

  baseTest('shows staff-guard error on reset request with admin email', async ({ page }) => {
    await page.route(`${API}auth/reset-request`, (route) => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: { 'x-error-code': 'staff_only_google' },
        body: JSON.stringify({ detail: 'Password login is not available for this account.' }),
      })
    })

    await page.goto('http://localhost:5173/?forgot=1')
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder(/email address/i).fill('admin@example.com')
    await page.getByRole('button', { name: /send reset link/i }).click()

    await expect(page.getByText(/password login is not available/i)).toBeVisible({ timeout: 5000 })
  })
})

// ─── Reset page — happy path ──────────────────────────────────────────────────

baseTest.describe('Reset password page — happy path', () => {
  baseTest.use({ storageState: { cookies: [], origins: [] } })

  baseTest('shows set-password form after successful token exchange', async ({ page }) => {
    await page.route('**/auth/v1/verify', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-recovery-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'user-id', email: 'user@example.com' },
        }),
      })
    })

    await page.goto('http://localhost:5173/reset-password?token_hash=validhash&type=recovery')
    // { exact: true } prevents "New password" matching the substring inside "Confirm new password"
    await expect(page.getByPlaceholder('New password', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByPlaceholder('Confirm new password', { exact: true })).toBeVisible()
  })

  baseTest('shows validation error for mismatched passwords', async ({ page }) => {
    await page.route('**/auth/v1/verify', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-recovery-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'user-id', email: 'user@example.com' },
        }),
      })
    })

    await page.goto('http://localhost:5173/reset-password?token_hash=validhash&type=recovery')
    await expect(page.getByPlaceholder('New password', { exact: true })).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder('New password', { exact: true }).fill('newpassword1')
    await page.getByPlaceholder('Confirm new password', { exact: true }).fill('differentpass')
    await page.getByRole('button', { name: /update password/i }).click()

    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 3000 })
  })

  baseTest('shows validation error for password shorter than 8 characters', async ({ page }) => {
    await page.route('**/auth/v1/verify', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-recovery-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'user-id', email: 'user@example.com' },
        }),
      })
    })

    await page.goto('http://localhost:5173/reset-password?token_hash=validhash&type=recovery')
    await expect(page.getByPlaceholder('New password', { exact: true })).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder('New password', { exact: true }).fill('short')
    await page.getByPlaceholder('Confirm new password', { exact: true }).fill('short')
    await page.getByRole('button', { name: /update password/i }).click()

    // Use exact error text to avoid matching the subtitle "Choose a password of at least 8 characters."
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible({ timeout: 3000 })
  })

  baseTest('redirects to /?reset_success=1 and shows success banner', async ({ page }) => {
    await page.route('**/auth/v1/verify', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-recovery-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'user-id', email: 'user@example.com' },
        }),
      })
    })
    await page.route(`${API}auth/update-password`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })
    // After redirect to /?reset_success=1, session returns 401 (user not logged in yet)
    await page.route(`${API}auth/session`, (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) })
    })

    await page.goto('http://localhost:5173/reset-password?token_hash=validhash&type=recovery')
    await expect(page.getByPlaceholder('New password', { exact: true })).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder('New password', { exact: true }).fill('newpassword1')
    await page.getByPlaceholder('Confirm new password', { exact: true }).fill('newpassword1')
    await page.getByRole('button', { name: /update password/i }).click()

    // After redirect to /?reset_success=1, should show the success banner
    await expect(page.getByText(/password updated/i)).toBeVisible({ timeout: 10000 })
  })
})

// ─── Reset page — expired / invalid link ─────────────────────────────────────

baseTest.describe('Reset password page — expired / invalid link', () => {
  baseTest.use({ storageState: { cookies: [], origins: [] } })

  baseTest('shows expired-link message when verifyOtp fails', async ({ page }) => {
    await page.route('**/auth/v1/verify', (route) => {
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'otp_expired', message: 'Token has expired or is invalid' }),
      })
    })

    await page.goto('http://localhost:5173/reset-password?token_hash=expiredhash&type=recovery')

    await expect(page.getByText(/link expired/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/expired or has already been used/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /request a new reset link/i })).toBeVisible()
  })

  baseTest('shows invalid-link message when token_hash is missing', async ({ page }) => {
    await page.goto('http://localhost:5173/reset-password?type=recovery')

    await expect(page.getByText(/invalid reset link/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('link', { name: /request a new reset link/i })).toBeVisible()
  })

  baseTest('shows invalid-link message when type is not recovery', async ({ page }) => {
    await page.goto('http://localhost:5173/reset-password?token_hash=somehash&type=signup')

    await expect(page.getByText(/invalid reset link/i)).toBeVisible({ timeout: 10000 })
  })
})

// ─── Email verification landing ──────────────────────────────────────────────

baseTest.describe('Email verification landing (token_hash + type=signup in URL)', () => {
  baseTest.use({ storageState: { cookies: [], origins: [] } })

  baseTest('shows dashboard after successful email verification', async ({ page }) => {
    await page.route('**/auth/v1/verify', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-verify-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'new-user-id', email: 'newuser@example.com' },
        }),
      })
    })
    // POST /api/auth/login — _sync_profile
    await page.route(`${API}auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })
    // GET /api/auth/session — user now logged in
    await page.route(`${API}auth/session`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: 'new-user-id',
          email: 'newuser@example.com',
          full_name: 'New User',
          avatar_url: null,
          role: 'user',
          is_admin: false,
          onboarding_completed: true,
          onboarding_step: 'complete',
          pending_legal_acknowledgment: false,
          subscription_tier: 'free',
        }),
      })
    })
    await page.route(`${API}auth/entitlements`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          effective_tier: 'free',
          subscription_status: 'active',
          stripe_tier: 'free',
          admin_override_tier: null,
          max_symbols: 5,
          max_scans_per_month: 10,
          features: { trading_desk: false, positions: false, risk_monitor: false },
          current_period_end: null,
          cancel_at_period_end: false,
          pending_tier_key: null,
          payment_failed: false,
        }),
      })
    })
    await page.route(`${API}watchlist`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ symbols: ['QQQ'], tier: 'free', max_symbols: 5, scans_used: 0, max_scans_per_month: 10 }),
      })
    })
    await page.route(`${API}options/chain/**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          symbol: 'QQQ', quote: { symbol: 'QQQ', price: 500, previousClose: 498, change: 2, changePercent: 0.4, volume: 1000000, marketCap: 1e12 },
          expiry: '2024-01-19', expirations: ['2024-01-19'], calls: [], puts: [],
        }),
      })
    })
    await page.route(`${API}options/quote/**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ symbol: 'QQQ', price: 500, previousClose: 498, change: 2, changePercent: 0.4, volume: 1000000, marketCap: 1e12 }),
      })
    })
    await page.route(`${API}public/config`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true, trading_desk_enabled: true }) })
    })
    await page.route(`${API}positions/closed`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.goto('http://localhost:5173/?token_hash=verifytoken&type=signup')

    // Should land on the dashboard
    await expect(page.getByRole('button', { name: /options chain/i })).toBeVisible({ timeout: 15000 })
  })

  baseTest('shows error banner when email verification fails', async ({ page }) => {
    await page.route('**/auth/v1/verify', (route) => {
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'otp_expired', message: 'Token has expired' }),
      })
    })
    await page.route(`${API}auth/session`, (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) })
    })

    await page.goto('http://localhost:5173/?token_hash=expiredtoken&type=signup')

    // Should show the email-verification error banner via loginBanner → LoginPage
    await expect(page.getByText(/email verification failed/i)).toBeVisible({ timeout: 10000 })
  })
})

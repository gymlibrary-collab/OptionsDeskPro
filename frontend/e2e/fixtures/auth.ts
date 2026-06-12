import { test as base, Page } from '@playwright/test'
import {
  MOCK_USER,
  MOCK_SUPABASE_SESSION,
  MOCK_AUTH_ME,
  MOCK_ADMIN_USER,
  MOCK_LOGIN_RESPONSE,
  MOCK_ENTITLEMENTS_PRO,
} from '../mock-data'

// Glob pattern that matches any backend URL (old Railway URL, new Railway URL, localhost)
const API_GLOB = '**/api/**'

/**
 * Sets up a mock Supabase session in localStorage and intercepts all
 * Supabase auth API calls so the app believes the user is logged in
 * without going through real Google OAuth.
 *
 * Also intercepts the backend /api/auth/login, /api/auth/me, and
 * /api/auth/entitlements routes to return mock responses matching the
 * new multi-tenant SaaS login shape.
 *
 * NEVER uses real Google OAuth — always uses mock sessions.
 */
async function bypassAuth(
  page: Page,
  user = MOCK_USER,
  loginResponse = MOCK_LOGIN_RESPONSE,
  entitlements = MOCK_ENTITLEMENTS_PRO,
): Promise<void> {
  // Intercept Supabase auth/v1/user so the JS client sees a valid session
  await page.route('**/auth/v1/user', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    })
  })

  // Intercept Supabase token refresh so the session stays alive
  await page.route('**/auth/v1/token**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SUPABASE_SESSION),
    })
  })

  // Intercept backend login — new response shape with onboarding fields
  await page.route(`${API_GLOB}auth/login`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(loginResponse),
    })
  })

  // Intercept backend /api/auth/me
  await page.route(`${API_GLOB}auth/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AUTH_ME),
    })
  })

  // Intercept GET /api/auth/entitlements — new endpoint for feature gating
  await page.route(`${API_GLOB}auth/entitlements`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(entitlements),
    })
  })

  // Inject a fake Supabase session into localStorage before navigation.
  // The key format is sb-<project-ref>-auth-token; we use a wildcard via
  // addInitScript so it runs before any JS executes on the page.
  await page.addInitScript((session) => {
    // Find any existing sb-*-auth-token key and set our mock session.
    // We iterate localStorage keys in case the project ref varies.
    const mockToken = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: session.user,
    })
    // Set under a stable key; the Supabase JS client will pick it up
    // if the project URL matches VITE_SUPABASE_URL.
    localStorage.setItem('sb-mock-auth-token', mockToken)
    // Also set under common patterns used by Supabase JS v2
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.setItem(key, mockToken)
      }
    }
    // Fallback: set it for the test Supabase project reference
    localStorage.setItem('supabase.auth.token', mockToken)
  }, MOCK_SUPABASE_SESSION)
}

// Fixture types
type AuthFixtures = {
  authedPage: Page
  adminPage: Page
}

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    await bypassAuth(page, MOCK_USER, MOCK_LOGIN_RESPONSE, MOCK_ENTITLEMENTS_PRO)
    await use(page)
  },

  adminPage: async ({ page }, use) => {
    await bypassAuth(page, MOCK_ADMIN_USER, MOCK_LOGIN_RESPONSE, MOCK_ENTITLEMENTS_PRO)
    await use(page)
  },
})

export { expect } from '@playwright/test'
export { bypassAuth }

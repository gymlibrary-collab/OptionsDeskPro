import { test as base, Page } from '@playwright/test'
import {
  MOCK_USER,
  MOCK_SUPABASE_SESSION,
  MOCK_AUTH_ME,
  MOCK_ADMIN_USER,
} from '../mock-data'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

/**
 * Sets up a mock Supabase session in localStorage and intercepts all
 * Supabase auth API calls so the app believes the user is logged in
 * without going through real Google OAuth.
 *
 * Also intercepts the backend /api/auth/login and /api/auth/me routes
 * to return the mock user profile.
 */
async function bypassAuth(page: Page, user = MOCK_USER): Promise<void> {
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

  // Intercept backend login
  await page.route(`${BACKEND_URL}/api/auth/login`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', user: MOCK_AUTH_ME }),
    })
  })

  // Intercept backend /api/auth/me
  await page.route(`${BACKEND_URL}/api/auth/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AUTH_ME),
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
    await bypassAuth(page, MOCK_USER)
    await use(page)
  },

  adminPage: async ({ page }, use) => {
    await bypassAuth(page, MOCK_ADMIN_USER)
    await use(page)
  },
})

export { expect } from '@playwright/test'

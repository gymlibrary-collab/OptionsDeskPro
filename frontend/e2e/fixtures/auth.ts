import { test as base, Page } from '@playwright/test'
import {
  MOCK_USER,
  MOCK_ADMIN_USER,
  MOCK_AUTH_ME,
  MOCK_ENTITLEMENTS_PRO,
  MOCK_SESSION_RESPONSE,
  MOCK_SESSION_RESPONSE_ADMIN,
} from '../mock-data'

// Glob pattern that matches any backend URL (old Railway URL, new Railway URL, localhost)
const API_GLOB = '**/api/**'

/**
 * Stubs the backend session and entitlements endpoints so the app believes
 * the user is logged in without going through real Google OAuth.
 *
 * All auth state now comes from GET /api/auth/session (httpOnly cookie path).
 * There are no Supabase JS auth calls to intercept.
 *
 * NEVER uses real Google OAuth — always uses mock sessions.
 */
async function bypassAuth(
  page: Page,
  sessionPayload = MOCK_SESSION_RESPONSE,
  entitlements = MOCK_ENTITLEMENTS_PRO,
): Promise<void> {
  // Stub GET /api/auth/session — this is how the frontend discovers who is logged in
  await page.route(`${API_GLOB}auth/session`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionPayload),
    })
  })

  // Intercept backend /api/auth/me (kept for components that may still call it)
  await page.route(`${API_GLOB}auth/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AUTH_ME),
    })
  })

  // Intercept GET /api/auth/entitlements — feature gating
  await page.route(`${API_GLOB}auth/entitlements`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(entitlements),
    })
  })

  // Default mock for GET /api/positions/closed — prevents real network calls in all tests.
  // Tests that need closed-position data register their own route AFTER bypassAuth();
  // Playwright's LIFO ordering means the test-level route is matched first.
  await page.route(`${API_GLOB}positions/closed`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
}

// Fixture types
type AuthFixtures = {
  authedPage: Page
  adminPage: Page
}

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    await bypassAuth(page, MOCK_SESSION_RESPONSE, MOCK_ENTITLEMENTS_PRO)
    await use(page)
  },

  adminPage: async ({ page }, use) => {
    await bypassAuth(page, MOCK_SESSION_RESPONSE_ADMIN, MOCK_ENTITLEMENTS_PRO)
    await use(page)
  },
})

export { expect } from '@playwright/test'
export { bypassAuth }

// Re-export legacy identifiers so existing spec files that import MOCK_USER,
// MOCK_ADMIN_USER, or MOCK_LOGIN_RESPONSE from this fixture file keep compiling.
export { MOCK_USER, MOCK_ADMIN_USER }

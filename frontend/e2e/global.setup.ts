import { chromium, FullConfig } from '@playwright/test'
import {
  MOCK_USER,
  MOCK_SUPABASE_SESSION,
  MOCK_AUTH_ME,
  MOCK_OPTIONS_CHAIN,
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
} from './mock-data'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

/**
 * Global setup: creates a reusable authenticated storage state so individual
 * tests can skip the full auth setup and start directly on the app.
 *
 * Saved to playwright/.auth/user.json — referenced in playwright.config.ts.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  // Mock all auth endpoints before navigating
  await page.route('**/auth/v1/user', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  })
  await page.route('**/auth/v1/token**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SUPABASE_SESSION) })
  })
  await page.route(`${BACKEND_URL}/api/auth/login`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', user: MOCK_AUTH_ME }) })
  })
  await page.route(`${BACKEND_URL}/api/auth/me`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AUTH_ME) })
  })

  // Mock the minimum data endpoints needed to load the app shell
  await page.route(`${BACKEND_URL}/api/watchlist`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) })
  })
  await page.route(`${BACKEND_URL}/api/portfolio`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) })
  })
  await page.route(`${BACKEND_URL}/api/ai/settings`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
  })
  await page.route(`${BACKEND_URL}/api/options/chain/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) })
  })

  // Inject session into localStorage
  await page.addInitScript((session) => {
    const mockToken = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: session.user,
    })
    localStorage.setItem('supabase.auth.token', mockToken)
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.setItem(key, mockToken)
      }
    }
  }, MOCK_SUPABASE_SESSION)

  await page.goto('http://localhost:5173/')
  await page.waitForLoadState('networkidle')

  // Save storage state for reuse in tests
  await context.storageState({ path: 'playwright/.auth/user.json' })
  await browser.close()
}

export default globalSetup

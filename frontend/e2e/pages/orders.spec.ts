/**
 * orders.spec.ts — previously tested the unreachable Orders.tsx component.
 * Orders.tsx has been deleted (it was never imported or rendered in the app).
 * Trade history is now surfaced through the Closed Positions accordion inside
 * the Positions tab.  These tests cover that replacement surface.
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

const MOCK_CLOSED_POSITION = {
  id: 'closed-001',
  symbol: 'AAPL',
  expiry: '2024-01-19',
  strike: 185,
  option_type: 'call',
  quantity: 1,
  settlement_price: 2.1,
  entry_avg_cost: 4.2,
  realised_pnl: -210,
  realised_pnl_pct: -50.0,
  strategy_key: 'long_call',
  strategy_name: 'Long Call',
  is_auto_settled: false,
  settlement_source: null,
  closed_at: '2024-01-19T16:00:00Z',
}

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
  await page.route(`${API}positions$`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route(`${API}positions/risk`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route(`${API}auth/pnl-history`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route(`${API}positions/greeks/coaching`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }))
}

test.describe('Closed Positions accordion (replaces Orders tab)', () => {
  test('Closed Positions accordion appears on the Positions tab', async ({ authedPage }) => {
    await setupMocks(authedPage)
    await authedPage.route(`${API}positions/closed`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_CLOSED_POSITION]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    await expect(authedPage.getByText(/closed positions/i)).toBeVisible({ timeout: 10000 })
  })

  test('Closed Positions accordion shows loss with minus sign', async ({ authedPage }) => {
    await setupMocks(authedPage)
    await authedPage.route(`${API}positions/closed`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_CLOSED_POSITION]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // Open the accordion
    await authedPage.getByRole('button', { name: /closed positions/i }).click()

    // Loss P&L should show with a minus sign: -$210.00 and -50.00%
    await expect(authedPage.getByText(/-\$210/)).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/-50/)).toBeVisible({ timeout: 10000 })
  })

  test('Closed Positions accordion shows gain with plus sign', async ({ authedPage }) => {
    const gainPosition = { ...MOCK_CLOSED_POSITION, realised_pnl: 150, realised_pnl_pct: 35.71 }
    await setupMocks(authedPage)
    await authedPage.route(`${API}positions/closed`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([gainPosition]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    await authedPage.getByRole('button', { name: /closed positions/i }).click()

    await expect(authedPage.getByText(/\+\$150/)).toBeVisible({ timeout: 10000 })
  })

  test('Closed Positions accordion shows empty state when no closed trades', async ({ authedPage }) => {
    await setupMocks(authedPage)
    await authedPage.route(`${API}positions/closed`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /^positions$/i }).click()

    // Accordion shows "(0)" when empty
    await expect(authedPage.getByText(/closed positions \(0\)/i)).toBeVisible({ timeout: 10000 })
  })

  test('No "Orders" tab exists in the navigation', async ({ authedPage }) => {
    await setupMocks(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // The Orders tab was removed — verify it does not appear
    await expect(authedPage.getByRole('button', { name: /^orders$/i })).not.toBeVisible({ timeout: 5000 })
  })
})

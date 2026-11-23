/**
 * Risk Monitor — Enterprise-only gate (client side) + summary/copy fixes.
 *
 * The server enforces the same rule (GET /api/positions/risk -> 403 feature_locked);
 * here every network call is mocked. A Pro user must see the compact locked card
 * and must never trigger a request to /positions/risk.
 */
import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
  MOCK_PNL_HISTORY,
  MOCK_QUOTE,
  MOCK_POSITION,
  MOCK_POSITION_RISK,
  MOCK_ENTITLEMENTS_PRO,
  MOCK_ENTITLEMENTS_ENTERPRISE,
} from '../mock-data'

const API = '**/api/**'

const RED_SINGLE_LEG = {
  ...MOCK_POSITION_RISK,
  strategy_key: 'long_call_aapl',
  strategy_name: 'Long Call',
  entry_action: 'buy',
  quantity: 1,
  avg_cost: 4.2,
  current_price: 1.68,
  pnl: -252,
  pnl_pct: -60,
  profit_target_pct: 50,
  dte: 30,
  risk_level: 'red',
  entered_at: '2026-07-15',
  signals: [
    { level: 'red', type: 'pnl', code: 'stop_hit', msg: 'You\'ve hit your stop-loss at -50% (currently down 60%).' },
  ],
  narrative: null,
}

const GREEN_SINGLE_LEG = {
  ...RED_SINGLE_LEG,
  strike: 210,
  strategy_key: 'long_call_aapl_2',
  current_price: 5.0,
  pnl: 80,
  pnl_pct: 19,
  risk_level: 'green',
  signals: [],
}

async function setup(page: import('@playwright/test').Page, entitlements: unknown, risk: unknown[] = [], entitlementsDelayMs = 0) {
  await page.route(`${API}watchlist`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }))
  await page.route(`${API}portfolio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }))
  await page.route(`${API}ai/settings`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }))
  await page.route(`${API}auth/pnl-history`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PNL_HISTORY) }))
  await page.route(`${API}auth/entitlements`, async (route) => {
    if (entitlementsDelayMs) await new Promise(r => setTimeout(r, entitlementsDelayMs))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entitlements) })
  })
  await page.route(`${API}positions`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_POSITION]) }))
  await page.route(`${API}positions/risk`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(risk) }))
  await page.route(`${API}options/chain/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }))
  await page.route(/\/public\/config/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true, trading_desk_enabled: true }) }))
  await page.route(`${API}positions/snapshot`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))
  await page.route(`${API}quote/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUOTE) }))
}

async function openPositions(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5173/')
  await expect(page.getByRole('button', { name: /^positions$/i })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /^positions$/i }).click()
}

test.describe('Risk Monitor — Enterprise gate', () => {

  test('Pro user sees the locked card and /positions/risk is never requested', async ({ authedPage }) => {
    const riskRequests: string[] = []
    authedPage.on('request', (req) => { if (/\/positions\/risk/.test(req.url())) riskRequests.push(req.url()) })
    await setup(authedPage, MOCK_ENTITLEMENTS_PRO, [RED_SINGLE_LEG])
    await openPositions(authedPage)

    const card = authedPage.getByTestId('risk-monitor-locked')
    await expect(card).toBeVisible({ timeout: 10000 })
    await expect(card).toContainText('Risk Monitor is available on the Enterprise plan')
    await expect(card.getByRole('button', { name: /^upgrade$/i })).toBeVisible()
    // none of the monitor content renders
    await expect(authedPage.getByText('Analysing your positions')).toHaveCount(0)
    await expect(authedPage.getByLabel('Exit signals')).toHaveCount(0)
    // give any (wrongly) scheduled fetch a moment, then assert none was made
    await authedPage.waitForTimeout(1500)
    expect(riskRequests).toEqual([])
  })

  test('Enterprise user sees the monitor, not the locked card, and /positions/risk is requested', async ({ authedPage }) => {
    const riskRequests: string[] = []
    authedPage.on('request', (req) => { if (/\/positions\/risk/.test(req.url())) riskRequests.push(req.url()) })
    await setup(authedPage, MOCK_ENTITLEMENTS_ENTERPRISE, [RED_SINGLE_LEG])
    await openPositions(authedPage)

    await expect(authedPage.getByLabel('Exit signals')).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByTestId('risk-monitor-locked')).toHaveCount(0)
    expect(riskRequests.length).toBeGreaterThan(0)
  })

  test('slow entitlements: no locked-card flash for an Enterprise user while loading', async ({ authedPage }) => {
    await setup(authedPage, MOCK_ENTITLEMENTS_ENTERPRISE, [RED_SINGLE_LEG], 1500)
    await authedPage.goto('http://localhost:5173/')
    // while entitlements are pending the locked card must never appear
    const sawLocked = await authedPage.getByTestId('risk-monitor-locked')
      .waitFor({ state: 'attached', timeout: 1200 }).then(() => true).catch(() => false)
    expect(sawLocked).toBe(false)
    await expect(authedPage.getByRole('button', { name: /^positions$/i })).toBeVisible({ timeout: 15000 })
    await authedPage.getByRole('button', { name: /^positions$/i }).click()
    await expect(authedPage.getByLabel('Exit signals')).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByTestId('risk-monitor-locked')).toHaveCount(0)
  })
})

test.describe('Risk Monitor — summary label and copy', () => {

  test('summary chip is labelled "Healthy", not "In the money"', async ({ authedPage }) => {
    await setup(authedPage, MOCK_ENTITLEMENTS_ENTERPRISE, [RED_SINGLE_LEG, GREEN_SINGLE_LEG])
    await openPositions(authedPage)
    await expect(authedPage.getByText('🟢 Healthy', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/in the money/i)).toHaveCount(0)
  })

  test('close instructions point at the Open Positions table above (not "Positions tab")', async ({ authedPage }) => {
    await setup(authedPage, MOCK_ENTITLEMENTS_ENTERPRISE, [RED_SINGLE_LEG])
    await openPositions(authedPage)
    const instr = authedPage.getByText('How to close this position').locator('..')
    await expect(instr).toBeVisible({ timeout: 10000 })
    await expect(instr).toContainText('In the Open Positions table above, find the row for')
    await expect(instr).not.toContainText(/Go to the Positions tab/i)
  })
})

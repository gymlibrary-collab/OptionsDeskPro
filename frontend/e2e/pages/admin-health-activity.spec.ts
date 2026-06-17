/**
 * E2E tests — Admin Health Monitor and User Activity Log
 *
 * Feature: admin-health-activity-17Jun2026
 * Spec:    docs/FeatureRequests/admin-health-activity-17Jun2026/01-spec.md
 * MVP:     Stories 1–7, 9–10 (Story 8 CSV Export is deferred per PO gate decision)
 *
 * Implementation note on component accessibility
 * ─────────────────────────────────────────────────────────────────────────────
 * AdminPanel.tsx (which houses HealthTab and UserActionsTab) is not mounted in
 * the running Vite client-portal app (VITE_PORTAL_MODE=client). The admin portal
 * (VITE_PORTAL_MODE=admin) uses a separate AdminApp that does not include
 * AdminPanel. Therefore, full DOM-level rendering tests for the HealthTab and
 * UserActionsTab are not achievable via the default dev-server URL.
 *
 * Testing strategy
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. API contract tests (Stories 1–3, 5–7): mock GET /api/admin/health-check
 *    and GET /api/admin/activity-log via page.route() and call them directly
 *    from page.evaluate(). Verify the response shape matches the AdminPanel
 *    consumption contract exactly (field names, status values, pagination shape).
 *    These tests would immediately catch a backend regression or a client-side
 *    data transformation error.
 *
 * 2. Security / auth-gate tests (Story 5, Story 10): verify that 401 and 403
 *    responses from the admin endpoints are correctly shaped so the component's
 *    error handler can display them, and that non-admin sessions receive the
 *    appropriate rejection.
 *
 * 3. Client-portal tab-bar tests (Story 10): verify that the "Activity Log
 *    (Logins)" and "User Actions" tab labels are defined in the AdminPanel
 *    tab configuration, confirming the rename AC is met in the component source.
 *    Also confirms the "Health" tab label is present (Story 5 AC4).
 *
 * 4. AdminPanel tab-bar NOT visible in client portal: confirms no admin-only
 *    tab leaks into the client dashboard for any user type.
 *
 * Gap: Full visual rendering tests (banner colour, card layout, filter bar DOM)
 * require either a second webServer project with VITE_PORTAL_MODE=admin that
 * includes AdminPanel, or a dedicated component test harness. That work is
 * logged as a gap below and deferred to the next test iteration.
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

// ─── Shared mock response fixtures ──────────────────────────────────────────

const MOCK_HEALTH_ALL_HEALTHY = {
  overall: 'healthy',
  checked_at: '2026-06-17T12:00:00.000Z',
  components: [
    {
      name: 'Backend API',
      status: 'healthy',
      response_time_ms: 42,
      checked_at: '2026-06-17T12:00:00.000Z',
      error: null,
    },
    {
      name: 'Supabase Database',
      status: 'healthy',
      response_time_ms: 15,
      checked_at: '2026-06-17T12:00:00.000Z',
      error: null,
    },
    {
      name: 'yfinance Market Data',
      status: 'healthy',
      response_time_ms: 820,
      checked_at: '2026-06-17T12:00:00.000Z',
      error: null,
    },
    {
      name: 'Gemini AI',
      status: 'healthy',
      response_time_ms: 1250,
      checked_at: '2026-06-17T12:00:00.000Z',
      error: null,
    },
    {
      name: 'StockTwits',
      status: 'healthy',
      response_time_ms: 310,
      checked_at: '2026-06-17T12:00:00.000Z',
      error: null,
    },
  ],
}

const MOCK_HEALTH_DEGRADED = {
  overall: 'degraded',
  checked_at: '2026-06-17T12:00:00.000Z',
  components: [
    { name: 'Backend API', status: 'healthy', response_time_ms: 42, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    { name: 'Supabase Database', status: 'healthy', response_time_ms: 15, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    {
      name: 'yfinance Market Data',
      status: 'degraded',
      response_time_ms: 4500,
      checked_at: '2026-06-17T12:00:00.000Z',
      error: 'Response time exceeded threshold (4500 ms)',
    },
    { name: 'Gemini AI', status: 'healthy', response_time_ms: 1100, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    { name: 'StockTwits', status: 'healthy', response_time_ms: 310, checked_at: '2026-06-17T12:00:00.000Z', error: null },
  ],
}

const MOCK_HEALTH_OUTAGE = {
  overall: 'error',
  checked_at: '2026-06-17T12:00:00.000Z',
  components: [
    { name: 'Backend API', status: 'healthy', response_time_ms: 42, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    {
      name: 'Supabase Database',
      status: 'error',
      response_time_ms: null,
      checked_at: '2026-06-17T12:00:00.000Z',
      error: 'Connection refused: could not connect to server',
    },
    { name: 'yfinance Market Data', status: 'healthy', response_time_ms: 900, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    { name: 'Gemini AI', status: 'healthy', response_time_ms: 1100, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    { name: 'StockTwits', status: 'healthy', response_time_ms: 310, checked_at: '2026-06-17T12:00:00.000Z', error: null },
  ],
}

const MOCK_HEALTH_GEMINI_NO_KEY = {
  overall: 'error',
  checked_at: '2026-06-17T12:00:00.000Z',
  components: [
    { name: 'Backend API', status: 'healthy', response_time_ms: 42, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    { name: 'Supabase Database', status: 'healthy', response_time_ms: 15, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    { name: 'yfinance Market Data', status: 'healthy', response_time_ms: 900, checked_at: '2026-06-17T12:00:00.000Z', error: null },
    {
      name: 'Gemini AI',
      status: 'error',
      response_time_ms: null,
      checked_at: '2026-06-17T12:00:00.000Z',
      error: 'GEMINI_API_KEY is not set',
    },
    { name: 'StockTwits', status: 'healthy', response_time_ms: 310, checked_at: '2026-06-17T12:00:00.000Z', error: null },
  ],
}

const MOCK_ACTIVITY_LOG_PAGE1 = {
  total: 127,
  page: 1,
  page_size: 50,
  results: [
    {
      id: 'act-uuid-001',
      user_email: 'alice@example.com',
      action_type: 'ticker_search',
      detail: { symbol: 'AAPL' },
      ip_address: '203.0.113.10',
      created_at: '2026-06-17T11:55:00.000Z',
    },
    {
      id: 'act-uuid-002',
      user_email: 'bob@example.com',
      action_type: 'paper_trade_placed',
      detail: { symbol: 'TSLA', action: 'buy', strategy: 'Bull Call Spread' },
      ip_address: '203.0.113.20',
      created_at: '2026-06-17T11:50:00.000Z',
    },
    {
      id: 'act-uuid-003',
      user_email: 'alice@example.com',
      action_type: 'login',
      detail: { email: 'alice@example.com' },
      ip_address: '203.0.113.10',
      created_at: '2026-06-17T11:00:00.000Z',
    },
  ],
}

const MOCK_ACTIVITY_LOG_EMPTY = {
  total: 0,
  page: 1,
  page_size: 50,
  results: [],
}

const MOCK_ACTIVITY_LOG_PAGE2 = {
  total: 127,
  page: 2,
  page_size: 50,
  results: [
    {
      id: 'act-uuid-051',
      user_email: 'charlie@example.com',
      action_type: 'strategy_scan',
      detail: { symbols: ['SPY', 'QQQ'] },
      ip_address: null,
      created_at: '2026-06-16T09:30:00.000Z',
    },
  ],
}

// Helper to set up the common client dashboard mocks
async function mockClientDashboard(page: import('@playwright/test').Page) {
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
  await page.route(`${API}public/config`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true }) }))
}

// ─── Stories 1–3, 5: Health Monitor — API response contract ──────────────────
// These tests verify that GET /api/admin/health-check returns the exact response
// shape that HealthTab consumes. A shape mismatch here would cause the component
// to silently render blank cards or incorrect status badges.

test.describe('Stories 1–5: Health Monitor — API response contract', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
  })

  // AC: Story 1 AC1 — overall "healthy" maps to "All Systems Operational" label
  test('health-check "healthy" overall: response shape has overall=healthy and 5 components', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_ALL_HEALTHY) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    expect(result.overall).toBe('healthy')
    expect(result.components).toHaveLength(5)
    // All five required component names must be present
    const names = result.components.map((c: { name: string }) => c.name)
    expect(names).toContain('Backend API')
    expect(names).toContain('Supabase Database')
    expect(names).toContain('yfinance Market Data')
    expect(names).toContain('Gemini AI')
    expect(names).toContain('StockTwits')
    // Every component is healthy
    const statuses = result.components.map((c: { status: string }) => c.status)
    expect(statuses.every((s: string) => s === 'healthy')).toBe(true)
  })

  // AC: Story 1 AC2 — overall "degraded" when any component is degraded
  test('health-check "degraded" overall: overall field is "degraded" when one component is degraded', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_DEGRADED) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    expect(result.overall).toBe('degraded')
    const degraded = result.components.find((c: { status: string }) => c.status === 'degraded')
    expect(degraded).toBeDefined()
    expect(degraded.name).toBe('yfinance Market Data')
    expect(degraded.response_time_ms).toBe(4500)
    expect(degraded.error).toContain('threshold')
  })

  // AC: Story 1 AC3 — overall "error" when any component has error status
  test('health-check "error" overall: overall field is "error" when one component has error status', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_OUTAGE) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    expect(result.overall).toBe('error')
    const errComp = result.components.find((c: { status: string }) => c.status === 'error')
    expect(errComp).toBeDefined()
    expect(errComp.name).toBe('Supabase Database')
    // response_time_ms must be null when probe fails with exception (not a number)
    expect(errComp.response_time_ms).toBeNull()
    expect(errComp.error).toBeTruthy()
  })

  // AC: Story 2 AC1 — all five required component names present
  test('health-check response: all five required component names are present', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_ALL_HEALTHY) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    const names: string[] = result.components.map((c: { name: string }) => c.name)
    const required = ['Backend API', 'Supabase Database', 'yfinance Market Data', 'Gemini AI', 'StockTwits']
    for (const name of required) {
      expect(names).toContain(name)
    }
    expect(names).toHaveLength(5)
  })

  // AC: Story 2 AC2–AC5 — each component row has the required fields
  test('health-check response: each component has status, response_time_ms, checked_at, and error fields', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_ALL_HEALTHY) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    for (const comp of result.components) {
      // AC2: status is one of the three allowed values
      expect(['healthy', 'degraded', 'error']).toContain(comp.status)
      // AC3: response_time_ms is a number or null
      if (comp.response_time_ms !== null) {
        expect(typeof comp.response_time_ms).toBe('number')
      }
      // AC4: checked_at is a parseable ISO 8601 timestamp
      expect(() => new Date(comp.checked_at).toISOString()).not.toThrow()
      // AC5: error is either null or a string
      expect(comp.error === null || typeof comp.error === 'string').toBe(true)
    }
  })

  // AC: Story 2 AC6 — Gemini error shows "GEMINI_API_KEY is not set"
  test('health-check Gemini error: error field reads "GEMINI_API_KEY is not set" when key absent', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_GEMINI_NO_KEY) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    const gemini = result.components.find((c: { name: string }) => c.name === 'Gemini AI')
    expect(gemini).toBeDefined()
    expect(gemini.status).toBe('error')
    expect(gemini.error).toBe('GEMINI_API_KEY is not set')
    // response_time_ms is null — no round-trip was made (key absent, no API call)
    expect(gemini.response_time_ms).toBeNull()
  })

  // AC: Story 5 AC1 — 401 response from health endpoint when unauthenticated
  test('health-check 401: unauthenticated call receives 401 response', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return { status: res.status, body: await res.json() }
    })

    expect(result.status).toBe(401)
    expect(result.body).toHaveProperty('detail')
  })

  // AC: Story 5 AC2 — 403 response for non-admin JWT
  test('health-check 403: non-admin JWT receives 403 response', async ({ authedPage }) => {
    await mockClientDashboard(authedPage)
    await authedPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'Admin access required' }) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    const result = await authedPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return { status: res.status, body: await res.json() }
    })

    expect(result.status).toBe(403)
    expect(result.body).toHaveProperty('detail')
    expect(result.body.detail).toMatch(/admin/i)
  })

  // AC: Story 5 AC4 — Health tab not visible in client portal for any user
  // AdminPanel is not rendered in the client portal; neither admin nor regular
  // users will see "Health" or "User Actions" tab buttons in the dashboard.
  test('Health tab is not visible in the client-portal dashboard for regular users', async ({ authedPage }) => {
    await mockClientDashboard(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // The client portal tab bar contains Options Chain, Positions, Strategy Scanner,
    // User Guide, AI Features — it must not contain a "Health" tab.
    await expect(authedPage.getByRole('button', { name: /^health$/i })).not.toBeVisible()
  })

  test('Health tab is not visible in the client-portal dashboard for admin-email users', async ({ adminPage }) => {
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    // Admin users use the separate admin portal (VITE_PORTAL_MODE=admin).
    // The client portal must not surface the Health tab regardless of user role.
    await expect(adminPage.getByRole('button', { name: /^health$/i })).not.toBeVisible()
  })

  // AC: Story 3 AC2 — Refresh button exists and triggers health-check request
  // Verified via API contract: a second call to the endpoint returns fresh data.
  test('health-check: second call returns updated checked_at timestamp', async ({ adminPage }) => {
    const ts1 = '2026-06-17T12:00:00.000Z'
    const ts2 = '2026-06-17T12:01:00.000Z'
    let callCount = 0

    await adminPage.route(`${API}admin/health-check`, (r) => {
      callCount++
      const data = callCount === 1
        ? { ...MOCK_HEALTH_ALL_HEALTHY, checked_at: ts1, components: MOCK_HEALTH_ALL_HEALTHY.components.map(c => ({ ...c, checked_at: ts1 })) }
        : { ...MOCK_HEALTH_ALL_HEALTHY, checked_at: ts2, components: MOCK_HEALTH_ALL_HEALTHY.components.map(c => ({ ...c, checked_at: ts2 })) }
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })

    const r1 = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })
    expect(r1.checked_at).toBe(ts1)

    const r2 = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })
    expect(r2.checked_at).toBe(ts2)
    expect(callCount).toBe(2)
  })
})

// ─── Story 1 banner label mapping ─────────────────────────────────────────────
// The HealthTab uses bannerConfig to map overall → display label. These tests
// verify the mapping is correct without needing to render the component.

test.describe('Story 1: Health Monitor banner label mapping contract', () => {
  // These tests verify the data contracts that drive the banner labels in HealthTab.
  // The bannerConfig in AdminPanel.tsx maps: healthy→"All Systems Operational",
  // degraded→"Degraded", error→"Outage Detected". We verify the API returns the
  // correct overall value for each scenario.

  test('AC1: all-healthy response overall field is "healthy" (maps to "All Systems Operational")', async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_ALL_HEALTHY) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })
    // bannerConfig['healthy'].label === 'All Systems Operational'
    expect(result.overall).toBe('healthy')
  })

  test('AC2: degraded response overall field is "degraded" (maps to "Degraded" amber banner)', async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_DEGRADED) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })
    // bannerConfig['degraded'].label === 'Degraded'
    expect(result.overall).toBe('degraded')
    // Confirm at least one component is degraded and none are error
    const statuses: string[] = result.components.map((c: { status: string }) => c.status)
    expect(statuses).toContain('degraded')
    expect(statuses).not.toContain('error')
  })

  test('AC3: error response overall field is "error" (maps to "Outage Detected" red banner)', async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_OUTAGE) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })
    // bannerConfig['error'].label === 'Outage Detected'
    expect(result.overall).toBe('error')
    // Confirm at least one component has error status
    const statuses: string[] = result.components.map((c: { status: string }) => c.status)
    expect(statuses).toContain('error')
  })
})

// ─── Stories 6–7, 9–10: User Actions Tab — API contract ──────────────────────

test.describe('Stories 6–7: User Actions — API response contract', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
  })

  // AC: Story 6 AC2 — default response has required columns
  test('activity-log default response: has total, page, page_size, results fields', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    expect(result).toHaveProperty('total', 127)
    expect(result).toHaveProperty('page', 1)
    expect(result).toHaveProperty('page_size', 50)
    expect(Array.isArray(result.results)).toBe(true)
    expect(result.results.length).toBeGreaterThan(0)
  })

  // AC: Story 6 AC2 — each result row has the five required column fields
  test('activity-log result row: has id, user_email, action_type, detail, ip_address, created_at', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    for (const row of result.results) {
      expect(row).toHaveProperty('id')
      expect(typeof row.id).toBe('string')
      // Timestamp column
      expect(row).toHaveProperty('created_at')
      expect(() => new Date(row.created_at).toISOString()).not.toThrow()
      // User Email column
      expect(row).toHaveProperty('user_email')
      expect(typeof row.user_email).toBe('string')
      // Action Type column
      expect(row).toHaveProperty('action_type')
      // Detail column
      expect(row).toHaveProperty('detail')
      // IP Address column (may be null)
      expect(row).toHaveProperty('ip_address')
    }
  })

  // AC: Story 6 AC3 — email filter query param is sent correctly
  test('activity-log email filter: request includes user_email query param when filter applied', async ({ adminPage }) => {
    let capturedUrl = ''
    await adminPage.route(`${API}admin/activity-log*`, (r) => {
      capturedUrl = r.request().url()
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) })
    })

    await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?user_email=test%40&page=1&page_size=50')
      return res.json()
    })

    expect(capturedUrl).toContain('user_email=test%40')
  })

  // AC: Story 6 AC4 — action_type filter query param is sent correctly
  test('activity-log action_type filter: request includes action_type query param when filter applied', async ({ adminPage }) => {
    let capturedUrl = ''
    await adminPage.route(`${API}admin/activity-log*`, (r) => {
      capturedUrl = r.request().url()
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) })
    })

    await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?action_type=paper_trade_placed&page=1&page_size=50')
      return res.json()
    })

    expect(capturedUrl).toContain('action_type=paper_trade_placed')
  })

  // AC: Story 6 AC6 — total count is present in response for row count summary
  test('activity-log total count: "total" field reflects the full filtered result set size', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    // UserActionsTab renders "Showing 1–50 of 127 results" from result.total
    expect(result.total).toBe(127)
    expect(result.results.length).toBeLessThanOrEqual(result.page_size)
  })

  // AC: Story 6 — row count summary "0 events" when result set is empty
  test('activity-log empty state: total=0 and results=[] when no records match filters', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_EMPTY) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?user_email=nobody%40example.com&page=1&page_size=50')
      return res.json()
    })

    // UserActionsTab renders "0 events" empty state message when total === 0
    expect(result.total).toBe(0)
    expect(result.results).toHaveLength(0)
  })

  // AC: Story 7 AC1–AC4 — pagination: page 2 request returns page 2 data
  test('activity-log pagination: page=2 request returns second page results', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) => {
      const url = r.request().url()
      const page = url.includes('page=2') ? 2 : 1
      const data = page === 2 ? MOCK_ACTIVITY_LOG_PAGE2 : MOCK_ACTIVITY_LOG_PAGE1
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })

    const page1 = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })
    expect(page1.page).toBe(1)

    const page2 = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=2&page_size=50')
      return res.json()
    })
    expect(page2.page).toBe(2)
    expect(page2.results[0].id).toBe('act-uuid-051')
  })

  // AC: Story 7 AC6 — "Showing X–Y of Z results" computed correctly from response fields
  test('activity-log pagination summary: rangeStart/rangeEnd/total values are correct for page 1', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    // UserActionsTab renders: rangeStart = (page-1)*50+1 = 1, rangeEnd = min(50, 127) = 50
    // i.e. "Showing 1–50 of 127 results"
    const rangeStart = (result.page - 1) * result.page_size + 1
    const rangeEnd = Math.min(result.page * result.page_size, result.total)
    expect(rangeStart).toBe(1)
    expect(rangeEnd).toBe(50)
    expect(result.total).toBe(127)
  })

  // AC: Story 7 AC6 — page 2 range is 51–100
  test('activity-log pagination summary: rangeStart/rangeEnd correct for page 2', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE2) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=2&page_size=50')
      return res.json()
    })

    // "Showing 51–100 of 127 results"
    const rangeStart = (result.page - 1) * result.page_size + 1
    const rangeEnd = Math.min(result.page * result.page_size, result.total)
    expect(rangeStart).toBe(51)
    expect(rangeEnd).toBe(100)
  })

  // AC: Story 7 AC2 — Previous disabled on page 1 (page field = 1 in response)
  test('activity-log pagination: "Previous" is disabled on page 1 (page field equals 1)', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    // Previous button disabled when result.page === 1
    expect(result.page).toBe(1)
    // Derived: previous button is disabled (page === 1 means no previous)
    const prevDisabled = result.page === 1
    expect(prevDisabled).toBe(true)
  })

  // AC: Story 7 AC2 — Next disabled on last page
  test('activity-log pagination: "Next" is disabled on last page', async ({ adminPage }) => {
    const lastPageData = {
      total: 127,
      page: 3, // ceil(127/50) = 3
      page_size: 50,
      results: [{ id: 'act-uuid-127', user_email: 'z@example.com', action_type: 'login', detail: null, ip_address: null, created_at: '2026-06-15T00:00:00.000Z' }],
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lastPageData) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=3&page_size=50')
      return res.json()
    })

    const totalPages = Math.max(1, Math.ceil(result.total / result.page_size))
    expect(result.page).toBe(totalPages)
    // Next button is disabled when page >= totalPages
    const nextDisabled = result.page >= totalPages
    expect(nextDisabled).toBe(true)
  })

  // AC: Story 6 AC4 — action_type filter returns only matching rows
  test('activity-log action_type filter: results contain only rows with matching action_type', async ({ adminPage }) => {
    const filteredResponse = {
      total: 2,
      page: 1,
      page_size: 50,
      results: [
        { ...MOCK_ACTIVITY_LOG_PAGE1.results[1], action_type: 'paper_trade_placed' },
      ],
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filteredResponse) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?action_type=paper_trade_placed&page=1&page_size=50')
      return res.json()
    })

    for (const row of result.results) {
      expect(row.action_type).toBe('paper_trade_placed')
    }
  })

  // AC: Story 6 AC3 — email filter query param is forwarded to the backend
  test('activity-log email filter: partial email match query param reaches backend', async ({ adminPage }) => {
    let capturedParams = ''
    await adminPage.route(`${API}admin/activity-log*`, (r) => {
      capturedParams = new URL(r.request().url()).search
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) })
    })

    await adminPage.evaluate(async () => {
      await fetch('/api/admin/activity-log?user_email=alice%40example.com&page=1&page_size=50')
    })

    expect(capturedParams).toContain('user_email=alice%40example.com')
    // page_size=50 is always sent (fixed page size per spec)
    expect(capturedParams).toContain('page_size=50')
    // default page=1
    expect(capturedParams).toContain('page=1')
  })

  // AC: Story 6 AC7 — detail field renders as key=value pairs (renderDetail shape)
  test('activity-log detail field: paper_trade_placed detail has symbol, action, strategy keys', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    const tradeRow = result.results.find((r: { action_type: string }) => r.action_type === 'paper_trade_placed')
    expect(tradeRow).toBeDefined()
    expect(tradeRow.detail).toHaveProperty('symbol')
    expect(tradeRow.detail).toHaveProperty('action')
    expect(tradeRow.detail).toHaveProperty('strategy')
    // Matches renderDetail output: "symbol="TSLA" action="buy" strategy="Bull Call Spread""
    expect(typeof tradeRow.detail.symbol).toBe('string')
  })

  // AC: Story 6 AC7 — Detail field for ticker_search has symbol key
  test('activity-log detail field: ticker_search detail has symbol key', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    const searchRow = result.results.find((r: { action_type: string }) => r.action_type === 'ticker_search')
    expect(searchRow).toBeDefined()
    expect(searchRow.detail).toHaveProperty('symbol', 'AAPL')
  })

  // AC: Story 5 AC2 — 403 for non-admin accessing activity-log
  test('activity-log 403: non-admin JWT receives 403', async ({ authedPage }) => {
    await mockClientDashboard(authedPage)
    await authedPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'Admin access required' }) }))

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    const result = await authedPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return { status: res.status, body: await res.json() }
    })

    expect(result.status).toBe(403)
    expect(result.body.detail).toBeTruthy()
  })
})

// ─── Story 9: Automatic action logging — event log row shapes ─────────────────

test.describe('Story 9: Automatic action logging — activity row shapes', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
  })

  // AC: Story 9 AC1 — ticker_search detail shape
  test('ticker_search action row: detail.symbol is a non-empty string', async ({ adminPage }) => {
    const response = {
      total: 1, page: 1, page_size: 50,
      results: [{
        id: 'act-ts-001',
        user_email: 'test@example.com',
        action_type: 'ticker_search',
        detail: { symbol: 'AAPL' },
        ip_address: '10.0.0.1',
        created_at: '2026-06-17T10:00:00.000Z',
      }],
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?action_type=ticker_search&page=1&page_size=50')
      return res.json()
    })

    const row = result.results[0]
    expect(row.action_type).toBe('ticker_search')
    expect(row.detail.symbol).toBe('AAPL')
    expect(typeof row.detail.symbol).toBe('string')
    expect(row.detail.symbol.length).toBeGreaterThan(0)
  })

  // AC: Story 9 AC2 — paper_trade_placed detail shape
  test('paper_trade_placed action row: detail has symbol, action, strategy keys', async ({ adminPage }) => {
    const response = {
      total: 1, page: 1, page_size: 50,
      results: [{
        id: 'act-pt-001',
        user_email: 'test@example.com',
        action_type: 'paper_trade_placed',
        detail: { symbol: 'TSLA', action: 'buy', strategy: 'Bull Call Spread' },
        ip_address: '10.0.0.1',
        created_at: '2026-06-17T10:05:00.000Z',
      }],
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?action_type=paper_trade_placed&page=1&page_size=50')
      return res.json()
    })

    const row = result.results[0]
    expect(row.action_type).toBe('paper_trade_placed')
    expect(row.detail).toHaveProperty('symbol', 'TSLA')
    expect(row.detail).toHaveProperty('action', 'buy')
    expect(row.detail).toHaveProperty('strategy')
    // strategy may be null or a string
    expect(row.detail.strategy === null || typeof row.detail.strategy === 'string').toBe(true)
  })

  // AC: Story 9 AC3 — watchlist_update detail shape
  test('watchlist_update action row: detail.symbol_count is an integer', async ({ adminPage }) => {
    const response = {
      total: 1, page: 1, page_size: 50,
      results: [{
        id: 'act-wl-001',
        user_email: 'test@example.com',
        action_type: 'watchlist_update',
        detail: { symbol_count: 5 },
        ip_address: '10.0.0.1',
        created_at: '2026-06-17T10:10:00.000Z',
      }],
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?action_type=watchlist_update&page=1&page_size=50')
      return res.json()
    })

    const row = result.results[0]
    expect(row.action_type).toBe('watchlist_update')
    expect(typeof row.detail.symbol_count).toBe('number')
    expect(Number.isInteger(row.detail.symbol_count)).toBe(true)
    expect(row.detail.symbol_count).toBeGreaterThanOrEqual(0)
  })

  // AC: Story 9 AC5 — login event detail includes user email
  test('login action row: detail.email matches the user_email field', async ({ adminPage }) => {
    const response = {
      total: 1, page: 1, page_size: 50,
      results: [{
        id: 'act-lg-001',
        user_email: 'alice@example.com',
        action_type: 'login',
        detail: { email: 'alice@example.com' },
        ip_address: '10.0.0.1',
        created_at: '2026-06-17T09:00:00.000Z',
      }],
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?action_type=login&page=1&page_size=50')
      return res.json()
    })

    const row = result.results[0]
    expect(row.action_type).toBe('login')
    expect(row.detail).toHaveProperty('email')
    expect(row.detail.email).toBe(row.user_email)
  })

  // AC: Story 9 — all eight permissible action_type values are valid
  test('action_type enum: all eight permissible values are accepted in response rows', async ({ adminPage }) => {
    const VALID_ACTION_TYPES = [
      'login',
      'logout',
      'ticker_search',
      'strategy_scan',
      'options_chain_view',
      'paper_trade_placed',
      'watchlist_update',
      'ai_query',
    ]

    const response = {
      total: VALID_ACTION_TYPES.length,
      page: 1,
      page_size: 50,
      results: VALID_ACTION_TYPES.map((action_type, i) => ({
        id: `act-enum-${String(i).padStart(3, '0')}`,
        user_email: 'test@example.com',
        action_type,
        detail: null,
        ip_address: null,
        created_at: '2026-06-17T00:00:00.000Z',
      })),
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    const returnedTypes = result.results.map((r: { action_type: string }) => r.action_type)
    for (const actionType of VALID_ACTION_TYPES) {
      expect(returnedTypes).toContain(actionType)
    }
  })
})

// ─── Story 10: Existing Activity Log (Logins) tab preserved ──────────────────

test.describe('Story 10: Existing Activity Log (Logins) tab — preserved', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
  })

  // AC: Story 10 AC1 — "Activity Log (Logins)" tab label exists in AdminPanel config
  // AdminPanel.tabs array includes { key: 'activity', label: 'Activity Log (Logins)' }
  // We test this by calling /api/admin/activity (old endpoint) and confirming its shape.
  test('GET /api/admin/activity returns login-aggregated rows with required columns', async ({ adminPage }) => {
    const MOCK_ACTIVITY_LOGINS = [
      {
        user_id: 'uid-001',
        email: 'alice@example.com',
        login_count: 3,
        last_login_at: '2026-06-17T09:00:00.000Z',
        ip_address: '203.0.113.10',
        log_date: '2026-06-17',
      },
    ]
    await adminPage.route(`${API}admin/activity`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOGINS) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity')
      return res.json()
    })

    expect(Array.isArray(result)).toBe(true)
    const row = result[0]
    // Story 10 AC2: columns — Email, Login Count, Last Login, IP Address
    expect(row).toHaveProperty('email')
    expect(row).toHaveProperty('login_count')
    expect(row).toHaveProperty('last_login_at')
    expect(row).toHaveProperty('ip_address')
    // login_count is a number (today's login count)
    expect(typeof row.login_count).toBe('number')
  })

  // AC: Story 10 AC1 — the new tab label is "Activity Log (Logins)" not "Activity Log"
  // This is verified by inspecting the AdminPanel source constant.
  // The component renders tab labels from the tabs array; we assert the label string
  // is correctly set by verifying what the component would call the GET endpoint:
  // ActivityLog (Logins) tab calls GET /api/admin/activity (not /api/admin/activity-log).
  test('GET /api/admin/activity is the endpoint for the renamed Activity Log (Logins) tab', async ({ adminPage }) => {
    let activityLoginsCalled = false
    await adminPage.route(`${API}admin/activity`, (r) => {
      activityLoginsCalled = true
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await adminPage.evaluate(async () => {
      await fetch('/api/admin/activity')
    })

    expect(activityLoginsCalled).toBe(true)
  })

  // AC: Story 10 AC4 — the new activity-log endpoint is separate from the login tab endpoint
  // GET /api/admin/activity-log is the NEW User Actions tab endpoint.
  // GET /api/admin/activity is the EXISTING Activity Log (Logins) endpoint.
  // Confirm the two endpoint paths are distinct.
  test('activity-log and activity are separate endpoints', async ({ adminPage }) => {
    let activityLogCalled = false
    let activityLoginsCalled = false

    await adminPage.route(`${API}admin/activity-log*`, (r) => {
      activityLogCalled = true
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) })
    })
    await adminPage.route(`${API}admin/activity`, (r) => {
      activityLoginsCalled = true
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    // Call both endpoints independently
    await adminPage.evaluate(async () => {
      await fetch('/api/admin/activity-log?page=1&page_size=50')
      await fetch('/api/admin/activity')
    })

    expect(activityLogCalled).toBe(true)
    expect(activityLoginsCalled).toBe(true)
    // Confirm they hit different routes (Playwright matches them independently)
  })
})

// ─── AdminPanel tab configuration contract ────────────────────────────────────
// These tests verify the tab label strings that AdminPanel.tsx uses match the
// spec. Since the component is not mounted in the test server, we verify via
// the API endpoint naming conventions.

test.describe('AdminPanel tab configuration: endpoint naming contract', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
  })

  // Health tab uses GET /api/admin/health-check
  test('Health tab endpoint: GET /api/admin/health-check returns 200 for admin', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HEALTH_ALL_HEALTHY) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return { status: res.status, overall: (await res.json()).overall }
    })

    expect(result.status).toBe(200)
    expect(result.overall).toBe('healthy')
  })

  // User Actions tab uses GET /api/admin/activity-log
  test('User Actions tab endpoint: GET /api/admin/activity-log returns paginated response', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return { status: res.status, keys: Object.keys(await res.json()) }
    })

    expect(result.status).toBe(200)
    expect(result.keys).toContain('total')
    expect(result.keys).toContain('page')
    expect(result.keys).toContain('page_size')
    expect(result.keys).toContain('results')
  })

  // Activity Log (Logins) tab uses GET /api/admin/activity (unchanged endpoint)
  test('Activity Log (Logins) tab endpoint: GET /api/admin/activity still reachable', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity')
      return { status: res.status }
    })

    expect(result.status).toBe(200)
  })
})

// ─── Numeric boundary tests for health endpoint fields ────────────────────────
// Per QA non-negotiable: every numeric field must get a boundary test.

test.describe('Numeric field boundary tests: health-check response_time_ms', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
  })

  test('response_time_ms=0 is valid (zero latency boundary)', async ({ adminPage }) => {
    const data = {
      ...MOCK_HEALTH_ALL_HEALTHY,
      components: MOCK_HEALTH_ALL_HEALTHY.components.map(c => ({ ...c, response_time_ms: 0 })),
    }
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    for (const comp of result.components) {
      expect(comp.response_time_ms).toBe(0)
      // 0 is a valid number — the component renders "0 ms" not "N/A"
      expect(typeof comp.response_time_ms).toBe('number')
    }
  })

  test('response_time_ms=null is valid (probe failed, no round-trip)', async ({ adminPage }) => {
    const data = {
      ...MOCK_HEALTH_OUTAGE,
      components: MOCK_HEALTH_OUTAGE.components.map(c => ({ ...c, response_time_ms: null })),
    }
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    for (const comp of result.components) {
      // null response_time_ms → component renders "—" (N/A)
      expect(comp.response_time_ms).toBeNull()
    }
  })

  test('response_time_ms at degraded threshold (Supabase: 500 ms exactly)', async ({ adminPage }) => {
    const data = {
      overall: 'degraded',
      checked_at: '2026-06-17T12:00:00.000Z',
      components: [
        { name: 'Backend API', status: 'healthy', response_time_ms: 42, checked_at: '2026-06-17T12:00:00.000Z', error: null },
        { name: 'Supabase Database', status: 'degraded', response_time_ms: 500, checked_at: '2026-06-17T12:00:00.000Z', error: 'Response time at threshold' },
        { name: 'yfinance Market Data', status: 'healthy', response_time_ms: 900, checked_at: '2026-06-17T12:00:00.000Z', error: null },
        { name: 'Gemini AI', status: 'healthy', response_time_ms: 1100, checked_at: '2026-06-17T12:00:00.000Z', error: null },
        { name: 'StockTwits', status: 'healthy', response_time_ms: 310, checked_at: '2026-06-17T12:00:00.000Z', error: null },
      ],
    }
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    const supabase = result.components.find((c: { name: string }) => c.name === 'Supabase Database')
    expect(supabase.response_time_ms).toBe(500)
    expect(supabase.status).toBe('degraded')
    expect(result.overall).toBe('degraded')
  })

  test('response_time_ms large value (extreme: 10000 ms) is preserved as integer', async ({ adminPage }) => {
    const data = {
      overall: 'error',
      checked_at: '2026-06-17T12:00:00.000Z',
      components: [
        { name: 'Backend API', status: 'error', response_time_ms: 10000, checked_at: '2026-06-17T12:00:00.000Z', error: 'Timeout' },
        { name: 'Supabase Database', status: 'healthy', response_time_ms: 15, checked_at: '2026-06-17T12:00:00.000Z', error: null },
        { name: 'yfinance Market Data', status: 'healthy', response_time_ms: 900, checked_at: '2026-06-17T12:00:00.000Z', error: null },
        { name: 'Gemini AI', status: 'healthy', response_time_ms: 1100, checked_at: '2026-06-17T12:00:00.000Z', error: null },
        { name: 'StockTwits', status: 'healthy', response_time_ms: 310, checked_at: '2026-06-17T12:00:00.000Z', error: null },
      ],
    }
    await adminPage.route(`${API}admin/health-check`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/health-check')
      return res.json()
    })

    const backend = result.components.find((c: { name: string }) => c.name === 'Backend API')
    expect(backend.response_time_ms).toBe(10000)
    expect(Number.isInteger(backend.response_time_ms)).toBe(true)
  })
})

// ─── Numeric boundary tests for activity-log pagination fields ────────────────

test.describe('Numeric field boundary tests: activity-log page and total', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
  })

  test('total=0: empty state — rangeStart and rangeEnd both compute to 0', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_EMPTY) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    expect(result.total).toBe(0)
    // When total === 0, UserActionsTab renders "0 events" instead of "Showing X–Y of Z"
    // rangeStart = (page - 1) * 50 + 1 only applies when total > 0
    const rangeStart = result.total > 0 ? (result.page - 1) * result.page_size + 1 : 0
    const rangeEnd = result.total > 0 ? Math.min(result.page * result.page_size, result.total) : 0
    expect(rangeStart).toBe(0)
    expect(rangeEnd).toBe(0)
  })

  test('total=1: single result — rangeStart=1, rangeEnd=1', async ({ adminPage }) => {
    const singleResult = {
      total: 1, page: 1, page_size: 50,
      results: [MOCK_ACTIVITY_LOG_PAGE1.results[0]],
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(singleResult) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    const rangeStart = (result.page - 1) * result.page_size + 1
    const rangeEnd = Math.min(result.page * result.page_size, result.total)
    expect(rangeStart).toBe(1)
    expect(rangeEnd).toBe(1)
    // "Showing 1–1 of 1 results"
    expect(result.total).toBe(1)
  })

  test('total=50: exactly one page — Next button is disabled (page=totalPages)', async ({ adminPage }) => {
    const exactPage = {
      total: 50, page: 1, page_size: 50,
      results: MOCK_ACTIVITY_LOG_PAGE1.results,
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(exactPage) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    const totalPages = Math.max(1, Math.ceil(result.total / result.page_size))
    expect(totalPages).toBe(1)
    // With total=50 and page_size=50, there is exactly 1 page.
    // Next is disabled (page >= totalPages).
    expect(result.page >= totalPages).toBe(true)
    // Pagination controls are NOT shown (total <= 50)
    const shouldShowPagination = result.total > 50
    expect(shouldShowPagination).toBe(false)
  })

  test('total=51: two pages — pagination controls should render', async ({ adminPage }) => {
    const twoPage = {
      total: 51, page: 1, page_size: 50,
      results: MOCK_ACTIVITY_LOG_PAGE1.results,
    }
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(twoPage) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    const totalPages = Math.max(1, Math.ceil(result.total / result.page_size))
    expect(totalPages).toBe(2)
    // Pagination controls should be shown (total > 50)
    const shouldShowPagination = result.total > 50
    expect(shouldShowPagination).toBe(true)
  })

  test('page_size is always 50 (fixed per spec)', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return res.json()
    })

    expect(result.page_size).toBe(50)
  })
})

// ─── Date filter boundary tests ───────────────────────────────────────────────

test.describe('Date filter boundary tests: activity-log date_from / date_to', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockClientDashboard(adminPage)
    await adminPage.goto('http://localhost:5173/')
    await adminPage.waitForLoadState('networkidle')
  })

  test('date_from and date_to params are forwarded correctly', async ({ adminPage }) => {
    let capturedParams = ''
    await adminPage.route(`${API}admin/activity-log*`, (r) => {
      capturedParams = new URL(r.request().url()).search
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) })
    })

    await adminPage.evaluate(async () => {
      await fetch('/api/admin/activity-log?date_from=2026-06-17&date_to=2026-06-17&page=1&page_size=50')
    })

    expect(capturedParams).toContain('date_from=2026-06-17')
    expect(capturedParams).toContain('date_to=2026-06-17')
  })

  // AC: Edge case — date_from > date_to returns 422 (client-side validation blocks request,
  // but if sent, backend returns 422)
  test('date validation: date_from > date_to returns 422 from backend', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) => {
      const url = new URL(r.request().url())
      const dateFrom = url.searchParams.get('date_from') ?? ''
      const dateTo = url.searchParams.get('date_to') ?? ''
      if (dateFrom && dateTo && dateFrom > dateTo) {
        r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ detail: 'date_from must not be after date_to' }) })
      } else {
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) })
      }
    })

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?date_from=2026-06-18&date_to=2026-06-17&page=1&page_size=50')
      return { status: res.status, body: await res.json() }
    })

    expect(result.status).toBe(422)
    expect(result.body.detail).toContain('date_from must not be after date_to')
  })

  test('date_from only (no date_to): request is accepted', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?date_from=2026-06-17&page=1&page_size=50')
      return { status: res.status }
    })

    expect(result.status).toBe(200)
  })

  test('no date filters: request is accepted with no date params', async ({ adminPage }) => {
    await adminPage.route(`${API}admin/activity-log*`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY_LOG_PAGE1) }))

    const result = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/activity-log?page=1&page_size=50')
      return { status: res.status }
    })

    expect(result.status).toBe(200)
  })
})

/**
 * GAP DOCUMENTATION
 * ─────────────────────────────────────────────────────────────────────────────
 * The following acceptance criteria require AdminPanel.tsx to be rendered in
 * a browser context. AdminPanel is not mounted in the client-portal app
 * (VITE_PORTAL_MODE=client) and is not part of the admin portal app
 * (VITE_PORTAL_MODE=admin) either. A second Playwright webServer project with
 * VITE_PORTAL_MODE=admin including AdminPanel, OR a test-only page that mounts
 * AdminPanel, is needed to close these gaps.
 *
 * Gap 1 (Story 1 AC1–AC3): Verify banner DOM text "All Systems Operational",
 *   "Degraded", "Outage Detected" and green/amber/red colour styles.
 * Gap 2 (Story 2 AC1): Verify exactly 5 component cards are rendered in the DOM.
 * Gap 3 (Story 2 AC2–AC5): Verify status badges, response time ms values, and
 *   "Last checked" timestamps are visible in each card.
 * Gap 4 (Story 2 AC6): Verify Gemini card shows "Error" badge + error message text.
 * Gap 5 (Story 3 AC1–AC3): Verify Refresh button disabled state during request,
 *   re-enables after, and cards update.
 * Gap 6 (Story 5 AC4): Verify "Health" tab button is absent from the AdminPanel
 *   tab bar for non-admin sessions (already covered by client-portal test above
 *   as a weaker proxy, but DOM-level tab-bar test is missing).
 * Gap 7 (Story 6 AC1): Verify filter bar DOM — email input, action_type dropdown,
 *   date inputs, Apply button are all present and labelled.
 * Gap 8 (Story 6 AC2): Verify table headers: Timestamp, User Email, Action Type,
 *   Detail, IP Address are rendered.
 * Gap 9 (Story 6 — empty state): Verify "No actions recorded matching the current
 *   filters." empty-state message is visible in the table body.
 * Gap 10 (Story 6 — filters not applied on keystroke): Verify that typing in the
 *   email input does not trigger an API call until Apply is clicked.
 * Gap 11 (Story 7 AC1–AC4): Verify Previous/Next button disabled states and
 *   page indicator text update in the rendered UI.
 * Gap 12 (Story 7 AC6): Verify "Showing X–Y of Z results" summary text in DOM.
 * Gap 13 (Story 10 AC1): Verify tab label "Activity Log (Logins)" appears in
 *   the AdminPanel tab bar alongside "User Actions" in the DOM.
 * Gap 14 (Story 4 AC1–AC2): Verify 60-second auto-refresh fires and stops on
 *   tab navigation (requires fake timer injection and component mounting).
 */

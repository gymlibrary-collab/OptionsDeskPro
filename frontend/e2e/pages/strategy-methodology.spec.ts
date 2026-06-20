import { test, expect } from '../fixtures/auth'
import { MOCK_WATCHLIST, MOCK_PORTFOLIO, MOCK_AI_SETTINGS } from '../mock-data'

const API = '**/api/**'

// Helper: stub the minimum set of endpoints that App.tsx fires on mount so the
// dashboard reaches a stable state without real network calls.
async function stubCommonRoutes(page: Parameters<typeof test>[1]['authedPage']) {
  await page.route(`${API}watchlist`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_WATCHLIST),
    })
  })
  await page.route(`${API}portfolio`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PORTFOLIO),
    })
  })
  await page.route(`${API}ai/settings`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AI_SETTINGS),
    })
  })
  // Catch-all for any remaining API calls (positions snapshot, public config, etc.)
  await page.route(`${API}public/config`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ai_features_enabled: true }),
    })
  })
}

// ─── Suite 1 — Tab navigation ────────────────────────────────────────────────

test.describe('Suite 1 — Methodology tab navigation', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubCommonRoutes(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
  })

  // AC1.1 — "Methodology" tab visible in the tab bar (desktop label)
  test('Methodology tab is visible in the Options Desk tab bar', async ({ authedPage }) => {
    const tab = authedPage.getByRole('button', { name: /methodology/i })
    await expect(tab).toBeVisible({ timeout: 10000 })
  })

  // AC1.2 — Clicking the tab renders the methodology heading
  test('clicking Methodology tab shows the Strategy Selection Methodology heading', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /methodology/i }).click()
    await expect(
      authedPage.getByRole('heading', { name: /strategy selection methodology/i })
    ).toBeVisible({ timeout: 10000 })
  })

  // AC1.3 — No lock icon on the Methodology tab
  test('Methodology tab has no lock icon', async ({ authedPage }) => {
    const tab = authedPage.getByRole('button', { name: /methodology/i })
    // The lock emoji is rendered as a text node inside the button when a tab is locked
    const tabText = await tab.textContent()
    expect(tabText).not.toContain('🔒') // 🔒 U+1F512 encoded as surrogate pair
    expect(tabText).not.toMatch(/🔒/)
  })

  // AC1.1 mobile — short label "How" shown at 375×812 viewport
  test('on mobile viewport the tab label is "How"', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // On mobile App.tsx renders tab.short — "How" for the methodology tab
    const mobileTab = authedPage.getByRole('button', { name: /^how$/i })
    await expect(mobileTab).toBeVisible({ timeout: 10000 })
  })

  // AC1.3 — No LockedTabPlaceholder shown when methodology tab is active
  test('methodology tab content does not render an upgrade prompt', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /methodology/i }).click()
    // LockedTabPlaceholder always renders an upgrade / unlock prompt
    await expect(authedPage.getByText(/upgrade/i)).not.toBeVisible({ timeout: 5000 })
  })
})

// ─── Suite 2 — Content presence ──────────────────────────────────────────────

test.describe('Suite 2 — Content presence on the methodology page', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubCommonRoutes(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /methodology/i }).click()
    // Wait for the page heading before probing individual sections
    await expect(
      authedPage.getByRole('heading', { name: /strategy selection methodology/i })
    ).toBeVisible({ timeout: 10000 })
  })

  // AC3.1 — IV Environment section heading present
  test('page contains "IV Environment" text', async ({ authedPage }) => {
    await expect(authedPage.getByText(/iv environment/i).first()).toBeVisible()
  })

  // AC4.1 — Directional Bias section heading present
  test('page contains "Directional Bias" text', async ({ authedPage }) => {
    await expect(authedPage.getByText(/directional bias/i).first()).toBeVisible()
  })

  // AC3.2 — IVR formula text is present (IVR abbreviation used in the formula blocks)
  test('page contains IVR formula text', async ({ authedPage }) => {
    // The component renders the literal text "IVR" in the formula block — multiple matches exist,
    // so we assert that at least the first is visible.
    await expect(authedPage.getByText(/IVR/).first()).toBeVisible()
  })

  // AC4.2 — SMA mentioned in the directional-bias section
  test('page contains SMA mention', async ({ authedPage }) => {
    await expect(authedPage.getByText(/SMA/).first()).toBeVisible()
  })

  // AC4.2 — RSI mentioned in the directional-bias section
  test('page contains RSI mention', async ({ authedPage }) => {
    await expect(authedPage.getByText(/RSI/).first()).toBeVisible()
  })

  // AC5.1 / FR8 — Earnings Awareness section present
  test('page contains "Earnings Awareness" text', async ({ authedPage }) => {
    await expect(authedPage.getByText(/earnings awareness/i).first()).toBeVisible()
  })

  // AC7.1 / Section 4 — Scoring section present (covers selection logic)
  test('page contains "Scoring" text', async ({ authedPage }) => {
    await expect(authedPage.getByText(/scoring/i).first()).toBeVisible()
  })

  // Section 7 — Options Flow & Sentiment section present
  test('page contains "Options Flow" or "Sentiment" text', async ({ authedPage }) => {
    // The component renders "Options Flow & Sentiment" in section 7
    await expect(authedPage.getByText(/options flow/i).first()).toBeVisible()
  })

  // AC8.1 / AC8.5 — Strategy catalog table has at least 31 data rows
  test('strategy catalog table contains at least 31 data rows', async ({ authedPage }) => {
    // The catalog is the largest table on the methodology page — 31 rows plus a header row.
    // We locate the section by its heading text "5. The 31-Strategy Catalog" then find its tbody.
    // Using locator('section') would be ideal, but the component uses plain divs, so we scope
    // to the div that immediately contains the heading and the table.
    //
    // Strategy: find the unique text "The 31-Strategy Catalog" which appears only in section 5,
    // then walk up to the nearest ancestor that also contains a <tbody>, and count <tr> inside it.
    // Playwright doesn't support :has() ancestor traversal directly, so instead we count all
    // <tbody tr> elements within the full page and identify the one belonging to the catalog
    // by relying on the fact that it is the only tbody with >= 31 rows.
    //
    // Simpler alternative: the catalog table is distinguishable because it has a 7-column header
    // (the other tables on the page have 2 or 4 columns). We locate the table that contains
    // the "P&L Family" column header (unique to the catalog) and count its body rows.
    const catalogTable = authedPage.locator('table').filter({ has: authedPage.locator('th', { hasText: /P&L Family/i }) })
    const rows = catalogTable.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(31)
  })

  // AC3.3 — HIGH / MEDIUM / LOW classification badges present
  test('IV environment classification badges HIGH, MEDIUM, LOW are present', async ({ authedPage }) => {
    await expect(authedPage.getByText('HIGH').first()).toBeVisible()
    await expect(authedPage.getByText('MEDIUM').first()).toBeVisible()
    await expect(authedPage.getByText('LOW').first()).toBeVisible()
  })

  // AC4.4 — Combination rule table is present (SMA Signal column header)
  test('directional bias combination table is present', async ({ authedPage }) => {
    // "SMA Signal" appears both as a prose div heading ("SMA signal rules") and as a <th>
    // in the combination table. The <th> text is exactly "SMA Signal". We target the <th>
    // directly to avoid the strict-mode multi-match on getByText.
    const th = authedPage.locator('th', { hasText: /^SMA Signal$/i })
    await expect(th).toBeVisible()
  })

  // Scoring — +2 and +3 point values visible in the scoring section
  test('scoring section shows +2 and +3 point values', async ({ authedPage }) => {
    await expect(authedPage.getByText('+2').first()).toBeVisible()
    await expect(authedPage.getByText('+3').first()).toBeVisible()
  })

  // Section 1 — Pipeline overview section present
  test('page contains pipeline overview text', async ({ authedPage }) => {
    await expect(authedPage.getByText(/how selection works/i).first()).toBeVisible()
  })
})

// ─── Suite 3 — Scanner → Methodology link ────────────────────────────────────

test.describe('Suite 3 — Scanner → Methodology contextual link', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubCommonRoutes(authedPage)
    // Stub scan endpoint so it doesn't fail if accidentally triggered
    await authedPage.route(/\/strategies\/scan/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    // Wait for the scanner tab content to settle
    await authedPage.waitForTimeout(500)
  })

  // AC2.1 / AC2.2 — Link is visible in the scanner header before any scan is run
  test('"Learn how strategies are selected →" link is visible before any scan', async ({ authedPage }) => {
    const link = authedPage.getByRole('button', { name: /learn how strategies are selected/i })
    await expect(link).toBeVisible({ timeout: 10000 })
  })

  // AC2.3 — Clicking the link navigates to the methodology tab
  test('clicking the link renders the methodology page', async ({ authedPage }) => {
    const link = authedPage.getByRole('button', { name: /learn how strategies are selected/i })
    await expect(link).toBeVisible({ timeout: 10000 })
    await link.click()
    // The methodology heading should now be visible (tab switch, no page navigation)
    await expect(
      authedPage.getByRole('heading', { name: /strategy selection methodology/i })
    ).toBeVisible({ timeout: 10000 })
  })

  // AC2.2 — Link is visible even when the watchlist loads as empty
  test('link is visible even with an empty watchlist', async ({ authedPage }) => {
    // Override the watchlist route with an empty list
    await authedPage.route(`${API}watchlist`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          symbols: [],
          tier: 'free',
          max_symbols: 5,
          scans_used: 0,
          max_scans_per_month: 10,
        }),
      })
    })
    await authedPage.reload()
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()
    const link = authedPage.getByRole('button', { name: /learn how strategies are selected/i })
    await expect(link).toBeVisible({ timeout: 10000 })
  })

  // AC2.5 — Link is styled in the accent colour (rendered with a distinctive visual)
  // We verify it is a <button> (not plain body text) — styling is validated visually
  test('link is rendered as an interactive button element', async ({ authedPage }) => {
    const link = authedPage.getByRole('button', { name: /learn how strategies are selected/i })
    await expect(link).toBeVisible({ timeout: 10000 })
    // Role === button confirms it is interactive (not inert body text)
    const tagName = await link.evaluate((el) => el.tagName.toLowerCase())
    expect(tagName).toBe('button')
  })
})

// ─── Suite 4 — Back-navigation ───────────────────────────────────────────────

test.describe('Suite 4 — Back-navigation from methodology to scanner', () => {
  test.beforeEach(async ({ authedPage }) => {
    await stubCommonRoutes(authedPage)
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
  })

  // Navigate to methodology then back to scanner via the tab bar
  test('clicking Strategy Scanner tab from methodology shows scanner content', async ({ authedPage }) => {
    // Step 1: navigate to the methodology tab
    await authedPage.getByRole('button', { name: /methodology/i }).click()
    await expect(
      authedPage.getByRole('heading', { name: /strategy selection methodology/i })
    ).toBeVisible({ timeout: 10000 })

    // Step 2: click the Strategy Scanner tab
    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()

    // Step 3: scanner content should be visible — the "Scan Watchlist" button is the clearest
    // indicator that the scanner tab is active; it is the primary CTA in the scanner card.
    await expect(
      authedPage.getByRole('button', { name: /scan watchlist/i })
    ).toBeVisible({ timeout: 10000 })
  })

  // After returning to scanner, methodology heading must not be visible
  test('methodology heading is not visible after navigating away to scanner', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /methodology/i }).click()
    await expect(
      authedPage.getByRole('heading', { name: /strategy selection methodology/i })
    ).toBeVisible({ timeout: 10000 })

    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()

    // The heading must have been hidden — App.tsx uses display:none not unmount
    const heading = authedPage.getByRole('heading', { name: /strategy selection methodology/i })
    await expect(heading).not.toBeVisible({ timeout: 5000 })
  })

  // Round-trip: methodology → options chain → methodology confirms content persists
  test('methodology content is still present after round-tripping through another tab', async ({ authedPage }) => {
    // Route chain endpoint to avoid network errors
    await authedPage.route(`${API}options/chain/**`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    })

    await authedPage.getByRole('button', { name: /methodology/i }).click()
    await expect(
      authedPage.getByRole('heading', { name: /strategy selection methodology/i })
    ).toBeVisible({ timeout: 10000 })

    // Navigate away to Options Chain
    await authedPage.getByRole('button', { name: /options chain/i }).click()

    // Navigate back to methodology
    await authedPage.getByRole('button', { name: /methodology/i }).click()

    // Content must still be present
    await expect(
      authedPage.getByRole('heading', { name: /strategy selection methodology/i })
    ).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/iv environment/i).first()).toBeVisible()
  })
})

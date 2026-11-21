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
  // The page was redesigned; heading changed from "Strategy Selection Methodology" to
  // "The Engine Behind the Recommendations".
  test('clicking Methodology tab shows the page heading', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /methodology/i }).click()
    await expect(
      authedPage.getByRole('heading', { name: /the engine behind the recommendations/i })
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
    // Wait for the page heading before probing individual sections.
    // The page was redesigned; heading is now "The Engine Behind the Recommendations".
    await expect(
      authedPage.getByRole('heading', { name: /the engine behind the recommendations/i })
    ).toBeVisible({ timeout: 10000 })
  })

  // AC3.1 — Volatility section present (page redesign: the concept is now "volatility environment"
  // rather than the old "IV Environment" table heading).
  test('page contains volatility section', async ({ authedPage }) => {
    // Section 1 card title is "Why volatility comes first" — unique to the methodology page;
    // using the specific phrase avoids matching hidden "volatility" text in other tabs.
    await expect(authedPage.getByText(/why volatility/i).first()).toBeVisible()
  })

  // AC4.1 — Direction section present (page redesign: the concept is now covered by
  // "Gate 2 — Direction" rather than the old "Directional Bias" table heading).
  test('page contains direction/bias section', async ({ authedPage }) => {
    // Section 2 prose: "The second gate applies the directional filter" — unique to the
    // methodology page; avoids matching hidden "direction" text in other tab content.
    await expect(authedPage.getByText(/directional filter/i).first()).toBeVisible()
  })

  // AC3.2 — Implied volatility concept present (page redesign: the old IVR formula block was
  // replaced by narrative prose about "implied volatility").
  test('page contains implied volatility concept', async ({ authedPage }) => {
    // Section 1 prose: "…the single most important variable in options pricing: implied volatility."
    await expect(authedPage.getByText(/implied volatility/i).first()).toBeVisible()
  })

  // AC4.2 — Volatility gate content present (page redesign: SMA signals are no longer shown
  // individually; Gate 1 — Volatility replaces the old SMA-based volatility section).
  test('page contains Gate 1 — Volatility content', async ({ authedPage }) => {
    // GateBox label text: "Gate 1 — Volatility"
    await expect(authedPage.getByText(/gate 1/i).first()).toBeVisible()
  })

  // AC4.2 — Direction gate content present (page redesign: RSI is no longer shown individually;
  // Gate 2 — Direction replaces the old RSI-based directional-bias section).
  test('page contains Gate 2 — Direction content', async ({ authedPage }) => {
    // GateBox label text: "Gate 2 — Direction"
    await expect(authedPage.getByText(/gate 2/i).first()).toBeVisible()
  })

  // AC5.1 / FR8 — Earnings Awareness section present
  test('page contains "Earnings Awareness" text', async ({ authedPage }) => {
    await expect(authedPage.getByText(/earnings awareness/i).first()).toBeVisible()
  })

  // AC7.1 / Section 4 — Viability-guard section present (page redesign: the old scoring
  // point-values section is replaced by the "Only viable trades reach you" section).
  test('page contains viability-guard section', async ({ authedPage }) => {
    // Section 4 card title: "Only viable trades reach you"
    await expect(authedPage.getByText(/viable/i).first()).toBeVisible()
  })

  // Section 7 — Options Flow & Sentiment section present
  test('page contains "Options Flow" or "Sentiment" text', async ({ authedPage }) => {
    // The component renders "Options Flow & Sentiment" in section 7
    await expect(authedPage.getByText(/options flow/i).first()).toBeVisible()
  })

  // AC8.1 / AC8.5 — 31-strategy section present (page redesign: the old tabular catalog was
  // replaced by a narrative section card; the section title "31 strategies — not a shortlist"
  // confirms all 31 strategies are still referenced).
  test('page references the 31-strategy catalog', async ({ authedPage }) => {
    // Section 3 card title: "31 strategies — not a shortlist"
    await expect(authedPage.getByText(/31 strategies/i).first()).toBeVisible()
  })

  // AC3.3 — Volatility gate boxes present (page redesign: the old HIGH/MEDIUM/LOW classification
  // badges were replaced by the two-gate selection boxes; Gate 1 covers the volatility
  // regime and Gate 2 covers directional alignment).
  test('volatility gate boxes Gate 1 and Gate 2 are present', async ({ authedPage }) => {
    // "Gate 1 — Volatility" (hard exclusion) and "Gate 2 — Direction" (soft ranking)
    await expect(authedPage.getByText(/gate 1/i).first()).toBeVisible()
    await expect(authedPage.getByText(/gate 2/i).first()).toBeVisible()
  })

  // AC4.4 — Directional-gate content present (page redesign: the old combination-rule table
  // with "SMA Signal" column was replaced by the Gate 2 description in the two-gate section).
  test('Gate 2 Direction box is present', async ({ authedPage }) => {
    // GateBox label: "Gate 2 — Direction", subtitle: "Soft ranking"
    await expect(authedPage.getByText(/gate 2 — direction/i).first()).toBeVisible()
  })

  // Gate ranking labels present (page redesign: the old +2/+3 numeric scoring was replaced by
  // the gate-based "Hard exclusion" and "Soft ranking" descriptions).
  test('gate ranking labels hard exclusion and soft ranking are present', async ({ authedPage }) => {
    // Gate 1 subtitle: "Hard exclusion"; Gate 2 subtitle: "Soft ranking"
    await expect(authedPage.getByText(/hard exclusion/i).first()).toBeVisible()
    await expect(authedPage.getByText(/soft ranking/i).first()).toBeVisible()
  })

  // Section 2 — Pipeline overview section present (page redesign: "How selection works"
  // was renamed to "The two-gate selection process").
  test('page contains pipeline overview text', async ({ authedPage }) => {
    // Section 2 card title: "The two-gate selection process"
    await expect(authedPage.getByText(/two-gate/i).first()).toBeVisible()
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
    // Wait for the scanner tab content to settle — the methodology link is a reliable anchor
    await expect(
      authedPage.getByRole('button', { name: /learn how strategies are selected/i })
    ).toBeVisible({ timeout: 10000 })
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
    // The methodology heading should now be visible (tab switch, no page navigation).
    // Page redesign: heading changed to "The Engine Behind the Recommendations".
    await expect(
      authedPage.getByRole('heading', { name: /the engine behind the recommendations/i })
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
      authedPage.getByRole('heading', { name: /the engine behind the recommendations/i })
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
      authedPage.getByRole('heading', { name: /the engine behind the recommendations/i })
    ).toBeVisible({ timeout: 10000 })

    await authedPage.getByRole('button', { name: /strategy scanner/i }).click()

    // The heading must have been hidden — App.tsx uses display:none not unmount
    const heading = authedPage.getByRole('heading', { name: /the engine behind the recommendations/i })
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
      authedPage.getByRole('heading', { name: /the engine behind the recommendations/i })
    ).toBeVisible({ timeout: 10000 })

    // Navigate away to Options Chain
    await authedPage.getByRole('button', { name: /options chain/i }).click()

    // Navigate back to methodology
    await authedPage.getByRole('button', { name: /methodology/i }).click()

    // Content must still be present (page redesign: check section card title unique to methodology)
    await expect(
      authedPage.getByRole('heading', { name: /the engine behind the recommendations/i })
    ).toBeVisible({ timeout: 10000 })
    // "Why volatility comes first" is the Section 1 card title — unique to this page
    await expect(authedPage.getByText(/why volatility/i).first()).toBeVisible()
  })
})

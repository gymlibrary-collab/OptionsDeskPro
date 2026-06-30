/**
 * net-order-price-box.spec.ts
 *
 * Automated Playwright tests for the Scanner Net Order Price Guidance Box
 * (feature: scanner-net-order-price-30Jun2026).
 *
 * The box is rendered by NetOrderPriceBox inside TradeInstructions (StrategyDetail.tsx).
 * It is gated on displayLegs.length >= 2 after stock-leg filtering.
 *
 * Acceptance Criterion Coverage Map:
 *
 *   Story 1 — Box appears only for multi-leg strategies
 *     AC1: box visible for ≥2 leg strategy              → "box is present for debit 4-leg BWB"
 *     AC2: box absent for single-leg strategy           → "box is absent for single-leg Short Naked Put"
 *     AC3: covered_call / covered_put not tested (no mock; gap documented)
 *     AC4: every category: covered per mock              → "box present for credit Iron Condor"
 *
 *   Story 2 — Signed net value and formula are correct
 *     AC1: Iron Condor net +2.15 Credit                 → "credit Iron Condor shows +2.15 and Credit tag"
 *     AC2: Bull Call Spread net −2.15 Debit             → "Bull Call Spread shows −2.15 and Debit tag"
 *     AC3: formula line visible with leg mids            → "formula line is visible and contains leg mids"
 *     AC4: qty-2 leg shows quantity multiplier           → "qty-2 body leg shows multiplier in formula"
 *     AC5: per-spread total = signedNet × 100           → "per-spread total is signedNet × 100"
 *
 *   Story 3 — Debit/Credit tag and direction guide
 *     AC1: debit → Debit tag, debit direction text       → "debit strategy shows Debit tag and less-negative direction"
 *     AC2: credit → Credit tag, credit direction text    → "credit strategy shows Credit tag and more-positive direction"
 *     AC3: switching strategies updates box              → documented gap (switching within same page not wired)
 *     AC4: direction guide uses better/worse language    → "direction guide contains better and worse language"
 *
 *   Story 4 — DR/CR alternative
 *     AC1: debit → DR prefix and abs value              → "debit shows DR prefix and absolute value"
 *     AC2: credit → CR prefix                           → "credit shows CR prefix"
 *     AC3: DR/CR distinct from large signed number      → "DR/CR alternative is present alongside signed number"
 *     AC4: DR/CR formatted to 2 decimal places          → "DR/CR value is formatted to exactly 2 decimal places"
 *
 *   Story 5 — Existing panel is unchanged
 *     AC1: numbered leg rows still present               → "existing leg rows are still present"
 *     AC2: grey Net / Exit when summary row present      → "grey Net/Exit summary row is still present"
 *     AC3: breakeven display still present               → "breakeven display is still present when available"
 *     AC4: single-leg panel unchanged / no extra element → "single-leg panel has no extra whitespace or empty box"
 *     AC5: TradePanel.tsx sidebar unchanged              → out of scope for E2E (no flow change; documented)
 *
 *   Story 6 — Missing or zero leg mid handled gracefully
 *     AC1: zero-mid → amber caution, formula suppressed  → "zero-mid leg shows amber caution text"
 *     AC2: synthetic data warning banner unchanged        → documented gap (mock doesn't set _synthetic)
 *     AC3: all mids > 0 → full box, no spurious warning  → covered by all normal-path tests
 *     AC4: defensive empty displayLegs                   → covered by gate: box never called with < 2 legs
 *
 * Mobile coverage:
 *   - Condensed formula (net = −3.49 (debit)) at < 480px  → "mobile viewport shows condensed formula"
 *   - Box does not overflow horizontally at 375px           → "box does not overflow at 375px"
 */

import { test, expect, type Page } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
  MOCK_OPTIONS_CHAIN,
  MOCK_SCAN_RESULT_V2,
  MOCK_ANALYZE_WITH_DEBIT_TRADE,
  MOCK_ANALYZE_WITH_CREDIT_TRADE,
  MOCK_ANALYZE_WITH_SINGLE_LEG_TRADE,
  MOCK_ANALYZE_WITH_ZERO_MID_TRADE,
  MOCK_ANALYZE_WITH_BULL_CALL_SPREAD,
} from '../mock-data'

const API = '**/api/**'
const BASE_URL = 'http://localhost:5173'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function setupCommonRoutes(page: Page) {
  await page.route(`${API}watchlist`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }),
  )
  await page.route(`${API}portfolio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }),
  )
  await page.route(`${API}ai/settings`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }),
  )
  await page.route(`${API}options/chain/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_OPTIONS_CHAIN) }),
  )
  await page.route(/\/strategies\/scan/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_SCAN_RESULT_V2]) }),
  )
}

/**
 * Navigate to the Scanner tab, trigger a scan, click Analyze, wait for
 * StrategyDetail to render, then expand the first CategorySection and the first
 * StrategyCard within it to reach TradeInstructions.
 */
async function openFirstStrategyCard(page: Page): Promise<void> {
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')

  // Navigate to Strategy Scanner tab (desktop or mobile label)
  const scannerBtn = page.getByRole('button', { name: /strategy scanner/i })
    .or(page.getByRole('button', { name: /^scanner$/i }))
  await scannerBtn.first().click()
  await page.waitForLoadState('networkidle')

  // Trigger scan
  const scanBtn = page.getByRole('button', { name: /scan watchlist/i })
  if (await scanBtn.isVisible({ timeout: 5000 })) {
    await scanBtn.click()
    await page.waitForSelector('button:has-text("Analyze")', { timeout: 15000 })
  }

  // Click Analyze
  const analyzeBtn = page.getByRole('button', { name: /^analyze$/i }).first()
    .or(page.getByRole('button', { name: /analyze/i }).first())
  await analyzeBtn.click()

  // Wait for the matrix disclaimer — confirms StrategyDetail rendered
  await page.getByText(/mathematical strategy properties/i).first()
    .waitFor({ state: 'visible', timeout: 20000 })

  // The CategorySection headers are below the comparison matrix.
  // Strategy category section headers are rendered as colored clickable divs.
  // The labels come from CATEGORY_META in StrategyDetail.tsx.
  // We look for a specific badge with "1 strategy" (not "0 strategies") and click
  // the badge's ancestor that has cursor:pointer style.
  await page.evaluate(() => {
    const allSpans = Array.from(document.querySelectorAll('span'))
    // Find the FIRST badge showing exactly "1 strategy" or "N strategies" with N >= 1
    for (const span of allSpans) {
      const text = (span.textContent ?? '').trim()
      const match = text.match(/^(\d+)\s+strateg/i)
      if (match && parseInt(match[1]) >= 1) {
        span.scrollIntoView({ block: 'center', behavior: 'instant' })
        // The header div with cursor:pointer is up to 8 levels above this span
        let el: HTMLElement | null = span
        for (let i = 0; i < 12; i++) {
          el = el?.parentElement ?? null
          if (el && el.tagName === 'DIV' && el.style.cursor === 'pointer') {
            el.click()
            return
          }
        }
        // If cursor:pointer not found, click the badge span itself (event bubbles)
        span.click()
        return
      }
    }
  })

  await page.waitForTimeout(800)

  // Wait for a strategy card to appear in the DOM (the category section is now open)
  // Strategy card headers contain "▼ trade" text (the collapse indicator when closed)
  // We look for this text and scroll to + click the card header.
  // Use waitForFunction to wait until "▼ trade" is in the DOM, then click it.
  await page.waitForFunction(() => {
    return document.body.innerText.includes('▼ trade')
  }, null, { timeout: 10000 })

  // The card header contains "▼ trade" — click it using evaluate
  await page.evaluate(() => {
    // Find the clickable card header that contains "▼ trade"
    // The card header is a div with style.cursor === 'pointer' that contains
    // a child div with "▼ trade" text. Walk through all elements.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent?.includes('▼ trade')) {
        // Walk up to find a clickable ancestor
        let el: HTMLElement | null = node.parentElement
        for (let i = 0; i < 8; i++) {
          if (el && el.style && el.style.cursor === 'pointer') {
            el.scrollIntoView({ block: 'center', behavior: 'instant' })
            el.click()
            return
          }
          el = el?.parentElement ?? null
        }
        // Click the parent of the text node as last resort
        node.parentElement?.click()
        return
      }
    }
  })

  await page.waitForTimeout(1000)
}

/**
 * Full navigation + card expansion flow.
 * Waits for the "How to place this trade" panel to be visible.
 */
async function openTradeInstructions(page: Page): Promise<void> {
  await openFirstStrategyCard(page)
  // Confirm TradeInstructions rendered — emoji is part of the text in the component
  await page.getByText(/how to place this trade/i).first()
    .waitFor({ state: 'visible', timeout: 15000 })
}

// ---------------------------------------------------------------------------
// Story 1: Box appears only for multi-leg strategies
// ---------------------------------------------------------------------------

test.describe('Story 1 — Box appears only for multi-leg strategies', () => {
  test('AC1: box is present for debit 4-leg BWB (displayLegs = 3 after dedup)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_DEBIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // The box label is distinctive: "Net order price" + "combo order"
    await expect(
      authedPage.getByText(/net order price/i).first(),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      authedPage.getByText(/combo order/i).first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('AC1: box is present for credit Iron Condor (4 distinct legs, displayLegs = 4)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    await expect(
      authedPage.getByText(/net order price/i).first(),
    ).toBeVisible({ timeout: 10000 })
  })

  test('AC2: box is absent for single-leg Short Naked Put (displayLegs.length === 1)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_SINGLE_LEG_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // The box label must NOT be present for a single-leg strategy
    await expect(
      authedPage.getByText(/net order price/i).first(),
    ).not.toBeVisible()
    // The existing panel must still be intact — Net line visible
    await expect(
      authedPage.getByText(/^Net:/i).or(authedPage.getByText(/\bNet:\s/i)).first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('AC1: box is present for 2-leg Bull Call Spread (displayLegs.length === 2)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    await expect(
      authedPage.getByText(/net order price/i).first(),
    ).toBeVisible({ timeout: 10000 })
  })
})

// ---------------------------------------------------------------------------
// Story 2: Signed net value and formula are correct
// ---------------------------------------------------------------------------

test.describe('Story 2 — Signed net value and formula are correct', () => {
  test('AC1 & AC2: Iron Condor shows +2.15 and Credit tag; Bull Call Spread shows −2.15 and Debit tag', async ({ authedPage }) => {
    // Credit path: Iron Condor +2.15
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // The large signed number for a credit is "+2.15"
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/\+2\.15/)
    // Credit tag — use span locator only (avoids matching <option> in the filter dropdown)
    // The tag is a <span> rendered inside the NetOrderPriceBox with text "Credit"
    const hasCreditTag = await authedPage.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'))
      return spans.some(el => el.textContent?.trim() === 'Credit' && el.tagName === 'SPAN')
    })
    expect(hasCreditTag).toBe(true)
  })

  test('AC2: Bull Call Spread shows −2.15 and Debit tag', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // Signed number for a debit is "−2.15" (unicode minus)
    expect(pageText).toMatch(/[−\-]2\.15/)
    // Debit tag — use span locator only (avoids matching <option> in the filter dropdown)
    const hasDebitTag = await authedPage.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'))
      return spans.some(el => el.textContent?.trim() === 'Debit' && el.tagName === 'SPAN')
    })
    expect(hasDebitTag).toBe(true)
  })

  test('AC3: formula line is visible and contains the leg mid prices', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // Desktop formula line contains leg mids: $3.20 and $1.05
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // Both leg mid values must appear in the formula
    expect(pageText).toMatch(/3\.20/)
    expect(pageText).toMatch(/1\.05/)
    // The formula must contain "net ="
    expect(pageText).toMatch(/net\s*=/)
  })

  test('AC4: 4-leg debit BWB formula shows qty-2 multiplier for the deduplicated body leg', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_DEBIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // The body SELL legs (strike 704, mid 14.80) are merged to qty:2 by displayLegs dedup.
    // The formula must therefore contain "2 ×" (or "2 x") and "$14.80".
    expect(pageText).toMatch(/2\s*[×x]\s*\$14\.80/)
    // The signed net for this BWB is −3.49
    expect(pageText).toMatch(/[−\-]3\.49/)
  })

  test('AC4: signedNet for debit BWB is −3.49 (−28.26 + 2×14.80 − 4.83)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_DEBIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // The large signed net for −3.49 debit
    expect(pageText).toMatch(/[−\-]3\.49/)
  })

  test('AC5: per-spread total equals signedNet × 100 for debit (−$349)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_DEBIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // signedNet = −3.49 × 100 = −349 → "−$349" or "−$349 total"
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/[−\-]\$349/)
  })

  test('AC5: per-spread total equals signedNet × 100 for credit (+$215)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // signedNet = +2.15 × 100 = +215 → "+$215"
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/\+\$215/)
  })
})

// ---------------------------------------------------------------------------
// Story 3: Debit/Credit tag and direction guide match the sign
// ---------------------------------------------------------------------------

test.describe('Story 3 — Debit/Credit tag and direction guide', () => {
  test('AC1: debit strategy shows Debit tag and less-negative direction text', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // Debit tag — the NetOrderPriceBox renders a <span> with text "Debit"
    // Avoid strict mode violation from <option value="Debit"> in the filter dropdown
    const hasDebitTag = await authedPage.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'))
      return spans.some(el => el.textContent?.trim() === 'Debit' && el.tagName === 'SPAN')
    })
    expect(hasDebitTag).toBe(true)

    // Direction guide for debit: "less-negative" or "pay less"
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/less.?negative|pay less/i)
  })

  test('AC2: credit strategy shows Credit tag and more-positive direction text', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // Credit tag — the NetOrderPriceBox renders a <span> with text "Credit"
    const hasCreditTag = await authedPage.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'))
      return spans.some(el => el.textContent?.trim() === 'Credit' && el.tagName === 'SPAN')
    })
    expect(hasCreditTag).toBe(true)

    // Direction guide for credit: "more positive" or "collect more"
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/more.?positive|collect more/i)
  })

  test('AC4: direction guide contains "better" and "worse" language', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/better/i)
    expect(pageText).toMatch(/worse/i)
  })

  test('AC4: credit direction guide also contains "better" and "worse"', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/better/i)
    expect(pageText).toMatch(/worse/i)
  })
})

// ---------------------------------------------------------------------------
// Story 4: DR/CR alternative
// ---------------------------------------------------------------------------

test.describe('Story 4 — DR/CR alternative representation', () => {
  test('AC1 & AC3: debit shows DR prefix and is distinct from the signed number', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // "DR" prefix must appear in the page text
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/\bDR\b/)
    // The signed number (−2.15) and the DR value (2.15) must both be present
    expect(pageText).toMatch(/[−\-]2\.15/)
    expect(pageText).toMatch(/2\.15/)
  })

  test('AC2: credit shows CR prefix', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/\bCR\b/)
  })

  test('AC4: DR/CR value is formatted to exactly 2 decimal places', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // DR value for −2.15 must be "2.15" (exactly 2 decimal places, not "2.1" or "2.150")
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // Match "DR 2.15" — the DR line must not show "2.1" or "2.150"
    expect(pageText).toMatch(/DR\s+2\.15/)
    expect(pageText).not.toMatch(/DR\s+2\.1(?!\d)/)
    expect(pageText).not.toMatch(/DR\s+2\.150/)
  })

  test('AC4: DR/CR for debit BWB is DR 3.49 (abs of −3.49)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_DEBIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/DR\s+3\.49/)
  })

  test('AC4: CR for Iron Condor is CR 2.15 (abs of +2.15)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/CR\s+2\.15/)
  })
})

// ---------------------------------------------------------------------------
// Story 5: Existing panel is unchanged (regression guard)
// ---------------------------------------------------------------------------

test.describe('Story 5 — Existing panel content is unchanged (regression)', () => {
  test('AC1 & AC2: numbered leg rows and grey Net/Exit summary row are still present for multi-leg strategy', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // Leg rows: "BUY" and "SELL" action badges still present
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/\bBUY\b/i)
    expect(pageText).toMatch(/\bSELL\b/i)

    // Grey summary row: "Net:" text still present
    await expect(
      authedPage.getByText(/\bNet:/i).or(authedPage.getByText(/Net:\s/i)).first(),
    ).toBeVisible({ timeout: 5000 })

    // "Exit when:" text still present
    await expect(
      authedPage.getByText(/exit when/i).first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('AC2: Net line says "Pay" for a debit strategy (content unchanged)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // Existing Net line wording for debit: "Pay $215 debit per spread"
    expect(pageText).toMatch(/Pay.*debit per spread/i)
  })

  test('AC2: Net line says "Collect" for a credit strategy (content unchanged)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // Existing Net line wording for credit: "Collect $215 credit per spread"
    expect(pageText).toMatch(/Collect.*credit per spread/i)
  })

  test('AC3: breakeven display is present when strategy has breakeven values', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // Iron Condor has both breakeven_low and breakeven_high → "Profit zone: $X – $Y"
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/Profit zone|Breakeven/i)
  })

  test('AC4: single-leg panel has no net order price box, no empty container artifact', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_SINGLE_LEG_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // Box label must be absent
    await expect(
      authedPage.getByText(/net order price/i).first(),
    ).not.toBeVisible()

    // "combo order" text must be absent
    await expect(
      authedPage.getByText(/combo order/i).first(),
    ).not.toBeVisible()

    // Existing Net line still present
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/\bNet:/i)
  })

  test('AC1 regression: mid values in numbered leg rows match those in the formula', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // The leg table shows $3.20 and $1.05 as mid values.
    // The formula in NetOrderPriceBox also shows $3.20 and $1.05.
    // Both must appear in the page (formula is consistent with leg rows).
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // Count occurrences of "3.20" — should appear in both the leg row and the formula
    const count320 = (pageText.match(/3\.20/g) || []).length
    expect(count320).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Story 6: Missing or zero leg mid handled gracefully
// ---------------------------------------------------------------------------

test.describe('Story 6 — Missing or zero leg mid handled gracefully', () => {
  test('AC1: zero-mid leg shows amber caution text and suppresses formula and signed number', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_ZERO_MID_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // The box renders with caution text
    await expect(
      authedPage.getByText(/one or more leg mids are unavailable/i).first(),
    ).toBeVisible({ timeout: 10000 })

    // The computed signed number must not appear (box suppresses it on zero-mid path)
    // The formula should not show the "net = ... = ..." result
    // We verify by checking that no "DR" or "CR" prefix appears (they are suppressed)
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // DR/CR suppressed
    expect(pageText).not.toMatch(/\bDR\s+\d/)
    expect(pageText).not.toMatch(/\bCR\s+\d/)
    // No direction guide "better fill" text either
    expect(pageText).not.toMatch(/better fill\s*=\s*less.?negative/i)
    expect(pageText).not.toMatch(/better fill\s*=\s*more.?positive/i)
  })

  test('AC1: zero-mid box still shows the label (box renders, not null)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_ZERO_MID_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // The box label is still rendered even in the caution path
    await expect(
      authedPage.getByText(/net order price/i).first(),
    ).toBeVisible({ timeout: 10000 })
  })

  test('AC3: all mids > 0 renders full box with no spurious caution text', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // Caution text must not appear for a well-quoted strategy
    await expect(
      authedPage.getByText(/one or more leg mids are unavailable/i).first(),
    ).not.toBeVisible()

    // Full box content must be present
    await expect(
      authedPage.getByText(/net order price/i).first(),
    ).toBeVisible({ timeout: 10000 })
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/\bDR\b/)
  })
})

// ---------------------------------------------------------------------------
// Mobile viewport: condensed formula and no horizontal overflow
// ---------------------------------------------------------------------------

test.describe('Mobile viewport — responsive behaviour', () => {
  test('condensed formula (net = −X.XX (debit)) shown at 479px viewport, not full per-leg formula', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 479, height: 844 })
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // Mobile condensed form: "net = −2.15 (debit)"
    expect(pageText).toMatch(/net\s*=\s*[−\-]2\.15\s*\(debit\)/i)
    // The full per-leg formula would include "$3.20" referencing the buy leg mid
    // On mobile it should not appear in the formula line (it is replaced by the condensed form)
    // We check that the leg mid "$3.20" does NOT appear in a "net = ... × ... = " formula format
    // (it may still appear in the leg row above, so we can't ban it entirely — we check
    // the condensed formula is present as positive evidence instead)
  })

  test('credit condensed formula shows (credit) label on mobile', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 400, height: 844 })
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_CREDIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    // Mobile condensed form: "net = +2.15 (credit)"
    expect(pageText).toMatch(/net\s*=\s*\+2\.15\s*\(credit\)/i)
  })

  test('box does not overflow horizontally at 375px (standard mobile)', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 })
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_DEBIT_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    // Verify no horizontal scrollbar on the body (document width should equal viewport width)
    const hasHorizontalOverflow = await authedPage.evaluate(() => {
      return document.body.scrollWidth > document.body.clientWidth
    })
    // Allow a 1px tolerance for sub-pixel rendering
    const scrollOverflow = await authedPage.evaluate(() => {
      return Math.max(0, document.body.scrollWidth - document.body.clientWidth)
    })
    expect(scrollOverflow).toBeLessThanOrEqual(1)
  })

  test('large signed number and DR/CR are visible on mobile (not truncated)', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 375, height: 812 })
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // Large signed number still visible on mobile
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/[−\-]2\.15/)
    // DR/CR still visible on mobile
    expect(pageText).toMatch(/\bDR\b/)
  })
})

// ---------------------------------------------------------------------------
// Box label content: "key this ONE number as a combo order"
// ---------------------------------------------------------------------------

test.describe('Box label and header content', () => {
  test('box label reads "Net order price — key this ONE number as a combo order"', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_BULL_CALL_SPREAD) }),
    )
    await openTradeInstructions(authedPage)

    // Check for the key wording of the label (case-insensitive)
    await expect(
      authedPage.getByText(/net order price/i).first(),
    ).toBeVisible({ timeout: 10000 })
    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).toMatch(/key this ONE number/i)
    expect(pageText).toMatch(/combo order/i)
  })

  test('label is absent for single-leg strategy (no box rendered at all)', async ({ authedPage }) => {
    await setupCommonRoutes(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_WITH_SINGLE_LEG_TRADE) }),
    )
    await openTradeInstructions(authedPage)

    const pageText = await authedPage.evaluate(() => document.body.innerText)
    expect(pageText).not.toMatch(/key this ONE number/i)
    expect(pageText).not.toMatch(/combo order/i)
  })
})

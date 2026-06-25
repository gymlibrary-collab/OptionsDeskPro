/**
 * narrative-improvements-v2.spec.ts
 *
 * Playwright E2E tests for the 10 P1 FRs in the interpreter-improvements-v2-24Jun2026
 * feature spec (interpreter.py narrative engine v2 improvements).
 *
 * Strategy: all tests mock GET /api/strategies/analyze/{symbol} with a controlled
 * `narrative` object embedded in the strategy `trade` field.  No real backend is
 * called.  The test navigates Scanner → Analyze AAPL → expands the first strategy
 * card and asserts text content inside the rendered StrategyNarrative panels.
 *
 * The approach is identical to narrative-improvements.spec.ts (v1):
 * we are testing that the frontend renders narrative strings correctly, not that
 * the backend produces them — so we build mock narrative strings that contain the
 * FR-specific text we expect and assert they appear in the rendered page.
 *
 * P1 FRs covered:
 *   Story 1  — FR-B5:       SMA zero-data guard in Market Snapshot
 *   Story 2  — FR-D6+FR-C7: HV zero-data notice in IV Context + HV headline guard
 *   Story 3  — FR-G11:      Earnings urgency branching (IMMINENT vs ALERT)
 *   Story 4  — FR-G8:       Short call vs short put loss distinction
 *   Story 5  — FR-C2:       Margin notice for undefined-risk trades
 *   Story 6  — FR-C3:       Long-leg "partially offsets" vs "defines and caps"
 *   Story 7  — FR-G3:       Defensive tactic named branches
 *   Story 8  — FR-G1:       Why-this-strategy named branches (ZEBRA, calendar, collar)
 *   Story 9  — FR-E3:       pop_estimate preferred over catalog pop_range
 */

import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
} from '../mock-data'

const API = '**/api/**'

// ─── Shared narrative builders ────────────────────────────────────────────────

/**
 * Minimal narrative object that the StrategyNarrative component will render.
 * Override individual fields per test.
 */
function buildNarrative(overrides: Partial<{
  headline: string
  market_snapshot: string
  iv_context: string
  why_this_strategy: string
  trade_plain_english: string
  profit_scenario: string
  loss_scenario: string
  defensive_tactic: string
  trade_ticket: string | null
  execution_checklist: string[]
  confirmation_summary: string
}> = {}) {
  return {
    headline: 'AAPL — Sell a Short Strangle expiring 2024-03-15 (45d). Collect $2.30 premium with IV elevated at IVR 72 (38.0% IV vs 28.0% HV). Market is Neutral.',
    market_snapshot: 'AAPL is trading at $185.50, sitting 1.7% above its 20-day moving average ($182.30) and 3.9% above its 50-day moving average ($178.60). RSI is 55.1 — neutral momentum, no overbought/oversold signal.',
    iv_context: 'Implied volatility rank (IVR) is 72 — HIGH. For context, the stock\'s actual 30-day historical volatility (HV30) is 28.0% versus the current IV of 38.0%. Options are pricing in more volatility than the stock has realised.',
    why_this_strategy: 'The Short Strangle is a DEFINED-RISK strategy designed for HIGH IV environments where elevated premiums make the credit collected worthwhile. The estimated probability of profit is 68% — computed from the actual strike deltas selected for this trade.',
    trade_plain_english: 'Here is exactly what this trade looks like, leg by leg: Sell the $195 call and sell the $175 put to collect $2.30 net credit.',
    profit_scenario: 'Based on the delta of the selected strikes, this setup has an estimated 68% theoretical probability of being profitable at expiration.',
    loss_scenario: 'This is an undefined-risk trade. Monitor the position daily. Close at 21 DTE.',
    defensive_tactic: 'If the stock moves toward one of your short strikes, roll the untested side closer to the stock to collect more premium.',
    trade_ticket: null,
    execution_checklist: [
      'OPEN: Confirm options approval level 3 or higher.',
      'NAVIGATE: Go to the options chain for AAPL.',
      'LEG 1: SELL $195 CALL (expires March 15, 2024) — sell the OTM call.',
      'LEG 2: SELL $175 PUT (expires March 15, 2024) — sell the OTM put.',
      'COMBINE: Enter as a single net-credit combo order.',
      'SET GTC: Set a GTC limit order to close at 50% of max profit ($1.15 credit).',
      'MARK YOUR CALENDAR: Set a reminder for 24 days from today — close the position at 21 DTE.',
      'HARD STOP: Close if the position reaches 2x the max credit received.',
    ],
    confirmation_summary: 'This trade is profitable as long as AAPL stays between $172.70 and $197.30 at expiry.',
    ...overrides,
  }
}

/**
 * Build a minimal TradeStructure with a narrative embedded.
 */
function buildTrade(opts: {
  strategyKey: string
  strategyName: string
  riskType: string
  profitTargetPct: number
  narrative: ReturnType<typeof buildNarrative>
  estimatedCreditOrDebit?: number
  legs?: Array<{
    action: string
    option_type: string
    strike: number
    expiry: string
    delta: number
    gamma: number
    theta: number
    vega: number
    bid: number
    ask: number
    mid: number
    role: string
  }>
  popEstimate?: number | null
}) {
  const {
    strategyKey,
    strategyName,
    riskType,
    profitTargetPct,
    narrative,
    estimatedCreditOrDebit = 2.30,
    legs = [],
    popEstimate = 68,
  } = opts
  return {
    strategy: strategyName,
    strategy_key: strategyKey,
    expiry: '2024-03-15',
    legs,
    max_profit: 2.30,
    max_loss: null,
    estimated_credit_or_debit: estimatedCreditOrDebit,
    pop_estimate: popEstimate,
    breakeven_low: 172.70,
    breakeven_high: 197.30,
    tastylive_profit_target: null,
    risk_type: riskType,
    profit_target_pct: profitTargetPct,
    earnings_note: null as string | null,
    narrative,
  }
}

/**
 * Build the full /strategies/analyze response wrapping a narrative inside a
 * strategy recommendation's `trade` field.
 */
function buildAnalyzeResponse(opts: {
  strategyKey: string
  strategyName: string
  riskType: string
  popRange: [number, number]
  profitTargetPct: number
  narrative: ReturnType<typeof buildNarrative>
  bias?: string
  category?: string
  estimatedCreditOrDebit?: number
  hv30d?: number
  sma20?: number
  sma50?: number
  legs?: Array<{
    action: string
    option_type: string
    strike: number
    expiry: string
    delta: number
    gamma: number
    theta: number
    vega: number
    bid: number
    ask: number
    mid: number
    role: string
  }>
  popEstimate?: number | null
}) {
  const {
    strategyKey,
    strategyName,
    riskType,
    popRange,
    profitTargetPct,
    narrative,
    bias = 'NEUTRAL',
    category = 'NEUTRAL',
    estimatedCreditOrDebit,
    hv30d = 0.28,
    sma20 = 182.3,
    sma50 = 178.6,
    legs,
    popEstimate,
  } = opts

  const strategy = {
    key: strategyKey,
    name: strategyName,
    description: `Mock description for ${strategyName}.`,
    direction: [bias],
    iv_environment: ['HIGH'],
    risk_type: riskType,
    complexity: 2,
    dte_target: 45,
    pop_range: popRange,
    profit_target_pct: profitTargetPct,
    trade: buildTrade({ strategyKey, strategyName, riskType, profitTargetPct, narrative, estimatedCreditOrDebit, legs, popEstimate }),
  }

  return {
    symbol: 'AAPL',
    iv_analysis: {
      symbol: 'AAPL',
      current_iv: 0.38,
      iv_rank: 72,
      iv_source: 'option_chain',
      hv_30d: hv30d,
      hv_52wk_high: 0.52,
      hv_52wk_low: 0.18,
      iv_environment: 'HIGH',
      percentile_label: 'IVR 72 — High IV',
      error: null,
    },
    bias_analysis: {
      symbol: 'AAPL',
      price: 185.5,
      sma20,
      sma50,
      rsi14: 55.1,
      bias,
      strength: 'MODERATE',
      error: null,
    },
    detected_bias: bias,
    recommendations_by_category: {
      [category]: [strategy],
      ...(category !== 'NEUTRAL' ? { NEUTRAL: [] } : {}),
      ...(category !== 'BULLISH' ? { BULLISH: [] } : {}),
      ...(category !== 'BEARISH' ? { BEARISH: [] } : {}),
    },
    comparison_matrix: [],
  }
}

// ─── Shared setup helpers ─────────────────────────────────────────────────────

async function stubCommonRoutes(page: Parameters<typeof test>[1]['authedPage']) {
  await page.route(`${API}watchlist`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) }),
  )
  await page.route(`${API}portfolio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) }),
  )
  await page.route(`${API}ai/settings`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) }),
  )
  await page.route(`${API}public/config`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ai_features_enabled: true }) }),
  )
}

/** Stub the scan endpoint to return a single AAPL result so the Analyze button appears. */
async function stubScanRoute(page: Parameters<typeof test>[1]['authedPage']) {
  await page.route(/\/strategies\/scan/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          symbol: 'AAPL',
          price: 185.5,
          iv_rank: 72,
          current_iv: 0.38,
          iv_environment: 'HIGH',
          percentile_label: 'IVR 72 — High IV',
          bias: 'NEUTRAL',
          bias_strength: 'MODERATE',
          rsi14: 55.1,
          strategy_count: 8,
          condition_matches: 5,
          error: null,
        },
      ]),
    }),
  )
}

/**
 * Navigate to the scanner tab, run a scan, and click the Analyze button for AAPL.
 * Returns after the StrategyDetail view is visible.
 */
async function navigateToDetail(page: Parameters<typeof test>[1]['authedPage']) {
  await page.goto('http://localhost:5173/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /strategy scanner/i }).click()
  await page.getByRole('button', { name: /scan watchlist/i }).click()
  await expect(page.getByText('AAPL').first()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /analyze/i }).first().click()
  await expect(page.getByText(/deep analysis/i).first()).toBeVisible({ timeout: 10000 })
}

/**
 * Expand the first strategy card's narrative panels so accordion sections become visible.
 */
async function expandFirstStrategyNarrative(page: Parameters<typeof test>[1]['authedPage']) {
  // Idempotent: if the narrative is already visible, return immediately.
  const alreadyOpen = await page.getByText(/market snapshot/i).first().isVisible({ timeout: 500 }).catch(() => false)
  if (alreadyOpen) return

  // Step 1 — Expand CategorySection.
  const categoryBadge = page.getByText(/^1 strategy$/).or(page.getByText(/^[2-9] strategies$/))
  const badgeVisible = await categoryBadge.first().isVisible({ timeout: 8000 }).catch(() => false)
  if (badgeVisible) {
    await categoryBadge.first().click()
  } else {
    const categoryLabel = page.getByText(/Neutral Strategies|Bullish Strategies|Bearish Strategies/).first()
    if (await categoryLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await categoryLabel.click()
    }
  }

  // Step 2 — Expand StrategyCard.
  const tradeToggle = page.getByText('▼ trade').first()
  if (await tradeToggle.isVisible({ timeout: 8000 }).catch(() => false)) {
    await tradeToggle.click()
  }

  // Wait for narrative panels to appear.
  await expect(page.getByText(/market snapshot/i).first()).toBeVisible({ timeout: 15000 })
}

// ─── Story 1 — FR-B5: SMA zero-data guard ────────────────────────────────────

test.describe('Story 1 — FR-B5: SMA zero-data guard in Market Snapshot', () => {
  // AC1: When sma20==0 and sma50==0, Market Snapshot narrative contains "Moving average data" unavailability notice.
  test('AC1: zero SMA ticker — Market Snapshot narrative contains unavailability notice', async ({ authedPage }) => {
    const narrative = buildNarrative({
      market_snapshot:
        'Moving average data unavailable for AAPL — 20-day and 50-day SMA values could not be retrieved ' +
        '(common for illiquid tickers or new listings). ' +
        'The directional bias below is derived from RSI only. ' +
        'RSI is 55.1 — neutral momentum, no overbought/oversold signal.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      sma20: 0,
      sma50: 0,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    // Expand the accordion to reveal narrative section text
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC1: The unavailability notice must appear in the narrative
    expect(bodyText).toMatch(/Moving average data unavailable/i)

    // AC1: The malformed "0.0% below" phrasing must NOT appear in the narrative
    // (The UI header may show $0.00 for SMA values, but the narrative section must not emit the broken sentence)
    expect(bodyText).not.toMatch(/0\.0% below its.*moving average/i)
  })

  // AC2: RSI line still renders for the same zero-SMA ticker.
  test('AC2: zero SMA ticker — RSI line still renders in the narrative', async ({ authedPage }) => {
    const narrative = buildNarrative({
      market_snapshot:
        'Moving average data unavailable for AAPL — 20-day and 50-day SMA values could not be retrieved. ' +
        'RSI is 55.1 — neutral momentum, no overbought/oversold signal. ' +
        'Directional conviction: MODERATE.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      sma20: 0,
      sma50: 0,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC2: RSI line renders — the zero-SMA guard only suppresses the MA paragraph
    expect(bodyText).toMatch(/RSI.*55/i)
    expect(bodyText).toMatch(/Moving average data unavailable/i)
  })

  // AC3: For a normal ticker with valid SMAs, the MA paragraph is unchanged.
  test('AC3: valid SMA ticker — MA paragraph renders normally without unavailability notice', async ({ authedPage }) => {
    const narrative = buildNarrative({
      market_snapshot:
        'AAPL is trading at $185.50, sitting 1.7% above its 20-day moving average ($182.30) ' +
        'and 3.9% above its 50-day moving average ($178.60). ' +
        'RSI is 55.1 — neutral momentum.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      sma20: 182.3,
      sma50: 178.6,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC3: Normal MA paragraph is present
    expect(bodyText).toMatch(/20-day moving average/i)
    // AC3: The unavailability notice must NOT appear
    expect(bodyText).not.toMatch(/Moving average data unavailable/i)
  })
})

// ─── Story 2 — FR-D6 + FR-C7: HV zero-data notice + headline guard ───────────

test.describe('Story 2 — FR-D6 + FR-C7: HV zero-data notice and headline guard', () => {
  // AC1 (FR-D6): When hv_30==0, IV Context contains "historical volatility data is unavailable".
  test('AC1 (FR-D6): zero HV ticker — IV Context contains historical volatility unavailability notice', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline:
        'AAPL — Sell a Short Strangle expiring 2024-03-15 (45d). ' +
        'Collect $2.30 premium with IV elevated at IVR 72 (38.0% IV). Market is Neutral.',
      iv_context:
        'Implied volatility rank (IVR) is 72 — HIGH. ' +
        'This is a HIGH IV environment — elevated option premiums make credit strategies more attractive. ' +
        '\n\n30-day historical volatility data is unavailable for this symbol — ' +
        'the IV vs HV comparison cannot be shown. This is common for new listings, ' +
        'short-history ETFs, or symbols where the options chain was generated synthetically.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      hv30d: 0,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    // Narrative text is inside the accordion — expand it to access market_snapshot and iv_context
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC1: HV unavailability notice must appear
    expect(bodyText).toMatch(/historical volatility data is unavailable/i)
  })

  // AC2 (FR-C7): When hv_30==0 in HIGH IV, the headline does NOT contain "0.0% HV".
  test('AC2 (FR-C7): zero HV ticker — headline does not contain "0.0% HV"', async ({ authedPage }) => {
    const narrative = buildNarrative({
      // FR-C7 fix: headline omits the HV clause when hv_30==0
      headline:
        'AAPL — Sell a Short Strangle expiring 2024-03-15 (45d). ' +
        'Collect $2.30 premium with IV elevated at IVR 72 (38.0% IV). Market is Neutral.',
      iv_context:
        'Implied volatility rank (IVR) is 72 — HIGH. ' +
        '\n\n30-day historical volatility data is unavailable for this symbol — ' +
        'the IV vs HV comparison cannot be shown.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      hv30d: 0,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC2: Headline must NOT contain "0.0% HV" — the narrative headline renders inside the accordion
    expect(bodyText).not.toMatch(/0\.0% HV/i)
    // AC2: IVR value still appears in the headline
    expect(bodyText).toMatch(/IVR 72/i)
  })

  // AC3: For a ticker with hv_30>0, the HV paragraph is unchanged and contains both IV and HV.
  test('AC3: valid HV ticker — IV Context contains HV comparison and headline includes HV figure', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline:
        'AAPL — Sell a Short Strangle expiring 2024-03-15 (45d). ' +
        'Collect $2.30 premium with IV elevated at IVR 72 (38.0% IV vs 28.0% HV). Market is Neutral.',
      iv_context:
        'Implied volatility rank (IVR) is 72 — HIGH. ' +
        'For context, the stock\'s actual 30-day historical volatility (HV30) is 28.0% versus the current IV of 38.0%. ' +
        'Options are pricing in more volatility than the stock has realised.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      hv30d: 0.28,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC3: HV comparison is present in the narrative
    expect(bodyText).toMatch(/28\.0% HV/i)
    expect(bodyText).toMatch(/38\.0% IV/i)
    // AC3: Unavailability notice must NOT appear
    expect(bodyText).not.toMatch(/historical volatility data is unavailable/i)
  })
})

// ─── Story 3 — FR-G11: Earnings urgency branching ────────────────────────────

test.describe('Story 3 — FR-G11: Earnings urgency branching in Market Snapshot', () => {
  // AC1: days_earn==1 → page contains "EARNINGS IMMINENT".
  test('AC1: days_earn==1 — Market Snapshot contains EARNINGS IMMINENT alert', async ({ authedPage }) => {
    const narrative = buildNarrative({
      market_snapshot:
        'AAPL is trading at $185.50, sitting 1.7% above its 20-day moving average ($182.30). ' +
        'RSI is 55.1 — neutral momentum. ' +
        '\n\nEARNINGS IMMINENT: AAPL reports earnings within the next 1 day. ' +
        'IV crush risk is immediate — implied volatility will collapse the moment the announcement is made. ' +
        'Strongly consider whether to close or avoid any new position before the event. ' +
        'If already in a position, review your exposure now.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    // Narrative market_snapshot text is rendered inside the accordion — expand it
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC1: IMMINENT alert must appear
    expect(bodyText).toMatch(/EARNINGS IMMINENT/i)
    // AC1: "approximately 0 days" or "approximately 1 days" broken phrasing must NOT appear
    expect(bodyText).not.toMatch(/approximately \d+ days?.*earnings/i)
  })

  // AC2: days_earn==0 → page contains "today or tomorrow" and IMMINENT urgency.
  test('AC2: days_earn==0 — Market Snapshot contains "today or tomorrow" and IMMINENT urgency', async ({ authedPage }) => {
    const narrative = buildNarrative({
      market_snapshot:
        'AAPL is trading at $185.50. RSI is 55.1. ' +
        '\n\nEARNINGS IMMINENT: AAPL reports earnings today or tomorrow. ' +
        'IV crush risk is immediate — implied volatility will collapse the moment the announcement is made. ' +
        'Strongly consider whether to close or avoid any new position before the event.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC2: "today or tomorrow" phrasing must appear
    expect(bodyText).toMatch(/today or tomorrow/i)
    // AC2: IMMINENT must appear
    expect(bodyText).toMatch(/EARNINGS IMMINENT/i)
    // AC2: "approximately 0 days" broken phrasing must NOT appear
    expect(bodyText).not.toMatch(/approximately 0 days/i)
  })

  // AC3: days_earn==15 → standard phrasing (ALERT not IMMINENT).
  test('AC3: days_earn==15 — Market Snapshot uses standard ALERT phrasing, no IMMINENT', async ({ authedPage }) => {
    const narrative = buildNarrative({
      market_snapshot:
        'AAPL is trading at $185.50, sitting 1.7% above its 20-day moving average ($182.30). ' +
        'RSI is 55.1 — neutral momentum. ' +
        '\n\nEARNINGS ALERT: AAPL reports earnings in approximately 15 days. ' +
        'Earnings events typically cause implied volatility to spike in the days leading up to the announcement ' +
        'and then sharply collapse immediately afterward (known as the "IV crush").',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC3: Standard ALERT phrasing (not IMMINENT)
    expect(bodyText).toMatch(/EARNINGS ALERT/i)
    expect(bodyText).not.toMatch(/EARNINGS IMMINENT/i)
    // AC3: Day count appears
    expect(bodyText).toMatch(/15 days/i)
  })
})

// ─── Story 4 — FR-G8: Short call vs short put loss distinction ────────────────

test.describe('Story 4 — FR-G8: Undefined-risk loss framing distinguishes short call vs short put', () => {
  // AC1: Short naked call → loss section mentions "theoretically unlimited".
  test('AC1: short naked call — loss section mentions theoretically unlimited upside loss', async ({ authedPage }) => {
    const narrative = buildNarrative({
      loss_scenario:
        'This is an undefined-risk trade. ' +
        'In theory, a short call carries unlimited loss potential — if AAPL rises without limit, ' +
        'so does your loss. There is no ceiling. ' +
        'This is the most important risk to understand about this structure: ' +
        'unlike a short put, where the stock can only fall to zero, a stock can theoretically rise without bound. ' +
        'A common way to manage this risk follows two rules:\n' +
        '1. Position sizing: never let this trade represent more than 1–3% of your total portfolio value.\n' +
        '2. The 2× rule: close the position if it has lost 2× the credit you collected.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_naked_call',
      strategyName: 'Short Naked Call',
      riskType: 'UNDEFINED',
      popRange: [70, 80],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const lossPanel = authedPage.getByText(/if it goes wrong/i).first()
    await expect(lossPanel).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC1: Unlimited loss language must appear
    expect(bodyText).toMatch(/unlimited loss/i)
    // AC1: The vague "substantial" language must NOT be the primary framing
    // (the word "substantial" may appear in context but "unlimited" must also appear)
    expect(bodyText).toMatch(/rise without limit|theoretically rise without bound|unlimited/i)
  })

  // AC2: Short naked put → loss section mentions "capped" or specific dollar amount.
  test('AC2: short naked put — loss section states loss is capped at strike × 100', async ({ authedPage }) => {
    const narrative = buildNarrative({
      loss_scenario:
        'This is an undefined-risk trade. ' +
        'Your worst-case loss is not unlimited: because a stock cannot fall below zero, ' +
        'a short put\'s maximum possible loss is approximately $17500 per contract ' +
        '(the $175 strike × 100 shares, if the stock fell to zero). ' +
        'While $17500 is a large number, it is a finite and quantifiable risk — ' +
        'very different from the theoretically unlimited loss of a short call. ' +
        'A common way to manage this risk follows two rules:\n' +
        '1. Position sizing: never let this trade represent more than 1–3% of your total portfolio value.\n' +
        '2. The 2× rule: close the position if it has lost 2× the credit you collected.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_naked_put',
      strategyName: 'Short Naked Put',
      riskType: 'UNDEFINED',
      popRange: [70, 80],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const lossPanel = authedPage.getByText(/if it goes wrong/i).first()
    await expect(lossPanel).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC2: Loss is described as capped/finite, not unlimited
    expect(bodyText).toMatch(/not unlimited|finite and quantifiable|capped/i)
    // AC2: Dollar figure appears (strike × 100)
    expect(bodyText).toMatch(/\$17[,\s]?500|\$17500/i)
  })

  // AC3: Defined-risk trade (iron condor) — loss frame is unchanged.
  test('AC3: defined-risk strategy — loss section uses defined-risk framing, no unlimited-loss language', async ({ authedPage }) => {
    const narrative = buildNarrative({
      loss_scenario:
        'This is a DEFINED-RISK trade: your maximum loss is known at entry and cannot exceed $3.15 per contract. ' +
        'The position reaches maximum loss if AAPL closes below $171.85 or above $198.15 at expiry. ' +
        'Monitor daily and close at 21 DTE.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'iron_condor',
      strategyName: 'Iron Condor',
      riskType: 'DEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const lossPanel = authedPage.getByText(/if it goes wrong/i).first()
    await expect(lossPanel).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC3: Defined-risk loss frame appears
    expect(bodyText).toMatch(/DEFINED-RISK|maximum loss is known/i)
    // AC3: No unlimited-loss language for a defined-risk trade
    expect(bodyText).not.toMatch(/unlimited loss potential|rise without limit/i)
  })
})

// ─── Story 5 — FR-C2: Margin notice for undefined-risk trades ────────────────

test.describe('Story 5 — FR-C2: Margin notice in The Trade in Simple Terms', () => {
  // AC1: Short naked put → "The Trade in Simple Terms" panel contains "MARGIN NOTICE".
  test('AC1: short naked put — trade description contains MARGIN NOTICE', async ({ authedPage }) => {
    const narrative = buildNarrative({
      trade_plain_english:
        'MARGIN NOTICE: undefined-risk positions require margin reserved in your broker account. ' +
        'As a rule of thumb, expect 20–25% of the notional value of the short strike(s) to be held ' +
        'as buying power. For this trade (short strike ~$175): approximately $3,500–$4,375 per contract ' +
        'will be reserved. ' +
        'Verify the exact requirement in your broker\'s margin calculator before placing the order — ' +
        'actual margin varies by broker and account type. ' +
        '\n\nHere is exactly what this trade looks like, leg by leg: ' +
        'Sell the $175 put to collect $1.85 net credit.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_naked_put',
      strategyName: 'Short Naked Put',
      riskType: 'UNDEFINED',
      popRange: [70, 80],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const tradePanel = authedPage.getByText(/the trade in simple terms/i).first()
    await expect(tradePanel).toBeVisible({ timeout: 10000 })

    // AC1: MARGIN NOTICE must appear
    await expect(authedPage.getByText(/MARGIN NOTICE/)).toBeVisible({ timeout: 10000 })

    // AC1: 20-25% rule of thumb must be present
    const bodyText = await authedPage.locator('body').textContent()
    expect(bodyText).toMatch(/20.?25%/i)
  })

  // AC2: Short strangle → trade description also contains "MARGIN NOTICE".
  test('AC2: short strangle — trade description contains MARGIN NOTICE with worked dollar example', async ({ authedPage }) => {
    const narrative = buildNarrative({
      trade_plain_english:
        'MARGIN NOTICE: undefined-risk positions require margin reserved in your broker account. ' +
        'As a rule of thumb, expect 20–25% of the notional value of the short strike(s) to be held ' +
        'as buying power. For this trade (short strike ~$195): approximately $3,900–$4,875 per contract ' +
        'will be reserved. ' +
        'Verify the exact requirement in your broker\'s margin calculator before placing the order. ' +
        '\n\nHere is exactly what this trade looks like, leg by leg: ' +
        'Sell the $195 call and sell the $175 put to collect $2.30 net credit.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    await expect(authedPage.getByText(/the trade in simple terms/i)).toBeVisible({ timeout: 10000 })

    // AC2: MARGIN NOTICE must appear with dollar example
    await expect(authedPage.getByText(/MARGIN NOTICE/)).toBeVisible({ timeout: 10000 })
    const bodyText = await authedPage.locator('body').textContent()
    expect(bodyText).toMatch(/\$3,?900|\$4,?875/i)
  })

  // AC3: Defined-risk strategy (iron condor) → no "MARGIN NOTICE".
  test('AC3: iron condor (defined-risk) — trade description contains no MARGIN NOTICE', async ({ authedPage }) => {
    const narrative = buildNarrative({
      trade_plain_english:
        'Here is exactly what this trade looks like, leg by leg: ' +
        'Sell the $195 call and buy the $200 call. Sell the $175 put and buy the $170 put. ' +
        'This trade collects $1.85 in net credit per contract.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'iron_condor',
      strategyName: 'Iron Condor',
      riskType: 'DEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    await expect(authedPage.getByText(/the trade in simple terms/i)).toBeVisible({ timeout: 10000 })

    // AC3: No MARGIN NOTICE for defined-risk strategy
    const bodyText = await authedPage.locator('body').textContent()
    expect(bodyText).not.toMatch(/MARGIN NOTICE/i)
  })
})

// ─── Story 6 — FR-C3: Long-leg "partially offsets" vs "defines and caps" ──────

test.describe('Story 6 — FR-C3: Long-leg risk qualification for undefined-risk trades', () => {
  // AC1: Long call vertical (defined-risk) → long-leg description says "defines and caps".
  test('AC1: long call vertical (defined-risk) — long-leg text says "defines and caps"', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline: 'Pay $1.50 for defined upside exposure — BULLISH setup',
      trade_plain_english:
        'Here is exactly what this trade looks like, leg by leg:\n' +
        'LEG 1 (BUY the $185 CALL): This is a long call giving you the right to buy AAPL at $185. ' +
        'This leg defines and caps your maximum risk on the trade.\n' +
        'LEG 2 (SELL the $195 CALL): Selling this call reduces your cost basis. ' +
        'Time decay works in your favour on this leg.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'long_call_vertical',
      strategyName: 'Long Call Vertical',
      riskType: 'DEFINED',
      popRange: [45, 55],
      profitTargetPct: 50,
      narrative,
      bias: 'BULLISH',
      category: 'BULLISH',
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    await expect(authedPage.getByText(/the trade in simple terms/i)).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC1: "defines and caps" must appear for the defined-risk long leg
    expect(bodyText).toMatch(/defines and caps.*maximum risk|defines and caps/i)
  })

  // AC2: Undefined-risk spread → long-leg description says "partially offsets".
  test('AC2: undefined-risk trade with long leg — long-leg text says "partially offsets"', async ({ authedPage }) => {
    const narrative = buildNarrative({
      trade_plain_english:
        'Here is exactly what this trade looks like, leg by leg:\n' +
        'LEG 1 (BUY the $185 CALL): This long leg partially offsets your short obligation ' +
        'but does not fully cap the overall position risk — the trade remains undefined-risk overall.\n' +
        'LEG 2 (SELL the $195 CALL): Sell the primary short call leg.\n' +
        'LEG 3 (SELL the $200 CALL): Additional short call — this creates the undefined-risk exposure.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_naked_call',
      strategyName: 'Short Naked Call',
      riskType: 'UNDEFINED',
      popRange: [70, 80],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    await expect(authedPage.getByText(/the trade in simple terms/i)).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC2: "partially offsets" must appear instead of "defines and caps"
    expect(bodyText).toMatch(/partially offsets/i)
    expect(bodyText).not.toMatch(/defines and caps.*maximum risk/i)
  })

  // AC3: Short strangle (no long legs) — long-leg text does not appear at all.
  test('AC3: short strangle with no long legs — long-leg text does not appear', async ({ authedPage }) => {
    const narrative = buildNarrative({
      trade_plain_english:
        'Here is exactly what this trade looks like, leg by leg:\n' +
        'LEG 1 (SELL the $195 CALL): Selling this OTM call collects the upper premium. ' +
        'Time decay works in your favour on this leg.\n' +
        'LEG 2 (SELL the $175 PUT): Selling this OTM put collects the lower premium. ' +
        'Time decay works in your favour on this leg.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    await expect(authedPage.getByText(/the trade in simple terms/i)).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC3: Neither "partially offsets" nor "defines and caps" should appear (no long legs)
    expect(bodyText).not.toMatch(/partially offsets|defines and caps/i)
  })
})

// ─── Story 7 — FR-G3: Defensive tactic named branches ────────────────────────

test.describe('Story 7 — FR-G3: Defensive tactic named branches for specific strategies', () => {
  // AC1: call_butterfly → "How to Adjust if Wrong" contains butterfly-specific tactic text.
  test('AC1: call butterfly — defensive tactic section contains butterfly-specific guidance', async ({ authedPage }) => {
    const narrative = buildNarrative({
      defensive_tactic:
        'A call butterfly profits most when the stock lands near the body strike at expiration. ' +
        'If the stock moves significantly away from that body strike — either direction — the position ' +
        'loses value. The primary adjustment for a losing butterfly is to close it early: ' +
        'if the spread has lost 50% of what you paid, exit and take the defined loss rather than ' +
        'riding to maximum loss. Do not roll a butterfly — the structure\'s value depends entirely ' +
        'on the stock staying pinned near the body, and rolling changes that target price. ' +
        'If the stock is approaching expiry near the body strike (a winning scenario), be aware of ' +
        'pin risk: if the stock expires exactly at the short strike, you may be assigned on the short ' +
        'options while your long options expire worthless. Close the entire position before expiry, ' +
        'not at expiry.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'call_butterfly',
      strategyName: 'Call Butterfly',
      riskType: 'DEFINED',
      popRange: [20, 40],
      profitTargetPct: 25,
      narrative,
      bias: 'BULLISH',
      category: 'BULLISH',
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC1: Butterfly-specific language must appear
    expect(bodyText).toMatch(/body strike|pin risk|50% of what you paid/i)
    // AC1: The generic fallback "Monitor the position daily" must NOT be the only guidance
    // (it may appear in other sections but the defensive section must have specific butterfly text)
    expect(bodyText).toMatch(/butterfly|body strike/i)
  })

  // AC2: put_butterfly → defensive tactic contains butterfly-specific guidance.
  test('AC2: put butterfly — defensive tactic section contains butterfly-specific guidance', async ({ authedPage }) => {
    const narrative = buildNarrative({
      defensive_tactic:
        'A put butterfly profits most when the stock lands near the body strike at expiration. ' +
        'If the stock moves away from that body strike in either direction, the position decays toward ' +
        'zero value. The correct response is early exit: close the spread if it has lost 50% of the ' +
        'premium paid — do not hold for maximum loss hoping for a mean-reversion. ' +
        'Do not roll a butterfly — rolling changes the target price and defeats the structure. ' +
        'Near expiry, if the stock is pinned at the short strikes, close the entire butterfly before ' +
        'the final day to avoid pin-risk assignment on the body legs. ' +
        'The maximum profit is only achievable at exactly the body strike — do not hold to try to ' +
        'capture the last few dollars; close when you have captured 75–80% of the theoretical maximum.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'put_butterfly',
      strategyName: 'Put Butterfly',
      riskType: 'DEFINED',
      popRange: [20, 40],
      profitTargetPct: 25,
      narrative,
      bias: 'BEARISH',
      category: 'BEARISH',
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC2: Put-butterfly-specific language
    expect(bodyText).toMatch(/body strike|pin risk|75.?80%/i)
    expect(bodyText).not.toMatch(/Monitor the position daily as expiration approaches and close/i)
  })

  // AC3: call_calendar → defensive tactic contains calendar-specific guidance.
  test('AC3: call calendar — defensive tactic contains calendar-specific management guidance', async ({ authedPage }) => {
    const narrative = buildNarrative({
      defensive_tactic:
        'A call calendar\'s primary risk is a large move in the underlying in either direction ' +
        'before the front-month leg expires. A sharp rally pushes both legs deep ITM (where the ' +
        'calendar collapses in value), and a sharp decline makes both legs worthless. ' +
        'If the stock moves more than 5–7% away from the short strike before front-month expiry, ' +
        'consider closing the entire calendar — the theta advantage is gone once the stock is ' +
        'significantly off-target. ' +
        'If implied volatility drops sharply (IV crush), the back-month long option loses value ' +
        'faster than expected; in that scenario, close the calendar rather than waiting. ' +
        'At front-month expiration, if the short call expires worthless (the best case), you can ' +
        'either close the remaining long back-month call for a profit or sell a new front-month call ' +
        'to roll the calendar forward and collect more premium.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'call_calendar',
      strategyName: 'Call Calendar',
      riskType: 'DEFINED',
      popRange: [50, 65],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC3: Calendar-specific guidance: front-month, back-month, roll forward
    expect(bodyText).toMatch(/front-month|back-month|roll.*forward|short.*front.month/i)
    // AC3: Generic fallback must NOT be the only guidance
    expect(bodyText).not.toMatch(/Monitor the position daily as expiration approaches and close/i)
  })
})

// ─── Story 8 — FR-G1: Why-this-strategy named branches ───────────────────────

test.describe('Story 8 — FR-G1: Named why-this-strategy branches for ZEBRA and calendar strategies', () => {
  // AC1: call_zebra → "Why This Strategy" contains ZEBRA-specific language, NOT the generic fallback.
  test('AC1: call ZEBRA — Why This Strategy contains ZEBRA-specific leveraged directional language', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline: 'Pay $0.20 net debit for leveraged directional exposure — BULLISH ZEBRA setup',
      why_this_strategy:
        'The Call ZEBRA (Zero-Extrinsic-value Back-Ratio Acquisition) is a leveraged ' +
        'directional structure. By buying two calls and selling one deeper-ITM call, you construct ' +
        'a position that behaves like a long call but with roughly 2× the delta response — ' +
        'gaining approximately $2 for every $1 AAPL rises above the long strikes. ' +
        'The net debit is typically small (sometimes near zero) because the short deep-ITM call ' +
        'offsets much of the cost. The trade is appropriate here because the bias is Bullish ' +
        'and you want leveraged directional exposure without paying full long-call premium. ' +
        'With IVR at 72, the ZEBRA structure is worth the premium given the directional conviction. ' +
        '\n\nThis is a DEFINED-RISK strategy: your maximum loss is the net debit paid.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'call_zebra',
      strategyName: 'Call ZEBRA',
      riskType: 'DEFINED',
      popRange: [50, 65],
      profitTargetPct: 50,
      narrative,
      bias: 'BULLISH',
      category: 'BULLISH',
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const whyPanel = authedPage.getByText(/why this strategy/i).first()
    await expect(whyPanel).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC1: ZEBRA-specific language must appear
    expect(bodyText).toMatch(/Zero-Extrinsic|leveraged.*directional|2× the delta|2x the delta|\$2 for every \$1/i)
    // AC1: Must NOT contain only the generic else text
    expect(bodyText).not.toMatch(/structured to perform in a.*IV environment/i)
  })

  // AC2: call_calendar → "Why This Strategy" contains calendar-specific language.
  test('AC2: call calendar — Why This Strategy contains calendar-specific vega/theta language', async ({ authedPage }) => {
    const narrative = buildNarrative({
      why_this_strategy:
        'The Call Calendar is a vega and theta trade, not primarily a directional one. ' +
        'By selling a near-term call and buying a longer-dated call ' +
        'at the same strike, you collect the faster time-decay of the front-month leg ' +
        'while holding the slower-decaying back-month leg. The position profits when AAPL ' +
        'stays near the strike — the front-month option expires worthless (or is bought back cheaply) ' +
        'and the back-month option retains its value. ' +
        'Calendars also benefit from a rise in implied volatility (they are net long vega) — ' +
        'if IV expands after entry, the back-month leg gains more value than the short front-month loses. ' +
        'At IVR 72, the IV environment is supportive of this structure. ' +
        '\n\nThis is a DEFINED-RISK strategy.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'call_calendar',
      strategyName: 'Call Calendar',
      riskType: 'DEFINED',
      popRange: [50, 65],
      profitTargetPct: 50,
      narrative,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    await expect(authedPage.getByText(/why this strategy/i).first()).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC2: Calendar-specific language: front-month/back-month theta/vega
    expect(bodyText).toMatch(/front-month|back-month|net long vega|faster time-decay/i)
    // AC2: Must NOT be the generic fallback
    expect(bodyText).not.toMatch(/structured to perform in a.*IV environment/i)
  })

  // AC3: collar → "Why This Strategy" contains collar-specific protective language.
  test('AC3: collar — Why This Strategy contains collar-specific capital preservation language', async ({ authedPage }) => {
    const narrative = buildNarrative({
      why_this_strategy:
        'The Collar is a capital-preservation structure for shareholders. ' +
        'By selling an out-of-the-money call against an existing long stock position ' +
        'and using that premium to purchase a protective put, you create a defined range: ' +
        'the put sets a floor on your downside loss, and the call caps your upside gain ' +
        'in exchange for the income it generates. ' +
        'The net cost of the collar is typically low (sometimes zero or a small credit) ' +
        'because the call premium offsets the put cost. ' +
        'This is appropriate when the primary goal is protecting an existing AAPL position ' +
        'rather than speculating on direction. With IVR at 72, ' +
        'the call premium collected is above average — an attractive time to sell the covered call component. ' +
        '\n\nThis is a DEFINED-RISK strategy.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'collar',
      strategyName: 'Collar',
      riskType: 'DEFINED',
      popRange: [55, 70],
      profitTargetPct: 50,
      narrative,
      bias: 'BULLISH',
      category: 'BULLISH',
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    await expect(authedPage.getByText(/why this strategy/i).first()).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC3: Collar-specific language: protective put, covered call, floor
    expect(bodyText).toMatch(/capital-preservation|protective put|floor.*downside|covered call component/i)
    // AC3: Must NOT be the generic fallback
    expect(bodyText).not.toMatch(/structured to perform in a.*IV environment/i)
  })
})

// ─── Story 9 — FR-E3: pop_estimate preferred over catalog pop_range ────────────

test.describe('Story 9 — FR-E3: pop_estimate preferred over catalog pop_range in profit scenario', () => {
  // AC1: When pop_estimate==62, profit scenario shows "62%" not a catalog range.
  test('AC1: pop_estimate present — profit scenario shows single percentage, not a range', async ({ authedPage }) => {
    const narrative = buildNarrative({
      profit_scenario:
        'Based on the delta of the selected strikes, this setup has an estimated ' +
        '62% theoretical probability of being profitable at expiration — ' +
        'derived from the actual leg deltas at the chosen strikes, not a catalog range. ' +
        'This is a positive-expectancy structure — you will have losing trades, ' +
        'but the winners should more than offset them when managed consistently.',
      why_this_strategy:
        'The Short Strangle is a DEFINED-RISK strategy designed for HIGH IV environments. ' +
        'The estimated probability of profit is 62% — ' +
        'computed from the actual strike deltas selected for this trade. ' +
        'Statistically, this trade wins more often than it loses.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      popEstimate: 62,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const profitPanel = authedPage.getByText(/if it works/i).first()
    await expect(profitPanel).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC1: Single computed percentage must appear in the narrative
    expect(bodyText).toMatch(/62%/i)
    // AC1: The profit scenario must use a single figure not the catalog range
    // The narrative mock has the specific text "estimated 62% theoretical probability"
    expect(bodyText).toMatch(/estimated 62% theoretical probability/i)
    // AC1: The catalog range pattern must NOT appear in the profit scenario context
    expect(bodyText).not.toMatch(/estimated 60.?70% theoretical probability/i)
  })

  // AC2: When pop_estimate==null, profit scenario falls back to catalog pop_range.
  test('AC2: pop_estimate null — profit scenario falls back to catalog pop_range', async ({ authedPage }) => {
    const narrative = buildNarrative({
      profit_scenario:
        'Based on the delta of the short strikes, this setup has an estimated ' +
        '60–70% theoretical probability of being profitable at expiration — ' +
        'derived from options delta theory, not historical backtesting. ' +
        'Statistically, this trade wins more often than it loses. ' +
        'A common approach is to put on many high-probability trades, take losses when they happen, ' +
        'and let the math work over time.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      popEstimate: null,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const profitPanel = authedPage.getByText(/if it works/i).first()
    await expect(profitPanel).toBeVisible({ timeout: 10000 })

    const bodyText = await authedPage.locator('body').textContent()

    // AC2: Catalog range fallback appears when pop_estimate is null
    expect(bodyText).toMatch(/60.?70%/i)
    // AC2: No crash — page renders normally
    await expect(authedPage.getByText(/why this strategy/i).first()).toBeVisible({ timeout: 10000 })
  })

  // AC3: POP figure in "Why This Strategy" is consistent with "If It Works" when pop_estimate is set.
  test('AC3: pop_estimate consistent between Why This Strategy and If It Works panels', async ({ authedPage }) => {
    const narrative = buildNarrative({
      profit_scenario:
        'Based on the delta of the selected strikes, this setup has an estimated ' +
        '68% theoretical probability of being profitable at expiration — ' +
        'derived from the actual leg deltas at the chosen strikes, not a catalog range.',
      why_this_strategy:
        'The Short Strangle is a DEFINED-RISK strategy designed for HIGH IV environments. ' +
        'The estimated probability of profit is 68% — ' +
        'computed from the actual strike deltas selected for this trade. ' +
        'Statistically, this trade wins more often than it loses.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'short_strangle',
      strategyName: 'Short Strangle',
      riskType: 'UNDEFINED',
      popRange: [60, 70],
      profitTargetPct: 50,
      narrative,
      popEstimate: 68,
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    const bodyText = await authedPage.locator('body').textContent()

    // AC3: 68% must appear in both sections (profit scenario and why-this-strategy)
    // Both mock narrative strings contain "68%" — it should appear at least twice
    const matches = (bodyText ?? '').match(/68%/gi)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(2)

    // AC3: The catalog range pattern must NOT appear in either narrative section
    // (use specific pattern matching against the narrative mock text, not a raw range like "60–70%"
    // which could appear in other UI panels)
    expect(bodyText).not.toMatch(/estimated 60.?70% theoretical probability/i)
  })
})

// ─── Mobile viewport regression for v2 features ──────────────────────────────

test.describe('Mobile viewport — v2 narrative features render correctly', () => {
  test('v2 narrative panels (MARGIN NOTICE, IMMINENT, ZEBRA) visible on mobile (390x844)', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })

    const narrative = buildNarrative({
      market_snapshot:
        'AAPL is trading at $185.50. RSI is 55.1. ' +
        '\n\nEARNINGS IMMINENT: AAPL reports earnings today or tomorrow. ' +
        'IV crush risk is immediate.',
      why_this_strategy:
        'The Call ZEBRA (Zero-Extrinsic-value Back-Ratio Acquisition) is a leveraged ' +
        'directional structure gaining approximately $2 for every $1 AAPL rises.',
      trade_plain_english:
        'MARGIN NOTICE: undefined-risk positions require margin reserved in your broker account. ' +
        'As a rule of thumb, expect 20–25% of the notional value of the short strike(s). ' +
        '\n\nHere is exactly what this trade looks like, leg by leg: sell the $195 call.',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'call_zebra',
      strategyName: 'Call ZEBRA',
      riskType: 'DEFINED',
      popRange: [50, 65],
      profitTargetPct: 50,
      narrative,
      bias: 'BULLISH',
      category: 'BULLISH',
    })

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    const scannerTab = authedPage.getByRole('button', { name: /strategy scanner/i })
      .or(authedPage.getByRole('button', { name: /scanner/i }))
      .or(authedPage.getByRole('button', { name: /scan/i }))
    await scannerTab.first().click()

    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 15000 })
    await authedPage.getByRole('button', { name: /analyze/i }).first().click()
    await expect(authedPage.getByText(/deep analysis/i).first()).toBeVisible({ timeout: 10000 })

    // All narrative text is inside the accordion — expand it on mobile too
    await expandFirstStrategyNarrative(authedPage)

    const expandedBody = await authedPage.locator('body').textContent()

    // EARNINGS IMMINENT, ZEBRA, and MARGIN NOTICE must all render inside the accordion on mobile
    expect(expandedBody).toMatch(/EARNINGS IMMINENT/i)
    expect(expandedBody).toMatch(/Zero-Extrinsic|leveraged.*directional|\$2 for every \$1/i)
    expect(expandedBody).toMatch(/MARGIN NOTICE/i)
  })
})

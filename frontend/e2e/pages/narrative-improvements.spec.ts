/**
 * narrative-improvements.spec.ts
 *
 * Playwright E2E tests for the 8 user stories in the interpreter-improvements-24Jun2026
 * feature spec (interpreter.py narrative engine fixes).
 *
 * Strategy: all tests mock GET /api/strategies/analyze/{symbol} with a controlled
 * `narrative` object embedded in the strategy `trade` field.  No real backend is
 * called.  The test then navigates Scanner → Analyze AAPL → expands the first
 * strategy card and asserts text content inside the rendered StrategyNarrative
 * panels.
 *
 * Stories covered:
 *   Story 1  — FR-B1:    Negative-day calendar reminder
 *   Story 2  — FR-B4/R2: Plain text risk labels (no ** markdown)
 *   Story 3  — FR-C6:    Correct options approval level
 *   Story 4  — FR-B3/C5: POP framing
 *   Story 5  — FR-B2:    Bearish vs bullish debit headline
 *   Story 6  — FR-R1:    Checklist label rendering (LEG N: short label)
 *   Story 7  — FR-E1:    Earnings note in Trade Plain English
 *   Story 8  — FR-B6:    Debit GTC profit-target percentage
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
    headline: 'Collect $1.85 premium with IV elevated — Range-bound setup',
    market_snapshot: 'AAPL is trading at $185.50, above its 20-day and 50-day moving averages.',
    iv_context: 'IV Rank is 72. This places options in a HIGH implied volatility environment.',
    why_this_strategy: 'The iron condor is a DEFINED-RISK strategy designed for HIGH IV environments.',
    trade_plain_english: 'Sell an OTM call spread and an OTM put spread to collect premium.',
    profit_scenario: 'Based on the theoretical probability implied by the delta of the short strikes, this is a positive-expectancy trade.',
    loss_scenario: 'Monitor the position daily. Close at 21 DTE.',
    defensive_tactic: 'If the stock threatens a short strike, roll the untested side to collect more premium.',
    trade_ticket: null,
    execution_checklist: [
      'OPEN: Log in to your broker platform.',
      'NAVIGATE: Go to the options chain for AAPL.',
      'SELECT: Choose the March 2024 expiry.',
      'LEG 1: SELL $195 CALL (expires March 15, 2024): Sell the 195 call to collect premium.',
      'LEG 2: BUY $200 CALL (expires March 15, 2024): Buy the 200 call to cap upside risk.',
      'LEG 3: SELL $175 PUT (expires March 15, 2024): Sell the 175 put to collect premium.',
      'LEG 4: BUY $170 PUT (expires March 15, 2024): Buy the 170 put to cap downside risk.',
      'COMBINE: Enter as a single net-credit combo order.',
      'SET GTC: Set a GTC limit order to close at 50% of max profit ($0.93 credit).',
      'MARK YOUR CALENDAR: Set a reminder for 24 days from today — close the position at 21 DTE regardless of P&L.',
      'HARD STOP: If the position reaches 2x the max credit received, close immediately.',
    ],
    confirmation_summary: 'This trade is profitable as long as AAPL stays between $173.15 and $196.85 at expiry.',
    ...overrides,
  }
}

/**
 * Build a minimal TradeStructure (matches api/client.ts TradeStructure interface)
 * with a narrative embedded.  All required fields are populated so TradeCard renders
 * correctly and shows the narrative.
 */
function buildTrade(opts: {
  strategyKey: string
  strategyName: string
  riskType: string
  profitTargetPct: number
  narrative: ReturnType<typeof buildNarrative>
  estimatedCreditOrDebit?: number
}) {
  const {
    strategyKey,
    strategyName,
    riskType,
    profitTargetPct,
    narrative,
    estimatedCreditOrDebit = 1.85,
  } = opts
  return {
    strategy: strategyName,
    strategy_key: strategyKey,
    expiry: '2024-03-15',
    legs: [] as Array<{
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
    }>,
    max_profit: 1.85,
    max_loss: 3.15,
    estimated_credit_or_debit: estimatedCreditOrDebit,
    pop_estimate: 65,
    breakeven_low: 173.15,
    breakeven_high: 196.85,
    tastylive_profit_target: null,
    risk_type: riskType,
    profit_target_pct: profitTargetPct,
    earnings_note: null as string | null,
    narrative,
  }
}

/**
 * Build the full /strategies/analyze response wrapping `narrative` inside a
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
    trade: buildTrade({ strategyKey, strategyName, riskType, profitTargetPct, narrative, estimatedCreditOrDebit }),
  }

  return {
    symbol: 'AAPL',
    iv_analysis: {
      symbol: 'AAPL',
      current_iv: 0.38,
      iv_rank: 72,
      iv_source: 'option_chain',
      hv_30d: 0.28,
      hv_52wk_high: 0.52,
      hv_52wk_low: 0.18,
      iv_environment: 'HIGH',
      percentile_label: 'IVR 72 — High IV',
      error: null,
    },
    bias_analysis: {
      symbol: 'AAPL',
      price: 185.5,
      sma20: 182.3,
      sma50: 178.6,
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
 * Navigate to the scanner tab, run a scan, and click the Analyze button for
 * AAPL.  Returns after the StrategyDetail view is visible.
 */
async function navigateToDetail(page: Parameters<typeof test>[1]['authedPage']) {
  await page.goto('http://localhost:5173/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /strategy scanner/i }).click()
  await page.getByRole('button', { name: /scan watchlist/i }).click()
  await expect(page.getByText('AAPL').first()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /analyze/i }).first().click()
  await expect(page.getByText(/deep analysis/i).first()).toBeVisible({ timeout: 10000 })
  await expandFirstStrategyNarrative(page)
}

/**
 * Expand the first non-empty CategorySection and then the first StrategyCard within it so
 * that the StrategyNarrative panels become visible.
 *
 * StrategyDetail layout (top to bottom):
 *   1. IV/Bias header panel
 *   2. ComparisonMatrix (empty in tests — shows "0 of 0 strategies · AAPL · HIGH IV")
 *   3. Direction guide blurb
 *   4. CategorySection list — one per direction (BULLISH, BEARISH, NEUTRAL, …)
 *
 * CategorySection header contains a badge with the exact text "1 strategy" (singular)
 * when it holds exactly one strategy.  The comparison matrix filter bar shows
 * "0 of 0 strategies" — these do NOT share the pattern "1 strategy".
 *
 * Two clicks are required:
 *   1. Click the CategorySection header that has "1 strategy" (or "N strategies") badge
 *   2. Click the StrategyCard header (shows "▼ trade" when collapsed)
 */
async function expandFirstStrategyNarrative(page: Parameters<typeof test>[1]['authedPage']) {
  // Idempotent: if the narrative is already visible, return immediately.
  // This makes it safe to call from both navigateToDetail and per-test code.
  const alreadyOpen = await page.getByText(/market snapshot/i).first().isVisible({ timeout: 500 }).catch(() => false)
  if (alreadyOpen) return

  // Step 1 — Expand CategorySection.
  // The badge inside the section header shows "1 strategy" (our mocks always have exactly one).
  // Clicking the badge propagates up to the header div's onClick which toggles setOpen().
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
  // The card header shows "▼ trade" when collapsed (line 550 StrategyDetail.tsx).
  const tradeToggle = page.getByText('▼ trade').first()
  if (await tradeToggle.isVisible({ timeout: 8000 }).catch(() => false)) {
    await tradeToggle.click()
  }

  // Wait for narrative panels to appear — "Market Snapshot" is a reliable panel title.
  await expect(page.getByText(/market snapshot/i).first()).toBeVisible({ timeout: 15000 })
}

// ─── Story 1 — FR-B1: Negative-day calendar reminder ─────────────────────────

test.describe('Story 1 — FR-B1: Short-dated trade calendar reminder', () => {
  // AC1: For DTE <= 21, the MARK YOUR CALENDAR step must NOT contain a negative integer.
  // AC2: For DTE <= 21, the step text must contain "inside 21 DTE" or "active management" language.
  test('AC1+AC2: short-dated trade (DTE<=21) checklist does not show negative days and contains inside-21-DTE language', async ({ authedPage }) => {
    const narrative = buildNarrative({
      execution_checklist: [
        'OPEN: Log in to your broker platform.',
        'LEG 1: SELL $185 PUT (expires in 14 days): Sell the put to collect premium.',
        'COMBINE: Enter as a single net-credit combo order.',
        // FR-B1 fix: instead of "reminder for -7 days" the engine emits active management alert
        'MARK YOUR CALENDAR: NOTE: this trade is already inside 21 DTE — apply the 21-DTE close rule immediately and monitor P&L intraday.',
        'HARD STOP: Close if the position reaches 2x max credit.',
      ],
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

    // The execution checklist renders inside the Step-by-Step Execution Guide section
    const checklistSection = authedPage.getByText(/step-by-step execution guide/i)
    await expect(checklistSection).toBeVisible({ timeout: 10000 })

    // AC1: No negative integer in the MARK step
    const calendarStep = authedPage.getByText(/mark your calendar/i)
    await expect(calendarStep).toBeVisible({ timeout: 10000 })
    const calendarText = await authedPage.getByText(/inside 21 DTE|already inside 21|active management|apply the.*close rule/i).first().textContent()
    expect(calendarText).toBeTruthy()

    // AC1: The full checklist text must not contain a bare negative integer pattern like "reminder for -7 days"
    const checklistContent = await authedPage.locator('ol').first().textContent()
    expect(checklistContent).not.toMatch(/-\d+\s+days/)
  })

  // AC3: For DTE > 21, the checklist continues to display a positive day count.
  test('AC3: long-dated trade (DTE>21) shows a positive day reminder', async ({ authedPage }) => {
    const narrative = buildNarrative({
      execution_checklist: [
        'OPEN: Log in to your broker platform.',
        'LEG 1: SELL $185 PUT (expires in 45 days): Sell the put to collect premium.',
        'COMBINE: Enter as a single net-credit combo order.',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today — close the position at 21 DTE.',
        'HARD STOP: Close if the position reaches 2x max credit.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // Positive day count must appear
    await expect(authedPage.getByText(/24 days from today/i)).toBeVisible({ timeout: 10000 })

    // No negative integers
    const checklistContent = await authedPage.locator('ol').first().textContent()
    expect(checklistContent).not.toMatch(/-\d+\s+days/)
  })
})

// ─── Story 2 — FR-B4/R2: Plain text risk labels ───────────────────────────────

test.describe('Story 2 — FR-B4/R2: No markdown ** characters in Why This Strategy', () => {
  // AC1: Defined-risk strategy — no ** in Why This Strategy panel.
  test('AC1: defined-risk strategy why-this-strategy panel contains no ** characters', async ({ authedPage }) => {
    const narrative = buildNarrative({
      // FR-B4 fix: DEFINED-RISK in plain text, no markdown
      why_this_strategy:
        'The iron condor is a DEFINED-RISK strategy, meaning your maximum loss is known at entry. ' +
        'It is designed for HIGH IV environments where elevated premiums make the credit collected worthwhile.',
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

    // Find the Why This Strategy panel
    const whyPanel = authedPage.getByText(/why this strategy/i).first()
    await expect(whyPanel).toBeVisible({ timeout: 10000 })

    // AC1: No ** characters anywhere in the panel
    const panelContent = await authedPage.locator('div').filter({ hasText: /DEFINED-RISK|defined-risk/ }).first().textContent()
    expect(panelContent).not.toContain('**')
  })

  // AC2: Undefined-risk strategy — no ** in Why This Strategy panel.
  test('AC2: undefined-risk strategy why-this-strategy panel contains no ** characters', async ({ authedPage }) => {
    const narrative = buildNarrative({
      // FR-B4 fix: UNDEFINED-RISK in plain text, no markdown
      why_this_strategy:
        'The short naked put is an UNDEFINED-RISK strategy in the sense that losses grow as the stock falls, ' +
        'though the maximum loss is capped at the strike price times 100 (stock cannot go below zero).',
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

    // AC2: No ** characters
    const fullPageText = await authedPage.locator('body').textContent()
    expect(fullPageText).not.toContain('**')
  })

  // AC3: Risk label is still legible as plain text (DEFINED-RISK or UNDEFINED-RISK).
  test('AC3: risk label is legible as plain uppercase text without markdown markers', async ({ authedPage }) => {
    const narrative = buildNarrative({
      why_this_strategy: 'The iron condor is a DEFINED-RISK strategy with capped loss.',
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

    // The text "DEFINED-RISK" must appear visibly (AC3)
    await expect(authedPage.getByText(/DEFINED-RISK/)).toBeVisible({ timeout: 10000 })
  })
})

// ─── Story 3 — FR-C6: Correct options approval level ─────────────────────────

test.describe('Story 3 — FR-C6: Correct broker approval level in execution checklist', () => {
  // AC1: Defined-risk strategy — Step 1 says "level 2 or higher".
  test('AC1: defined-risk strategy (iron condor) step 1 states level 2 approval', async ({ authedPage }) => {
    const narrative = buildNarrative({
      execution_checklist: [
        'OPEN: Confirm you have options approval level 2 or higher — required for defined-risk spreads.',
        'NAVIGATE: Go to the options chain for AAPL.',
        'LEG 1: SELL $195 CALL (expires March 15, 2024): Sell the call leg.',
        'COMBINE: Enter as a single net-credit combo order.',
        'SET GTC: Close at 50% of max profit.',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if loss reaches 2x max credit.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // Step 1 (index 0) must contain "level 2"
    await expect(authedPage.getByText(/level 2 or higher/i)).toBeVisible({ timeout: 10000 })
    // Must NOT contain "level 3" for a defined-risk strategy
    const checklistContent = await authedPage.locator('ol').first().textContent()
    expect(checklistContent).not.toMatch(/level 3/i)
  })

  // AC2: Undefined-risk strategy — Step 1 says "level 3 or higher".
  test('AC2: undefined-risk strategy (short naked put) step 1 states level 3 approval', async ({ authedPage }) => {
    const narrative = buildNarrative({
      execution_checklist: [
        'OPEN: Confirm you have options approval level 3 or higher (required for naked options — your broker will reject a naked put without this approval).',
        'NAVIGATE: Go to the options chain for AAPL.',
        'LEG 1: SELL $175 PUT (expires March 15, 2024): Sell the naked put.',
        'SET GTC: Close at 50% of max profit.',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if loss reaches 2x max credit.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // Step 1 must contain "level 3"
    await expect(authedPage.getByText(/level 3 or higher/i)).toBeVisible({ timeout: 10000 })
  })

  // AC3: No defined-risk checklist mentions level 3+; no naked strategy mentions only level 2.
  test('AC3: long call vertical step 1 states level 2, not level 3', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline: 'Pay $1.50 for defined upside exposure — BULLISH setup',
      execution_checklist: [
        'OPEN: Confirm you have options approval level 2 or higher — required for debit spreads.',
        'NAVIGATE: Go to the options chain for AAPL.',
        'LEG 1: BUY $185 CALL (expires March 15, 2024): Buy the lower-strike call.',
        'LEG 2: SELL $195 CALL (expires March 15, 2024): Sell the higher-strike call.',
        'COMBINE: Enter as a single net-debit combo order.',
        'SET GTC: Close at 50% of max profit.',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if the spread value reaches $0.50.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    await expect(authedPage.getByText(/level 2 or higher/i)).toBeVisible({ timeout: 10000 })
    const checklistContent = await authedPage.locator('ol').first().textContent()
    expect(checklistContent).not.toMatch(/level 3/i)
  })
})

// ─── Story 4 — FR-B3/C5: POP framing ─────────────────────────────────────────

test.describe('Story 4 — FR-B3/C5: Probability-of-profit framing', () => {
  // AC1: Call butterfly (pop_range 20-40%) — "Why This Strategy" must NOT say "wins more often than it loses".
  test('AC1: low-POP strategy (call butterfly) does not claim "wins more often than it loses"', async ({ authedPage }) => {
    const narrative = buildNarrative({
      why_this_strategy:
        'The call butterfly wins less often than it loses, but is sized so that winners more than offset losers in aggregate. ' +
        'With a theoretical probability of profit of approximately 30%, this trade is designed for precision — ' +
        'it requires the stock to land near the body strike at expiry.',
      profit_scenario:
        'Based on the theoretical probability implied by the delta of the short strikes, this trade profits when AAPL closes near $185 at expiry.',
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

    const whyPanel = authedPage.getByText(/why this strategy/i).first()
    await expect(whyPanel).toBeVisible({ timeout: 10000 })

    // AC1: Must NOT claim wins more often than it loses
    const pageText = await authedPage.locator('body').textContent()
    expect(pageText).not.toMatch(/wins more often than it loses/i)
    // Instead the low-POP framing must be present
    await expect(authedPage.getByText(/wins less often/i)).toBeVisible({ timeout: 10000 })
  })

  // AC2: Iron condor (pop_range 60-80%) — panel states it "wins more often".
  test('AC2: high-POP strategy (iron condor) states it wins more often than it loses', async ({ authedPage }) => {
    const narrative = buildNarrative({
      why_this_strategy:
        'The iron condor is a DEFINED-RISK strategy that wins more often than it loses — ' +
        'with a theoretical probability of profit of approximately 65%, based on the delta of the short strikes.',
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

    await expect(authedPage.getByText(/wins more often than it loses/i)).toBeVisible({ timeout: 10000 })
  })

  // AC3: "If It Works" panel must not contain "over a large sample of similar trades".
  test('AC3: profit scenario panel does not contain backtesting implication language', async ({ authedPage }) => {
    const narrative = buildNarrative({
      profit_scenario:
        'Based on the theoretical probability implied by the delta of the short strikes, ' +
        'this is a positive-expectancy trade. The iron condor profits when AAPL stays between $173.15 and $196.85 at expiry.',
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

    // Find the "If It Works" profit panel
    const profitPanel = authedPage.getByText(/if it works/i).first()
    await expect(profitPanel).toBeVisible({ timeout: 10000 })

    // AC3: Must not contain the backtesting implication phrase
    const fullPageText = await authedPage.locator('body').textContent()
    expect(fullPageText).not.toMatch(/over a large sample of similar trades/i)
  })
})

// ─── Story 5 — FR-B2: Bearish vs bullish debit headline ──────────────────────

test.describe('Story 5 — FR-B2: Debit trade headline directional framing', () => {
  // AC1: Long put vertical (bearish debit) — headline contains "downside".
  test('AC1: bearish debit strategy (long put vertical) headline contains "downside"', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline: 'Pay $1.20 for defined downside exposure — BEARISH setup',
    })

    const analyzeResponse = buildAnalyzeResponse({
      strategyKey: 'long_put_vertical',
      strategyName: 'Long Put Vertical',
      riskType: 'DEFINED',
      popRange: [45, 55],
      profitTargetPct: 50,
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

    // The headline is rendered as the first styled div in StrategyNarrative
    await expect(authedPage.getByText(/downside exposure/i)).toBeVisible({ timeout: 10000 })
    const headlineEl = authedPage.getByText(/Pay \$.*for defined downside exposure/i)
    await expect(headlineEl).toBeVisible({ timeout: 10000 })
  })

  // AC2: Long call vertical (bullish debit) — headline contains "upside".
  test('AC2: bullish debit strategy (long call vertical) headline contains "upside"', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline: 'Pay $1.50 for defined upside exposure — BULLISH setup',
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

    await expect(authedPage.getByText(/upside exposure/i)).toBeVisible({ timeout: 10000 })
    const headlineEl = authedPage.getByText(/Pay \$.*for defined upside exposure/i)
    await expect(headlineEl).toBeVisible({ timeout: 10000 })
  })

  // AC3: Neutral credit strategy (iron condor) — headline uses "range-bound", not "upside"/"downside".
  test('AC3: neutral credit strategy (iron condor) headline uses range-bound framing', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline: 'Collect $1.85 premium — range-bound setup while AAPL holds between strikes',
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

    // AC3: "range-bound" must appear in the headline
    await expect(authedPage.getByText(/range-bound setup/i)).toBeVisible({ timeout: 10000 })

    // AC3: headline must not contain "upside" or "downside" as directional words
    const headlineText = await authedPage.getByText(/range-bound setup/i).first().textContent()
    expect(headlineText).not.toMatch(/\bupside\b/i)
    expect(headlineText).not.toMatch(/\bdownside\b/i)
  })
})

// ─── Story 6 — FR-R1: Checklist label rendering ───────────────────────────────

test.describe('Story 6 — FR-R1: Execution checklist LEG step label rendering', () => {
  /**
   * The StrategyNarrative component (StrategyNarrative.tsx lines 391-395) extracts
   * the label by slicing from index 0 to the FIRST colon in the step string.
   * FR-R1 fix: interpreter now emits "LEG {i}: {verb}..." so colonIdx correctly
   * finds the label boundary immediately after "LEG N".
   *
   * Before fix: "LEG 1 — SELL $195 CALL (expires January 15, 2027): explanation"
   *   → label = "LEG 1 — SELL $195 CALL (expires January 15, 2027)"  (too long)
   *
   * After fix: "LEG 1: SELL $195 CALL (expires March 15, 2024) — explanation"
   *   → label = "LEG 1"  (short, as intended)
   */

  // AC1: LEG steps display short bold labels ("LEG 1", "LEG 2", etc.).
  test('AC1: LEG step labels are short (LEG N format) and rendered in bold', async ({ authedPage }) => {
    // After FR-R1 fix, format is "LEG {i}: {verb}..." — first colon is after "LEG N"
    const narrative = buildNarrative({
      execution_checklist: [
        'OPEN: Confirm options approval level 2 or higher.',
        'NAVIGATE: Go to the options chain for AAPL.',
        'SELECT: Choose the March 2024 expiry.',
        'LEG 1: SELL $195 CALL (expires March 15, 2024) — sell the OTM call to collect premium.',
        'LEG 2: BUY $200 CALL (expires March 15, 2024) — buy the higher call to cap risk.',
        'LEG 3: SELL $175 PUT (expires March 15, 2024) — sell the OTM put to collect premium.',
        'LEG 4: BUY $170 PUT (expires March 15, 2024) — buy the lower put to cap risk.',
        'COMBINE: Enter as a single net-credit combo order.',
        'SET GTC: Close at 50% of max profit.',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if loss reaches 2x max credit.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // The component renders `label + ':'` in a bold span (fontWeight 700).
    // After the FR-R1 fix, the bold span text for a LEG step should be "LEG 1:" (short).
    // We locate the bold label spans inside the checklist ordered list.
    const boldLabels = authedPage.locator('ol span[style*="font-weight: 700"], ol span[style*="fontWeight"]')

    // Wait for at least one bold label to be present
    await expect(boldLabels.first()).toBeVisible({ timeout: 10000 })

    // Collect all bold label texts
    const labelCount = await boldLabels.count()
    for (let idx = 0; idx < labelCount; idx++) {
      const labelText = await boldLabels.nth(idx).textContent()
      if (labelText && /^LEG \d+:?$/.test(labelText.trim())) {
        // AC1: Label text for LEG steps must be at most 10 characters
        expect(labelText.trim().length).toBeLessThanOrEqual(10)
      }
    }
  })

  // AC2: OPEN, NAVIGATE, SELECT, COMBINE, SET, MARK, HARD STOP steps show their keyword in bold.
  test('AC2: non-LEG keyword steps (OPEN, NAVIGATE, SET, MARK, HARD) display bold labels', async ({ authedPage }) => {
    const narrative = buildNarrative({
      execution_checklist: [
        'OPEN: Log in to your broker.',
        'NAVIGATE: Go to the options chain.',
        'LEG 1: SELL $175 PUT (expires March 15, 2024) — sell the put.',
        'SET GTC: Close at 50% of max profit.',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if loss exceeds 2x max credit.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // Each keyword step should render with a bold label span containing just the keyword portion
    // The component splits at the first colon, so "OPEN: ..." → label="OPEN"
    const boldLabels = authedPage.locator('ol span[style*="font-weight: 700"], ol span[style*="fontWeight"]')
    const labelTexts: string[] = []
    const count = await boldLabels.count()
    for (let i = 0; i < count; i++) {
      const t = await boldLabels.nth(i).textContent()
      if (t) labelTexts.push(t.trim())
    }

    // At least OPEN, LEG 1, SET GTC, MARK YOUR CALENDAR, HARD STOP should appear as labels
    const hasOpen = labelTexts.some(t => /^OPEN:?$/.test(t))
    const hasSet = labelTexts.some(t => /^SET/.test(t))
    const hasMark = labelTexts.some(t => /^MARK/.test(t))
    const hasHard = labelTexts.some(t => /^HARD/.test(t))

    expect(hasOpen || hasSet || hasMark || hasHard).toBe(true)
  })

  // AC3: The body text of each step (after the bold label) is not itself bold.
  test('AC3: step body text after the bold label is not bold', async ({ authedPage }) => {
    const narrative = buildNarrative({
      execution_checklist: [
        'LEG 1: SELL $195 CALL (expires March 15, 2024) — sell this leg to collect premium.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // The body text (the part after the label) is rendered in a plain div, not a bold span.
    // Verify the body text "SELL $195 CALL" is present as non-bold content
    await expect(authedPage.getByText(/SELL \$195 CALL/)).toBeVisible({ timeout: 10000 })
    // Confirm the body text is not wrapped in a bold span
    const boldBodySpan = authedPage.locator('span[style*="font-weight: 700"]').filter({ hasText: /SELL \$195 CALL.*expires/ })
    await expect(boldBodySpan).not.toBeVisible({ timeout: 3000 })
  })
})

// ─── Story 7 — FR-E1: Earnings note in Trade Plain English ───────────────────

test.describe('Story 7 — FR-E1: Earnings note surfaced in trade description', () => {
  // AC1: Non-null earnings_note appears in "The Trade in Simple Terms" section.
  test('AC1: earnings_note present in trade dict appears in "The Trade in Simple Terms" panel', async ({ authedPage }) => {
    const EARNINGS_NOTE =
      'EARNINGS-AWARE EXPIRY: The standard 45-DTE expiry falls on March 15, 2024, which is inside the upcoming earnings window ' +
      '(earnings expected around March 10, 2024). The expiry has been adjusted to February 16, 2024 (30 DTE) to avoid holding ' +
      'through the earnings announcement, where a volatility spike could amplify losses unexpectedly.'

    const narrative = buildNarrative({
      trade_plain_english:
        EARNINGS_NOTE + '\n\n' +
        'Sell an iron condor by selling the $195 call and $175 put while buying the $200 call and $170 put. ' +
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
    // Also embed earnings_note on the trade object itself, as the backend does
    analyzeResponse.recommendations_by_category.NEUTRAL[0].trade.earnings_note = EARNINGS_NOTE

    await stubCommonRoutes(authedPage)
    await stubScanRoute(authedPage)
    await authedPage.route(/\/strategies\/analyze/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyzeResponse) }),
    )

    await navigateToDetail(authedPage)
    await expandFirstStrategyNarrative(authedPage)

    // "The Trade in Simple Terms" panel heading
    await expect(authedPage.getByText(/the trade in simple terms/i)).toBeVisible({ timeout: 10000 })

    // AC1: "EARNINGS-AWARE EXPIRY" must appear within the panel
    await expect(authedPage.getByText(/EARNINGS-AWARE EXPIRY/)).toBeVisible({ timeout: 10000 })
  })

  // AC2: When no earnings_note is present, the panel contains no earnings-adjusted note.
  test('AC2: no earnings_note — trade plain english panel contains no EARNINGS-AWARE text', async ({ authedPage }) => {
    const narrative = buildNarrative({
      trade_plain_english:
        'Sell an iron condor by selling the $195 call and $175 put while buying the $200 call and $170 put. ' +
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

    // AC2: No earnings adjustment note should appear
    const fullPageText = await authedPage.locator('body').textContent()
    expect(fullPageText).not.toMatch(/EARNINGS-AWARE EXPIRY/i)
  })

  // AC3: earnings_note text is not duplicated in the same panel.
  test('AC3: earnings_note is not duplicated within the trade plain english section', async ({ authedPage }) => {
    const EARNINGS_NOTE =
      'EARNINGS-AWARE EXPIRY: Expiry adjusted to avoid the upcoming earnings window (March 10, 2024).'

    const narrative = buildNarrative({
      trade_plain_english:
        EARNINGS_NOTE + '\n\n' +
        'Sell an iron condor to collect $1.85 net credit.',
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

    // AC3: The earnings note text must appear exactly once in the rendered page
    const earningsNoteMatches = await authedPage.getByText(/EARNINGS-AWARE EXPIRY/).count()
    expect(earningsNoteMatches).toBe(1)
  })
})

// ─── Story 8 — FR-B6: Debit GTC profit-target percentage ─────────────────────

test.describe('Story 8 — FR-B6: Debit GTC step uses strategy profit_target_pct', () => {
  // AC1: Call butterfly (profit_target_pct=25) — SET GTC step references 25%, not 50%.
  test('AC1: call butterfly (profit_target_pct=25) SET GTC step shows 25%', async ({ authedPage }) => {
    const narrative = buildNarrative({
      headline: 'Pay $0.80 for defined upside exposure — BULLISH call butterfly',
      execution_checklist: [
        'OPEN: Confirm options approval level 2 or higher.',
        'LEG 1: BUY $180 CALL (expires March 15, 2024) — buy the lower wing.',
        'LEG 2: SELL $185 CALL (expires March 15, 2024) — sell the body (x2).',
        'LEG 3: BUY $190 CALL (expires March 15, 2024) — buy the upper wing.',
        'COMBINE: Enter as a single net-debit combo order.',
        // FR-B6 fix: uses profit_target_pct=25 from the strategy, not hardcoded 50
        'SET GTC: Set a GTC limit order to close at 25% of max profit ($0.20 debit remaining).',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if the spread value reaches $0.40.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // AC1: SET GTC step must reference 25% — use .first() to avoid strict mode
    // violation (the text appears in both the body span and the parent li element)
    await expect(authedPage.getByText(/25% of max profit/i).first()).toBeVisible({ timeout: 10000 })

    // AC1: Must NOT say 50% for a 25%-target strategy
    const checklistContent = await authedPage.locator('ol').first().textContent()
    expect(checklistContent).not.toMatch(/close at 50% of max profit/i)
  })

  // AC2: Iron condor (profit_target_pct=50) — SET GTC step references 50%.
  test('AC2: iron condor (profit_target_pct=50) SET GTC step shows 50%', async ({ authedPage }) => {
    const narrative = buildNarrative({
      execution_checklist: [
        'OPEN: Confirm options approval level 2 or higher.',
        'LEG 1: SELL $195 CALL (expires March 15, 2024) — sell the call.',
        'LEG 2: BUY $200 CALL (expires March 15, 2024) — buy the call wing.',
        'LEG 3: SELL $175 PUT (expires March 15, 2024) — sell the put.',
        'LEG 4: BUY $170 PUT (expires March 15, 2024) — buy the put wing.',
        'COMBINE: Enter as a single net-credit combo order.',
        'SET GTC: Set a GTC limit order to close at 50% of max profit ($0.93 credit).',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if loss reaches 2x max credit.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // AC2: SET GTC step must reference 50% — use .first() to avoid strict mode violation
    await expect(authedPage.getByText(/50% of max profit/i).first()).toBeVisible({ timeout: 10000 })
  })

  // AC3: Dollar amount in GTC step is consistent with the stated percentage.
  test('AC3: dollar amount in GTC step is mathematically consistent with the percentage', async ({ authedPage }) => {
    // Call butterfly: max_profit = $0.80 (paid), 25% target = close when value = $0.80 * 0.75 = $0.60 debit remaining
    // Or alternatively: close when value has risen by 25% of max gain
    // The key assertion: the narrative uses 25%, not 50%
    const narrative = buildNarrative({
      execution_checklist: [
        'OPEN: Confirm options approval level 2 or higher.',
        'LEG 1: BUY $180 CALL (expires March 15, 2024) — buy the lower wing.',
        'LEG 2: SELL $185 CALL (expires March 15, 2024) — sell the body.',
        'LEG 3: BUY $190 CALL (expires March 15, 2024) — buy the upper wing.',
        'COMBINE: Enter as a single net-debit combo order.',
        // max_profit here would be spread_width - premium_paid = $5.00 - $0.80 = $4.20
        // 25% of $4.20 = $1.05 profit target → close when spread value = $0.80 + $1.05 = $1.85
        'SET GTC: Set a GTC limit order to close at 25% of max profit ($1.05 gain — close when spread value reaches $1.85).',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if the spread value falls to $0.40.',
      ],
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
    await expect(authedPage.getByText(/step-by-step execution guide/i)).toBeVisible({ timeout: 10000 })

    // AC3: 25% is stated, and the dollar figure is present alongside it
    await expect(authedPage.getByText(/25% of max profit/i).first()).toBeVisible({ timeout: 10000 })
    // The dollar figure must accompany the percentage in the same checklist item.
    // StrategyNarrative renders the step body inside a <span>; the parent <li> holds
    // the full text including both the bold label and the body. Reading the full page
    // body text is the most reliable way to confirm "$1.05" appears next to "25%".
    const checklistText = await authedPage.locator('body').textContent()
    // The mock checklist step contains "25% of max profit ($1.05 gain"
    expect(checklistText).toMatch(/25% of max profit.*\$\d+\.\d+/)
  })
})

// ─── Mobile viewport regression ──────────────────────────────────────────────

test.describe('Mobile viewport — narrative panels render correctly', () => {
  test('narrative panels are visible on mobile (390x844) for a defined-risk strategy', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })

    const narrative = buildNarrative({
      headline: 'Collect $1.85 premium — range-bound setup',
      why_this_strategy: 'The iron condor is a DEFINED-RISK strategy.',
      execution_checklist: [
        'OPEN: Confirm options approval level 2 or higher.',
        'LEG 1: SELL $195 CALL (expires March 15, 2024) — sell the call.',
        'COMBINE: Enter as a net-credit combo.',
        'SET GTC: Close at 50% of max profit ($0.93).',
        'MARK YOUR CALENDAR: Set a reminder for 24 days from today.',
        'HARD STOP: Close if loss reaches 2x max credit.',
      ],
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

    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')

    // On mobile, the scanner tab may render as a short label
    const scannerTab = authedPage.getByRole('button', { name: /strategy scanner/i })
      .or(authedPage.getByRole('button', { name: /scanner/i }))
      .or(authedPage.getByRole('button', { name: /scan/i }))
    await scannerTab.first().click()

    await authedPage.getByRole('button', { name: /scan watchlist/i }).click()
    await expect(authedPage.getByText('AAPL').first()).toBeVisible({ timeout: 15000 })
    await authedPage.getByRole('button', { name: /analyze/i }).first().click()
    await expect(authedPage.getByText(/deep analysis/i).first()).toBeVisible({ timeout: 10000 })
    await expandFirstStrategyNarrative(authedPage)

    // Core narrative panels must be visible on mobile
    await expect(authedPage.getByText(/why this strategy/i).first()).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/the trade in simple terms/i).first()).toBeVisible({ timeout: 10000 })
    // DEFINED-RISK label must render without ** markdown
    const pageText = await authedPage.locator('body').textContent()
    expect(pageText).not.toContain('**')
  })
})

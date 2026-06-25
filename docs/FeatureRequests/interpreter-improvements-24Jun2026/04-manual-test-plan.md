# Manual Test Plan — Narrative Engine Improvements (interpreter.py)

**Feature:** interpreter-improvements-24Jun2026
**Tester:** Manual / Exploratory
**Date:** 24Jun2026
**Scope:** 13 v1 FR changes in `backend/services/interpreter.py` (and one minor change in `StrategyNarrative.tsx`). All changes affect text rendered in the Strategy Narrative panel on the AI tab and Strategy Scanner deep-analysis flow.

---

## Test Environment Prerequisites

- Authenticated non-admin user session (Google OAuth, whitelisted)
- Backend running with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set; `GEMINI_API_KEY` not required for these tests (narrative engine is rule-based)
- Frontend at `http://localhost:5173` or deployed Railway URL
- Browser DevTools open to Console and Network tabs throughout
- Strategy Narrative panel reached via: Options Chain tab → enter symbol → select strategy → narrative renders; OR Strategy Scanner tab → run scan → click Deep Analysis on a result
- Screen resolution tested at: 1280×800 (desktop) and 390×844 (iPhone 14 — use DevTools device emulation)

---

## Section 1 — Happy-Path Tests: One Test Per User Story

Each test targets a specific FR and requires a live options chain response. Testers must use the Strategy Scanner or the AI analysis tab and direct the system toward the named strategy by choosing a ticker and market condition that makes that strategy the top recommendation. Note: the strategy engine chooses the recommendation; the tester can bias the outcome by selecting tickers with known IV profiles.

---

### HT-01 — FR-B1: Negative-Day Calendar Reminder (Story 1)

**Covers:** FR-B1, AC1, AC2, AC3
**Target section:** Step-by-Step Execution Guide — the MARK YOUR CALENDAR step
**Target strategy:** Any credit strategy (short strangle, iron condor) with DTE > 21, then separately verified for DTE <= 21

**Precondition:** A credit strategy (e.g. short strangle on SPY) is recommended. The expiry selected by the engine is more than 21 days away.

**Steps:**
1. Open the AI tab. Enter ticker `SPY`.
2. Wait for strategy recommendation to load. Confirm a credit strategy is shown (headline starts with "Sell a").
3. Scroll to the Step-by-Step Execution Guide section.
4. Locate the step whose bold label reads `MARK YOUR CALENDAR`.

**Expected result (DTE > 21):**
- The MARK YOUR CALENDAR step contains a positive integer in the phrase "set a reminder for N days from today".
- The integer is equal to `DTE - 21`. For example, if expiry is 45 DTE, the number reads 24. It must not be zero, negative, or blank.
- The words "already inside" must NOT appear.

**Fail condition:** Any negative integer, the word "negative", or a value of 0 appears in the reminder text.

---

### HT-02 — FR-B4/R2: Plain Text Risk Labels (Story 2)

**Covers:** FR-B4/R2, all three ACs
**Target section:** Why This Strategy panel
**Target strategy:** Any — the risk_note renders for all strategies

**Precondition:** Any authenticated user has run any strategy analysis. Both defined-risk and undefined-risk results must be checked.

**Steps (defined-risk):**
1. Enter ticker `AAPL`. Wait for narrative to load.
2. Open the "Why This Strategy" panel (second panel in the 2×2 grid).
3. Use browser Find (Ctrl+F / Cmd+F) to search for `**`.
4. Search additionally for `**defined` and `**undefined`.

**Steps (undefined-risk):**
5. Switch to a ticker likely to surface an undefined-risk strategy. Try a high-IV name such as `GME` or manually inspect with a ticker where the scanner returns "Short Naked Put" or "Short Strangle".
6. Repeat the Find search for `**`.

**Expected result:**
- Zero instances of `**` found anywhere in the rendered narrative for either defined-risk or undefined-risk strategies.
- The risk classification text appears as `DEFINED-RISK` or `UNDEFINED-RISK` (uppercase, no asterisks), or equivalent plain prose.
- The word "defined" and "undefined" still appear in the text — only the raw markdown markers are absent.

**Fail condition:** Any literal `**` character is visible in the panel at any font size.

---

### HT-03 — FR-C6: Correct Options Approval Level (Story 3)

**Covers:** FR-C6, all three ACs
**Target section:** Step-by-Step Execution Guide — Step 1 (OPEN YOUR BROKER)
**Target strategy A (defined-risk):** Long call vertical or iron condor
**Target strategy B (undefined-risk):** Short strangle or short naked put

**Precondition:** User has options execution checklist visible (requires live options chain data — a non-empty execution_checklist).

**Steps (defined-risk test):**
1. Enter `QQQ` (liquid, typically mid-IV). Wait for narrative. If iron condor or call vertical is recommended, proceed.
2. Scroll to Step-by-Step Execution Guide.
3. Read Step 1 text carefully.

**Expected result (defined-risk):**
- Step 1 contains the phrase "options approval level 2 or higher" (or equivalent).
- Step 1 does NOT contain "level 3" or "naked".

**Steps (undefined-risk test):**
4. Find a ticker where short strangle or short naked put is recommended. High-IV single stocks work well (try `NVDA` after an earnings move or any ticker the scanner surfaces as undefined-risk).
5. Read Step 1 again.

**Expected result (undefined-risk):**
- Step 1 contains "level 3 or higher" and contains the phrase "naked short options" or equivalent.
- Step 1 does NOT say "level 2 or higher" as the final requirement for an undefined-risk strategy.

**Fail condition:** A short strangle checklist shows only "level 2 or higher". A vertical spread checklist mentions level 3.

---

### HT-04 — FR-B3 and FR-C5: Correct POP Framing (Story 4)

**Covers:** FR-B3 AC1/AC2, FR-C5 AC3
**Target section A:** Why This Strategy panel — pop_note paragraph
**Target section B:** If It Works — Profit Scenario panel — pop_note paragraph
**Target strategy A (low POP):** Call butterfly (pop_range 20–40%)
**Target strategy B (high POP):** Iron condor or short put vertical (pop_range 60–80%)

**Precondition:** A strategy that surfaces a call butterfly. Call butterflies are recommended by the engine in neutral, moderate-IV conditions where a precise price target is implied.

**Steps (low POP — call butterfly):**
1. Try tickers in sideways consolidation with moderate IV (e.g. `IBM` or `KO`). If a call butterfly is surfaced, note the "Why This Strategy" panel.
2. Read the probability-of-profit sentence in "Why This Strategy".
3. Use browser Find to search for the phrase "wins more often than it loses".
4. Also open the "If It Works" panel. Use Find to search for "over a large sample of similar trades".

**Expected result:**
- Step 3: zero matches found — the phrase "wins more often than it loses" must NOT appear for a call butterfly.
- The panel instead contains language acknowledging the trade "wins less often than it loses by design" or equivalent.
- Step 4: zero matches for "over a large sample of similar trades" in the profit scenario panel. The POP note must reference "theoretical probability" or "delta" as the source.

**Steps (high POP — iron condor):**
5. Enter `SPY` or `IWM` (range-bound, high-IV environment). Confirm iron condor or short strangle is recommended.
6. Read the POP sentence in "Why This Strategy".

**Expected result:**
- The panel does contain "wins more often than it loses" for a strategy with pop_range[0] >= 50 such as iron condor (pop_range typically 60–80%).

**Fail condition:** "Wins more often than it loses" appears for a call butterfly. "Over a large sample of similar trades" appears anywhere in the profit scenario.

---

### HT-05 — FR-B2: Bearish Debit Headline (Story 5)

**Covers:** FR-B2, all three ACs
**Target section:** Headline strip at the top of the narrative panel
**Target strategy A (bearish debit):** Long put vertical
**Target strategy B (bullish debit):** Long call vertical

**Precondition:** A bearish stock recommendation. Try a ticker showing a downtrend with bearish RSI and below-both-MAs setup. The engine surfaces "Long Put Vertical" in bearish, low-to-moderate IV conditions.

**Steps (bearish debit):**
1. Find a ticker in a downtrend (bearish bias). Run analysis and confirm "Long Put Vertical" or "Put Butterfly" or "Put ZEBRA" is recommended.
2. Read the headline bar at the top of the narrative (purple/accent-coloured band).

**Expected result:**
- Headline contains the word "downside" — e.g. "Pay $X for defined downside exposure".
- Headline does NOT contain "upside".

**Steps (bullish debit):**
3. Find a ticker in an uptrend (bullish bias, low IV). Run analysis and confirm "Long Call Vertical" or "Poor Man's Covered Call" is recommended.
4. Read the headline bar.

**Expected result:**
- Headline contains "upside" — e.g. "Pay $X for defined upside exposure".
- Headline does NOT contain "downside".

**Steps (neutral credit strategy):**
5. Confirm iron condor or short strangle is recommended on a neutral ticker.
6. Read the headline — it begins with "Sell a".

**Expected result:**
- The headline for a neutral credit strategy neither says "upside" nor "downside" (those words appear only in debit trade headlines).

**Fail condition:** A long put vertical headline says "upside". A long call vertical headline says "downside".

---

### HT-06 — FR-R1: Checklist Label Rendering (Story 6)

**Covers:** FR-R1, all three ACs
**Target section:** Step-by-Step Execution Guide — all LEG steps
**Target strategy:** Any multi-leg strategy (iron condor, short strangle, long call vertical — anything with 2+ option legs)

**Precondition:** Execution checklist is populated (live options chain available).

**Steps:**
1. Open any strategy narrative with a multi-leg trade. The checklist is visible.
2. Inspect the LEG steps visually. Each LEG step has two parts: a bold purple label and lighter body text.
3. Read the bold label on the first LEG step.

**Expected result:**
- The bold label reads "LEG 1:" — just the keyword and number, followed by a colon.
- The bold label does NOT extend into the verb phrase (e.g. "LEG 1 — SELL $150 CALL (expires January 15, 2027)" must NOT be bolded as a single unit).
- After the bold label, the body text is normal weight and describes the action.
- The number in the circle badge (1, 2, 3...) still appears correctly beside each step.

**Additional check — other keywords:**
4. Verify that OPEN, NAVIGATE, SELECT, COMBINE, SET, MARK, HARD STOP steps still show their keyword in bold.
5. Confirm the body of those steps (after the colon) is in normal weight.

**Fail condition:** The entire phrase "LEG 1 — SELL $150 CALL (expires January 15, 2027)" appears in bold accent colour as one block. Or: no bold appears at all on LEG steps (label = null because colonIdx returns -1).

**Mobile check (390×844):**
6. Repeat steps 1–3 in mobile viewport via DevTools device emulation. Confirm the bold label is still legible and the body text wraps correctly on a narrow screen. The bold label must not overflow its container.

---

### HT-07 — FR-E1: Earnings Note in Trade Plain English (Story 7)

**Covers:** FR-E1, all three ACs
**Target section:** The Trade in Simple Terms panel
**Target ticker:** A ticker with upcoming earnings within the standard DTE window (typically 30–45 days). AAPL and MSFT both report quarterly — check current earnings calendar for a ticker with earnings in the next 30–45 days.

**Precondition:** Use a ticker where the strategy engine would adjust the expiry around earnings. The `earnings_note` field in the trade dict is non-null only when the engine actually adjusted the expiry.

**Steps:**
1. Identify a ticker with earnings in approximately 20–40 days from today (24 Jun 2026). Look up the earnings calendar for candidates.
2. Enter that ticker in the AI analysis tab.
3. After the narrative loads, open "The Trade in Simple Terms" panel.
4. Read the first paragraph or two of the panel.

**Expected result (earnings note present):**
- If the strategy engine adjusted the expiry around earnings, the panel's opening content includes an "EARNINGS-AWARE EXPIRY" notice before the "Here is exactly what this trade looks like, leg by leg:" line.
- The text is not repeated again later in the same panel.
- The earnings note makes clear why the expiry was adjusted (e.g. the recommended expiry avoids the earnings date).

**Expected result (no earnings adjustment):**
- If no earnings adjustment occurred, the "EARNINGS-AWARE EXPIRY" prefix does not appear.
- The panel opens with the standard leg-by-leg description.

**Note for testers:** This test depends on the strategy engine deciding to adjust the expiry. If the engine does not trigger the adjustment (because the earnings date falls outside the DTE window), the `earnings_note` field will be null and the narrative will correctly omit it. Document which ticker and earnings scenario was encountered. If no earnings adjustment is triggered on available tickers, document this as "untestable without market data showing earnings in DTE window" and mark for re-test.

**Fail condition:** An `earnings_note` value exists in the API response (`trade.earnings_note` non-null, visible in Network tab) but the text does not appear in "The Trade in Simple Terms" panel.

---

### HT-08 — FR-B6: Debit GTC Profit Target Percentage (Story 8)

**Covers:** FR-B6, all three ACs
**Target section:** Step-by-Step Execution Guide — the SET A GTC PROFIT-TARGET ORDER step
**Target strategy A (25% target):** Call butterfly or call ZEBRA (profit_target_pct = 25)
**Target strategy B (50% target):** Iron condor or short put vertical (profit_target_pct = 50)

**Precondition:** A debit strategy is recommended and the execution checklist is populated.

**Steps (call butterfly — 25% target):**
1. Navigate to a ticker where call butterfly is surfaced (neutral, moderate IV, tight range expectation).
2. Locate the SET A GTC PROFIT-TARGET ORDER step in the checklist.
3. Read the percentage and dollar amounts stated.

**Expected result:**
- The GTC step contains "25%" not "50%".
- The dollar amount shown is mathematically consistent: if the max profit is $400 per contract, the GTC target should be stated as $100 (25% of $400), not $200 (which would be 50%).
- The "Sell to Close" price in the GTC step equals: net debit paid + 25% of max profit.

**Steps (iron condor — 50% target):**
4. Navigate to a ticker where iron condor or short strangle is surfaced.
5. Locate the SET A GTC PROFIT-TARGET ORDER step.

**Expected result:**
- The GTC step for a credit strategy references 50% (or whatever `profit_target_pct` the strategy has). The "Buy to Close" price equals: credit collected × (1 - 0.50), i.e. 50% of what you collected stays as profit.

**Fail condition:** A call butterfly GTC step says "50% of max profit" when the strategy catalog specifies 25%. The dollar amounts do not match the stated percentage.

---

## Section 2 — Edge Case Tests

### EC-01 — DTE Exactly 21 (Boundary Condition for FR-B1)

**Covers:** FR-B1 boundary
**Target section:** MARK YOUR CALENDAR checklist step

**Setup:** This condition requires either finding a naturally expiring position at exactly 21 DTE, or — if testing in a sandbox — manipulating test data so the trade expiry is exactly 21 days from today.

**Steps:**
1. Obtain a strategy recommendation where the expiry date is exactly 21 calendar days from today's date (24 Jun 2026 → expiry = 15 Jul 2026).
2. Open the MARK YOUR CALENDAR step.

**Expected result:**
- `close_date_days = dte - 21 = 0`, which is `<= 0`.
- The step must NOT say "set a reminder for 0 days from today".
- The step must trigger the "already inside 21 DTE" branch: the text should say "NOTE — this trade is already inside 21 DTE (21 days remaining)" or equivalent.
- The words "active management phase" or equivalent urgency must appear.

**Fail condition:** The step says "set a reminder for 0 days from today". This would be the pre-fix behaviour and means the boundary guard is off-by-one.

---

### EC-02 — DTE Exactly 0 (Same-Day Expiry)

**Covers:** FR-B1 extreme boundary; spec Section 7 edge case
**Target section:** MARK YOUR CALENDAR checklist step

**Setup:** Trade expiry equals today's date (24 Jun 2026).

**Steps:**
1. Obtain or simulate a narrative where `expiry == date.today().isoformat()`.
2. Check both the MARK YOUR CALENDAR checklist step and the monitor paragraph in the Loss Scenario panel.

**Expected result (checklist):**
- The MARK YOUR CALENDAR step text says "this trade expires TODAY — close the position immediately if you have not already done so" or equivalent urgency.
- No mention of "days from today" with a numeric value of 0.

**Expected result (loss scenario):**
- The monitor paragraph in the Loss Scenario panel triggers the `dte_loss <= 21` branch (since 0 <= 21), producing the "active management phase / monitor intraday" text.
- It does NOT say "monitor it daily in the final two weeks...close at 21 DTE" as if it is a long-dated trade.

**Fail condition:** Either panel mentions "0 days" as a reminder or does not acknowledge the imminent expiry.

---

### EC-03 — condition_explanation is Empty String (FR-N2)

**Covers:** FR-N2 null/empty guard
**Target section:** Why This Strategy panel

**Background:** The FR-N2 implementation reads `strategy.get("condition_explanation", "")` and only appends the "Why these conditions:" paragraph if the string is non-empty. Some strategies in the catalog may have an empty or missing `condition_explanation`.

**Steps:**
1. In the browser Network tab, capture the API response for a strategy analysis call.
2. Check the `strategy.condition_explanation` field in the response JSON.
3. If a strategy with an empty string is identified (check the catalog for strategies with `condition_explanation = ""`), trigger that strategy's narrative.
4. Open "Why This Strategy" panel.

**Expected result:**
- No "Why these conditions:" paragraph appears in the panel.
- No empty paragraph with just "Why these conditions:" followed by nothing appears.
- The rest of the panel (core, conditions match, risk note, pop note) renders normally without gaps.

**Fail condition:** A visible "Why these conditions:" label appears with no body text, or an empty paragraph creates a visual gap in the panel.

---

### EC-04 — Debit Strategy that is NEUTRAL (Neither Bullish Nor Bearish)

**Covers:** FR-B2 neutral debit case
**Target section:** Headline strip
**Target strategy:** Call butterfly or put butterfly with NEUTRAL bias

**Background:** A call butterfly is a debit trade but targets a neutral or mildly directional outcome. If the engine recommends a call butterfly while `bias == "NEUTRAL"`, the headline debit branch fires. The `exposure_word` logic in `generate_narrative` checks if `strat_key` is in the bearish debit set; call butterfly is NOT in that set, so `exposure_word = "upside"`.

**Steps:**
1. Find a neutral-biased ticker that surfaces a call butterfly (e.g. range-bound stock, RSI near 50, price between SMA20 and SMA50).
2. Read the headline.

**Expected result:**
- Headline says "Pay $X for defined upside exposure" (call butterfly is not bearish, so "upside" is correct).
- This is the intended behaviour — a tester should confirm it is coherent rather than misleading. A call butterfly profits from limited upward movement to the body strike, so "upside" is defensible.

**Observation to record:** If a PUT butterfly appears with NEUTRAL bias, the headline must say "downside" because `put_butterfly` IS in the `_BEARISH_DEBIT_KEYS` set. Verify this is accurate — a neutral put butterfly is a somewhat unusual combination and the "downside" label should be noted.

**Fail condition:** A put butterfly with neutral bias headline says "upside exposure".

---

### EC-05 — Ticker with No Earnings Data

**Covers:** FR-E1 null guard; also verifies earnings section in Market Snapshot does not crash
**Target section:** The Trade in Simple Terms panel; Market Snapshot panel

**Steps:**
1. Enter a ticker where yfinance returns no earnings data. Candidates: very new listings, some ETFs (e.g. `SVXY`, `UVXY`), or international ADRs.
2. After the narrative loads, check the Market Snapshot panel.
3. Check "The Trade in Simple Terms" panel.

**Expected result:**
- Market Snapshot does NOT show an "EARNINGS ALERT" paragraph (since `days_earn is None`, the condition `0 <= days_earn <= 30` is False).
- "The Trade in Simple Terms" does NOT show an "EARNINGS-AWARE EXPIRY" notice.
- No Python traceback or JavaScript error appears in DevTools console.
- All other panels render normally.

**Fail condition:** The word "None" or "null" appears literally in any panel. A JavaScript exception is thrown from the Paragraphs component.

---

### EC-06 — Ticker Where hv_30 = 0

**Covers:** FR-D6 guard (v2 item, but the pre-fix code path is a regression risk)
**Target section:** Why Options Are Priced This Way (IV Context) panel
**Note:** FR-D6 is a v2 item — this test verifies the pre-fix null handling does not crash and documents the current behaviour for baseline.

**Steps:**
1. Enter a ticker where yfinance returns zero or null for 30-day historical volatility. This may occur on: newly listed stocks, some ETFs with short history, or if yfinance is rate-limited.
2. Open the "Why Options Are Priced This Way" panel.

**Expected result (post-fix, if FR-D6 is implemented):**
- Panel contains the text "30-day historical volatility data is unavailable for this symbol" or equivalent.
- The IV base paragraph still renders.
- No crash.

**Expected result (pre-fix baseline, if FR-D6 is NOT yet in v1):**
- The HV comparison paragraph is silently absent (no sentence mentioning "historical volatility").
- No crash or visible error.
- This silent omission is the known behaviour; note it as "pre-fix baseline — FR-D6 scheduled for v2."

**Fail condition (either state):** JavaScript error, "NaN", or a sentence saying "X.X% 0.0%" where 0.0 is the HV figure appearing as if it were real data.

---

## Section 3 — Regression Checks

These verify that changes to the 13 v1 FRs have not accidentally broken surrounding narrative output that was correct before.

### RC-01 — Credit Strategy Standard Premium Text Still Present

**Target section:** The Trade in Simple Terms panel — the Net Result paragraph at the bottom of the leg descriptions

**Steps:**
1. Run analysis on a credit strategy (e.g. short strangle on `SPY`).
2. Scroll to the Net Result paragraph in "The Trade in Simple Terms".

**Expected result:**
- The paragraph reads: "Net result: you COLLECT $X per contract ($Y per share × 100 shares). This cash is deposited into your account the moment the trade fills. It is yours regardless of what happens — the only question is whether you have to give any of it back."
- The dollar amounts are non-zero and match the credit shown in the headline.

**Fail condition:** "COLLECT" is replaced by "PAY" on a credit trade, or the sentence is missing entirely.

---

### RC-02 — Confirmation Summary Box Still Renders

**Target section:** Confirmation Summary — the last element in the narrative (rendered as a text block by the `Paragraphs` component inside the outer narrative container)
**Note:** The spec identifies box-drawing characters (`─`) as a cosmetic issue (FR-R3, v2 deferred). This regression check confirms the summary block still appears even if box-drawing characters are present.

**Steps:**
1. Open any narrative with a complete trade.
2. Scroll past the execution checklist to the bottom of the narrative area.
3. Look for the TRADE SUMMARY block.

**Expected result:**
- The TRADE SUMMARY block is present and contains: Position, Expiry, Entry, Profit zone, Maximum profit, Maximum loss, Exit target, Probability, Risk type lines.
- Each field has a value (non-empty, non-null).
- The closing line "If everything looks right, use the Order Entry panel to place each leg." is present.
- The separator lines (whether box-drawing `─` or plain `-`) appear around the block title.

**Fail condition:** TRADE SUMMARY is entirely absent. One or more of the named fields (Maximum profit, Maximum loss, etc.) is missing.

---

### RC-03 — Trade Ticket Output Unchanged

**Target section:** Order Ticket — Enter This Exactly in Your Broker (blue monospace block)

**Steps:**
1. Open a narrative for a two-leg strategy (e.g. long call vertical on a bullish ticker).
2. Inspect the Order Ticket block.

**Expected result:**
- The ticket shows the format: `BUY/SELL 1 SYMBOL · DD-Mon-YYYY · $STRIKE CALL/PUT SPREAD · @ $X.XX credit/debit per share ($XXX per contract)`.
- For a two-leg spread, the structure shows both legs as a spread (e.g. `$145/$150 CALL SPREAD`).
- No `[THEORETICAL — verify in broker]` note unless the trade used synthetic Black-Scholes data.

**Fail condition:** The ticket is empty, shows "undefined", or the format has changed from the documented structure.

---

### RC-04 — Per-Leg Delta and Bid/Ask Information Still Present

**Target section:** The Trade in Simple Terms panel — each leg paragraph

**Steps:**
1. Open any multi-leg strategy narrative.
2. Read each "Leg N" paragraph.

**Expected result — sell legs:**
- Contains: strike, expiry, mid price (~$X), market bid × ask, delta value, and the "chance of expiring in-the-money" phrasing.
- Contains: "Time decay works in your favour" sentence.

**Expected result — buy legs:**
- Contains: strike, expiry, mid price (~$X), market bid × ask, delta value, and the "$X per share" move sentence.
- Contains: "This leg defines and caps your maximum risk on the trade."

**Fail condition:** Delta, bid, ask, or mid price is missing from any leg description. The leg number (Leg 1, Leg 2, etc.) has changed format.

---

### RC-05 — Why This Strategy Defensive Tactic Renders for Named Strategies

**Target section:** If It Goes Wrong — Defensive Tactic panel

**Steps:**
1. Run a short strangle analysis. Open the Defensive Tactic panel.
2. Run an iron condor analysis. Open the Defensive Tactic panel.
3. Run a short naked put analysis. Open the Defensive Tactic panel.

**Expected result:**
- Each named strategy has a strategy-specific tactic (not the generic fallback text).
- Short strangle: text mentions "roll the untested side."
- Iron condor: text mentions "roll the opposite spread" and "untested side."
- Short naked put: text mentions "roll the put out in time" and "rolling for credit."
- None of these use the generic fallback that starts "Monitor the position daily as expiration approaches. The established options education methodology..."

**Fail condition:** A named strategy (short strangle, iron condor, short naked put) shows the generic tactic text instead of its specific tactic.

---

## Section 4 — Rendering Verification Tests

### RV-01 — No Literal `**` Characters in Why This Strategy

**Target section:** Why This Strategy panel
**Applies to:** Every strategy type rendered

**Steps:**
1. Open the browser DevTools Inspector.
2. Select the "Why This Strategy" panel's inner div.
3. Inspect the rendered text content (right-click → Inspect, look at the `<p>` elements inside the Paragraphs component).
4. Use browser Find (Ctrl+F / Cmd+F) to search for `**` in the page.

**Expected result:**
- Zero matches for `**` anywhere in the Why This Strategy panel.
- The risk classification text appears as "DEFINED-RISK" or "UNDEFINED-RISK" in plain uppercase letters.
- No asterisks appear in any `<p>` tag within the panel's DOM tree.

**Fail condition:** One or more `**` characters appear in the rendered text. This is the exact pre-fix regression that FR-B4/R2 corrects.

**Rapid-click note:** The Paragraphs component is stateless and renders synchronously once data arrives. There is no write operation here, so rapid-click risk does not apply. However, verify that switching between strategies (by re-running analysis on a different ticker) does not leave stale `**` text in the panel before the new data loads.

---

### RV-02 — LEG Step Labels Are Short and Bold

**Target section:** Step-by-Step Execution Guide — LEG steps
**Applies to:** Any strategy with 2+ legs (iron condor, short strangle, long call vertical, call butterfly, etc.)

**Steps:**
1. Open a multi-leg strategy narrative. Look at the execution checklist.
2. Identify the first LEG step.
3. In browser DevTools Inspector, find the `<span style="fontWeight: 700 ...">` element inside the first LEG list item.
4. Read the text content of that span.

**Expected result:**
- The bold span contains only "LEG 1:" — the keyword, the number, and a colon. No em-dash, no verb, no strike, no expiry.
- The text AFTER the bold span (in the adjacent `{body}` render) starts with the verb (e.g. "SELL $150 CALL (expires January 15, 2027)...").
- Total bold text is 5–7 characters ("LEG 1:" or "LEG 2:").

**Fail condition:** The bold span contains more than the label (e.g. "LEG 1 — SELL $150 CALL (expires January 15, 2027)" is all bold). This is the pre-fix rendering defect described in FR-R1 and R1 spec note: `colonIdx` finds the colon inside the expiry format rather than immediately after the label.

---

### RV-03 — Approval Level Text: Level 3 for Short Strangle, Level 2 for Iron Condor

**Target section:** Step-by-Step Execution Guide — Step 1 (OPEN YOUR BROKER)
**Applies to:** Two specific strategy comparisons

**Steps (short strangle):**
1. Run analysis that surfaces a short strangle. Read Step 1 of the checklist.
2. Note the exact phrase containing "options approval".

**Expected result:**
- "level 3 or higher (required for naked short options...)" appears in Step 1.

**Steps (iron condor):**
3. Run analysis that surfaces an iron condor. Read Step 1 of the checklist.
4. Note the exact phrase containing "options approval".

**Expected result:**
- "level 2 or higher" appears in Step 1.
- The phrase "level 3" must NOT appear for an iron condor (it is a defined-risk strategy).

**Note on logic path:** The `_execution_checklist` function computes `is_naked` based on `risk_type == "UNDEFINED" and not has_stock_leg` OR `strat_key in _NAKED_OPTION_KEYS`. Short strangle is in `_NAKED_OPTION_KEYS`; iron condor is not. Covered call has a stock leg, so `has_stock_leg = True` and `is_naked = False` even though `risk_type == "UNDEFINED"` — covered call must show Level 2. Verify this covered-call case as a sub-check.

**Fail condition:** Short strangle shows "level 2 or higher". Iron condor shows "level 3".

---

### RV-04 — IV Environment Category Label Present in IV Context Panel

**Target section:** Why Options Are Priced This Way (IV Context panel)
**Covers:** FR-G5

**Steps:**
1. Run analysis on a high-IV ticker (IVR > 50). Read the IV context panel's first paragraph.
2. Run analysis on a low-IV ticker (IVR < 30). Read the first paragraph.
3. Run analysis on a moderate-IV ticker (IVR 30–50). Read the first paragraph.

**Expected result:**
- For IVR > 50: the first paragraph contains "HIGH implied volatility environment."
- For IVR < 30: the first paragraph contains "LOW implied volatility environment."
- For IVR 30–50: the first paragraph contains "MEDIUM implied volatility environment."
- The category label appears in the same sentence as the IVR number and the current IV% figure.

**Fail condition:** The category label (HIGH/MEDIUM/LOW) is absent. The panel explains IVR percentile but never names the environment bucket.

---

### RV-05 — Conditions Match Note Present in Why This Strategy

**Target section:** Why This Strategy panel
**Covers:** FR-N4

**Steps:**
1. Run any strategy analysis.
2. Open "Why This Strategy."
3. Scroll through the panel text looking for a "Conditions check:" header.

**Expected result:**
- A "Conditions check:" paragraph appears, containing two lines:
  - "IV conditions: [HIGH/MEDIUM/LOW] (strategy designed for [X] IV) — match" or "MISMATCH"
  - "Direction conditions: [bias] (strategy designed for [y] bias) — match" or "MISMATCH"
- If the strategy is designed for "any" IV or direction, the note says "designed for any... — conditions met by definition."

**Fail condition:** No "Conditions check:" section appears. Or the section appears but both lines are identical (a copy-paste bug).

---

### RV-06 — POP Note in Profit Scenario Does Not Imply Backtesting (FR-C5)

**Target section:** If It Works — Profit Scenario panel — last paragraph

**Steps:**
1. Open any strategy narrative's Profit Scenario panel.
2. Use Find to search for the phrase "over a large sample of similar trades".
3. Also search for "historical" in the profit scenario panel.

**Expected result:**
- Zero matches for "over a large sample of similar trades".
- The POP note instead references "theoretical probability" or "delta of the short strikes" as the source of the probability figure.
- The phrase "based on the delta of the short strikes" (or similar) is present.

**Fail condition:** "Over a large sample of similar trades" remains in the profit scenario panel — this is the exact pre-fix text that FR-C5 removes.

---

## Section 5 — Scenarios Automated Playwright Tests Cannot Realistically Cover

The following scenarios are either timing-dependent, visually verifiable only by a human, or require real market data conditions that mock data cannot replicate:

1. **DTE boundary conditions (EC-01, EC-02):** The automated tests use mock trade data with fixed DTE values. A test for DTE = 21 and DTE = 0 requires explicit mock data construction in `frontend/e2e/mock-data.ts`. While this is technically possible to automate, the boundary condition at exactly 21 DTE (where `close_date_days = 0`) is easy to miss in a mock if the wrong date is used. Manual verification with a real expiry date confirms the arithmetic.

2. **Bold label boundary rendering (RV-02, HT-06):** The React rendering of the bold span is deterministic from the data, but whether the bold label looks correct visually — specifically whether a very long expiry format accidentally captures extra text — can only be confirmed by inspecting the rendered DOM and comparing with the visual output in different browsers. Playwright snapshot testing can catch regressions but cannot catch the original defect without a known-good baseline.

3. **No literal `**` characters (RV-01, HT-02):** This could be automated with a text-content assertion, but the defect is subtle — `**` would not cause a React rendering error and would not break any test that asserts element presence. A human scanning the narrative panel notices it immediately; an automated test must be explicitly written for it.

4. **Live earnings_note injection (HT-07):** The `earnings_note` field is only populated when the strategy engine's expiry selection logic actually adjusts the expiry around a real earnings date. Mock data in Playwright tests has a static `earnings_note: null`. Confirming the feature works requires a live ticker with earnings in the DTE window.

5. **condition_explanation empty string (EC-03):** This requires knowing which strategies in the live catalog have empty `condition_explanation` values. The catalog is backend-only; Playwright mocks may not reflect catalog coverage. A human inspecting the network response can spot this.

6. **Cross-browser text rendering of box-drawing characters (RC-02):** The `chr(9472)` separator in the confirmation summary renders differently in Chrome, Firefox, and Safari proportional fonts. Playwright runs in Chromium by default. A human should verify in at least two browsers.

7. **Rapid double-tap on Deep Analysis button (not an FR item but a general risk flag):** The strategy scanner's "Deep Analysis" button triggers the narrative API call. A double-tap could trigger two simultaneous API calls and render two overlapping narratives. This is a pre-existing concern, not introduced by these changes, but should be noted for the scanner tab on mobile.

---

## Section 6 — Fragile Areas Observed Near Changed Code

The following are observations about code paths that are adjacent to the v1 changes and appear brittle. These are not regressions caused by the v1 changes but are risks to note.

**F-01 — `_execution_checklist` profit_target_pct reads from `trade` not `strategy`**
Line 1042: `profit_target_pct = trade.get("profit_target_pct", 50)`. The debit GTC fix (FR-B6) reads the same field. If `strategy_engine.py` fails to copy `profit_target_pct` into the trade dict, both the checklist and the GTC step will silently default to 50 for all strategies. There is no warning when the default fires. A tester should verify in the Network tab that `profit_target_pct` is actually present in the trade dict for a call butterfly response.

**F-02 — `is_naked` detection relies on `trade.get("strategy_key", trade.get("strategy", ""))`**
Line 1056: the key lookup has a fallback chain. If neither `strategy_key` nor `strategy` is in the trade dict, `strat_key_checklist` is an empty string, which is not in `_NAKED_OPTION_KEYS`, so `is_naked` is False and Level 2 is shown even for naked strategies. Verify that the trade dict always contains one of these keys.

**F-03 — `consolidated_legs` deduplication in `_trade_plain_english` uses `(option_type, action, strike)` as the key**
For a call butterfly (buy 1 ATM call, sell 2 ATM calls, buy 1 OTM call), the two short calls share the same `(call, sell, strike)` key and are correctly consolidated into one entry with `_qty = 2`. However, if a broken-wing butterfly has two short calls at DIFFERENT strikes, they would NOT be consolidated (correct). A tester should verify that a standard butterfly shows "2×" in the Leg 2 label, not two separate identical leg entries.

**F-04 — `_days_to_expiry` returns 0 on parse failure**
If the trade dict has a malformed `expiry` string, `_days_to_expiry` returns 0 silently. This causes DTE = 0, which triggers the "expires TODAY" branch in the MARK YOUR CALENDAR step even for normal trades. Check the Network tab to confirm `expiry` is always a valid ISO date string.

**F-05 — `_why_this_strategy` conditions match note uses `bias` from `bias_analysis`, not from `strategy["designed_for_direction"]`**
The `_DIR_MAP` lookup maps the designed direction to a set of acceptable bias values. If `bias` is a value not in `_DIR_MAP` (e.g. an unexpected string like `"STRONG_BULLISH"` from a future engine change), `dir_match` will be False even if the strategy is appropriate. The mismatch warning would fire incorrectly. Not a current bug but a fragility worth noting.

---

## Section 7 — Severity Summary

| ID | Description | Severity if Broken |
|----|-------------|-------------------|
| HT-01/EC-01/EC-02 | Negative/zero DTE calendar reminder | CRITICAL — user given incorrect trading instruction |
| HT-03/RV-03 | Wrong options approval level | CRITICAL — user told wrong regulatory requirement |
| HT-05 | Bearish debit says "upside" | MAJOR — factually wrong directional label on trade instruction |
| HT-04 (B3) | "Wins more often" for low-POP strategy | MAJOR — inverted expectation statement |
| HT-08 | GTC target wrong percentage | MAJOR — wrong dollar exit instruction |
| RV-01/HT-02 | Literal `**` in narrative | MAJOR — affects every user on every page view |
| RV-02/HT-06 | Entire preamble bolded in checklist | MAJOR — visual hierarchy broken, affects readability |
| HT-04 (C5) | Backtesting implication in POP note | MINOR — misleading but not actionable wrong number |
| HT-07 | Earnings note missing from trade panel | MINOR — missing information, not incorrect information |
| RV-04 | IV environment category absent | MINOR — missing classification label |
| RV-05 | Conditions match note absent | MINOR — missing completeness item |
| EC-03 | Empty "Why these conditions:" paragraph | COSMETIC |
| EC-06 | Silent HV omission with no notice | MINOR (v2 scope baseline) |
| RC-01–05 | Regression checks (format changes) | MAJOR if any regression present |


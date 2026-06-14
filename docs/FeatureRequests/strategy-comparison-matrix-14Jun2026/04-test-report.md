# Test Report — PRD-01: Remove Fit Scoring — Replace with Strategy Comparison Matrix

**Feature:** strategy-comparison-matrix-14Jun2026
**Date:** 14Jun2026
**Status:** In Progress

---

## Automated Test Results

_To be completed by the QA engineer (qa-engineer agent)._

---

## Manual Test Plan

**Prepared by:** Tester (manual / exploratory)
**Date:** 14Jun2026
**Source documents:** 01-spec.md, 02-design.md
**Components inspected:** `frontend/src/components/StrategyDetail.tsx`, `frontend/src/components/StrategyScanner.tsx`, `frontend/src/api/client.ts`

### Pre-test observations from code inspection

Before test execution, the following was noted by reading the implementation:

1. `StrategyDetail.tsx` imports and renders `ComparisonMatrix` (line 814). The `ai_recommendation` prop and `showAiComparison` block are absent. The `fit_score` field is absent from `StrategyRecommendation` in `client.ts`. `AIRecommendation` interface is absent from `client.ts`. These are all consistent with the spec.

2. `StrategyScanner.tsx` table headers (line 399) are: `['Symbol', 'Price', 'IVR', 'IV Env', 'Bias', 'Strategies Available', 'Condition Matches', '']`. This introduces a "Condition Matches" column that is NOT mentioned in the scanner spec (AC-2.2 lists: Symbol, Price, IVR, IV Environment badge, Bias, Strategies Available, Analyze button — no Condition Matches column). The `ScanResult` interface in `client.ts` includes `condition_matches: number`. This column is present in the implementation but absent from the spec acceptance criteria. This is flagged as an observation for the tester to verify: it is likely intentional and beneficial, but it is an undocumented addition relative to the spec. Severity: **minor** (additive, not harmful, but untested against spec).

3. The `ConditionIndicator` component (line 471–484) uses `match === 'any'` to render `~` in amber. However, the `MatrixRow` interface defines `iv_condition_match` and `direction_condition_match` as `boolean` only — there is no `'any'` value possible at runtime from the current TypeScript types. The `~` path can never be reached with the current type definition. Severity: **minor** (dead code path — the amber tilde indicator is unreachable unless the API returns a value outside the TypeScript type).

4. The sort handler `handleSort` uses a nested `setSortKey` callback that calls `setSortDir` inside it (lines 523–532). This is a React state batching pattern that could behave unexpectedly in some React versions: `setSortDir` is called inside a `setSortKey` updater function. The sort direction toggle depends on the closure capturing the current `sortKey` correctly. This is a candidate for exploratory testing with rapid column header clicks.

5. The matrix table `colSpan` in the empty state is set to `12` (line 658), but the table has 12 visible columns (Strategy, Type, Direction, Risk, Max Profit, Max Loss, Breakevens, Delta, Theta, Vega, PoP, Condition Fit). That is correct.

6. The `fmtCurrency` function (line 501–505) renders `null` max_profit as `'Unlimited'` and `null` max_loss as `'Undefined'` — consistent with spec FR-16. The currency format uses `Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })` prefixed with `$`. This will render whole-dollar values (e.g. `$420`), not decimals. Verify this against real data where max_profit might be a fractional value (e.g. `$1.42` per share × 100 = `$142`).

7. The `iv_fit_label` is rendered in the Strategy Name cell as a muted sub-label (line 684), not in a dedicated "IV Fit Label" column. The design document (section 8.2) lists "IV Fit Label" as column 8. The implementation merges it under the Strategy Name. This is a layout deviation from the design document. Severity: **minor** (functionally present, layout differs from spec column list).

---

### Test environment requirements

- Browser: Chrome (primary), Firefox (secondary)
- Viewport: 1280×800 (desktop), 375×812 (mobile simulation)
- Auth states needed: unauthenticated, authenticated non-admin, authenticated admin
- Network tools: Chrome DevTools Network tab, optional: browser JSON viewer extension
- Test tickers: AAPL (standard), a ticker with known high IV during earnings (e.g. a stock with upcoming earnings), SPY (typically low–medium IV)
- React DevTools: installed (for component prop inspection)

---

### Section 1 — Regulatory language audit

**Priority: HIGHEST — these tests block Gate 5 approval.**

---

**MT-01**
ID: MT-01
Scenario: Network response for analyze endpoint contains no prohibited fields
Precondition: Authenticated non-admin user. AAPL is a valid symbol.
Steps:
1. Open Chrome DevTools, go to the Network tab, enable "Preserve log".
2. Navigate to the Scanner tab.
3. Enter AAPL in the watchlist, click "Analyze" (or add AAPL and click "Scan Watchlist" then "Analyze").
4. In the Network tab, locate the request to `/api/strategies/analyze/AAPL` (or the full URL ending in `/strategies/analyze/AAPL`).
5. Click the request, open the Response tab.
6. Use Ctrl+F (or Cmd+F) inside the response to search for the string `ai_recommendation`.
7. Repeat search for `fit_score`.
8. Repeat search for `top_strategy`.
9. Repeat search for `recommended_key`.
10. Repeat search for `recommended_name`.
Expected result: All five searches return zero matches. The field `comparison_matrix` is present. The field `recommendations_by_category` is present. No `fit_score` property appears inside any object in `recommendations_by_category`.
Severity if fails: Critical

---

**MT-02**
ID: MT-02
Scenario: Network response for scan endpoint contains no prohibited fields
Precondition: Authenticated user with at least one symbol in watchlist.
Steps:
1. Open Chrome DevTools, Network tab, preserve log.
2. Navigate to Scanner tab, click "Scan Watchlist".
3. Locate the request to `/api/strategies/scan`.
4. Open Response tab, search for `top_strategy`.
5. Search for `scan_narrative`.
6. Search for `fit_score`.
7. Search for `headline` (the key used inside `scan_narrative`).
8. Confirm `strategy_count` is present as an integer field in each result object.
9. Confirm `condition_matches` is present as an integer field in each result object (note: this field exists in the implementation but is not in the spec — document its presence).
Expected result: Searches for `top_strategy`, `scan_narrative`, `fit_score`, `headline` return zero matches. `strategy_count` and `condition_matches` are present.
Severity if fails: Critical

---

**MT-03**
ID: MT-03
Scenario: Rendered UI contains no prohibited directive or ranking language
Precondition: Authenticated user, AAPL analyzed and matrix visible.
Steps:
1. With the Strategy Comparison Matrix visible for AAPL, right-click anywhere on the page → "View Page Source" (or use Ctrl+U).
2. Use Ctrl+F to search the full page source for each of the following strings (case-insensitive):
   a. `AI Pick`
   b. `Recommended`
   c. `Best Fit`
   d. `You should`
   e. `Top Strategy`
   f. `fit score`
   g. `best-fit`
   h. `top pick`
   i. `AI recommends`
   j. `ideal for`
3. For each match found: note the line, the surrounding context, and whether it appears in visible rendered text or in a hidden attribute (e.g. a CSS class name, a data attribute, or a comment).
Expected result: Zero matches for all ten strings in the rendered output. Note: the word "Recommended" may appear inside the disclaimer text "It does not constitute investment advice or a recommendation to trade any specific strategy" — this is acceptable as it is a negation. Document any match found and classify as either acceptable-in-context or a finding.
Severity if fails: Critical

---

**MT-04**
ID: MT-04
Scenario: Condition Fit column header uses no ranking language
Precondition: Authenticated user, matrix visible.
Steps:
1. Locate the matrix table header row.
2. Read the last column header text exactly.
3. Check for the tooltip text (hover over the "Condition Fit" header if a tooltip is present).
Expected result: Column header reads exactly "Condition Fit". Tooltip (if present) reads "Factual comparison of current market data against each strategy's textbook design criteria. Not a recommendation." Neither the header text nor tooltip contains "Recommended", "Score", "AI Fit", "Best", or "Top".
Severity if fails: Critical

---

**MT-05**
ID: MT-05
Scenario: condition_explanation text contains no directive language
Precondition: Authenticated user, matrix visible with at least 5 rows.
Steps:
1. Click the Condition Fit cell of the first row to expand it.
2. Read the explanation text carefully.
3. Repeat for at least 4 more rows, selecting a variety of strategies (a credit strategy, a debit strategy, a DEFINED risk strategy, an UNDEFINED risk strategy).
4. For each explanation text, check whether it contains any of: "you should", "we recommend", "AI suggests", "best choice", "ideal", "recommended", "top pick".
5. Confirm each explanation is phrased as a factual educational sentence (e.g. "Iron Condors are designed for HIGH IV environments where elevated premium...").
Expected result: Zero directive phrases found. All explanations read as textbook factual statements. Phrasing does not vary by ticker (same strategy should have identical explanation text across two different tickers — see MT-06).
Severity if fails: Critical

---

**MT-06**
ID: MT-06
Scenario: condition_explanation text is identical for the same strategy across two different tickers with the same IV environment
Precondition: Two tickers both classified as HIGH IV (e.g. TSLA and NVDA during high IV periods), authenticated user.
Steps:
1. Analyze TSLA. Expand the Condition Fit cell for "Iron Condor" (or any strategy present in both results). Copy the explanation text.
2. Navigate back. Analyze a second HIGH IV ticker. Expand the same strategy's Condition Fit cell.
3. Compare the two explanation texts character-by-character (paste both into a plain-text editor).
Expected result: The two texts are identical. This confirms the explanation is a static catalog string, not dynamically AI-generated per ticker.
Severity if fails: Major (regulatory implication: dynamic AI-generated text per ticker reintroduces the personalised advice concern)

---

### Section 2 — Condition Fit indicator visual check

**MT-07**
ID: MT-07
Scenario: Condition indicators render correct symbol and colour
Precondition: Authenticated user, matrix visible. Need at least one row with iv_condition_match=true, one with iv_condition_match=false.
Steps:
1. Identify a row where IV condition matches (iv_condition_match should be true — visually look for the IV indicator).
2. Confirm the IV indicator shows a check mark (✓) rendered in green.
3. Identify a row where IV condition does not match.
4. Confirm the IV indicator shows a cross (✗) rendered in red (the spec describes it as "muted red").
5. Repeat steps 2-4 for the direction condition indicator (Dir label).
6. Inspect the actual colour values using Chrome DevTools → Inspect element → Computed styles to confirm green is approximately #22c55e and red is approximately #ef4444.
Expected result: ✓ renders green, ✗ renders red. No amber ~ is visible (the tilde path is unreachable with boolean types — if a ~ appears, that is a finding indicating the API is returning a non-boolean value for condition match fields).
Severity if fails: Major

---

**MT-08**
ID: MT-08
Scenario: Clicking a Condition Fit cell expands an explanation row below
Precondition: Authenticated user, matrix visible.
Steps:
1. Locate any row in the matrix.
2. Click anywhere within the Condition Fit cell (the last column — contains the IV and Dir indicators and a small ▼ chevron).
3. Observe whether a new row appears below, spanning all 12 columns.
4. Read the text in the expanded row.
5. Click the Condition Fit cell again.
6. Observe whether the expanded row collapses.
7. Click a different row's Condition Fit cell.
8. Confirm only one row is expanded at a time (expanding a new row should collapse the previously expanded one).
Expected result: Single click expands an explanation row displaying the condition_explanation text. Second click collapses it. Only one row is expanded at a time. The explanation text is the same text inspected in MT-05.
Severity if fails: Major

---

**MT-09**
ID: MT-09
Scenario: Explanation text is phrased as textbook fact, not directive
Precondition: As MT-05.
Steps: (Same as MT-05 steps 1–4, but focus on whether the expand/collapse affordance itself uses directive language.)
1. Check the ▼ / ▲ chevron labels or aria-labels for any directive text.
2. Check whether the expanded row contains a "Recommended" badge, star, or any visual accent implying a ranking.
Expected result: The expanded row contains only the explanation text and no badge, star, border highlight, or ranking accent.
Severity if fails: Major

---

### Section 3 — Comparison matrix data integrity

**MT-10**
ID: MT-10
Scenario: High-IV ticker shows IV-appropriate strategies with ✓ indicators
Precondition: Authenticated user. Use a ticker with IVR > 50 (shown as HIGH in the header card). TSLA or a ticker near earnings typically qualifies.
Steps:
1. Analyze a HIGH IV ticker.
2. Confirm the header card shows "HIGH" in the IV environment badge.
3. In the matrix, find a strategy known to be designed for HIGH IV (e.g. Iron Condor, Short Strangle, Covered Call, Cash-Secured Put).
4. Check the IV indicator in the Condition Fit column for that row.
5. Find a strategy known to be designed for LOW IV (e.g. Long Call, Long Put, Long Straddle).
6. Check the IV indicator for that row.
Expected result: Step 4 shows ✓ (match). Step 6 shows ✗ (no match). The iv_fit_label text below the strategy name also reflects the correct environment (e.g. "Performs well in HIGH IV" for Iron Condor).
Severity if fails: Critical (data integrity — the matrix is presenting incorrect factual information)

---

**MT-11**
ID: MT-11
Scenario: Low-IV ticker shows inverse indicators
Precondition: Authenticated user. Use a ticker with IVR < 30 (shown as LOW). SPY often qualifies in low-volatility regimes.
Steps:
1. Analyze a LOW IV ticker.
2. Confirm the header card shows "LOW" in the IV environment badge.
3. Find Iron Condor in the matrix (a HIGH IV strategy).
4. Check its IV Condition indicator.
5. Find Long Call or Long Straddle (LOW IV strategies).
6. Check their IV Condition indicator.
Expected result: Step 4 shows ✗. Step 6 shows ✓.
Severity if fails: Critical

---

**MT-12**
ID: MT-12
Scenario: Null max_profit displays "Unlimited", null max_loss displays "Undefined"
Precondition: Authenticated user, matrix visible with at least one UNDEFINED risk strategy (e.g. Covered Call, Short Strangle, Naked Put).
Steps:
1. Find a row where risk_type is "UNDEFINED" (look for the UNDEFINED badge in the Risk column).
2. Inspect the Max Loss cell for that row.
3. Confirm it displays the text "Undefined" (not "null", "—", "unlimited", "∞", or a number).
4. Find a row where max_profit should be null (e.g. Covered Call, which has theoretically unlimited profit). Check the Max Profit cell.
5. Confirm it displays "Unlimited" (not "null", "—", or a number).
6. For any row where max_profit is a numeric value, confirm it is formatted as $NNN (dollar sign, no decimals per the fmtCurrency function) — e.g. "$142" not "142" or "$1.42".
Expected result: Null max_loss → "Undefined" in yellow/amber colour. Null max_profit → "Unlimited" in green. Numeric values → dollar-formatted with $ prefix.
Severity if fails: Critical (spec FR-16 is a regulatory requirement — "Undefined" is the legally correct label for undefined-risk strategies)

---

**MT-13**
ID: MT-13
Scenario: Breakeven null cases display "—"
Precondition: Authenticated user, matrix visible.
Steps:
1. Find a row where only a single breakeven applies (e.g. a long call has one breakeven).
2. Inspect the Breakevens cell.
3. Find a row where no breakeven is computed (both null).
4. Inspect the Breakevens cell.
Expected result: Single breakeven → "$NNN.NN". Both null → "—". Two breakeivens → "$NNN.NN – $NNN.NN".
Severity if fails: Minor

---

**MT-14**
ID: MT-14
Scenario: Greek values display "—" when null
Precondition: Authenticated user, matrix visible. Requires a ticker where some strategies fail to build (build_trade error). This may require using a ticker with limited options data.
Steps:
1. Analyze a ticker that may have sparse options data (e.g. a thinly traded small-cap, or a symbol near expiry).
2. If any row shows a build error state, inspect the Delta, Theta, and Vega cells for that row.
3. Confirm null greeks display "—" and not "0.00" or "NaN".
Expected result: Null greeks → "—". Non-null greeks → formatted to 2 decimal places (e.g. "0.32", "-0.05").
Severity if fails: Minor (data accuracy concern — "0.00" could be mistaken for a real greek value)

---

**MT-15**
ID: MT-15
Scenario: iv_fit_label uses factual language, not directive
Precondition: Authenticated user, matrix visible.
Steps:
1. Hover over (or look below) the strategy name in several rows. The iv_fit_label appears as a muted sub-label below the strategy name in the Strategy cell (not in a separate column — see pre-test observation 7).
2. Read the label text for at least 5 strategies.
3. Confirm the format is "Performs well in HIGH IV" or "Performs well in LOW IV" etc.
4. Check whether the label uses any of: "Recommended for", "Best in", "Ideal for", "Perfect for".
Expected result: All iv_fit_label texts use "Performs well in [ENV] IV" format. No directive synonyms are present.
Severity if fails: Critical

---

**MT-16**
ID: MT-16
Scenario: MatrixRow API fields all present and correctly typed
Precondition: Authenticated user, Chrome DevTools Network tab.
Steps:
1. Capture the `/api/strategies/analyze/AAPL` response.
2. Select one MatrixRow object from the `comparison_matrix` array.
3. Verify the following fields are present: key, name, direction, credit_or_debit, risk_type, complexity, iv_environment_fit, iv_fit_label, dte_target, max_profit, max_loss, breakeven_low, breakeven_high, net_delta, net_theta, net_vega, pop_range, designed_for_iv, designed_for_direction, iv_condition_match, direction_condition_match, condition_explanation, _synthetic.
4. Confirm credit_or_debit is "credit" or "debit" (not "Credit" or "CREDIT").
5. Confirm risk_type is "DEFINED" or "UNDEFINED" (uppercase).
6. Confirm designed_for_iv is "high", "low", or "any" (lowercase).
7. Confirm designed_for_direction is one of "bullish", "bearish", "neutral", "volatile", "any" (lowercase).
8. Confirm iv_condition_match and direction_condition_match are JSON booleans (true/false), not strings or numbers.
Expected result: All 23 fields present on at least one MatrixRow. Value formats match the spec data model.
Severity if fails: Major

---

### Section 4 — Sort behaviour

**MT-17**
ID: MT-17
Scenario: Clicking a sortable column header reorders rows
Precondition: Authenticated user, matrix visible with at least 4 rows.
Steps:
1. Note the current order of strategy names in the matrix (first 4 rows).
2. Click the "Strategy" column header (first column).
3. Observe whether the rows reorder alphabetically (ascending).
4. Click "Strategy" again.
5. Observe whether rows reorder in descending alphabetical order.
6. Check the Network tab — confirm no new network request was fired when clicking sort.
7. Repeat steps 2–6 for the "Max Profit" column.
8. Repeat for "Max Loss" column.
9. Repeat for "Condition Fit" column (last sortable column).
Expected result: Each column sort click reorders rows client-side. A ▲ indicator appears on the active sort column. Second click reverses to ▼. No API request is made on sort. After sorting, the row count shown in the filter counter (e.g. "19 of 19 strategies") does not change.
Severity if fails: Major

---

**MT-18**
ID: MT-18
Scenario: Condition Fit sort orders by number of matching conditions
Precondition: Authenticated user, matrix visible with mixed condition match rows.
Steps:
1. Click "Condition Fit" column header.
2. Observe whether rows where both IV and direction match (2 matches) sort above rows with 1 or 0 matches (ascending = fewest matches first, descending = most matches first — verify which direction is "asc").
3. Click again to reverse.
4. Confirm no "Top Pick" badge or visual accent appears on the top row after sorting by condition fit.
Expected result: Sort by Condition Fit orders rows by (iv_condition_match + direction_condition_match) sum. Rows with 0, 1, or 2 matches order correctly. No accent border, star, or "Top" label appears on any row regardless of sort position.
Severity if fails: Major (the sort must not introduce an implied ranking — if the top row after sorting gains a visual accent, that would be a regulatory finding)

---

**MT-19**
ID: MT-19
Scenario: Rapid double-click on sort header does not cause visual corruption
Precondition: Authenticated user, matrix visible.
Steps:
1. Double-click the "Strategy" column header in quick succession (under 200ms between clicks — use a mobile device double-tap gesture or rapidly double-click on desktop).
2. Observe the sort indicator (▲/▼) and row order.
3. Repeat for "Max Loss".
Expected result: The sort indicator shows a consistent state (either ▲ or ▼) — it does not oscillate or disappear. Row order is consistent with the displayed indicator. No JavaScript error appears in the DevTools Console.
Severity if fails: Minor

---

**MT-20**
ID: MT-20
Scenario: Default load order is complexity ascending, not condition-fit order
Precondition: Authenticated user, matrix freshly loaded (no sort applied).
Steps:
1. Load the matrix for AAPL (no sort clicks applied).
2. Note the complexity dots (1, 2, or 3 dots) for the first 5 rows.
3. Confirm complexity generally increases from top to bottom (within each category group if categories are preserved, or overall if the matrix is flat).
4. Confirm that rows with both conditions matching are NOT automatically floated to the top — the presence or absence of condition matches should not determine initial order.
Expected result: Default order is complexity ascending. Rows are not pre-filtered or pre-sorted by condition fit on initial load (per AC-6.4 and AC-6.5).
Severity if fails: Major

---

### Section 5 — Scanner columns

**MT-21**
ID: MT-21
Scenario: Strategy scanner results table has no "Top Strategy" column and no strategy names in rows
Precondition: Authenticated user with at least 3 symbols in watchlist.
Steps:
1. Navigate to Scanner tab.
2. Click "Scan Watchlist".
3. When results appear, read every column header in the results table.
4. Confirm "Top Strategy" is absent.
5. Confirm "PoP" is absent (as a standalone column — it was previously linked to the top_strategy).
6. Confirm "Risk" is absent (previously linked to top_strategy).
7. Look at every cell in the results table rows.
8. Search for any options strategy name (e.g. "Iron Condor", "Short Strangle", "Covered Call", "Long Call", "Bull Put Spread") in any data cell.
Expected result: Columns are: Symbol, Price, IVR, IV Env, Bias, Strategies Available, Condition Matches, (Analyze button). No "Top Strategy", "PoP", or "Risk" column. No strategy name appears in any data cell.
Severity if fails: Critical

---

**MT-22**
ID: MT-22
Scenario: "Strategies Available" column shows a count string
Precondition: Authenticated user, scan results visible.
Steps:
1. Read the "Strategies Available" cell for each result row.
2. Confirm the format is "N strategies" where N is a positive integer (e.g. "19 strategies").
3. Confirm N is greater than 0 for any row that did not error.
4. Confirm no strategy name follows the count.
Expected result: Each cell displays "{N} strategies" text. No strategy name appears.
Severity if fails: Critical

---

**MT-23**
ID: MT-23
Scenario: "Condition Matches" column shows count in green when > 0
Precondition: Authenticated user, scan results visible. Requires at least one result row where condition_matches > 0.
Steps:
1. Find a row where the Condition Matches cell shows a number greater than 0.
2. Confirm the text colour is green (approximately #22c55e).
3. Find a row where condition_matches is 0 (if available).
4. Confirm the text colour is muted (approximately #64748b).
5. Confirm the pluralisation: "1 match" vs "2 matches".
Expected result: condition_matches > 0 → green text, e.g. "3 matches". condition_matches === 0 → muted text, e.g. "0 matches". condition_matches === 1 → "1 match" (singular).
Severity if fails: Minor (pluralisation) / Major (colour missing)

---

**MT-24**
ID: MT-24
Scenario: "Analyze" button in scan results navigates to full matrix for the selected symbol
Precondition: Authenticated user, scan results visible.
Steps:
1. Click the "Analyze" button for the first result row (e.g. AAPL).
2. Observe whether the scan results table is replaced by the StrategyDetail / ComparisonMatrix view.
3. Confirm the symbol displayed in the matrix header matches the row that was clicked.
4. Click the "← Back to scan" button.
5. Confirm the scan results table is visible again (results are preserved — no re-scan needed).
Expected result: Clicking Analyze shows the matrix for the correct symbol. Back button returns to results without re-scanning.
Severity if fails: Major

---

### Section 6 — Mobile / responsive check

**MT-25**
ID: MT-25
Scenario: Matrix table scrolls horizontally at 375px viewport width
Precondition: Authenticated user. Chrome DevTools → Toggle Device Toolbar → set width to 375px (iPhone SE profile or custom).
Steps:
1. Set viewport to 375px width.
2. Navigate to Scanner, analyze AAPL.
3. Wait for the matrix to render.
4. Attempt to scroll the matrix table horizontally by swiping/dragging.
5. Confirm all 12 columns are accessible via horizontal scroll.
6. Confirm the disclaimer bar above the table is visible without scrolling (it should be full-width, not clipped).
7. Confirm the filter controls (checkbox, dropdowns) are reachable — check if they wrap or overflow.
Expected result: Matrix table is wrapped in an `overflow-x: auto` container. All columns reachable via horizontal scroll. Disclaimer and filter controls visible and usable without horizontal scrolling. No content is clipped by the right edge of the viewport without a scroll affordance.
Severity if fails: Major

---

**MT-26**
ID: MT-26
Scenario: Condition indicators are readable at 375px
Precondition: 375px viewport, matrix visible.
Steps:
1. Scroll horizontally in the matrix to bring the Condition Fit column into view.
2. Confirm the ✓ / ✗ indicators are visible and the label text "IV" and "Dir" are legible.
3. Confirm the touch target for the Condition Fit cell is large enough to tap without accidentally hitting adjacent cells (minimum 44×44px per Apple HIG).
4. Tap a Condition Fit cell.
5. Confirm the expansion row appears below and the condition_explanation text is readable at 375px width (no text overflow or clipping).
Expected result: Indicators visible. Tap target adequate. Expansion text wraps correctly at narrow width.
Severity if fails: Major

---

**MT-27**
ID: MT-27
Scenario: Scanner results table is usable at 375px
Precondition: 375px viewport, scan results visible.
Steps:
1. Perform a scan.
2. Confirm the results table scrolls horizontally.
3. Confirm the "Analyze" button is reachable via horizontal scroll.
4. Tap "Analyze" for a symbol.
5. Confirm the matrix view loads correctly.
6. Tap "← Back to scan".
7. Confirm scroll position is not lost on return.
Expected result: Scanner table scrollable. Analyze button tappable. Matrix loads. Back navigation works.
Severity if fails: Major

---

### Section 7 — Edge cases

**MT-28**
ID: MT-28
Scenario: Ticker with no options data returns graceful error, no crash
Precondition: Authenticated user. Use a symbol known to have no options chain (e.g. a very thinly traded OTC symbol, or simply type a symbol that does not exist such as "XYZINVALID").
Steps:
1. Navigate to Scanner, enter "XYZINVALID" as the only symbol.
2. Click "Analyze" (or scan and then analyze).
3. Observe the UI response.
4. Confirm no JavaScript exception appears in DevTools Console.
5. Confirm the StrategyDetail component renders an error state (red error card), not a blank screen.
6. Confirm no partial matrix renders with empty rows.
Expected result: A red error message is shown (e.g. "Analysis failed" or the specific API error). No crash. No blank white screen. No partial/broken matrix table.
Severity if fails: Critical

---

**MT-29**
ID: MT-29
Scenario: Synthetic chain fallback displays disclaimer banner
Precondition: Authenticated user. This test requires that the live options chain is unavailable (either the backend is configured without MARKETDATA_API_TOKEN and yfinance fails, or a symbol with no real chain is used). If a synthetic fallback cannot be forced in the test environment, this test is deferred to a staging environment test.
Steps:
1. If possible, analyze a symbol whose options chain is known to fall through to the synthetic Black-Scholes path (check that `_synthetic: true` appears on MatrixRow objects in the API response).
2. Confirm the yellow banner "Trade data is synthetic — live options chain unavailable." appears above the disclaimer bar.
3. Confirm the matrix still renders with rows present.
4. Confirm the disclaimer bar is also present below the synthetic banner.
Expected result: Both banners visible. Matrix renders. No crash.
Severity if fails: Major

---

**MT-30**
ID: MT-30
Scenario: All strategies filtered out by filter controls — empty state renders
Precondition: Authenticated user, matrix visible.
Steps:
1. Enable "Both conditions match" checkbox.
2. Also set Direction filter to a direction with no strategies (e.g. if all BULLISH strategies have already been hidden by "Both conditions match").
3. Combine filters until zero rows are visible.
4. Confirm the empty state message "No strategies match the current filters." appears spanning the full table width.
5. Confirm no JavaScript error in console.
6. Uncheck the filters.
7. Confirm rows reappear.
Expected result: Empty state message visible at zero rows. No crash. Unchecking filters restores rows.
Severity if fails: Major

---

**MT-31**
ID: MT-31
Scenario: Empty watchlist — scan button is disabled
Precondition: Authenticated user.
Steps:
1. Remove all symbols from the watchlist.
2. Observe the "Scan Watchlist" button state.
3. Confirm the button is disabled (grey, non-clickable).
4. Confirm no scan fires.
Expected result: Scan button disabled when watchlist is empty. No API call made.
Severity if fails: Minor

---

**MT-32**
ID: MT-32
Scenario: Rapid double-click on "Scan Watchlist" button does not fire duplicate requests
Precondition: Authenticated user with symbols in watchlist. Slow the network in DevTools (Throttling → Slow 3G) to make the scan slow enough to test.
Steps:
1. Set Chrome DevTools network throttling to "Slow 3G".
2. Click "Scan Watchlist".
3. Immediately click "Scan Watchlist" again (within 200ms — double-tap simulation).
4. Observe the Network tab.
5. Count the number of requests to `/api/strategies/scan`.
Expected result: Only one scan request fires. The button should be disabled (grey, "Scanning N symbols...") immediately after the first click, preventing a second click from firing. If two requests are observed, this is a finding.
Severity if fails: Major (duplicate scan requests consume monthly scan quota — a user on a limited tier would lose two scans for one intended scan)

---

**MT-33**
ID: MT-33
Scenario: Cross-tab behaviour — leaving and returning to scanner tab preserves state
Precondition: Authenticated user, scan results visible.
Steps:
1. Perform a scan. Results are visible.
2. Click on a different app tab (e.g. Positions tab).
3. Click back to the Scanner tab.
4. Observe whether the scan results are still visible or have been cleared.
Expected result: Scan results are preserved when switching tabs and returning. No re-scan is triggered automatically. The previously selected symbol (if any) is cleared or preserved — note the actual behaviour for the report.
Severity if fails: Minor (UX regression — unexpected state reset could frustrate users who switch tabs mid-workflow)

---

**MT-34**
ID: MT-34
Scenario: Auth wall — unauthenticated access to analyze endpoint returns 401 or 403
Precondition: No active session (logged out, or use an incognito window).
Steps:
1. Open an incognito browser window.
2. Navigate to the app URL.
3. Confirm the login page is shown (redirect to login, not the scanner).
4. In the DevTools Network tab, attempt a direct fetch of the analyze endpoint: open the browser console and run:
   `fetch('/api/strategies/analyze/AAPL').then(r => console.log(r.status))`
   (or use the full backend URL if the frontend is not proxied).
5. Confirm the response status is 401 or 403.
Expected result: Frontend redirects to login. Direct API call returns 401 or 403.
Severity if fails: Critical

---

### Section 8 — Observations that automated Playwright tests cannot fully cover

The following scenarios cannot be reliably covered by the existing Playwright suite and require manual or exploratory testing in a live environment:

1. **MT-06 (cross-ticker condition_explanation identity):** Requires two live API calls with different tickers and manual text comparison. Playwright can intercept and compare responses, but this requires a real backend with real IV data to produce meaningful condition match values. With mocked data, both tickers will always return the same mocked rows.

2. **MT-10 and MT-11 (IV environment accuracy):** Requires a ticker that is genuinely in HIGH or LOW IV at the time of the test. Mocked data can force this, but verifying that the backend correctly classifies a real ticker and that the matrix correctly reflects it requires a live test.

3. **MT-19 (rapid double-click sort):** Playwright clicks have a default settling time. Testing the React state batching race in `handleSort` at <200ms intervals requires a human double-tap or a very precise Playwright timing manipulation. The tester should perform this manually on the live UI.

4. **MT-32 (rapid double-click scan):** Same timing concern — a human rapid double-tap on mobile is more representative than automated clicks. Playwright can simulate this but the 200ms window is the boundary case.

5. **MT-29 (synthetic chain fallback banner):** Requires the live backend to be in a state where the options chain falls through to the synthetic path. This cannot be simulated with the standard Playwright mock data without modifying the mock.

6. **MT-06 / visual colour inspection (MT-07):** Verifying computed CSS colour values (#22c55e green, #ef4444 red) against design tokens requires visual inspection in DevTools. Playwright colour assertions are possible but brittle across rendering engines.

7. **MT-33 (cross-tab state preservation):** Tab switching behaviour in a SPA depends on React component lifecycle. Playwright can simulate tab navigation but whether the component unmounts/remounts depends on the routing implementation, which needs to be verified manually against the live app.

---

### Section 9 — Fragile areas and existing behaviours to monitor near changed code

1. **`StrategyNarrative` in the expanded trade card (TradeCard component, line 307 and 374):** The `StrategyNarrative` accordion is still rendered inside the expanded trade card. The spec (PRD-05 open question, OQ-3) notes that `_why_this_strategy()` in `interpreter.py` contains the phrase "ranks as the best-fit strategy" in a fallback branch. A tester with narrative access (narrative requires entitlement) should expand a strategy card and read the full narrative text to verify this phrase does or does not appear. This is flagged as a PRD-05 item but is worth noting in manual testing.

2. **`StrategyScanner.tsx` "Condition Matches" column — undocumented against spec:** The `condition_matches` field in `ScanResult` and the corresponding scanner column exist in the implementation but are not listed in AC-2.2 of the spec. The tester should confirm this column renders correctly and its count is meaningful (matching the number of rows in the matrix with both conditions true for that ticker). If the count appears incorrect, this should be flagged.

3. **`ConditionIndicator` with `'any'` match type — dead code path:** If a tester observes an amber `~` symbol in the Condition Fit column during manual testing, this means the API returned a non-boolean value for `iv_condition_match` or `direction_condition_match`. This would indicate a type mismatch between the backend and the TypeScript interface. The tester should note any `~` symbol as a finding.

4. **Sort direction toggle race condition in `handleSort`:** The `setSortKey` updater function calls `setSortDir` inside it (lines 523–530). In React 18+ with automatic batching, both state updates will be batched correctly. However, if the application runs on React 17 or has `unstable_batchedUpdates` wrapping, the first click on a new column (which should set direction to 'asc') might not behave as expected if the previous direction was 'desc'. The tester should click through at least 3 different column headers in sequence to verify direction always resets to ▲ on a new column.

5. **`fmtCurrency` integer rounding for max_profit/max_loss:** The function uses `minimumFractionDigits: 0, maximumFractionDigits: 0` — it rounds to the nearest whole dollar. If the backend returns `max_profit: 1.42` (per the design doc example), this will display as "$1" not "$142" or "$1.42". The tester should cross-check the rendered value against the raw API response to confirm whether the values are already in dollar terms (×100) or per-share terms. If "$1" appears when "$142" is expected, this is a data formatting bug. Severity: **major** if the backend returns per-share values and the frontend does not multiply by 100.

---

_Manual test plan prepared by tester agent — 14Jun2026. Test execution requires a live environment with active Supabase auth and backend connection._

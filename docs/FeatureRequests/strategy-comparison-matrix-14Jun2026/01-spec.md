# Feature Spec — PRD-01: Remove Fit Scoring — Replace with Strategy Comparison Matrix

**Date:** 14Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

The current `strategy_engine.py` computes a numeric `fit_score` for each of the 31 catalogued strategies and returns a ranked list topped by a single "best fit" strategy for a given ticker. The `/api/strategies/scan` endpoint surfaces a `top_strategy` field derived from this ranking, and the `StrategyDetail` component renders an "AI Pick" banner that names a recommended strategy by name. Under both the MAS two-stage test (Singapore) and the SEC robo-adviser definition (United States), this output constitutes a personalised, actionable investment recommendation — a regulated activity that requires a Capital Markets Services licence (MAS) or SEC registration as an investment adviser.

PRD-01 removes all fit-scoring and ranking logic from the backend and replaces the ranked output with a **Strategy Comparison Matrix**: a neutral, side-by-side mathematical display of every applicable strategy for the current IV environment, with no ranking, no "recommended" or "AI Pick" label, and no directive language. The user reads the factual data and makes their own decision. This change removes the single biggest regulatory trigger in the application while preserving all educational and analytical value.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Retail paper trader | free / starter | Understand which strategies are mathematically applicable to the current IV environment and make their own choice without being told what to trade |
| Active paper trader | pro | Compare greek profiles across strategies for a ticker before deciding which paper trade to place |
| Power user / educator | enterprise | Use the matrix as a teaching reference to explain how different strategies behave under different IV regimes |
| Platform admin | admin (any tier) | Verify that no ranking or directive language appears anywhere in the UI after the change; ensure the scan list no longer surfaces a top pick per symbol |
| Unauthenticated visitor | none | Cannot access the strategy scanner or matrix — auth wall is not changed by this PRD |

---

## 3. Functional Requirements

1. The `recommend_strategies()` function in `backend/services/strategy_engine.py` shall be removed or converted to return all applicable strategies filtered by IV environment only, with no `fit_score` field in any output object.

2. The `recommend_by_category()` function shall continue to return strategies grouped by directional category (BULLISH, BEARISH, NEUTRAL, NEUTRAL_BULLISH, NEUTRAL_BEARISH, OMNIDIRECTIONAL), filtered to those whose `iv_environment` list includes the current IV environment, with no ordering by score and no `fit_score` field.

3. Within each directional category, strategies shall be ordered by `complexity` ascending (simplest first) — a fixed, transparent, non-evaluative ordering rule.

4. The `GET /api/strategies/analyze/{symbol}` response shall replace the `ai_recommendation` field with a `comparison_matrix` field containing an array of `MatrixRow` objects (see Section 5). The `ai_recommendation` field shall be removed entirely from the response.

5. The `GET /api/strategies/scan` response shall replace the `top_strategy` field with a `strategy_count` integer and an `iv_environment` string per symbol row. No single strategy shall be named as preferred in the scan result.

6. The `_build_scan_headline()` function shall be removed. Scan results shall no longer emit a `scan_narrative` object.

7. The `StrategyDetail` component shall remove the "AI Pick" banner (the `showAiComparison` block and the `ai_recommendation` prop consumption) entirely.

8. The `StrategyScanner` results table shall replace the "Top Strategy" and "PoP" columns with "Strategies Available" (displaying the `strategy_count` integer) and "IV Env" (already present). No strategy name shall appear in the scan table.

9. The `StrategyDetail` component shall render the comparison matrix as a scrollable table with one row per applicable strategy, displaying the columns defined in Section 5. The table shall carry a visible disclaimer: "This table shows mathematical strategy properties. It does not constitute investment advice or a recommendation to trade any specific strategy."

10. The `StrategyNarrative` component shall not be changed by this PRD — narrative content per strategy remains available when a user expands a strategy card.

11. The `fit_score` field shall be removed from the `StrategyRecommendation` TypeScript interface in `frontend/src/api/client.ts`.

12. The `AIRecommendation` interface and `ai_recommendation` field in `AnalyzeSymbolResponse` shall be removed from `frontend/src/api/client.ts`.

13. The `ScanResult` TypeScript interface shall have `top_strategy` replaced by `strategy_count: number`.

14. The `ai_strategy_comparison` entitlement flag, once referenced only by the "AI Pick" banner, shall cease to gate any UI element in the scanner or strategy detail. Its presence in the entitlements object is not changed by this PRD — removal of the entitlement flag itself is out of scope (see Section 5 of this document).

15. All matrix data values shall be derived purely from the existing catalog data and the `build_trade()` output: no new external data calls are required for the matrix.

16. Where `max_loss` is `null` (undefined-risk strategies), the matrix shall display the text "Undefined" in the Max Loss column — never a numeric value, never "unlimited" in a way that implies a specific figure.

17. The IV Environment Fit column in the matrix shall use factual descriptive language only, for example "Performs well in HIGH IV" — not "Recommended for HIGH IV" or "Best in HIGH IV".

18. All backend changes shall be backward-compatible with the existing paper-trade recording flow: `build_trade()` and `STRATEGIES` catalog remain unchanged. Only the scoring and ranking functions are removed or neutralised.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Subscriber views the Strategy Comparison Matrix for a ticker

**As a** retail paper trader (any authenticated tier), **I want** to see all applicable options strategies for a ticker displayed side-by-side with factual mathematical data **so that** I can compare their risk/reward profiles and choose one to paper-trade without the app telling me what to pick.

**Acceptance Criteria:**
- [ ] AC-1.1: Navigate to the Scanner tab, add a ticker (e.g. AAPL), click "Analyze". The page renders a matrix table. The table contains at least one row per applicable strategy for the current IV environment.
- [ ] AC-1.2: Every row in the matrix displays: Strategy Name, Type (debit/credit), Direction category, Max Profit, Max Loss, Breakeven(s), IV Environment Fit label, Delta Exposure, Theta (daily), Vega Sensitivity, Risk Type (DEFINED / UNDEFINED).
- [ ] AC-1.3: No row is visually distinguished as "top", "recommended", "best fit", or "AI pick" — no star, no badge, no accent border that implies ranking.
- [ ] AC-1.4: The table header or a visible sub-header contains the text: "This table shows mathematical strategy properties. It does not constitute investment advice or a recommendation to trade any specific strategy."
- [ ] AC-1.5: For any strategy whose `risk_type` is "UNDEFINED", the Max Loss cell displays the text "Undefined" rather than a numeric value or the word "unlimited".
- [ ] AC-1.6: The IV Environment Fit cell for each row uses the phrase "Performs well in [ENV]" or equivalent factual language — the words "recommended", "best", or "ideal" do not appear in this cell.
- [ ] AC-1.7: The `fit_score` field does not appear in the API response body when inspected via browser DevTools (Network tab → `/api/strategies/analyze/AAPL` → response JSON).
- [ ] AC-1.8: The `ai_recommendation` field does not appear in the API response body.

### Story 2 — Subscriber uses the Strategy Scanner to survey watchlist

**As a** paper trader, **I want** to scan my watchlist and see which tickers have the most applicable strategies in the current environment **so that** I can pick which ticker to analyze in depth — without the scanner pre-selecting a strategy for me.

**Acceptance Criteria:**
- [ ] AC-2.1: Click "Scan Watchlist". The results table renders with no "Top Strategy" column and no strategy name in any cell.
- [ ] AC-2.2: Each row in the scan results table shows: Symbol, Price, IVR, IV Environment badge, Bias, Strategies Available (integer count), and an "Analyze" button.
- [ ] AC-2.3: The `scan_narrative` field is absent from the API response for `/api/strategies/scan` when inspected via browser DevTools.
- [ ] AC-2.4: The `top_strategy` field is absent from the API response for `/api/strategies/scan`.
- [ ] AC-2.5: The "Analyze" button still navigates to the full Strategy Comparison Matrix for the selected symbol.

### Story 3 — Subscriber expands an individual strategy card from the matrix

**As a** paper trader, **I want** to expand a strategy from the matrix to see the full trade structure, legs, greeks, and narrative **so that** I can decide whether to paper-trade it.

**Acceptance Criteria:**
- [ ] AC-3.1: Clicking any strategy row or card in the matrix expands it to show the existing trade structure (legs, expiry, net credit/debit, max profit, max loss, PoP estimate, breakevens).
- [ ] AC-3.2: The "Record Trade" button inside the expanded card remains functional — clicking it opens the order entry flow.
- [ ] AC-3.3: If narrative is enabled for the user's tier, the `StrategyNarrative` accordion appears inside the expanded card as before.
- [ ] AC-3.4: No "AI recommends this" or equivalent phrase appears inside the expanded card.

### Story 4 — Admin verifies no ranking language appears in the UI

**As a** platform admin, **I want** to inspect the scanner and strategy detail pages after the change **so that** I can confirm no regulatory trigger language appears anywhere in the product.

**Acceptance Criteria:**
- [ ] AC-4.1: Logged in as admin (`leonardsim.sm@gmail.com`), open StrategyDetail for any ticker. The "AI Pick" banner (blue left-border card with star icon and "AI Pick:" label) is absent from the page.
- [ ] AC-4.2: Searching the rendered HTML of the StrategyDetail page for the strings "recommended", "AI Pick", "best fit", "top pick", "fit score" returns no matches.
- [ ] AC-4.3: Searching the rendered HTML of the StrategyScanner results table for any strategy name (e.g. "Iron Condor", "Short Strangle") returns no matches in the table rows — strategy names appear only after clicking "Analyze" and seeing the full matrix.
- [ ] AC-4.4: The `StrategyRecommendation` type rendered to the page does not include a `fit_score` property (verifiable via React DevTools or by inspecting the API payload).

### Story 5 — Unauthenticated user cannot access the matrix

**As an** unauthenticated visitor, **I want** the auth wall to remain in place **so that** I cannot access strategy data without signing in.

**Acceptance Criteria:**
- [ ] AC-5.1: `GET /api/strategies/analyze/AAPL` without a JWT returns HTTP 401 or 403.
- [ ] AC-5.2: `GET /api/strategies/scan?symbols=AAPL` without a JWT returns HTTP 401 or 403.
- [ ] AC-5.3: The frontend redirects unauthenticated users to the login page before rendering the Scanner tab.

---

## 5. Out of Scope

The following items are explicitly excluded from PRD-01. Raising any of them during implementation review is a scope-creep signal.

- **PRD-03 — Strike selection changes**: The `build_trade()` function and delta-targeting logic are not changed. Strike selection, expiry selection, and earnings-adjusted expiry remain identical.
- **PRD-05 — Language audit of StrategyNarrative**: The seven-section plain-English narrative generated by `interpreter.py` is not changed. Phrases such as "why this strategy" remain in the narrative. The narrative audit for regulatory language is a separate PRD.
- **Removal of the `ai_strategy_comparison` entitlement flag**: The flag continues to exist in the entitlements system and database. This PRD only removes the UI element it gated. Retiring the flag from the `tier_limits.py` config and Supabase is a separate cleanup task.
- **Removal of `compare_and_recommend()` in `ai_service.py`**: The AI comparison function may remain in the codebase during this PRD. It shall simply no longer be called from `strategies.py`. Dead-code removal is a separate housekeeping task.
- **Changes to the `StrategyNarrative` component**: The accordion narrative display is unchanged.
- **Changes to the `TradePanel` or `OrderEntry` components**: These are not affected by removing fit scoring.
- **New market data calls for matrix metrics**: Delta, theta, and vega values in the matrix come from existing `build_trade()` leg output and catalog data — no new Market Data App credits are consumed.
- **Mobile layout optimisation of the matrix table**: The table must be horizontally scrollable on mobile but specific mobile breakpoint design is an implementation concern, not a spec requirement.
- **Changes to the `UserGuide` component**: User-facing documentation updates are Gate 6 scope (technical-writer agent).
- **Changes to the `AdminPanel`**: No admin-facing changes are required by this PRD.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| Market data unavailable for a ticker (all three data sources fail) | The matrix renders using the synthetic Black-Scholes chain. A "Data is synthetic — live chain unavailable" notice appears above the matrix, matching current behaviour. No error state removes the matrix. |
| IV environment cannot be determined (IV analysis returns error) | The backend defaults to `iv_environment = "MEDIUM"` as today. The matrix renders strategies applicable to MEDIUM IV. An inline note states "IV data unavailable — showing MEDIUM IV strategies". |
| All 31 strategies are applicable to the current IV environment (unlikely but possible) | All applicable strategies render as matrix rows. No upper cap is imposed on the row count. The table must be scrollable. |
| A directional category returns zero strategies for the current IV environment | The category section renders with the text "No strategies applicable in this IV environment for this directional view" — identical to current behaviour in `StrategyDetail`. |
| Tier limit hit (scan count exhausted) | Scan endpoint returns HTTP 429 with existing `scan_limit_reached` error. The frontend renders the existing limit-reached banner. Matrix is never shown because no scan completes. This is unchanged behaviour. |
| User has `ai_strategy_comparison` entitlement but the feature is now removed | No visible change to the user. The entitlement flag is ignored by the frontend for this feature. No error. |
| Admin views the page | Admin sees identical matrix to any other authenticated user. No special admin-only ranking data is shown. |
| `build_trade()` returns an error for a specific strategy | That strategy's matrix row shows "--" for numeric fields derived from trade output (max profit, max loss, breakevens, greeks). The row remains in the table; it does not disappear. |
| Options chain is synthetic (`_synthetic: true`) | A disclaimer banner "Trade data is synthetic — live options chain unavailable" appears above the matrix. This matches current `StrategyDetail` behaviour. |

---

## 7. API Contract Changes

### 7.1 `GET /api/strategies/analyze/{symbol}` — response changes

Fields **removed** from the response:

```
ai_recommendation: {
  recommended_key: string
  recommended_name: string
  reasoning: string
}
```

Fields **added** to the response:

```
comparison_matrix: MatrixRow[]
```

The `recommendations_by_category` field is **retained** but the `StrategyRecommendation` objects within it no longer carry a `fit_score` property.

### 7.2 `GET /api/strategies/scan` — response changes

Per-symbol object changes:

| Field | Before | After |
|-------|--------|-------|
| `top_strategy` | `StrategyRecommendation \| null` | Removed |
| `scan_narrative` | `{ headline, confirmation_summary } \| null` | Removed |
| `strategy_count` | absent | `number` (count of strategies applicable to current IV env) |

All other fields (`symbol`, `price`, `iv_rank`, `current_iv`, `iv_environment`, `percentile_label`, `bias`, `bias_strength`, `rsi14`, `error`) are unchanged.

---

## 8. Data Model — MatrixRow

Each row in the comparison matrix represents one strategy applicable to the current IV environment. The backend constructs `MatrixRow` objects from the existing `STRATEGIES` catalog combined with the `build_trade()` output.

```
MatrixRow {
  key: string                    // strategy catalog key, e.g. "iron_condor"
  name: string                   // display name, e.g. "Iron Condor"
  direction: string[]            // e.g. ["NEUTRAL"]
  credit_or_debit: "credit" | "debit"   // derived from net: credit >= 0
  risk_type: "DEFINED" | "UNDEFINED"
  complexity: 1 | 2 | 3
  iv_environment_fit: string[]   // from catalog, e.g. ["HIGH"]
  iv_fit_label: string           // e.g. "Performs well in HIGH IV"
  dte_target: number             // days to expiration target
  max_profit: number | null      // null means unlimited (only for long options)
  max_loss: number | null        // null means undefined risk
  breakeven_low: number | null
  breakeven_high: number | null
  net_delta: number              // sum of signed leg deltas
  net_theta: number              // sum of signed leg thetas (daily)
  net_vega: number               // sum of signed leg vegas
  pop_range: [number, number]    // probability of profit range from catalog
  _synthetic: boolean            // true if trade data is from synthetic chain
}
```

Notes:
- `net_delta`, `net_theta`, and `net_vega` are derived from the existing greek fields already present on each leg returned by `build_trade()`. No new greek calculations are required.
- `credit_or_debit` is derived from the sign of `estimated_credit_or_debit`: `>= 0` is "credit", `< 0` is "debit".
- `iv_fit_label` is a backend-generated string using a fixed format: `"Performs well in {ENV} IV"` where ENV is each value in `iv_environment_fit`. This label is factual and non-evaluative.
- For strategies where `build_trade()` returns an error, `max_profit`, `max_loss`, `breakeven_low`, `breakeven_high`, `net_delta`, `net_theta`, and `net_vega` shall all be `null`.

---

## 9. Subscription Tier Impact

This PRD removes a feature (ranked recommendations) — it does not add tier-gated capabilities. The matrix is equally available to all authenticated tiers.

| Tier | Behaviour |
|------|-----------|
| free | Matrix renders for any ticker analyzed. Watchlist size and scan count limits are unchanged. |
| starter | Identical to free for this feature. |
| pro | Identical. The `ai_strategy_comparison` entitlement previously gated the "AI Pick" banner; that banner is removed. No capability loss beyond the banner itself. |
| enterprise | Identical. No capability loss. |
| admin | Identical to any authenticated user. Admin sees no special data. |

Revenue impact: removing a pro/enterprise-tier feature (`ai_strategy_comparison`) could be perceived as a downgrade by pro users. However, the "AI Pick" banner was always a regulatory risk and its removal is a necessary platform protection. No pricing change is required because this feature was not explicitly marketed as a standalone pro benefit in the current plan descriptions.

---

## 10. External Dependencies

| Service | Usage in this PRD | Quota / Risk |
|---------|------------------|--------------|
| Market Data App | No new calls. Matrix uses data already fetched by the existing analyze flow. | 100 credits/day free tier — no incremental cost. |
| yfinance | No new calls. | No change. |
| Supabase | No schema changes. No new queries. | No change. |
| Claude API | The `compare_and_recommend()` AI call is removed. This **reduces** Claude API token consumption per analyze request for pro/enterprise users. | Positive: lower token spend. |
| Reddit PRAW | No change. | No change. |

---

## 11. Open Questions

| # | Question | Owner | Needed by |
|---|----------|-------|-----------|
| OQ-1 | Should the comparison matrix be the primary view (replacing the category-accordion layout) or a secondary tab alongside the existing accordion? This spec assumes a tab or section within `StrategyDetail`, not a full replacement — architect to confirm layout. | Architect | Gate 2 |
| OQ-2 | The `_build_scan_headline()` function produces an English sentence that currently reads "options on AAPL are expensive (IVR 72) — sellers have an edge, and the trend is bullish — suggesting a Short Strangle." The second half of this sentence ("suggesting a...") is directive. The first half is factual. Should the factual portion be retained as a scan row tooltip or caption, or should the entire function be deleted? This spec mandates deletion of the entire function as the safest regulatory position. Confirm with legal/product. | Product Owner | Gate 2 |
| OQ-3 | The `StrategyNarrative` section 3 ("Why This Strategy") was generated in the context of a ranked recommendation. After ranking is removed, the narrative is still generated per-strategy when a user expands a card. Does the narrative generator (`interpreter.py`) contain any language that references "this is the recommended strategy" or "the top pick"? A content audit of `interpreter.py` is flagged for PRD-05 but may surface high-severity findings that need to be addressed in this PRD. | BA / Security Reviewer | Gate 5 |
| OQ-4 | The `ai_strategy_comparison` entitlement flag is left in the system after this PRD. Is there a planned future use for this flag, or should it be scheduled for removal in PRD-06 / housekeeping sprint? | Product Owner | Post-Gate 1 |
| OQ-5 | Net theta and vega per strategy leg are not currently returned by `build_trade()` — the leg objects include `delta` but not `theta` or `vega` explicitly (they flow through the greek enrichment but are not aggregated). The architect must confirm whether aggregated greeks can be added to the `build_trade()` return value or if the matrix must compute them from per-leg data on the frontend. | Architect | Gate 2 |

---

## 12. Regulatory Rationale (non-normative)

This section is provided for audit purposes and does not contain testable requirements.

**MAS two-stage test (Singapore Financial Advisers Act):** Stage 1 — does the communication relate to an investment product? Yes (options contracts). Stage 2 — does it constitute advice? The current `fit_score` ranking and "AI Pick" label directly advises the user which strategy to choose for their specific ticker, satisfying the Stage 2 test. Removal of the ranking and directive label means Stage 2 is no longer satisfied. The matrix presents factual mathematical properties and explicitly disclaims advice.

**SEC robo-adviser definition (US Investment Advisers Act of 1940, as applied to algorithmic systems):** A system that automatically provides personalised investment advice based on client-specific inputs (ticker, current IV environment) is a robo-adviser and requires registration. The current fit scoring is personalised (it runs against the user's selected ticker in real time) and actionable (it produces a ranked list with a top pick). Removal of the ranking and directive output eliminates the "advice" element; what remains is a factual data display analogous to a screener, which is generally not considered personalised advice.

---

## 13. Product Owner Annotations

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — Matrix view | | |
| Story 2 — Scanner changes | | |
| Story 3 — Expand strategy card | | |
| Story 4 — Admin verification | | |
| Story 5 — Auth wall unchanged | | |

**MVP boundary:** [Stories in v1]

**Deferred to backlog:** [Stories deferred]

**PO gate decision:** ☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

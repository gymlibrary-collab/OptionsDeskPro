# Technical Design — PRD-01: Remove Fit Scoring — Replace with Strategy Comparison Matrix

**Date:** 14Jun2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

This design removes all fit-scoring and ranking logic from the OptionsDesk strategy pipeline and replaces the ranked recommendation output with a neutral Strategy Comparison Matrix. On the backend, `strategy_engine.py` gains three new static catalog fields per strategy (`designed_for_iv`, `designed_for_direction`, `condition_explanation`) and two new functions: `build_comparison_matrix()` to assemble `MatrixRow` objects from the existing catalog and `build_trade()` output, and `get_strategy_count()` to count IV-applicable strategies for the scan endpoint. The `recommend_strategies()` function and `_build_scan_headline()` helper in `strategies.py` are removed. The `GET /api/strategies/analyze/{symbol}` response drops `ai_recommendation` and gains `comparison_matrix: MatrixRow[]`; the `GET /api/strategies/scan` response drops `top_strategy` and `scan_narrative` and gains `strategy_count`. On the frontend, `StrategyDetail.tsx` replaces the AI Pick banner with a matrix table component (`ComparisonMatrix`) and `StrategyScanner.tsx` replaces the "Top Strategy" and "PoP" scan columns with a "Strategies Available" count column. No database migration is required. No new external data calls are introduced: all matrix values derive from the existing `STRATEGIES` catalog and the existing `build_trade()` output already computed during the analyze flow.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/services/strategy_engine.py` | Modified | Add `designed_for_iv`, `designed_for_direction`, `condition_explanation` to all 31 catalog entries; add `build_comparison_matrix()` and `get_strategy_count()` functions; remove `recommend_strategies()` |
| `backend/routes/strategies.py` | Modified | Remove `_build_scan_headline()`, `recommend_strategies()` call, and `ai_recommendation` block in `analyze_symbol`; add `comparison_matrix` assembly; update `_scan_one()` to emit `strategy_count` instead of `top_strategy`/`scan_narrative` |
| `frontend/src/api/client.ts` | Modified | Remove `AIRecommendation` interface, `ai_recommendation` from `AnalyzeSymbolResponse`, `fit_score` from `StrategyRecommendation`, `top_strategy`/`scan_narrative` from `ScanResult`; add `MatrixRow` interface, `comparison_matrix` to `AnalyzeSymbolResponse`, `strategy_count` to `ScanResult` |
| `frontend/src/components/StrategyDetail.tsx` | Modified | Remove `ai_recommendation` / `showAiComparison` block; add `ComparisonMatrix` component rendered above category accordion; pass `comparison_matrix` from API response |
| `frontend/src/components/StrategyScanner.tsx` | Modified | Replace "Top Strategy" and "PoP" table columns with "Strategies Available" column displaying `strategy_count`; remove `scan_narrative` rendering |
| `docs/adr/0008-hardcode-condition-explanation-strings.md` | New | ADR for OQ-6 decision |

---

## 3. Database Schema Changes

None required. This is a pure logic, API, and UI change. All matrix data derives from the in-memory `STRATEGIES` catalog and live `build_trade()` computation. No new tables, columns, indexes, or RLS policies are needed.

The next available migration number is `014` — it is not used by this PRD.

---

## 4. API Contracts

### `GET /api/strategies/analyze/{symbol}`

**Auth required:** Yes (bearer token, any authenticated tier)

**What changes:**

The `ai_recommendation` field is removed from the response entirely. A new top-level field `comparison_matrix` is added, containing an array of `MatrixRow` objects — one per strategy whose `iv_environment` list includes the current IV environment. `recommendations_by_category` is retained but the `StrategyRecommendation` objects within it no longer include a `fit_score` property.

**Before (condensed):**
```json
{
  "symbol": "AAPL",
  "iv_analysis": { ... },
  "bias_analysis": { ... },
  "detected_bias": "NEUTRAL_BULLISH",
  "recommendations_by_category": {
    "BULLISH": [
      { "key": "covered_call", "name": "Covered Call", "fit_score": 4.9, ... }
    ]
  },
  "news_sentiment": { ... },
  "ai_recommendation": {
    "recommended_key": "covered_call",
    "recommended_name": "Covered Call",
    "reasoning": "High IV environment with bullish lean..."
  }
}
```

**After:**
```json
{
  "symbol": "AAPL",
  "iv_analysis": { ... },
  "bias_analysis": { ... },
  "detected_bias": "NEUTRAL_BULLISH",
  "recommendations_by_category": {
    "BULLISH": [
      { "key": "covered_call", "name": "Covered Call", ... }
    ]
  },
  "news_sentiment": { ... },
  "comparison_matrix": [
    {
      "key": "covered_call",
      "name": "Covered Call",
      "direction": ["BULLISH"],
      "credit_or_debit": "credit",
      "risk_type": "UNDEFINED",
      "complexity": 1,
      "iv_environment_fit": ["HIGH"],
      "iv_fit_label": "Performs well in HIGH IV",
      "dte_target": 45,
      "max_profit": 1.42,
      "max_loss": null,
      "breakeven_low": null,
      "breakeven_high": null,
      "net_delta": 0.30,
      "net_theta": -0.04,
      "net_vega": -0.08,
      "pop_range": [50, 70],
      "designed_for_iv": "high",
      "designed_for_direction": "bullish",
      "iv_condition_match": true,
      "direction_condition_match": false,
      "condition_explanation": "Covered calls collect premium by selling a call against owned shares; this strategy is designed for HIGH IV environments where premium is elevated. The current ticker's directional bias is NEUTRAL_BULLISH, which partially but not exactly matches the BULLISH design intent of this strategy.",
      "_synthetic": false
    }
  ]
}
```

**Full MatrixRow JSON schema:**

```json
{
  "key": "string",
  "name": "string",
  "direction": ["string"],
  "credit_or_debit": "credit | debit",
  "risk_type": "DEFINED | UNDEFINED",
  "complexity": 1,
  "iv_environment_fit": ["string"],
  "iv_fit_label": "string",
  "dte_target": 45,
  "max_profit": "number | null",
  "max_loss": "number | null",
  "breakeven_low": "number | null",
  "breakeven_high": "number | null",
  "net_delta": "number",
  "net_theta": "number",
  "net_vega": "number",
  "pop_range": ["number", "number"],
  "designed_for_iv": "high | low | any",
  "designed_for_direction": "bullish | bearish | neutral | volatile | any",
  "iv_condition_match": "boolean",
  "direction_condition_match": "boolean",
  "condition_explanation": "string",
  "_synthetic": "boolean"
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | No bearer token |
| 403 | Token invalid or user not in whitelist |
| 500 | IV analysis failure or unhandled exception |

---

### `GET /api/strategies/scan`

**Auth required:** Yes (bearer token, any authenticated tier, legal gate required)

**What changes:**

`top_strategy` (a `StrategyRecommendation | null`) and `scan_narrative` (`{headline, confirmation_summary} | null`) are removed from each per-symbol result object. A new integer field `strategy_count` is added, representing the count of strategies in the `STRATEGIES` catalog whose `iv_environment` list includes the current symbol's IV environment.

**Before (single result object, condensed):**
```json
{
  "symbol": "AAPL",
  "price": 211.50,
  "iv_rank": 72.0,
  "current_iv": 0.38,
  "iv_environment": "HIGH",
  "percentile_label": "IVR 72 — High IV",
  "bias": "NEUTRAL_BULLISH",
  "bias_strength": "MODERATE",
  "rsi14": 58.2,
  "top_strategy": {
    "key": "short_put_vertical",
    "name": "Short Put Vertical Spread",
    "fit_score": 4.9,
    ...
  },
  "scan_narrative": {
    "headline": "options on AAPL are expensive (IVR 72) — sellers have an edge, and the trend is neutral-bullish — suggesting a Short Put Vertical Spread.",
    "confirmation_summary": ""
  },
  "error": null
}
```

**After:**
```json
{
  "symbol": "AAPL",
  "price": 211.50,
  "iv_rank": 72.0,
  "current_iv": 0.38,
  "iv_environment": "HIGH",
  "percentile_label": "IVR 72 — High IV",
  "bias": "NEUTRAL_BULLISH",
  "bias_strength": "MODERATE",
  "rsi14": 58.2,
  "strategy_count": 19,
  "error": null
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 400 | `symbol_limit_exceeded` — watchlist too large for tier |
| 401 | No bearer token |
| 403 | Token invalid / legal gate not satisfied |
| 429 | `scan_limit_reached` — monthly scan quota exhausted |

---

## 5. Backend Logic — Detailed Design

### 5.1 New catalog fields in `strategy_engine.py`

Each entry in the `STRATEGIES` dict gains three new keys:

```python
"covered_call": {
    # ... existing fields unchanged ...
    "designed_for_iv": "high",
    "designed_for_direction": "bullish",
    "condition_explanation": (
        "Covered calls are designed for HIGH IV environments where elevated option premiums "
        "increase income collected against the long stock position. This strategy suits a "
        "BULLISH or mildly bullish directional view — the stock is expected to stay flat or "
        "rise modestly, not fall sharply."
    ),
}
```

All 31 entries receive these fields. The `designed_for_iv` values map as follows: strategies whose catalog `iv_environment` is `["HIGH"]` only get `"high"`; those whose list is `["LOW"]` only get `"low"`; those whose list is `["LOW", "MEDIUM"]` or `["LOW", "MEDIUM", "HIGH"]` get `"any"`. The `designed_for_direction` value is derived from the primary entry in the catalog's `direction` list (BULLISH → `"bullish"`, BEARISH → `"bearish"`, NEUTRAL → `"neutral"`, NEUTRAL_BULLISH → `"bullish"`, NEUTRAL_BEARISH → `"bearish"`, OMNIDIRECTIONAL → `"volatile"`). These are static authoring decisions made at implementation time; see ADR-0008.

### 5.2 Condition matching logic

`iv_condition_match` and `direction_condition_match` are computed inside `build_comparison_matrix()` in `strategy_engine.py`, not in the route. This keeps routing thin and logic testable.

**IV condition match rule:**

```python
def _iv_matches(designed_for_iv: str, current_iv_env: str) -> bool:
    if designed_for_iv == "any":
        return True
    return designed_for_iv.upper() == current_iv_env.upper()
```

`current_iv_env` is the string `"HIGH"`, `"MEDIUM"`, or `"LOW"` from `iv_analysis.get_iv_rank()`. Classification thresholds: IVR > 50 → HIGH, IVR < 30 → LOW, otherwise MEDIUM (existing logic in `iv_analysis.py`, unchanged).

**Direction condition match rule:**

```python
_DIRECTION_MAP = {
    "bullish":  {"BULLISH", "NEUTRAL_BULLISH"},
    "bearish":  {"BEARISH", "NEUTRAL_BEARISH"},
    "neutral":  {"NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH"},
    "volatile": {"OMNIDIRECTIONAL"},
    "any":      {"BULLISH", "BEARISH", "NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH", "OMNIDIRECTIONAL"},
}

def _direction_matches(designed_for_direction: str, current_bias: str) -> bool:
    return current_bias in _DIRECTION_MAP.get(designed_for_direction, set())
```

`current_bias` is the `"bias"` string from `iv_analysis.get_directional_bias()` — one of `BULLISH`, `BEARISH`, `NEUTRAL`, `NEUTRAL_BULLISH`, `NEUTRAL_BEARISH`. These are pure string comparisons; no external calls.

### 5.3 Resolving OQ-5 — net theta and vega aggregation

The existing `build_trade()` return value does not include aggregated per-position theta or vega; it returns per-leg data with `delta` and the greeks enriched on each contract by `calculate_greeks()`. However, `_enrich_chain_with_greeks()` in `strategies.py` populates `theta` and `vega` on every contract in the chain via `calculate_greeks()`. These values propagate to leg objects via `make_leg()` inside `build_trade()` only if they are included in the leg dict — currently they are not. The `clean_legs` output at line 1098 of `strategy_engine.py` omits theta and vega.

**Design decision:** Rather than modifying `build_trade()` to return aggregated greeks (which would be a change to a stable, tested function), `build_comparison_matrix()` will recompute net greeks from the enriched chain directly. For each strategy, it will sum the signed theta and vega of the delta-closest contracts for each leg role, using the same delta-targeting logic already in `build_trade()`. This avoids touching `build_trade()` and isolates the new computation to the new function.

If the enriched chain does not have theta/vega on a contract (e.g. when all greeks failed), `net_theta` and `net_vega` default to `0.0`. The `_synthetic` flag on the chain propagates to the MatrixRow.

### 5.4 `build_comparison_matrix()` function signature

```python
def build_comparison_matrix(
    symbol: str,
    iv_env: str,
    current_bias: str,
    options_chain: dict,
    spot_price: float,
    earnings_data: dict | None = None,
) -> list[dict]:
    """
    Returns a list of MatrixRow dicts for all strategies whose iv_environment
    includes iv_env. Rows are ordered by complexity ascending within each
    directional category, then by category in CATEGORY_ORDER.
    """
```

Internally the function iterates all 31 `STRATEGIES` entries, filters those whose `iv_environment` includes `iv_env`, calls `build_trade()` for each (or re-uses the existing `trades_by_key` dict passed in from the route), assembles the MatrixRow, and appends it. If `build_trade()` returns an error dict, the numeric fields (`max_profit`, `max_loss`, `breakeven_low`, `breakeven_high`, `net_delta`, `net_theta`, `net_vega`) are all `None` / `0.0` as specified in the spec; the condition alignment fields are always populated from the catalog.

### 5.5 `get_strategy_count()` function signature

```python
def get_strategy_count(iv_env: str) -> int:
    """Returns count of strategies whose iv_environment includes iv_env."""
    return sum(1 for s in STRATEGIES.values() if iv_env in s["iv_environment"])
```

This is a pure catalog lookup with no external calls. Called from `_scan_one()` in `strategies.py`.

### 5.6 Removal of `recommend_strategies()` and `_build_scan_headline()`

`recommend_strategies()` in `strategy_engine.py` is removed entirely. Its import in `strategies.py` is removed. `_build_scan_headline()` in `strategies.py` is removed. The `ai_recommendation` block in `analyze_symbol()` (lines 231–255 of `strategies.py`) is removed. The `compare_and_recommend()` function in `ai_service.py` is not removed (per spec OQ-4 / out-of-scope note) but is no longer called.

### 5.7 Route changes in `analyze_symbol()`

The route continues to call `recommend_by_category(iv_env)` and build trades for all unique keys, retaining the `recommendations_by_category` response field. After trades are built, a single new call assembles the matrix:

```python
comparison_matrix = build_comparison_matrix(
    symbol=symbol,
    iv_env=iv_env,
    current_bias=bias,
    options_chain=enriched_chain,
    spot_price=spot,
    earnings_data=earnings_data,
)
```

The return dict gains `"comparison_matrix": comparison_matrix` and loses `"ai_recommendation"`.

---

## 6. Caching Strategy

No change to the existing three-tier cache. This design introduces no new external calls.

| Data | Cache Key | TTL | Source |
|------|-----------|-----|--------|
| Options chain (Market Data App) | `{symbol}:{expiry}` | 300 s | market_data.py (unchanged) |
| Options chain (yfinance fallback) | `{symbol}:{expiry}` | 30 s | market_data.py (unchanged) |
| IV rank / HV computation | `{symbol}` | 300 s | iv_analysis.py (unchanged) |
| Directional bias | `{symbol}` | 300 s | iv_analysis.py (unchanged) |

The matrix is computed per request from data already in the cache. It is not itself cached. Its computation cost is O(n) over the 31-entry catalog — negligible.

---

## 7. External Dependency Fallback Chain

Unchanged. The three-tier chain (Market Data App → yfinance → synthetic Black-Scholes) applies as today. This PRD adds no new external dependencies.

| Primary | Fallback 1 | Fallback 2 | Behaviour if all fail |
|---------|------------|------------|----------------------|
| Market Data App | yfinance | Synthetic Black-Scholes | Matrix renders with `_synthetic: true`; disclaimer banner shown |

The matrix is populated regardless of which data tier is used. When the synthetic chain is active, `net_delta`, `net_theta`, `net_vega`, `max_profit`, `max_loss`, and breakeven values in each MatrixRow reflect Black-Scholes pricing and are labelled synthetic via the `_synthetic` flag. The condition alignment fields (`designed_for_iv`, `designed_for_direction`, `iv_condition_match`, `direction_condition_match`, `condition_explanation`) are always populated from the catalog regardless of data source.

---

## 8. Frontend Changes

### 8.1 TypeScript interface changes in `api/client.ts`

**Removed:**
- `AIRecommendation` interface (entire interface)
- `AnalyzeSymbolResponse.ai_recommendation?: AIRecommendation`
- `StrategyRecommendation.fit_score?: number`
- `ScanResult.top_strategy: StrategyRecommendation | null`
- `ScanResult.scan_narrative?: { headline: string; confirmation_summary: string } | null`

**Added:**
```typescript
export interface MatrixRow {
  key: string
  name: string
  direction: string[]
  credit_or_debit: 'credit' | 'debit'
  risk_type: 'DEFINED' | 'UNDEFINED'
  complexity: 1 | 2 | 3
  iv_environment_fit: string[]
  iv_fit_label: string
  dte_target: number
  max_profit: number | null
  max_loss: number | null
  breakeven_low: number | null
  breakeven_high: number | null
  net_delta: number
  net_theta: number
  net_vega: number
  pop_range: [number, number]
  designed_for_iv: 'high' | 'low' | 'any'
  designed_for_direction: 'bullish' | 'bearish' | 'neutral' | 'volatile' | 'any'
  iv_condition_match: boolean
  direction_condition_match: boolean
  condition_explanation: string
  _synthetic: boolean
}
```

**Modified:**
- `AnalyzeSymbolResponse` gains `comparison_matrix: MatrixRow[]`
- `ScanResult` gains `strategy_count: number`

### 8.2 `StrategyDetail.tsx` component changes

**Removed:** The entire `showAiComparison` / `ai_recommendation` banner block (lines 495–519 of the current file). This removes the "AI Pick" card with the blue left-border, star icon, and "AI Pick:" label.

**Modified:** The destructuring of `data` removes `ai_recommendation`. The `showAiComparison` const is removed.

**Added:** A new `ComparisonMatrix` component, rendered between the header card and the direction guide. It receives `rows: MatrixRow[]`, `symbol: string`, and `ivEnv: string` as props. The component has the following layout:

```
┌─ Disclaimer bar ──────────────────────────────────────────────────────────────────┐
│  "This table shows mathematical strategy properties. It does not constitute        │
│   investment advice or a recommendation to trade any specific strategy."           │
└───────────────────────────────────────────────────────────────────────────────────┘
┌─ Filter controls ─────────────────────────────────────────────────────────────────┐
│  [ ] Both conditions match   Direction: [All ▾]   Type: [All ▾]   Risk: [All ▾]  │
└───────────────────────────────────────────────────────────────────────────────────┘
┌─ Scrollable matrix table ─────────────────────────────────────────────────────────┐
│  Strategy | Type | Dir | Risk | Max Profit | Max Loss | Breakevens |              │
│           | IV Fit Label | Delta | Theta | Vega | PoP | Condition Fit |           │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Columns:**
1. Strategy Name (text + complexity dots)
2. Credit/Debit (badge)
3. Direction (category)
4. Risk Type (DEFINED / UNDEFINED badge)
5. Max Profit (number, or "Unlimited" if null)
6. Max Loss (number, or "Undefined" if null per spec FR-16)
7. Breakeven(s) (low / high or "--")
8. IV Fit Label (`iv_fit_label` string, factual language)
9. Net Delta
10. Net Theta
11. Net Vega
12. PoP Range (`pop_range[0]`–`pop_range[1]%`)
13. Condition Fit (two indicators: IV and direction, each showing checkmark / cross / tilde; expandable to show `condition_explanation`)

**Condition Fit column design:** Each cell shows two compact indicators side-by-side:

- IV: `✓` (green, `iv_condition_match === true`) or `✗` (muted red, false)
- Dir: `✓` (green, `direction_condition_match === true`) or `✗` (muted red, false)

Clicking the cell expands an inline detail row beneath showing `condition_explanation` text in muted style. No sorting change occurs on click — expansion is purely informational. A "Condition Fit" column header tooltip or sub-label reads: "Factual comparison of current market data against each strategy's textbook design criteria. Not a recommendation."

**Filter controls (user-initiated, per AC-6.5):**
- Checkbox "Both conditions match" — when checked, hides rows where either `iv_condition_match` or `direction_condition_match` is false
- Direction dropdown: All / BULLISH / BEARISH / NEUTRAL / NEUTRAL_BULLISH / NEUTRAL_BEARISH / OMNIDIRECTIONAL
- Type dropdown: All / Credit / Debit
- Risk dropdown: All / DEFINED / UNDEFINED

Filters are user-initiated. On load, the table shows all rows unfiltered (spec AC-6.4 and AC-6.5). Table does not pre-sort by condition fit.

**Default sort:** Complexity ascending (simplest first), consistent with `recommend_by_category()`.

**Mobile:** Table is wrapped in `overflow-x: auto`. No responsive column-hiding is required by the spec; horizontal scroll is sufficient.

**Synthetic banner:** If any MatrixRow has `_synthetic: true`, a banner is rendered above the matrix: "Trade data is synthetic — live options chain unavailable." This matches the existing behaviour described in the spec edge cases and current `_trade_plain_english()` logic.

### 8.3 `StrategyScanner.tsx` component changes

The results table thead currently lists `['Symbol', 'Price', 'IVR', 'IV Env', 'Bias', 'Top Strategy', 'PoP', 'Risk', '']`. This becomes `['Symbol', 'Price', 'IVR', 'IV Env', 'Bias', 'Strategies Available', '']` — removing "Top Strategy", "PoP", and "Risk" columns (which were all sourced from `top_strategy`), and adding "Strategies Available".

The "Strategies Available" cell renders `r.strategy_count` as an integer. No strategy name appears in any scan result row.

The `scan_narrative` rendering inside the "Top Strategy" cell is removed entirely.

The footer label is updated from "N symbols sorted by IVR (highest opportunity first)" to the same text — no change needed to the sort order or footer copy.

### 8.4 Component state management

| Component | State owned | Props received | Loading | Error | Empty |
|-----------|-------------|----------------|---------|-------|-------|
| `StrategyDetail` | `data: AnalyzeSymbolResponse | null`, `loading`, `error` | `symbol`, `onSelectTrade` | "Analyzing {symbol}..." spinner | Red error card | null (render nothing) |
| `ComparisonMatrix` | `expandedRow: string | null`, `filterBothMatch: boolean`, `filterDirection`, `filterType`, `filterRisk` | `rows: MatrixRow[]`, `symbol`, `ivEnv` | None (data already loaded) | None | "No strategies match the current filters." |
| `StrategyScanner` | `results: ScanResult[]`, `loading`, `error`, `selectedSymbol`, `scanned` | `onSelectTrade` | "Scanning..." message | Red error card | "No results." |

The `ComparisonMatrix` component owns its own filter state. It does not propagate filter state upward.

---

## 9. Subscription Tier Enforcement

No change to tier enforcement. The comparison matrix is available to all authenticated tiers. The `ai_strategy_comparison` entitlement flag is not checked by any UI element in this PRD (it previously gated the "AI Pick" banner, which is being removed). The flag continues to exist in `tier_limits.py` and the database; it is not removed by this PRD (spec section 5, out of scope).

The scan quota enforcement (`max_scans_per_month`) and symbol limit enforcement (`max_symbols`) are unchanged.

---

## 10. Open Questions — Architect Resolutions

| # | Question | Resolution |
|---|----------|------------|
| OQ-1 | Matrix as primary view or secondary tab? | The matrix is rendered as a new section within `StrategyDetail.tsx`, positioned between the header card and the existing category accordion. The accordion is retained. The matrix is the primary at-a-glance comparison tool; the accordion is the drill-down path to the full trade structure and narrative for a specific strategy. No tabs are needed. |
| OQ-2 | Retain factual portion of `_build_scan_headline()` or delete entire function? | Delete the entire function. The first half of the headline ("options on AAPL are expensive — sellers have an edge") is factual, but the second half ("suggesting a Short Strangle") is directive. Retaining any part risks reassembly of directive language in a future edit. Deletion is the correct regulatory position as stated in the spec. |
| OQ-3 | Does `interpreter.py` contain directive language referencing "recommended strategy"? | Yes. The else-branch fallback in `_why_this_strategy()` (line 386–389) contains the phrase "ranks as the best-fit strategy." This is in scope for PRD-05 (language audit), not PRD-01. PRD-01 does not change `interpreter.py`. This finding is flagged for the Gate 5 security reviewer. |
| OQ-4 | Planned future use of `ai_strategy_comparison` entitlement flag? | Out of scope for Gate 2. Flag retained in system. |
| OQ-5 | Net theta/vega from `build_trade()` or recomputed? | Recomputed in `build_comparison_matrix()` from the enriched chain's per-contract theta/vega values. `build_trade()` is not modified. See section 5.3. |
| OQ-6 | Hardcode vs dynamic `condition_explanation`? | Hardcoded in `strategy_engine.py`. See ADR-0008. |

---

## 11. New Environment Variables

None. This PRD introduces no new environment variables.

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `condition_explanation` strings authored with directive language during implementation | Medium | Regulatory — Gate 5 finding | Gate 5 security reviewer must audit all 31 strings for directive language ("recommended", "best", "ideal", "should", "pick"). If any are found, they must be rewritten before Gate 6 approval. |
| `_why_this_strategy()` section 3 narrative still contains "best-fit strategy" language | High (confirmed in OQ-3) | Regulatory — but PRD-05 scope | Flagged. Not blocking Gate 2. PRD-05 is a prerequisite for any marketing claim that the narrative is regulatory-compliant. |
| `build_comparison_matrix()` calling `build_trade()` for all 31 strategies on every analyze request increases latency | Low-Medium | Performance — existing `analyze_symbol` already builds trades for up to ~15 unique keys | The route already calls `build_trade()` for all unique keys across categories. The matrix reuses that computation via `trades_by_key`. No additional `build_trade()` calls are needed if the route passes the pre-built dict into `build_comparison_matrix()`. |
| Frontend table renders poorly on mobile with 13 columns | Medium | UX — horizontal scroll acceptable per spec | Wrap table in `overflow-x: auto`. Label columns with abbreviated headers on narrow screens. Spec accepts horizontal scroll as the mobile behaviour. |
| `fit_score` field removal breaks any external integration that reads the analyze endpoint | Low | API contract break | `fit_score` was never documented in a public API spec. No external integrations are known. Breaking change is intentional and spec-mandated. |
| `top_strategy` removal breaks any external integration that reads the scan endpoint | Low | API contract break | Same reasoning as above. Intentional. |
| `net_theta` / `net_vega` values are zero when greeks are missing from enriched chain | Medium | Data accuracy — user sees 0.00 instead of "--" | `build_comparison_matrix()` should return `null` for these fields (not `0.0`) when the enriched chain has no theta/vega on the matching contract. The MatrixRow TypeScript interface must type them as `number | null`, not `number`. Update: the spec data model lists them as `number` (no null), but this design amends that to `number | null` for correctness — the spec note on build_trade errors already permits null for these fields. |

---

## 13. Test Hooks

### Unit-testable (no network, no DB):

- `get_strategy_count(iv_env)` — pure catalog lookup; assert counts for each IV environment
- `_iv_matches(designed_for_iv, current_iv_env)` — pure string comparison; 6 combinations
- `_direction_matches(designed_for_direction, current_bias)` — pure set membership; matrix of all combinations
- `build_comparison_matrix()` with a mocked `build_trade()` and synthetic chain — assert MatrixRow fields for a known strategy
- All 31 `condition_explanation` strings for absence of directive language tokens: "recommended", "best", "ideal", "top pick", "AI", "suggests", "should trade"

### Integration-testable (with live FastAPI test client, mocked market data):

- `GET /api/strategies/analyze/AAPL` — assert `ai_recommendation` absent, `comparison_matrix` present with at least one row, each row has all required fields
- `GET /api/strategies/analyze/AAPL` — assert no row contains `fit_score`
- `GET /api/strategies/scan?symbols=AAPL` — assert `top_strategy` absent, `scan_narrative` absent, `strategy_count` present and integer > 0
- `GET /api/strategies/analyze/AAPL` without JWT — assert HTTP 401

### Playwright E2E (acceptance criteria coverage):

- AC-1.1: Navigate to Scanner, click Analyze, assert matrix table renders
- AC-1.3: Assert no element with text "AI Pick", "recommended", "best fit" in matrix
- AC-1.4: Assert disclaimer text visible
- AC-1.5: Assert "Undefined" text for any UNDEFINED risk row's Max Loss cell
- AC-1.7/1.8: Intercept network response for `/api/strategies/analyze/AAPL`, assert `fit_score` absent, `ai_recommendation` absent
- AC-2.1: Click "Scan Watchlist", assert table headers do not contain "Top Strategy"
- AC-2.3/2.4: Intercept scan response, assert `scan_narrative` and `top_strategy` absent
- AC-4.1: Assert "AI Pick" banner element absent from DOM
- AC-6.1/6.2: Assert Condition Fit column visible with checkmark/cross indicators
- AC-6.5: Assert "Both conditions match" checkbox present and functional

---

## 14. ADR References

- `docs/adr/0008-hardcode-condition-explanation-strings.md` — Decision to hardcode the 31 `condition_explanation` strings as static catalog entries in `strategy_engine.py` rather than generating them dynamically via `interpreter.py`. Rationale: regulatory defensibility, determinism, no LLM token cost, testability.

---

## 15. Architect Gate Decision

☐ Approved &nbsp; ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

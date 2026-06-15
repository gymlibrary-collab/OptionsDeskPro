# Release Note — PRD-01: Strategy Comparison Matrix

**Release date:** 15 Jun 2026  
**Version / Branch:** `claude/modest-davinci-sxz7lv`  
**Author:** Technical Writer (Gate 6)

---

## What changed

OptionsDesk has removed the AI Pick ranking system from the Strategy Scanner and Deep Analysis views. In its place is a neutral **Strategy Comparison Matrix** — a factual, side-by-side display of all applicable strategies for a given ticker with no single strategy marked as "recommended."

### Specific changes to user experience

**Strategy Scanner results table:**
- **Removed:** "Top Strategy" and "PoP" columns (these showed the single ranked-best strategy)
- **Added:** "Strategies Available" column showing the count of strategies applicable to the current IV environment
- **Result:** The scanner now tells you how many strategies fit the current market conditions, without suggesting which one to pick

**Deep Analysis view (when you click "Analyze" on a ticker):**
- **Removed:** The blue "AI Pick" banner that named a single recommended strategy
- **Added:** A sortable Comparison Matrix table showing all applicable strategies side-by-side with their key metrics
- **New column:** "Condition Fit" showing checkmark/cross indicators for IV environment and directional bias alignment
- **Expanded rows:** Click any strategy's "Condition Fit" cell to see an educational explanation of why that strategy is or isn't aligned with current market conditions

### API changes

- The `/api/strategies/analyze/{symbol}` endpoint no longer returns an `ai_recommendation` field. It now returns a `comparison_matrix` array of all applicable strategies.
- The `/api/strategies/scan` endpoint no longer returns `top_strategy` or `scan_narrative` fields. It now returns `strategy_count` (the number of applicable strategies per symbol).
- The `fit_score` numeric ranking field has been removed from all strategy responses.

---

## Why it changed

Under Singapore's Financial Advisers Act and US investment adviser regulations, the previous "AI Pick" system — which ranked strategies and presented a single best-fit option for a user's specific ticker — constituted personalised investment advice. OptionsDesk is not registered to provide investment advice. Removing the ranking and directive language ("recommended", "AI Pick", "best fit") removes this regulatory trigger while preserving all educational and analytical value. The Comparison Matrix presents factual, mathematical data so you can make your own decision based on the market conditions and your trading plan.

---

## Who it affects

| Tier | Available | Notes |
|------|-----------|-------|
| Free | Yes | Strategy Comparison Matrix is available on all analyzed tickers. Watchlist and scan limits are unchanged. |
| Starter | Yes | No change to feature access. The previous "AI Pick" banner (part of Pro entitlements) is gone, but the Comparison Matrix is available to all tiers. |
| Pro | Yes | The previous "AI Pick" banner was an entitlement feature; it is now removed. No capability loss beyond the removal of the directive ranking — the full matrix is still available. |
| Enterprise | Yes | No change. |
| Admin | Yes | Admin sees the same matrix as any authenticated user. |

---

## How to use it

### Scanning your watchlist (new process)

1. Navigate to the **Strategy Scanner** tab
2. Ensure you have symbols in your watchlist (add them in the search box if needed)
3. Click **Scan Watchlist**
4. In the results table, review the **Strategies Available** column — this shows how many strategies are applicable to each symbol's current IV environment
5. Click **Analyze** on any row to see the full Comparison Matrix for that symbol

### Analyzing a ticker (what you see now)

1. Click **Analyze** on a symbol from the scan results (or search directly in the Scanner tab)
2. Below the header card, you will see a **Comparison Matrix** table listing all applicable strategies
3. Each row shows:
   - Strategy name and type (Credit / Debit)
   - Risk type (Defined / Undefined)
   - Maximum profit and loss
   - Greeks (Delta, Theta, Vega)
   - Probability of Profit range
   - **Condition Fit** column showing checkmarks/crosses for IV alignment and directional alignment
4. The table is sortable — click any column header to reorder
5. Use the filter controls above the table to show only strategies where both conditions match current market data, or filter by direction, type, or risk

### Understanding Condition Fit

The **Condition Fit** column shows whether the current ticker's market conditions align with each strategy's textbook design:

- **Green checkmark (✓)** — the strategy's design criteria match current conditions
- **Red cross (✗)** — the strategy is designed for different conditions
- **Click the cell** to expand an explanation of why

**Important:** The Condition Fit indicators are informational only. They do not rank strategies or constitute a recommendation. The matrix does not pre-filter or pre-sort by condition match — all strategies remain visible by default.

### Placing a trade

Once you have reviewed the matrix and selected a strategy:

1. Click the strategy row to expand its full trade structure
2. Review the legs, expirations, greeks, and estimated cost/credit
3. If narrative is available on your plan, the strategy narrative accordion will appear — read the full plain-English breakdown
4. Click **Record Trade** to open the Order Entry panel and place a paper trade

---

## Disclaimer

**This table shows mathematical strategy properties. It does not constitute investment advice or a recommendation to trade any specific strategy.**

The Comparison Matrix displays factual data about each strategy's characteristics — maximum profit, maximum loss, greeks, and how well its design criteria align with current market conditions. The decision to trade any strategy is yours alone, based on your trading plan, risk tolerance, and market outlook. OptionsDesk is a paper trading education platform, not an investment adviser.

---

## Breaking changes / data migration

**No data migration required.** Your watchlist, paper trades, and portfolio history remain unchanged.

**For integration users:** If you have external integrations consuming the `/api/strategies/analyze` or `/api/strategies/scan` endpoints:
- `ai_recommendation` field is removed — update parsers to no longer expect this field
- `fit_score` field is removed from strategy objects — use the new `comparison_matrix` array instead
- `top_strategy` and `scan_narrative` fields are removed from scan results — use `strategy_count` for the number of applicable strategies

---

## Known limitations

1. **Condition Fit explanations are not dynamic.** The explanation text is the same for each strategy regardless of which ticker you are analyzing or what the current market conditions are. This is by design — the explanation is a static educational fact about the strategy's textbook use case, not a personalised AI commentary. If you want to understand *why* a condition does or does not match for a specific ticker, read the IV analysis and bias analysis sections in the narrative.

2. **Matrix is not pre-filtered by condition match on load.** The "Both conditions match" checkbox lets you filter, but all strategies are shown by default. Specification AC-6.4 and AC-6.5 mandate this: we do not pre-sort or pre-filter by condition fit, as that would imply a ranking.

3. **The `ai_strategy_comparison` subscription entitlement flag remains in the system.** This flag previously gated the "AI Pick" banner. It is now unused by the frontend. The flag itself is not removed by this release — that is a separate housekeeping task.

---

## Rollback procedure

If critical bugs are discovered in the Comparison Matrix or Scanner changes:

1. **Rollback branch:** Revert the commit to `main` (use `git revert` to preserve history, or `git reset --hard` to discard)
2. **Clear frontend cache:** Users' browsers may cache the old UI code; a soft refresh (Cmd+Shift+R or Ctrl+Shift+R) may be needed
3. **Backend fallback:** No database migration was applied, so the backend can safely revert without schema cleanup
4. **Communication:** Issue an incident post explaining the rollback and ETA for a fix

If the rollback is successful:
- The "AI Pick" banner will reappear on StrategyDetail
- The Scanner results will show "Top Strategy" and "PoP" columns again
- Users on Pro/Enterprise tiers will see the `ai_recommendation` field in the analyze response

---

## Deployment checklist

- [x] Backend implementation complete (commits 8677a23, 4b174f7)
- [x] Frontend implementation complete (StrategyDetail, StrategyScanner, TypeScript interfaces updated)
- [x] Automated test suite passing (31 Playwright tests in `strategy-comparison-matrix.spec.ts`)
- [x] Manual test plan complete (34 manual test scenarios, 6 deferred to live environment)
- [x] Security review passed (Gate 5, 15 Jun 2026)
- [x] No database migration required
- [x] No new environment variables required
- [x] Deployed to Railway production (main branch — auto-deployed, 15 Jun 2026)
- [x] Release note published to changelog
- [x] User Guide updated (frontend/src/components/UserGuide.tsx — Comparison Matrix and Condition Fit sections added)
- [x] Help articles updated — Condition Fit explanation added to UserGuide component
- [ ] Monitoring alert set for any increase in error rates on /api/strategies endpoints
- [ ] Internal team (support, content) notified of feature change

---

## Testing notes for QA

- The Comparison Matrix renders all strategies applicable to the current IV environment, filtered by the `designed_for_iv` and `designed_for_direction` catalog properties
- The "Condition Matches" column in the Scanner table counts the number of strategies where both IV and direction conditions align with the current ticker
- Sorting is client-side; no new API calls are made when reordering the matrix
- Filtering (e.g. "Both conditions match") is client-side; no new API calls are made
- If the options chain is synthetic (`_synthetic: true`), a yellow banner appears above the matrix: "Trade data is synthetic — live options chain unavailable"
- For strategies where `build_trade()` returns an error, greeks and profit/loss cells display "—", but the Condition Fit indicators and explanation are always populated from the catalog
- All 31 `condition_explanation` strings are hardcoded in the backend's `strategy_engine.py` catalog (ADR-0008) and do not use AI generation

---

## What's next

**PRD-05 (Language Audit of Strategy Narrative)** is the next gated feature. That PRD audits the plain-English narrative text in the `StrategyNarrative` component for any remaining directive language (the spec notes that `_why_this_strategy()` contains a fallback phrase "ranks as the best-fit strategy" that needs to be rewritten). PRD-01 does not change the narrative; it only removes the ranking system and "AI Pick" banner.

**Gate 6 approval needed from operator and devops before production deployment.**

---

**Release prepared by:** Technical Writer (leonard.simgt@gmail.com)  
**Session link:** https://claude.ai/code/session_01LMgaXQdhnpdfAYmi5pS3aj

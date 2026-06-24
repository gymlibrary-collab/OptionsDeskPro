# Release Note — Interpreter v1 Narrative Improvements

**Release date:** 24Jun2026
**Branch:** `claude/modest-davinci-sxz7lv`
**Author:** Technical Writer + QA Engineer + Security Reviewer

---

## What changed

This release improves the AI-generated strategy narratives shown in the Deep Analysis view of the Strategy Scanner. Nine text-generation fixes ensure that users receive factually accurate, directionally correct, and properly formatted guidance for all 31 strategies.

**Specific improvements:**

- **DTE-aware calendar reminder (FR-B1):** The execution checklist no longer displays negative day counts for trades already inside 21 days to expiry. When DTE ≤ 21, the checklist emits "NOTE: this trade is already inside 21 DTE — apply the 21-DTE close rule immediately" instead of a nonsensical negative reminder.

- **Correct directional framing for debit trades (FR-B2):** Bearish debit strategies (long put vertical, put butterfly, put ZEBRA, put calendar, reverse big lizard) now show "downside exposure" in the headline. Bullish debit strategies (long call vertical, call butterfly, call ZEBRA, call calendar, big lizard) show "upside exposure". Previously all debit trades said "upside" regardless of direction.

- **Probability-of-profit conditional phrasing (FR-B3):** Strategies with POP < 50% (call butterfly, put butterfly, call broken-wing butterfly, put broken-wing butterfly) no longer claim "wins more often than it loses". The narrative now states "wins less often than it loses, but is sized so that winners more than offset losers in aggregate" — accurately reflecting the strategy's design.

- **Profit-target percentage accuracy (FR-B6):** The debit GTC step in the execution checklist now uses each strategy's actual `profit_target_pct` (25% for butterflies, 50% for verticals, etc.) instead of a hardcoded 50%. Users setting profit targets on call butterflies now see 25% as the target, matching the strategy's design.

- **Removed markdown artifacts (FR-B4/R2):** Risk labels in "Why This Strategy" now display as plain-text uppercase (`DEFINED-RISK` / `UNDEFINED-RISK`) instead of raw markdown (`**defined-risk**` / `**undefined-risk**`). Asterisks no longer appear in the UI.

- **Correct broker approval levels (FR-C6):** The execution checklist now states the correct options approval level required:
  - **Level 2 or higher** for defined-risk strategies (iron condor, short put/call vertical, covered call, long call/put vertical, etc.)
  - **Level 3 or higher (required for naked options)** for undefined-risk strategies that include naked short options (short naked put, short naked call, short strangle, short straddle, iron fly).
  Previously the checklist unconditionally stated Level 2 for all strategies, which would have caused broker rejection for users attempting to place short strangles without Level 3+ approval.

- **Earnings adjustment notice (FR-E1):** When the strategy engine adjusts the recommended expiry to avoid an earnings date, the "The Trade in Simple Terms" section now includes the earnings adjustment note (e.g. "EARNINGS-AWARE EXPIRY: We selected the 23-May expiry to close before earnings on 24-May").

- **IV environment category labeling (FR-G5):** The "Why Options Are Priced This Way" section now explicitly states the IV environment classification: "This places options in a [LOW / MEDIUM / HIGH] implied volatility environment" after showing the IV Rank percentile. Users no longer have to infer the category from a number.

- **Active management notice for short-dated trades (FR-C1):** The loss scenario monitor paragraph now branches on DTE. Trades already inside 21 DTE receive: "NOTE: this trade is already inside 21 DTE — treat it as in the final management phase; monitor P&L intraday and close as soon as profit target is reached." Trades outside 21 DTE receive the standard 21-DTE close reminder.

- **POP language correction (FR-C5):** The profit scenario section no longer implies empirical backtesting evidence. Replaced "Over a large sample of similar trades, this is a positive-expectancy strategy" with "Based on the theoretical probability implied by the delta of the short strikes, this is a positive-expectancy setup." This correctly attributes the POP figure to delta-based theoretical probability, not historical trade outcomes.

- **Execution checklist step label formatting (FR-R1):** LEG steps in the execution checklist now render with only the label bolded (e.g. "LEG 1:" in bold, with the rest of the step body in normal weight). Previously the entire preamble was bolded. The interpreter now emits `"LEG {i}: {verb}..."` format so the frontend's colon-based label extraction correctly identifies the label boundary.

---

## Why it changed

Precision in narrative output is critical because users on a paper-trading platform model their learning on the engine's recommendations. Misleading or factually wrong guidance (negative DTE counts, incorrect approval levels, backward directional framing, hardcoded profit targets that don't match strategy design) erodes trust and leads to support escalations or misguided trades. These fixes ensure the narrative is accurate, condition-aware, and properly formatted.

---

## Who it affects

| Tier | Available | Notes |
|------|-----------|-------|
| free | Yes | Narrative improvements apply to all authenticated users |
| starter | Yes | Narrative improvements apply to all authenticated users |
| pro | Yes | Narrative improvements apply to all authenticated users |
| enterprise | Yes | Narrative improvements apply to all authenticated users |

All changes are backend-only (interpreter.py service function + one small frontend rendering fix). No tier gates were introduced.

---

## Action required by users

None. The improvements are automatic. Existing narratives in the scanner will display correctly immediately upon this release. Users who re-run a scan or open a new Deep Analysis view will see the corrected output.

---

## Known limitations

This release fixes 11 of the 39 verified gaps documented in the feature spec. The remaining 27 items (Priority 3 polish and completeness improvements) are deferred to the v2 sprint and the backlog:

- Named branches for `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, `collar` (3 items)
- Defensive tactics for 9 additional strategies (call_butterfly, put_butterfly, short_naked_call, short_call_vertical, big_lizard, poor_mans_covered_call, call_calendar, put_calendar, broken-wing variants)
- Normal / moderate skew notes, flat term structure handling, earnings urgency branching
- Greeks summary in trade description, percentage move required in breakeven figures, post-earnings IV crush warning
- Margin notice for undefined-risk trades, long-leg risk qualification for undefined-risk
- And others — see section 3.5 of 01-spec.md for the full v2 backlog

---

## Deployment steps

1. No migrations required — this is a pure service-layer improvement with no schema changes.
2. No new environment variables.
3. Deploy backend service on Railway:
   - Push branch `claude/modest-davinci-sxz7lv` to `main`
   - Railway will auto-detect the push and redeploy `backend/services/interpreter.py`
   - **Timing:** Deploy during market-closed hours (after 4pm ET on a trading day, or anytime on weekends/holidays) to avoid showing incomplete narratives during live market hours.
4. Deploy frontend service on Railway (required for FR-R1 rendering fix):
   - The same branch push triggers frontend redeploy
   - Ensures `StrategyNarrative.tsx` correctly parses the new LEG label format
5. Verify with health check:
   - **Backend:** Open the app, go to Strategy Scanner, click Analyze on any symbol, and verify the Deep Analysis view displays without errors
   - **Smoke test:** Verify these specific items:
     - A debit trade (long call vertical) shows "upside exposure" in the headline
     - A short strangle shows "level 3 or higher (required for naked options)" in the execution checklist
     - The IV environment section states "LOW / MEDIUM / HIGH implied volatility environment"
     - A short-dated position (DTE ≤ 21) shows "already inside 21 DTE" language, not a negative day count

---

## Rollback procedure

1. Revert to the previous Railway backend deployment:
   - In Railway console, go to backend service
   - Click "Deployments" and select the previous successful deployment
   - Click "Redeploy"
   
2. Revert to the previous Railway frontend deployment (if the 24Jun2026 frontend deploy was made):
   - In Railway console, go to frontend service
   - Click "Deployments" and select the previous successful deployment
   - Click "Redeploy"

3. Verify rollback:
   - Open the app and run a new scan
   - Debit trades should again show "upside exposure" regardless of direction
   - Execution checklist should unconditionally state "level 2 or higher" (the old incorrect text)
   - Risk labels should again contain `**` markdown characters

---

## Post-deployment monitoring

- **Error rate:** Watch Railway logs for any 5xx errors on the `/api/strategies/analyze` endpoint (which calls the interpreter). Should remain at baseline (0–1 errors per 10k calls).
- **Performance:** Interpreter performance is unchanged — the improvements are text-conditional branching only, no new API calls or heavy computation.
- **User feedback:** The first 24 hours may surface any edge-case narratives that still need polish. Monitor support tickets for narrative-related issues.
- **Test coverage:** 24 Playwright automated tests pass in CI; full suite regression shows 315 tests passing, 0 regressions.

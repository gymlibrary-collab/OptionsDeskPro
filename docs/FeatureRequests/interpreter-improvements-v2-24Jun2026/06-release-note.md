# Release Note — Interpreter Narrative Improvements v2

**Release date:** 25Jun2026
**Version / PR / Branch:** `claude/modest-davinci-sxz7lv` (commit `6043fc7` + `d2fd935`)
**Author:** Technical Writer + DevOps Engineer

---

## What changed

Ten improvements to `backend/services/interpreter.py` narrative generation. All improvements affect the plain-English strategy narrative rendered in the deep analysis view (Strategy Comparison Matrix > select strategy > expand card).

### By section:

**Market Snapshot**
- **FR-B5:** Eliminated malformed sentence "0.0% below its $0.00 moving average." When both SMA20 and SMA50 are unavailable (0), narrative now shows "Moving average data unavailable for [symbol]" instead of attempting a meaningless percentage calculation.
- **FR-G11:** Earnings alerts now use urgency branching: days_until_earnings ≤ 3 triggers "EARNINGS IMMINENT" header with "today or tomorrow" / "within the next N days" language. Days 4–30 trigger standard "EARNINGS ALERT" header. Eliminates broken "approximately 0 days" text on earnings day.

**IV Context**
- **FR-D6:** When 30-day historical volatility is unavailable (hv_30 == 0), IV Context now includes explicit notice: "30-day historical volatility data is unavailable for this symbol — the IV vs HV comparison cannot be shown." Prevents silent omission that led users to assume HV comparison was evaluated but not shown.
- **FR-C7:** When hv_30 == 0 in the IV Rank headline, the HV clause is omitted entirely. Prevents headline reading "45.2% IV vs 0.0% HV" (misleading, as 0 means no data, not zero volatility).

**Trade Execution (The Trade in Simple Terms)**
- **FR-C2:** Undefined-risk positions (short naked puts, short naked calls, short strangles, etc.) now include margin notice: "MARGIN NOTICE: undefined-risk positions require margin reserved in your broker account. As a rule of thumb, expect 20–25% of the notional value of the short strike(s) to be held as buying power." Includes worked example showing margin consumed (e.g., "$3,000–$3,750 per contract" for a short put on a $150 strike).
- **FR-C3:** Long-leg risk text now branches on risk_type. For DEFINED-risk trades, text reads "This leg defines and caps your maximum risk on the trade." For UNDEFINED-risk trades with a long leg, text reads "This long leg partially offsets your short obligation but does not fully cap the overall position risk — the trade remains undefined-risk overall."

**Loss Scenario**
- **FR-G8:** Short-position loss language now branches by option type. Short calls: "In theory, a short call carries unlimited loss potential — if [symbol] rises without limit, so does your loss." Short puts: "Your worst-case loss is not unlimited: because a stock cannot fall below zero, a short put's maximum possible loss is approximately $[strike × 100] per contract (the $[strike] strike × 100 shares, if the stock fell to zero)." Defined-risk positions continue to use capped-loss framing unchanged.

**Defensive Tactic**
- **FR-G3:** Five previously generic strategies now show strategy-specific adjustment guidance (named branches for `call_butterfly`, `put_butterfly`, `short_naked_call`, `call_calendar`, `put_calendar`). Example: call_butterfly shows "If the position breaches the body strike...pin risk emerges if the underlying stays in that narrow zone near expiry." Examples, roll mechanics, and close thresholds are now tailored to each strategy's mechanics rather than "Monitor daily; consider rolling if threatened."

**Why This Strategy**
- **FR-G1:** Five previously generic strategies now show strategy-specific narrative justification (named branches for `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, `collar`). Example: call_zebra explains "Zero-Extrinsic-value Back-Ratio Acquisition — leveraged directional structure that gains approximately $2 for every $1 [symbol] rises" rather than defaulting to generic "structured to perform in a [IV_word] IV environment."
- **FR-E3:** When trade-specific probability-of-profit is computed (pop_estimate), narrative now uses it in place of catalog range. Shows "62% theoretical probability" (from actual leg deltas) instead of "60–80% probability of profit" (from strategy catalog). Applies to both "Why This Strategy" section (POP confidence text) and "Profit Scenario" section (early-exit guidance).

---

## Why it changed

**Data integrity:** FR-D6, FR-C7, and FR-B5 fix silent omissions and malformed sentences that misled users about data availability.

**Accuracy:** FR-G8 corrects a material understatement of short-call risk and introduces proper terminology (finite vs unlimited).

**Usability:** FR-C2 prevents the beginner scenario where a user places a short position and discovers large margin consumption with no prior warning.

**Clarity:** FR-G3 and FR-G1 replace generic fallback text with strategy-specific language for high-frequency strategies that are frequently misunderstood (ZEBRA leverage, butterfly pin risk, calendar roll mechanics).

**Precision:** FR-E3 uses computed data when available instead of reverting to a generic range.

---

## Who it affects

| Tier | Available | Notes |
|------|-----------|-------|
| free | Yes | All narrative improvements apply. No feature gate. |
| starter | Yes | All narrative improvements apply. No feature gate. |
| pro | Yes | All narrative improvements apply. No feature gate. |
| enterprise | Yes | All narrative improvements apply. No feature gate. |

The narrative engine serves all tiers identically. No new tier gate introduced.

---

## Action required by users

None. The narrative changes are transparent to the user — they appear automatically when viewing strategy details in the deep analysis flow (Scanner > Analyze > expand strategy card).

Users trading the five newly detailed strategies (call_zebra, put_zebra, call_butterfly, put_butterfly, call_calendar, put_calendar, short_naked_call, collar) will see richer adjustment guidance and clearer strategy justification. No user configuration needed.

---

## Known limitations

### collar strategy key is dormant

The `elif key in ("collar",)` branch in `_why_this_strategy()` was added defensively (FR-G1 scope). The `collar` key does not exist in `strategy_engine.py`'s 31-strategy catalog. The branch will never execute against the current engine. If collar is added to the catalog in future sprints, this branch will be live without code changes.

### 19 P2/P3 items deferred to v3

The BA spec identified 32 total improvements. v2 implements 10 P1 items. The remaining 22 items (5 moved to P2 by PO review, 17 additional P2/P3 items) are deferred to v3. These include:

**P2 (5 items):** FR-G4 (normal-skew note), FR-G6 (neutral strategy "range-bound" headline), FR-G9 (flat term structure), FR-G10 (covered-call below-average premium label), FR-G2 (MODERATE vs WEAK strength distinction).

**P2 continuation (4 items):** FR-G3 and FR-G1 extension — remaining missing defensive tactic and why-this-strategy keys (`short_call_vertical`, `big_lizard`, `poor_mans_covered_call`, broken-wing butterfly variants).

**P2/P3 (13 items):** FR-D4, FR-D5, FR-D7, FR-D8, FR-D1, FR-M1, FR-M2, FR-M3, FR-R3, FR-N1, FR-N3, FR-N5, FR-E2, FR-E4, FR-N8, FR-N9.

---

## Deployment steps

1. No database migrations required. All changes are to narrative generation logic only.
2. No new environment variables required.
3. Set `GIT_COMMIT` = `6043fc7` + `d2fd935` (or use Railway's automatic commit tracking).
4. Deploy backend service on Railway:
   - Service: `interpreter-improvements-v2-24Jun2026`
   - Deploy `claude/modest-davinci-sxz7lv` branch
   - Confirm new deployment is live
5. Deploy frontend service on Railway (no code changes, but re-deploy to bust any narrative caching):
   - Confirm frontend at `https://optionsdeskpro.com` loads
6. Verify with smoke test:
   - Sign in to dashboard (any tier)
   - Navigate to Strategy Scanner
   - Click **Analyze** on any symbol with earnings within 3 days (e.g., TSLA, NVDA)
   - Verify Market Snapshot shows "EARNINGS IMMINENT" header (not "EARNINGS ALERT")
   - Click on a call_butterfly or short naked call strategy card
   - Expand the strategy card
   - Verify:
     - For short naked call: Loss Scenario contains "theoretically unlimited" loss language
     - For call_butterfly: Defensive Tactic shows butterfly-specific pin-risk and body-strike language
     - For any strategy: No "$0.00" moving average figures in Market Snapshot
     - For any strategy with zero HV: IV Context explicitly says "historical volatility data is unavailable"

---

## Rollback procedure

1. Revert to previous Railway deployment:
   - Backend: Deploy previous successful commit (likely `c1bd38a` or earlier stable state)
   - Frontend: Deploy previous successful commit
   - Both services auto-rollback narrative generation to v1 logic
2. No database migration reversal required (no schema changes).
3. Verify rollback:
   - Sign in, navigate to Strategy Scanner, click Analyze on the same test symbol
   - Verify Market Snapshot shows old generic text (may include "$0.00 SMA" if testing zero-SMA ticker; may show "approximately 0 days" if testing earnings day)
   - Verify Loss Scenario for short call shows generic undefined-risk text without "unlimited" framing

---

## Post-deployment monitoring

Monitor for the first 24 hours:

- **Error rate:** Watch `backend` logs in Railway for any exceptions in `interpreter.py` `generate_narrative()` or dependent functions. Should remain at baseline (no new 5xx errors).
- **Narrative rendering:** Check `frontend` error logs for any narrative-related console errors (Sentry or Railway frontend logs). The narrative is injected as plain text into React components — no XSS risk, but verify no render errors on narrative text injection.
- **User activity:** Verify that users are viewing strategy details (Strategy Scanner > Analyze clicks) without hitting errors. Monitor `strategy_analyze` endpoint logs in Railway metrics.
- **No API changes:** The `generate_narrative()` function signature is backward-compatible (optional `trade` kwarg added, with default None). No client-side code changes were made. Verify no 400/422 errors on `/api/strategies/analyze/{symbol}` endpoint from unexpected response shapes.

No quota concerns (narrative generation is CPU-bound, not API-quota-bound).

---

## Test results

**Playwright E2E suite:** 28 new tests, 28 pass. 24 existing v1 tests, 24 pass. Total 52 passing tests.

Tests cover:
- All 10 P1 FRs with positive and negative cases
- Mobile viewport regression (390×844)
- Narrative accordion rendering for all section types

See `docs/FeatureRequests/interpreter-improvements-v2-24Jun2026/04-test-report.md` for full coverage details.

---

## Gate 5 security review status

Security review in progress (Gate 5). No Critical or High findings anticipated (narrative is plain-text output, no SQL injection or auth bypass vectors). Expected approval before production merge.

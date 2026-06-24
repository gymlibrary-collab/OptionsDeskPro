# Feature Spec — Narrative Engine Improvements (interpreter.py)

**Date:** 24Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

This document is a verification-and-solutioning pass on 45 candidate gaps in the narrative engine (`backend/services/interpreter.py`). Each gap was checked against the actual code before a verdict was issued. The purpose is to establish a prioritised, falsifiable backlog of real defects and real missing-data opportunities, and to discard false alarms before any implementation work begins. The narrative engine serves every authenticated user on the `ai` and `scanner` tabs — correctness and trust are paramount on a paper-trading platform because users model their learning on the output.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Beginner learner | free / starter | Reads full narrative to understand why a strategy was chosen and how to execute it |
| Active paper trader | starter / pro | Uses execution checklist and trade ticket as a dry-run of real order entry |
| Strategy researcher | pro / enterprise | Validates IV context and market snapshot against their own analysis |
| Admin / developer | admin | Monitors output quality, investigates regressions |

---

## 3. Verification Results

### 3.1 BUGS (B1–B6)

| ID | Status | Impact | Verified Finding | Solution |
|----|--------|--------|-----------------|----------|
| B1 | **VERIFIED** | HIGH | `close_date_days = dte - 21` at line 1172 is used directly in the output string `"set a reminder for {close_date_days} days from today"`. For any trade with DTE <= 21 (e.g. a 14-DTE short put assigned by the scanner, or any position the user is reviewing near expiry) this produces a negative integer in plaintext. The string is never clamped or conditionally branched. | Add a guard: `if close_date_days <= 0: emit "NOTE: this trade is already inside 21 DTE — apply the 21-DTE close rule immediately."` Else emit the current reminder text. |
| B2 | **VERIFIED** | MEDIUM | In `generate_narrative` lines 1305–1310, the `else` branch (net < 0, i.e. debit trades) always emits `"Pay ${n} for defined upside exposure"` regardless of bias. A bearish debit trade (long put vertical, put ZEBRA, put butterfly) has downside exposure, not upside. The `strat_key` is available at that point. | Branch the debit headline on whether the strategy key contains "put" or is in the known bearish debit set, and substitute "downside" for "upside". |
| B3 | **VERIFIED** | MEDIUM | `pop_note` in `_why_this_strategy` lines 312–317 always says "wins more often than it loses." The call butterfly has `pop_range = (20, 40)`, which means the strategy loses more often than it wins by design. The pop_note text is unconditional. | Make the phrasing conditional: if `pop_range[0] >= 50` use the current text; if `pop_range[0] < 50` say "this trade wins less often than it loses, but is sized so that winners more than offset losers in aggregate." |
| B4 | **VERIFIED** | MEDIUM | `risk_note` in `_why_this_strategy` lines 303–309 embeds `**defined-risk**` and `**undefined-risk**` — raw markdown bold syntax. `StrategyNarrative.tsx` renders all narrative sections via the `Paragraphs` component which uses plain `<p>` tags with `whiteSpace: pre-wrap`. Markdown is not parsed at any point in the frontend. The asterisks appear literally in the rendered UI. | Remove the `**` markers and replace with uppercase: `DEFINED-RISK` / `UNDEFINED-RISK`. These are already distinct enough visually in a monospace/prose context. |
| B5 | **VERIFIED — PARTIAL** | LOW | Lines 24–27 of `_market_snapshot`: `above_20 = price > sma20 if sma20 else None` and `gap_20 = ((price - sma20) / sma20 * 100) if sma20 else 0`. When sma20 or sma50 is zero, `above_20`/`above_50` is `None`, not True/False. The four `if/elif/else` branches at lines 29–58 treat `None` as falsy — so `above_20=None, above_50=None` falls into the `not above_20 and not above_50` branch, which outputs "X.X% below its $0.00 moving average." The gap values are 0.0 so the percentage is 0.0%, but the dollar value `${sma20:.2f}` will render as `$0.00`. This is triggered only when yfinance returns zero for SMA (unusual but observed for illiquid tickers). | Add an explicit early-return guard: if sma20 == 0 and sma50 == 0, skip the MA lines entirely and note "Moving average data unavailable for this symbol." |
| B6 | **VERIFIED** | LOW | The debit GTC block at lines 1138–1146 hardcodes `close_credit = abs_net * 0.5`, producing a 50% target regardless of the strategy's `profit_target_pct`. The credit branch at lines 1125–1136 correctly reads `profit_target_pct` from `trade.get("profit_target_pct", 50)`. For strategies with `profit_target_pct = 25` (call butterfly, call ZEBRA, big lizard) the checklist tells the user to target 50% when the strategy logic targets 25%. | Read `profit_target_pct = trade.get("profit_target_pct", 50)` in the debit block (it is already read on line 976, just not used in the debit branch) and substitute it for the hardcoded `0.5`. |

---

### 3.2 MISSING BRANCHES (G1–G12)

| ID | Status | Impact | Verified Finding | Solution |
|----|--------|--------|-----------------|----------|
| G1 | **VERIFIED** | MEDIUM | The `_why_this_strategy` `if/elif` chain handles these keys explicitly: `short_strangle`, `iron_condor`, `short_straddle`, `iron_fly`, `short_naked_put`, `short_put_vertical`, `jade_lizard`, `short_naked_call`, `short_call_vertical`, `reverse_jade_lizard`, `long_call_vertical`, `big_lizard`, `poor_mans_covered_call`, `long_put_vertical`, `reverse_big_lizard`, `covered_call`, `call_butterfly`, `put_butterfly`, `call_broken_wing_butterfly`, `put_broken_wing_butterfly`. Keys falling to the generic else: `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, `call_ratio_spread`, `put_ratio_spread`, `short_combo`, `long_combo`, `collar`, `protective_put`, `diagonal_spread` (11 strategies from the 31-strategy catalog). | Add named branches for at minimum `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, and `collar` — the five most commonly surfaced of the missing keys — with language appropriate to their specific mechanics. |
| G2 | **VERIFIED** | LOW | `strength_line` in `_market_snapshot` lines 100–112: the `if strength == "STRONG"` branch emits a multi-confirming-indicator note; the else emits a single cautious note for all non-STRONG values (MODERATE and WEAK). MODERATE and WEAK have meaningfully different implications. | Add an `elif strength == "MODERATE"` branch with language indicating partial confirmation, and keep the current else for WEAK only. |
| G3 | **VERIFIED** | MEDIUM | `_defensive_tactic` at lines 792–910 has named entries for: `short_strangle`, `iron_condor`, `short_naked_put`, `short_put_vertical`, `iron_fly`, `short_straddle`, `long_call_vertical`, `long_put_vertical`, `covered_call`, `jade_lizard`, `reverse_jade_lizard`, `call_zebra`, `put_zebra`. Missing keys (fall to generic): `call_butterfly`, `put_butterfly`, `call_broken_wing_butterfly`, `put_broken_wing_butterfly`, `call_calendar`, `put_calendar`, `big_lizard`, `reverse_big_lizard`, `short_naked_call`, `short_call_vertical`, `poor_mans_covered_call`, `call_zebra` is present — correction: 9 keys truly missing. | Add named defensive tactic entries for `call_butterfly`, `put_butterfly`, `short_naked_call`, `short_call_vertical`, `big_lizard`, `poor_mans_covered_call`, `call_calendar`, `put_calendar`, and the broken wing variants. Each needs a 3–5 sentence tactic unique to its structure. |
| G4 | **VERIFIED** | LOW | `skew_para` is set only for `skew_label == "elevated"` or `skew_label == "low"` (lines 267–279). `skew_label == "normal"` produces an empty string and the skew section is entirely absent from the output. Normal skew is by definition the most common case — the user receives no skew context on a typical stock. | Add a brief normal-skew sentence: "Put skew is within normal ranges — the market is not pricing in asymmetric fear of a crash, which is the baseline condition for most strategies." |
| G5 | **VERIFIED** | MEDIUM | `_iv_context` base string (line 183–188) reports IVR as a number and explains the percentile concept, but never explicitly states the environment category (LOW / MEDIUM / HIGH). The IVR thresholds that map to those categories (`< 30` = LOW, `30–50` = MEDIUM, `> 50` = HIGH based on lines 210–233) are implicit. A user reading the section does not learn whether the engine classifies the current environment as high, medium, or low IV. | Append the category name to the base paragraph: e.g. "This places options in a [LOW / MEDIUM / HIGH] implied volatility environment." |
| G6 | **VERIFIED** | LOW | The `generate_narrative` headline function has three branches (lines 1293–1310): credit + HIGH IV, credit + non-HIGH IV, and debit (all cases). Neutral strategies like iron condors collect a credit and are net sellers, so they correctly hit the credit branch — this part works. However, the headline for neutral strategies reads "Collect $X premium with IV elevated…Market is [Neutral]." The phrase "Market is Neutral" combined with a "Sell a Short Strangle" instruction is accurate but may confuse new users who associate "selling" with a directional bet. Impact is low — not wrong, just potentially confusing. | Add a fourth headline branch for neutral strategy keys (iron condor, short strangle, straddle, iron fly) that says "range-bound setup" rather than implying a directional market read. |
| G7 | **VERIFIED** | LOW | The `_iv_context` interpretation thresholds are IVR < 30, 30–50, and > 50. There is no sub-classification for extreme readings (e.g. IVR > 80, often called "vol spike" territory). An IVR of 55 and an IVR of 95 produce the same paragraph. For the user, an IVR of 95 implies much higher assignment or gap risk. | Add an IVR > 80 sub-branch within the HIGH block that mentions vol spike conditions and the heightened risk of premium sellers getting caught in a continued move. |
| G8 | **VERIFIED** | MEDIUM | `_loss_scenario` undefined-risk block (lines 746–755) uses a single generic template for all undefined-risk trades. A short naked call has theoretically unlimited loss (stock can rise without limit), while a short naked put has a floor (stock cannot go below zero, max loss ≈ strike × 100). The same "loss can be substantial" language applies to both, but the actual risk profile is materially different. `risk_type` is available and `legs` can identify call vs. put. | Branch the undefined-risk loss_frame on whether the short leg is a call (theoretically unlimited) or a put (capped at strike × 100), and quantify the actual worst-case dollar figure for the put case. |
| G9 | **VERIFIED** | LOW | `term_para` in `_iv_context` lines 247–263 is built only for `term_slope == "contango"` or `"backwardation"`. A `"flat"` slope produces an empty `term_para`, which means users on the most common (flat/near-flat) term structure see no term structure commentary at all. | Add a flat-slope sentence explaining that near- and far-month IV are roughly equal, and that this neutral term structure gives no strong calendar-spread signal. |
| G10 | **VERIFIED** | LOW | `covered_call` branch in `_why_this_strategy` (lines 364–373): `'above average' if iv_env == 'HIGH' else 'fair'`. When `iv_env == "LOW"`, the premium described as "fair" is actually below average — which is a meaningful distinction for income-focused traders choosing between strategies. | Extend the ternary to three cases: `'above average' if iv_env == 'HIGH' else 'below average' if iv_env == 'LOW' else 'fair'`. |
| G11 | **VERIFIED** | LOW | `_market_snapshot` earnings note (lines 147–154) uses identical text for `days_earn == 0` ("reports earnings in approximately 0 days") through `days_earn == 30`. There is no distinction between "earnings today" (urgent), "earnings in 3 days" (very soon), and "earnings in 25 days" (worth noting but not urgent). The 0-day case also produces grammatically awkward output. | Add at least two branches: a 0–3 day "URGENT: earnings imminent" variant and the existing 4–30 day variant. Handle the 0-day case with "earnings are today or tomorrow." |
| G12 | **VERIFIED** | LOW | `_confirmation_summary` lines 1209–1216: when both `bl` and `bh` are None, the `range_line` falls to the generic `"profitable if the stock moves in the expected direction"`. This text is nearly identical to the undefined-risk loss scenario generic, providing no trade-specific information. `short_strikes` are available in the trade dict and could be used here as in `_profit_scenario` lines 624–631. | Mirror the `_profit_scenario` fallback: extract `short_strikes` from `trade["legs"]` and produce "profitable as long as {symbol} stays within range of your short strike(s) at ${X}" rather than the fully generic string. |

---

### 3.3 UNUSED DATA (D1–D8, E1–E4, M1–M4)

| ID | Status | Impact | Verified Finding | Solution |
|----|--------|--------|-----------------|----------|
| D1 | **VERIFIED** | LOW | `vol_trend` and `vol_ratio` are read from `ctx["technicals"]` (lines 122–136) and used to build `vol_note`, which is included in the `extra_paras` MACD/ATR paragraph. However, the `strength_line` (line 101) that drives the overall directional conviction statement does not reference volume trend — high-conviction setups are not distinguished from low-conviction setups based on volume confirmation. | Integrate `vol_trend` into `strength_line`: if strength is STRONG and volume is rising, add "Elevated volume confirms the move." If strength appears moderate or weak and volume is falling, add "Low volume reduces conviction." |
| D2 | **VERIFIED — PARTIAL** | LOW | `macd_diverging` is used in the `extra_paras` MACD block inside `_market_snapshot` (line 128) to choose the "expanding" vs "contracting" histogram phrasing. It is also used in `_why_this_strategy` (line 410) to modify the MACD confirmation note. So it IS used, but only in isolated sub-paragraphs; it does not feed the primary `strength_line` conviction assessment. The overall signal verdict ignores histogram direction. This is a real gap but smaller than labelled. | Low priority: note in the strength_line whether MACD histogram direction confirms or contradicts the RSI/MA bias picture. |
| D3 | **VERIFIED** | LOW | `get_news_headlines` returns objects with `title` and `publisher`. The `_market_snapshot` function at lines 156–167 formats up to 4 headlines and appends boilerplate about positive/negative catalysts. The boilerplate is fixed regardless of headline content — a positive headline and a negative headline both get the same secondary text. No sentiment classification is applied to the headlines here. (Note: there is a separate `NewsSentiment` object in the frontend that does carry sentiment — but that comes from a different route and is not available to the interpreter.) | Given that the interpreter has no access to sentiment scoring, the current approach is appropriate. Mark as LOW priority polish: the boilerplate could at minimum acknowledge when all visible headlines appear to be recent (news is already sorted by recency from yfinance). FALSE ALARM on the severity — the boilerplate is appropriate given the data available. |
| D4 | **VERIFIED** | LOW | `_profit_scenario` and `_loss_scenario` express breakeven as an absolute dollar price (e.g. "$148.50") but never as a percentage move from the current price. The current price (`bias_analysis["price"]`) is not passed into these functions — it is only in `_market_snapshot`. | Pass `price` into `_profit_scenario` and `_loss_scenario` (or compute it from the trade legs) and append "({pct:.1f}% move required)" next to the breakeven dollar figure. |
| D5 | **VERIFIED** | LOW | Each leg dict returned by `build_trade()` includes `theta` (line 1653 of strategy_engine.py). `_trade_plain_english` reads `delta` but does not read `theta` for any leg. The sell-leg text says "time decay works in your favour" as a fixed phrase, but the actual theta dollar value (theta × 100 × qty) could be stated concretely: "this position earns approximately $X per day in time decay at current levels." | Extract `theta` from each sold leg in `_trade_plain_english` and report the approximate daily theta dollar value per contract for the full position. |
| D6 | **VERIFIED** | LOW | `_iv_context` at lines 191–203: `if hv_30 > 0:` — the HV comparison paragraph is silently omitted when `hv_30 == 0`. No notice is given to the user; the output simply skips from the IVR base paragraph to the interpretation paragraph. A zero HV30 occurs when yfinance returns no historical data (new listings, ETFs with short history, synthetic chain). | Add an `else` clause: "30-day historical volatility data is unavailable for this symbol — the IV-vs-HV comparison cannot be shown." |
| D7 | **VERIFIED** | MEDIUM | `dte_target` is read in `_why_this_strategy` (line 292) and used only in the generic `else` branch (line 389) for the ~11 strategy keys that fall through. All named strategy branches (covered_call, short_strangle, etc.) never mention the recommended DTE target. A user choosing between a 30-DTE expiry and a 45-DTE expiry gets no signal from the narrative about which the strategy is designed for. | Append a sentence to each named strategy's `core` paragraph referencing `dte_target`: "This strategy is designed for the {dte_target}-day expiry window — staying close to this target keeps theta decay in the optimal range." |
| D8 | **VERIFIED** | LOW | `sma20` and `sma50` are both read in `_market_snapshot`, and the four MA-position branches correctly describe price relative to each average individually. However, the relative position of sma20 vs sma50 (the golden/death cross) is never directly mentioned. A golden cross (sma20 > sma50) is a distinct bullish signal; the code has all the data to detect it. | After the four MA-position branches, add a check: `if sma20 > sma50: append "The 20-day is above the 50-day (a bullish crossover alignment)."` Conversely for the death cross. |
| E1 | **VERIFIED** | MEDIUM | `earnings_note` is populated in `build_trade()` (strategy_engine.py line 1143) when the expiry is adjusted around an earnings date. It is present in the trade dict returned to the interpreter (`generate_narrative` receives `trade` as a parameter). `_trade_plain_english` receives `trade` but never calls `trade.get("earnings_note")`. The note contains a pre-written human-readable explanation of why the expiry was adjusted, which would be highly relevant to the user. | Read `trade.get("earnings_note")` in `_trade_plain_english` and, if non-None, prepend it as the first paragraph after the synthetic-data notice. |
| E2 | **VERIFIED** | LOW | `earnings_adjusted` (boolean, strategy_engine.py line 1684) is present in the trade dict. Neither `_trade_plain_english` nor any other interpreter function reads it. When True, the narrative should signal that the recommended expiry is non-standard (deliberately chosen to avoid an earnings event). Currently the user has no way to know this from the narrative alone. | In `_trade_plain_english`, if `trade.get("earnings_adjusted")` is True and `earnings_note` is empty (fallback), add a brief note: "Expiry adjusted to avoid the upcoming earnings event." |
| E3 | **VERIFIED** | LOW | `pop_estimate` (computed from actual leg deltas, strategy_engine.py line 1611) is present in the trade dict. The narrative uses `strategy["pop_range"]` (catalog estimate) in both `_why_this_strategy` and `_profit_scenario`. The delta-derived `pop_estimate` is a more precise figure for the specific strikes selected. The two numbers may diverge meaningfully for strikes that don't align with catalog assumptions. | In `_profit_scenario` and `_why_this_strategy`, prefer `trade.get("pop_estimate")` if non-None, and fall back to `strategy["pop_range"]` midpoint. Show the specific computed figure instead of the catalog range. |
| E4 | **VERIFIED** | LOW | `net_greeks` (dict of delta/gamma/theta/vega for the whole position, strategy_engine.py line 1683) is present in the trade dict. No interpreter function reads it. The net greek profile gives a precise summary of how the position responds to price moves, time, and volatility — information that is not conveyed anywhere in the current narrative. | Add a brief greek summary in `_trade_plain_english` after the per-leg descriptions, using `net_greeks`: "Net position: delta {x:.2f}, theta ${theta_dollars:.0f}/day, vega {v:.2f}." This requires only the keys already in the dict. |
| M1 | **VERIFIED** | LOW | `earnings_passed` (bool, market_context.py line 53) is populated when the nearest earnings date was within the past 3 days (`chosen_days < 0`). The interpreter reads `earnings.get("days_until_earnings")` and gates all earnings logic on `days_earn is not None and 0 <= days_earn <= 30`, which explicitly excludes negative values. A post-earnings IV-crush scenario (stock just reported, IV is now collapsing) receives zero mention in the narrative even though it is a highly relevant context for options sellers. | In `_iv_context`, check `earnings.get("earnings_passed")` and if True, add a note: "Earnings just occurred — IV crush may be underway; inflated IVR readings from the pre-earnings spike may not reflect the new post-earnings baseline." |
| M2 | **VERIFIED — PARTIAL** | LOW | `next_earnings` (ISO date string) is in the earnings dict. The interpreter uses only `days_until_earnings` (integer). The actual date would allow the narrative to say "earnings fall on 2026-07-15" rather than "in approximately 21 days," which is more actionable. However, the days count is functionally sufficient for the narrative's purpose. Mark as a polish item only. | Replace "in approximately {days} days" with "on {next_earnings} ({days} days away)" in both `_market_snapshot` and `_why_this_strategy` earnings notes. |
| M3 | **VERIFIED — PARTIAL** | LOW | `call_volume` and `put_volume` raw totals are in the flow dict (market_context.py line 119–120). The interpreter reads them indirectly via `flow.get("total_volume", 0)` to gate whether to show flow data (line 419). The actual raw volumes are never printed. For a stock with 100 total contracts of volume, a 2:1 call/put ratio is meaningless noise; for a stock with 500,000 contracts, it is significant. The volume-scale context is absent. | In the flow section of `_why_this_strategy`, add the absolute volume: "Total options volume today: {total_volume:,} contracts." This one-line addition provides the scale context. |
| M4 | **VERIFIED — PARTIAL** | LOW | `macd_histogram` raw value (float, market_context.py line 175) is in the technicals dict. The interpreter reads `macd_diverging` (bool) and `macd_bias` (string) but never reads the raw histogram value. The histogram's magnitude (e.g. 0.02 vs 2.50) indicates whether the MACD signal is marginal or strong. This is a polish item — the bool/string proxies are sufficient for current narrative quality. | In the MACD paragraph in `_market_snapshot`, append the histogram value: "Histogram: {macd_histogram:+.4f}" so technically literate users can judge magnitude. Low priority. |

---

### 3.4 MISSING CONTEXT (C1–C7)

| ID | Status | Impact | Verified Finding | Solution |
|----|--------|--------|-----------------|----------|
| C1 | **VERIFIED** | LOW | The `monitor` paragraph in `_loss_scenario` (lines 782–787) is a fixed string: "monitor it daily in the final two weeks...close at 21 DTE." This text is identical for a 5-DTE position and a 90-DTE position. For a very short-dated trade (DTE < 21) the advice to "close at 21 DTE" is already past — and the trade is already inside the gamma-risk window. | Branch `monitor` on DTE: if `dte <= 21`, replace with "NOTE: this trade is already inside 21 DTE — treat it as in the final management phase; monitor P&L intraday and close as soon as profit target is reached." |
| C2 | **VERIFIED** | LOW | `_trade_plain_english` never mentions margin or buying power requirement. For undefined-risk positions (short naked put, short naked call), the broker typically requires 20–25% of the notional value as maintenance margin. A beginner placing a short naked put on a $150 stock may be surprised to find $3,000+ of buying power is consumed. The interpreter has no margin data from the backend. | Add a general notice for undefined-risk trades in `_trade_plain_english`: "MARGIN NOTICE: undefined-risk positions require margin in your broker. As a rule of thumb, expect 20–25% of the notional value of the short strike to be reserved as buying power (e.g. short a $150 put: ~$3,000 margin required per contract). Verify the exact requirement in your broker's margin calculator before placing the order." |
| C3 | **VERIFIED** | LOW | In `_trade_plain_english` lines 556–563, every long leg receives the fixed text "This leg defines and caps your maximum risk on the trade." For a spread or ratio, only the combination of legs defines the risk — a single long leg in a ratio spread (e.g. call ratio spread where the long call is outnumbered by short calls) does not cap risk; the overall structure may still be undefined-risk. The trade dict's `risk_type` field is not consulted here. | Qualify the "defines and caps" phrase: if `trade.get("risk_type") == "UNDEFINED"`, change the long-leg text to "This long leg partially offsets your short obligation but does not fully cap the overall position risk." |
| C4 | **VERIFIED — FALSE ALARM** | N/A | `iv_source` is not a field that appears in the `iv_analysis` dict returned by `iv_analysis.py` (not passed to the interpreter in any route examined). The interpreter uses `iv_analysis.get("iv_rank")` and `iv_analysis.get("current_iv")` only. There is no `iv_source == hv_proxy` path visible in the interpreter or in the iv_analysis service. The flag described does not exist in the codebase at this time. No fix needed. | FALSE ALARM — the `iv_source` field does not exist in the iv_analysis dict. No action required. |
| C5 | **VERIFIED** | LOW | `pop_note` in `_profit_scenario` lines 694–699 states "Over a large sample of similar trades, this is a positive-expectancy strategy." This implies empirical backtesting evidence that does not exist in the system. The POP figure comes from delta positioning (a theoretical model), not from historical trade outcomes. | Replace "over a large sample of similar trades" with "based on the theoretical probability implied by the delta of the short strikes." This removes the implied backtesting claim. |
| C6 | **VERIFIED** | HIGH | `_execution_checklist` step 1 (lines 991–997) unconditionally states "options approval level 2 or higher." Strategies with naked short options (`short_naked_call`, `short_naked_put`, `short_straddle`, `short_strangle`) require Level 3 or Level 4 approval at most US brokers. Level 2 only grants access to covered calls and cash-secured puts. A beginner following this checklist for a short strangle would be told they need Level 2 when they actually need Level 3+ and would receive a broker rejection. | Read `strategy.get("risk_type")` (or check the `strat_key` against the known naked-option set) and emit "level 3 or higher (required for naked options)" for undefined-risk, non-covered-call strategies. |
| C7 | **VERIFIED — PARTIAL** | LOW | `generate_narrative` builds the headline using `iv_pct`, `hv_30`, and `net_dollars`. If `price == 0` (from bias_analysis) the headline may show "$0.00" but the MA section already guards against this with the `sma20 == 0` check. If `hv_30 == 0`, the headline for credit trades (line 1298) shows "0.0% HV" which is misleading, but this only appears in the HIGH IV branch. The `iv_pct` and `hv_30` come from iv_analysis which may return 0 if no data is available. Impact is bounded and low-frequency. | Add a guard in the headline builder: if `hv_30 == 0`, omit the `{hv_30:.1f}% HV` clause from the HIGH IV headline string rather than showing zero. |

---

### 3.5 RENDERING (R1–R3)

| ID | Status | Impact | Verified Finding | Solution |
|----|--------|--------|-----------------|----------|
| R1 | **VERIFIED** | HIGH | `StrategyNarrative.tsx` lines 392–395: the keyword parser tests `step.split(' ')[0]` against `/^(OPEN|NAVIGATE|SELECT|LEG|COMBINE|SET|MARK|HARD)/` and then looks for `colonIdx = step.indexOf(':')`. `interpreter.py` line 1080 emits `"LEG {i} — {verb} {qty_label}${strike:.0f} {otype.upper()} (expires {exp_fmt}): {explanation}..."` — the keyword is `LEG` (matches the regex) and the first colon appears at the end of the parenthetical `(expires {exp_fmt}):`. However `colonIdx = step.indexOf(':')` finds the FIRST colon in the string, which is inside the expiry string (e.g. "LEG 1 — SELL $150 CALL (expires January 15, 2027): explanation"). If the expiry format contains no colon this works correctly; `date.strftime("%B %d, %Y")` produces no colon, so `colonIdx` will correctly find the colon after the closing parenthesis. This is a FALSE ALARM for the colon format issue. However, the `label` extracted would be `"LEG 1 — SELL $150 CALL (expires January 15, 2027)"` — very long — not just `"LEG"`. The bold label rendered in the UI would be the full preamble text. This is a rendering defect: the intent is clearly to bold only the keyword, but the slice to the first colon captures the entire preamble. | In the checklist step formatter, limit `label` to the content before the first space after the keyword (i.e. `LEG 1`, `OPEN`, `SET`, etc.) by splitting at the em-dash instead of the colon, or restructure the interpreter to emit `"LEG {i}: {verb}..."` (colon immediately after the step number, before any em-dash). The simpler fix is in the interpreter: change `f"LEG {i} — {verb}..."` to `f"LEG {i}: {verb} ..."` so the first colon immediately follows the label. |
| R2 | **VERIFIED** | MEDIUM | `**defined-risk**` and `**undefined-risk**` appear in `_why_this_strategy` lines 304 and 308 (confirmed in code). The `Paragraphs` component renders raw text with `whiteSpace: pre-wrap` — no markdown parser is applied. The double-asterisks appear literally to the user. This is the same finding as B4 and should be resolved by B4's fix (remove the asterisks). Listing separately here because it also affects the `_loss_scenario` undefined-risk block which uses similar phrasing on line 748 (`no hard ceiling on losses`), though that specific line does not use markdown syntax. | Same fix as B4: remove all `**...**` markdown markers from interpreter.py. Search for the pattern `\*\*` and remove globally within the file. |
| R3 | **VERIFIED** | LOW | `_confirmation_summary` (lines 1237–1250) uses `chr(9472)` (box-drawing character `─`) to create a separator line `"─" * 40`. The section is rendered via `Paragraphs` in `StrategyNarrative.tsx` line 284 inside a proportional-font `<div>` (font-size 13px, line-height 1.6). Box-drawing characters in a proportional font do not align with the surrounding text and will render as a decorative but non-aligning divider. The visual artefact is cosmetic rather than misleading. | Replace the `chr(9472) * 40` separator lines with a simple blank line (`\n`) or a CSS-rendered `<hr>` by making the confirmation_summary a structured object rather than a raw string. Minimal fix: replace the box-drawing character with `"—" * 20` or remove the separator entirely. |

---

## 4. Functional Requirements

The following requirements are derived from all VERIFIED and PARTIAL findings above.

### Priority 1 — Must Fix (user sees wrong or misleading output)

1. **FR-B1**: The execution checklist must not output a negative number of days for the 21-DTE calendar reminder. When DTE <= 21 at the time of narrative generation, the checklist must emit a "trade is already inside 21 DTE" alert instead of a reminder.
2. **FR-B4/R2**: The narrative must not contain raw markdown syntax (`**...**`). All emphasis must be expressed in plain text (uppercase or clear phrasing).
3. **FR-C6**: The execution checklist must state the correct options approval level for the strategy being described — Level 2 for defined-risk strategies (verticals, spreads, covered calls), Level 3 or higher for undefined-risk strategies involving naked options.
4. **FR-R1**: The execution checklist keyword-highlighting must bold only the step label (e.g. "LEG 1") not the entire preamble up to the first colon in the body text. The interpreter must emit `"LEG {i}: {verb}..."` format so that `colonIdx` correctly identifies the label boundary.

### Priority 2 — Should Fix (missing useful or trade-specific information)

5. **FR-B2**: The debit trade headline must use "downside exposure" for bearish debit strategies (long put vertical, put butterfly, put ZEBRA, reverse big lizard, put calendar) and "upside exposure" for bullish debit strategies.
6. **FR-B3**: The probability-of-profit note must not claim "wins more often than it loses" for strategies with `pop_range[0] < 50`.
7. **FR-B6**: The debit GTC profit-target step must use the strategy's `profit_target_pct` (already in the trade dict) rather than a hardcoded 50%.
8. **FR-G3**: Named defensive tactic entries must exist for at minimum: `call_butterfly`, `put_butterfly`, `short_naked_call`, `short_call_vertical`, `big_lizard`, `poor_mans_covered_call`, `call_calendar`, `put_calendar`.
9. **FR-G5**: The IV context section must explicitly state the IV environment category (LOW / MEDIUM / HIGH) in the base paragraph.
10. **FR-C1**: The loss scenario monitor paragraph must branch on DTE: trades already inside 21 DTE must receive an "active management phase" notice rather than the standard 21-DTE reminder.
11. **FR-E1**: `trade["earnings_note"]` from the strategy engine must be included in `_trade_plain_english` when non-None.
12. **FR-C5**: The POP note in `_profit_scenario` must not imply empirical backtesting. Replace "over a large sample of similar trades" with language that correctly attributes POP to delta-based theoretical probability.

### Priority 3 — Nice to Have (polish and completeness)

13. **FR-G1**: Named `_why_this_strategy` branches must exist for `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, and `collar`.
14. **FR-G4**: The IV context section must include a brief normal-skew note when `skew_label == "normal"`.
15. **FR-G8**: The undefined-risk loss frame must distinguish between short calls (unlimited theoretical loss) and short puts (loss capped at strike × 100).
16. **FR-G9**: A flat term structure must produce a brief explanatory note in `_iv_context`.
17. **FR-G10**: The covered-call `_why_this_strategy` branch must describe premium as "below average" when `iv_env == "LOW"`.
18. **FR-G11**: The earnings alert in `_market_snapshot` must branch on urgency: 0–3 days vs. 4–30 days, with the 0-day case handled grammatically.
19. **FR-D4**: Breakeven prices in `_profit_scenario` and `_loss_scenario` must include the percentage move required from the current price.
20. **FR-D5**: Sold legs in `_trade_plain_english` must report the approximate daily theta dollar value per contract when `theta` data is non-zero.
21. **FR-D7**: Named strategy branches in `_why_this_strategy` must reference `dte_target` so users understand the recommended expiry window.
22. **FR-E3**: Where `trade["pop_estimate"]` is non-None, use it in the narrative in preference to the catalog `pop_range` midpoint.
23. **FR-B5**: When `sma20 == 0` and `sma50 == 0`, `_market_snapshot` must emit a "moving average data unavailable" notice rather than a malformed "0.0% below $0.00" sentence.
24. **FR-D6**: When `hv_30 == 0`, `_iv_context` must emit a "historical volatility data unavailable" notice rather than silently omitting the HV paragraph.
25. **FR-C7**: When `hv_30 == 0`, the headline builder must omit the HV clause rather than displaying "0.0% HV".
26. **FR-R3**: The confirmation summary separator must not use box-drawing characters in a proportional-font context.
27. **FR-M1**: When `earnings["earnings_passed"]` is True, `_iv_context` must note that a post-earnings IV crush may be underway.
28. **FR-C2**: `_trade_plain_english` must include a margin notice for undefined-risk, non-covered-call strategies.
29. **FR-C3**: The long-leg "defines and caps" phrase must be qualified for undefined-risk trades where the long leg does not fully cap risk.
30. **FR-E2**: When `trade["earnings_adjusted"]` is True and `earnings_note` is None, `_trade_plain_english` must state that the expiry was adjusted to avoid an earnings event.
31. **FR-G2**: The `strength_line` in `_market_snapshot` must distinguish MODERATE from WEAK conviction with separate text.
32. **FR-G6**: Neutral strategy keys must trigger a distinct headline that says "range-bound setup" rather than implying a directional market lean.
33. **FR-G7**: IVR > 80 must trigger additional language about vol-spike conditions in the `_iv_context` interpretation.
34. **FR-G12**: When no breakeven points are available, the confirmation summary must use short strikes from the legs rather than fully generic text.
35. **FR-D8**: The `_market_snapshot` MA section must mention the golden/death cross when SMA20 and SMA50 are in a notable crossover position.
36. **FR-M2**: Earnings notes must include the actual ISO date alongside the day count.
37. **FR-M3**: The flow section in `_why_this_strategy` must print total options volume so the user can judge the significance of the put/call ratio.
38. **FR-D1**: Volume trend must contribute to the `strength_line` conviction assessment.
39. **FR-E4**: `net_greeks` from the trade dict must be summarised in `_trade_plain_english`.

---

## 5. User Stories & Acceptance Criteria

### Story 1 — Negative-Day Calendar Reminder (FR-B1)

**As a** beginner paper trader reviewing a short-dated position, **I want** the execution checklist to give me sensible calendar advice **so that** I am not confused by a reminder set for a negative number of days in the past.

**Acceptance Criteria:**
- [ ] AC1: For any trade with DTE <= 21, the MARK YOUR CALENDAR step does not contain a negative integer.
- [ ] AC2: For DTE <= 21, the step text contains language equivalent to "already inside 21 DTE — apply the close rule now."
- [ ] AC3: For DTE > 21, the step continues to display the correct positive number of days.

---

### Story 2 — Plain Text Risk Labels (FR-B4/R2)

**As a** user reading the "Why This Strategy" section, **I want** risk type labels to display cleanly **so that** raw markdown characters (`**`) do not appear in the narrative.

**Acceptance Criteria:**
- [ ] AC1: Open the app, run a scan on any ticker that surfaces a defined-risk strategy. The "Why This Strategy" panel contains no `**` characters.
- [ ] AC2: Run a scan that surfaces an undefined-risk strategy. The panel contains no `**` characters.
- [ ] AC3: The risk label remains legible and distinct (e.g. "DEFINED-RISK" or "defined-risk" in plain text).

---

### Story 3 — Correct Options Approval Level (FR-C6)

**As a** beginner paper trader using the execution checklist as a guide to real trading, **I want** the correct options approval level stated for the strategy I am trading **so that** I do not present the wrong approval level to my broker.

**Acceptance Criteria:**
- [ ] AC1: For a covered call or long call vertical, Step 1 of the checklist states "level 2 or higher."
- [ ] AC2: For a short strangle or short naked put, Step 1 of the checklist states "level 3 or higher" (or equivalent language referencing naked options).
- [ ] AC3: No defined-risk strategy checklist mentions Level 3+; no undefined-risk naked-option checklist mentions only Level 2.

---

### Story 4 — Correct POP Framing (FR-B3 and FR-C5)

**As a** strategy researcher, **I want** probability-of-profit statements to accurately reflect whether the strategy wins more or less often **so that** I can correctly calibrate my expectations.

**Acceptance Criteria:**
- [ ] AC1: Run a scan that surfaces a call butterfly (pop_range 20–40%). The "Why This Strategy" panel does not contain the phrase "wins more often than it loses."
- [ ] AC2: Run a scan that surfaces an iron condor (pop_range 60–80%). The panel states the strategy wins more often than it loses.
- [ ] AC3: The "If It Works" panel for any strategy does not contain the phrase "over a large sample of similar trades."

---

### Story 5 — Bearish Debit Headline (FR-B2)

**As a** bearish paper trader reviewing a long put vertical recommendation, **I want** the headline to say "downside exposure" **so that** I am not told I bought "upside exposure" on a bearish position.

**Acceptance Criteria:**
- [ ] AC1: Run a scan on a ticker with bearish bias that surfaces a long put vertical. The headline contains "downside" not "upside."
- [ ] AC2: Run a scan on a ticker with bullish bias that surfaces a long call vertical. The headline contains "upside."
- [ ] AC3: Neutral strategies (iron condor, short strangle) do not use either "upside" or "downside" in the headline — they describe a "range-bound" setup.

---

### Story 6 — Checklist Label Rendering (FR-R1)

**As a** paper trader using the Step-by-Step Execution Guide, **I want** step labels to be short and bold (e.g. "LEG 1:") not the entire first sentence bolded **so that** the visual hierarchy is clear and readable.

**Acceptance Criteria:**
- [ ] AC1: Open the execution checklist for any multi-leg strategy. The bold label on each LEG step reads "LEG 1:", "LEG 2:", etc. — not the entire preamble up to the first colon.
- [ ] AC2: The OPEN, NAVIGATE, SELECT, COMBINE, SET, MARK, and HARD STOP steps still display their keyword in bold.
- [ ] AC3: The body text of each step (after the bold label) is not bold.

---

### Story 7 — Earnings Note in Trade Plain English (FR-E1)

**As a** trader reviewing a strategy whose expiry was adjusted around an earnings event, **I want** to see the earnings-adjusted expiry note in the trade description **so that** I understand why the recommended expiry may differ from the standard DTE target.

**Acceptance Criteria:**
- [ ] AC1: For a ticker with earnings within the standard DTE window (e.g. AAPL before earnings), if the strategy engine returns a non-null `earnings_note`, that note appears as the first or second paragraph of "The Trade in Simple Terms."
- [ ] AC2: For tickers with no earnings in the window, "The Trade in Simple Terms" contains no earnings-adjusted expiry note.
- [ ] AC3: The `earnings_note` text is not duplicated elsewhere in the same narrative section.

---

### Story 8 — Debit GTC Profit Target Correct Percentage (FR-B6)

**As a** paper trader placing a call butterfly (25% profit target), **I want** the GTC order in the checklist to target 25% of max profit **so that** I am not told to target 50% for a strategy designed to close at 25%.

**Acceptance Criteria:**
- [ ] AC1: For a call butterfly or call ZEBRA (profit_target_pct = 25), the SET GTC step in the checklist references 25%, not 50%.
- [ ] AC2: For an iron condor (profit_target_pct = 50), the SET GTC step references 50%.
- [ ] AC3: The dollar amount shown in the GTC step is mathematically consistent with the stated percentage.

---

## 6. Out of Scope

- Replacing any part of the narrative engine with AI-generated text (the engine is explicitly rule-based by design).
- Changes to `market_context.py`, `strategy_engine.py`, `iv_analysis.py` data outputs — all fixes are in `interpreter.py` alone except FR-R1 which also touches `StrategyNarrative.tsx`.
- Adding new data sources (e.g. real-time Greeks feed, broker margin API).
- Changes to subscription tier logic — the narrative engine serves all tiers identically.
- Mobile layout changes to `StrategyNarrative.tsx` beyond the label-rendering fix (FR-R1).
- Any real-money broker integration.

---

## 7. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|--------------------|
| DTE == 0 (same-day expiry) | B1 fix: checklist step says "trade expires today — close immediately if not already done." |
| sma20 == 0 and sma50 == 0 | B5 fix: MA section replaced with "data unavailable" notice; remaining sections unaffected. |
| hv_30 == 0 | D6 fix: HV comparison omitted with explicit notice; IV base paragraph still renders. |
| `earnings_note` non-null | E1 fix: note injected at top of trade_plain_english; no duplication with earnings warning in why_this_strategy. |
| Strategy key not in named branches | Generic fallback continues to work; priority-2 improvements add named branches for top-5 missing keys only in v1. |
| trade["risk_type"] missing | All risk-type checks use `.get("risk_type", "DEFINED")` — existing default is safe. |
| All breakeven fields None | G12 fix: short strikes used as fallback; if legs also empty, generic text remains acceptable. |
| `pop_estimate` is None | E3 fix: fall back to `pop_range` midpoint as today. |

---

## 8. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|-------------|
| yfinance | Provides sma20, sma50, hv_30, earnings data — absence triggers several gap conditions | Rate-limited; all fixes must be defensive against zero/None values |
| Supabase | No new dependency — narrative engine is stateless | None |
| Claude API | Not used by interpreter.py | N/A |
| Reddit PRAW | Not used by interpreter.py | N/A |

All 39 functional requirements are implementable within `interpreter.py` (38 items) and `StrategyNarrative.tsx` (1 item: FR-R1). No new external service calls, no schema migrations, and no new environment variables are required.

---

## 9. Subscription Tier Impact

| Tier | Behaviour |
|------|----------|
| free | No impact — narrative engine output is not tier-gated. All fixes apply equally. |
| starter | No impact. |
| pro | No impact. |
| enterprise | No impact. |

No tier-specific changes required. The narrative engine is invoked identically for all authenticated users.

---

## 10. False Alarms (Confirmed Non-Issues)

| ID | Reason |
|----|--------|
| C4 | `iv_source` field does not exist in the `iv_analysis` dict passed to the interpreter. The described condition (`iv_source == hv_proxy`) cannot be triggered. No fix needed. |
| D3 | The boilerplate news text is appropriate given the interpreter has no access to per-headline sentiment scoring. The separate `NewsSentiment` panel in the frontend handles sentiment. Not a gap in the interpreter itself. |

---

## 11. Product Owner Annotations

_Filled in by the product-owner agent. Date: 24Jun2026._

---

### 11.1 Data Availability Verification (New Gaps N1–N10)

Before assigning priorities to the ten new gaps, each was checked against the actual call chain: route layer → `generate_narrative()` signature → `strategy` and `trade` dicts.

| Gap | Field | Available to interpreter.py? | Verdict |
|-----|-------|------------------------------|---------|
| N1 | `strategy["greek_profile"]` | YES — full catalog spread passed as `strategy`; also in `trade["greek_profile"]` | Implementable |
| N2 | `strategy["condition_explanation"]` | YES — full catalog spread includes it | Implementable |
| N3 | `strategy["delta_targets"]` | YES — full catalog spread includes it | Implementable |
| N4 | IV/direction match booleans | YES — `strategy["designed_for_iv"]` and `strategy["designed_for_direction"]` present; interpreter can compute match inline against `iv_env` and `bias` which are already local variables | Implementable |
| N5 | `flow["put_call_ratio_oi"]` | YES — present in `market_context["flow"]`; interpreter already reads this dict at line 419 | Implementable |
| N6 | `news_sentiment` | NO — computed in the route after `market_ctx` is populated, never merged into `market_ctx` before `generate_narrative` is called (verified: route line 164 sets `market_ctx`, line 169–183 computes `news_sentiment`, line 229 calls `generate_narrative(... market_context=market_ctx)` without `news_sentiment` injected). Fixing this requires a route-layer change to `strategies.py`, which is outside the stated constraint of "pure interpreter.py + one minor tsx change." | BLOCKED — route fix required first |
| N7 | Strike selection philosophy | NO new data needed — this is a narrative writing task using `strategy["delta_targets"]` already confirmed available under N3. N7 is a subset of N3. | Merge into N3 |
| N8 | Strategy family context | NO family field in catalog. A hardcoded lookup dict in `interpreter.py` is acceptable under the constraint (no changes to `strategy_engine.py`). | Implementable with internal lookup |
| N9 | `iv_analysis["iv_percentile"]` | YES — confirmed in `iv_analysis.py` output dict at line 121; passed directly as `iv_analysis` parameter. Currently unused in interpreter. | Implementable |
| N10 | Condition checklist (pass/fail) | YES — subset of N4; same data. Separate from N4 only in presentation format. | Merge into N4 |

**Ruling on N6:** This gap cannot be implemented in the current sprint because it requires a change to `backend/routes/strategies.py` to inject `news_sentiment` into `market_ctx` (or add it as an additional parameter to `generate_narrative`). The route change is trivial — one line: `market_ctx["news_sentiment"] = news_sentiment` before the `_build_and_narrate` fan-out — but it is outside the stated scope boundary. This gap is deferred to a separate micro-task that must be approved and scheduled independently. It must not block the interpreter sprint.

**Ruling on N7 and N10:** N7 is not a separate gap from N3. N10 is not a separate gap from N4. Both are presentation variants of data already captured. They are folded into N3 and N4 respectively below and do not receive independent FR numbers.

---

### 11.2 Priority Review — Existing 39 FRs

The BA spec's priority assignments are accepted with the following adjustments:

**Upgrades:**

- **FR-B2 (bearish debit headline): Priority 1 — upgraded from Priority 2.** A user running a bearish strategy and reading "Pay $X for defined upside exposure" receives factually wrong directional framing. This is not a polish item; it contradicts the core educational purpose of the narrative. The fix is a three-line branch and carries zero risk. There is no reason to defer it.

- **FR-B3 (POP framing, "wins more often"): Priority 1 — upgraded from Priority 2.** Telling a user a call butterfly "wins more often than it loses" when its pop_range is 20–40% is a factual inversion. Users calibrate position sizing and expectation management from this statement. The fix is a single conditional and is not deferrable alongside the other accuracy fixes.

- **FR-B6 (debit GTC percentage): Priority 1 — upgraded from Priority 2.** Telling a call butterfly trader to target 50% when the strategy logic targets 25% produces an exit instruction that is directly at odds with the strategy's design. This is not a "nice to have" correction — it is a wrong number in a trading instruction. The profit_target_pct is already read earlier in the function; the fix is a one-line substitution.

**Confirmed at Priority 1 (no change):**

- FR-B1 (negative-day calendar reminder): confirmed P1. Produces a negative integer in the output today.
- FR-B4/R2 (markdown syntax visible): confirmed P1. Affects every narrative for every user.
- FR-C6 (options approval level): confirmed P1. Factually incorrect regulatory guidance for naked-option strategies.
- FR-R1 (checklist label rendering): confirmed P1. Visual defect on every multi-leg trade.

**Confirmed at Priority 2 (no change):**

- FR-G3 (defensive tactic missing branches): confirmed P2. Nine strategy keys fall to generic; high-frequency strategies (call_butterfly, short_naked_call) are among the missing.
- FR-G5 (IV environment category not stated): confirmed P2. Users learn the IVR number but not the classification.
- FR-C1 (monitor paragraph branches on DTE): confirmed P2. Identical to B1's problem domain — both produce nonsensical advice for short-dated trades.
- FR-E1 (earnings_note suppressed): confirmed P2.
- FR-C5 (backtesting implication): confirmed P2.

**Downgraded to Priority 3 (from Priority 2):**

- No existing Priority-2 items are downgraded. The set is appropriate.

**Confirmed at Priority 3 (no change):**

All remaining Priority-3 FRs (FR-G1, FR-G4, FR-G8, FR-G9, FR-G10, FR-G11, FR-D4, FR-D5, FR-D7, FR-E3, FR-B5, FR-D6, FR-C7, FR-R3, FR-M1, FR-C2, FR-C3, FR-E2, FR-G2, FR-G6, FR-G7, FR-G12, FR-D8, FR-M2, FR-M3, FR-D1, FR-E4) remain Priority 3. These are all genuine improvements but none produce factually wrong output in the way that P1 items do.

---

### 11.3 New Gap Prioritisation (N1–N10, post data-availability check)

**N1 — greek_profile theta/vega narrative: Priority 3.**

The data is available and the educational value is real: users who understand that a short strangle is long-theta/short-vega will manage it more confidently. However, this is additive colour, not a correction of wrong output. The greek_profile values are qualitative strings ("long", "short", "flat", "dynamic") that require careful narrative translation to avoid jargon overload for beginners. The risk is that a poorly written greek explanation does more harm than no explanation. Defer to a later pass once the P1/P2 accuracy fixes are shipped and can be evaluated independently. Include in Priority-3 set as FR-N1.

**N2 — condition_explanation (catalog rationale strings): Priority 2.**

This is the highest-value of the new gaps. The catalog contains 37 pre-written, strategy-specific rationale strings that explain precisely why a strategy is suited to its designed conditions. The interpreter generates its own generic logic instead. Using the catalog text directly — or incorporating it as a foundation — would immediately improve narrative specificity for all 31 strategies without requiring new writing. The data is already in the `strategy` dict. The implementation risk is low: read `strategy.get("condition_explanation")` and surface it (or blend it) in `_why_this_strategy`. Include in Priority-2 set as FR-N2.

**N3 — delta_targets / strike selection philosophy: Priority 3.**

The data is available. Explaining delta-targeting to beginners ("we chose the $145 call because it has a delta of 0.30, meaning the market assigns roughly a 30% probability it expires in the money") is genuinely educational. However, this requires care: the `delta_targets` values are targets used by the engine, not the actual deltas of the selected strikes. Presenting the target delta as the actual strike's delta could mislead if the chain does not have a contract at exactly that delta. The safer implementation reads `delta` from the actual selected leg (available in `trade["legs"]`) rather than `delta_targets` from the catalog. This is feasible but requires attention to data integrity. N7 (strike selection philosophy as a concept) is subsumed here. Include in Priority-3 set as FR-N3, with an implementation note that the leg's actual delta must be used, not the catalog target.

**N4 — IV/direction match booleans as a checklist: Priority 2.**

The data is computable inline. Surfacing a brief "conditions check" in the narrative — e.g. "IV environment: HIGH (this strategy is designed for HIGH IV — conditions match)" — gives users a direct, parseable signal about whether the strategy is being applied in its optimal context. This is a meaningful educational addition and directly supports the core value proposition of explaining why a strategy was chosen. It does not require new data; `designed_for_iv` and `designed_for_direction` are in the `strategy` dict. N10 is subsumed here. Include in Priority-2 set as FR-N4.

**N5 — put_call_ratio_oi (OI-based PCR): Priority 3.**

The data is available. OI-based PCR adds signal quality context (OI reflects accumulated positioning, volume reflects single-day activity). However, this is a nuance for experienced users; beginners will be confused by two PCR numbers without a clear explanation of the difference. The current volume PCR narration is already borderline complex. This is a Priority-3 polish item. Include as FR-N5.

**N6 — news_sentiment (dropped before interpreter): BLOCKED — not in sprint scope.**

This gap is real and meaningful: AI-classified sentiment being dropped before the narrative is generated is a genuine data pathway failure. However, the fix requires a route-level change to `strategies.py` (injecting `news_sentiment` into `market_ctx` or adding it as a fourth keyword argument to `generate_narrative`). This is outside the stated constraint of the current sprint. This gap must be logged as a separate backlog item and addressed in a subsequent micro-task with its own approval. It is not deferred indefinitely — it should be the first item in the next round. Do not implement a partial workaround in `interpreter.py` that pretends the data is available.

**N8 — strategy family context: Priority 3.**

A lookup dict mapping each strategy key to its family (butterfly family, lizard family, calendar family, etc.) can live entirely in `interpreter.py`. The educational value is moderate — users researching "iron condors" will benefit from knowing they belong to the neutral-spread family. The implementation risk is low. However, the narrative already runs long and adding family context risks information overload in a section that beginners already struggle to absorb. Defer to Priority 3. Include as FR-N8.

**N9 — iv_percentile alongside IVR: Priority 3.**

The data is in `iv_analysis`. The spec already includes FR-G5 (emit the IV environment category in the base paragraph), which is Priority 2. Adding the percentile figure alongside IVR and the category label is a one-line addition to the same paragraph. Low risk, low effort, but low urgency given FR-G5 already addresses the classification gap. Include as FR-N9, to be implemented in the same code block as FR-G5 if the developer chooses.

---

### 11.4 New Functional Requirements (N-series)

The following FRs are added to the spec backlog from the N-gap analysis:

| FR ID | Source | Priority | Description |
|-------|--------|----------|-------------|
| FR-N2 | N2 | 2 | `_why_this_strategy` must read `strategy["condition_explanation"]` and incorporate or surface the catalog's pre-written rationale string as part of the strategy justification, rather than relying solely on the interpreter's generic logic. |
| FR-N4 | N4, N10 | 2 | `_why_this_strategy` must compute an IV/direction conditions match inline from `strategy["designed_for_iv"]` and `strategy["designed_for_direction"]` against the current `iv_env` and `bias`, and emit a brief conditions-match note (e.g. "IV conditions: match / Direction conditions: match") so users can see whether this strategy is being applied in its designed-for environment. |
| FR-N1 | N1 | 3 | `_why_this_strategy` must narrate the strategy's greek profile (theta and vega orientation) in plain English, using `strategy["greek_profile"]` (or `trade["greek_profile"]`). Must not use the raw field values ("long", "short") verbatim — translate to prose. Example: "This trade earns time decay daily (positive theta) and benefits if implied volatility contracts (short vega)." |
| FR-N3 | N3, N7 | 3 | `_trade_plain_english` must explain why each strike was selected by referencing the actual delta of the leg from `trade["legs"]` (not the catalog's `delta_targets`). Example: "The $145 call has a delta of 0.30 — the market is pricing roughly a 30% probability this option expires in the money." Use actual leg delta only; do not present catalog delta_targets as the strike's real delta. |
| FR-N5 | N5 | 3 | The flow section in `_why_this_strategy` must include the OI-based put/call ratio alongside the volume-based ratio when both are non-zero: "Volume PCR: {vol_pcr:.2f} / OI PCR: {oi_pcr:.2f}." Add a one-line explanation distinguishing volume (today's activity) from open interest (accumulated positioning). |
| FR-N8 | N8 | 3 | `_why_this_strategy` must state the strategy's family in the opening sentence, using a hardcoded lookup dict in `interpreter.py`. Example: "The iron condor belongs to the neutral-spread family." The lookup must cover all 31 catalog strategies; unknown keys fall back to "standalone strategy." |
| FR-N9 | N9 | 3 | The `_iv_context` base paragraph must include `iv_percentile` from `iv_analysis` alongside IVR when non-None: "IV Rank: {ivr:.0f} / IV Percentile: {pct:.0f}." Add a one-line note explaining the distinction (rank is relative to the 52-week range; percentile counts the proportion of days with lower IV). Implement in the same code block as FR-G5. |

**FR-N6 is NOT added to this spec.** It requires a route-layer change and must be tracked as a separate backlog item in its own mini-spec or ticket. The interpreter sprint must not depend on it.

---

### 11.5 Final Priority Table (All FRs)

| FR | Description | Priority | Sprint |
|----|-------------|----------|--------|
| FR-B1 | Negative-day calendar reminder | 1 | v1 |
| FR-B4/R2 | Remove markdown syntax from narrative | 1 | v1 |
| FR-B2 | Bearish debit headline direction label | 1 | v1 (upgraded) |
| FR-B3 | POP "wins more often" conditional | 1 | v1 (upgraded) |
| FR-B6 | Debit GTC uses strategy profit_target_pct | 1 | v1 (upgraded) |
| FR-C6 | Correct options approval level per risk_type | 1 | v1 |
| FR-R1 | Checklist label bold boundary fix | 1 | v1 |
| FR-G3 | Defensive tactic named branches | 2 | v1 |
| FR-G5 | IV environment category stated explicitly | 2 | v1 |
| FR-C1 | Monitor paragraph branches on DTE | 2 | v1 |
| FR-E1 | earnings_note surfaced in trade_plain_english | 2 | v1 |
| FR-C5 | POP note removes backtesting implication | 2 | v1 |
| FR-N2 | condition_explanation incorporated in why_this_strategy | 2 | v1 |
| FR-N4 | IV/direction conditions match note | 2 | v1 |
| FR-G1 | Named why_this_strategy branches (5 missing keys) | 3 | v2 |
| FR-G4 | Normal-skew note | 3 | v2 |
| FR-G8 | Undefined-risk loss: call vs put distinction | 3 | v2 |
| FR-G9 | Flat term structure note | 3 | v2 |
| FR-G10 | Covered-call below-average premium label | 3 | v2 |
| FR-G11 | Earnings urgency branching | 3 | v2 |
| FR-D4 | Breakeven as percentage move | 3 | v2 |
| FR-D5 | Daily theta dollar value per sold leg | 3 | v2 |
| FR-D7 | DTE target referenced in named branches | 3 | v2 |
| FR-E3 | pop_estimate preferred over pop_range | 3 | v2 |
| FR-B5 | SMA zero-data guard | 3 | v2 |
| FR-D6 | HV zero-data guard | 3 | v2 |
| FR-C7 | HV zero headline guard | 3 | v2 |
| FR-R3 | Box-drawing character separator replaced | 3 | v2 |
| FR-M1 | Post-earnings IV-crush note | 3 | v2 |
| FR-C2 | Margin notice for undefined-risk trades | 3 | v2 |
| FR-C3 | Long-leg "defines and caps" qualification | 3 | v2 |
| FR-E2 | earnings_adjusted fallback note | 3 | v2 |
| FR-G2 | MODERATE vs WEAK strength_line distinction | 3 | v2 |
| FR-G6 | Neutral strategy headline "range-bound" | 3 | v2 |
| FR-G7 | IVR > 80 vol-spike sub-branch | 3 | v2 |
| FR-G12 | Confirmation summary uses short strikes | 3 | v2 |
| FR-D8 | Golden/death cross note | 3 | v2 |
| FR-M2 | Earnings actual date alongside day count | 3 | v2 |
| FR-M3 | Total options volume printed in flow section | 3 | v2 |
| FR-D1 | Volume trend in strength_line | 3 | v2 |
| FR-E4 | net_greeks summary in trade_plain_english | 3 | v2 |
| FR-N1 | greek_profile narrated in why_this_strategy | 3 | v2 |
| FR-N3 | Strike delta explanation using actual leg delta | 3 | v2 |
| FR-N5 | OI-based PCR alongside volume PCR | 3 | v2 |
| FR-N8 | Strategy family context | 3 | v2 |
| FR-N9 | iv_percentile alongside IVR | 3 | v2 |
| FR-N6 | news_sentiment in narrative | BLOCKED | Separate backlog item — route fix required |

---

### 11.6 MVP Boundary Statement

**v1 sprint scope (7 Priority-1 + 6 Priority-2 = 13 FRs):**

The v1 sprint corrects all seven factually wrong or misleading outputs (P1) and delivers six meaningful completeness improvements (P2). All 13 items are implementable within `interpreter.py` alone, with a single minor change to `StrategyNarrative.tsx` for FR-R1. No route changes, no schema changes, no new environment variables.

P1 items (must ship before any P2 work begins, in this order of implementation risk — lowest first):
1. FR-B4/R2 — remove markdown asterisks (global search-and-replace, zero logic risk)
2. FR-B3 — POP conditional (single if/else on pop_range[0])
3. FR-B6 — debit GTC uses profit_target_pct (one variable substitution)
4. FR-B1 — negative-day guard (one branch around close_date_days)
5. FR-B2 — bearish debit headline (branch on strat_key set membership)
6. FR-C6 — options approval level (branch on risk_type)
7. FR-R1 — checklist label format in interpreter + one-line tsx label boundary fix

P2 items (can proceed in parallel after P1 is reviewed, but must ship in same v1 branch):
8. FR-G5 — emit IV environment category label
9. FR-C5 — remove backtesting implication from POP note
10. FR-C1 — monitor paragraph DTE branch (companion fix to FR-B1)
11. FR-E1 — surface earnings_note in trade_plain_english
12. FR-N2 — incorporate condition_explanation in why_this_strategy
13. FR-N4 — IV/direction conditions match note

**Deferred to v2:** All 32 Priority-3 FRs. These are genuine improvements but none produce wrong output today. They should be batched into a second sprint after v1 is in production and user feedback confirms the narrative is being read.

**Out of sprint entirely:** FR-N6 (news_sentiment drop). This requires a one-line fix in `strategies.py` that must go through its own approval gate — it changes the data contract of `generate_narrative`. Log as "interpreter-news-sentiment-route-fix" backlog item.

---

### 11.7 Risk Notes for Implementation

1. **FR-N2 (condition_explanation):** The catalog strings were written as internal documentation, not as user-facing prose. The implementation agent must review the strings for tone and jargon before surfacing them verbatim. If any string contains technical shorthand, it must be paraphrased. Do not blindly inject the raw string into the narrative.

2. **FR-N3 (leg delta explanation):** Must use `leg["delta"]` from `trade["legs"]`, not `strategy["delta_targets"]`. The catalog target is the engine's aim, not the actual executed delta. Presenting the target as the actual value would be misleading if the chain does not have a contract at exactly that delta. Implementation agent must read the leg dict structure before writing this section.

3. **FR-N4 (conditions match):** The match logic must handle the "any" value in `designed_for_iv` and `designed_for_direction` correctly. A strategy designed for "any" IV environment always matches — this must be reflected in the note ("designed for any IV environment — conditions met by definition").

4. **FR-R1 (checklist label format):** The fix is in interpreter.py (change em-dash to colon immediately after the step number in LEG steps). The tsx change is read-only from the interpreter's perspective — the frontend's `colonIdx` logic already works correctly once the interpreter emits the right format. Test with a single-leg and multi-leg strategy to confirm.

5. **Ordering of N-series FRs within why_this_strategy:** FR-N2, FR-N4, and the existing named-branch logic must coexist without duplication. The conditions match note (FR-N4) and the condition_explanation text (FR-N2) cover related ground. The implementation agent should place the conditions match note (FR-N4) as a brief header bullet, and the condition_explanation (FR-N2) as the body paragraph, rather than allowing both to say the same thing at length.

---

**PO gate decision:** Approved — proceed to Gate 2 (Architecture / Solution Design)

_Approved by:_ Product Owner &nbsp;&nbsp; _Date:_ 24Jun2026

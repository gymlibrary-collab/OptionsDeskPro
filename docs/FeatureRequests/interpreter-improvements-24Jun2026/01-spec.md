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

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — Negative-Day Reminder | 1 | Produces visibly wrong output today |
| Story 2 — Plain Text Risk Labels | 1 | Markdown symbols visible to all users |
| Story 3 — Options Approval Level | 1 | Factually incorrect advice for naked-option strategies |
| Story 4 — POP Framing | 2 | Misleading but not dangerous |
| Story 5 — Bearish Debit Headline | 2 | Incorrect directional label |
| Story 6 — Checklist Label Rendering | 1 | Visual defect visible on every multi-leg trade |
| Story 7 — Earnings Note in Trade | 2 | Useful context currently suppressed |
| Story 8 — Debit GTC Percentage | 2 | Wrong exit guidance for 25%-target strategies |

**MVP boundary:** Stories 1, 2, 3, 6 (four Priority-1 items). All eight FRs in these stories can be completed in a single backend + one-line frontend change pass.

**Deferred to backlog:** Stories 4, 5, 7, 8 and all Priority-3 FRs (FR-G1 through FR-E4 in the nice-to-have set).

**PO gate decision:** ☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

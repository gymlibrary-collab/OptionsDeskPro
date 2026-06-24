# Feature Spec — Narrative Engine Improvements v2 (interpreter.py)

**Date:** 24Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

This is the second sprint of narrative engine improvements for `backend/services/interpreter.py`. v1 (branch `claude/modest-davinci-sxz7lv`, commit `dba62cb`) addressed 13 functional requirements: the seven Priority-1 defects that produced factually wrong output, plus six Priority-2 completeness gaps. Those 13 items are confirmed implemented and in production on the branch.

v2 targets the remaining 32 deferred items — all originally classified as Priority 3 (nice to have) in the v1 spec. While none of these produce wrong output in the way v1 items did, they collectively represent meaningful gaps in narrative completeness, data utilisation, and contextual branching that reduce the educational value of the narrative for paper traders. The narrative engine serves every authenticated user on the `ai` and `scanner` tabs; correctness and trust are the core product value.

v2 re-prioritises the 32 deferred items into three tiers for this sprint: P1 (must have this sprint), P2 (should have), and P3 (nice to have). All items are implementable within `interpreter.py` alone. No route changes, schema migrations, or new environment variables are required.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Beginner learner | free / starter | Reads full narrative to understand why a strategy was chosen and how to execute it; benefits most from contextual branching and missing-data notices |
| Active paper trader | starter / pro | Uses execution checklist and trade ticket as a dry-run of real order entry; needs correct breakeven context and margin notices |
| Strategy researcher | pro / enterprise | Validates IV context and market snapshot against their own analysis; notices when the narrative lacks specificity (e.g. no flat-term-structure comment, no golden-cross mention) |
| Admin / developer | admin | Monitors output quality, investigates regressions; benefits from explicit zero-data guards over silent omissions |

---

## 3. Verification Summary

The table below confirms the v1 implementation status of all 13 in-scope items and lists the 32 items deferred to v2. All findings are sourced from the v1 spec at `docs/FeatureRequests/interpreter-improvements-24Jun2026/01-spec.md` and verified against the current interpreter.py code.

### 3.1 v1 Items — Confirmed Implemented

| FR | Description | Evidence in Code |
|----|-------------|-----------------|
| FR-B1 | Negative-day calendar reminder | `close_date_days <= 0` guard at line 1255; DTE == 0 branch emits "expires TODAY" |
| FR-B2 | Bearish debit headline direction label | `_BEARISH_DEBIT_KEYS` set at line 1402; `exposure_word` ternary at line 1406 |
| FR-B3 | POP "wins more often" conditional | `if pop_range[0] >= 50` / `else` block at lines 314–327 |
| FR-B4/R2 | Remove markdown syntax | Risk labels read "DEFINED-RISK" / "UNDEFINED-RISK" in plain text; no `**` present |
| FR-B6 | Debit GTC uses profit_target_pct | `close_credit = abs_net * (profit_target_pct / 100)` at line 1220 |
| FR-C1 | Monitor paragraph branches on DTE | `if dte_loss <= 21:` branch at line 839 with "active management phase" text |
| FR-C5 | POP note removes backtesting implication | "derived from options delta theory, not historical backtesting" at line 752 |
| FR-C6 | Correct options approval level | `is_naked` logic + `approval_level` ternary at lines 1053–1064 |
| FR-E1 | earnings_note surfaced in trade_plain_english | `earnings_note = trade.get("earnings_note")` + injection at lines 543–545 |
| FR-G3 | Defensive tactic named branches | `tactics` dict now includes `call_zebra`, `put_zebra`; generic fallback retained for remaining missing keys |
| FR-G5 | IV environment category stated explicitly | `iv_env_label` appended to base paragraph at line 189 |
| FR-N2 | condition_explanation in why_this_strategy | `cond_exp = strategy.get("condition_explanation")` + append at lines 403–404 |
| FR-N4 | IV/direction conditions match note | `conditions_match_note` block at lines 406–437 |

Note on FR-G3: The v1 implementation added `call_zebra` and `put_zebra` to `_defensive_tactic`. The full list of nine missing keys identified in the original spec (call_butterfly, put_butterfly, short_naked_call, short_call_vertical, big_lizard, poor_mans_covered_call, call_calendar, put_calendar, and the BWB variants) was not fully addressed. The five highest-priority missing keys remain deferred to v2 as FR-G3 is re-listed below.

Note on FR-R1: The v1 spec required changing the LEG step format from `"LEG {i} — {verb}..."` to `"LEG {i}: {verb}..."`. The current code at line 1162 uses `f"LEG {i}: {verb}..."` — confirmed implemented.

---

## 4. Deferred Items — v2 Scope

All items below were carried from the v1 spec with their original verified findings and solutions. The only change is their sprint assignment (v1 → v2) and re-prioritisation within this sprint.

### 4.1 Priority Assignment for v2

| Priority | Label | Criteria |
|----------|-------|---------|
| P1 — Must Have | Narrative branches with a specific strategy key that falls to generic fallback, or data zero-guards that produce misleading output | These are gaps the developer would fix immediately if they noticed them during code review |
| P2 — Should Have | Data available but unused, or useful branching that noticeably improves output quality | High ROI relative to implementation effort |
| P3 — Nice to Have | Polish, completeness, and nuance that adds colour but does not affect correctness | Batch or defer to v3 if sprint capacity is tight |

---

### 4.2 P1 — Must Have This Sprint

#### FR-G3 — Defensive Tactic Missing Named Branches

**Impact:** MEDIUM
**Function:** `_defensive_tactic()`

**Verified Finding:** The `tactics` dict has named entries for `short_strangle`, `iron_condor`, `short_naked_put`, `short_put_vertical`, `iron_fly`, `short_straddle`, `long_call_vertical`, `long_put_vertical`, `covered_call`, `jade_lizard`, `reverse_jade_lizard`, `call_zebra`, `put_zebra`. The following keys fall to the generic fallback: `call_butterfly`, `put_butterfly`, `call_broken_wing_butterfly`, `put_broken_wing_butterfly`, `call_calendar`, `put_calendar`, `big_lizard`, `reverse_big_lizard`, `short_naked_call`, `short_call_vertical`, `poor_mans_covered_call`. The generic fallback emits "Monitor the position daily..." which is appropriate guidance but gives no trade-specific adjustment tactic.

**Solution:** Add named defensive tactic entries for at minimum: `call_butterfly`, `put_butterfly`, `short_naked_call`, `short_call_vertical`, `big_lizard`, `poor_mans_covered_call`, `call_calendar`, `put_calendar`. Each needs 3–5 sentences unique to its structure and its primary adjustment scenario. The BWB variants (`call_broken_wing_butterfly`, `put_broken_wing_butterfly`) may share logic with their standard counterparts but must note the asymmetric risk profile of the broken wing.

**Acceptance Criteria:**
- [ ] AC1: Run a scan that surfaces a call butterfly. The "How to Adjust if Wrong" section contains text specific to butterfly management (e.g. closing early at 50% loss, pinning near body strike) rather than the generic fallback text.
- [ ] AC2: Run a scan that surfaces a short naked call. The defensive tactic section contains text specific to short call management (e.g. rolling up-and-out, the 2x credit stop) rather than the generic fallback.
- [ ] AC3: Run a scan that surfaces a call calendar or put calendar. The defensive tactic section contains text specific to calendar management (e.g. defending the short front-month leg, rolling the short month forward).

---

#### FR-B5 — SMA Zero-Data Guard

**Impact:** LOW (but produces malformed output when triggered)
**Function:** `_market_snapshot()`

**Verified Finding:** At lines 24–27, `above_20 = price > sma20 if sma20 else None` and `gap_20 = ((price - sma20) / sma20 * 100) if sma20 else 0`. When `sma20 == 0` and `sma50 == 0`, both `above_20` and `above_50` are `None` (falsy). The `not above_20 and not above_50` branch at line 37 fires, emitting "X.X% below its $0.00 moving average." The gap is 0.0% and the dollar value renders as `$0.00`. This occurs for illiquid tickers where yfinance returns zero for SMA values.

**Solution:** Add an early-return guard at the top of the MA section: if `sma20 == 0 and sma50 == 0`, skip all MA branches and append "Moving average data unavailable for this symbol." to the output. Continue with RSI and strength lines unaffected.

**Acceptance Criteria:**
- [ ] AC1: When tested with a ticker whose yfinance response returns sma20 == 0 and sma50 == 0, the Market Snapshot section contains "Moving average data unavailable" rather than "0.0% below its $0.00 moving average."
- [ ] AC2: The RSI and directional conviction lines render normally for the same ticker (the zero-SMA guard only suppresses the MA paragraph, not the full section).
- [ ] AC3: For a normal ticker with valid SMA values, the MA paragraph is unchanged.

---

#### FR-D6 — HV Zero-Data Explicit Notice

**Impact:** LOW (but silently omits context)
**Function:** `_iv_context()`

**Verified Finding:** At line 193, `if hv_30 > 0:` — the HV comparison paragraph is silently skipped when `hv_30 == 0`. No notice is given. A zero HV30 occurs when yfinance returns no historical data (new listings, short-history ETFs, synthetic chain). The user sees the IVR base paragraph and jumps directly to the interpretation paragraph with no indication that the IV vs HV comparison is absent.

**Solution:** Add an `else` clause under the `if hv_30 > 0:` block: "30-day historical volatility data is unavailable for this symbol — the IV vs HV comparison cannot be shown."

**Acceptance Criteria:**
- [ ] AC1: For a ticker with hv_30 == 0, the IV Context section contains a sentence stating that historical volatility data is unavailable.
- [ ] AC2: The IVR base paragraph and the IVR interpretation paragraph still render for the same ticker.
- [ ] AC3: For a normal ticker with hv_30 > 0, the HV paragraph is unchanged and the "unavailable" notice does not appear.

---

#### FR-C7 — HV Zero Headline Guard

**Impact:** LOW
**Function:** `generate_narrative()` headline builder

**Verified Finding:** In the HIGH IV credit branch of the headline (line 1394), the string includes `{hv_30:.1f}% HV`. If `hv_30 == 0`, the headline reads "...IVR 65 (45.2% IV vs 0.0% HV)." A 0.0% HV figure is misleading — it implies the stock has had zero historical volatility, which is not true; the data is simply unavailable.

**Solution:** Add a guard in the headline builder: if `hv_30 == 0`, omit the `{hv_30:.1f}% HV` clause. The headline should read "Collect $X premium with IV elevated at IVR 65 (45.2% IV)" rather than including the zero HV value.

**Acceptance Criteria:**
- [ ] AC1: For a ticker with hv_30 == 0 in a HIGH IV environment, the headline does not contain "0.0% HV."
- [ ] AC2: The headline for the same ticker still contains the IVR value and the current IV percentage.
- [ ] AC3: For a ticker with hv_30 > 0 in a HIGH IV environment, the headline format is unchanged and includes both IV and HV figures.

---

#### FR-G8 — Undefined-Risk Loss: Short Call vs Short Put Distinction

**Impact:** MEDIUM
**Function:** `_loss_scenario()`

**Verified Finding:** The undefined-risk `else` block at lines 802–811 uses identical language for all undefined-risk trades: "In theory, if {symbol} moves far enough against you, the loss can be substantial." A short naked call has theoretically unlimited loss (the stock can rise without bound). A short naked put has a floor (the stock cannot go below zero; max loss is approximately strike × 100). These are materially different risk profiles. The trade dict's `legs` list and `risk_type` are available to distinguish them.

**Solution:** Within the undefined-risk block, inspect the legs to determine whether the primary short leg is a call or a put. If the short leg is a call, emit "In theory, a short call has unlimited loss — if {symbol} rises without limit, so does your loss. This is the most important risk to understand about this structure." If the short leg is a put, emit "Your worst-case loss is not unlimited: a short put's loss is capped at approximately ${strike * 100:.0f} per contract (if the stock fell to zero). While large, this is a finite and quantifiable risk."

**Acceptance Criteria:**
- [ ] AC1: For a short naked call, the "If It Goes Wrong" section contains language about theoretically unlimited upside loss (not "substantial").
- [ ] AC2: For a short naked put, the section contains language stating the loss is capped at approximately strike × 100 per contract and gives the dollar figure.
- [ ] AC3: Defined-risk trades are not affected — the loss_frame for defined-risk strategies is unchanged.

---

#### FR-C2 — Margin Notice for Undefined-Risk Trades

**Impact:** LOW (but important for beginners)
**Function:** `_trade_plain_english()`

**Verified Finding:** `_trade_plain_english` never mentions margin or buying power requirement. For undefined-risk positions (short naked put, short naked call, short straddle, short strangle), brokers typically require 20–25% of the notional value as maintenance margin. A beginner placing a short naked put on a $150 stock may be surprised to find $3,000+ of buying power is consumed without warning. The `risk_type` field is available in the trade dict.

**Solution:** Add a general margin notice for undefined-risk, non-covered-call strategies in `_trade_plain_english`: "MARGIN NOTICE: undefined-risk positions require margin reserved in your broker account. As a rule of thumb, expect 20–25% of the notional value of the short strike(s) to be held as buying power (e.g. short a $150 put: approximately $3,000 margin required per contract). Verify the exact requirement in your broker's margin calculator before placing the order."

**Acceptance Criteria:**
- [ ] AC1: For a short naked put or short strangle, "The Trade in Simple Terms" section contains a MARGIN NOTICE paragraph with the 20–25% rule-of-thumb.
- [ ] AC2: The notice includes a worked dollar example derived from the actual short strike in the trade.
- [ ] AC3: For a covered call or defined-risk spread (long call vertical, iron condor), no MARGIN NOTICE appears.

---

#### FR-C3 — Long-Leg "Defines and Caps" Qualification

**Impact:** LOW
**Function:** `_trade_plain_english()`

**Verified Finding:** At lines 617–618, every long leg receives the fixed text "This leg defines and caps your maximum risk on the trade." For a ratio spread (e.g. call ratio spread where one long call is paired with two short calls), the single long leg does not cap overall risk — the extra short call is uncovered. The trade dict's `risk_type` field is available.

**Solution:** Qualify the phrase using `trade.get("risk_type", "DEFINED")`: if `risk_type == "UNDEFINED"`, replace the long-leg text with "This long leg partially offsets your short obligation but does not fully cap the overall position risk — the trade remains undefined-risk overall."

**Acceptance Criteria:**
- [ ] AC1: For a long call vertical (defined-risk), the buy leg text still says "This leg defines and caps your maximum risk on the trade."
- [ ] AC2: For a call ratio spread or other undefined-risk trade with a long leg, the buy leg text says the long leg "partially offsets" rather than "defines and caps."
- [ ] AC3: For a short strangle (no long legs), the long-leg text does not appear at all — this AC confirms the condition is only triggered for actual long legs.

---

#### FR-G1 — Named Why-This-Strategy Branches for Missing Keys

**Impact:** MEDIUM
**Function:** `_why_this_strategy()`

**Verified Finding:** The `if/elif` chain handles these keys explicitly: `short_strangle`, `iron_condor`, `short_straddle`, `iron_fly`, `short_naked_put`, `short_put_vertical`, `jade_lizard`, `short_naked_call`, `short_call_vertical`, `reverse_jade_lizard`, `long_call_vertical`, `big_lizard`, `poor_mans_covered_call`, `long_put_vertical`, `reverse_big_lizard`, `covered_call`, `call_butterfly`, `put_butterfly`, `call_broken_wing_butterfly`, `put_broken_wing_butterfly`. Keys falling to the generic `else`: `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, `call_ratio_spread`, `put_ratio_spread`, `short_combo`, `long_combo`, `collar`, `protective_put`, `diagonal_spread` (11 strategies). The generic else is grammatically coherent but lacks mechanics-specific explanation.

**Solution:** Add named branches for at minimum `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, and `collar` — the five most commonly surfaced missing keys — with language appropriate to their specific mechanics (ZEBRA's leverage profile, calendar's theta/vega play, collar's protective structure).

**Acceptance Criteria:**
- [ ] AC1: Run a scan that surfaces a call ZEBRA or put ZEBRA. The "Why This Strategy" section does not contain the generic else text ("structured to perform in a {iv_word} IV environment") — it contains ZEBRA-specific language about the leveraged directional structure.
- [ ] AC2: Run a scan that surfaces a call calendar or put calendar. The section contains calendar-specific language (front-month theta vs back-month vega, the role of IV term structure in calendar profitability).
- [ ] AC3: Run a scan that surfaces a collar. The section contains collar-specific language (protective put + covered call combination, cost-offset mechanics).

---

#### FR-G4 — Normal-Skew Note in IV Context

**Impact:** LOW
**Function:** `_iv_context()`

**Verified Finding:** `skew_para` is set only for `skew_label == "elevated"` or `skew_label == "low"` (lines 269–281). `skew_label == "normal"` produces an empty `skew_para`, and the skew section is entirely absent from the output. Normal skew is the most common case — users receive no skew context in the typical scenario.

**Solution:** Add a brief normal-skew sentence: "Put skew is within normal ranges — the market is not pricing in asymmetric fear of a crash or a euphoric melt-up, which is the baseline condition for most strategies."

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `skew_label == "normal"`, the IV Context section contains a sentence mentioning that put skew is within normal ranges.
- [ ] AC2: The normal-skew sentence is shorter than the elevated-skew and low-skew paragraphs — it is a brief note, not a full paragraph.
- [ ] AC3: For elevated or low skew, the existing expanded paragraphs are unchanged.

---

#### FR-G6 — Neutral Strategy Headline "Range-Bound" Branch

**Impact:** LOW
**Function:** `generate_narrative()` headline builder

**Verified Finding:** The headline function has three branches: credit + HIGH IV, credit + non-HIGH IV, and debit (all cases). Neutral strategies (iron condor, short strangle, short straddle, iron fly) hit the credit branch. For these, the headline reads "Collect $X premium... Market is Neutral." The phrase "Market is Neutral" combined with a "Sell a Short Strangle" instruction may confuse new users who associate "selling" with a directional bet. The strategy key is available at this point in `generate_narrative`.

**Solution:** Add a fourth headline branch for neutral strategy keys (`iron_condor`, `short_strangle`, `short_straddle`, `iron_fly`) that explicitly frames the trade as a range-bound setup: "Collect $X premium on a range-bound setup — {symbol} stays flat, you keep it all."

**Acceptance Criteria:**
- [ ] AC1: For a short strangle or iron condor in any IV environment, the headline contains "range-bound" rather than "Market is Neutral."
- [ ] AC2: For a directional credit trade (short naked put, short put vertical), the headline does not contain "range-bound."
- [ ] AC3: For a debit trade, the headline is unchanged (uses the debit branch with exposure_word).

---

#### FR-G9 — Flat Term Structure Note

**Impact:** LOW
**Function:** `_iv_context()`

**Verified Finding:** `term_para` in `_iv_context` is built only for `term_slope == "contango"` or `"backwardation"` (lines 249–265). A `"flat"` slope produces an empty `term_para`. The flat term structure is common; users in the most frequent scenario receive no term structure commentary.

**Solution:** Add a flat-slope sentence: "The IV term structure is approximately flat — near-month and far-month implied volatility are roughly equal. This neutral term structure gives no strong directional calendar-spread signal; strategy selection should lean on the directional picture and IVR rather than term structure."

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `term_slope == "flat"`, the IV Context section contains a sentence explaining that near- and far-month IV are roughly equal.
- [ ] AC2: The flat-slope note is shorter than the contango or backwardation paragraphs.
- [ ] AC3: For contango or backwardation, the existing paragraphs are unchanged.

---

#### FR-G10 — Covered-Call Below-Average Premium Label

**Impact:** LOW
**Function:** `_why_this_strategy()`, covered_call branch

**Verified Finding:** The covered-call branch at line 380 uses `'above average' if iv_env == 'HIGH' else 'fair'`. When `iv_env == "LOW"`, the premium described as "fair" is actually below average — a meaningful distinction for income-focused traders deciding whether selling a covered call is worth the obligation to deliver shares at the strike.

**Solution:** Extend the ternary to three cases: `'above average' if iv_env == 'HIGH' else 'below average' if iv_env == 'LOW' else 'fair'`.

**Acceptance Criteria:**
- [ ] AC1: For a covered call surfaced in a HIGH IV environment, the "Why This Strategy" section contains "above average" in describing the premium.
- [ ] AC2: For a covered call surfaced in a LOW IV environment, the section contains "below average" in describing the premium (and may also note that this is a less ideal time to sell covered calls).
- [ ] AC3: For a MEDIUM IV environment, the section still says "fair."

---

#### FR-G11 — Earnings Urgency Branching in Market Snapshot

**Impact:** LOW
**Function:** `_market_snapshot()`

**Verified Finding:** The earnings note at lines 147–153 uses identical text for any `days_earn` between 0 and 30: "reports earnings in approximately {days_earn} days." A 0-day case produces "approximately 0 days" (grammatically awkward and factually imprecise — it means today or tomorrow). A 2-day case and a 25-day case receive identical urgency framing.

**Solution:** Branch on `days_earn`: if `days_earn <= 3`, emit "EARNINGS IMMINENT: {symbol} reports earnings today or within the next {days_earn} day(s) — IV crush risk is immediate. Consider whether to close or avoid this position." If `days_earn > 3`, use the current text. Handle the 0-day case with "today or tomorrow" phrasing.

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `days_earn == 0`, the Market Snapshot section contains "earnings today or tomorrow" and the word "IMMINENT" (or equivalent urgency marker) — not "approximately 0 days."
- [ ] AC2: For `days_earn == 2`, the section contains an urgency indicator ("IMMINENT" or "within the next 2 days").
- [ ] AC3: For `days_earn == 15`, the section uses the standard non-urgent phrasing (no IMMINENT marker).

---

#### FR-G2 — MODERATE vs WEAK Strength Line Distinction

**Impact:** LOW
**Function:** `_market_snapshot()`

**Verified Finding:** `strength_line` at lines 101–111 has two branches: `if strength == "STRONG"` emits a multi-confirming-indicator note; `else` emits a single cautious note for all non-STRONG values. This means MODERATE and WEAK produce identical text ("The signal is present but not overwhelming — conflicting indicators suggest staying cautious about directional size"). MODERATE and WEAK have meaningfully different implications for position sizing.

**Solution:** Add an `elif strength == "MODERATE"` branch with partial-confirmation language: "The directional case has partial support — some indicators align but not all. A smaller position size is appropriate until the picture clarifies." Keep the current else for WEAK only, which implies active conflict.

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `strength == "MODERATE"`, the strength_line contains "partial support" or equivalent language distinguishing it from WEAK.
- [ ] AC2: For a ticker with `strength == "WEAK"`, the strength_line retains the "conflicting indicators" language.
- [ ] AC3: For a ticker with `strength == "STRONG"`, the strength_line retains the "multiple confirming indicators" language.

---

### 4.3 P2 — Should Have

#### FR-D4 — Breakeven as Percentage Move

**Impact:** LOW
**Functions:** `_profit_scenario()`, `_loss_scenario()`

**Verified Finding:** Both functions express breakeven as an absolute dollar price (e.g. "$148.50") but never as a percentage move from the current price. Users often think in terms of "how far does the stock have to move?" The current price is in `bias_analysis["price"]` but is not passed into these functions.

**Solution:** Pass `price` (from `bias_analysis`) into `_profit_scenario` and `_loss_scenario` (or derive it from the trade legs, or accept it as an additional parameter from `generate_narrative` where it is available). Append `"({pct:.1f}% move required)"` next to the breakeven dollar figure in the condition and trigger lines.

**Acceptance Criteria:**
- [ ] AC1: The "If It Works" section for any trade with a single breakeven shows the dollar breakeven followed by a percentage move in parentheses, e.g. "$148.50 (2.3% move required)."
- [ ] AC2: The "If It Goes Wrong" trigger line similarly shows the percentage alongside the dollar breakeven.
- [ ] AC3: For trades with both a lower and upper breakeven, both figures include their respective percentage move from current price.

---

#### FR-D5 — Daily Theta Dollar Value per Sold Leg

**Impact:** LOW
**Function:** `_trade_plain_english()`

**Verified Finding:** Each leg dict returned by `build_trade()` includes a `theta` value. The sell-leg text at line 609 says "Time decay works in your favour" as a fixed phrase. The actual theta dollar value per contract (theta × 100 × qty) could be stated concretely, which is more useful than the generic phrase.

**Solution:** Extract `theta` from each sold leg in `_trade_plain_english`. If `theta` is non-zero, append: "At current levels this option earns approximately ${abs(theta) * 100 * qty:.0f} per day in time decay per contract." If `theta` is zero or unavailable, fall back to the existing generic phrase.

**Acceptance Criteria:**
- [ ] AC1: For a short naked put with non-zero theta in the leg dict, the trade description contains a specific daily theta dollar figure (e.g. "earns approximately $12 per day in time decay").
- [ ] AC2: For a leg with theta == 0 or theta not present, the text falls back to the generic "Time decay works in your favour" without crashing.
- [ ] AC3: The theta figure is labelled "per day" and "per contract" to avoid ambiguity.

---

#### FR-D7 — DTE Target Referenced in Named Strategy Branches

**Impact:** MEDIUM
**Function:** `_why_this_strategy()`

**Verified Finding:** `dte_target` is read at line 294 and used only in the generic `else` branch at line 399. All named strategy branches (covered_call, short_strangle, etc.) never mention the recommended DTE target. A user choosing between a 30-DTE and a 45-DTE expiry gets no signal from the "Why This Strategy" narrative about which the strategy is designed for.

**Solution:** Append a sentence to each named strategy's `core` paragraph referencing `dte_target`: "This strategy is designed for the {dte_target}-day expiry window — staying close to this target keeps theta decay in the optimal range."

**Acceptance Criteria:**
- [ ] AC1: For a short strangle (dte_target = 45), the "Why This Strategy" section contains a sentence referencing the 45-day expiry window.
- [ ] AC2: For a call butterfly (dte_target = 30), the section references the 30-day window.
- [ ] AC3: The DTE target sentence appears in at minimum five named branches (short_strangle, iron_condor, short_naked_put, long_call_vertical, covered_call) — not only in the generic else.

---

#### FR-E3 — pop_estimate Preferred over Catalog pop_range

**Impact:** LOW
**Functions:** `_profit_scenario()`, `_why_this_strategy()`

**Verified Finding:** The narrative uses `strategy["pop_range"]` (catalog range) for POP statements in both functions. `trade.get("pop_estimate")` contains a more precise figure derived from the actual leg deltas at the selected strikes. The two numbers may diverge meaningfully if the selected strikes do not align with catalog assumptions. The trade dict is already available in `_profit_scenario`.

**Solution:** In `_profit_scenario`, prefer `trade.get("pop_estimate")` if non-None and present it as a single figure: "Based on the delta of the selected strikes, this setup has an estimated {pop_estimate:.0f}% theoretical probability of being profitable at expiration." Fall back to the `pop_range` midpoint if `pop_estimate` is None. Apply the same preference in `_why_this_strategy` where the pop_range is surfaced.

**Acceptance Criteria:**
- [ ] AC1: When `trade["pop_estimate"]` is non-None, the "If It Works" section shows a single POP percentage (e.g. "63%") rather than a catalog range (e.g. "60–80%").
- [ ] AC2: When `trade["pop_estimate"]` is None, the section falls back to the catalog `pop_range` without error.
- [ ] AC3: The POP figure in "Why This Strategy" and "If It Works" are consistent — both prefer the computed estimate when available.

---

#### FR-G7 — IVR > 80 Vol-Spike Sub-Branch

**Impact:** LOW
**Function:** `_iv_context()`

**Verified Finding:** The IVR interpretation thresholds are `< 30` (LOW), `30–50` (MEDIUM), and `> 50` (HIGH). There is no sub-classification for extreme readings (IVR > 80). An IVR of 55 and an IVR of 95 produce identical HIGH paragraphs. For premium sellers, an IVR of 95 implies meaningfully higher risk of the stock continuing to move (often called a "vol spike" or "vol crush" event).

**Solution:** Add an IVR > 80 sub-branch within the HIGH interpretation block that mentions vol-spike conditions: "With IVR above 80, this is a vol-spike environment. While premium sellers are collecting exceptional amounts, extreme spikes often signal ongoing event risk — the stock may be moving hard and may continue moving hard. Size this trade conservatively and widen your strikes more than usual."

**Acceptance Criteria:**
- [ ] AC1: For a ticker with IVR == 85, the IV Context section contains language specific to vol-spike conditions that is distinct from the standard HIGH IV paragraph.
- [ ] AC2: For a ticker with IVR == 60, the section uses the standard HIGH IV paragraph without vol-spike language.
- [ ] AC3: The vol-spike sub-branch does not change the IV environment label — it is still "HIGH" at IVR 85.

---

#### FR-G12 — Confirmation Summary Uses Short Strikes Fallback

**Impact:** LOW
**Function:** `_confirmation_summary()`

**Verified Finding:** At lines 1305–1312, when both `bl` and `bh` are None, `range_line` falls to `"profitable if the stock moves in the expected direction"`. This is nearly identical to the generic text in `_profit_scenario` and gives no trade-specific information. Short strikes are available in `trade["legs"]`.

**Solution:** Mirror the `_profit_scenario` fallback: extract short strikes from `trade["legs"]` and produce: "profitable as long as {symbol} stays within range of your short strike(s) at ${X}" when `bl` and `bh` are both None but short strikes are available.

**Acceptance Criteria:**
- [ ] AC1: For a trade where both `breakeven_low` and `breakeven_high` are None but the trade has a short leg, the Trade Summary box contains the short strike dollar value in the profit zone line.
- [ ] AC2: For a trade with valid breakeven values, the profit zone line is unchanged.
- [ ] AC3: For a trade with no breakeven values AND no short legs (edge case), the generic "expected direction" fallback is acceptable and does not crash.

---

#### FR-D8 — Golden/Death Cross Note in Market Snapshot

**Impact:** LOW
**Function:** `_market_snapshot()`

**Verified Finding:** `sma20` and `sma50` are both read and used in the four MA-position branches. However, the relative position of `sma20` vs `sma50` (golden cross: sma20 > sma50; death cross: sma20 < sma50) is never directly mentioned. The MA branch text describes price relative to each average individually, not the crossover relationship between the averages themselves.

**Solution:** After the four MA-position branches (and after the FR-B5 zero-guard), add a check: `if sma20 > 0 and sma50 > 0 and sma20 > sma50: append "The 20-day is above the 50-day (a bullish crossover alignment — known as a 'golden cross' when fresh)."` Conversely, if `sma20 < sma50: append "The 20-day is below the 50-day (a bearish crossover alignment — known as a 'death cross' when fresh)."` If equal, no mention needed.

**Acceptance Criteria:**
- [ ] AC1: For a ticker where sma20 > sma50, the Market Snapshot section mentions "20-day is above the 50-day" or "golden cross alignment."
- [ ] AC2: For a ticker where sma20 < sma50, the section mentions "20-day is below the 50-day" or "death cross alignment."
- [ ] AC3: The golden/death cross note appears as a sentence appended to the MA paragraph, not as a separate paragraph that duplicates the already-described price/MA relationship.

---

#### FR-M1 — Post-Earnings IV-Crush Note

**Impact:** LOW
**Function:** `_iv_context()`

**Verified Finding:** The interpreter gates all earnings logic on `0 <= days_earn <= 30`, explicitly excluding negative values. `earnings_passed = earnings.get("earnings_passed")` is a boolean set by `market_context.py` when the nearest earnings date was within the past 3 days. A post-earnings scenario (stock just reported, IV is now collapsing) receives zero mention even though it is highly relevant context for options sellers who may be seeing a temporarily inflated IVR.

**Solution:** In `_iv_context`, check `ctx.get("earnings", {}).get("earnings_passed")` and if True, add a note after the base paragraph: "NOTE: Earnings just occurred — an IV crush event may be underway. The elevated IVR reading above may reflect the pre-earnings spike rather than the new post-earnings baseline. Implied volatility often falls sharply in the days following an earnings announcement."

**Acceptance Criteria:**
- [ ] AC1: For a ticker where `earnings_passed == True`, the IV Context section contains a note about post-earnings IV crush.
- [ ] AC2: The note mentions that the current IVR may not reflect the new post-earnings baseline.
- [ ] AC3: For a ticker where `earnings_passed == False` or the field is absent, no earnings-passed note appears.

---

#### FR-R3 — Box-Drawing Character Separator Replaced

**Impact:** LOW (cosmetic)
**Function:** `_confirmation_summary()`

**Verified Finding:** Lines 1334 and 1344 use `chr(9472) * 40` (the box-drawing character `─`) to create a separator line. These render in a proportional-font `<div>` in `StrategyNarrative.tsx` and do not align with the surrounding text — they render as a decorative but non-aligning row of special characters.

**Solution:** Replace `chr(9472) * 40` with an em-dash run or remove the separator entirely. The minimal fix: `"—" * 20`. Alternatively, remove the separator lines and rely on the text structure (the `TRADE SUMMARY` label and the final instruction line) to bound the summary visually.

**Acceptance Criteria:**
- [ ] AC1: Open the app, run any strategy scan, navigate to the Confirmation Summary section. No box-drawing character (`─`) appears in the rendered text.
- [ ] AC2: The Trade Summary section still has a clear visual boundary (either em-dashes or a blank line) between the header label and the final instruction.
- [ ] AC3: The content lines within the Trade Summary (Position, Expiry, Entry, Profit zone, etc.) are unchanged.

---

#### FR-E2 — Earnings-Adjusted Expiry Fallback Note

**Impact:** LOW
**Function:** `_trade_plain_english()`

**Verified Finding:** `trade.get("earnings_adjusted")` is a boolean present in the trade dict. Neither `_trade_plain_english` nor any other interpreter function reads it. When True, the recommended expiry is non-standard (deliberately chosen to avoid an earnings event). The existing FR-E1 (implemented in v1) handles the case where `earnings_note` is non-None. But when `earnings_adjusted == True` and `earnings_note` is None or empty, the user has no way to know the expiry was adjusted.

**Solution:** In `_trade_plain_english`, after the FR-E1 `earnings_note` injection, add: if `trade.get("earnings_adjusted")` is True and `earnings_note` is falsy, append: "NOTE: The recommended expiry for this trade has been adjusted to avoid the upcoming earnings event. The standard DTE target for this strategy would normally land inside the earnings window."

**Acceptance Criteria:**
- [ ] AC1: For a trade where `earnings_adjusted == True` and `earnings_note` is None, "The Trade in Simple Terms" contains a note about the adjusted expiry.
- [ ] AC2: For a trade where `earnings_note` is non-None (the v1 FR-E1 path), the adjusted-expiry fallback note does not also appear (no duplication).
- [ ] AC3: For a trade where `earnings_adjusted == False` or the field is absent, no adjusted-expiry note appears.

---

### 4.4 P3 — Nice to Have

#### FR-E4 — Net Greeks Summary in Trade Plain English

**Impact:** LOW
**Function:** `_trade_plain_english()`

**Verified Finding:** `net_greeks` (dict of delta/gamma/theta/vega for the whole position) is present in the trade dict from `strategy_engine.py`. No interpreter function reads it. The net greek profile gives a precise summary of how the position responds to price moves, time, and volatility.

**Solution:** Add a brief greek summary in `_trade_plain_english` after the per-leg descriptions: "Net position greeks: delta {delta:.2f}, theta ${theta_dollars:.0f}/day, vega {vega:.2f}." Add a one-line plain-English interpretation of each non-zero value. Only render if `net_greeks` is non-None and non-empty.

**Acceptance Criteria:**
- [ ] AC1: For any multi-leg strategy with `net_greeks` in the trade dict, the trade description includes a "Net position greeks" line with at least delta and theta values.
- [ ] AC2: Theta is expressed as a dollar-per-day figure (theta × 100) not as the raw per-share value.
- [ ] AC3: If `net_greeks` is absent or None, no greeks summary line appears and no crash occurs.

---

#### FR-E2-alt — FR-N1: Greek Profile Narrative in Why This Strategy

**Impact:** LOW
**Function:** `_why_this_strategy()`
**Original FR:** FR-N1

**Verified Finding:** `strategy["greek_profile"]` (e.g. `{"theta": "long", "vega": "short", "delta": "directional"}`) is available in the strategy dict. The narrative currently discusses theta in passing ("time decay works in your favour") but never explicitly states whether the overall position is long-theta or short-vega in plain English.

**Solution:** In `_why_this_strategy`, after the risk_note, add a plain-English greek orientation sentence derived from `strategy.get("greek_profile", {})`. Example: "This trade is long-theta (earns time decay daily) and short-vega (benefits if implied volatility contracts)." Map the raw string values ("long"/"short"/"flat"/"dynamic") to plain-English phrases. Do not use the raw values verbatim.

**Acceptance Criteria:**
- [ ] AC1: For an iron condor, the "Why This Strategy" section mentions that the trade earns time decay (long theta) and benefits from falling IV (short vega).
- [ ] AC2: For a long call vertical, the section mentions that the trade loses small amounts each day (short theta) and benefits if IV rises (long vega), or equivalent plain-English phrasing.
- [ ] AC3: If `greek_profile` is absent or empty, no greek orientation sentence appears and no crash occurs.

---

#### FR-D1 — Volume Trend in Strength Line

**Impact:** LOW
**Function:** `_market_snapshot()`

**Verified Finding:** `vol_trend` and `vol_ratio` are read at lines 122–123 and used to build `vol_note` in the MACD/ATR extra paragraph. However, the `strength_line` at lines 101–111 does not reference volume trend. A high-conviction (STRONG) setup with falling volume is not distinguished from a STRONG setup with rising volume.

**Solution:** In the STRONG branch of `strength_line`, append `vol_trend` context: if `vol_trend == "rising"`, add "Elevated volume confirms the move." If `vol_trend == "falling"`, add "However, volume is subdued — the move lacks strong institutional backing." Only do this when `tech` context is available.

**Acceptance Criteria:**
- [ ] AC1: For a STRONG bias with `vol_trend == "rising"`, the strength_line contains a confirmation note about elevated volume.
- [ ] AC2: For a STRONG bias with `vol_trend == "falling"`, the strength_line notes that volume is subdued.
- [ ] AC3: For a MODERATE or WEAK bias (or when `ctx` is None), the volume note does not appear in the strength_line — it already appears in the MACD/ATR paragraph.

---

#### FR-M2 — Earnings Date Alongside Day Count

**Impact:** LOW
**Functions:** `_market_snapshot()`, `_why_this_strategy()`

**Verified Finding:** `next_earnings` (ISO date string) is in the earnings dict. The interpreter uses only `days_until_earnings` (integer). Showing the actual date is more actionable for traders who are planning trades around their broker's expiry calendar.

**Solution:** In both `_market_snapshot` and `_why_this_strategy`, when `next_earnings` is non-None, replace "in approximately {days} days" with "on {next_earnings} ({days} days away)."

**Acceptance Criteria:**
- [ ] AC1: For a ticker with a known `next_earnings` date, the earnings alert in Market Snapshot says "on [date] ([N] days away)" rather than "in approximately [N] days."
- [ ] AC2: The same date-inclusive phrasing appears in the "Why This Strategy" earnings risk note when `days_earn <= 14`.
- [ ] AC3: If `next_earnings` is None, the day-count-only phrasing is used as a fallback without error.

---

#### FR-M3 — Total Options Volume in Flow Section

**Impact:** LOW
**Function:** `_why_this_strategy()`

**Verified Finding:** The flow section at lines 465–488 emits the put/call volume ratio but never prints the absolute total volume. A 2:1 put/call ratio on 100 contracts is noise; the same ratio on 500,000 contracts is significant. The `flow.get("total_volume", 0)` value is already gated on `> 1000` as a minimum threshold but is not displayed.

**Solution:** In the flow section, add the absolute total volume alongside the PCR: "Total options volume today: {total_volume:,} contracts." Place this before the PCR note so users can judge the significance of the ratio.

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `total_volume > 1000`, the "Why This Strategy" section displays the total options volume in the flow paragraph.
- [ ] AC2: The volume is formatted with thousands separators (e.g. "45,230 contracts" not "45230 contracts").
- [ ] AC3: For a ticker with `total_volume <= 1000` (the flow section is already gated on > 1000), no flow section appears — this AC confirms the gate is not changed.

---

#### FR-N3 — Strike Delta Explanation Using Actual Leg Delta

**Impact:** LOW
**Function:** `_trade_plain_english()`
**Original FR:** FR-N3 (from N-gap analysis)

**Verified Finding:** The sell-leg text at line 607 already includes `delta` in the sentence "This option has a delta of {abs(delta):.2f}, meaning the market is pricing in roughly a {abs(delta)*100:.0f}% chance it expires in-the-money." The buy-leg text at line 614 says "it moves approximately ${abs(delta):.2f} for every $1 move." Both are functional. This FR is about extending the buy-leg delta explanation to include the ITM probability framing alongside the movement explanation, making it consistent with the sell-leg and more educational for beginners.

**Solution:** For buy legs, add the ITM probability framing after the movement explanation: "The delta of {abs(delta):.2f} also means the market is pricing roughly a {abs(delta)*100:.0f}% probability this option expires in-the-money — this is the strike selection signal the engine used."

**Acceptance Criteria:**
- [ ] AC1: For a long call vertical, the buy-leg description includes both the "moves $X for every $1" framing and the "market is pricing roughly a X% probability" ITM framing.
- [ ] AC2: The sell-leg description is unchanged.
- [ ] AC3: For a stock leg (option_type == "stock"), the delta explanation does not appear — stock legs have no delta text today.

---

#### FR-N5 — OI-Based PCR Alongside Volume PCR

**Impact:** LOW
**Function:** `_why_this_strategy()`
**Original FR:** FR-N5 (from N-gap analysis)

**Verified Finding:** `flow.get("put_call_ratio_oi")` is present in the flow dict. The flow section currently shows only the volume-based PCR. OI-based PCR reflects accumulated positioning (what large traders are already holding) vs volume (what they did today). Both together give a richer picture of institutional intent.

**Solution:** In the flow section, if `put_call_ratio_oi` is non-None and non-zero, append after the volume PCR note: "OI-based put/call ratio: {oi_pcr:.2f} (open interest reflects accumulated positioning rather than just today's activity — a persistently high OI PCR indicates sustained hedging demand)."

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `put_call_ratio_oi` non-None, the flow paragraph contains both the volume PCR and the OI PCR with labels distinguishing them.
- [ ] AC2: For a ticker where `put_call_ratio_oi` is None or zero, only the volume PCR appears and no crash occurs.
- [ ] AC3: The one-line explanation of the difference between volume PCR and OI PCR is present in the note.

---

#### FR-N8 — Strategy Family Context

**Impact:** LOW
**Function:** `_why_this_strategy()`
**Original FR:** FR-N8 (from N-gap analysis)

**Verified Finding:** No `family` field exists in the catalog. Users researching strategies benefit from knowing that an iron condor belongs to the "neutral spread" family, that a ZEBRA belongs to the "leveraged directional" family, etc. A hardcoded lookup dict in `interpreter.py` requires no changes to `strategy_engine.py`.

**Solution:** Add a `_STRATEGY_FAMILY` lookup dict in `interpreter.py` covering all 31 catalog strategy keys. Prepend a family sentence to the `core` paragraph in `_why_this_strategy`: "The {strat_name} belongs to the {family} family of options strategies." Keys not in the lookup fall back to "standalone" family.

**Acceptance Criteria:**
- [ ] AC1: For an iron condor, the "Why This Strategy" section contains a sentence stating it belongs to the neutral spread (or equivalent) family.
- [ ] AC2: For a call ZEBRA, the section states it belongs to the leveraged directional (or equivalent) family.
- [ ] AC3: For a strategy key not in the lookup dict, the fallback "standalone strategy" text appears without error.

---

#### FR-N9 — IV Percentile Alongside IVR

**Impact:** LOW
**Function:** `_iv_context()`
**Original FR:** FR-N9 (from N-gap analysis)

**Verified Finding:** `iv_analysis.get("iv_percentile")` is confirmed present in the `iv_analysis` dict (computed in `iv_analysis.py`). The base paragraph already displays IVR. Adding percentile alongside IVR adds nuance: IVR measures position within the 52-week range; percentile counts the proportion of days with lower IV. These can diverge for non-uniform volatility distributions.

**Solution:** If `iv_percentile` is non-None, extend the base paragraph: "IV Rank: {ivr:.0f} / IV Percentile: {iv_percentile:.0f}." Add a one-line note after the base: "IV Rank measures where today's IV sits within the 52-week high-low range; IV Percentile counts the proportion of days in the past year where IV was lower than today — both above 50 confirm a relatively elevated option pricing environment." Implement in the same code block as FR-G5 (already done in v1).

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `iv_percentile` non-None in the iv_analysis dict, the IV Context section displays both IVR and IV Percentile.
- [ ] AC2: A one-line explanation distinguishing rank from percentile is present immediately after the dual-figure line.
- [ ] AC3: If `iv_percentile` is None, the base paragraph shows only IVR (as it does today) without error.

---

## 5. Functional Requirements (Numbered)

### Priority 1 — Must Have This Sprint

1. **FR-G3**: `_defensive_tactic()` must have named entries for `call_butterfly`, `put_butterfly`, `short_naked_call`, `short_call_vertical`, `big_lizard`, `poor_mans_covered_call`, `call_calendar`, `put_calendar`, and the BWB variants. Each entry must contain 3–5 sentences specific to that strategy's adjustment mechanics.
2. **FR-B5**: When `sma20 == 0` and `sma50 == 0`, `_market_snapshot()` must emit "Moving average data unavailable for this symbol" rather than the malformed "$0.00 moving average" sentence. RSI and strength lines must still render.
3. **FR-D6**: When `hv_30 == 0`, `_iv_context()` must emit "30-day historical volatility data is unavailable for this symbol — the IV vs HV comparison cannot be shown." rather than silently skipping the HV paragraph.
4. **FR-C7**: When `hv_30 == 0` in the HIGH IV environment, the headline must omit the `{hv_30:.1f}% HV` clause rather than showing "0.0% HV".
5. **FR-G8**: The undefined-risk loss frame in `_loss_scenario()` must distinguish between short calls (theoretically unlimited loss) and short puts (capped at strike × 100 per contract), and must quantify the worst-case dollar figure for the put case.
6. **FR-C2**: `_trade_plain_english()` must include a MARGIN NOTICE for undefined-risk, non-covered-call strategies stating the 20–25% notional rule of thumb with a worked example using the actual short strike.
7. **FR-C3**: The long-leg "defines and caps" phrase in `_trade_plain_english()` must be replaced with a partial-offset qualification for trades where `risk_type == "UNDEFINED"`.
8. **FR-G1**: `_why_this_strategy()` must have named branches for `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, and `collar` with mechanics-specific language.
9. **FR-G4**: When `skew_label == "normal"`, `_iv_context()` must emit a brief note stating that put skew is within normal ranges.
10. **FR-G6**: For neutral strategy keys (`iron_condor`, `short_strangle`, `short_straddle`, `iron_fly`), `generate_narrative()` must produce a "range-bound setup" headline rather than "Market is Neutral."
11. **FR-G9**: When `term_slope == "flat"`, `_iv_context()` must emit a sentence explaining that near- and far-month IV are roughly equal and that the flat structure gives no strong calendar-spread signal.
12. **FR-G10**: The covered-call branch in `_why_this_strategy()` must describe premium as "below average" when `iv_env == "LOW"`, not "fair."
13. **FR-G11**: The earnings note in `_market_snapshot()` must branch on urgency: `days_earn <= 3` produces an "EARNINGS IMMINENT" alert; `days_earn > 3` uses the current standard text. The 0-day case must say "today or tomorrow" not "approximately 0 days."
14. **FR-G2**: The `strength_line` in `_market_snapshot()` must have a distinct `elif strength == "MODERATE"` branch with partial-confirmation language, separate from the WEAK fallback.

### Priority 2 — Should Have

15. **FR-D4**: `_profit_scenario()` and `_loss_scenario()` must append `"({pct:.1f}% move required)"` next to each breakeven dollar figure. The current price must be passed or derived for this calculation.
16. **FR-D5**: Sold legs in `_trade_plain_english()` must report the approximate daily theta dollar value per contract when `theta` is non-zero in the leg dict.
17. **FR-D7**: Named strategy branches in `_why_this_strategy()` must append a sentence referencing `dte_target` in at minimum five named branches.
18. **FR-E3**: `_profit_scenario()` and `_why_this_strategy()` must prefer `trade.get("pop_estimate")` over the catalog `pop_range` midpoint when the computed figure is non-None.
19. **FR-G7**: When `ivr > 80` in the HIGH IV interpretation block in `_iv_context()`, a vol-spike sub-paragraph must warn about heightened event risk and recommend conservative sizing.
20. **FR-G12**: When both `breakeven_low` and `breakeven_high` are None in `_confirmation_summary()`, the profit zone line must use short strikes from `trade["legs"]` rather than fully generic text.
21. **FR-D8**: After the MA-position branch in `_market_snapshot()`, if `sma20 > sma50 > 0`, a golden-cross alignment note must be appended; if `sma20 < sma50`, a death-cross alignment note must be appended.
22. **FR-M1**: When `ctx["earnings"]["earnings_passed"] == True`, `_iv_context()` must emit a note that a post-earnings IV crush may be underway and that the current IVR may not reflect the new baseline.
23. **FR-R3**: `_confirmation_summary()` must not use `chr(9472)` (box-drawing character) for separator lines; replace with em-dashes or remove separators.

### Priority 3 — Nice to Have

24. **FR-E2**: When `trade["earnings_adjusted"] == True` and `trade.get("earnings_note")` is falsy, `_trade_plain_english()` must add a note that the expiry was adjusted to avoid the earnings window.
25. **FR-E4**: When `trade.get("net_greeks")` is non-None, `_trade_plain_english()` must append a brief net-greeks summary line with delta, theta (as $/day), and vega.
26. **FR-D1**: In the STRONG branch of `strength_line` in `_market_snapshot()`, `vol_trend` must contribute a confirmation or contradiction note when technicals context is available.
27. **FR-M2**: When `earnings.get("next_earnings")` is non-None, earnings date references in `_market_snapshot()` and `_why_this_strategy()` must include the ISO date alongside the day count.
28. **FR-M3**: The flow section in `_why_this_strategy()` must print `total_volume` before the PCR note so users can judge the significance of the ratio.
29. **FR-N1**: `_why_this_strategy()` must narrate the strategy's greek orientation from `strategy.get("greek_profile")` in plain English after the risk_note. Raw field values ("long", "short") must be translated to prose, not used verbatim.
30. **FR-N3**: Buy-leg descriptions in `_trade_plain_english()` must include the ITM probability framing ("the market is pricing roughly a X% probability this option expires in-the-money") alongside the movement-per-dollar framing.
31. **FR-N5**: The flow section in `_why_this_strategy()` must include the OI-based PCR alongside the volume PCR when `put_call_ratio_oi` is non-None and non-zero, with a one-line explanation distinguishing volume from OI.
32. **FR-N8**: `_why_this_strategy()` must state the strategy's family using a hardcoded `_STRATEGY_FAMILY` lookup dict covering all 31 catalog keys. Unknown keys fall back to "standalone strategy."
33. **FR-N9**: When `iv_analysis.get("iv_percentile")` is non-None, `_iv_context()` must display both IVR and IV Percentile in the base paragraph with a one-line explanation of the distinction.

---

## 6. User Stories & Acceptance Criteria

### Story 1 — Defensive Tactics Completeness (FR-G3)

**As a** paper trader who has placed a call butterfly that is moving against me, **I want** the "How to Adjust if Wrong" section to give me butterfly-specific guidance **so that** I know how to manage a losing position rather than following the generic monitor-and-close advice.

**Acceptance Criteria:**
- [ ] AC1: Run a scan that surfaces a call butterfly. The defensive tactic section contains butterfly-specific language (e.g. reference to the body strike, early exit at 50% loss, the pin risk near expiry).
- [ ] AC2: Run a scan that surfaces a short naked call. The defensive tactic section contains naked-call-specific language (e.g. rolling up-and-out for credit, the 2× stop rule for the short call).
- [ ] AC3: Run a scan that surfaces a call calendar. The defensive tactic section contains calendar-specific language (e.g. the front-month short expiring, rolling the short month forward).

---

### Story 2 — Missing Data Guards (FR-B5, FR-D6, FR-C7)

**As an** admin investigating narrative output for an illiquid ticker, **I want** the narrative to explicitly state when SMA or HV data is unavailable **so that** I know the missing paragraphs are intentional guards and not rendering bugs.

**Acceptance Criteria:**
- [ ] AC1: For a ticker with sma20 == 0 and sma50 == 0, the Market Snapshot section contains "Moving average data unavailable" and does not show a "$0.00 moving average" sentence.
- [ ] AC2: For a ticker with hv_30 == 0, the IV Context section contains "30-day historical volatility data is unavailable" rather than silently skipping the HV paragraph.
- [ ] AC3: For a ticker with hv_30 == 0 in a HIGH IV environment, the headline does not contain "0.0% HV."

---

### Story 3 — Undefined-Risk Trade Clarity (FR-G8, FR-C2, FR-C3)

**As a** beginner paper trader reviewing a short naked call recommendation, **I want** the narrative to clearly distinguish the unlimited loss risk of the short call from the finite risk of a short put, and to warn me about the margin requirement **so that** I am not surprised by a broker margin call or by the true worst-case loss of my position.

**Acceptance Criteria:**
- [ ] AC1: For a short naked call, the "If It Goes Wrong" section contains language specifically calling out theoretically unlimited upside loss — not just "substantial."
- [ ] AC2: For a short naked put, the section states the maximum loss is capped at approximately strike × 100 per contract and gives the dollar figure.
- [ ] AC3: For any short strangle, "The Trade in Simple Terms" section contains a MARGIN NOTICE with the 20–25% rule of thumb and a worked dollar example based on the actual short strike.
- [ ] AC4: For a long call vertical (defined-risk), no MARGIN NOTICE appears, and the buy-leg text still says "This leg defines and caps your maximum risk."
- [ ] AC5: For a call ratio spread (undefined-risk with a long leg), the buy-leg text says the long leg "partially offsets" rather than "defines and caps."

---

### Story 4 — Strategy-Specific Why-This-Strategy Branches (FR-G1)

**As a** strategy researcher scanning for ZEBRA or calendar spread opportunities, **I want** the "Why This Strategy" section to explain the specific mechanics of the recommended strategy **so that** I am not reading the same generic volatility-environment text for every strategy that falls to the else clause.

**Acceptance Criteria:**
- [ ] AC1: Run a scan that surfaces a call ZEBRA. The "Why This Strategy" section contains ZEBRA-specific language (e.g. leveraged directional structure, 2:1 long/short ratio, defined risk with leveraged upside).
- [ ] AC2: Run a scan that surfaces a put calendar. The section contains calendar-specific language (e.g. selling near-term IV, holding the back-month long, the vega play on term structure).
- [ ] AC3: Run a scan that surfaces a collar. The section contains collar-specific language (the protective put combined with the covered call, the cost-offset mechanics).

---

### Story 5 — IV Context Completeness (FR-G4, FR-G6, FR-G7, FR-G9, FR-G10, FR-M1, FR-N9)

**As a** strategy researcher reviewing the IV Context section, **I want** the section to handle all skew states, term structure states, and extreme IVR readings **so that** I am not left wondering why there is no skew or term structure commentary for the most common (normal/flat) scenario.

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `skew_label == "normal"`, the IV Context section contains a brief sentence about normal put skew — it is not empty.
- [ ] AC2: For a ticker with `term_slope == "flat"`, the IV Context section contains a sentence explaining the flat term structure.
- [ ] AC3: For a ticker with IVR == 88, the IV Context section contains language specific to vol-spike conditions, distinct from the standard HIGH IV paragraph shown at IVR 55.
- [ ] AC4: For a covered call on a LOW-IV ticker, the "Why This Strategy" section describes the premium as "below average" not "fair."
- [ ] AC5: For a ticker where `earnings_passed == True`, the IV Context section notes that post-earnings IV crush may be underway.

---

### Story 6 — Market Snapshot Richness (FR-G2, FR-G11, FR-D8, FR-D1, FR-M2)

**As a** beginner learning to read market context, **I want** the Market Snapshot section to distinguish between moderate and weak conviction, to flag imminent earnings with urgency, and to mention the golden/death cross alignment **so that** the snapshot gives me a more complete picture of the technical setup.

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `strength == "MODERATE"`, the strength line contains distinct language from the WEAK branch (e.g. "partial support" vs "conflicting indicators").
- [ ] AC2: For a ticker with `days_earn == 1`, the earnings note contains "IMMINENT" or "today or within the next" — not "approximately 1 days."
- [ ] AC3: For a ticker where sma20 > sma50, the Market Snapshot section mentions "golden cross alignment" or "20-day above the 50-day."
- [ ] AC4: For a ticker with `strength == "STRONG"` and `vol_trend == "rising"`, the strength line contains a volume confirmation note.

---

### Story 7 — Headline Range-Bound Framing (FR-G6)

**As a** beginner paper trader who has been recommended a short strangle, **I want** the headline to describe the trade as a "range-bound setup" rather than "Market is Neutral" **so that** I understand the trade profits from the stock staying within a zone, not from a neutral market directional call.

**Acceptance Criteria:**
- [ ] AC1: For a short strangle or iron condor, the headline contains "range-bound" and does not contain the phrase "Market is Neutral."
- [ ] AC2: For a short put vertical (directional credit trade), the headline does not contain "range-bound."
- [ ] AC3: For a long call vertical (debit trade), the headline is unchanged and references the exposure direction word.

---

### Story 8 — Trade Description Data Richness (FR-D4, FR-D5, FR-D7, FR-E2, FR-E3, FR-E4, FR-N3)

**As an** active paper trader reviewing the trade breakdown, **I want** the trade description to include percentage move context on breakevens, daily theta income, the optimal DTE window for the strategy, and actual ITM probabilities for each leg **so that** I can calibrate the trade against my own view of how far the stock will move and how long I can hold it.

**Acceptance Criteria:**
- [ ] AC1: For any trade with a single breakeven, the "If It Works" section shows the breakeven as both a dollar price and a percentage move from current price.
- [ ] AC2: For a short strangle, the sold-leg descriptions in "The Trade in Simple Terms" include a daily theta dollar figure per contract.
- [ ] AC3: The "Why This Strategy" section for a short strangle references the 45-day (or strategy-specific dte_target) expiry window.
- [ ] AC4: For a trade where `trade["pop_estimate"]` is non-None, the "If It Works" section displays the specific computed POP figure rather than the catalog range.
- [ ] AC5: For a trade where `earnings_adjusted == True` and `earnings_note` is None, "The Trade in Simple Terms" contains a note about the adjusted expiry.

---

### Story 9 — Confirmation Summary Polish (FR-G12, FR-R3)

**As an** active paper trader using the Trade Summary box as a quick reference, **I want** the summary to show my short strikes when breakeven data is unavailable and to render without box-drawing characters in the proportional-font UI **so that** the summary is both useful and visually clean.

**Acceptance Criteria:**
- [ ] AC1: For a trade with no computed breakeven levels but with short legs, the "Profit zone" line in the Trade Summary shows the short strike dollar value rather than "profitable if the stock moves in the expected direction."
- [ ] AC2: No box-drawing character (`─`) appears anywhere in the rendered Trade Summary section.
- [ ] AC3: The Trade Summary still has a visually distinct header and footer boundary (em-dashes or blank lines are acceptable).

---

### Story 10 — Flow Section Completeness (FR-M3, FR-N5)

**As a** strategy researcher evaluating options flow, **I want** to see total options volume alongside the put/call ratio, and to see the OI-based PCR alongside the volume-based PCR **so that** I can judge whether the PCR reading is statistically significant and whether large traders are holding positions (OI) or just trading today (volume).

**Acceptance Criteria:**
- [ ] AC1: For a ticker with `total_volume > 1000`, the flow paragraph begins with "Total options volume today: {X:,} contracts" before the PCR note.
- [ ] AC2: For a ticker with `put_call_ratio_oi` non-None, the flow paragraph contains both a volume PCR and an OI PCR with labels.
- [ ] AC3: A one-line explanation distinguishing volume PCR from OI PCR is present when both are shown.

---

### Story 11 — Strategy Education Enrichment (FR-N1, FR-N8, FR-N9)

**As a** beginner learner encountering an iron condor for the first time, **I want** the narrative to tell me which strategy family it belongs to, what its greek orientation is in plain English, and to show me both IVR and IV percentile **so that** I understand the strategy in context and can learn the vocabulary alongside the trade.

**Acceptance Criteria:**
- [ ] AC1: For an iron condor, the "Why This Strategy" section contains a sentence identifying its strategy family (neutral spread or equivalent).
- [ ] AC2: For an iron condor, the section contains plain-English greek orientation text (e.g. "this trade earns time decay daily and benefits if implied volatility contracts").
- [ ] AC3: For any ticker with `iv_percentile` non-None, the IV Context section displays both "IV Rank" and "IV Percentile" with a one-line distinction note.

---

## 7. Out of Scope

- Replacing any part of the narrative engine with AI-generated text. The engine remains explicitly rule-based.
- Changes to `market_context.py`, `strategy_engine.py`, `iv_analysis.py`, or any route file. All fixes are in `interpreter.py` alone. No exceptions.
- FR-N6 (injecting `news_sentiment` into the narrative). This requires a route-level change to `strategies.py` and is tracked separately as backlog item `interpreter-news-sentiment-route-fix`.
- Adding new data sources (real-time Greeks feed, broker margin API, external sentiment service).
- Changes to subscription tier logic. The narrative engine serves all tiers identically; v2 does not change that.
- Mobile layout changes to `StrategyNarrative.tsx`. FR-R1 touched TSX in v1; v2 has no TSX changes.
- Any real-money broker integration.
- New paper-trade order entry flows or position management screens.

---

## 8. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|--------------------|
| sma20 == 0, sma50 == 0 | FR-B5: MA section replaced with "data unavailable" notice; RSI and strength lines render normally |
| hv_30 == 0 | FR-D6: HV paragraph replaced with explicit "unavailable" notice; IV base and interpretation paragraphs unaffected |
| hv_30 == 0 in HIGH IV headline | FR-C7: HV clause omitted from headline; IVR and IV% still shown |
| risk_type == "UNDEFINED", no long legs | FR-C3: long-leg qualification does not fire (no long legs); undefined-risk framing in loss scenario still applies |
| risk_type == "UNDEFINED", has long leg | FR-C3: long-leg text says "partially offsets" not "defines and caps" |
| pop_estimate is None | FR-E3: fall back to pop_range midpoint; no error |
| earnings_passed == True and earnings_note non-None | FR-E2: earnings_note rendered (v1 FR-E1 path); adjusted-expiry fallback not also added (no duplication) |
| term_slope == "flat" and front_iv_pct == 0 | FR-G9: flat note does not require front/back IV values; emit flat note unconditionally when slope is flat |
| strategy key not in _STRATEGY_FAMILY lookup | FR-N8: fallback "standalone strategy" text; no KeyError |
| net_greeks absent or None | FR-E4: greeks summary line skipped entirely; no crash |
| iv_percentile is None | FR-N9: only IVR shown in base paragraph; no error |
| DTE == 0 at time of narrative generation | FR-B5/FR-G11 guards already in place from v1; no regression expected |
| Short leg is stock (covered call) | FR-G8: covered call is not in the undefined-risk block; no call/put distinction fires |

---

## 9. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|-------------|
| yfinance | Provides sma20, sma50, hv_30, earnings data, term structure — absence triggers several v2 guard conditions | Rate-limited; all fixes must be defensive against zero/None values; the zero-data guards in FR-B5, FR-D6, FR-C7 are specifically motivated by yfinance returning zero for illiquid tickers |
| Supabase | No new dependency — narrative engine is stateless | None |
| Claude API | Not used by interpreter.py | N/A |
| Reddit PRAW | Not used by interpreter.py | N/A |

All 33 functional requirements are implementable within `interpreter.py` alone. No new external service calls, no schema migrations, and no new environment variables are required.

---

## 10. Subscription Tier Impact

| Tier | Behaviour |
|------|----------|
| free | No impact — narrative engine output is not tier-gated. All v2 fixes apply equally. |
| starter | No impact. |
| pro | No impact. |
| enterprise | No impact. |

No tier-specific changes required. The narrative engine is invoked identically for all authenticated users.

---

## 11. False Alarms (Carried from v1 — Confirmed Non-Issues)

| ID | Reason |
|----|--------|
| C4 | `iv_source` field does not exist in the `iv_analysis` dict. No fix needed. |
| D3 | News boilerplate is appropriate given the interpreter has no access to per-headline sentiment scoring. Not a gap. |
| D2 | `macd_diverging` is used in both `_market_snapshot` and `_why_this_strategy`. The gap (not feeding `strength_line`) is real but low priority; partially addressed by FR-D1 in P3. |
| M4 | `macd_histogram` raw value — the bool/string proxies are sufficient for narrative quality. Confirmed low priority and not included in v2 scope. |

---

## 12. Blocked Item (Not In Scope)

**FR-N6 — news_sentiment injection (BLOCKED):** `news_sentiment` is computed in `backend/routes/strategies.py` after `market_ctx` is populated and is never passed to `generate_narrative`. Fixing this requires adding `market_ctx["news_sentiment"] = news_sentiment` (one line) to `strategies.py` before the `_build_and_narrate` call — a route-layer change explicitly out of scope for an interpreter-only sprint. This item is tracked as a separate backlog entry: `interpreter-news-sentiment-route-fix`. It must not be implemented as a partial workaround in `interpreter.py`.

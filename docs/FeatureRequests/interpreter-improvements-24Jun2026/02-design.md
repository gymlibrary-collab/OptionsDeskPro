# Technical Design — Interpreter Narrative Improvements (v1 Sprint)

**Feature:** interpreter-improvements-24Jun2026
**Gate:** 2 — Architecture / Solution Design
**Date:** 24Jun2026
**Author:** Solution Architect
**Status:** Draft — awaiting approval

---

## 1. Scope Reminder

13 FRs across two priority bands. All changes are confined to two files:

- `backend/services/interpreter.py` — 12 FRs
- `frontend/src/components/StrategyNarrative.tsx` — 1 FR (FR-R1, label boundary fix)

No new migrations. No new environment variables. No new Python packages. No new external API calls.

---

## 2. Field Availability Findings (FR-N2 and FR-N4)

This is a prerequisite verification before the design can proceed. All three fields were traced from catalog definition through the scoring loop to the dict returned by `score_strategies()`, which is the `strategy` parameter received by `generate_narrative()`.

### 2.1 `strategy["condition_explanation"]`

**Verdict: AVAILABLE — not blocked.**

In `strategy_engine.py`, every entry in the `STRATEGIES` catalog dict defines a `"condition_explanation"` key as a string literal (confirmed at lines 38–40, 57–59, 76–78, 95–97, 114–116, 133–135, 152–154, 172–174, 191–193, 210–212, 229–231, 248–250, 267–269, 286–288, and all remaining catalog entries). The scoring loop at line 966 explicitly copies it into the result dict: `"condition_explanation": strat["condition_explanation"]`. The result dict is passed verbatim as the `strategy` parameter to `generate_narrative()`. The field is present and non-empty for all 31 catalog strategies.

**Content quality note:** These strings were written as internal engine documentation, not user-facing prose. They are concise (1–2 sentences, 80–160 characters each), technically accurate, and free of jargon. They are safe to surface directly as a prose paragraph with minimal framing. No paraphrasing is required for v1, but the implementation agent must wrap the string in a full sentence rather than printing it raw as a standalone fragment. See section 5.3 (FR-N2 approach decision) for the exact implementation pattern.

### 2.2 `strategy["designed_for_iv"]`

**Verdict: AVAILABLE — not blocked.**

Defined in every catalog entry (values: `"high"`, `"low"`, `"any"`). Copied into the result dict at line 962: `"designed_for_iv": strat["designed_for_iv"]`. Available to `generate_narrative()` as `strategy["designed_for_iv"]`.

### 2.3 `strategy["designed_for_direction"]`

**Verdict: AVAILABLE — not blocked.**

Defined in every catalog entry (values: `"bullish"`, `"bearish"`, `"neutral"`, `"any"`). Copied into the result dict at line 963: `"designed_for_direction": strat["designed_for_direction"]`. Available to `generate_narrative()` as `strategy["designed_for_direction"]`.

### 2.4 Inline match computation (FR-N4)

The strategy engine already computes `iv_condition_match` and `direction_condition_match` in the scoring loop (lines 930–931) and includes them in the result dict (lines 964–965). The interpreter could read those directly. However, the matching functions `_iv_matches()` and `_direction_matches()` live in `strategy_engine.py` and must not be imported into `interpreter.py` (the interpreter has no existing imports from that module; adding one would couple two service modules inappropriately). The correct approach is to recompute the match inline in `_why_this_strategy` using the same logic: one equality check for IV, a set-membership test for direction. The logic is four lines and has no side effects.

**Match logic to inline in `_why_this_strategy`:**

```python
designed_for_iv = strategy.get("designed_for_iv", "any")
designed_for_dir = strategy.get("designed_for_direction", "any")
iv_match = designed_for_iv == "any" or designed_for_iv.upper() == iv_env.upper()
_DIR_MAP = {
    "bullish":  {"BULLISH", "NEUTRAL_BULLISH"},
    "bearish":  {"BEARISH", "NEUTRAL_BEARISH"},
    "neutral":  {"NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH"},
    "any":      {"BULLISH", "BEARISH", "NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH"},
}
dir_match = bias in _DIR_MAP.get(designed_for_dir, set())
```

This is a pure dict literal — no import required. The `_DIR_MAP` should be defined at function scope (not module level) to keep the function self-contained.

**Note on "any" values (from spec §11.7 risk note 3):** When `designed_for_iv == "any"`, the match note must read "designed for any IV environment — conditions met by definition" rather than "IV: match" alone, so the user understands why.

---

## 3. Bearish Debit Strategy Key List (FR-B2)

The debit headline branch fires when `net < 0`. The word "upside" vs "downside" must be chosen by checking whether the strategy is directionally bearish. A strategy is bearish-debit if:

- Its `designed_for_direction` is `"bearish"`, AND
- It produces a net debit (net < 0)

From the catalog, the following keys are **bearish debit** strategies (should emit "downside exposure"):

| Key | Name |
|-----|------|
| `long_put_vertical` | Long Put Vertical Spread |
| `put_zebra` | Put ZEBRA |
| `put_butterfly` | Put Butterfly |
| `put_broken_wing_butterfly` | Put Broken Wing Butterfly |
| `put_calendar` | Put Calendar Spread |
| `reverse_big_lizard` | Reverse Big Lizard |

The following keys are **bullish debit** strategies (should emit "upside exposure", current behaviour is correct):

| Key | Name |
|-----|------|
| `long_call_vertical` | Long Call Vertical Spread |
| `call_zebra` | Call ZEBRA |
| `call_butterfly` | Call Butterfly |
| `call_broken_wing_butterfly` | Call Broken Wing Butterfly |
| `call_calendar` | Call Calendar Spread |
| `big_lizard` | Big Lizard (net debit after spread cost) |
| `poor_mans_covered_call` | Poor Man's Covered Call |

**Implementation:** In `generate_narrative()` (the `else` branch at lines 1305–1310), branch on set membership rather than string matching:

```python
_BEARISH_DEBIT_KEYS = {
    "long_put_vertical", "put_zebra", "put_butterfly",
    "put_broken_wing_butterfly", "put_calendar", "reverse_big_lizard",
}
exposure_word = "downside" if strat_key in _BEARISH_DEBIT_KEYS else "upside"
```

The set literal should be defined at the top of the `else` block, not at module level (no module-level state in this file).

---

## 4. FR-R1: LEG Format Verification

### 4.1 Single LEG format string that needs updating

There is exactly **one** uppercase `LEG {i}` format string in `interpreter.py` — at line 1080, inside `_execution_checklist`:

```
f"LEG {i} — {verb} {qty_label + ' ' if qty_label else ''}${strike:.0f} {otype.upper()} (expires {exp_fmt}): "
```

This must become:

```
f"LEG {i}: {verb} {qty_label + ' ' if qty_label else ''}${strike:.0f} {otype.upper()} (expires {exp_fmt}) "
```

The em-dash (`—`) is removed. The colon moves to immediately after the step number. The trailing colon that was after the parenthetical is removed (the body text that follows is already the explanation — no second colon needed).

### 4.2 Lines 542, 549, 558 — NOT affected

Lines 542, 549, 558 in `_trade_plain_english` also use `f"Leg {i} — ..."` notation. These are lowercase `Leg` in a prose paragraph section, not in the execution checklist. The TSX keyword parser tests `step.split(' ')[0]` against `/^(OPEN|NAVIGATE|SELECT|LEG|COMBINE|SET|MARK|HARD)/` — the uppercase regex does not match lowercase `Leg`. These three lines do not feed the execution checklist (`_trade_plain_english` returns a plain string displayed via `<Paragraphs>`). They do not need to change.

### 4.3 TSX change for FR-R1

The `StrategyNarrative.tsx` parser at line 394 already reads `colonIdx = step.indexOf(':')` and slices `label = step.slice(0, colonIdx)`. Once the interpreter emits `"LEG 1: SELL ..."`, the first colon is immediately after the `1`, so `label` becomes `"LEG 1"` and `body` becomes the rest. The TSX rendering logic already produces the right output once the interpreter format is fixed. No TSX logic change is required. The only TSX change needed is cosmetic: the rendered label appends a `:` at line 431 (`{label}:`), which is correct and requires no change.

**Conclusion:** FR-R1 is a single-file change in `interpreter.py` line 1080 only.

---

## 5. FR-N2 Approach Decision: SUPPLEMENT vs REPLACE

### 5.1 The question

Should `condition_explanation` replace the existing `core` paragraph in `_why_this_strategy`, or supplement it?

### 5.2 Analysis

The existing named-branch `core` paragraphs are well-written, educational, and specific. Examples:

- `short_strangle` core (lines 320–328): 5 sentences explaining neutral stance, premium on both sides, IV compression tailwind.
- `short_naked_put` core (lines 330–337): 5 sentences on directional bias, obligation mechanics, time decay.
- `call_butterfly` core (lines 375–382): 4 sentences on precision target, body/wing mechanics, IV pricing.

The `condition_explanation` strings are shorter (1–2 sentences, ~80–130 chars) and are written from the engine's internal perspective: they explain the IV/direction condition match, not the full strategy rationale. Examples:

- `short_strangle`: "Short strangles sell OTM premium on both sides; elevated IV produces a wider breakeven range and a larger credit, which is the mechanical design intent of this structure."
- `call_butterfly`: "Call butterflies are low-cost defined-risk structures that profit when the underlying closes near the short strikes at expiration, applicable across IV environments."

These strings add a precise conditions-match justification that the existing `core` paragraphs do not always make explicit. They are not duplicative — they are complementary.

**The generic `else` branch (lines 383–390)** lacks the specificity of named branches. For the ~11 strategy keys that fall to the generic branch, `condition_explanation` would be a meaningful improvement.

### 5.3 Decision: SUPPLEMENT — condition_explanation as a CONDITIONS RATIONALE sentence appended to `core`

**Rationale:**

1. Replacing the well-written named `core` paragraphs with 1-sentence catalog strings would reduce narrative quality for the 20+ covered strategies.
2. Supplementing adds the conditions-rationale context without removing the educational mechanics explanation.
3. The two pieces of information are distinct: the `core` paragraph explains *how* the strategy works; `condition_explanation` explains *why this IV/direction environment suits it*.
4. The generic `else` branch benefits most: `condition_explanation` effectively adds a meaningful named-branch-quality sentence to strategies that currently fall to boilerplate.

**Implementation pattern:**

In `_why_this_strategy`, after the `core` variable is assigned (in every branch, named and generic), append a conditions-rationale sentence using `condition_explanation`:

```python
cond_exp = strategy.get("condition_explanation", "")
if cond_exp:
    conditions_rationale = f"Why these conditions: {cond_exp}"
else:
    conditions_rationale = ""
```

Then include `conditions_rationale` as a paragraph in `all_parts` (between `core` and `risk_note`), only when non-empty. The phrase "Why these conditions:" is a label that signals to the user this sentence is answering the "why now?" question, distinct from the strategy mechanics.

This approach is also syntactically safe for the generic branch, where `condition_explanation` comes directly from the catalog and will always be present.

---

## 6. Implementation Sequence

The order follows the spec's §11.6 risk-ascending P1 sequence, then P2 in dependency order. Changes that touch the same function are grouped to minimise the number of times any function is opened.

```
Step  FR           Function(s) touched                         Risk
----  -----------  ------------------------------------------  ------
1     FR-B4/R2     _why_this_strategy (lines 303-309)          Zero — remove 4 chars per line
2     FR-B3        _why_this_strategy (lines 312-317)          Minimal — single if/else
3     FR-B6        _execution_checklist (line 1138)            Minimal — one variable substitution
4     FR-B1        _execution_checklist (lines 1172-1181)      Low — one branch around close_date_days
5     FR-B2        generate_narrative (lines 1305-1310)        Low — branch on set membership
6     FR-C6        _execution_checklist (lines 991-997)        Low — branch on risk_type
7     FR-R1        _execution_checklist (line 1080)            Low — em-dash → colon format change
8     FR-G5        _iv_context (lines 183-188)                 Low — append one sentence to base
9     FR-C5        _profit_scenario (lines 694-699)            Minimal — string substitution
10    FR-C1        _loss_scenario (lines 782-787)              Low — branch on dte
11    FR-E1        _trade_plain_english (after line 489)       Low — read and inject one field
12    FR-N2        _why_this_strategy (after core assignment)  Low — append paragraph from field
13    FR-N4        _why_this_strategy (after FR-N2 insertion)  Low — inline match logic + note
```

Steps 1–7 (P1) should be implemented and reviewed together before steps 8–13 (P2) begin, per the PO boundary in spec §11.6.

Steps 12 and 13 both modify `_why_this_strategy` and must be done in the same pass to avoid conflicts. Step 12 (FR-N2) adds the `conditions_rationale` paragraph; step 13 (FR-N4) adds the conditions-match note. These are separate paragraphs and must not be merged into one — they serve different purposes (N2 = "why the IV/direction environment suits this structure", N4 = "does the current environment actually match what the strategy needs?").

Steps 1 and 2 both modify the same block in `_why_this_strategy` (lines 303–317) and must be done in the same pass.

---

## 7. Function-by-Function Change Plan

### 7.1 `_why_this_strategy` — steps 1, 2, 12, 13

**FR-B4/R2 (step 1):** Lines 304 and 308 contain `**defined-risk**` and `**undefined-risk**`. Replace with `DEFINED-RISK` and `UNDEFINED-RISK` (plain uppercase). No logic change — string replacement only.

Before:
```python
f"It is a **defined-risk** trade — no matter what {symbol} does..."
...
f"It is an **undefined-risk** trade — losses can theoretically grow..."
```

After:
```python
f"It is a DEFINED-RISK trade — no matter what {symbol} does..."
...
f"It is an UNDEFINED-RISK trade — losses can theoretically grow..."
```

**FR-B3 (step 2):** Lines 312–317 define `pop_note` with unconditional "wins more often than it loses" text. Add a branch:

```python
if pop_range[0] >= 50:
    pop_note = (
        f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}%, "
        f"meaning that statistically, this trade wins more often than it loses. "
        f"A common approach is to put on many high-probability trades, take losses when they happen, "
        f"and let the math work over time."
    )
else:
    pop_note = (
        f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}% — "
        f"this trade wins less often than it loses by design. "
        f"The strategy is sized so that when it does win, the gain more than offsets the more frequent smaller losses. "
        f"Correct position sizing and discipline on loss limits are essential for this structure to be positive-expectancy."
    )
```

**FR-N2 (step 12):** After the `core` variable is assigned (all branches complete), add:

```python
cond_exp = strategy.get("condition_explanation", "")
conditions_rationale = f"Why these conditions: {cond_exp}" if cond_exp else ""
```

Add `conditions_rationale` to `all_parts` immediately after `core` (before `risk_note`), skipping it if empty:

```python
all_parts = [core]
if conditions_rationale:
    all_parts.append(conditions_rationale)
all_parts += [risk_note, pop_note, complexity_note] + extra_confirmations
```

**FR-N4 (step 13):** After `designed_for_iv` and `designed_for_direction` are read from the strategy dict, compute match inline and build a conditions-match note:

```python
designed_for_iv = strategy.get("designed_for_iv", "any")
designed_for_dir = strategy.get("designed_for_direction", "any")

iv_match = designed_for_iv == "any" or designed_for_iv.upper() == iv_env.upper()

_DIR_MAP = {
    "bullish":  {"BULLISH", "NEUTRAL_BULLISH"},
    "bearish":  {"BEARISH", "NEUTRAL_BEARISH"},
    "neutral":  {"NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH"},
    "any":      {"BULLISH", "BEARISH", "NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH"},
}
dir_match = bias in _DIR_MAP.get(designed_for_dir, set())

iv_label = iv_env  # "HIGH", "MEDIUM", or "LOW"
if designed_for_iv == "any":
    iv_cond_note = f"IV conditions: designed for any IV environment — conditions met by definition"
else:
    iv_cond_note = f"IV conditions: {iv_label} (strategy designed for {designed_for_iv.upper()} IV) — {'match' if iv_match else 'MISMATCH — strategy recommended despite sub-optimal IV environment'}"

dir_label = bias_clean
if designed_for_dir == "any":
    dir_cond_note = f"Direction conditions: designed for any directional bias — conditions met by definition"
else:
    dir_cond_note = f"Direction conditions: {dir_label} (strategy designed for {designed_for_dir} bias) — {'match' if dir_match else 'MISMATCH — strategy recommended despite sub-optimal directional conditions'}"

conditions_match_note = f"Conditions check:\n{iv_cond_note}\n{dir_cond_note}"
```

Add `conditions_match_note` to `all_parts` after `conditions_rationale` (FR-N2) and before `risk_note`. The final `all_parts` assembly with all additions:

```python
all_parts = [core]
if conditions_rationale:
    all_parts.append(conditions_rationale)
all_parts.append(conditions_match_note)
all_parts += [risk_note, pop_note, complexity_note] + extra_confirmations
```

### 7.2 `_execution_checklist` — steps 3, 4, 6, 7

**FR-B6 (step 3):** Line 1138 hardcodes `close_credit = abs_net * 0.5`. The variable `profit_target_pct` is already read from the trade dict at line 976. Change:

```python
# Before:
close_credit = abs_net * 0.5

# After:
close_credit = abs_net * (profit_target_pct / 100)
```

Also update the prose strings in the GTC debit block (lines 1139–1146) that currently say "50%" and "50% of your cost" to use `{profit_target_pct}%` dynamically. The variable is already in scope.

**FR-B1 (step 4):** Lines 1172–1181. Add branch:

```python
close_date_days = dte - 21
if close_date_days <= 0:
    if dte == 0:
        steps.append(
            "MARK YOUR CALENDAR: this trade expires TODAY — close the position immediately if you have not already done so. "
            "Go to Positions in your broker and close all legs now."
        )
    else:
        steps.append(
            f"MARK YOUR CALENDAR: NOTE — this trade is already inside 21 DTE ({dte} days remaining). "
            f"Apply the 21-DTE close rule immediately: the trade is in its active management phase. "
            f"Monitor P&L intraday and close as soon as your profit target is reached. "
            f"Do not hold past expiration — go to Positions in your broker and close all legs once the target is met."
        )
else:
    steps.append(
        f"MARK YOUR CALENDAR: set a reminder for {close_date_days} days from today "
        f"(that will be approximately 21 DTE — 21 days before {exp_fmt}). "
        f"A well-established rule: close ALL positions at 21 DTE regardless of profit or loss. "
        f"Inside 21 days, gamma risk accelerates sharply — small stock moves cause outsized option "
        f"price changes, and the risk/reward of holding further no longer justifies it. "
        f"To close: go to Positions → select this trade → click 'Close' or 'Buy to Close' (for short positions). "
        f"Even if the trade is at a loss at that point, close it and move on."
    )
```

**FR-C6 (step 6):** Lines 991–997. The OPEN step currently ends with `"options approval level 2 or higher"` unconditionally. Add a branch at the start of `_execution_checklist`, before the step is appended, using `risk_type` from the trade dict:

```python
risk_type = trade.get("risk_type", "DEFINED")
# ... (dte, net, etc. are already read above)

# Determine approval level
is_naked = risk_type == "UNDEFINED" and not has_stock_leg
# (has_stock_leg is defined later in the function — reorder: compute it before the OPEN step)
approval_level = (
    "level 3 or higher (required for naked short options — contact your broker if you are not yet approved for Level 3)"
    if is_naked
    else "level 2 or higher"
)
```

The OPEN step string becomes:

```python
f"...make sure you have options trading enabled on your account (a one-time setup "
f"if you haven't already — brokers call it 'options approval {approval_level}')."
```

Implementation note: `has_stock_leg` is currently defined at line 982, after the first step is appended. The OPEN step must be moved to after `has_stock_leg` is computed, or `has_stock_leg` computation must be moved earlier. The simplest fix is to hoist the `has_stock_leg` and `option_legs` derivations to the top of the function (before any `steps.append` call). They have no dependencies on anything below them.

**FR-R1 (step 7):** Line 1080. Change:

```python
# Before:
f"LEG {i} — {verb} {qty_label + ' ' if qty_label else ''}${strike:.0f} {otype.upper()} (expires {exp_fmt}): "

# After:
f"LEG {i}: {verb} {qty_label + ' ' if qty_label else ''}${strike:.0f} {otype.upper()} (expires {exp_fmt}) "
```

The colon moves to after `{i}`. The em-dash is removed. The parenthetical no longer carries a trailing colon — the body explanation follows with a space separator. The TSX parser will find the first colon at position 5 (`"LEG 1:"`) and correctly slice label=`"LEG 1"` and body=the rest.

### 7.3 `_iv_context` — step 8

**FR-G5 (step 8):** The `base` paragraph (lines 183–188) ends with `"The current implied volatility is {iv_pct:.1f}%."`. Append one sentence naming the environment category:

```python
iv_env_label = "LOW" if ivr < 30 else ("MEDIUM" if ivr <= 50 else "HIGH")
base = (
    f"IV Rank (IVR) is currently {ivr:.0f} out of 100. "
    f"IVR measures where today's implied volatility sits relative to the past 52 weeks — "
    f"a reading of {ivr:.0f} means options are currently priced higher than {ivr:.0f}% of all days "
    f"in the past year. The current implied volatility is {iv_pct:.1f}%. "
    f"This places {symbol} in a {iv_env_label} implied volatility environment."
)
```

The `iv_env_label` variable should be computed immediately before `base` is built. Do not import from `iv_analysis.py` — recompute from `ivr` directly (the thresholds are identical to what `iv_analysis.py` uses: < 30 = LOW, 30–50 = MEDIUM, > 50 = HIGH).

### 7.4 `_profit_scenario` — step 9

**FR-C5 (step 9):** Lines 694–699. The `pop_note` string contains "Over a large sample of similar trades, this is a positive-expectancy strategy." Replace that clause:

```python
pop_note = (
    f"Based on the delta of the short strikes, this setup has an estimated {pop_range[0]}–{pop_range[1]}% "
    f"theoretical probability of being profitable at expiration — derived from options delta theory, not historical backtesting. "
    f"This is a positive-expectancy structure — you will have losing trades, "
    f"but the winners should more than offset them when managed consistently."
)
```

### 7.5 `_loss_scenario` — step 10

**FR-C1 (step 10):** Lines 782–787. The `monitor` paragraph is unconditional. `dte` is already computed at line 479 and passed into this function via the `trade` dict (`expiry` field). Read DTE at the top of `_loss_scenario` and branch:

```python
expiry = trade.get("expiry", "")
dte = _days_to_expiry(expiry)

if dte <= 21:
    monitor = (
        f"NOTE: this trade is already inside 21 DTE ({dte} days remaining) — it is now in its active management phase. "
        f"Monitor P&L intraday rather than daily. "
        f"Close the position as soon as your profit target is reached — do not hold for the last few percent of gain. "
        f"Gamma risk is accelerating: small moves in {symbol} will cause outsized swings in position value. "
        f"If the trade is at a loss, close it now rather than riding to expiration."
    )
else:
    monitor = (
        f"During the life of the trade, monitor it daily in the final two weeks. "
        f"A common guideline is to close any trade that has reached 21 DTE (21 days to expiration) "
        f"regardless of profit or loss — the risk/reward deteriorates sharply inside 21 days "
        f"due to accelerating gamma, which makes short options much more sensitive to price moves."
    )
```

### 7.6 `_trade_plain_english` — step 11

**FR-E1 (step 11):** After the synthetic-data notice check (lines 482–490), and before the `"Here is exactly what this trade looks like, leg by leg:"` paragraph, insert:

```python
earnings_note = trade.get("earnings_note")
if earnings_note:
    sections.append(earnings_note)
```

This must be inserted before the `sections.append(f"Here is exactly what this trade looks like, leg by leg:")` call so the earnings note appears as the first or second paragraph (after the synthetic notice if present, before the leg walk-through). The spec §7 edge case table confirms: if `earnings_note` is non-null, inject it at the top of `_trade_plain_english`.

### 7.7 `generate_narrative` — step 5

**FR-B2 (step 5):** In the `else` branch of the headline builder (lines 1305–1310), add a set and branch:

```python
_BEARISH_DEBIT_KEYS = {
    "long_put_vertical", "put_zebra", "put_butterfly",
    "put_broken_wing_butterfly", "put_calendar", "reverse_big_lizard",
}
exposure_word = "downside" if strat_key in _BEARISH_DEBIT_KEYS else "upside"
headline = (
    f"{symbol} — Buy a {strat_name} expiring {expiry} ({dte}d). "
    f"Pay ${net_dollars:.0f} for defined {exposure_word} exposure "
    f"with IVR {ivr:.0f} ({iv_word}) and a {bias_clean} market."
)
```

---

## 8. No Migration Required

This sprint makes no schema changes. The interpreter is a stateless pure-Python module. No Supabase tables, no new columns, no new environment variables, no new Python packages.

---

## 9. No New External API Calls

The interpreter has no external dependencies and this sprint adds none. All inputs arrive via parameters from the calling route. The three-tier fallback chain (yfinance → synthetic Black-Scholes) is unchanged.

---

## 10. Invariants Preserved

| Invariant | Status |
|-----------|--------|
| No AI / no approximations — all text is deterministic f-strings | Preserved — no LLM calls introduced |
| No `SUPABASE_JWT_SECRET` | Not touched |
| No `MARKETDATA_API_TOKEN` | Not touched |
| `get_supabase()` only inside function calls | Not touched (interpreter.py has no Supabase calls) |
| No new Python imports | Confirmed — no import statements added |
| `_safe_int()` for yfinance volume/openInterest | Not touched |
| Market Data App integration stays removed | Not touched |

---

## 11. Files Changed

| File | Change Type | FRs |
|------|-------------|-----|
| `backend/services/interpreter.py` | Modify — 12 targeted edits across 5 functions | FR-B1, FR-B2, FR-B3, FR-B4/R2, FR-B6, FR-C1, FR-C5, FR-C6, FR-E1, FR-G5, FR-N2, FR-N4 |
| `frontend/src/components/StrategyNarrative.tsx` | No change required | FR-R1 (interpreter format change is sufficient) |

`StrategyNarrative.tsx` requires no code changes. The existing TSX label-slicing logic at lines 391–396 correctly handles `"LEG 1: SELL ..."` once the interpreter emits the updated format. The rendered output will bold `"LEG 1"` and leave the rest as body text — which is the intended behaviour.

---

## 12. ADR

One architectural decision in this sprint warrants an ADR entry.

**ADR-0011: condition_explanation supplements rather than replaces interpreter core paragraphs**

The decision to use `condition_explanation` as a supplementary "Why these conditions:" paragraph rather than replacing the existing named `core` paragraphs is recorded in `/home/user/OptionsDeskPro/docs/adr/0011-condition-explanation-supplement-not-replace.md`.

The key trade-off: the catalog strings are accurate and concise but were written as internal engine documentation (averaging 1–2 sentences). The named `core` paragraphs are user-facing prose (averaging 4–5 sentences) explaining strategy mechanics to beginners. Replacing the longer named paragraphs with the shorter catalog strings would reduce educational value. Supplementing adds the conditions-rationale context without degrading existing prose quality. For the 11 strategies that currently fall to the generic `else` branch, supplementing effectively upgrades their specificity to near-named-branch quality.

---

## 13. Blocked Items

None. All 13 v1 FRs are implementable within the confirmed file scope.

The one blocked item from the full backlog — FR-N6 (news_sentiment dropped before `generate_narrative()`) — is correctly deferred to a separate backlog item requiring a one-line change to `backend/routes/strategies.py`. It is not in this sprint and does not block any of the 13 items above.

---

## 14. Design Summary (Approval Checklist)

| Item | Answer |
|------|--------|
| New database migrations? | No |
| New environment variables? | No |
| New Python packages? | No |
| New external API calls? | No |
| Frontend files changed? | No (StrategyNarrative.tsx requires no code change) |
| Backend files changed? | Yes — `backend/services/interpreter.py` only |
| Blocked FRs in v1 scope? | None |
| `condition_explanation` field confirmed available? | Yes — line 966 of strategy_engine.py |
| `designed_for_iv` field confirmed available? | Yes — line 962 of strategy_engine.py |
| `designed_for_direction` field confirmed available? | Yes — line 963 of strategy_engine.py |
| Single LEG format string to update? | Yes — line 1080 only; lines 542/549/558 are unaffected (different function, lowercase, non-checklist) |
| Markdown `**` occurrences in interpreter.py? | Two — lines 304 and 308 only |
| Deterministic f-string-only narrative? | Yes — no LLM or runtime approximations introduced |

# Technical Design — Interpreter Narrative Improvements v2

**Feature:** interpreter-improvements-v2-24Jun2026
**Gate:** 2 — Architecture
**Date:** 24Jun2026
**Author:** Solution Architect
**Status:** APPROVED

---

## 1. Overview

All 10 P1 changes are confined to `backend/services/interpreter.py`. There are no new API endpoints, no schema migrations, no new environment variables, no new Python packages, and no frontend changes. The function signatures of `generate_narrative()` and all private helpers remain identical — callers in `backend/routes/strategies.py` are unaffected.

The changes cluster across five functions:

| Function | FR items |
|----------|---------|
| `_market_snapshot()` | FR-B5, FR-G11 |
| `_iv_context()` | FR-D6 |
| `generate_narrative()` headline block | FR-C7 |
| `_why_this_strategy()` | FR-G1, FR-E3 (partial) |
| `_trade_plain_english()` | FR-C2, FR-C3 |
| `_loss_scenario()` | FR-G8 |
| `_profit_scenario()` | FR-E3 (partial) |
| `_defensive_tactic()` | FR-G3 |

No cross-function data threading is required: all inputs that each function needs are already present in the dicts it already receives.

---

## 2. Detailed Design by FR

### FR-B5 — SMA Zero-Data Guard in `_market_snapshot()`

**Location:** `_market_snapshot()`, lines 24–59

**Current behaviour:** When `sma20 == 0` and `sma50 == 0`, both `above_20` and `above_50` evaluate to `None` (falsy). The `not above_20 and not above_50` branch fires and produces: `"0.0% below its 20-day moving average ($0.00)"`. This is a broken sentence in the rendered UI.

**Change:** Add an early guard before the four MA branches. If both SMAs are zero, replace the entire MA block with a single sentence and skip to the RSI line.

```python
# BEFORE (lines 29–59 — four MA branches always run)
if above_20 and above_50:
    ma_line = (
        f"{symbol} is trading at ${price:.2f}, sitting {abs(gap_20):.1f}% above its 20-day..."
    )
elif not above_20 and not above_50:
    ma_line = (
        f"{symbol} is trading at ${price:.2f}, sitting {abs(gap_20):.1f}% below its 20-day..."
    )
# ... two more branches

# AFTER — insert before the if/elif chain:
if sma20 == 0 and sma50 == 0:
    ma_line = (
        f"Moving average data unavailable for {symbol} — 20-day and 50-day SMA values "
        f"could not be retrieved (common for illiquid tickers or new listings). "
        f"The directional bias below is derived from RSI only."
    )
else:
    if above_20 and above_50:
        ma_line = (
            f"{symbol} is trading at ${price:.2f}, sitting {abs(gap_20):.1f}% above its 20-day..."
        )
    # ... rest of original branches unchanged
```

RSI and strength lines are unaffected — they appear after `ma_line` is set and are not gated on SMA availability.

**Risk:** None. The guard is a simple numeric equality check. The `else` path preserves all existing behaviour.

---

### FR-G11 — Earnings Urgency Branching in `_market_snapshot()`

**Location:** `_market_snapshot()`, lines 147–153

**Current behaviour:** A single branch fires for any `days_earn` in `0..30`, producing `"reports earnings in approximately {days_earn} days"`. When `days_earn == 0` this reads "approximately 0 days" — grammatically broken and conveys no urgency.

**Change:** Replace the single branch with a numeric branch on `days_earn <= 3`:

```python
# BEFORE (lines 147–153)
if days_earn is not None and 0 <= days_earn <= 30:
    extra_paras.append(
        f"EARNINGS ALERT: {symbol} reports earnings in approximately {days_earn} "
        f"day{'s' if days_earn != 1 else ''}. "
        f"Earnings events typically cause implied volatility to spike..."
    )

# AFTER
if days_earn is not None and 0 <= days_earn <= 30:
    if days_earn <= 3:
        day_phrase = (
            "today or tomorrow"
            if days_earn == 0
            else f"within the next {days_earn} day{'s' if days_earn != 1 else ''}"
        )
        extra_paras.append(
            f"EARNINGS IMMINENT: {symbol} reports earnings {day_phrase}. "
            f"IV crush risk is immediate — implied volatility will collapse the moment the "
            f"announcement is made. Strongly consider whether to close or avoid any new position "
            f"before the event. If already in a position, review your exposure now."
        )
    else:
        extra_paras.append(
            f"EARNINGS ALERT: {symbol} reports earnings in approximately {days_earn} "
            f"day{'s' if days_earn != 1 else ''}. "
            f"Earnings events typically cause implied volatility to spike in the days leading up "
            f"to the announcement and then sharply collapse immediately afterward (known as the "
            f"'IV crush'). Any strategy you put on now will be heavily influenced by this event — "
            f"factor in whether your expiry straddles the earnings date before entering."
        )
```

**Risk:** Low. The 0-day case edge (`days_earn == 0`) now produces "today or tomorrow" rather than "approximately 0 days". The urgency copy is new text for the `<= 3` branch only; the `> 3` path is word-for-word identical to the current implementation.

---

### FR-D6 — HV Zero-Data Explicit Notice in `_iv_context()`

**Location:** `_iv_context()`, lines 193–210

**Current behaviour:** `if hv_30 > 0:` silently skips the HV comparison paragraph when `hv_30 == 0`. The user jumps from the IVR base sentence straight to the interpretation paragraph with no explanation.

**Change:** Add an `else` clause:

```python
# BEFORE (lines 193–210)
hv_line = ""
if hv_30 > 0:
    hv_line = (
        f"\n\nFor context, the stock's actual 30-day historical volatility..."
    )
    if hv_high > 0 and hv_low > 0:
        hv_line += f" Over the past 52 weeks, realised volatility has ranged..."

# AFTER
hv_line = ""
if hv_30 > 0:
    hv_line = (
        f"\n\nFor context, the stock's actual 30-day historical volatility..."
    )
    if hv_high > 0 and hv_low > 0:
        hv_line += f" Over the past 52 weeks, realised volatility has ranged..."
else:
    hv_line = (
        "\n\n30-day historical volatility data is unavailable for this symbol — "
        "the IV vs HV comparison cannot be shown. This is common for new listings, "
        "short-history ETFs, or symbols where the options chain was generated synthetically."
    )
```

**Risk:** None. The `else` fires only when `hv_30 == 0`; the existing `if hv_30 > 0` path is unchanged.

---

### FR-C7 — HV Zero Headline Guard in `generate_narrative()`

**Location:** `generate_narrative()`, lines 1389–1395

**Current behaviour:** The HIGH IV credit headline unconditionally includes `{hv_30:.1f}% HV`. When `hv_30 == 0` this produces "0.0% HV" — factually misleading.

**Change:** Guard the HV clause:

```python
# BEFORE (lines 1390–1395)
if iv_env == "HIGH":
    headline = (
        f"{symbol} — Sell a {strat_name} expiring {expiry} ({dte}d). "
        f"Collect ${net_dollars:.0f} premium with IV elevated at IVR {ivr:.0f} "
        f"({iv_pct:.1f}% IV vs {hv_30:.1f}% HV). Market is {bias_clean}."
    )

# AFTER
if iv_env == "HIGH":
    hv_clause = f" vs {hv_30:.1f}% HV" if hv_30 > 0 else ""
    headline = (
        f"{symbol} — Sell a {strat_name} expiring {expiry} ({dte}d). "
        f"Collect ${net_dollars:.0f} premium with IV elevated at IVR {ivr:.0f} "
        f"({iv_pct:.1f}% IV{hv_clause}). Market is {bias_clean}."
    )
```

**Risk:** None. The guard is a single conditional string. The non-HIGH IV and debit headline branches are untouched.

**Coupling note:** FR-D6 and FR-C7 both address `hv_30 == 0` but in different code paths — FR-D6 is in `_iv_context()` (section body), FR-C7 is in `generate_narrative()` (headline). They must be tested together.

---

### FR-G8 — Short Call vs Short Put Loss Distinction in `_loss_scenario()`

**Location:** `_loss_scenario()`, lines 802–811 (the `else` block for undefined-risk trades)

**Current behaviour:** All undefined-risk trades produce "In theory, if {symbol} moves far enough against you, the loss can be substantial." This is inaccurate for short puts (which have a finite maximum loss) and inadequate for short calls (which carry unlimited theoretical loss).

**Change:** Inside the undefined-risk `else` block, inspect `legs` to determine whether the primary short leg is a call or a put, then branch:

```python
# BEFORE (lines 802–811)
else:
    loss_frame = (
        f"This is an undefined-risk trade, which means there is no hard ceiling on losses. "
        f"In theory, if {symbol} moves far enough against you, the loss can be substantial. "
        f"A common way to manage this risk follows two rules:\n"
        ...
    )

# AFTER
else:
    short_calls = [l for l in legs if l.get("action") == "sell"
                   and l.get("option_type") == "call"
                   and l.get("option_type") != "stock"]
    short_puts  = [l for l in legs if l.get("action") == "sell"
                   and l.get("option_type") == "put"]

    if short_calls and not short_puts:
        # Pure short call position — theoretically unlimited loss
        unlimited_note = (
            f"In theory, a short call carries unlimited loss potential — if {symbol} rises "
            f"without limit, so does your loss. There is no ceiling. "
            f"This is the most important risk to understand about this structure: "
            f"unlike a short put, where the stock can only fall to zero, a stock can "
            f"theoretically rise without bound."
        )
    elif short_puts and not short_calls:
        # Pure short put — loss is finite (capped at strike × 100)
        max_put_strike = max(l.get("strike", 0) for l in short_puts)
        finite_max = max_put_strike * 100
        unlimited_note = (
            f"Your worst-case loss is not unlimited: because a stock cannot fall below zero, "
            f"a short put's maximum possible loss is approximately ${finite_max:.0f} per contract "
            f"(the ${max_put_strike:.0f} strike × 100 shares, if the stock fell to zero). "
            f"While ${finite_max:.0f} is a large number, it is a finite and quantifiable risk — "
            f"very different from the theoretically unlimited loss of a short call."
        )
    else:
        # Mixed structure (e.g. short strangle, straddle) — both sides present
        unlimited_note = (
            f"This position contains a short call, which means the upside loss is theoretically "
            f"unlimited — the stock can rise without bound. The short put side is bounded (capped "
            f"at approximately strike × 100 if the stock fell to zero), but the call side is not. "
            f"Treat this position as unlimited-risk for sizing purposes."
        )

    loss_frame = (
        f"This is an undefined-risk trade. {unlimited_note} "
        f"A common way to manage this risk follows two rules:\n"
        f"1. Position sizing: never let this trade represent more than 1–3% of your total portfolio value.\n"
        f"2. The 2× rule: if the trade has lost 2× the credit you collected (i.e. you collected "
        f"${abs(net)*100:.0f} and the trade is now showing a ${abs(net)*200:.0f} loss), close it "
        f"immediately without hesitation. Do not hope for a recovery."
    )
```

**Risk:** The inspection of `legs` is simple list comprehension with no external calls. One edge case to handle explicitly: a position where `short_calls` and `short_puts` are both empty (e.g. a ratio spread where the extra short is embedded and option_type detection is unreliable). The `else` branch of the inner if/elif/else covers this by defaulting to the unlimited-risk framing — which is the conservative choice.

---

### FR-C2 — Margin Notice for Undefined-Risk Trades in `_trade_plain_english()`

**Location:** `_trade_plain_english()`, after line 567 (after the earnings DTE note, before the leg consolidation loop)

**Current behaviour:** No mention of margin or buying power requirement for any trade type.

**Change:** After the existing context blocks (synthetic note, earnings note, ATR note), inject a margin notice for undefined-risk trades that are not covered calls. The `risk_type` is available on the `trade` dict; the strategy key (to identify covered calls) is also on `trade`.

```python
# INSERT after the existing earnings-within-window note (after line 567):
risk_type_tpe = trade.get("risk_type", "DEFINED")
strat_key_tpe = trade.get("strategy_key", trade.get("strategy", ""))
_COVERED_CALL_KEYS = {"covered_call"}
if risk_type_tpe == "UNDEFINED" and strat_key_tpe not in _COVERED_CALL_KEYS:
    # Find the highest short strike for the worked example
    short_option_legs = [
        l for l in legs
        if l.get("action") == "sell" and l.get("option_type") != "stock"
    ]
    if short_option_legs:
        example_strike = max(l.get("strike", 0) for l in short_option_legs)
        margin_example = f"${example_strike * 0.20 * 100:.0f}–${example_strike * 0.25 * 100:.0f}"
    else:
        margin_example = "20–25% of the notional value of the short strike(s)"
    sections.append(
        f"MARGIN NOTICE: undefined-risk positions require margin reserved in your broker account. "
        f"As a rule of thumb, expect 20–25% of the notional value of the short strike(s) to be held "
        f"as buying power. For this trade (short strike ~${example_strike:.0f}): approximately "
        f"{margin_example} per contract will be reserved. "
        f"Verify the exact requirement in your broker's margin calculator before placing the order — "
        f"actual margin varies by broker and account type."
    )
```

**Risk:** The `example_strike` lookup uses `max()` on short legs. If `short_option_legs` is empty (edge case for a degenerate trade dict), the `if short_option_legs` guard falls back to a generic string without crashing. The `sections.append()` placement must come after the `sections.append("Here is exactly what this trade looks like, leg by leg:")` line to preserve the structural ordering, or before it — the spec says it belongs in the "The Trade in Simple Terms" section, not as a preamble. Placing it immediately before the "Here is exactly what this trade looks like" line keeps it contextually grouped with the trade structure notes.

---

### FR-C3 — Long-Leg "Defines and Caps" Qualification in `_trade_plain_english()`

**Location:** `_trade_plain_english()`, line 618

**Current behaviour:** Every BUY leg, unconditionally, appends "This leg defines and caps your maximum risk on the trade."

**Change:** Condition the text on `risk_type`:

```python
# BEFORE (line 618)
f"This leg defines and caps your maximum risk on the trade."

# AFTER — replace the fixed string with a conditional:
risk_type_leg = trade.get("risk_type", "DEFINED")
long_leg_risk_note = (
    "This leg defines and caps your maximum risk on the trade."
    if risk_type_leg != "UNDEFINED"
    else "This long leg partially offsets your short obligation but does not fully cap "
         "the overall position risk — the trade remains undefined-risk overall."
)
# then use long_leg_risk_note in the f-string at line 618
```

In practice the `risk_type_leg` variable should be computed once before the leg loop (it does not vary per leg). The loop body at line 618 references it via the variable.

**Risk:** None. The guard is a single string substitution. The `!= "UNDEFINED"` condition means that DEFINED, and any unrecognised value, all produce the original "defines and caps" text — conservative default.

---

### FR-G1 — Named `_why_this_strategy()` Branches for Five Missing Keys

**Location:** `_why_this_strategy()`, lines 329–400 (the if/elif/else chain)

**Current behaviour:** `call_zebra`, `put_zebra`, `call_calendar`, `put_calendar`, and `collar` all fall to the generic `else` block which produces `"The {strat_name} is structured to perform in a {iv_word} IV environment..."` — accurate but non-specific to their mechanics.

**Change:** Insert five new `elif` branches before the generic `else`, each with strategy-specific language. They should be inserted after the existing `call_butterfly` / `put_butterfly` branch (line 384) and before the generic `else` (line 393).

```python
# INSERT before the generic else (after line 400):

elif key in ("call_zebra",):
    core = (
        f"The {strat_name} (Zero-Extrinsic-value Back-Ratio Acquisition) is a leveraged "
        f"directional structure. By buying two calls and selling one deeper-ITM call, you construct "
        f"a position that behaves like a long call but with roughly 2× the delta response — "
        f"gaining approximately $2 for every $1 {symbol} rises above the long strikes. "
        f"The net debit is typically small (sometimes near zero) because the short deep-ITM call "
        f"offsets much of the cost. The trade is appropriate here because the bias is {bias_clean} "
        f"and you want leveraged directional exposure without paying full long-call premium. "
        f"With IVR at {ivr:.0f}, the ZEBRA structure is {'attractively priced — low IV keeps the debit small' if iv_env != 'HIGH' else 'worth the premium given the directional conviction'}."
    )
elif key in ("put_zebra",):
    core = (
        f"The put {strat_name} is the bearish mirror of the call ZEBRA: by buying two puts and "
        f"selling one deeper-ITM put, you build a structure that gains approximately $2 for every $1 "
        f"{symbol} falls below the long strikes. It behaves like a leveraged long-put position "
        f"with roughly 2× the directional sensitivity of a standard put. "
        f"The net debit is typically small because the short deep-ITM put offsets much of the cost. "
        f"With a {bias_clean} bias and IVR at {ivr:.0f}, the put ZEBRA is appropriate for traders "
        f"who want amplified downside exposure with a defined and modest upfront cost."
    )
elif key in ("call_calendar", "put_calendar"):
    option_type_word = "call" if key == "call_calendar" else "put"
    core = (
        f"The {strat_name} is a vega and theta trade, not primarily a directional one. "
        f"By selling a near-term {option_type_word} and buying a longer-dated {option_type_word} "
        f"at the same strike, you collect the faster time-decay of the front-month leg "
        f"while holding the slower-decaying back-month leg. The position profits when {symbol} "
        f"stays near the strike — the front-month option expires worthless (or is bought back cheaply) "
        f"and the back-month option retains its value. "
        f"Calendars also benefit from a rise in implied volatility (they are net long vega) — "
        f"if IV expands after entry, the back-month leg gains more value than the short front-month loses. "
        f"At IVR {ivr:.0f}, {'a low-IV environment makes calendars particularly attractive: you are buying the back-month option cheaply while selling the front-month.' if iv_env == 'LOW' else 'the IV environment is supportive of this structure.'}"
    )
elif key in ("collar",):
    core = (
        f"The {strat_name} is a capital-preservation structure for shareholders. "
        f"By selling an out-of-the-money call against an existing long stock position "
        f"and using that premium to purchase a protective put, you create a defined range: "
        f"the put sets a floor on your downside loss, and the call caps your upside gain "
        f"in exchange for the income it generates. "
        f"The net cost of the collar is typically low (sometimes zero or a small credit) "
        f"because the call premium offsets the put cost. "
        f"This is appropriate when the primary goal is protecting an existing {symbol} position "
        f"rather than speculating on direction. With IVR at {ivr:.0f}, "
        f"{'the call premium collected is above average — an attractive time to sell the covered call component' if iv_env == 'HIGH' else 'the call premium is at fair or below-average levels, but the protective structure may still be worth the cost for risk management purposes'}."
    )
```

**Risk:** The five key strings must exactly match those used by `strategy_engine.py`. These are already confirmed present in `_BEARISH_DEBIT_KEYS` and `_defensive_tactic` (e.g. `call_calendar`, `put_calendar`, `call_zebra`, `put_zebra`). The `collar` key is referenced in the spec's confirmed-missing key list. Verify against the 31-strategy catalog in `backend/services/strategy_engine.py` before implementation.

**Content writing note:** These five branches represent the bulk of narrative content to write. Each needs to be accurate to the actual mechanics of the strategy. The call/put_calendar branch uses a single `elif` with `key in ("call_calendar", "put_calendar")` and a small ternary to vary the option type word — this avoids near-duplicate code.

---

### FR-G3 — Named `_defensive_tactic()` Entries for Five Missing Keys

**Location:** `_defensive_tactic()`, `tactics` dict, lines 860–964

**Current behaviour:** `call_butterfly`, `put_butterfly`, `short_naked_call`, `call_calendar`, and `put_calendar` all fall to the generic fallback.

**Change:** Add five new entries to the `tactics` dict:

```python
# INSERT into the tactics dict (after "put_zebra" entry, before the closing brace):

"call_butterfly": (
    "A call butterfly profits most when {symbol} lands near the body strike at expiration. "
    "If the stock moves significantly away from that body strike — either direction — the position "
    "loses value. The primary adjustment for a losing butterfly is to close it early: "
    "if the spread has lost 50% of what you paid, exit and take the defined loss rather than "
    "riding to maximum loss. Do not roll a butterfly — the structure's value depends entirely "
    "on the stock staying pinned near the body, and rolling changes that target price. "
    "If the stock is approaching expiry near the body strike (a winning scenario), be aware of "
    "pin risk: if {symbol} expires exactly at the short strike, you may be assigned on the short "
    "options while your long options expire worthless. Close the entire position before expiry, "
    "not at expiry."
),
"put_butterfly": (
    "A put butterfly profits most when the stock lands near the body strike at expiration. "
    "If the stock moves away from that body strike in either direction, the position decays toward "
    "zero value. The correct response is early exit: close the spread if it has lost 50% of the "
    "premium paid — do not hold for maximum loss hoping for a mean-reversion. "
    "Do not roll a butterfly — rolling changes the target price and defeats the structure. "
    "Near expiry, if {symbol} is pinned at the short strikes, close the entire butterfly before "
    "the final day to avoid pin-risk assignment on the body legs. "
    "The maximum profit is only achievable at exactly the body strike — do not hold to try to "
    "capture the last few dollars; close when you have captured 75–80% of the theoretical maximum."
),
"short_naked_call": (
    "The short naked call has theoretically unlimited loss if the stock rises. "
    "The primary defensive adjustment is to roll up and out: close the current short call and "
    "reopen at a higher strike in a further expiration, collecting a net credit for the roll. "
    "Rolling up moves your short strike above the current stock price; rolling out gives the "
    "stock more time to either stabilise or give back the move. "
    "Critically: apply the 2× credit rule strictly. If the trade has lost 2× the premium you "
    "collected, close the entire position without hesitation — do not roll a loss into a larger "
    "position in the hope of recovery. "
    "Never add more short calls to average down — this increases unlimited risk. "
    "If you cannot roll for a net credit, accept the loss and close."
),
"call_calendar": (
    "A call calendar's primary risk is a large move in the underlying in either direction "
    "before the front-month leg expires. A sharp rally pushes both legs deep ITM (where the "
    "calendar collapses in value), and a sharp decline makes both legs worthless. "
    "If the stock moves more than 5–7% away from the short strike before front-month expiry, "
    "consider closing the entire calendar — the theta advantage is gone once the stock is "
    "significantly off-target. "
    "If implied volatility drops sharply (IV crush), the back-month long option loses value "
    "faster than expected; in that scenario, close the calendar rather than waiting. "
    "At front-month expiration, if the short call expires worthless (the best case), you can "
    "either close the remaining long back-month call for a profit or sell a new front-month call "
    "to roll the calendar forward and collect more premium."
),
"put_calendar": (
    "A put calendar's primary risk is a large move away from the short strike before front-month "
    "expiry — either a sharp rally or sharp decline collapses the spread's value. "
    "If the stock moves more than 5–7% from the short strike, close the calendar rather than "
    "waiting for expiry; the theta advantage evaporates once the stock is off-target. "
    "A sharp drop in implied volatility (IV crush) is also harmful: the back-month long put "
    "loses value faster than the short front-month put; close the calendar if IV drops sharply "
    "after entry. "
    "At front-month expiration, if the short put expires worthless, you may close the back-month "
    "long put for a profit, or sell a new front-month put to convert the single long put into a "
    "new calendar and collect more premium."
),
```

Note: `{symbol}` placeholders in the butterfly entries are not interpolated because `_defensive_tactic` does not receive `symbol` as a parameter — it receives only `strategy_key`. The butterfly tactic text must use generic phrasing ("the stock") rather than `{symbol}`. The current implementation of all named tactics in the dict uses generic phrasing (not f-strings with symbol substitution) for the same reason. **This is a risk to call out explicitly:** the butterfly spec text above as written uses `{symbol}` as a placeholder notation but the actual code must use "the stock" instead.

---

### FR-E3 — Prefer `trade.get("pop_estimate")` over Catalog `pop_range`

**Affected functions:** `_profit_scenario()` (lines 750–755) and `_why_this_strategy()` (lines 314–327)

**Current behaviour:** Both functions use `strategy["pop_range"]` (a catalog range like `[60, 80]`) to produce phrases like "60–80% theoretical probability of profit." The trade dict may contain `pop_estimate` (a computed single figure from actual leg deltas) which is strictly more accurate.

#### In `_profit_scenario()` (lines 750–755):

```python
# BEFORE (lines 750–755)
pop_note = (
    f"Based on the delta of the short strikes, this setup has an estimated {pop_range[0]}–{pop_range[1]}% "
    f"theoretical probability of being profitable at expiration — derived from options delta theory, "
    f"not historical backtesting. ..."
)

# AFTER
pop_estimate = trade.get("pop_estimate")
if pop_estimate is not None:
    pop_note = (
        f"Based on the delta of the selected strikes, this setup has an estimated "
        f"{pop_estimate:.0f}% theoretical probability of being profitable at expiration — "
        f"derived from the actual leg deltas at the chosen strikes, not a catalog range. "
        f"This is a positive-expectancy structure — you will have losing trades, "
        f"but the winners should more than offset them when managed consistently."
    )
else:
    pop_note = (
        f"Based on the delta of the short strikes, this setup has an estimated "
        f"{pop_range[0]}–{pop_range[1]}% theoretical probability of being profitable at expiration — "
        f"derived from options delta theory, not historical backtesting. ..."
    )
```

#### In `_why_this_strategy()` (lines 314–327):

`_why_this_strategy()` receives `strategy` but not `trade`. The `pop_range` is sourced from `strategy["pop_range"]`. To use `trade.get("pop_estimate")` here, the function signature must be updated to accept `trade` as an additional parameter, or the computed value must be injected into the `strategy` dict by the caller.

**Design decision:** Pass `trade` as an optional keyword argument to `_why_this_strategy()`:

```python
# BEFORE (line 286)
def _why_this_strategy(symbol: str, iv_analysis: dict, bias_analysis: dict, strategy: dict, ctx: dict | None = None) -> str:

# AFTER
def _why_this_strategy(symbol: str, iv_analysis: dict, bias_analysis: dict, strategy: dict, ctx: dict | None = None, trade: dict | None = None) -> str:
```

The three call sites (in `generate_narrative()` at lines 1364 and 1417) must pass `trade=trade`. Since `trade` is already in scope at both call sites, this is a one-line addition per call. The `_why_this_strategy` pop logic then becomes:

```python
# BEFORE (lines 314–327) — uses pop_range throughout
pop_range = strategy.get("pop_range", [50, 70])
...
if pop_range[0] >= 50:
    pop_note = (
        f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}%..."
    )
else:
    pop_note = (
        f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}%..."
    )

# AFTER — prefer pop_estimate from trade if available
pop_range = strategy.get("pop_range", [50, 70])
pop_estimate = (trade or {}).get("pop_estimate")
if pop_estimate is not None:
    pop_note = (
        f"The estimated probability of profit is {pop_estimate:.0f}% — "
        f"computed from the actual strike deltas selected for this trade. "
        + (
            f"Statistically, this trade wins more often than it loses. "
            f"A common approach is to put on many high-probability trades, take losses when they "
            f"happen, and let the math work over time."
            if pop_estimate >= 50
            else
            f"This trade wins less often than it loses by design. "
            f"The strategy is sized so that when it does win, the gain more than offsets the more "
            f"frequent smaller losses. Position sizing discipline is essential."
        )
    )
else:
    if pop_range[0] >= 50:
        pop_note = (
            f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}%..."
        )
    else:
        pop_note = (
            f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}%..."
        )
```

**Risk — signature change:** Adding `trade: dict | None = None` as a keyword argument with a default of `None` is backward-compatible — any existing call without `trade=` continues to work, with the function falling back to the `pop_range` path. Both call sites in `generate_narrative()` will be updated to pass `trade=trade`. The error-path call at line 1364 already has `strategy` available; it does not have a valid trade dict (it has the error-flagged trade), so passing `trade=trade` there is still correct — `pop_estimate` will simply be absent from the error trade dict, and the fallback runs.

---

## 3. Cross-Cutting Concerns

### Data availability of `pop_estimate`

`trade.get("pop_estimate")` may be `None` for trades built from the synthetic Black-Scholes chain (where exact leg deltas are approximate). All code paths that prefer `pop_estimate` must have a `pop_range` fallback. This is covered in both the `_profit_scenario` and `_why_this_strategy` designs above.

### `_defensive_tactic()` does not receive `symbol`

As noted in the FR-G3 design, the function receives only `strategy_key: str`. All five new entries must use generic noun phrases ("the stock", "the underlying") rather than a symbol-interpolated f-string. This matches the pattern of every existing named tactic in the dict (e.g. "short_strangle": "If the stock moves toward one of your strikes...").

### `_why_this_strategy()` signature change for FR-E3

This is the only function signature change in the entire sprint. It is backward-compatible (keyword argument with default `None`). The call at line 1364 (error path) and the call at line 1417 (normal path) both need `trade=trade` added.

### FR-C2 and FR-G8 interaction

Both FR-C2 (margin notice) and FR-G8 (loss distinction) handle undefined-risk positions. They are in different functions (`_trade_plain_english` and `_loss_scenario` respectively) and do not interact. However, they should be implemented and tested together in the same test scenario (a short naked call or short naked put) to confirm that both notices appear correctly in the rendered narrative.

---

## 4. Files Changed

| File | Change type |
|------|------------|
| `backend/services/interpreter.py` | All 10 P1 FR changes |

No other files require modification.

---

## 5. Database Migration

None required. This feature involves no schema changes.

---

## 6. API Contract Changes

None. The `generate_narrative()` function's return dict shape is unchanged (same 11 keys). The internal helper `_why_this_strategy()` gains one optional keyword parameter (`trade: dict | None = None`) but this is internal — no route signatures change.

---

## 7. Caching Strategy

Not applicable. The interpreter is a pure computation layer with no external API calls and no caching.

---

## 8. External Quota Impact

None. No external API calls are added or modified.

---

## 9. Testing Strategy

The same route-interception Playwright pattern used in v1 applies here. Tests mock `GET /api/strategies/analyze/{symbol}` to return a controlled JSON fixture and assert on the rendered text in `StrategyNarrative.tsx`.

### Test scenarios required (one fixture per scenario)

| Scenario | FRs covered |
|----------|------------|
| Ticker with `sma20 == 0` and `sma50 == 0` | FR-B5 |
| Ticker with `days_until_earnings == 0` | FR-G11 (0-day case) |
| Ticker with `days_until_earnings == 2` | FR-G11 (imminent case) |
| Ticker with `days_until_earnings == 15` | FR-G11 (standard case — unchanged path) |
| Ticker with `hv_30d == 0` in HIGH IV environment | FR-D6, FR-C7 |
| `short_naked_call` trade | FR-G8 (unlimited loss), FR-C2 (margin), FR-C3 (partial offset), FR-G3 |
| `short_naked_put` trade | FR-G8 (finite loss), FR-C2 (margin), FR-C3 (partial offset) |
| `short_strangle` trade | FR-C2 (margin), FR-G8 (mixed branch) |
| `covered_call` trade | FR-C2 negative (no margin notice), FR-C3 negative (defines and caps) |
| `long_call_vertical` trade | FR-C3 negative (defines and caps preserved) |
| `call_zebra` trade | FR-G1 |
| `put_zebra` trade | FR-G1 |
| `call_calendar` trade | FR-G1, FR-G3 |
| `put_calendar` trade | FR-G1, FR-G3 |
| `collar` trade | FR-G1 |
| `call_butterfly` trade | FR-G3 |
| `put_butterfly` trade | FR-G3 |
| Trade with `pop_estimate` non-None | FR-E3 (prefer computed figure) |
| Trade with `pop_estimate == None` | FR-E3 (fallback to pop_range) |

### Playwright assertion patterns

- **FR-B5:** `expect(page.locator('[data-section="market_snapshot"]')).not.toContainText('$0.00')`
- **FR-G11 (0-day):** `expect(section).toContainText('EARNINGS IMMINENT')` and `expect(section).toContainText('today or tomorrow')`
- **FR-D6:** `expect(page.locator('[data-section="iv_context"]')).toContainText('30-day historical volatility data is unavailable')`
- **FR-C7:** headline element must not contain `'0.0% HV'`
- **FR-G8 short call:** `expect(loss_section).toContainText('unlimited loss')`
- **FR-G8 short put:** `expect(loss_section).toContainText('fell to zero')`
- **FR-C2:** `expect(trade_section).toContainText('MARGIN NOTICE')`
- **FR-C3 undefined:** `expect(trade_section).toContainText('partially offsets')`
- **FR-G1:** each strategy section must not contain "structured to perform in a" (the generic else text)
- **FR-G3:** each defensive tactic section must not contain "Monitor the position daily as expiration approaches" (the generic fallback opening)
- **FR-E3 with estimate:** `expect(profit_section).not.toContainText('–')` (no range in POP note)

---

## 10. Deployment

**Railway backend service:** redeploy with the updated `interpreter.py`. No environment variable changes, no migration steps, no frontend deployment required.

**Rollback:** revert the single-file change to `interpreter.py` and redeploy. No state is written; rollback is instantaneous.

**Health check after deployment:** run a strategy analysis on any ticker from the live UI and confirm the 11-section narrative renders without Python traceback (check Railway backend logs). Specifically verify: (1) a liquid ticker with valid SMAs produces the normal MA paragraph; (2) the earnings urgency text renders for a ticker near earnings; (3) the headline for a HIGH IV environment does not show "0.0% HV" for a ticker with `hv_30d` available (should show the actual HV value).

---

## 11. Implementation Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| FR-G3 / FR-G1 strategy key mismatch: a key in the new tactic/branch dict may not match the exact string used by `strategy_engine.py` | MEDIUM | Verify all five keys against the 31-strategy catalog in `strategy_engine.py` before writing the entries. Failing to match means the new entry is never reached — the generic fallback fires silently. |
| FR-E3 signature change: a call site that passes `_why_this_strategy` as a callable (e.g. via a test mock or indirect reference) may break | LOW | Grep the codebase for all references to `_why_this_strategy` before merging. Expected call sites: two in `generate_narrative()`. |
| FR-G8 leg inspection: a trade dict with no legs (error trade) or legs without explicit `option_type` fields | LOW | The inner `if short_calls and not short_puts / elif short_puts and not short_calls / else` chain defaults to the unlimited-risk framing for any ambiguous case. Conservative default. |
| FR-C2 empty `short_option_legs` list | LOW | The `if short_option_legs` guard falls back to a generic percentage phrase without a dollar example. No crash. |
| FR-G3 `_defensive_tactic` uses string literals (not f-strings): new entries must not use `{symbol}` | MEDIUM | The function signature is `_defensive_tactic(strategy_key: str)` — `symbol` is not available. All new entries must use "the stock" or "the underlying" throughout. The design above uses generic nouns; the implementation must match. |

---

## 12. ADR Assessment

No new architectural decisions are required for this sprint. All changes are mechanical text logic within a single existing function file. The decision to pass `trade` as an optional parameter to `_why_this_strategy()` (FR-E3) is a minor refactor, not an architecture decision warranting a standalone ADR — the function already accepts multiple dicts; adding one more keyword argument follows the established pattern.

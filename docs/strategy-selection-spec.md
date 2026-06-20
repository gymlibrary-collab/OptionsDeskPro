# Options Strategy Selection — Portable Specification

This document fully specifies how OptionsDesk turns market data into a ranked list
of recommended options strategies. It is self-contained: an external application can
reproduce the **exact** same selection by implementing the rules below. No app-specific
code is required.

**Source of the framework:** tastylive *Options Strategy Guide* (2023 edition). Every
input formula, selection weight, and per-strategy P&L formula is taken from that guide.

---

## 1. The pipeline at a glance

```
raw market data ──> [INPUT 1] IV Environment   ─┐
                                                 ├─> SCORING ─> rank ─> top 5 ─> [POST] P&L, POP, DTE attached
raw market data ──> [INPUT 2] Directional Bias ─┘
```

Only **two** computed inputs drive selection: **IV Environment** and **Directional Bias**.
Everything else (DTE, Probability of Profit, Max Profit / Max Loss / Breakeven) is a
**parameter or output** attached *after* a strategy is chosen — none of them affects rank.

---

## 2. Input 1 — IV Environment

### 2.1 IV Rank (IVR)

```
IVR = (current_iv - hv_52wk_low) / (hv_52wk_high - hv_52wk_low) * 100
```

- `current_iv` = at-the-money option implied volatility (strike nearest spot, nearest
  expiry). If no usable option IV is available, fall back to the 30-day historical-vol proxy.
- `hv_52wk_high` / `hv_52wk_low` = max / min of the **30-day rolling annualised historical
  volatility** computed over the past 52 weeks of daily closes.
- Historical volatility for a 30-day window:
  `hv = stdev(log_returns_window, sample) * sqrt(252)` where
  `log_returns = ln(close[t] / close[t-1])`.
- Clamp `IVR` to `[0, 100]`. If `hv_52wk_high - hv_52wk_low < 0.001`, set `IVR = 50`.

### 2.2 Classification

```
IVR > 50            -> HIGH      (favours SELLING premium)
IVR < 30            -> LOW       (favours BUYING premium)
30 <= IVR <= 50     -> MEDIUM
```

Output: one of `HIGH` / `MEDIUM` / `LOW`.

---

## 3. Input 2 — Directional Bias

Computed from daily closes using SMA crossover + RSI(14).

```
SMA20 = mean(last 20 closes)
SMA50 = mean(last 50 closes)
RSI14 = Wilder/SMA-smoothed 14-period RSI of closes
price = current spot (live quote if available, else last close)
```

**SMA direction:**
```
price > SMA20 > SMA50   -> BULLISH
price < SMA20 < SMA50   -> BEARISH
otherwise               -> NEUTRAL
```

**RSI tilt:**
```
RSI14 > 60   -> bullish tilt
RSI14 < 40   -> bearish tilt
40..60       -> neutral
```

**Combine into final bias:**
```
SMA dir == RSI tilt  and not NEUTRAL          -> that direction, STRONG   (BULLISH or BEARISH)
exactly one bullish signal, no bearish signal -> NEUTRAL_BULLISH, MODERATE
exactly one bearish signal, no bullish signal -> NEUTRAL_BEARISH, MODERATE
conflicting signals, or both neutral          -> NEUTRAL, MODERATE
```

Output: one of `BULLISH` / `BEARISH` / `NEUTRAL` / `NEUTRAL_BULLISH` / `NEUTRAL_BEARISH`.
(`OMNIDIRECTIONAL` is a strategy tag, not a bias the detector emits.)

---

## 4. Selection scoring (the ranking algorithm)

Each catalog strategy carries three selection attributes:
`direction` (list of bias tags), `iv_environment` (list of HIGH/MEDIUM/LOW),
and `complexity` (integer 1–3).

### 4.1 Bias compatibility map

A bias matches its own tag exactly, and is "partially compatible" with broader tags:

```
BULLISH          -> [BULLISH]
BEARISH          -> [BEARISH]
NEUTRAL          -> [NEUTRAL]
NEUTRAL_BULLISH  -> [NEUTRAL_BULLISH, BULLISH, NEUTRAL]
NEUTRAL_BEARISH  -> [NEUTRAL_BEARISH, BEARISH, NEUTRAL]
OMNIDIRECTIONAL  -> [OMNIDIRECTIONAL, NEUTRAL]
```

### 4.2 Per-strategy scoring

For the current `(iv_env, bias)`, and for each strategy:

```
compatible = BIAS_COMPATIBILITY[bias]

iv_match        = iv_env in strategy.iv_environment
direction_match = bias  in strategy.direction                       # exact
partial_match   = any(c in strategy.direction for c in compatible)  # adjacent

# Filter: drop strategies that match on neither axis
if not iv_match and not partial_match:
    skip this strategy

score = 0
if iv_match:                 score += 2
if direction_match:          score += 3       # exact direction
elif partial_match:          score += 1       # adjacent direction only
score -= strategy.complexity * 0.1            # tiebreak toward simpler structures
```

### 4.3 Rank & cut

```
sort strategies by score descending
return the top 5
```

**That is the entire selection.** Maximum possible score = `2 + 3 - 0.1*complexity`.
The complexity term (−0.1 to −0.3) only ever breaks ties between strategies with equal
IV + direction fit; it cannot move a strategy across a 1-point boundary.

---

## 5. What does NOT affect selection (attached afterward)

Once the top 5 are chosen, each is decorated with:

| Field | Role | Notes |
|-------|------|-------|
| **DTE target (45)** | Parameter | Guide's default tenor for new entries; the chain opens here. Constant across strategies — never changes rank. |
| **Probability of Profit (POP)** | Context | Win-rate band from the guide (e.g. 60–80%). Shown to the user; not a scoring term. Computed live as `round(max(0, 1 - call_delta - put_delta) * 100, 1)` using short-leg deltas (put delta absolute). |
| **Max Profit / Max Loss / Breakeven** | Output | Computed from the actual strikes after selection, via the formula family (see §6). Not inputs. |

---

## 6. Per-strategy reference catalog (31 strategies)

`direction` / `iv_environment` are the **selection** attributes. `dte` and `pop` are
attached context. `family` names the P&L formula family applied post-selection.

| # | slug | category | direction | iv_environment | dte | pop | family |
|---|------|----------|-----------|----------------|-----|-----|--------|
| 1 | covered_call | bullish | BULLISH | HIGH | 45 | 50–70 | covered |
| 2 | long_call_vertical | bullish | BULLISH | ANY | 45 | 40–60 | debit_spread |
| 3 | call_zebra | bullish | BULLISH | ANY | ANY | 50 | long_debit |
| 4 | poor_mans_covered_call | bullish | BULLISH | LOW | 45–60 | 50–60 | diagonal |
| 5 | call_calendar | bullish | BULLISH* | LOW* | 45 | — | calendar |
| 6 | call_butterfly | bullish | BULLISH | ANY | 15–45 | 20–40 | butterfly |
| 7 | big_lizard | bullish | BULLISH | HIGH | 45 | 60–80 | naked_with_spread |
| 8 | covered_put | bearish | BEARISH | HIGH | 45 | 50–70 | covered |
| 9 | long_put_vertical | bearish | BEARISH | ANY | 45 | 50–60 | debit_spread |
| 10 | put_zebra | bearish | BEARISH | ANY | ANY | 50 | long_debit |
| 11 | poor_mans_covered_put | bearish | BEARISH | LOW | 45–60 | 50–60 | diagonal |
| 12 | put_calendar | bearish | BEARISH* | LOW* | 45 | — | calendar |
| 13 | put_butterfly | bearish | BEARISH | ANY | 15–45 | 20–40 | butterfly |
| 14 | reverse_big_lizard | bearish | BEARISH | HIGH | 45 | 60–80 | naked_with_spread |
| 15 | put_front_ratio | omnidirectional | OMNIDIRECTIONAL | HIGH | 15–45 | 60–80 | ratio_spread |
| 16 | call_front_ratio | omnidirectional | OMNIDIRECTIONAL | HIGH | 15–45 | 60–80 | ratio_spread |
| 17 | put_broken_wing_butterfly | omnidirectional | OMNIDIRECTIONAL* | HIGH | 15–45 | 60–80 | broken_wing_butterfly |
| 18 | call_broken_wing_butterfly | omnidirectional | OMNIDIRECTIONAL* | HIGH | 15–45 | 60–80 | broken_wing_butterfly |
| 19 | call_broken_heart_butterfly | omnidirectional | OMNIDIRECTIONAL | HIGH | 45 | 60–80 | broken_wing_butterfly |
| 20 | put_broken_heart_butterfly | omnidirectional | OMNIDIRECTIONAL | HIGH | 45 | 60–80 | broken_wing_butterfly |
| 21 | short_strangle | neutral | NEUTRAL | HIGH | 45 | 60–80 | naked_double |
| 22 | short_straddle | neutral | NEUTRAL | HIGH | 45 | 50–60 | naked_double |
| 23 | iron_condor | neutral | NEUTRAL | HIGH | 45 | 60–80 | iron_condor |
| 24 | dynamic_width_iron_condor | neutral | NEUTRAL | HIGH | 45 | 60–80 | iron_condor |
| 25 | iron_fly | neutral | NEUTRAL | HIGH | 45 | 60–80 | iron_fly |
| 26 | short_naked_put | neutral_bullish | NEUTRAL_BULLISH | HIGH | 45 | 60–80 | naked_single |
| 27 | short_put_vertical | neutral_bullish | NEUTRAL_BULLISH | HIGH | 45 | 60–80 | credit_spread |
| 28 | jade_lizard | neutral_bullish | NEUTRAL_BULLISH | HIGH | 45 | 60–80 | naked_with_spread |
| 29 | short_naked_call | neutral_bearish | NEUTRAL_BEARISH | HIGH | 45 | 60–80 | naked_single |
| 30 | short_call_vertical | neutral_bearish | NEUTRAL_BEARISH | HIGH | 45 | 60–80 | credit_spread |
| 31 | reverse_jade_lizard | neutral_bearish | NEUTRAL_BEARISH | HIGH | 45 | 60–80 | naked_with_spread |

\* **Engine divergences from the literal guide tags** (deliberate, reviewed):
- `call_calendar` → direction `[NEUTRAL_BULLISH]`, IV `[LOW, MEDIUM]`
- `put_calendar` → direction `[NEUTRAL_BEARISH]`, IV `[LOW, MEDIUM]`
- `put_broken_wing_butterfly` → direction `[NEUTRAL, NEUTRAL_BULLISH, OMNIDIRECTIONAL]`, IV `[HIGH]`
- `call_broken_wing_butterfly` → direction `[NEUTRAL, NEUTRAL_BEARISH, OMNIDIRECTIONAL]`, IV `[HIGH]`

Use the divergence values if you want to match the running app exactly; use the plain
tags if you want the literal guide framework.

---

## 7. Post-selection P&L formula families

Applied to the chosen strategy's actual strikes. `credit` = net premium received,
`debit` = net premium paid, `width` = distance between adjacent strikes.

| family | max_profit | max_loss |
|--------|-----------|----------|
| credit_spread | credit | `max(width - credit, 0)` |
| debit_spread | `width - debit` | debit |
| iron_condor | credit | `max(wider_wing - credit, 0)` |
| iron_fly | credit | `max(wing_width - credit, 0)` |
| butterfly | `wing_width - debit` | debit |
| broken_wing_butterfly (credit) | net credit | `max(wide_width - narrow_width - credit, 0)` |
| calendar / diagonal | `debit * 1.5` | debit |
| long_debit | "Unlimited" | debit |
| naked_single / naked_double | credit | "Unlimited" (or strike*100 − credit for cash-secured puts) |

**POP for range-bound strategies:**
`round(max(0, 1 - call_delta - put_delta) * 100, 1)` using the short-leg deltas
(put delta passed as absolute value).

---

## 8. Worked example

Inputs: ticker shows `IVR = 64` and bias detector returns `NEUTRAL` (STRONG).

1. `IVR 64 > 50` → **iv_env = HIGH**.
2. `bias = NEUTRAL` → `compatible = [NEUTRAL]`.
3. Score each strategy. e.g. **iron_condor** (`direction=[NEUTRAL]`, `iv=[HIGH]`, complexity=2):
   - `iv_match = True` → +2
   - `direction_match = True` (NEUTRAL in [NEUTRAL]) → +3
   - `−0.1 * 2` → −0.2
   - **score = 4.8**
4. A `BULLISH`-only strategy (e.g. covered_call) has `iv_match=True` but no direction
   overlap → it can still appear via the IV axis at +2 −0.1·c, but ranks far below the
   neutral, high-IV premium-sellers.
5. Sort, take top 5 → iron_condor, short_strangle, iron_fly, etc. surface first.
6. Attach DTE=45, POP band 60–80%, and compute Max Profit/Loss/Breakeven from the
   strikes selected on the 45-DTE expiry.

---

## 9. Reproduction checklist for an external app

- [ ] Implement IVR (§2) and the HIGH/MEDIUM/LOW thresholds exactly.
- [ ] Implement the SMA20/SMA50 + RSI(14) bias (§3) with the same combine rules.
- [ ] Load the 31-row catalog (§6) with `direction`, `iv_environment`, `complexity`.
- [ ] Apply the bias-compatibility map and the `+2 / +3 / +1 / −0.1·complexity` scoring (§4).
- [ ] Filter out strategies matching neither axis; sort desc; take top 5.
- [ ] Only then attach DTE (45), POP band, and compute P&L via the family formulas (§7).
- [ ] Do not let DTE, POP, or P&L influence rank — they are outputs, not inputs.

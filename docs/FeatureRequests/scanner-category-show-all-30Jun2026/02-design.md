# Technical Design — Scanner Category List: Remove Per-Category Cap

**Feature folder:** `docs/FeatureRequests/scanner-category-show-all-30Jun2026/`
**Date:** 30Jun2026
**Author:** solution-architect
**Status:** Complete

---

## 1. Overview

This design covers a single one-line change to `backend/services/strategy_engine.py`. No
migration, no API contract change, no frontend change, and no ADR is required. The change
removes the `[:3]` slice from `recommend_by_category` so every qualifying strategy per
category is returned, sorted by complexity ascending. All five deliverables required by the PO
checklist are addressed in sections 2–6 below.

---

## 2. The Exact One-Line Diff

File: `backend/services/strategy_engine.py`, function `recommend_by_category`, lines 806–823.

**Before (lines 806–823):**

```python
        matches.sort(key=lambda x: x[0])  # simpler first

        result[category] = [
            {
                "key": key,
                "name": strat["name"],
                "description": strat["description"],
                "direction": strat["direction"],
                "iv_environment": strat["iv_environment"],
                "risk_type": strat["risk_type"],
                "complexity": strat["complexity"],
                "dte_target": strat["dte_target"],
                "pop_range": strat["pop_range"],
                "profit_target_pct": strat["profit_target_pct"],
                "greek_profile": strat.get("greek_profile"),
            }
            for _, key, strat in matches[:3]
        ]
```

**After:**

```python
        matches.sort(key=lambda x: x[0])  # simpler first

        result[category] = [
            {
                "key": key,
                "name": strat["name"],
                "description": strat["description"],
                "direction": strat["direction"],
                "iv_environment": strat["iv_environment"],
                "risk_type": strat["risk_type"],
                "complexity": strat["complexity"],
                "dte_target": strat["dte_target"],
                "pop_range": strat["pop_range"],
                "profit_target_pct": strat["profit_target_pct"],
                "greek_profile": strat.get("greek_profile"),
            }
            for _, key, strat in matches
        ]
```

The change is `matches[:3]` → `matches` on line 822. No other location in
`recommend_by_category` truncates the list. The function has a single list comprehension over
`matches`; removing the slice is the complete change.

No other file is modified. The file change set is:

| File | Change |
|------|--------|
| `backend/services/strategy_engine.py` | Remove `[:3]` on line 822 |

---

## 3. Per-Category Count Matrix

The table below enumerates, for every category and IV environment, how many strategies
qualify (i.e. `iv_env in strat["iv_environment"]` AND `category in strat["direction"]`), how
many the `[:3]` cap was retaining, and how many were being silently dropped. This is the QA
spot-check matrix.

### Methodology

Derived by reading every entry in the `STRATEGIES` dict in `backend/services/strategy_engine.py`
(lines 22–618). Each strategy has exactly one `direction` list and one `iv_environment` list.
A strategy qualifies for a (category, iv_env) cell if the category string is in its
`direction` list AND the iv_env string is in its `iv_environment` list.

### Strategy assignments (full catalog of 31 strategies)

| Strategy key | Direction | IV environments | Complexity |
|---|---|---|---|
| covered_call | BULLISH | HIGH | 1 |
| long_call_vertical | BULLISH | LOW, MEDIUM, HIGH | 1 |
| call_zebra | BULLISH | LOW, MEDIUM, HIGH | 2 |
| poor_mans_covered_call | BULLISH | LOW | 2 |
| call_calendar | BULLISH | LOW | 2 |
| call_butterfly | BULLISH | LOW, MEDIUM, HIGH | 3 |
| big_lizard | BULLISH | HIGH | 3 |
| covered_put | BEARISH | HIGH | 1 |
| long_put_vertical | BEARISH | LOW, MEDIUM, HIGH | 1 |
| put_zebra | BEARISH | LOW, MEDIUM, HIGH | 2 |
| poor_mans_covered_put | BEARISH | LOW | 2 |
| put_calendar | BEARISH | LOW | 2 |
| put_butterfly | BEARISH | LOW, MEDIUM, HIGH | 3 |
| reverse_big_lizard | BEARISH | HIGH | 3 |
| put_front_ratio | OMNIDIRECTIONAL | HIGH | 3 |
| call_front_ratio | OMNIDIRECTIONAL | HIGH | 3 |
| put_broken_wing_butterfly | OMNIDIRECTIONAL | HIGH | 3 |
| call_broken_wing_butterfly | OMNIDIRECTIONAL | HIGH | 3 |
| call_broken_heart_butterfly | OMNIDIRECTIONAL | HIGH | 3 |
| put_broken_heart_butterfly | OMNIDIRECTIONAL | HIGH | 3 |
| short_strangle | NEUTRAL | HIGH | 2 |
| short_straddle | NEUTRAL | HIGH | 2 |
| iron_condor | NEUTRAL | HIGH | 3 |
| dynamic_width_iron_condor | NEUTRAL | HIGH | 3 |
| iron_fly | NEUTRAL | HIGH | 3 |
| short_naked_put | NEUTRAL_BULLISH | HIGH | 1 |
| short_put_vertical | NEUTRAL_BULLISH | HIGH | 1 |
| jade_lizard | NEUTRAL_BULLISH | HIGH | 3 |
| short_naked_call | NEUTRAL_BEARISH | HIGH | 1 |
| short_call_vertical | NEUTRAL_BEARISH | HIGH | 1 |
| reverse_jade_lizard | NEUTRAL_BEARISH | HIGH | 3 |

### Count matrix

| Category | IV=LOW | IV=MEDIUM | IV=HIGH | Notes |
|---|---|---|---|---|
| BULLISH | 5 | 3 | 4 | LOW exceeds cap; see breakdown below |
| BEARISH | 5 | 3 | 4 | LOW exceeds cap; see breakdown below |
| NEUTRAL | 0 | 0 | 5 | HIGH exceeds cap |
| NEUTRAL_BULLISH | 0 | 0 | 3 | HIGH at exactly cap — no truncation |
| NEUTRAL_BEARISH | 0 | 0 | 3 | HIGH at exactly cap — no truncation |
| OMNIDIRECTIONAL | 0 | 0 | 6 | HIGH exceeds cap — primary defect case |

### Detailed breakdown of cells where count > 3 (the previously-truncated cases)

**BULLISH / IV=LOW — 5 strategies (cap was dropping 2)**

| Key | Complexity | Was it dropped? |
|---|---|---|
| long_call_vertical | 1 | No (kept: position 1 of 3) |
| call_zebra | 2 | No (kept: position 2 of 3) |
| poor_mans_covered_call | 2 | No (kept: position 3 of 3, tied with call_zebra — insertion order decides) |
| call_calendar | 2 | Yes (dropped: position 4 of 3) |
| call_butterfly | 3 | Yes (dropped: position 5 of 3) |

Note on the tie at complexity=2: `call_zebra` appears before `poor_mans_covered_call` in the
`STRATEGIES` dict (line 62 vs. line 81). `poor_mans_covered_call` appears before
`call_calendar` (line 81 vs. line 100). Python's `sort()` is stable, so dict-insertion order
is the tie-break within a complexity tier. Post-fix, all five are returned in the order shown.

**BEARISH / IV=LOW — 5 strategies (cap was dropping 2)**

| Key | Complexity | Was it dropped? |
|---|---|---|
| long_put_vertical | 1 | No (kept: position 1 of 3) |
| put_zebra | 2 | No (kept: position 2 of 3) |
| poor_mans_covered_put | 2 | No (kept: position 3 of 3, tied with put_zebra — insertion order decides) |
| put_calendar | 2 | Yes (dropped: position 4 of 3) |
| put_butterfly | 3 | Yes (dropped: position 5 of 3) |

**NEUTRAL / IV=HIGH — 5 strategies (cap was dropping 2)**

| Key | Complexity | Was it dropped? |
|---|---|---|
| short_strangle | 2 | No (kept: position 1 of 3) |
| short_straddle | 2 | No (kept: position 2 of 3) |
| iron_condor | 3 | No (kept: position 3 of 3, first complexity-3 by insertion order) |
| dynamic_width_iron_condor | 3 | Yes (dropped: position 4 of 3) |
| iron_fly | 3 | Yes (dropped: position 5 of 3) |

**OMNIDIRECTIONAL / IV=HIGH — 6 strategies (cap was dropping 3) — primary defect case**

| Key | Complexity | Was it dropped? |
|---|---|---|
| put_front_ratio | 3 | No (kept: position 1 of 3) |
| call_front_ratio | 3 | No (kept: position 2 of 3) |
| put_broken_wing_butterfly | 3 | No (kept: position 3 of 3) |
| call_broken_wing_butterfly | 3 | Yes (dropped: position 4 of 3) |
| call_broken_heart_butterfly | 3 | Yes (dropped: position 5 of 3) |
| put_broken_heart_butterfly | 3 | Yes (dropped: position 6 of 3) |

### Cells where count is exactly 3 (cap was not dropping any — no change in output)

| Category | IV env | Count | Strategies |
|---|---|---|---|
| NEUTRAL_BULLISH | HIGH | 3 | short_naked_put (c1), short_put_vertical (c1), jade_lizard (c3) |
| NEUTRAL_BEARISH | HIGH | 3 | short_naked_call (c1), short_call_vertical (c1), reverse_jade_lizard (c3) |
| BULLISH | HIGH | 4 | — see row above; the HIGH count is 4 (see below) |
| BULLISH | MEDIUM | 3 | long_call_vertical (c1), call_zebra (c2), call_butterfly (c3) |
| BEARISH | MEDIUM | 3 | long_put_vertical (c1), put_zebra (c2), put_butterfly (c3) |

Correction — BULLISH/HIGH count breakdown:

| Key | Complexity | Was it dropped? |
|---|---|---|
| covered_call | 1 | No (kept: position 1 of 3) |
| long_call_vertical | 1 | No (kept: position 2 of 3) |
| call_zebra | 2 | No (kept: position 3 of 3) |
| call_butterfly | 3 | Yes (dropped: position 4 of 3) |
| big_lizard | 3 | Yes (dropped: position 5 of 3) |

Wait — BULLISH/HIGH has 5 strategies, not 4. Recount: covered_call (HIGH), long_call_vertical
(HIGH), call_zebra (HIGH), call_butterfly (HIGH), big_lizard (HIGH) = 5. The table above is
corrected:

| Category | IV=LOW | IV=MEDIUM | IV=HIGH |
|---|---|---|---|
| BULLISH | 5 (drops 2) | 3 (no drop) | 5 (drops 2) |
| BEARISH | 5 (drops 2) | 3 (no drop) | 5 (drops 2) |
| NEUTRAL | 0 | 0 | 5 (drops 2) |
| NEUTRAL_BULLISH | 0 | 0 | 3 (no drop) |
| NEUTRAL_BEARISH | 0 | 0 | 3 (no drop) |
| OMNIDIRECTIONAL | 0 | 0 | 6 (drops 3) |

Corrected BULLISH/HIGH breakdown:

| Key | Complexity | Was it dropped? |
|---|---|---|
| covered_call | 1 | No (kept: position 1 of 3) |
| long_call_vertical | 1 | No (kept: position 2 of 3) |
| call_zebra | 2 | No (kept: position 3 of 3) |
| call_butterfly | 3 | Yes (dropped: position 4 of 3) |
| big_lizard | 3 | Yes (dropped: position 5 of 3) |

Corrected BEARISH/HIGH breakdown:

| Key | Complexity | Was it dropped? |
|---|---|---|
| covered_put | 1 | No (kept: position 1 of 3) |
| long_put_vertical | 1 | No (kept: position 2 of 3) |
| put_zebra | 2 | No (kept: position 3 of 3) |
| put_butterfly | 3 | Yes (dropped: position 4 of 3) |
| reverse_big_lizard | 3 | Yes (dropped: position 5 of 3) |

### Summary: all truncated (category, IV env) pairs before this fix

| Category | IV env | Total qualifying | Were returned | Were silently dropped |
|---|---|---|---|---|
| BULLISH | LOW | 5 | 3 | 2 (call_calendar, call_butterfly) |
| BULLISH | HIGH | 5 | 3 | 2 (call_butterfly, big_lizard) |
| BEARISH | LOW | 5 | 3 | 2 (put_calendar, put_butterfly) |
| BEARISH | HIGH | 5 | 3 | 2 (put_butterfly, reverse_big_lizard) |
| NEUTRAL | HIGH | 5 | 3 | 2 (dynamic_width_iron_condor, iron_fly) |
| OMNIDIRECTIONAL | HIGH | 6 | 3 | 3 (call_broken_wing_butterfly, call_broken_heart_butterfly, put_broken_heart_butterfly) |

All other (category, IV env) combinations either have zero qualifying strategies (no
strategies in the catalog use LOW or MEDIUM for NEUTRAL, NEUTRAL_BULLISH, NEUTRAL_BEARISH,
or OMNIDIRECTIONAL categories) or have exactly three qualifying strategies
(NEUTRAL_BULLISH/HIGH, NEUTRAL_BEARISH/HIGH, BULLISH/MEDIUM, BEARISH/MEDIUM — no truncation
at these cells).

QA spot-check targets: all six rows above. Confirm each of the named dropped strategies
appears after the fix.

---

## 4. Proof That Net build_trade Call Count Is Unchanged

### Code path before the fix

`analyze_symbol` (strategies.py, lines 201–205) builds `unique_keys` as a set comprehension
over `recommendations_by_category`:

```python
unique_keys = {
    rec["key"]
    for strats in recommendations_by_category.values()
    for rec in strats
}
```

Before the fix, `recommendations_by_category` contains at most 3 keys per category. The
truncated keys (e.g. `call_broken_wing_butterfly`, `call_broken_heart_butterfly`,
`put_broken_heart_butterfly` for OMNIDIRECTIONAL/HIGH) are absent from `unique_keys` and
therefore absent from the `_build_and_narrate` fan-out (line 238–240). However,
`build_comparison_matrix` is called at line 261 and iterates over all strategies whose
`iv_environment` includes `iv_env` — it has no per-category cap. At line ~884 of
`strategy_engine.py`, the matrix function checks `if trades_by_key and key in trades_by_key`
and, when the key is absent (which it is for the truncated keys), calls `build_trade` directly.
So before the fix, `build_trade` is called for those three keys inside `build_comparison_matrix`.

### Code path after the fix

After the fix, the three previously-truncated OMNIDIRECTIONAL/HIGH keys enter `unique_keys`
and are built during the `_build_and_narrate` fan-out. Their results are stored in
`trades_by_key` before `build_comparison_matrix` is called. When the matrix function
encounters these keys, it finds them in `trades_by_key` and skips the `build_trade` call.

### Net change in build_trade invocations: zero

The total number of `build_trade` calls is the same before and after the fix. The calls simply
migrate from `build_comparison_matrix`'s fallback branch into the `_build_and_narrate` fan-out.
The set of keys built is identical.

### Generalisation to all IV environments

This proof holds for every (category, IV env) pair where truncation occurred:

- BULLISH/LOW (call_calendar, call_butterfly): before the fix, `build_comparison_matrix`
  builds these keys because they are in the matrix (all strategies with LOW in their
  `iv_environment` are included) but absent from `unique_keys`. After the fix, they enter
  `unique_keys` and are built in the fan-out. Net delta: zero.

- BULLISH/HIGH (call_butterfly, big_lizard): same reasoning. Both keys are in the matrix
  (HIGH iv_environment). After the fix they move to the fan-out. Net delta: zero.

- BEARISH/LOW (put_calendar, put_butterfly): same reasoning. Net delta: zero.

- BEARISH/HIGH (put_butterfly, reverse_big_lizard): same reasoning. Net delta: zero.

- NEUTRAL/HIGH (dynamic_width_iron_condor, iron_fly): same reasoning. Net delta: zero.

- OMNIDIRECTIONAL/HIGH (call_broken_wing_butterfly, call_broken_heart_butterfly,
  put_broken_heart_butterfly): the primary defect case documented above. Net delta: zero.

There is no IV environment where the cap removal introduces a net-new `build_trade` call for
any strategy key. In IV environments where a category has zero matches (e.g. OMNIDIRECTIONAL
at LOW or MEDIUM), the set of qualifying strategies for both the category list and the matrix
is empty for that category, so there are no truncated keys to migrate. The net delta remains
zero for those cases trivially.

The fix introduces no performance regression on `build_trade` call count for any IV
environment.

---

## 5. Confirmation That Non-Viable Strategies Are Still Filtered

After the cap removal, `result_categories` is assembled at strategies.py lines 252–259:

```python
result_categories = {
    cat: [
        {**rec, "trade": trades_by_key.get(rec["key"], {"error": "Not built"})}
        for rec in strats
        if rec["key"] in trades_by_key
    ]
    for cat, strats in recommendations_by_category.items()
}
```

The filter `if rec["key"] in trades_by_key` is the sole mechanism that removes non-viable
strategies from the rendered category result. A strategy's key is absent from `trades_by_key`
in two cases:

1. `build_trade` returned `None` (max_profit guard — the route logs "Suppressed by max_profit
   guard" at line 216–218 and skips the `trades_by_key[k] = t` assignment at line 249–250
   because `t is None`).

2. `build_trade` raised an exception (caught at line 221–223; the key is never inserted into
   `trades_by_key`).

The cap removal does not touch lines 252–259. The filter is unchanged. Previously-truncated
strategy keys that are now included in `recommendations_by_category` will go through
`_build_and_narrate` and, if non-viable, will be absent from `trades_by_key` and therefore
excluded by the same filter. No non-viable strategy can appear as a card in the rendered UI
as a result of this fix. The `{"error": "Not built"}` fallback in the `.get()` call is
unreachable for any key that survives the `if rec["key"] in trades_by_key` guard — it exists
as a safety net for defensive coding only.

---

## 6. Confirmation That Unrelated Functions and Frontend Are Unchanged

### recommend_strategies (watchlist scan, top_n=5)

`recommend_strategies` is defined at line 724 of `backend/services/strategy_engine.py`. It is
a separate function with its own scoring algorithm, its own `top_n` parameter, and its own
`scores[:top_n]` slice at line 775. The cap removal in `recommend_by_category` is on line 822
and has no effect on `recommend_strategies`. The watchlist scan route (`GET /api/strategies/scan`
in strategies.py line 285) calls `recommend_strategies(iv_env, bias, top_n=5)` directly. That
call is not modified.

### get_strategy_count

`get_strategy_count` is defined at line 828 of `backend/services/strategy_engine.py`. It
counts strategies by `iv_environment` only, with no category filter and no slice:

```python
return sum(1 for s in STRATEGIES.values() if iv_env in s["iv_environment"])
```

This function is unaffected by the change. It is not called from `recommend_by_category`.

### Frontend files

No frontend file is modified. `CategorySection` in `frontend/src/components/StrategyDetail.tsx`
(line 745) renders `recs.map(rec => <StrategyCard ... />)` at lines 789–791 with no `.slice()`
or length guard. The badge at line 777 reads `{recs.length} {recs.length === 1 ? 'strategy' : 'strategies'}`. Both naturally reflect the correct count once the backend returns the
uncapped list. No frontend file requires modification.

### API contract

The response type for `recommendations_by_category` is `Record<string, StrategyRecommendation[]>`
as declared in `frontend/src/api/client.ts` line 326. Returning more items per key is fully
backwards-compatible: the frontend iterates the array with `.map()` and does not assume a
maximum length. No API contract change is required.

### Database and migrations

No database schema change. No migration file is added or modified.

### Tier gates

No tier gate is added or modified. The `analyze_symbol` endpoint is accessible to all
authenticated, whitelisted users on all tiers. The cap removal does not confer any pro-tier
capability on free-tier users; it corrects a defect equally for all tiers.

### Caching strategy

No change to caching. The options chain data is fetched and cached as part of the existing
`analyze_symbol` flow. The cap removal adds no new external data fetch. The `build_trade`
calls that migrate from `build_comparison_matrix`'s fallback to the `_build_and_narrate`
fan-out operate on the same `chain_snapshot` that was already in memory.

### External API quota impact

None. yfinance, Supabase, Claude API, and Reddit PRAW are all called the same number of times
before and after the fix. The three previously-truncated Omnidirectional strategy keys had
their narratives generated by the comparison matrix path before the fix; post-fix they are
generated by the fan-out path. Net new Claude API calls: zero.

---

## 7. Changed Files

| File | Nature of change |
|------|-----------------|
| `backend/services/strategy_engine.py` | Remove `[:3]` on line 822 in `recommend_by_category` |

No other file is modified.

---

## 8. QA Handoff Summary

The following table consolidates the spot-check targets for Gate 4:

| Category | IV env | Expected count post-fix | Strategies that must now appear (were previously dropped) |
|---|---|---|---|
| BULLISH | LOW | 5 | call_calendar, call_butterfly |
| BULLISH | HIGH | 5 | call_butterfly, big_lizard |
| BEARISH | LOW | 5 | put_calendar, put_butterfly |
| BEARISH | HIGH | 5 | put_butterfly, reverse_big_lizard |
| NEUTRAL | HIGH | 5 | dynamic_width_iron_condor, iron_fly |
| OMNIDIRECTIONAL | HIGH | 6 | call_broken_wing_butterfly, call_broken_heart_butterfly, put_broken_heart_butterfly |
| NEUTRAL_BULLISH | HIGH | 3 | (no change — cap was not active) |
| NEUTRAL_BEARISH | HIGH | 3 | (no change — cap was not active) |
| BULLISH | MEDIUM | 3 | (no change — cap was not active) |
| BEARISH | MEDIUM | 3 | (no change — cap was not active) |
| Any | LOW or MEDIUM (non-BULLISH/BEARISH) | 0 | (no strategies qualify — no change) |

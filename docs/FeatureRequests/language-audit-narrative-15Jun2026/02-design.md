# Technical Design — PRD-05: Language Audit of Strategy Narrative

**Date:** 15Jun2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

PRD-05 is a pure text-substitution audit confined to six specific phrases across two files: `backend/services/interpreter.py` and `frontend/src/components/StrategyNarrative.tsx`. No API shape, database schema, caching strategy, environment variable, or subscription-tier logic changes. The goal is to remove every phrase that presents OptionsDesk — or a system-generated judgment — as recommending or ranking a strategy for the user, while preserving all tastylive-attributed educational content in full. Each phrase is addressed by a single-string replacement; the surrounding code logic is untouched. No migration is required. No ADR is warranted — these are editorial corrections to string literals, not architectural decisions.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/services/interpreter.py` | Modified | Five targeted string replacements at lines 384–389, 648, 921, 940–942, 1197 |
| `frontend/src/components/StrategyNarrative.tsx` | Modified | Two identical string replacements at lines 228 and 256 |

No other files change.

---

## 3. Database Schema Changes

None. No migration required.

---

## 4. API Contracts

No changes. The `why_this_strategy` key in the narrative JSON response retains its name; only its string value changes when the `else` fallback branch is reached. All other field names and shapes are identical.

---

## 5. Caching Strategy

No changes. Narrative generation is a synchronous, stateless computation in `interpreter.py` with no caching layer of its own. The cache TTL for market data (300 s / 30 s) is unchanged.

---

## 6. External Dependency Fallback Chain

No changes. The three-tier market data fallback (Market Data App → yfinance → synthetic Black-Scholes) is unaffected.

---

## 7. Frontend State Management

No changes to component ownership, prop shapes, loading states, or error states. The two affected strings in `StrategyNarrative.tsx` are static fallback literals inside existing ternary expressions; the surrounding conditional logic is untouched.

---

## 8. Subscription Tier Enforcement

No changes.

---

## 9. New Environment Variables

None.

---

## 10. Exact Replacement Specifications

This section is the authoritative implementation contract. Each item specifies the verbatim `old_string` to locate and the verbatim `new_string` to substitute. No other text in the surrounding block changes. All strings are Python f-strings or TypeScript JSX string literals as indicated.

---

### Item A — `_why_this_strategy()` else branch (interpreter.py ~line 383)

**File:** `backend/services/interpreter.py`

**Context:** The `else` block is reached for any strategy key not explicitly handled by the `if/elif` chain above it (e.g. `calendar_spread`, `long_call`, `long_put`, `ratio_spread`, `skip_strike_butterfly`, and any future keys added to the catalog). The current text asserts a ranking claim ("ranks as the best-fit strategy") without any educational explanation of why the strategy matches the current conditions.

The replacement must: (a) state the IV environment by name and numeric rank, (b) state the directional bias, (c) explain how those two inputs align with the strategy's structural characteristics, and (d) reference the DTE target as a time-decay mechanical fact rather than a quality judgment. No ranking language. No recommendation language.

**old_string (lines 383–389):**
```python
    else:
        core = (
            f"Given an IV Rank of {ivr:.0f} ({iv_word} volatility environment) "
            f"and a {bias_clean} directional lean, the {strat_name} ranks as the best-fit strategy "
            f"across the tastylive framework. It aligns the volatility environment with the directional bias "
            f"and targets the {dte_target}-day expiration window where time decay is most efficient."
        )
```

**new_string:**
```python
    else:
        core = (
            f"The {strat_name} is structured to perform in a {iv_word} IV environment (IV Rank {ivr:.0f}) "
            f"with a {bias_clean} directional bias. In a {iv_word} volatility environment, "
            f"{'premium sellers benefit from elevated option prices that decay as volatility compresses back toward its mean' if iv_env == 'HIGH' else 'defined-risk structures are more attractively priced, making it practical to buy spreads or pay a debit for directional exposure' if iv_env == 'LOW' else 'both buying and selling structures are reasonably priced, and the strategy can be sized without paying an outsized volatility premium'}. "
            f"A {bias_clean} bias means the position is constructed so that its profit zone sits in the direction the analysis suggests {symbol} is leaning — without requiring a precise price target. "
            f"Targeting the {dte_target}-day expiration window places the trade in the region where theta decay is meaningful but gamma risk has not yet become the dominant force."
        )
```

**Design rationale:** The replacement uses three concrete mechanical facts — IV environment and its structural implication, directional bias alignment, and the DTE mechanical property — to give the reader genuine educational context about why this strategy is compatible with the current conditions. The word "compatible" or any ranking synonym is deliberately absent. The conditional clause on `iv_env` mirrors the same `iv_env` variable already in scope and follows the same `HIGH / LOW / else` pattern used throughout the function.

---

### Item B — Error-path `trade_plain_english` (interpreter.py ~line 1197)

**File:** `backend/services/interpreter.py`

**Context:** This string is returned in the `trade_plain_english` field when `trade.get("error")` is truthy — i.e. when the options chain could not be fetched and no strike/expiry structure could be built. The word "recommendation" frames OptionsDesk as directing the user to a trade.

**old_string:**
```python
            "trade_plain_english": f"The specific strike/expiry data needed to build this trade could not be retrieved right now ({trade['error']}). The analysis above still applies — when data is available, this strategy remains the recommendation given current IV and bias conditions.",
```

**new_string:**
```python
            "trade_plain_english": f"The specific strike/expiry data needed to build this trade could not be retrieved right now ({trade['error']}). The IV environment and directional bias analysis above still applies to {symbol} — the market snapshot, IV context, and strategy alignment sections reflect current conditions and are not affected by the missing chain data.",
```

**Design rationale:** The replacement removes "recommendation" entirely and replaces it with a factual description of what is and is not affected by the data gap. It explicitly names the three sections that remain valid (market snapshot, IV context, strategy alignment), which satisfies AC-2.2 without restating the advisory framing. The sentence length is well under the 200-word ceiling in AC-2.3.

---

### Item C — Unattributed exit-point phrase (interpreter.py ~line 648)

**File:** `backend/services/interpreter.py`

**Context:** This is the opening sentence of the `early_exit` variable in `_profit_scenario()`. It uses "recommended" with no attribution. The OQ-1 design decision — whether to attribute to tastylive or to neutralise — is resolved here: the replacement uses explicit tastylive attribution, consistent with the attribution style used on lines 638 and 644 in the same function. This is the more informative choice because it tells the reader the source of the exit rule rather than silently removing its provenance.

**old_string:**
```python
        f"The recommended exit point is when the trade reaches {profit_target_pct}% of max profit "
```

**new_string:**
```python
        f"A common exit guideline (tastylive framework) is to close the trade when it reaches {profit_target_pct}% of max profit "
```

**Design rationale:** "A common exit guideline (tastylive framework)" is factually accurate (the 50 % profit-target rule is a tastylive teaching), grammatically compatible with the continuation of the f-string ("({target_dollars}). For example…"), and introduces attribution without duplicating the longer "tastylive recommends" construction used in the neighbouring `profit_detail` block. OQ-1 is resolved: attribution approach selected.

---

### Item D — Broker parenthetical quality judgment (interpreter.py ~line 921)

**File:** `backend/services/interpreter.py`

**Context:** The phrase `tastytrade (best for beginners)` appears inside the first step of `_execution_checklist()`. The parenthetical is an unattributed quality ranking of a named third-party product. Only the parenthetical is removed; the four broker names and all surrounding text remain.

**old_string:**
```python
        f"OPEN YOUR BROKER and search for the ticker '{symbol}'. "
        f"Recommended platforms that support multi-leg options: tastytrade (best for beginners), "
        f"thinkorswim by Schwab, Interactive Brokers (IBKR), or E*TRADE Power E*TRADE. "
```

**new_string:**
```python
        f"OPEN YOUR BROKER and search for the ticker '{symbol}'. "
        f"Platforms that support multi-leg options include: tastytrade, "
        f"thinkorswim by Schwab, Interactive Brokers (IBKR), or E*TRADE Power E*TRADE. "
```

**Design rationale:** Two changes in this block: `(best for beginners)` is removed from tastytrade, and the lead-in phrase changes from `"Recommended platforms"` to `"Platforms that support multi-leg options include"`. The word "Recommended" in the original lead-in is itself an unattributed endorsement of the list as a whole; replacing it with a neutral factual descriptor avoids a secondary regulatory concern without losing any functional information.

---

### Item E — "Optimal window" DTE language (interpreter.py ~line 940–942)

**File:** `backend/services/interpreter.py`

**Context:** The third step of `_execution_checklist()` contains `"At {dte} DTE this expiry sits in that optimal window"`. The preceding sentence already attributes the 30–45 DTE convention to tastylive (`"tastylive's sweet spot for new trades is 30–45 days to expiration (DTE)."`), which is correctly attributed and must not change. Only the second sentence changes.

**old_string:**
```python
        f"At {dte} DTE this expiry sits in that optimal window, where time decay accelerates "
        f"without gamma risk being too extreme yet."
```

**new_string:**
```python
        f"At {dte} DTE this expiry falls within that range — a well-studied window in which time decay accelerates "
        f"without gamma risk being too extreme yet."
```

**Design rationale:** "A well-studied window" is factually defensible (the 30–45 DTE theta profile is a subject of published options research and is central to tastylive's curriculum), attributes no quality judgment to OptionsDesk, and preserves the mechanical explanation of theta/gamma that follows. The phrase "sits in that" is also made slightly more precise as "falls within that range" to read naturally without "optimal."

---

### Item F — Frontend fallback strings (StrategyNarrative.tsx lines 228 and 256)

**File:** `frontend/src/components/StrategyNarrative.tsx`

**Context:** Two identical strings appear in the profit-scenario and loss-scenario ternary fallback spans. Both must change; they are identical text so a single replacement specification covers both, applied twice.

**old_string (appears at line 228 and identically at line 256):**
```tsx
Profit scenario requires live options chain data (specific strikes and breakevens). The strategy recommendation above is still valid.
```

**new_string (same replacement applied to both occurrences):**
```tsx
Profit scenario requires live options chain data (specific strikes and breakevens). The strategy analysis above still applies.
```

and for the loss scenario occurrence (line 256):

**old_string:**
```tsx
Loss scenario requires live options chain data (specific strikes and breakevens). The strategy recommendation above is still valid.
```

**new_string:**
```tsx
Loss scenario requires live options chain data (specific strikes and breakevens). The strategy analysis above still applies.
```

**Design rationale:** "The strategy analysis above still applies" conveys the same informational content as the original — that the non-scenario sections of the narrative are unaffected — without using "recommendation" or "valid" in a context that implies the platform has endorsed a trade. The word "analysis" is already used throughout the narrative UI to describe the IV, bias, and strategy-fit output; this replacement is therefore consistent with the established vocabulary of the component.

---

## 11. OQ-1 Resolution (Open Question from Spec)

OQ-1 asked the architect to choose between (a) explicit tastylive attribution for the exit-point rewrite or (b) presenting it as a computed trade parameter. Attribution (a) is selected. The exit rule (profit-target percentage at which to close) is a tastylive teaching rule, not a mathematical output of the trade structure itself — the trade's max profit is fixed by the strikes, but the decision to close at 50 % of that max profit is a discretionary convention sourced from tastylive's framework. Attributing it to tastylive is more accurate and more educational than presenting it as a parameter, and it is consistent with the attribution style used in the same function at lines 638 and 644.

---

## 12. ADR Assessment

No ADR is required. All six changes are editorial corrections to string literals. None involves a technology choice, a new dependency, a schema trade-off, or a decision that future maintainers would need to reverse-engineer from code alone. The design rationale for each item is documented in section 10 of this document, which is the appropriate home for this level of reasoning.

---

## 13. Test Approach Notes for Gate 4

The QA engineer should verify the following for each acceptance criterion. These notes do not replace the Gate 4 test plan; they are architect-level pointers.

**Item A (else branch):**
- Identify a strategy key absent from the explicit `if/elif` chain in `_why_this_strategy()`. From the current code, `calendar_spread`, `long_call`, `long_put`, `ratio_spread`, `skip_strike_butterfly`, `double_diagonal` are candidates — QA should confirm at least one is reachable with mock data.
- Verify the rendered "Why This Strategy" panel contains neither "ranks as" nor "best-fit" nor "best fit" nor "optimal strategy."
- Verify the panel contains the numeric IVR value and the bias label, confirming educational content is preserved (AC-1.2).

**Item B (error path):**
- Trigger by passing a trade dict with `error` set to a non-empty string in `generate_narrative()`. This can be done with a unit test that constructs the minimal input dict.
- Assert the `trade_plain_english` value in the returned dict does not contain "recommendation," "still the pick," "still advised," or "still suggested."
- Assert it does contain the original `trade['error']` string (i.e. the error message is still surfaced to the user).

**Item C (exit point):**
- Any ticker with a live or synthetic chain that produces a non-empty `profit_scenario` field. Inspect the raw string value returned by `generate_narrative()`.
- Assert the value does not contain "The recommended exit point is."
- Assert it still contains the numeric profit-target percentage and dollar value (AC-3.2).
- Assert the phrase "tastylive framework" appears in the profit scenario text (AC-3.3 — attribution present).

**Item D (broker parenthetical):**
- Any ticker that produces a populated `execution_checklist`. Inspect step index 0.
- Assert the string does not contain "best for beginners."
- Assert the string still contains "tastytrade," "thinkorswim," "Interactive Brokers," and "E*TRADE" (AC-4.2).

**Item E (DTE window):**
- Same populated checklist from item D. Inspect step index 2 (expiration selection step).
- Assert the string does not contain the word "optimal."
- Assert the string still contains the DTE numeric value and the words "time decay" (AC-5.2).
- Assert the string contains "tastylive's sweet spot" or equivalent attribution in the preceding sentence (AC-5.3 — preceding sentence is unchanged and already attributed).

**Item F (frontend fallbacks):**
- Render `StrategyNarrative` with a narrative object where `profit_scenario` is `""` and `loss_scenario` is `""`.
- Assert neither fallback span contains the word "recommendation."
- Assert both spans still contain language indicating live chain data is required (AC-6.3).

**Story 7 (preservation):**
- Run a unit test on a `short_naked_put` or `short_strangle` strategy key and assert the `why_this_strategy` output still contains "1–3%" and "2× credit rule."
- Assert the `profit_scenario` output for a credit strategy still contains "50%" with tastylive attribution.
- Assert execution checklist step text still contains "21" in the DTE-close step.

**OQ-2 flag for QA:** The spec's OQ-2 asks QA to document which `if/elif` branches in `_why_this_strategy()` cannot be reached with current mock data. This is a Gate 4 deliverable, not a Gate 2 deliverable, and is not blocked by this design.

---

## 14. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

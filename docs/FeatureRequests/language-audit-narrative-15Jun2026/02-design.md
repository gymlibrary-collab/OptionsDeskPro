# Technical Design — PRD-05: Language Audit of Strategy Narrative

**Date:** 15Jun2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

PRD-05 is a pure text-substitution audit confined to six specific phrases across two files: `backend/services/interpreter.py` and `frontend/src/components/StrategyNarrative.tsx`. No API shape, database schema, caching strategy, environment variable, or subscription-tier logic changes. The goal is to remove every phrase that presents OptionsDesk — or a system-generated judgment — as recommending or ranking a strategy for the user, while preserving all tastylive-attributed educational content in full. Each phrase is addressed by a single-string replacement; the surrounding code logic is untouched. No migration is required. No ADR is warranted — these are editorial corrections to string literals, not architectural decisions.

The one open question deferred from the BA spec (OQ-1: attribution vs. neutralisation for item C) is resolved in this document: explicit tastylive attribution is selected. The rationale is in section 11.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/services/interpreter.py` | Modified | Five targeted string replacements at lines 383–389, 648, 921, 940–942, 1197 |
| `frontend/src/components/StrategyNarrative.tsx` | Modified | Two identical string replacements at lines 228 and 256 |

No other files change. No new files are created. No packages are added to `backend/requirements.txt`.

---

## 3. Database Schema Changes

None. No migration required.

---

## 4. API Contracts

No changes. The `why_this_strategy` key in the narrative JSON response retains its name; only its string value changes when the `else` fallback branch of `_why_this_strategy()` is reached. All other field names, shapes, HTTP methods, paths, auth requirements, and error responses are identical.

---

## 5. Caching Strategy

No changes. Narrative generation is a synchronous, stateless computation in `interpreter.py` with no caching layer of its own. The market data cache (300 s for Market Data App, 30 s for yfinance) is unchanged and unaffected.

---

## 6. External Dependency Fallback Chain

No changes. The three-tier market data fallback (Market Data App → yfinance → synthetic Black-Scholes) is unaffected. The narrative generator is purely rule-based Python with no external calls.

---

## 7. Frontend State Management

No changes to component ownership, prop shapes, loading states, or error states. The two affected strings in `StrategyNarrative.tsx` are static fallback literals inside existing ternary expressions at lines 226–229 and 254–257; the surrounding conditional logic and JSX structure are untouched.

---

## 8. Subscription Tier Enforcement

No changes. The narrative is available to all authenticated tiers as before; no tier-gating logic is added or removed.

---

## 9. New Environment Variables

None.

---

## 10. Exact Replacement Specifications

This section is the authoritative implementation contract. Each item specifies the verbatim `old_string` to locate and the verbatim `new_string` to substitute. No other text in the surrounding block changes. All strings are Python f-strings or TypeScript JSX string literals as indicated.

---

### Item A — `_why_this_strategy()` else branch (interpreter.py lines 383–389)

**File:** `backend/services/interpreter.py`

**Context:** The `else` block is reached for any strategy key not explicitly handled by the `if/elif` chain above it — for example `calendar_spread`, `long_call`, `long_put`, `ratio_spread`, `skip_strike_butterfly`, `double_diagonal`, and any future keys added to the strategy catalog. The current text asserts a ranking claim ("ranks as the best-fit strategy") with no educational explanation of why the strategy structurally matches the current conditions.

The replacement must: (a) state the IV environment by name and numeric rank, (b) state the directional bias, (c) explain how those two inputs connect to the strategy's structural characteristics in a way that is mechanically accurate and specific to the IV regime, and (d) reference the DTE target as a time-decay fact rather than a quality judgment.

Variables available in scope at the `else` block: `ivr` (float), `iv_word` (str: "high"/"low"/"moderate"), `iv_env` (str: "HIGH"/"LOW"/"MEDIUM"), `bias_clean` (str: lowercased bias label), `strat_name` (str), `dte_target` (int), `symbol` (str).

**old_string:**
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

**Design rationale:** The replacement uses three concrete mechanical facts — IV environment and its structural implication for buyers vs. sellers, directional bias alignment, and the DTE mechanical property — to give genuine educational context about why this strategy is compatible with the current conditions. The conditional clause on `iv_env` follows the same `HIGH / LOW / else` pattern used throughout the function, uses variables already in scope, and produces regime-specific copy rather than a single generic fallback sentence. No ranking language ("ranks as," "best-fit," "optimal," "recommended") appears.

AC coverage: `{ivr:.0f}` and `{bias_clean}` both appear in output (AC-1.2). The text forms a coherent multi-sentence explanation of IV/bias alignment (AC-1.3). No prohibited phrases appear (AC-1.1).

---

### Item B — Error-path `trade_plain_english` (interpreter.py line 1197)

**File:** `backend/services/interpreter.py`

**Context:** This string is returned in the `trade_plain_english` field when `trade.get("error")` is truthy — i.e. when the options chain could not be fetched and no strike/expiry structure could be built. The phrase "this strategy remains the recommendation" frames OptionsDesk as directing the user to a specific trade even on an error path.

**old_string:**
```python
            "trade_plain_english": f"The specific strike/expiry data needed to build this trade could not be retrieved right now ({trade['error']}). The analysis above still applies — when data is available, this strategy remains the recommendation given current IV and bias conditions.",
```

**new_string:**
```python
            "trade_plain_english": f"The specific strike/expiry data needed to build this trade could not be retrieved right now ({trade['error']}). The IV environment and directional bias analysis above still applies to {symbol} — the market snapshot, IV context, and strategy alignment sections reflect current conditions and are not affected by the missing chain data.",
```

**Design rationale:** Removes "remains the recommendation" and replaces it with a factual description of which sections are still informative and why. Explicitly names the three sections that are populated in this error-path return (`market_snapshot`, `iv_context`, `why_this_strategy`) so the user understands exactly what they can act on. The replacement is well under the 200-word ceiling in AC-2.3 (the two sentences together are under 60 words). The original error string from `trade['error']` is preserved in the output.

---

### Item C — Unattributed exit-point phrase (interpreter.py line 648)

**File:** `backend/services/interpreter.py`

**Context:** This is the opening f-string of the `early_exit` variable in `_profit_scenario()`. It uses "recommended" with no attribution. OQ-1 from the BA spec is resolved here: explicit tastylive attribution is selected (see section 11 for the rationale). Only the first f-string line of the `early_exit` block changes; the dollar-value computation lines are unchanged.

**old_string:**
```python
        f"The recommended exit point is when the trade reaches {profit_target_pct}% of max profit "
```

**new_string:**
```python
        f"A common exit guideline (tastylive framework) is to close the trade when it reaches {profit_target_pct}% of max profit "
```

**Design rationale:** "A common exit guideline (tastylive framework)" is factually accurate — the profit-target-percentage rule is a tastylive teaching. The phrase is grammatically compatible with the continuation of the f-string block (`"({target_dollars}). For example…"`). The attribution style "(tastylive framework)" is parenthetical, consistent with the style used at lines 638 and 644 in the same function. The specific profit-target percentage and all dollar-value computations are unchanged (AC-3.2). Attribution is explicit (AC-3.3).

---

### Item D — Broker parenthetical quality judgment (interpreter.py lines 920–922)

**File:** `backend/services/interpreter.py`

**Context:** The first step of `_execution_checklist()` contains `tastytrade (best for beginners)`. The parenthetical is an unattributed quality ranking of a named third-party product. The lead-in phrase "Recommended platforms" is also an unattributed endorsement of the list as a whole and is updated in the same change for full compliance with spec requirement 10.

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

**Design rationale:** Two changes in this block: `(best for beginners)` is removed from after "tastytrade," and the lead-in changes from "Recommended platforms" to "Platforms that support multi-leg options include." Leaving "Recommended platforms" while removing only the parenthetical would leave a second unattributed ranking claim in the same sentence, which conflicts with spec requirement 10. All four broker platform names are preserved (AC-4.2). The sentence is grammatically complete after the change (AC-4.3).

---

### Item E — "Optimal window" DTE language (interpreter.py lines 940–942)

**File:** `backend/services/interpreter.py`

**Context:** The third step of `_execution_checklist()`. The preceding sentence in that step — `"tastylive's sweet spot for new trades is 30–45 days to expiration (DTE)."` — is correctly attributed to tastylive and must not change. Only the second sentence changes; it currently uses the word "optimal" as an unattributed quality claim.

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

**Design rationale:** "A well-studied window" is factually defensible — the 30–45 DTE theta profile is documented in published options research and is a core element of tastylive's curriculum. It makes no platform quality claim. "That range" is a natural referent to the "30–45 DTE" stated in the immediately preceding sentence, which is unchanged. The mechanical explanation of theta/gamma that follows is preserved verbatim. The word "optimal" does not appear (AC-5.1). DTE value and time-decay explanation are preserved (AC-5.2). The preceding sentence's tastylive attribution ("tastylive's sweet spot") satisfies AC-5.3 and is unchanged.

---

### Item F — Frontend fallback strings (StrategyNarrative.tsx lines 228 and 256)

**File:** `frontend/src/components/StrategyNarrative.tsx`

**Context:** Two fallback span strings, one in the profit-scenario block (line 228) and one in the loss-scenario block (line 256). The two strings differ only in the words "Profit" vs. "Loss" at the start; both end with the same offending phrase. Both must be changed to the same revised closing sentence.

**old_string (line 228 — profit scenario fallback):**
```tsx
Profit scenario requires live options chain data (specific strikes and breakevens). The strategy recommendation above is still valid.
```

**new_string:**
```tsx
Profit scenario requires live options chain data (specific strikes and breakevens). The strategy analysis above still applies.
```

**old_string (line 256 — loss scenario fallback):**
```tsx
Loss scenario requires live options chain data (specific strikes and breakevens). The strategy recommendation above is still valid.
```

**new_string:**
```tsx
Loss scenario requires live options chain data (specific strikes and breakevens). The strategy analysis above still applies.
```

**Design rationale:** "The strategy analysis above still applies" conveys identical informational content — that the non-scenario sections of the narrative are unaffected by the missing chain data — without the word "recommendation." The word "analysis" is used throughout the narrative UI to describe the IV, bias, and strategy-fit output; this replacement is consistent with the established vocabulary of the component. Both occurrences are changed because they carry the same regulatory concern (AC-6.1 and AC-6.2). Both still communicate that live chain data is required and that the sections above remain valid (AC-6.3).

---

## 11. OQ-1 Resolution

OQ-1 from the BA spec asked the architect to choose between:
- (a) Explicit tastylive attribution for the item C exit-point phrase ("tastylive's exit target for this strategy is…")
- (b) Presenting it as a computed trade parameter with no attribution ("This trade's profit target is…")

**Decision: approach (a) — explicit tastylive attribution.**

The profit-target percentage used in `_profit_scenario()` is a tastylive teaching rule (close at 50 % of max credit collected), not a value derived from first principles of option pricing. Presenting it as a neutral "computed parameter" would be technically misleading — the number comes from a discretionary convention, not from the strike prices themselves. Attributing it to tastylive is more accurate and more informative. The parenthetical style "(tastylive framework)" is consistent with the attribution style already used at lines 638 and 644 in the same function, so the change is editorially coherent with the surrounding text. Approach (b) would require a longer rewrite to remain factually defensible and would sacrifice educational value.

---

## 12. ADR Assessment

No ADR is required. All six changes are editorial corrections to string literals within an existing rule-based narrative engine. None involves a technology choice, a new dependency, a schema trade-off, or a decision that future maintainers would need to reverse-engineer from code alone. The design rationale for each item is documented in section 10 of this document, which is the appropriate home for this level of reasoning.

---

## 13. Test Approach Notes for Gate 4

The QA engineer should add targeted assertions to the existing narrative test file. These notes are advisory pointers from the architect, not a substitute for the Gate 4 test plan.

**Item A (else branch):**
- Identify a strategy key absent from the explicit `if/elif` chain in `_why_this_strategy()`. Candidates from the current code: `calendar_spread`, `long_call`, `long_put`, `ratio_spread`, `skip_strike_butterfly`, `double_diagonal`. QA should confirm at least one is reachable with existing mock data.
- Assert the rendered "Why This Strategy" panel does not contain "ranks as," "best-fit strategy," "best fit strategy," "optimal strategy," or "ideal strategy" (AC-1.1).
- Assert the panel contains the numeric IVR value and the bias label as substrings (AC-1.2).
- Assert the output is a grammatically complete paragraph (AC-1.3 — manual review).

**Item B (error path):**
- Unit test: construct a `trade` dict with `error` set to a non-empty string. Pass to `generate_narrative()`. Assert `trade_plain_english` in the returned dict does not contain "recommendation," "remains the recommendation," "still the pick," "still advised," or "still suggested" (AC-2.1).
- Assert `trade_plain_english` contains the original error string value (the user still sees the error reason).
- Assert `trade_plain_english` contains "still applies" or equivalent language conveying the analysis sections are valid (AC-2.2).

**Item C (exit point):**
- Use any strategy with a credit structure that produces a non-empty `profit_scenario`. Inspect the raw string value from `generate_narrative()`.
- Assert the string does not contain "The recommended exit point is" (AC-3.1).
- Assert the string contains the numeric profit-target percentage and a dollar value substring (AC-3.2).
- Assert the string contains "tastylive framework" (AC-3.3).

**Item D (broker list):**
- Use any strategy that produces a populated `execution_checklist`. Inspect step index 0.
- Assert the string does not contain "best for beginners" (AC-4.1).
- Assert the string contains all four broker names: "tastytrade," "thinkorswim," "Interactive Brokers," "E*TRADE" (AC-4.2).

**Item E (DTE window):**
- Same populated checklist. Inspect step index 2 (expiration selection step).
- Assert the string does not contain "optimal" (AC-5.1).
- Assert the string contains the numeric DTE value and the substring "time decay" (AC-5.2).
- Assert the string contains "tastylive's sweet spot" (the preceding sentence, unchanged, satisfies AC-5.3).

**Item F (frontend fallbacks):**
- Render `StrategyNarrative` with a narrative object where `profit_scenario` is `""` and `loss_scenario` is `""`.
- Assert neither fallback span contains the word "recommendation" (AC-6.1, AC-6.2).
- Assert both spans contain "requires live options chain data" and "still applies" (AC-6.3).

**Story 7 preservation (tastylive-attributed language):**
- Unit test on `short_naked_put` or `short_strangle`: assert `why_this_strategy` contains "1–3%" and "2× credit rule" (AC-7.1).
- Credit strategy `profit_scenario`: assert contains "50%" and "tastylive" (AC-7.2).
- Execution checklist for a credit strategy: assert a step contains "21" in the DTE-close step (AC-7.3).
- `trade_plain_english` for a credit strategy: assert contains "tastylive recommends closing early" or equivalent early-exit attribution (AC-7.4).

**OQ-2 flag for QA:** The BA spec's OQ-2 asks QA to document which `if/elif` branches in `_why_this_strategy()` cannot be reached with the current mock data set and to confirm none of those unreachable branches contain any of the six target phrases. A grep of the explicit branch bodies (lines 319–382 of `interpreter.py`) for the strings "ranks as," "recommendation," "recommended," "optimal," and "best for beginners" should return zero matches. This is a mechanical check that does not require test execution and is a Gate 4 deliverable.

---

## 14. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

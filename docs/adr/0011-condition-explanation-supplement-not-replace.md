# ADR-0011 — condition_explanation supplements interpreter core paragraphs rather than replacing them

**Date:** 24Jun2026
**Status:** Accepted
**Deciders:** Solution Architect
**Context:** interpreter-improvements-24Jun2026 sprint, FR-N2

---

## Context

The strategy catalog (`STRATEGIES` dict in `strategy_engine.py`) includes a `condition_explanation` field on every entry. These are 1–2 sentence strings that explain why a given IV environment and directional bias suit the strategy's mechanical design (e.g. "Short strangles sell OTM premium on both sides; elevated IV produces a wider breakeven range and a larger credit...").

`_why_this_strategy` in `interpreter.py` already contains named `core` paragraphs for approximately 20 strategy keys, averaging 4–5 sentences of user-facing prose explaining strategy mechanics, trade-offs, and entry rationale. Eleven strategy keys fall to a generic `else` branch.

FR-N2 requires incorporating `condition_explanation` into `_why_this_strategy`.

---

## Decision

Use `condition_explanation` as a **supplementary paragraph** appended immediately after the existing `core` paragraph in every branch (named and generic), prefixed with "Why these conditions: " to frame it as a conditions-rationale.

Do **not** replace the existing named `core` paragraphs with `condition_explanation`.

---

## Rationale

**Replacing would degrade narrative quality for the 20+ strategies with named branches.**

The named `core` paragraphs were written explicitly for a beginner audience. They explain mechanics at length ("by selling both a call and a put, you collect premium on both sides of the market..."), which the catalog strings do not. A `condition_explanation` string for `short_strangle` is 87 characters; the named `core` paragraph is 443 characters — over 5× more educational content. A direct replacement would cut the educational content of the most-used strategies by 80%.

**Supplementing adds information without removing it.**

The two pieces of text are answering different questions. The `core` paragraph answers "how does this strategy work?". The `condition_explanation` answers "why does the current market environment suit it?". Neither makes the other redundant. A user reading both gets a more complete picture than reading either alone.

**The generic `else` branch benefits most.**

For the 11 strategies that currently fall to the generic branch, `condition_explanation` is a net addition of specific, strategy-keyed rationale. In the generic branch, it effectively upgrades the output from boilerplate to near-named-branch quality without requiring 11 new hand-written named paragraphs.

---

## Rejected Alternative — Replace named branches with condition_explanation

Rejected because: the named `core` paragraphs are the primary educational content for beginners on a paper-trading platform. Shortening them by 80% to save two lines per strategy would degrade the core user value proposition. The catalog strings were written as internal engine documentation, not as user-facing prose. They are accurate and concise, but not adequate as standalone strategy explanations.

---

## Rejected Alternative — Add condition_explanation only to the generic else branch

Rejected because: named-branch strategies would lose the conditions-rationale context that `condition_explanation` provides. Users on named-branch strategies would have no explicit conditions-match justification in the narrative. Consistency across all 31 strategies is preferable.

---

## Consequences

- `_why_this_strategy` gains one additional paragraph for every strategy — `conditions_rationale` between `core` and `risk_note`.
- The paragraph is omitted (empty string guard) only if `condition_explanation` is missing from the strategy dict, which is not expected to occur for any current catalog entry.
- Future catalog additions must include a `condition_explanation` field or the conditions-rationale paragraph will silently be absent for that strategy.
- The pattern "Why these conditions: {single sentence}" provides a clear, parseable label for users who read the narrative to understand the conditions-match logic.

# Feature Spec — Scanner Net Order Price Guidance Box

**Date:** 30Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

When a user opens the "How to place this trade" panel for a multi-leg strategy in the Strategy
Scanner, the panel shows each leg individually with its own Pay/Collect amount, then a summary
line: "Net: Pay $349 debit per spread / Exit when …". What the panel does not show is the
single signed number the user must actually key into their broker as a combo or spread order.
Real brokers (ThinkorSwim, Tastytrade, IBKR, Webull) all require multi-leg strategies to be
submitted as one combo order at one net price — not leg-by-leg. The user currently has to
mentally compute `2 × $14.80 − $28.26 − $4.83 = −$3.49` on the fly, risking a keying error or
confusion about sign convention.

This feature adds a **Net Order Price guidance box** directly below the existing "Net: Pay $X
debit per spread / Exit when" summary row, inside the `TradeInstructions` component in
`StrategyDetail.tsx`. The box is **purely additive** — the existing numbered legs, Pay/Collect
amounts, Net line, and Exit line are not changed in any way. The box shows: the signed net value
computed from leg mids already present on the card, the arithmetic formula that produced it, a
large signed number with a Debit/Credit tag, the equivalent positive-magnitude DR/CR
representation used by brokers with a Debit/Credit toggle, and a plain-English direction guide
explaining which way to move the limit to improve the fill. The box is gated to strategies with
two or more option legs; single-leg strategies retain their existing panel unchanged.

This is a **frontend-only** change. No backend route, API contract, database schema, or
subscription tier logic is modified.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Active multi-leg spread trader using OptionsDesk alongside a real broker | starter / pro | See the exact net combo-order price to key into a broker order ticket without doing mental arithmetic, and know immediately which direction improves the fill |
| Options learner paper-trading iron condors and butterflies | free / starter | Understand what "net debit" means as a concrete number to enter, and learn the broker convention (DR vs. negative sign) so the transition to a real broker is smooth |
| Pro trader scanning many tickers and strategies | pro / enterprise | Quickly read the net price and direction from the panel without opening a calculator, keeping the scan-to-execution loop fast |
| Admin / platform reviewer | admin | Verify that the panel renders correctly across multi-leg strategies and that single-leg strategies are unaffected |

---

## 3. Functional Requirements

All requirements are frontend-only, confined to the `TradeInstructions` function in
`frontend/src/components/StrategyDetail.tsx`. No backend route, API contract, schema, or
`TradeStructure` interface change is required.

### Leg count gate

1. The net order price box must appear **only** when the number of distinct option legs shown in
   the `TradeInstructions` panel is two or more. "Distinct option legs" means the collapsed
   `displayLegs` array used by the panel — after merging duplicate legs (same `strike` + `action`
   + `option_type`) into a single row with a `qty` count, and after filtering out `option_type
   === 'stock'` legs. For strategies whose `displayLegs` length is exactly one, the box must
   not be rendered and the existing panel must be visually unchanged.

2. The following strategies produce exactly one option leg after stock-leg filtering and
   deduplication, and must therefore never show the box: Short Naked Put (`short_naked_put`),
   Short Naked Call (`short_naked_call`), and the single short-call option leg of Covered Call
   (`covered_call`, which shows one `option_type !== 'stock'` leg after the stock leg is
   filtered out by the existing `displayLegs` logic). Any other strategy in the 31-strategy
   catalog with a `displayLegs.length >= 2` receives the box automatically without per-strategy
   hardcoding.

### Signed net computation

3. The signed net per spread must be computed as:

   `signedNet = Σ over displayLegs of (leg.action === 'sell' ? +1 : −1) × leg.mid × leg.qty`

   This is a pure JavaScript computation using `leg.mid` and `leg.qty` (the already-collapsed
   display quantity) from the `displayLegs` array that is already constructed inside
   `TradeInstructions`. No new data fetch or prop is needed.

4. `signedNet < 0` means the trade is a **debit** (the user pays). `signedNet > 0` means
   the trade is a **credit** (the user collects). `signedNet === 0` is treated as a debit
   (defensive fallback, extremely unlikely in practice).

5. The existing `trade.estimated_credit_or_debit` field is **not** used to derive the signed
   net. The box computes its own signed net from leg mids so that the formula shown in the box
   is arithmetically consistent with the numbers visible in the leg rows. The two values should
   agree in magnitude; if they differ slightly (e.g. due to rounding), the box uses the leg-mid
   computation and the existing "Net:" line continues to use `estimated_credit_or_debit`
   unchanged.

6. The total in dollars per contract (one standard 100-share multiplier) is:

   `totalDollars = signedNet × 100`

### Box content

7. The box must contain the following elements, in order from top to bottom:

   a. A label line reading: "Net order price — key this ONE number as a combo order".

   b. A formula line showing the arithmetic that produced `signedNet`, using the actual mid
      prices from the leg rows. For a strategy with two or more legs, the formula must show
      each leg's contribution as `(qty × $mid)` prefixed by `+` for sell legs and `−` for buy
      legs, connected by ` = ` to the final signed result. Example for a 4-leg iron butterfly:
      `net = (2 × $14.80) − $28.26 − $4.83 = −$3.49`. The exact formatting (parentheses for
      qty > 1, dollar signs, 2 decimal places) is a design decision for the architect, but the
      formula must be computable by inspection from the visible leg mids.

   c. A large signed number displayed prominently (minimum font size 20px as a guide for the
      architect): the value is `signedNet` formatted to 2 decimal places with its natural sign.
      Example: `−3.49` for a debit, `+1.85` for a credit.

   d. A tag adjacent to the large number: `Debit` rendered in red (`C.red`) when
      `signedNet < 0`; `Credit` rendered in green (`C.green`) when `signedNet >= 0`.

   e. A per-spread total in dollars: `−$349` for a debit of 3.49 (`signedNet × 100` rounded to
      0 decimal places), or `+$185` for a credit of 1.85.

   f. An alternative representation for brokers that use a separate Debit/Credit toggle and
      always expect a positive magnitude: `DR 3.49` for debits and `CR 1.85` for credits, where
      the numeric value is `Math.abs(signedNet)` formatted to 2 decimal places.

   g. A direction guide section — one of two mutually exclusive paragraphs depending on sign:
      - **Debit (`signedNet < 0`):** "Key the negative number. Better fill = less negative
        (pay less, lower max loss). Worse fill = more negative."
      - **Credit (`signedNet >= 0`):** "Key the positive number. Better fill = more positive
        (collect more). Worse fill = less positive."

### Placement and visual treatment

8. The box must be inserted **directly below** the existing summary row that contains the
   "Net: Pay $X debit per spread" and "Exit when:" text — i.e. immediately after the closing
   `</div>` of the grey summary row inside `TradeInstructions`. The existing summary row is
   not modified.

9. The box must be visually distinct from the surrounding panel: a different background colour
   from the grey summary row (e.g. a dark blue tint such as `#0a1628` or equivalent using the
   existing `C.*` palette), with a coloured left border or accent border matching the debit/credit
   colour (`C.red` for debit, `C.green` for credit). Exact visual treatment is the architect's
   decision within those constraints.

10. The box must not contain any interactive elements (no buttons, no toggles, no clipboard
    copy). It is a read-only display panel.

11. The box must be responsive — it must not overflow horizontally on viewports narrower than
    375px. The formula line in particular may need to wrap or use a condensed format on small
    screens. The exact responsive treatment is the architect's decision.

### Existing panel preservation

12. Every element of the existing `TradeInstructions` panel — numbered leg rows, Pay/Collect
    amounts, the grey summary row containing "Net:" and "Exit when:", breakeven display — must
    be visually and behaviourally identical after this feature ships. No regression is permitted
    in the existing panel content.

13. The `TradeInstructions` component in `StrategyDetail.tsx` is the only location that requires
    a code change. The `TradePanel.tsx` sidebar component renders its own separate order entry
    view and does not contain the "How to place this trade" panel; it is out of scope and must
    not be modified.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Box Appears Only for Multi-Leg Strategies

**As a** paper trader using the Strategy Scanner, **I want** the net order price box to appear
only for multi-leg strategies **so that** single-leg strategies keep a clean, uncluttered panel
and I am not confused by a "combo order" concept when there is only one leg.

**Acceptance Criteria:**

- [ ] AC1: Open a multi-leg strategy (e.g. Iron Condor, Bull Put Spread, Call Butterfly). The
  net order price box is visible below the grey "Net: … Exit when: …" summary row inside the
  "How to place this trade" panel. A tester can verify this within 2 minutes by expanding any
  multi-leg strategy card in the Scanner.
- [ ] AC2: Open a single-option-leg strategy (Short Naked Put or Short Naked Call). The net
  order price box is absent. The "How to place this trade" panel shows the existing numbered
  leg row and grey summary row exactly as it does today, with no additional elements below the
  summary row.
- [ ] AC3: Open a Covered Call strategy. The "How to place this trade" panel filters out the
  stock leg and shows only the single short-call leg row. The net order price box is absent
  because `displayLegs.length === 1` after stock-leg filtering.
- [ ] AC4: Open every category section in the deep-analysis view and expand at least one
  strategy per category. Confirm that every strategy with two or more option legs shows the
  box and every single-leg strategy does not show the box. No strategy incorrectly shows or
  hides the box.

---

### Story 2 — Signed Net Value and Formula Are Correct

**As a** options trader about to enter a combo order, **I want** the net order price box to
show me the correct signed number and the arithmetic that produced it **so that** I can trust
the number and understand how it was derived from the visible mid prices.

**Acceptance Criteria:**

- [ ] AC1: For an Iron Condor with legs: Sell 115 Put @ $1.85 mid, Buy 110 Put @ $0.63 mid,
  Sell 125 Call @ $1.45 mid, Buy 130 Call @ $0.52 mid — the box shows `signedNet = +2.15`
  (credit: (1.85 − 0.63) + (1.45 − 0.52) = 1.22 + 0.93 = 2.15). The large number displayed
  is `+2.15` and the tag reads "Credit" in green. A tester verifies by summing sell mids minus
  buy mids manually and comparing to the displayed value.
- [ ] AC2: For a Bull Call Spread with legs: Buy 150 Call @ $3.20 mid, Sell 155 Call @ $1.05
  mid — the box shows `signedNet = −2.15` (debit: +1.05 − 3.20 = −2.15). The large number
  is `−2.15` and the tag reads "Debit" in red.
- [ ] AC3: The formula line is visible and shows each leg's mid price as a distinct term.
  Cross-referencing the formula against the leg table rows above it, every mid value in the
  formula matches the corresponding "Mid" column cell in the leg table. A tester can verify by
  reading both rows.
- [ ] AC4: For a strategy using a quantity-2 leg (e.g. a 1-2-1 Butterfly where the body is
  Sell ×2), the formula shows the quantity multiplier (e.g. `2 × $14.80`) and the computed
  contribution is `qty × mid`, not just `mid`. The large signed net reflects this correctly.
- [ ] AC5: The per-spread total in dollars equals `signedNet × 100` rounded to the nearest
  dollar. For `signedNet = −3.49`, the total is `−$349`. For `signedNet = +2.15`, the total
  is `+$215`. A tester verifies by multiplying the displayed signed net by 100 and comparing
  to the displayed total.

---

### Story 3 — Debit/Credit Tag and Direction Guide Match the Sign

**As a** paper trader learning broker conventions, **I want** the box to clearly label the net
as Debit or Credit and tell me which direction to move the limit price to get a better fill
**so that** I understand the economics of the order before submitting it.

**Acceptance Criteria:**

- [ ] AC1: For any strategy with `signedNet < 0`, the tag adjacent to the large number reads
  "Debit" and is rendered in red (`C.red`). The direction guide text reads that less-negative
  is a better fill (the user pays less). Verify by expanding a known debit strategy (e.g. Bull
  Call Spread) and confirming the tag colour and text.
- [ ] AC2: For any strategy with `signedNet > 0`, the tag reads "Credit" and is rendered in
  green (`C.green`). The direction guide text reads that more-positive is a better fill (the
  user collects more). Verify by expanding a known credit strategy (e.g. Short Strangle, Iron
  Condor) and confirming the tag colour and text.
- [ ] AC3: Switching between a debit strategy and a credit strategy (without leaving the deep
  analysis view) causes the box to update: tag colour, direction guide text, the sign of the
  large number, and the DR/CR alternative all change appropriately. No stale render from a
  previous strategy.
- [ ] AC4: The direction guide uses plain English that a beginner can understand without
  options domain knowledge. The words "better" and "worse" (or equivalents) appear in the
  guide text alongside the directional instruction. A non-expert tester can read the text and
  correctly state which direction moves the limit price for a better fill.

---

### Story 4 — DR/CR Alternative Is Shown Correctly

**As a** paper trader who uses a broker with a Debit/Credit toggle (e.g. Tastytrade),
**I want** to see the equivalent positive-magnitude DR/CR representation alongside the signed
number **so that** I can key the correct absolute value into my broker's order ticket without
mental sign conversion.

**Acceptance Criteria:**

- [ ] AC1: For `signedNet = −3.49` (debit), the box displays `DR 3.49` where `3.49 =
  Math.abs(−3.49)`. The `DR` prefix is present and the value is positive and formatted to
  2 decimal places.
- [ ] AC2: For `signedNet = +2.15` (credit), the box displays `CR 2.15`. The `CR` prefix is
  present.
- [ ] AC3: The DR/CR value is visually distinct from the large signed number (different label,
  different size, or muted styling) so a tester can distinguish between the two representations.
  The DR/CR section does not replace the signed number; both are visible simultaneously.
- [ ] AC4: The DR/CR value equals `Math.abs(signedNet)` formatted to exactly 2 decimal places.
  For `signedNet = −3.50`, the display is `DR 3.50` (not `3.5` or `3.500`). Verify by checking
  a strategy whose abs(net) ends in a trailing zero.

---

### Story 5 — Existing "How to Place This Trade" Panel Is Unchanged

**As a** paper trader who relies on the existing numbered leg instructions and Net/Exit summary,
**I want** the existing panel content to remain exactly as it is after this feature ships **so
that** my existing workflow is not disrupted and no information is removed or rearranged.

**Acceptance Criteria:**

- [ ] AC1: Open any multi-leg strategy. The numbered leg rows (row number, BUY/SELL badge,
  option type, quantity, strike, expiry, delta, and Pay/Collect amount) are visually identical
  to the current production layout. No row is removed, reordered, or restyled.
- [ ] AC2: The grey summary row containing "Net: Pay $X debit per spread" (or "Collect $X
  credit per spread") and "Exit when:" text is present, in its current position, immediately
  below the last numbered leg row. Its content and styling are unchanged. The net order price
  box appears below this summary row, not in place of it.
- [ ] AC3: The breakeven display ("Profit zone: $X – $Y" or "Breakeven: $X") — when present —
  is still shown in the same position as before. It is not displaced by the new box.
- [ ] AC4: Open a single-leg strategy (Short Naked Put or Short Naked Call). The entire
  "How to place this trade" panel looks identical to the current production layout. No extra
  whitespace, no empty box, no visual artifact from the new feature.
- [ ] AC5: The `TradePanel.tsx` sidebar (the "Confirm & Record Trade" panel that opens on the
  right when "Record Trade →" is clicked) is visually unchanged. It does not contain the net
  order price box and must not be modified by this feature.

---

### Story 6 — Missing or Zero Leg Mid Is Handled Gracefully

**As a** paper trader analyzing a strategy on an illiquid or synthetic-data ticker,
**I want** the box to either hide or display a degraded-but-safe state when one or more leg
mids are zero or missing **so that** a bad data quality condition does not show me a
misleading net price.

**Acceptance Criteria:**

- [ ] AC1: If one or more legs has `mid === 0` (the yfinance zero-mid condition that
  `fill_quote` in the backend may not have been able to correct), the box must display a
  warning message instead of the computed net price (e.g. "Net price unavailable — one or more
  leg mids are zero; verify quotes before trading"). The numbered leg rows above still show
  `0.00` for the affected mid, consistent with current behaviour.
- [ ] AC2: If the options chain data is flagged `_synthetic` (Black-Scholes fallback), the
  existing synthetic data warning banner already shown by the scanner is unchanged. The net
  order price box may still render based on the synthetic mids but must not suppress or replace
  the existing synthetic warning. The box may optionally include a note that the price is
  based on synthetic data, but this is advisory only and does not block rendering.
- [ ] AC3: A strategy with all legs having `mid > 0` renders the full box with formula,
  signed number, tag, total, DR/CR, and direction guide. No spurious "unavailable" message
  appears for a well-quoted strategy.
- [ ] AC4: If `displayLegs` is empty (defensive edge case — should not occur in practice since
  the box is only shown for `displayLegs.length >= 2`), the box does not crash the component.
  A defensive guard renders nothing in this case.

---

## 5. Out of Scope

- Any change to `TradePanel.tsx`. That component renders the sidebar order-entry flow and does
  not contain the "How to place this trade" panel.
- Any change to the existing numbered leg rows, the Pay/Collect per-leg amounts, the "Net:" line,
  the "Exit when:" line, the breakeven display, or any other element inside the existing grey
  summary row. The feature is purely additive.
- Any backend route change. `GET /api/strategies/analyze/{symbol}` and
  `GET /api/strategies/scan` are unchanged. No new API endpoint is introduced.
- Any change to the `TradeStructure`, `TradeLeg`, or any other TypeScript interface in
  `api/client.ts`.
- A clipboard-copy button for the net price. This may be added in a later iteration but is not
  in scope for v1.
- Per-broker formatting presets (e.g. "format for ThinkorSwim" vs. "format for Tastytrade").
  The DR/CR alternative representation covers the main toggle convention. Broker-specific
  templates are out of scope.
- Display of the net order price inside `TradePanel.tsx` when the user clicks "Record Trade →"
  to open the order-entry sidebar. The sidebar already shows the debit/credit magnitude and a
  multiplier; extending it with the signed net is a separate feature.
- Any subscription tier gate. The guidance box is visible to all tiers that can access the
  Strategy Scanner deep analysis view. No new entitlement check is introduced.
- Any database migration or Supabase schema change.
- Display of a sensitivity range (e.g. "between −3.30 and −3.60 based on bid/ask spread").
  The box uses mids only, which matches the existing leg table and the existing "Net:" line.
- Any change to the 31-strategy catalog, the backend `strategy_engine.py`, or the
  `interpreter.py` narrative generator.
- Any change to the `StrategyScanner.tsx` scanner results list or the scanner's scan trigger
  and watchlist logic.
- Any change to `StrategyNarrative.tsx`, `OrderEntry.tsx`, `RiskMonitor.tsx`, `Positions.tsx`,
  `PnLChart.tsx`, `OptionsChain.tsx`, `AdminPanel.tsx`, `UserGuide.tsx`, or any component
  outside `StrategyDetail.tsx`.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| `displayLegs.length === 1` (single-leg strategy) | Box is not rendered. Existing panel is unchanged. No whitespace or empty container. |
| `displayLegs.length === 0` (defensive — should not reach `TradeInstructions` in this state) | Box is not rendered. No crash. Defensive guard returns null for the box. |
| One or more legs have `mid === 0` | Box shows a warning string instead of the computed net. Existing leg rows still display `0.00` for mid. No crash. |
| All legs have `mid === 0` | Same as above — warning message, no computed formula, no crash. |
| `signedNet === 0` (extremely unlikely but arithmetically possible if a credit leg and debit leg have identical total contribution) | Treated as debit (FR-4 defensive fallback). Tag reads "Debit" in red. Direction guide shows debit text. No division by zero or crash. |
| Strategy data flagged `_synthetic` (Black-Scholes fallback mids) | Box renders using synthetic mids with an optional advisory note. The existing synthetic warning banner is unaffected and remains visible. |
| Very large mid values (e.g. a LEAPS contract at $40 mid) | `signedNet × 100` produces a large integer (e.g. `−$4000`). The per-spread total is formatted with `toLocaleString` or equivalent to avoid overflow. `−$4,000` is acceptable. |
| Negative `leg.mid` (should not occur — `fill_quote` in the backend prevents it; but defensive guard) | The formula term renders a negative mid. The box still displays and the signed net may be non-intuitive. An optional guard that treats `mid < 0` as `0` (and shows the zero-mid warning) is acceptable. Architect to decide. |
| Strategy with a quantity-2 leg where both legs have the same strike/action/type (e.g. Call Butterfly body) | `displayLegs` correctly shows `qty: 2` for the merged leg. Formula shows `2 × $mid`. Signed net uses `qty × mid`. No double-counting or omission. |
| User is on a mobile viewport (< 375px wide) | The formula line wraps without horizontal scroll. The large signed number and tag remain readable without truncation. The box does not break the overall panel layout. |
| Deep analysis opened from the Scanner watchlist scan results vs. from direct symbol entry | The `TradeInstructions` component receives the same `trade` prop in both flows. No difference in box behaviour. |
| Market data unavailable (strategy returns `trade.error`) | The existing error banner is shown instead of the trade structure. `TradeInstructions` is not rendered. The box is never rendered in this case — no defensive guard needed beyond the existing `if (trade.error)` branch in `TradeCard`. |

---

## 7. External Dependencies

| Service | Usage in This Feature | Quota / Risk |
|---------|----------------------|--------------|
| yfinance | Not affected. Leg mids used by the box are already fetched as part of `GET /api/strategies/analyze/{symbol}`. No new API call is made. | None. |
| Supabase | Not affected. No new query, no schema change. | None. |
| Claude API | Not affected. The narrative generation and AI insight features are unchanged. | None. |
| Reddit PRAW | Not used by this feature. | None. |

This feature has zero external dependency risk. All data required (leg `action`, `mid`, `qty`
after deduplication) is already present in the `displayLegs` array constructed inside
`TradeInstructions` at render time. The computation is pure JavaScript arithmetic.

---

## 8. Subscription Tier Impact

No tier gate is added or changed. The guidance box is visible to all tiers that currently have
access to the Strategy Scanner deep analysis view. Tier access to the scanner is an existing
gate governed by `useEntitlements` and monthly scan count limits; this feature does not affect
those limits or checks.

| Tier | Behaviour |
|------|-----------|
| free | Scanner deep analysis accessible within monthly scan limit. Net order price box visible for all multi-leg strategies returned. |
| starter | Scanner deep analysis accessible within monthly scan limit. Net order price box visible for all multi-leg strategies returned. |
| pro | Scanner accessible with higher scan limit. Net order price box visible for all multi-leg strategies returned. |
| enterprise | Unlimited scan access. Net order price box visible for all multi-leg strategies returned. |

---

## 9. Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| OQ-1 | **Formula format on narrow viewports.** The formula `net = (2 × $14.80) − $28.26 − $4.83 = −$3.49` can exceed 300px on mobile. Should it truncate, wrap, or use a condensed format (e.g. show only the final result, with the formula in a tooltip or collapsed section) on viewports narrower than 480px? Recommend: wrap at the `=` sign so the result stays on its own line. Architect to confirm DOM approach. | Architect | If unresolved: developer wraps the formula text and allows natural line breaks. This is the safe default. |
| OQ-2 | **Zero-mid warning text.** When one or more legs has `mid === 0`, the spec says show a warning instead of the computed net. Should the box still show the formula with the zero substituted (so the user can see which leg is the problem), or should it show only the warning text without any formula? Recommend: show the warning text only, without a partial formula, to avoid the user mistakenly using a zero-inflated number. Architect to confirm. | Architect | If unresolved: developer shows warning text only, no formula. |
| OQ-3 | **Label wording.** The user-approved label is "Net order price — key this ONE number as a combo order". This is intentionally direct. Should "combo order" be "spread order" or "multi-leg order" to be broker-agnostic? "Combo order" is the term used by ThinkorSwim; "spread order" is used by Tastytrade; "combination order" by IBKR. Recommend retaining "combo order" as it is the most commonly searched term. Confirm with PO. | Product Owner | If unresolved: developer uses "combo order" as specified by the user. |
| OQ-4 | **Direction guide detail level.** The spec requires "less-negative = better" for debits and "more-positive = better" for credits, with a brief explanation. Should the guide also mention the practical implication for max loss on debits (paying less = lower max loss) and max profit on credits (collecting more = higher effective credit)? The user's approved design included these parenthetical notes. Recommend including them for educational value, especially for the learner persona. Confirm with PO. | Product Owner | If unresolved: developer includes the parenthetical notes as specified in the user-approved design. |
| OQ-5 | **Consistency with `trade.estimated_credit_or_debit`.** FR-5 specifies that the box computes its own signed net from leg mids rather than using `estimated_credit_or_debit`. In normal conditions these should agree. Should the box include a silent sanity-check assertion (e.g. log a warning to console if the box's computed `|signedNet|` differs from `|estimated_credit_or_debit|` by more than $0.10) to catch data inconsistencies during development? This is a developer-facing diagnostic, not a user-facing feature. Recommend yes, in development builds only. Architect to decide. | Architect | If unresolved: developer adds a console.warn in development mode only. Does not affect production rendering. |
| OQ-6 | **Covered Put treatment.** `covered_put` has a "Short Stock" leg (`option_type: 'stock'`) and one short put option leg. After stock-leg filtering, `displayLegs` has length 1, so the box would not render (same logic as Covered Call). Confirm this is the correct treatment — the short put is a single-leg option order even though the full position includes a stock short. Recommend: confirm via strategy engine review that `covered_put` stock leg is `option_type: 'stock'` and therefore filtered. | Architect | If unresolved: developer treats `covered_put` identically to `covered_call` — stock leg filtered, one option leg remains, box not shown. |

---

## 10. Codebase Findings

The following findings from reading the source code are included to give the solution architect
precise anchoring points. These are not requirements — they are factual observations.

### Location of "How to place this trade" panel

The panel is rendered by the `TradeInstructions` function (lines 273–366 of
`frontend/src/components/StrategyDetail.tsx`). It is called from `TradeCard` at line 461.
The "Net: Pay $X debit per spread / Exit when:" summary row is rendered at lines 333–363 inside
a `<div style={{ ... background: C.surface2 ... }}>` wrapper. The new box must be inserted
immediately after the closing `</div>` of this grey summary wrapper, still inside the outer
`TradeInstructions` container.

### `displayLegs` construction

`TradeInstructions` constructs its own `displayLegs` array (lines 284–295) by iterating
`trade.legs.filter(l => l.option_type !== 'stock')` and merging duplicate rows. This is the
array used for the numbered leg rows and for the net price computation in the new box. The
quantity multiplier is `leg.qty` on the collapsed `DisplayLeg` type.

### Existing debit/credit derivation

The existing `isCredit` flag inside `TradeInstructions` (line 274) is:
`const isCredit = trade.estimated_credit_or_debit >= 0`. This drives the "Collect"/"Pay"
wording in the grey summary row. The new box does **not** change this; it derives its own
`signedNet` from leg mids per FR-3.

### Single-leg strategies confirmed

After stock-leg filtering, the following strategies produce `displayLegs.length === 1`:
- `short_naked_put` — one short put leg.
- `short_naked_call` — one short call leg.
- `covered_call` — stock leg filtered, leaving one short call option leg.
- `covered_put` — stock leg filtered (OQ-6 above), leaving one short put option leg.

### No `TradeLeg.qty` in the TypeScript interface

`TradeLeg` in `api/client.ts` (lines 242–255) does not have a `qty` field. The `qty` is added
by the local `DisplayLeg` type inside `TradeInstructions` (`type DisplayLeg = TradeLeg & { qty:
number }`). The `signedNet` computation must use this local extended type and is self-contained
within `TradeInstructions`.

---

## 11. Product Owner Annotations

_Filled in by the product-owner agent — 30Jun2026._

---

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Formula overflow on narrow mobile | **Binding: two-tier responsive layout.** On desktop (>= 480px) the formula line wraps naturally — allow it to break across lines without restriction; no font shrink; no truncation. On mobile (< 480px) the formula line is **replaced** with a condensed result line only: `net = −3.49 (debit)` or `net = +2.15 (credit)`. The large signed number, the DR/CR alternative, and the direction guide are still shown in full on mobile. The per-leg arithmetic is omitted from mobile view entirely. This is a product decision, not a configuration option — the architect must not add a toggle. |
| OQ-2 — Zero or missing mid legs | **Binding: show the box with an amber caution note.** When any leg has `mid === 0` or `mid` is absent/NaN, the box renders but replaces the formula and signed-net number with the caution text: "One or more leg mids are unavailable — verify the net price on your broker before placing this order." The large number, DR/CR row, and direction guide are suppressed (not shown). The per-spread total is also suppressed. The caution text is rendered in an amber colour (e.g. `#d97706` or the closest `C.*` equivalent). The numbered leg rows above still display `0.00` for the affected mid — no change to existing leg row behaviour. This is option (a) from the BA recommendation, with the partial-formula display dropped in favour of clean caution-only output to prevent the user mistakenly acting on a zero-inflated net. |
| OQ-3 — Label wording | No change required. "combo order" is retained as specified by the user-approved design. BA recommendation confirmed. No action for the architect. |
| OQ-4 — Direction guide detail level | No change required. The parenthetical notes ("pay less, lower max loss" for debits; "collect more" for credits) are included as per the user-approved design and the spec's FR-7g wording. Confirmed for the architect: include the parenthetical notes exactly as written in FR-7g. |
| OQ-5 — Consistency check vs `trade.estimated_credit_or_debit` | **Binding: implement a dev-only `console.warn`.** The developer adds a `console.warn` (guarded by `process.env.NODE_ENV === 'development'` or Vite's `import.meta.env.DEV`) that fires when `Math.abs(signedNet) − Math.abs(trade.estimated_credit_or_debit)` exceeds `0.05`. No user-facing rendering; no warning shown in production. This is a developer diagnostic only. Threshold is $0.05, not $0.10 — tighter than the BA recommendation to catch meaningful rounding divergence earlier. |
| OQ-6 — Covered Put / Covered Call stock-leg treatment | **Binding: both are single-leg after stock-leg filtering and must NOT show the box.** `covered_put` has a `option_type: 'stock'` leg (Short Stock) and one short put option leg. After the existing `displayLegs` filter (`l.option_type !== 'stock'`), `displayLegs.length === 1`. The architect must confirm via codebase inspection that the `covered_put` legs array in `strategy_engine.py` contains exactly one leg with `option_type: 'stock'` and one with `option_type: 'put'`, and that the `displayLegs` filter in `TradeInstructions` therefore yields length 1. This confirmation must appear explicitly in `02-design.md`. No per-strategy hardcoding is introduced — the box is gated purely on `displayLegs.length >= 2` after stock filtering, which already handles both `covered_call` and `covered_put` correctly. |

### Additional Binding Decisions

- **Frontend-only confirmed.** No backend route, API endpoint, TypeScript interface in `api/client.ts`, database schema, or subscription tier gate is changed. The architect must not propose any backend modification.
- **`displayLegs` reuse confirmed.** The box uses the `displayLegs` array already constructed inside `TradeInstructions`. No new prop on `TradeInstructions` or `TradeCard` is required for the net computation. The `signedNet` is a derived constant computed inline from `displayLegs`.
- **No interactive elements.** The box is read-only. No clipboard copy, no tooltip, no collapse/expand toggle. The mobile condensed-formula behaviour (OQ-1) is a static layout decision, not an interactive toggle.
- **No tier gate.** The box is visible to all tiers that currently access the Strategy Scanner deep analysis view. The architect must not add any entitlement check.
- **`TradePanel.tsx` is out of scope.** The architect must not propose any change to that file.

---

### Priority Scores

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — Box appears only for multi-leg strategies | 1 — Must Have | The gate logic is the foundation of everything else. Shipping without it would show the box on single-leg strategies and break Story 5 (existing panel preservation). Inseparable from the feature. |
| Story 2 — Signed net value and formula are correct | 1 — Must Have | The entire user value is the correct signed number. An incorrect formula destroys trust. This is the core deliverable. |
| Story 3 — Debit/Credit tag and direction guide match the sign | 1 — Must Have | The tag and direction guide are what make the number actionable for learners and converts. Without them the box is a number with no context — the direction guide is the educational differentiator that justifies this feature for the learner persona. |
| Story 4 — DR/CR alternative is shown correctly | 1 — Must Have | Broker onboarding is explicitly called out in the summary. A learner moving to Tastytrade will need the DR/CR form. Deferring this removes a concrete, user-stated pain point. It is two extra lines of display code and has zero architectural complexity. |
| Story 5 — Existing panel is unchanged | 1 — Must Have | Non-negotiable regression guard. No additive feature may break existing behaviour. This story exists to make the regression explicit and testable. |
| Story 6 — Missing or zero leg mid is handled gracefully | 1 — Must Have | Illiquid and synthetic-chain tickers are a real condition in this app (yfinance zero-mid, Black-Scholes fallback). Shipping without the guard means the box silently shows a misleading $0.00 or negative-only number on synthetic data. The fix is a few lines of JavaScript. Deferring this is not an option when the data condition is known to exist in production. |

---

### MVP Boundary

**All 6 stories ship in v1.**

Rationale: This is a single-file frontend change (`StrategyDetail.tsx`). The six stories are tightly coupled — Stories 1 and 5 are the gate and regression guard for the same rendering block; Stories 2, 3, and 4 together constitute the box content (splitting them would ship a box with a number but no label, or a label but no direction guide); Story 6 is a defensive guard that costs negligible implementation effort and prevents a known production data condition from producing a misleading result. Splitting any story out of v1 would either leave the feature partially broken or require a second PR touching the same lines within days. The correct MVP is the complete, safe, coherent box.

**Deferred to backlog (not in v1):**
- Clipboard-copy button for the net price (explicitly out of scope in Section 5).
- Per-broker formatting presets (ThinkorSwim vs. Tastytrade templates) — out of scope in Section 5.
- Bid/ask sensitivity range display — out of scope in Section 5.
- Net order price inside `TradePanel.tsx` order-entry sidebar — out of scope in Section 5.

---

### PO Gate Decision

GO — proceed to Gate 3 (Architecture Design).

The solution architect may begin. The design doc (`02-design.md`) must address:

1. Confirmation that `covered_put` and `covered_call` both yield `displayLegs.length === 1` after stock-leg filtering — verified via `strategy_engine.py` leg definitions. State the result explicitly.
2. The `signedNet` derived constant: type, formula, placement inside `TradeInstructions` (after `displayLegs` is constructed, before the JSX return), and the zero-mid guard that triggers the amber caution path.
3. The two-tier mobile layout for OQ-1: the CSS/inline-style approach for hiding the formula line on viewports < 480px and rendering the condensed `net = −3.49 (debit)` string instead. The large number, DR/CR, and direction guide remain visible at all widths.
4. The amber caution render path (OQ-2): what is shown, what is suppressed, the colour value used.
5. The `console.warn` guard for OQ-5: exact condition, threshold ($0.05), and `import.meta.env.DEV` guard to ensure it is development-only.
6. The `process.env.NODE_ENV` or `import.meta.env.DEV` guard approach chosen — must be consistent with the existing Vite setup in this repository.
7. Visual treatment: background colour, left border colour (red for debit, green for credit), font size for the large number (>= 20px). Exact `C.*` palette values or hex equivalents from `StrategyDetail.tsx`.
8. DOM placement: the box is inserted immediately after the closing `</div>` of the grey summary row wrapper inside `TradeInstructions`, still inside the outer container. Architect must cite the line reference from Section 10 and confirm the insertion point.
9. Confirmation that no element outside `StrategyDetail.tsx` is modified.
10. Confirmation that no new prop is added to `TradeInstructions`, `TradeCard`, or any other component.

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 30Jun2026

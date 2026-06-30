# Architecture Design — Scanner Net Order Price Guidance Box

**Feature folder:** `docs/FeatureRequests/scanner-net-order-price-30Jun2026/`
**Date:** 30Jun2026
**Author:** solution-architect
**Status:** Approved (Gate 3)

---

## 1. Scope Confirmation

This is a **frontend-only** change. The single file that changes is:

```
frontend/src/components/StrategyDetail.tsx
```

No backend route, no API endpoint, no TypeScript interface in `api/client.ts`, no database migration, no subscription tier gate, and no other frontend component is modified. `TradePanel.tsx` is explicitly out of scope and is not touched.

---

## 2. OQ-6 Verification — covered_call and covered_put Leg Counts

Source: `backend/services/strategy_engine.py`, lines 1197–1211 (`covered_call`) and lines 1451–1465 (`covered_put`).

**covered_call** (lines 1197–1211): the strategy appends one option leg (`"option_type": "call"`, `"action": "sell"`) and one stock leg (`"option_type": "stock"`, `"action": "buy"`, role `"Long Stock"`).

**covered_put** (lines 1451–1465): the strategy appends one option leg (`"option_type": "put"`, `"action": "sell"`) and one stock leg (`"option_type": "stock"`, `"action": "sell"`, role `"Short Stock"`).

The `displayLegs` construction in `TradeInstructions` (lines 285–295 of `StrategyDetail.tsx`) filters with `trade.legs.filter(l => l.option_type !== 'stock')` before deduplication. After this filter:

- `covered_call`: one option leg remains → `displayLegs.length === 1`
- `covered_put`: one option leg remains → `displayLegs.length === 1`

**Conclusion (binding):** both strategies yield `displayLegs.length === 1` after stock-leg filtering. The `displayLegs.length >= 2` gate correctly suppresses the net order price box for both without any per-strategy hardcoding.

---

## 3. Field Name Audit — DisplayLeg

`DisplayLeg` is a local type defined inside `TradeInstructions` at line 284:

```ts
type DisplayLeg = TradeLeg & { qty: number }
```

`TradeLeg` is defined in `api/client.ts` lines 242–255. The relevant fields and their confirmed names are:

| Field used in net computation | Confirmed name on `TradeLeg` / `DisplayLeg` | Notes |
|-------------------------------|---------------------------------------------|-------|
| Direction (sell vs buy)       | `leg.action`                                | String: `"sell"` or `"buy"` |
| Per-share mid price           | `leg.mid`                                   | `number`, present on `TradeLeg` |
| Deduplication quantity        | `leg.qty`                                   | Added by `DisplayLeg`; starts at 1, incremented for merged duplicate legs |

`leg.qty` does **not** exist on the base `TradeLeg` interface in `client.ts` (confirmed: lines 242–255 show no `qty` field). It is added exclusively by the local `DisplayLeg` type. The `signedNet` computation must therefore remain inside `TradeInstructions`, where `displayLegs` is typed as `DisplayLeg[]`.

The existing consistency-check field name is `trade.estimated_credit_or_debit` (confirmed: `TradeStructure` line 278 of `client.ts`). This is the field tested in the dev-only `console.warn`.

---

## 4. signedNet Computation

### Placement

`signedNet` is computed immediately after the `displayLegs` array is fully constructed (after line 295), before the JSX `return` statement. It is a plain `const`, not state.

### Zero/missing mid guard

The guard is evaluated first. A leg's mid is considered unavailable if:

```ts
leg.mid == null || leg.mid === 0
```

(This covers `null`, `undefined`, and the explicit zero-mid condition from yfinance. Negative mids are treated as zero by the same guard — `leg.mid <= 0` — to match the spec's defensive note in Section 6.)

```ts
const hasMissingMid = displayLegs.some(leg => leg.mid == null || leg.mid <= 0)
```

### signedNet value

```ts
const signedNet: number = displayLegs.reduce(
  (sum, leg) => sum + (leg.action === 'sell' ? 1 : -1) * leg.mid * leg.qty,
  0
)
```

### Debit/credit derivation

```ts
const boxIsCredit: boolean = signedNet > 0
// signedNet === 0 is treated as debit (defensive fallback per FR-4)
```

### Per-spread total in dollars

```ts
const totalDollars: number = Math.round(signedNet * 100)
```

### OQ-5 dev-only consistency warning

```ts
if (import.meta.env.DEV) {
  const estimated = Math.abs(trade.estimated_credit_or_debit)
  const computed = Math.abs(signedNet)
  if (Math.abs(computed - estimated) > 0.05) {
    console.warn(
      `[NetOrderPrice] signedNet (${computed.toFixed(4)}) diverges from ` +
      `estimated_credit_or_debit (${estimated.toFixed(4)}) by more than $0.05 ` +
      `for strategy ${trade.strategy_key}`
    )
  }
}
```

`import.meta.env.DEV` is the correct Vite guard for development-only code in this codebase (Vite is confirmed as the build tool in `CLAUDE.md` and `frontend/` structure). It is `true` during `npm run dev` and `false` in production builds. No `process.env.NODE_ENV` alternative is needed.

The warning only fires when `displayLegs.length >= 2` (the box is only computed in that branch) and `!hasMissingMid` (when we actually have a computed `signedNet` to compare). It produces no user-facing output.

---

## 5. Component Design — NetOrderPriceBox

### Sub-component vs inline JSX

A small local sub-component named `NetOrderPriceBox` is recommended over inline JSX for the following reasons:

1. The box has a clearly bounded responsibility with its own internal branching (missing-mid path vs normal render path).
2. It separates the amber caution path from the normal render path without nesting deeply inside `TradeInstructions`'s return.
3. It is testable in isolation by a QA engineer with a controlled props set.

The component is defined in the same file as `TradeInstructions` (still inside `StrategyDetail.tsx`), not extracted to a new file — keeping the change to one file as required.

### Props

```ts
interface NetOrderPriceBoxProps {
  displayLegs: Array<{ action: string; mid: number; qty: number }>  // DisplayLeg subset
  estimatedCreditOrDebit: number   // trade.estimated_credit_or_debit — for OQ-5 dev warn only
  isMobile: boolean                // true when viewport width < 480px
}
```

The `DisplayLeg` type is local to `TradeInstructions` and cannot be referenced from a sibling function in the same file without hoisting it. Two options:

- **Option A:** hoist `type DisplayLeg` to module scope so `NetOrderPriceBox` can reference it.
- **Option B:** use a structural inline type for the prop (`Array<{ action: string; mid: number; qty: number }>`).

**Decision:** Option B. Hoisting `DisplayLeg` to module scope is unnecessary — the prop is structurally typed with the three fields the box needs. `TradeInstructions` passes its `displayLegs` array directly; TypeScript structural typing ensures compatibility without a named export.

### Responsive mechanism — isMobile

`StrategyDetail.tsx` does **not** currently import `useWindowSize` (confirmed by grep). The file uses only `useState`, `useEffect`, and `useCallback` from React.

`NetOrderPriceBox` is not a hook-aware component in the current file (it is a plain function). Adding `useWindowSize` would require importing it. The alternative — a CSS media query — cannot be expressed in inline styles (React `style` prop does not support `@media`).

**Decision:** add a `useState` + `useEffect` width listener inside `TradeInstructions` to derive `isMobile` before passing it as a prop. This is consistent with how the existing `IVSourcePill` hover state is managed (plain `useState`), avoids importing `useWindowSize`, and keeps the change self-contained.

```ts
// Inside TradeInstructions, after displayLegs construction:
const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
useEffect(() => {
  const handler = () => setViewportWidth(window.innerWidth)
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [])
const isMobile = viewportWidth < 480
```

This follows the same pattern already used in the file (inline `useState` + cleanup in `useEffect`). No new import is needed — `useState` and `useEffect` are already imported at line 1.

---

## 6. Formula String Assembly

### Desktop formula (viewport >= 480px)

The formula is assembled from `displayLegs` in order. Each leg contributes one term:

- A sell leg (`action === 'sell'`) produces a **positive** term, prefixed with `+` (except if it is the first term overall, where the `+` may be omitted as a leading sign — implementation may include it for clarity).
- A buy leg (`action === 'buy'`) produces a **negative** term, prefixed with `−`.
- If `leg.qty > 1`, the term is formatted as `(qty × $mid.toFixed(2))` — parenthesised.
- If `leg.qty === 1`, the term is formatted as `$mid.toFixed(2)` — no parentheses.

Assembly example for a 4-leg iron butterfly where `displayLegs` = `[sell qty:2 mid:14.80, buy qty:1 mid:28.26, buy qty:1 mid:4.83]`:

Terms: `(2 × $14.80)`, `−$28.26`, `−$4.83`

Formula string: `net = (2 × $14.80) − $28.26 − $4.83 = −3.49`

The result is the formatted `signedNet`: negative values include the `−` sign, positive values include `+`.

Pseudocode:

```ts
function buildFormulaTerms(displayLegs): string {
  return displayLegs.map((leg, i) => {
    const isSell = leg.action === 'sell'
    const sign = isSell ? '+' : '−'
    const prefix = i === 0 ? (isSell ? '' : '−') : ` ${sign} `
    const value = leg.qty > 1
      ? `(${leg.qty} × $${leg.mid.toFixed(2)})`
      : `$${leg.mid.toFixed(2)}`
    return i === 0 ? `${isSell ? '' : '−'}${value}` : `${sign === '+' ? '+ ' : '− '}${value}`
  }).join('')
}
```

More precisely, the first term has no leading `+` for sell or a leading `−` for buy; every subsequent term is separated by ` + ` (sell) or ` − ` (buy).

Signed result formatting:
- `signedNet < 0`: `−${Math.abs(signedNet).toFixed(2)}`
- `signedNet >= 0`: `+${signedNet.toFixed(2)}`

Full formula line: `net = {terms} = {signedResult}`

### Mobile condensed form (viewport < 480px)

The formula line is replaced with:

```
net = −3.49 (debit)
```

or:

```
net = +2.15 (credit)
```

where the word in parentheses matches the tag. This is a static string; no interactive toggle.

---

## 7. Render Logic — Full Normal Path

When `displayLegs.length >= 2` and `!hasMissingMid`:

```
[box container — dark blue bg, coloured left border]
  Label:     "Net order price — key this ONE number as a combo order"
  Formula:   desktop → full formula line; mobile → condensed result line
  Large number + tag row:
             large font (22px) signed number  |  Debit/Credit tag
  Per-spread total:  "Total per contract: −$349" or "+$215"
  DR/CR row: "Alternative (broker toggle): DR 3.49" or "CR 2.15"
  Direction guide (debit):
             "Key the negative number. Better fill = less negative
              (pay less, lower max loss). Worse fill = more negative."
  Direction guide (credit):
             "Key the positive number. Better fill = more positive
              (collect more). Worse fill = less positive."
```

### Amber caution path (hasMissingMid is true)

When `displayLegs.length >= 2` and `hasMissingMid`:

```
[box container — same background, left border amber]
  Label:     "Net order price — key this ONE number as a combo order"
  Caution:   "One or more leg mids are unavailable — verify the net
               price on your broker before placing this order."
             [amber text, #d97706]
  [formula, large number, DR/CR row, per-spread total, direction guide — ALL SUPPRESSED]
```

The box still renders (not null) so the user sees the panel header and understands why the number is absent.

---

## 8. Visual Treatment

All values are taken from the existing `C` palette defined at lines 19–32 of `StrategyDetail.tsx`.

### Box container

```
background:    '#0a1628'   (dark navy, distinct from C.surface2 = '#252836' used by the grey summary row)
border-left:   4px solid (C.red = '#ef4444' for debit, C.green = '#22c55e' for credit)
               amber path: 4px solid '#d97706'
border-radius: 6px
padding:       12px 14px
margin-top:    8px        (gap below the grey summary row)
```

### Label line

```
font-size:     11px
color:         C.accent = '#7c6af7'
font-weight:   700
text-transform: uppercase
letter-spacing: 0.06em
margin-bottom: 8px
```

### Formula line (desktop) / condensed line (mobile)

```
font-size:     12px
color:         C.muted = '#64748b'
font-family:   monospace (consistent with numeric display)
line-height:   1.5
word-break:    break-word   (allows natural wrap on long formulas)
margin-bottom: 8px
```

### Large signed number + tag row

```
display:       flex, align-items: center, gap: 12px, flex-wrap: wrap

Large number:
  font-size:   22px        (>= 20px as specified)
  font-weight: 800
  color:       C.red ('#ef4444') for debit; C.green ('#22c55e') for credit
  font-variant-numeric: tabular-nums

Tag:
  font-size:   13px
  font-weight: 700
  color:       C.red for "Debit"; C.green for "Credit"
  background:  C.red + '22' for debit; C.green + '22' for credit
  border:      1px solid (C.red/C.green + '55')
  border-radius: 4px
  padding:     3px 8px
```

### Per-spread total

```
font-size:     12px
color:         C.muted
margin-top:    4px

  value:       C.red for negative, C.green for positive
  font-weight: 600
  font-variant-numeric: tabular-nums
```

### DR/CR row

```
font-size:     12px
color:         C.muted
margin-top:    4px

  prefix (DR/CR): color C.muted
  value:          C.text ('#e2e8f0'), font-weight 600, font-variant-numeric: tabular-nums
```

### Direction guide

```
margin-top:    10px
padding-top:   10px
border-top:    1px solid (C.border + '44' = '#2d314844')
font-size:     12px
color:         C.muted
line-height:   1.5
```

### Amber caution text

```
color:         '#d97706'   (amber — no exact C.* match; C.yellow = '#f59e0b' is close but
                            #d97706 is the PO-specified value and is distinct from C.yellow)
font-size:     12px
line-height:   1.5
```

---

## 9. DOM Insertion Point

The `TradeInstructions` function returns a single `<div>` container (line 298). Inside that container, the structure is:

1. Label row ("How to place this trade") — lines 299–301.
2. Numbered leg rows div — lines 302–331.
3. Grey summary row `<div>` — lines 333–363, wrapping the Net/Exit/Profit-zone/Breakeven content.
4. Closing `</div>` of the grey summary row at line 363.
5. Closing `</div>` of the outer `TradeInstructions` container at line 364.
6. (End of function return.)

The `NetOrderPriceBox` is inserted **after line 363** (after the grey summary row's closing `</div>`) and **before line 364** (before the outer container's closing `</div>`). It is still inside the outer `TradeInstructions` container and is still below the grey summary row.

In the implementation, the insertion reads:

```tsx
      </div>  {/* end grey summary row — existing line 363 */}

      {displayLegs.length >= 2 && (
        <NetOrderPriceBox
          displayLegs={displayLegs}
          estimatedCreditOrDebit={trade.estimated_credit_or_debit}
          isMobile={isMobile}
        />
      )}

    </div>  {/* end outer TradeInstructions container — existing line 364 */}
```

The `displayLegs.length >= 2` gate is in the JSX, not inside `NetOrderPriceBox`, so the sub-component never receives an empty or single-leg `displayLegs` array.

---

## 10. Unchanged Elements Confirmation

The following are explicitly confirmed as unchanged:

| Element | File | Status |
|---------|------|--------|
| Numbered leg rows (`displayLegs.map(...)`) | `StrategyDetail.tsx` lines 303–331 | Unchanged |
| Grey summary row (Net / Exit when / Profit zone / Breakeven) | `StrategyDetail.tsx` lines 333–363 | Unchanged |
| `LegsTable` component | `StrategyDetail.tsx` lines 198–271 | Unchanged |
| `TradeCard` component | `StrategyDetail.tsx` lines 437–525 | Unchanged |
| `isCredit` flag in `TradeInstructions` (line 274) | `StrategyDetail.tsx` | Unchanged — still drives the existing Net line wording |
| `TradePanel.tsx` | entire file | Not modified |
| `api/client.ts` | all interfaces and functions | Not modified |
| `backend/` | all services and routes | Not modified |
| All other frontend components | listed in spec Section 5 | Not modified |
| No new migration | `backend/migrations/` | No schema change required |

---

## 11. New Props Confirmation

No new prop is added to `TradeInstructions`, `TradeCard`, `StrategyCard`, `CategorySection`, or any other existing component. `NetOrderPriceBox` is a new local function component defined within `StrategyDetail.tsx`; it has no external callers. The `isMobile` boolean is derived inside `TradeInstructions` via a `useState` + `useEffect` resize listener and passed as a prop to `NetOrderPriceBox`.

---

## 12. Changed Files List

| File | Change type |
|------|-------------|
| `frontend/src/components/StrategyDetail.tsx` | Modified — single file |

---

## 13. No ADR Required

This design introduces no new external dependency, no architectural pattern not already present in the codebase, and no technology choice that would benefit from documented rationale. The responsive mechanism (viewport-width `useState`) and the sub-component extraction are implementation-level decisions, not ADR-worthy architectural decisions.

---

## 14. Design Summary

**One file changed.** `NetOrderPriceBox` is a new local functional component inside `StrategyDetail.tsx`. It is rendered by `TradeInstructions` immediately after the existing grey summary row, gated on `displayLegs.length >= 2`.

**signedNet** is `Σ (sell ? +1 : −1) × leg.mid × leg.qty` over `displayLegs`. It is a derived `const` computed after `displayLegs` is built, before the JSX return.

**Responsive layout** uses a `useState` + resize listener for `isMobile` (viewport < 480px). Desktop shows the full per-leg formula; mobile shows `net = −3.49 (debit)` condensed form. The large number, DR/CR row, and direction guide are visible at all widths.

**Zero/missing mid guard** (`leg.mid == null || leg.mid <= 0` on any leg): box renders with amber caution text; formula, large number, DR/CR, per-spread total, and direction guide are suppressed.

**Dev-only consistency check** (`import.meta.env.DEV`): `console.warn` when `|signedNet| − |trade.estimated_credit_or_debit| > 0.05`. No production output.

**OQ-6 confirmed:** `covered_put` (one put option leg + one `option_type: 'stock'` leg) and `covered_call` (one call option leg + one `option_type: 'stock'` leg) both yield `displayLegs.length === 1` after stock-leg filtering. The `>= 2` gate handles both without per-strategy hardcoding.

**No migration. No backend change. No new npm package. No API contract change. No tier gate.**

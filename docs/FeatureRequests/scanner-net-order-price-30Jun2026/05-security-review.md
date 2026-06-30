# Security Review — Scanner Net Order Price Guidance Box

**Feature folder:** `docs/FeatureRequests/scanner-net-order-price-30Jun2026/`
**Reviewer:** security-reviewer
**Date:** 30Jun2026
**Gate:** 5

---

## Scope

Frontend-only change. Single file modified: `frontend/src/components/StrategyDetail.tsx`.

Changes in scope:
- New local function component `NetOrderPriceBox` (lines 273–435).
- New `useState` + `useEffect` resize listener inside `TradeInstructions` (lines 462–468).
- Conditional render of `NetOrderPriceBox` from `TradeInstructions` (lines 538–544).

No backend file, no migration, no API interface, no npm package, no environment variable was added or changed.

---

## CLAUDE.md Invariant Checklist

| Invariant | Status |
|---|---|
| JWT verification via `auth.get_user(token)` only — no python-jose | Unaffected — no backend change |
| `SUPABASE_JWT_SECRET` absent | Confirmed absent — not referenced anywhere in the diff |
| `MARKETDATA_API_TOKEN` absent from frontend | Confirmed absent |
| `SUPABASE_SERVICE_KEY` absent from frontend | Confirmed absent |
| No `VITE_` prefixed secret introduced | Confirmed — no new env vars |
| No backend route added without `require_user()` / `require_admin()` | N/A — no backend change |
| No migration dropping or weakening RLS policies | N/A — no migration |
| CORS origins unchanged | Confirmed — `main.py` not touched |
| Alpaca integration absent | Unaffected |
| yfinance as sole market data source | Unaffected |

All CLAUDE.md invariants pass.

---

## Findings

### Finding 1 — XSS: no dangerouslySetInnerHTML, all values render as React text nodes

**Risk level:** Informational (confirmed safe)

**Location:** `NetOrderPriceBox`, lines 279–435.

Every value rendered in the new component is a React text node: `{formulaLine}`, `{signedResult}`, `{tagLabel}`, `{totalSign}`, `{totalAbs}`, `{drCrLabel}`, `{drCrValue}`. No `dangerouslySetInnerHTML` is used anywhere in the new code or in the surrounding existing code of `TradeInstructions`.

The formula string (`formulaLine`) is assembled at lines 336–349 from `leg.mid.toFixed(2)` (a number method), `leg.qty` (a number), a boolean comparison on `leg.action`, and static character literals (`+`, `-`, `$`, `×`, whitespace, parentheses). No user-controlled string of any kind enters this assembly. The result is a plain string that React renders as escaped text.

**Verdict:** No XSS vector. No action required.

---

### Finding 2 — No new data exposure

**Risk level:** Informational (confirmed safe)

**Location:** Props passed to `NetOrderPriceBox` (lines 539–543).

`displayLegs` (action, mid, qty per leg) and `estimatedCreditOrDebit` are already rendered in the existing leg rows (lines 476–504) and the grey summary row (lines 506–536) respectively. The box re-presents a mathematical derivation of data the user already sees on the same card. No new field from the API response is surfaced for the first time by this feature.

**Verdict:** No new data exposure. No action required.

---

### Finding 3 — No new network, auth, or database paths

**Risk level:** Informational (confirmed safe)

The component contains no `fetch`, no axios call, no Supabase client call, no form submission, and no user input element. It reads only props already computed from `trade.legs` and `trade.estimated_credit_or_debit`, which arrived from the existing `analyzeSymbol()` call that was already present before this feature.

**Verdict:** No new attack surface. No action required.

---

### Finding 4 — Resize listener cleanup

**Risk level:** Informational (confirmed safe)

**Location:** `TradeInstructions`, lines 462–467.

```ts
useEffect(() => {
  const handler = () => setViewportWidth(window.innerWidth)
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [])
```

The cleanup function `() => window.removeEventListener('resize', handler)` is present and removes the exact same function reference that was added. The empty dependency array `[]` means the effect runs once on mount and the cleanup runs on unmount — correct lifecycle. `setViewportWidth` is a React state setter and cannot throw. No crash path exists.

**Verdict:** No listener leak. No action required.

---

### Finding 5 — import.meta.env.DEV console.warn: dev-only, no secret content

**Risk level:** Informational (confirmed safe)

**Location:** `NetOrderPriceBox`, lines 287–296.

The warn is guarded by `if (!hasMissingMid && import.meta.env.DEV)`. Vite replaces `import.meta.env.DEV` with the literal `false` in production builds and tree-shakes the entire guarded block; it does not appear in the production bundle. In development, the warn outputs two computed floating-point numbers (`computed.toFixed(4)` and `estimated.toFixed(4)`) and `trade.strategy_key` (a static identifier string). No token, credential, user PII, or secret of any kind is logged.

**Verdict:** Confirmed dev-only. No production output. No action required.

---

### Finding 6 — Numeric safety: NaN/Infinity guard analysis

**Risk level:** Informational (confirmed safe, with reasoning)

**Location:** `NetOrderPriceBox`, lines 280–285.

The missing-mid guard is:
```ts
const hasMissingMid = displayLegs.some(leg => leg.mid == null || leg.mid <= 0)
```

In JavaScript, `NaN <= 0` evaluates to `false`, which means a `NaN` mid would not be caught by the `<= 0` arm and would not be caught by `== null` either. If such a value reached the non-caution render path, `NaN.toFixed(2)` would produce the string `"NaN"`, which React would render as the text "NaN" in the number slots — a display defect, not a security issue.

However, this does not occur in the actual data flow. The `leg.mid` field arrives over the network as JSON. JavaScript's `JSON.parse` serialises both `NaN` and `Infinity` as `null`, meaning any NaN or Infinity that the backend might theoretically produce for a mid price becomes `null` at the frontend before the component receives it. The `leg.mid == null` arm of the guard catches `null` and correctly triggers the amber caution path.

`signedNet` is computed unconditionally before the `hasMissingMid` early return (the early return is at lines 320–328, the computation is at lines 282–285). This means wasted arithmetic on the amber path, but since `signedNet` is never read on that path, there is no rendered effect.

**Verdict:** NaN/Infinity cannot reach the DOM via the JSON data path. Guard is sufficient for the actual data flow. No action required. A note to the developer that the guard could add `|| Number.isNaN(leg.mid)` for defence-in-depth against hypothetical non-JSON data sources is recorded as a recommendation, not a finding requiring remediation.

**Recommendation (non-blocking):** Consider changing the guard to:
```ts
const hasMissingMid = displayLegs.some(leg => leg.mid == null || leg.mid <= 0 || !Number.isFinite(leg.mid))
```
This is a belt-and-suspenders change; it does not affect current behaviour and is not required for release.

---

### Finding 7 — Formula string: no user-controlled input injected

**Risk level:** Informational (confirmed safe)

**Location:** `buildFormulaTerms` logic inline at lines 336–349.

The terms are built from `leg.qty` (a number, formatted via template literal), `leg.mid.toFixed(2)` (a number method), and `leg.action === 'sell'` (a boolean). The static characters `$`, `×`, `(`, `)`, `+`, `-`, and whitespace are developer-supplied string literals. The assembled string is assigned to `formulaLine` and rendered as a React text node — not injected into `innerHTML` or any DOM sink. No user-controlled content enters the formula.

**Verdict:** No injection vector. No action required.

---

## Summary Table

| # | Category | Finding | Risk | Action |
|---|---|---|---|---|
| 1 | XSS | No dangerouslySetInnerHTML; all output is React text nodes | Informational | None |
| 2 | Data exposure | Box re-presents existing card data only | Informational | None |
| 3 | Network / auth / DB | No new paths introduced | Informational | None |
| 4 | Listener lifecycle | Resize handler correctly removed on unmount | Informational | None |
| 5 | Secret / dev logging | console.warn is DEV-only, logs no secrets | Informational | None |
| 6 | Numeric safety | NaN/Infinity cannot reach DOM via JSON path; guard sufficient | Informational | Optional hardening (non-blocking) |
| 7 | Injection | Formula string assembled from numbers and static literals only | Informational | None |

No Critical, High, Medium, or Low findings.

---

## Gate Decision

**PASS**

All seven checklist items confirmed clean. No Critical or High findings. No new attack surface. CLAUDE.md invariants unaffected. Feature is cleared for Gate 6.

**Condition:** None. Unconditional pass.

**Optional non-blocking recommendation recorded:** Adding `|| !Number.isFinite(leg.mid)` to the `hasMissingMid` guard (Finding 6) is belt-and-suspenders hardening against hypothetical future data sources that bypass JSON serialisation; it does not affect current behaviour and may be addressed in a follow-up at developer discretion.

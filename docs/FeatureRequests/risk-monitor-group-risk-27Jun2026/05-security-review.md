# Security Review — Risk Monitor Group Risk Badge (Group-Based, Not Worst-Leg-Based)

**Feature folder:** `docs/FeatureRequests/risk-monitor-group-risk-27Jun2026/`
**Reviewed by:** security-reviewer
**Date:** 27Jun2026
**Files reviewed:**
- `docs/FeatureRequests/risk-monitor-group-risk-27Jun2026/02-design.md`
- `frontend/src/components/RiskMonitor.tsx`
- `CLAUDE.md`

---

## Scope

Presentation-only frontend change confined to a single file: `frontend/src/components/RiskMonitor.tsx`. The change adds `groupLevel` and `groupPnlPct` fields to `StrategyGroup`, computes them in `buildGroups` from existing `PositionRisk` fields already in scope, and substitutes them at all badge/bar read-sites in `RiskListRow` and `RightPanelHeader`. No backend routes, no database schema, no API contracts, no network calls, no new dependencies, and no removed components are involved.

---

## CLAUDE.md Invariant Checklist

| Invariant | Status |
|---|---|
| `auth.get_user(token)` is the JWT verification path | Not touched — backend unchanged |
| `python-jose` is absent | Not touched — backend unchanged |
| `SUPABASE_JWT_SECRET` is absent | Not touched — backend unchanged |
| `MARKETDATA_API_TOKEN` not in any frontend file | Confirmed absent |
| `SUPABASE_SERVICE_KEY` not in any frontend file | Confirmed absent |
| No secret in any `VITE_` env var introduced | No new env vars |
| RLS policies not dropped or weakened | No migration — not applicable |
| CORS origins not changed | No backend change — not applicable |

---

## Finding Categories

### 1. Authentication and Authorisation

No new routes, no new endpoints, no new auth touchpoints. `buildGroups` is a pure client-side transformation of data already fetched through existing authenticated API calls. The `getPositionsRisk()` call that supplies the `PositionRisk[]` array is unchanged and was not reviewed as part of this feature's scope (it is pre-existing and out of scope for this change).

**Finding:** None.

### 2. XSS

The entire file was inspected for `dangerouslySetInnerHTML`. It is absent — zero occurrences anywhere in `RiskMonitor.tsx`.

All display paths for the two new fields:

- `group.groupLevel` feeds into `riskColor()` (returns one of three hardcoded hex strings), `riskBg()` (returns one of three hardcoded hex strings), and `riskLabel()` (returns one of three hardcoded emoji+text string literals). All three functions consume a `string` and return a constant — they cannot echo user-controlled input. The return values are used as React inline style values or as React text node children (`{riskLabel(group.groupLevel)}`). Neither path allows HTML injection.

- `group.groupPnlPct` feeds into `MiniProgressBar` as the `worstLegPnlPct` prop (line 801), where it is passed to `Math.abs()` and clamped by `Math.min(..., 100)`, then used as a CSS `width` percentage string. A number value in a style attribute is not an injection surface.

- `group.label` (line 772 in `RiskListRow`, line 875 in `RightPanelHeader`) is `pos.strategy_name || pos.symbol`, a server-returned string rendered as `{name}` — a React text node. React escapes this automatically.

- `aiSummary` (line 1210) is rendered as `{aiSummary}` — a React text node, not `innerHTML`. Safe.

- The `error` state string (line 1172) is rendered as `{error}` — a React text node. Safe.

**Finding:** None.

### 3. Secret and Key Exposure

No new environment variable references anywhere in the changed file. `MARKETDATA_API_TOKEN`, `SUPABASE_SERVICE_KEY`, and `VITE_`-prefixed secrets are absent from `RiskMonitor.tsx` both before and after this change.

**Finding:** None.

### 4. Injection

No shell commands. No raw SQL. No external API calls introduced by this change. The only external calls in the file (`getPositionsRisk`, `getQuote`, `getAISettings`, `aiRiskSummary`) are pre-existing typed API client calls unchanged by this feature.

**Finding:** None.

### 5. JWT and Auth Invariants

No backend file is touched. `auth.get_user(token)` remains the sole verification path. `python-jose` is absent. `SUPABASE_JWT_SECRET` is absent. All CLAUDE.md hard invariants are unaffected.

**Finding:** None.

### 6. Data Validation and Arithmetic Safety

**Zero-cost-basis guard (line 625):**

```typescript
const groupPnlPct = combinedCostBasis > 0 ? (combinedPnl / combinedCostBasis) * 100 : 0
```

The guard is correct. When `combinedCostBasis === 0`, `groupPnlPct` is assigned the JavaScript number `0` — not `NaN`, not `Infinity`. This value reaches `MiniProgressBar` where `Math.abs(0)` = 0, `Math.min(0, 100)` = 0, and the bar renders at 0% width. No crash, no blank, no NaN propagation to the DOM.

**`Math.min(...positions.map(p => p.dte))` (line 642):**

Called only inside the `else` (net-losing) branch of the `groupLevel` computation. If `g.positions` were empty, `Math.min()` with no arguments returns `Infinity`, meaning `minDte <= 7` would never fire, safely falling to `'yellow'`. In practice `g.positions` is never empty because the group map is only seeded when a position is pushed to it (line 604–605), so this is academic. Either way the outcome is safe.

**`Math.min(...group.positions.map(p => p.dte))` in `RiskListRow` (line 731):**

Pre-existing call, unchanged by this feature. Same analysis applies.

**Numeric formatting:** All numeric values rendered in the DOM pass through `fmt()` (which calls `toLocaleString`) or are used as CSS dimension values. No raw concatenation of user-supplied numeric strings into HTML.

**Finding:** None — arithmetic safety confirmed.

### 7. New Data Exposure

`groupLevel` and `groupPnlPct` are derived entirely from `pnl`, `avg_cost`, `quantity`, `dte`, and `risk_level` — all fields already present on `PositionRisk` and already displayed in individual `LegCard` components before this change. No new fields are fetched from the API. No new fields are surfaced to the UI that were not already visible in per-leg form.

**Finding:** None.

---

## Findings Summary

| ID | Risk | Finding | Resolution |
|---|---|---|---|
| — | — | No findings | — |

No Critical, High, Medium, Low, or Informational findings.

---

## Gate Decision

**PASS**

The change is a pure presentation-layer transformation over data already in scope. No injection surface, no XSS vector, no secret exposure, no auth touchpoint, no new network call, no backend change. The zero-cost-basis defensive guard is present and correct. The CLAUDE.md hard invariants are unaffected. No conditions are placed on release.

---

_Reviewed by:_ security-reviewer &nbsp;&nbsp; _Date:_ 27Jun2026

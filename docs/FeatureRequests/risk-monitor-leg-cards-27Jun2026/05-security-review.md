# Security Review — Risk Monitor Right-Panel Compact Leg Cards

**Feature folder:** `docs/FeatureRequests/risk-monitor-leg-cards-27Jun2026/`
**Gate:** 5 — Security Review
**Reviewer:** security-reviewer
**Date:** 27Jun2026
**Status:** CONDITIONAL PASS

---

## 1. Scope

Single-file, presentation-only change:

- `frontend/src/components/RiskMonitor.tsx` — new `LegCard` component, new `riskShort()` helper, `RightPanelDetail` legs section replaced from `PositionCard` column to `LegCard` CSS grid.

No backend changes, no new API endpoints, no new packages, no migrations, no new environment variables.

---

## 2. CLAUDE.md Invariant Checklist

| Invariant | Status | Evidence |
|---|---|---|
| JWT verification via `auth.get_user(token)` — no python-jose | Not applicable (frontend-only change) | No backend files changed |
| `SUPABASE_JWT_SECRET` absent | Confirmed | Grep of `frontend/src/` — no matches |
| `MARKETDATA_API_TOKEN` absent from frontend | Confirmed | Grep of `frontend/src/` — no matches |
| `SUPABASE_SERVICE_KEY` absent from frontend | Confirmed | Grep of `frontend/src/` — no matches |
| No `VITE_`-prefixed secret that is backend-only | Confirmed | No new env vars introduced |
| No module-level `get_supabase()` | Not applicable (frontend-only) | No backend files changed |
| No Alpaca re-introduction | Not applicable | No backend files changed |
| RLS policies not dropped | Not applicable | No migrations |

---

## 3. Authentication and Authorisation

No new routes, no new API calls, no new auth touchpoints. The `getPositionsRisk()` API call and its bearer-token flow are unchanged. `LegCard` receives a `PositionRisk` object that has already been fetched and authorised by the existing flow.

No auth findings.

---

## 4. XSS and Injection

### 4.1 `dangerouslySetInnerHTML`

Grep of the entire `frontend/src/` tree found zero occurrences of `dangerouslySetInnerHTML`. The changed file contains none.

### 4.2 `LegCard` field rendering

All `PositionRisk` fields rendered by `LegCard` are output as React JSX text nodes or expression interpolations inside JSX, which React escapes by default:

- `pos.symbol` — JSX text node (`{pos.symbol}`)
- `pos.option_type` — passed to `TypeBadge` which renders it as `.toUpperCase()` in a JSX text node
- `pos.entry_action` / derived `entryAction` — passed to `ActionBadge`, rendered as `.toUpperCase()` text
- Numeric fields (`pos.strike`, `pos.dte`, `pos.avg_cost`, `pos.current_price`, `pos.pnl`, `pos.pnl_pct`, `pos.iv_rank`, `pos.quantity`) — all formatted through `fmt()` or `Math.abs()` before JSX text output
- `pos.risk_level` — consumed only by `riskColor()`, `riskBg()`, `riskShort()` — three pure string-switch helpers that return hardcoded string literals regardless of input; user-controlled values cannot influence CSS property strings beyond the switch cases

No `eval()`, no `innerHTML`, no `document.write`, no template-literal HTML construction. All rendering paths are standard React JSX.

No XSS findings.

### 4.3 Derived computation `tileValue = pos.avg_cost * qty * 100`

This is a client-side display computation using server-supplied floats. It does not reach any database query, shell command, or external API call. No injection surface.

---

## 5. Secret and Key Exposure

Grep of `frontend/src/` for `MARKETDATA_API_TOKEN`, `SUPABASE_SERVICE_KEY`, `python-jose`, `SUPABASE_JWT_SECRET` — zero matches. No new environment variables introduced. No secret exposure.

---

## 6. New Network Calls

Zero new network calls. The existing `getPositionsRisk()` call and the existing `getQuote()` fan-out are unchanged. No new external API calls are introduced.

---

## 7. Removed Code — Security Control Audit

The components listed as removed in the scope (`ProgressBar`, `SignalRow`, `signalIcon`, `RiskSignal` import) did not hold any auth guard, token handling, data-access control, or other security control. They were purely presentational. Their removal does not weaken any security boundary.

`PositionCard` is a separate matter, addressed in Finding F-1 below.

---

## 8. Findings

### F-1 — Deviation from Spec: `PositionCard` Deleted (Informational)

**Risk level:** Informational

**Finding:** The architecture design (`02-design.md`, Section 5) and the binding spec requirement FR-11 both state: "The `PositionCard` component must be retained in the file (not deleted)." A grep of the current `RiskMonitor.tsx` finds zero occurrences of `PositionCard`. The component has been deleted.

**Security impact:** None. `PositionCard` held no authentication guard, no secret handling, and no security control of any kind. Its deletion does not open any vulnerability, does not expose any data, and does not weaken any auth path.

**Compliance impact:** This is a deviation from a documented spec requirement (FR-11). The requirement was architectural housekeeping ("preserve for future render paths"), not a security constraint. It is flagged here for completeness because the security reviewer's role includes confirming that deleted code did not hold security controls — it did not.

**Disposition:** The spec and architecture gate decisions govern whether this constitutes a blocking defect. From a security standpoint, the deletion is safe. The developer or architect should confirm whether FR-11 needs to be reinstated or formally waived.

---

## 9. Summary Table

| ID | Category | Risk Level | Description |
|----|----------|------------|-------------|
| F-1 | Spec deviation | Informational | `PositionCard` deleted contrary to FR-11; no security impact |

No Critical findings.
No High findings.
No Medium findings.
No Low findings.
One Informational finding (spec compliance, not a security risk).

---

## 10. Gate Decision

**CONDITIONAL PASS**

The feature is secure. There are no Critical, High, Medium, or Low security findings. The single Informational finding (F-1) is a spec compliance matter with zero security impact — it does not block release from a security perspective.

**Condition:** The development team or architect must either (a) confirm that FR-11 is intentionally waived and record that decision in `03-approvals.md`, or (b) restore `PositionCard` to the file. This condition is a governance check, not a security requirement. Security review does not block the release pending this resolution.

---

## 11. Files Reviewed

- `/home/user/OptionsDeskPro/CLAUDE.md`
- `/home/user/OptionsDeskPro/docs/FeatureRequests/risk-monitor-leg-cards-27Jun2026/02-design.md`
- `/home/user/OptionsDeskPro/frontend/src/components/RiskMonitor.tsx`
- Grep sweep of `/home/user/OptionsDeskPro/frontend/src/` for secrets, `dangerouslySetInnerHTML`, `eval`, `innerHTML`

# Security Review — Risk Monitor Sort Header ("Trades · N" bar + sort dropdown)

**Date:** 28Jun2026
**Reviewer:** Security Reviewer
**Overall Decision:** PASS

---

## 1. Scope

This is a presentation-only, frontend-only change confined to a single file. No backend route, service, migration, API contract, environment variable, or network call is added or modified.

**Files reviewed:**

- `docs/FeatureRequests/risk-monitor-sort-header-27Jun2026/02-design.md`
- `frontend/src/components/RiskMonitor.tsx` (full file; focus on lines 36–45 `fmtChipDate`, 594–625 `sortGroups`/`SortMode`/`riskRank`, 770–860 `RiskListRow` with `showDateChip`, 1007–1050 `SortBar`, 1069 `sortMode` useState, 1134–1136 derived `sortedGroups`, 1140–1278 `renderDesktopSplit`/`renderMobileAccordion`)
- `CLAUDE.md` invariants

---

## 2. Findings

### Critical (block release)

None.

### High (block release)

None.

### Medium (fix before next release)

None.

### Low / Informational

| ID | Description | Notes |
|----|-------------|-------|
| L01 | `e.target.value as SortMode` is an unchecked cast | In `SortBar` at line 1032, `e.target.value` is cast directly to `SortMode` with `as SortMode` without runtime validation. Because the `<select>` element has only three `<option>` children whose values are exactly `'newest'`, `'risk'`, and `'pnl'` — all defined as static JSX — the only way an unexpected value could arrive is via browser devtools manipulation or an automated input attack. An unexpected value (e.g. a DevTools-injected string) would fall through `sortGroups`'s `if (mode === 'newest')` and `if (mode === 'risk')` branches and execute the `pnl` sort path, producing a sorted list. There is no injection sink, no network call, and no state write that could reach any backend or database. The risk is cosmetically incorrect sort behaviour only. A runtime guard (`if (!['newest','risk','pnl'].includes(e.target.value)) return`) would harden this against tampering, but the absence of one carries no meaningful security consequence given the purely client-side, display-only nature of the operation. Informational only. |
| L02 | `fmtChipDate` duplicates the `MONTHS` constant already defined at module scope for `fmtFullDate` | Lines 31–34 define `MONTHS` inside `fmtFullDate`; lines 38–44 re-define an identical `MONTHS` inside `fmtChipDate`. Neither copy is exported or reachable from outside the file. This is a maintainability concern (two arrays to update if month abbreviations ever change) rather than a security concern. No security impact. |

---

## 3. Invariant Checklist

| Check | Result | Notes |
|-------|--------|-------|
| All new routes use `require_user()` or `require_admin()` | Pass | No new routes. Frontend-only change. Not applicable. |
| No python-jose in codebase | Pass | Confirmed absent from the changed file. No backend files touched. |
| No `SUPABASE_JWT_SECRET` in codebase | Pass | Confirmed absent from the changed file. No backend files touched. |
| JWT verified via `auth.get_user(token)` | Pass | No change to auth path. `auth_utils.py` untouched. |
| `MARKETDATA_API_TOKEN` absent from frontend | Pass | Confirmed absent from `RiskMonitor.tsx`. No new env references introduced. |
| `SUPABASE_SERVICE_KEY` absent from frontend | Pass | Confirmed absent from `RiskMonitor.tsx`. No new env references introduced. |
| No `VITE_` prefixed secret variables for backend secrets | Pass | No new environment variables introduced by this feature. |
| No raw SQL string concatenation with user input | Pass | No SQL anywhere in the changed file. No database interaction. |
| No shell commands constructed from user input | Pass | No shell interaction anywhere in the changed file. |
| IDOR: user data scoped to authenticated user ID | Pass | No new data access paths. Sort operates on data already fetched and displayed. `GET /api/positions/risk` backend route is unchanged and was previously reviewed. |
| RLS policies not weakened by migration | Pass | No migration. Not applicable. |
| Numeric inputs validated before calculations | Pass | Numeric fields used in sort comparators (`combinedPnl`, `riskRank` lookup) originate from `StrategyGroup` objects already on the client. `combinedPnl` is a `number` typed field summed from `PositionRisk.pnl` values. No user-supplied numeric input reaches any calculation. `fmtChipDate` defensively guards against `NaN` day values (`isNaN(day)`) and undefined month index (`!mon`), returning `''` in both cases. |

### Additional XSS Check

No `dangerouslySetInnerHTML` is present anywhere in `RiskMonitor.tsx`. The `fmtChipDate` return value and the "Entered DD Mon" chip are rendered as React text content (inside a `<div>` with string children), which React escapes automatically. The `count` prop on `SortBar` renders `{count}` as a React text node. The `sortMode` value from the `<select>` is consumed only inside `sortGroups` as a switch discriminant — it is never written into the DOM as HTML.

The `group.label` field rendered in `RiskListRow` at line 818 (`{group.label}`) is a pre-existing render path, unchanged by this feature and already a React text node (no raw HTML injection vector).

---

## 4. Gate Decision

**Critical findings:** 0
**High findings:** 0

**PASS** — No critical or high findings. The feature is presentation-only, confined to a single frontend file, introduces no new network calls, no new auth paths, no new data access, and no user-supplied input reaches any sink beyond a controlled `<select>` whose value drives only a client-side array sort. All CLAUDE.md invariants are satisfied. Feature may proceed to Gate 6 (Release & Documentation).

---

## 5. Remediation Tracking

No findings require remediation before release.

| Finding ID | Fixed in commit | Verified by | Date |
|------------|-----------------|-------------|------|
| L01 | — (informational; no fix required) | — | — |
| L02 | — (informational; no fix required) | — | — |

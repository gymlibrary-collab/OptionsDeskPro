# Gate 5 — Security Review
## Feature: PRD-01 Strategy Comparison Matrix
**Review date:** 15 Jun 2026
**Reviewer:** Security Reviewer (Gate 5)
**Branch:** `claude/modest-davinci-sxz7lv`
**Gate decision: PASS** *(originally CONDITIONAL PASS; all conditions resolved — 15 Jun 2026)*

---

## Executive Summary

PRD-01 removes the AI-recommendation banner and fit-scoring computation from the strategy scanner and replaces them with a neutral Strategy Comparison Matrix. The change surface is narrow: one backend service file (`strategy_engine.py`), one route file (`strategies.py`), two frontend components (`StrategyDetail.tsx`, `StrategyScanner.tsx`), and the API client type definitions (`client.ts`). No new database tables, migrations, or secrets were introduced.

All hardcoded JWT invariants remain intact. Token verification continues to call `sb.auth.get_user(token)` exclusively — `python-jose` and `SUPABASE_JWT_SECRET` are absent from the codebase. The scan endpoint received an improvement in this PR: `legal_gate_dep` was added, which it previously lacked. All `condition_explanation` strings are static catalog literals embedded at development time; they contain no user-derived data, no PII, and no investment-directive language.

Two findings require attention before production release. The first is a pre-existing issue that this PR made more prominent by removing the gating logic that surrounded it: the `/api/strategies/analyze/{symbol}` endpoint accepts an optional bearer token but does not require one, meaning any unauthenticated caller can invoke the full analysis pipeline — consuming market-data API credits and triggering potentially expensive options-chain fetches — without authentication or quota enforcement. This is a Medium-severity finding. The second finding is a Low-severity backend-to-frontend contract gap: the `ScanResult` TypeScript interface and `StrategyScanner.tsx` declare and render a `condition_matches` field that the backend scan endpoint does not emit; the component silently renders a dash for all rows.

Neither finding is Critical or High. The PR meets the gate standard for a Conditional Pass pending the two conditions described in the Gate Decision section.

---

## Findings Table

| ID | Severity | Area | Title |
|----|----------|------|-------|
| F-01 | Medium | Authentication | `analyze` route accepts unauthenticated requests with no quota guard |
| F-02 | Low | API Contract | `condition_matches` declared in frontend but absent from backend scan response |
| F-03 | Informational | Dead code | `fit_score` reference survives in `ai_service.py` internal function and `TradePanel.tsx` stub |
| F-04 | Informational | Regulatory language | `condition_explanation` strings use educationally accurate language; no directive language detected |

---

## Detailed Findings

### F-01 — Medium — `analyze` route accepts unauthenticated requests with no quota guard

**File:** `backend/routes/strategies.py`, lines 64–68

**Description:**
The `/api/strategies/analyze/{symbol}` route is declared with `Security(bearer_security)` where `bearer_security = HTTPBearer(auto_error=False)`. This configuration makes the credential optional: if no `Authorization` header is provided, `credentials` is `None` and the route proceeds normally, returning the full comparison matrix and all strategy data. No HTTP 401 is raised. No scan-quota table is checked. A caller can invoke this endpoint in a tight loop for any symbol without possessing a Supabase session token.

**Verification:** Confirmed via `git show main:backend/routes/strategies.py` — this pattern pre-exists on `main` and was not introduced by PRD-01. However, PRD-01 added `legal_gate_dep` (which wraps `verify_token`) to the scan endpoint but not to the analyze endpoint, making the asymmetry between the two routes more pronounced. The scan endpoint now enforces both authentication and quota; analyze enforces neither.

**Risk detail:** The analyze route triggers `get_iv_rank()`, `get_directional_bias()`, `get_options_chain()` (which calls the paid MarketData API), and `build_comparison_matrix()` for up to ~31 strategies. Each unauthenticated call consumes MarketData API credits against the shared backend token. The free-tier daily quota is 100 credits (documented in CLAUDE.md). A trivial loop of unauthenticated requests against diverse symbols could exhaust this quota, degrading service for authenticated users.

**Recommended fix:** Add `Depends(legal_gate_dep)` to the analyze route decorator (mirroring the scan route), or at minimum add `Depends(verify_token)` so that an authenticated session is required. If the route is intentionally semi-public, rate-limit unauthenticated callers at the CORS/proxy layer and document that decision.

**Note:** Because this is a pre-existing condition that was not regressed by PRD-01, it is rated Medium rather than High. The PR actually improved the overall auth posture by adding `legal_gate_dep` to scan.

---

### F-02 — Low — `condition_matches` declared in frontend but absent from backend scan response

**Files:**
- `frontend/src/api/client.ts`, line 283: `condition_matches: number`
- `frontend/src/components/StrategyScanner.tsx`, lines 424–429: renders `r.condition_matches`
- `backend/routes/strategies.py`, lines 300–313: `_scan_one()` return dict

**Description:**
The `ScanResult` TypeScript interface includes `condition_matches: number`. The scanner component renders this field with the logic: "N matches / —". The backend `_scan_one()` function emits `strategy_count` (the count of all strategies compatible with the current IV environment) but does not emit `condition_matches` (the count of strategies where both IV and direction conditions are matched for the current symbol). At runtime `r.condition_matches` is `undefined`, and the `!= null` guard causes the component to silently render a dash (`—`) for every row.

This is a data fidelity issue rather than a security issue: no sensitive data is leaked, no injection is possible, and the UI fails safe (renders a dash rather than crashing). It is rated Low because it represents an incomplete implementation that was missed during test coverage — the E2E spec `strategy-comparison-matrix.spec.ts` line 421 asserts `expect(firstResult).toHaveProperty('condition_matches')` which would fail against the actual backend.

**Recommended fix:** Either emit `condition_matches` from the backend `_scan_one()` function (requires computing the count of strategies where both `_iv_matches()` and `_direction_matches()` return true for the symbol's IV environment and bias), or remove the field from the `ScanResult` interface and the scanner table if it is out of scope for this release.

---

### F-03 — Informational — Residual `fit_score` references in `ai_service.py` and `TradePanel.tsx`

**Files:**
- `backend/services/ai_service.py`, lines 94, 104, 288, 296, 304, 309
- `frontend/src/components/TradePanel.tsx`, line 101

**Description:**
`ai_service.py` contains an internal function `compare_and_recommend()` that references `fit_score` in its logic (e.g., sorting by fit score). This function is no longer called by any route in `strategies.py` following this PR, confirmed by grep. The function itself is effectively dead code. Its continued presence does not create a security risk because it is not reachable from any HTTP endpoint, but it represents technical debt.

`TradePanel.tsx` line 101 contains `fit_score: 0` inside what appears to be a local stub object. This is not rendered to users and is not security-relevant.

**Recommended action:** Remove `compare_and_recommend()` from `ai_service.py` in a follow-up cleanup ticket to reduce maintenance surface and avoid confusion if the file is audited in a future review. Remove the stale `fit_score` from `TradePanel.tsx`.

---

### F-04 — Informational — Regulatory language review of `condition_explanation` strings

**File:** `backend/services/strategy_engine.py`, lines 28–607 (all `condition_explanation` values)

**Description:**
The spec mandates that `condition_explanation` strings use factual educational language without directive or ranking terms. All 31 strings were reviewed. They consistently describe the mechanical reason a strategy is designed for its IV and direction environment. Representative examples:

- "Covered calls collect elevated premium when implied volatility is high and expire worthless when the underlying stays flat or rises modestly."
- "Long calls are designed for low IV environments where option premiums are cheap; high IV inflates the debit paid and requires a larger move to profit."

No string contains directive language such as "you should", "best strategy", "recommended", "buy now", or ranking superlatives. No string contains user-derived data, server-side secrets, PII, or dynamically interpolated content. All strings are Python string literals evaluated at import time.

The frontend renders `row.condition_explanation` as a plain JSX text node inside a `<td>` element at `StrategyDetail.tsx` line 734. No `dangerouslySetInnerHTML` is used anywhere in the changed components. React's default JSX rendering escapes all string content, so even if a string were somehow modified to contain angle brackets, they would be displayed as literal characters rather than executed as markup.

**No action required.**

---

## Invariant Checklist

| # | Invariant | Status | Notes |
|---|-----------|--------|-------|
| 1 | Symbol path parameter sanitised before use | PASS | `symbol.upper()` applied at line 74 of `strategies.py` before any downstream use; passed as a path segment to HTTPS API and to `yf.Ticker()` — no shell or SQL construction |
| 2 | `analyze` route requires valid JWT | PASS | `Depends(legal_gate_dep)` added to route decorator (15 Jun 2026 fix); F-01 resolved |
| 3 | `analyze` route has `legal_gate_dep` applied | PASS | `Depends(legal_gate_dep)` added to route decorator (15 Jun 2026 fix); F-01 resolved |
| 4 | `scan` route requires valid JWT | PASS | `Depends(verify_token)` present in `scan_watchlist` signature; `legal_gate_dep` (which wraps `verify_token`) added by this PR |
| 5 | `scan` route has `legal_gate_dep` applied | PASS | Added in this PR at line 232 |
| 6 | Scan quota enforcement unchanged | PASS | Lines 264–288 of `strategies.py` — `scan_usage` table check and upsert are intact and unmodified |
| 7 | No `fit_score` / `ai_recommendation` / `top_strategy` in route responses | PASS | Removed from both `analyze` and `scan` return dicts; verified by diff |
| 8 | `condition_explanation` strings are static catalog strings (not per-user data, no PII) | PASS | All 31 values are Python string literals in `STRATEGIES` dict; no runtime interpolation of user data |
| 9 | `condition_explanation` rendered via JSX text (not `dangerouslySetInnerHTML`) | PASS | Line 734 of `StrategyDetail.tsx` renders inside a `<td>` JSX element; no `dangerouslySetInnerHTML` present anywhere in changed files |
| 10 | No new DB tables or schema changes introduced | PASS | No new migration files; no `CREATE TABLE` or `ALTER TABLE` in any changed file |
| 11 | No new secrets or API keys introduced | PASS | No new environment variable references in any changed file; `MARKETDATA_API_TOKEN` and `SUPABASE_SERVICE_KEY` absent from frontend |
| 12 | No shell command injection via symbol parameter | PASS | No `subprocess`, `os.system`, `shlex`, or `exec()` calls in any route or service file; symbol is used only as an HTTPS URL path segment and a yfinance `Ticker()` argument |
| 13 | `auth.get_user(token)` is the JWT verification path | PASS | `auth_utils.py` line 69; no change to verification logic in this PR |
| 14 | `python-jose` absent | PASS | Not present in `requirements.txt` or any import |
| 15 | `SUPABASE_JWT_SECRET` absent | PASS | Not referenced anywhere in backend codebase |

---

## Recommendations Summary

| Priority | Finding | Action |
|----------|---------|--------|
| Should-fix before release | F-01: `analyze` route accepts unauthenticated requests | Add `Depends(legal_gate_dep)` to the `analyze` route decorator, or document an explicit architectural decision that this route is intentionally public with a mitigation plan for API-credit abuse |
| Should-fix before release | F-02: `condition_matches` missing from backend scan response | Either emit the field from `_scan_one()` or remove it from the TypeScript interface and scanner component |
| Follow-up cleanup | F-03: Dead `fit_score` references in `ai_service.py` and `TradePanel.tsx` | Remove in a follow-up ticket post-release |

---

## Gate Decision

~~**CONDITIONAL PASS**~~ → **PASS** (15 Jun 2026 — all conditions resolved)

**Condition 1 (F-01) — Resolved:**
`Depends(legal_gate_dep)` added to the `/api/strategies/analyze/{symbol}` route decorator in `backend/routes/strategies.py`. Unauthenticated requests now receive HTTP 401 before the analysis pipeline runs.

**Condition 2 (F-02) — Resolved:**
`get_condition_match_count(iv_env, bias)` added to `backend/services/strategy_engine.py`. It counts strategies where both `_iv_matches()` and `_direction_matches()` return True against the current IV environment and directional bias. `_scan_one()` now emits `condition_matches` using this helper; the error-fallback branch emits `0`.

The informational finding (F-03) does not block release and may be addressed in a subsequent cleanup PR.

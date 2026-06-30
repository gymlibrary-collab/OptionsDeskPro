# Security Review — Scanner Category List: Remove Per-Category Cap

**Date:** 30Jun2026
**Reviewer:** security-reviewer
**Overall Decision:** PASS

---

## 1. Scope

**Feature:** Remove the `[:3]` slice from `recommend_by_category` in `strategy_engine.py` so all qualifying strategies per category are returned, sorted by complexity ascending.

**Files reviewed:**

- `docs/FeatureRequests/scanner-category-show-all-30Jun2026/02-design.md` — full design with count matrix and build_trade proof
- `backend/services/strategy_engine.py` lines 779–825 — `recommend_by_category` (changed function)
- `backend/routes/strategies.py` lines 1–283 — `analyze_symbol` (the sole consumer of `recommend_by_category`)
- `backend/services/auth_utils.py` — full file, JWT verification and admin check implementation
- `CLAUDE.md` invariants section

**Files NOT changed (confirmed):**

- No frontend files
- No migration files
- No other backend service or route files
- No environment variable files

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
| I01 | `analyze_symbol` uses optional auth (`auto_error=False`) for the bearer token | This is pre-existing design: the route is accessible without authentication (returns strategy data to unauthenticated callers) with feature gating applied only to premium sub-features (news sentiment, earnings awareness) resolved inside `_resolve_user()`. This is unchanged by this feature and not introduced by it. No action required. |
| I02 | Slight increase in JSON response payload size | After the fix, previously-truncated categories return up to 6 items instead of 3. The maximum per-category count is 6 (OMNIDIRECTIONAL/HIGH). This is a bounded, fixed-size growth determined by the static `STRATEGIES` catalog (31 entries total), not by any user-controlled input. Not exploitable for DoS. |

---

## 3. Invariant Checklist

| Check | Result | Notes |
|-------|--------|-------|
| All new routes use `require_user()` or `require_admin()` | N/A | No new routes introduced by this change |
| Existing route auth is unaffected | Pass | `analyze_symbol` uses `legal_gate_dep` (line 69) and optional bearer auth (unchanged). The cap removal touches only the pure function `recommend_by_category`; no auth code is modified. |
| No python-jose in codebase (changed file) | Pass | `strategy_engine.py` has no import of or reference to python-jose. `auth_utils.py` verifies via `sb.auth.get_user(token)` — confirmed at line 243. |
| No `SUPABASE_JWT_SECRET` in changed file | Pass | Absent from `strategy_engine.py`. Not present in `auth_utils.py` either. |
| JWT verified via `auth.get_user(token)` | Pass | `auth_utils.py` line 243: `result = sb.auth.get_user(token)`. Unchanged. |
| `MARKETDATA_API_TOKEN` absent from changed file | Pass | Absent from `strategy_engine.py` and absent from all frontend files (no frontend change). CLAUDE.md invariant confirmed upheld. |
| `SUPABASE_SERVICE_KEY` absent from frontend | Pass | No frontend file modified. |
| No `VITE_` prefixed secret variables introduced | Pass | No new environment variables of any kind introduced. |
| No raw SQL string concatenation with user input | Pass | `recommend_by_category(iv_env)` accepts a server-derived string from `iv_data.get("iv_environment", "MEDIUM")` (strategies.py line 105, called at line 108). It indexes the static in-memory `STRATEGIES` dict with no database interaction of any kind. No SQL is executed. |
| No shell commands constructed from user input | Pass | `strategy_engine.py` executes no shell commands. |
| IDOR: user data scoped to authenticated user ID | Pass | `recommend_by_category` is a pure function over the static strategy catalog. It has no user-identity parameter, no database lookup, and returns the same static strategy metadata to every caller. No per-user data is exposed. |
| RLS policies not weakened by migration | N/A | No migration file is added or modified. |
| Numeric inputs validated before calculations | Pass | `recommend_by_category` performs no numerical calculations. The only operation is a dict membership check (`iv_env in strat["iv_environment"]`) and a list sort by integer complexity. |
| No module-level `get_supabase()` call introduced | Pass | The change is a single list comprehension slice removal. No new imports or module-level calls of any kind are introduced in `strategy_engine.py`. |
| `recommend_strategies` (scan endpoint) unaffected | Pass | `recommend_strategies` is a separate function at line 724 with its own `scored[:top_n]` slice at line 775. The changed line (822) is inside `recommend_by_category` only. Watchlist scan limits and `scan_usage` tier checks are unaffected. |
| Net `build_trade` call count unchanged | Pass | Verified via design doc section 4 and confirmed by reading `analyze_symbol` lines 201–269. Previously-truncated strategy keys were already being built inside `build_comparison_matrix`'s fallback branch; post-fix they enter `unique_keys` and are built in the fan-out. The `trades_by_key` cache prevents double-building. Net delta: zero for every IV environment. |
| Non-viable strategy filter unchanged | Pass | The filter at strategies.py lines 252–259 (`if rec["key"] in trades_by_key`) is untouched. Strategies where `build_trade` returns `None` or raises are absent from `trades_by_key` and are excluded from the response regardless of their presence in the category list. |

---

## 4. Detailed Findings Narrative

### Authentication and Authorisation

`analyze_symbol` is the sole consumer of `recommend_by_category`. Its auth posture is unchanged: it is protected by `legal_gate_dep` (line 69), uses optional bearer auth resolved via `_resolve_user()` at lines 141–154, and gates premium features (news sentiment, earnings awareness) on `_user_features`. The cap removal does not touch any of these code paths. No tier gate is added, removed, or weakened.

The `iv_env` value passed to `recommend_by_category` (line 108) is sourced from `iv_data.get("iv_environment", "MEDIUM")` (line 105), where `iv_data` is the return value of the server-side `get_iv_rank(symbol)` call. It is not derived from any request body field, query parameter, or header. A user cannot influence the value of `iv_env` to manipulate which strategies are returned, as this value is always a server-computed IV classification string.

### Secret and Key Exposure

No secrets or environment variables are referenced in the changed code. `strategy_engine.py` does not import from `services.db`, does not call `get_supabase()`, and does not access any environment variable. The CLAUDE.md invariants prohibiting `MARKETDATA_API_TOKEN` and `SUPABASE_SERVICE_KEY` in frontend files are unaffected — no frontend file is modified.

### Injection

`recommend_by_category` is a pure Python function. Its only inputs are the `iv_env` string parameter and the module-level `STRATEGIES` dict (a static in-process constant). It performs no database queries, no external HTTP calls, no shell commands, and no dynamic code evaluation. The `iv_env` value is used only in the expression `iv_env in strat["iv_environment"]`, a Python `in` membership test on a list of string literals. There is no injection surface.

### JWT and Auth Invariants

`auth_utils.py` is unchanged. JWT verification via `sb.auth.get_user(token)` at line 243 is intact. `python-jose` is absent from the codebase. `SUPABASE_JWT_SECRET` is absent. These invariants are fully upheld.

### DoS / Performance

The design document's proof (section 4) that net `build_trade` invocations are unchanged before and after the fix has been verified by reading `analyze_symbol` lines 201–269. The response payload grows by at most 3 additional strategy entries per affected category (bounded by the finite, static 31-entry `STRATEGIES` catalog). This is not an exploitable amplification vector: the response size is fully determined by the static catalog contents, not by any user-controlled parameter.

---

## 5. Gate Decision

**Critical findings:** 0
**High findings:** 0
**Medium findings:** 0
**Low / Informational findings:** 2 (both pre-existing; neither introduced by this change)

**PASS** — No critical or high findings. Both informational findings are pre-existing characteristics of the route design and are not introduced or worsened by this change. The change is a single list comprehension slice removal in a pure function over a static in-memory catalog. Auth, secret handling, injection surface, JWT invariants, tier limits, and scan usage limits are all unaffected. Feature may proceed to Gate 6 (Release).

---

## 6. Remediation Tracking

No findings require remediation.

# Security Review — Interpreter Narrative Improvements v2

**Date:** 25Jun2026
**Reviewer:** Security Reviewer
**Commit reviewed:** `6043fc7`
**Branch:** `claude/modest-davinci-sxz7lv`
**Overall Decision:** PASS

---

## 1. Scope

This review covers commit `6043fc7` which modifies a single file:

- `backend/services/interpreter.py` — 10 P1 narrative engine changes (FR-B5, FR-G11, FR-D6, FR-C7, FR-G8, FR-C2, FR-C3, FR-G1, FR-G3, FR-E3)

No new routes, no schema migrations, no new Python packages, no frontend changes.

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
| L01 | FR-C2: `example_strike` sourced from leg dict without type validation | `max(l.get("strike", 0) for l in short_option_legs)` defaults to `0` if `strike` key is absent or `None`. If `strike` were a non-numeric type from a malformed upstream leg dict, `example_strike * 0.20 * 100` would raise a `TypeError` at runtime, producing a 500 error rather than a security failure. The leg dicts are produced by `strategy_engine.py` (not by direct user input), making malformed values unlikely; however the absence of a type guard is noted. |
| L02 | FR-E3 / FR-E3 `pop_estimate:.0f` format specifier — non-numeric crash path | At lines 342 and 879, `f"{pop_estimate:.0f}%"` is called without a prior `isinstance` check. `pop_estimate` is read from `trade.get("pop_estimate")` and is produced exclusively by `strategy_engine.py` (either a computed `float` or catalog midpoint). If `pop_estimate` were somehow a non-numeric type (e.g. a string like `"N/A"`), the `.0f` format specifier would raise a `ValueError`. This is a defensive-coding gap rather than an exploitable surface because the trade dict is server-internal, not directly injectable by the user. |
| L03 | FR-G1: `symbol` used in f-strings for five new `elif` branches | `symbol` is an exchange ticker validated upstream by the strategy route before being passed to `generate_narrative`. The frontend renders narrative sections as React text nodes (confirmed: no `dangerouslySetInnerHTML` in `StrategyNarrative.tsx`). No XSS vector exists. Confirmed consistent with v1 Gate 5 analysis. |

---

## 3. Invariant Checklist

| Check | Result | Notes |
|-------|--------|-------|
| All new routes use `require_user()` or `require_admin()` | PASS | No new routes introduced in this commit. |
| No python-jose in codebase | PASS | Absent from `interpreter.py` and confirmed absent from all backend files. |
| No `SUPABASE_JWT_SECRET` in codebase | PASS | Not present. |
| JWT verified via `auth.get_user(token)` | PASS | `auth_utils.py` line 243 unchanged. `interpreter.py` has no auth logic — correctly a pure text-generation module. |
| `MARKETDATA_API_TOKEN` absent from frontend and interpreter | PASS | Not present in any changed file or any frontend file. |
| `SUPABASE_SERVICE_KEY` absent from frontend | PASS | Not present in any changed file. |
| No `VITE_` prefixed secret variables for backend secrets | PASS | No new environment variables introduced at all. |
| No raw SQL string concatenation with user input | PASS | `interpreter.py` performs no database operations. |
| No shell commands constructed from user input | PASS | No subprocess or shell invocations in the file. |
| IDOR: user data scoped to authenticated user ID | PASS | Not applicable — `interpreter.py` is a stateless text generator. No user data stored or retrieved. |
| RLS policies not weakened by migration | PASS | No migrations in this commit. |
| Numeric inputs validated before calculations | PASS (with note) | See L01 and L02. Arithmetic on `example_strike` and format specifier on `pop_estimate` lack explicit type guards, but both values are produced by server-internal code (`strategy_engine.py`), not by direct user input deserialization. |
| `generate_narrative` function signature unchanged for callers | PASS | The public signature gained one optional keyword argument (`trade: dict | None = None` on `_why_this_strategy`). `generate_narrative` itself is unchanged. Both call sites in `generate_narrative` are correctly updated. |
| No new imports introduced | PASS | Only existing import is `from datetime import date` — unchanged. |
| FR-G3 new tactic entries use no `symbol` parameter | PASS | All five new `_defensive_tactic` dict entries use static prose with "the stock" noun. `_defensive_tactic` receives no `symbol` argument. |

---

## 4. Detailed Analysis by Change

### FR-B5 — SMA zero guard

New branch `if sma20 == 0 and sma50 == 0` emits a static string with `{symbol}` interpolated. No user input reaches the string other than the ticker, which is upstream-validated. No injection surface.

### FR-G11 — Earnings urgency branching

`days_earn` is an integer from `earnings.get("days_until_earnings")`. Used only in a conditional branch (`if days_earn <= 3`) and a plural suffix ternary. The value is provided by `market_context.py`, not directly from the request body at this layer. No arithmetic that could produce unexpected output from a malformed value; the branch condition is a simple integer comparison.

### FR-D6 — HV unavailable notice

`hv_30` is a float computed as `(iv_analysis.get("hv_30d") or 0.0) * 100`. The new `else` branch emits a fully static string when `hv_30 == 0` (i.e. `hv_30 > 0` is false). No user-controlled value in the emitted text.

### FR-C7 — HV clause guard in headline

`hv_clause = f" vs {hv_30:.1f}% HV" if hv_30 > 0 else ""` — the guard is correct. When `hv_30` is zero (meaning data is absent), the misleading "0.0% HV" string is suppressed. This is a one-line change with no injection risk.

### FR-G8 — Short call vs short put loss framing

Leg inspection: `short_calls = [l for l in legs if l.get("action") == "sell" and l.get("option_type") == "call"]`. If `legs` is an empty list, all three lists are empty, and the code falls to the `else` branch (mixed/ambiguous — conservative unlimited-risk framing). This is the correct safe default per the architecture design note. A malformed leg with a missing `strike` key in `short_puts` causes `l.get("strike", 0)` to return 0, making `max_put_strike = 0` and `finite_max = 0`, which produces "$0 per contract" in the output — cosmetically wrong but not a security issue. No crash path.

### FR-C2 — Margin notice

`example_strike = max(l.get("strike", 0) for l in short_option_legs)` — if all strikes are absent, `example_strike = 0`, and the margin arithmetic produces `$0–$0` in the output text. Cosmetically wrong for malformed data, not a security risk. The trigger condition (`risk_type_tpe == "UNDEFINED" and strat_key_tpe not in _COVERED_CALL_KEYS`) is read from the `trade` dict, which is server-generated. No user-supplied field bypasses the covered-call exclusion. See also L01.

### FR-C3 — Long-leg risk text conditional

`risk_type_leg = trade.get("risk_type", "DEFINED")` — binary text selection between two static strings. No user input interpolated into the emitted text.

### FR-G1 — Five new `elif` branches in `_why_this_strategy()`

All new branches interpolate `symbol`, `strat_name`, `bias_clean`, `ivr`, and `iv_env` — all server-computed values. `symbol` is the only value with a possible user-influenced origin (the ticker the user searched), but it is validated upstream and rendered as a React text node (not HTML). See L03. No injection surface.

### FR-G3 — Five new `_defensive_tactic()` dict entries

All five entries are pure static strings. No parameters interpolated. `_defensive_tactic` receives only `strategy_key` (a string matched against a dict). No injection surface.

### FR-E3 — `pop_estimate` preference

`pop_estimate = (trade or {}).get("pop_estimate")` followed by `if pop_estimate is not None`. The `:.0f` format specifier at lines 342 and 879 assumes numeric type. `pop_estimate` is exclusively set by `strategy_engine.py` to either a computed `float` or a catalog midpoint `float`. See L02 for the defensive gap. Not an exploitable surface given the server-internal origin.

---

## 5. Gate Decision

**Critical findings:** 0
**High findings:** 0
**Medium findings:** 0
**Low / Informational findings:** 3 (L01, L02, L03)

**PASS** — No critical or high findings. The three informational items are defensive-coding observations on server-internal data paths, not exploitable attack surfaces. The feature may proceed to Gate 6 (Release).

**Conditions:** None.

---

## 6. Remediation Tracking

No critical or high findings requiring remediation.

| Finding ID | Severity | Recommended follow-up |
|------------|----------|----------------------|
| L01 | Informational | Consider adding `isinstance(example_strike, (int, float))` guard in a future hardening pass of `_trade_plain_english`. |
| L02 | Informational | Consider adding `isinstance(pop_estimate, (int, float))` guard before the `:.0f` format calls in `_why_this_strategy` and `_profit_scenario`. |
| L03 | Informational | No action required. Documented for continuity with v1 Gate 5 analysis. |

# Security Review — Risk Monitor Layout Redesign (v1.9.0)

**Feature folder:** `docs/FeatureRequests/risk-monitor-layout-27Jun2026/`
**Reviewer:** security-reviewer
**Date:** 26Jun2026
**Gate:** 5

---

## Overall Gate Decision

**PASS**

No Critical or High findings. The feature is cleared for Gate 6.

---

## Checklist Source

CLAUDE.md invariants section read and applied. Files reviewed:

| File | Lines read |
|------|-----------|
| `backend/routes/positions.py` | 1–368 (full file) |
| `backend/services/auth_utils.py` | 1–301 (full file) |
| `frontend/src/components/RiskMonitor.tsx` | 1–1209 (full file) |
| `frontend/src/api/client.ts` | 1–1138 (full file) |
| `docs/FeatureRequests/risk-monitor-layout-27Jun2026/02-design.md` | 1–645 (full file) |
| `CLAUDE.md` | full |

---

## Finding Detail

### INF-001 — Auth guard confirmed present (Informational)

`GET /api/positions/risk` carries `payload: dict = Depends(verify_token)` (line 229 of `positions.py`). `verify_token` in `auth_utils.py` calls `sb.auth.get_user(token)` and raises HTTP 401 on failure. The new `entered_at` query logic was inserted inside the handler body after the `user_id = get_user_id(payload)` call (line 230), so it executes only when a valid token has already been verified. No auth regression.

**Risk:** Informational — confirmed secure.

---

### INF-002 — IDOR: orders query is strictly user-scoped (Informational)

The new `orders` Supabase query (lines 249–253 of `positions.py`) uses `.eq("user_id", user_id)` where `user_id` is derived from the verified token via `get_user_id(payload)`, not from any request parameter, query string, or body. An authenticated user cannot read another user's orders or `entered_at` values. The same applies to the fallback `positions` query (lines 295–299), which also uses `.eq("user_id", user_id)`.

**Risk:** Informational — confirmed secure.

---

### INF-003 — No new user-controlled input reaches the database (Informational)

The `GET /api/positions/risk` endpoint accepts no query parameters or request body. The new code path introduces zero new WHERE clauses driven by user-supplied values. The only variable in both new Supabase queries is `user_id`, which originates from the Supabase-verified JWT payload. There is no injection surface.

**Risk:** Informational — confirmed secure.

---

### INF-004 — XSS: all new date output is rendered as React text nodes (Informational)

`fmtChipDate`, `fmtFullDate`, and `daysAgo` produce strings that are interpolated into JSX as plain text children or attribute values. The search for `dangerouslySetInnerHTML`, `innerHTML`, and `__html` in `RiskMonitor.tsx` returned no matches. The `entered_at` string from the backend is a ten-character `YYYY-MM-DD` date, not user-generated rich content, and it passes through purely cosmetic formatting helpers before display. No XSS vector exists.

**Risk:** Informational — confirmed secure.

---

### INF-005 — No cross-user data leakage via the fallback chain (Informational)

The today's-date fallback (`str(date.today())`) is a static server-side value unrelated to any other user. The `positions.created_at` fallback is queried with the same `.eq("user_id", user_id)` filter as the primary orders query. The strategy-group consistency pass (lines 336–347) operates only over `risk_items` derived from the authenticated user's own positions. No path exists by which one user's `entered_at` value could appear in another user's response.

**Risk:** Informational — confirmed secure.

---

### INF-006 — Error handling does not leak stack traces or DB error details (Informational)

Both `except Exception as e` blocks (lines 266–267 and 325–330 of `positions.py`) log at `WARNING` level via the module logger (`logger.warning(...)`) and do not propagate `e` to the HTTP response. In the primary fallback block, the exception triggers a hard fallback to `str(date.today())` with no response body modification. The secondary fallback assigns `today_iso` to any still-`None` items. Neither path surfaces internal error messages, SQL error text, or Python tracebacks to the API caller.

**Risk:** Informational — confirmed secure.

---

### INF-007 — CLAUDE.md invariants: all pass (Informational)

| Invariant | Status |
|-----------|--------|
| `python-jose` absent | PASS — no references found anywhere in `backend/` |
| `SUPABASE_JWT_SECRET` absent | PASS — no references found |
| `auth.get_user(token)` is the verification path | PASS — `auth_utils.py` line 243 |
| `MARKETDATA_API_TOKEN` absent from frontend | PASS — no match in `frontend/` |
| `SUPABASE_SERVICE_KEY` absent from frontend | PASS — no match in `frontend/` |
| `get_supabase()` called inside functions, not at module level | PASS — both calls in `positions.py` are inside `update_avg_cost` (line 53) and `get_positions_risk` (line 245); no module-level call |
| No SQL migrations dropped or weakened | PASS — no migration files in this feature |
| No new API endpoints | PASS — design doc and code confirm |
| No new packages | PASS — requirements.txt unchanged |

---

### INF-008 — `entered_at` is a non-sensitive, user-owned date (Informational)

The `entered_at` field exposes the date the user placed their first order for a given position. This information already exists in the `orders` table visible to the user via `GET /api/orders`. Adding it to the risk response does not reveal any new category of data. It is not PII beyond what the user already supplied and already has access to.

**Risk:** Informational — no concern.

---

### LOW-001 — String slicing on `created_at` assumes ISO 8601 format (Low)

Lines 263 and 312 of `positions.py` use `row["created_at"][:10]` to extract the date portion. This is safe as long as Supabase always returns `created_at` in ISO 8601 format with the date in the first ten characters (`YYYY-MM-DD`). Supabase's PostgreSQL backend with `timestamptz` columns consistently returns this format; it has not changed in any Supabase client version in active use. The design doc (section 2.2) documents this assumption explicitly.

The risk is that a future Supabase client upgrade could theoretically change the serialisation format and silently produce garbled date strings rather than raising an exception, which could result in incorrect `entered_at` values but no data leak or privilege escalation.

**Recommendation:** Add a length check or a try/except with a fallback to `str(date.today())` around the slice, e.g. `iso_date = row["created_at"][:10] if row.get("created_at") and len(row["created_at"]) >= 10 else str(date.today())`. This is a defensive coding improvement, not a security gate condition.

**Risk:** Low — incorrect display value only; no security impact.

---

### LOW-002 — `fmtChipDate` and `fmtFullDate` do not validate input length (Low)

Both helpers in `RiskMonitor.tsx` (lines 29–41) call `iso.split('-')` and index the result without bounds checking. If `entered_at` were ever an empty string or a non-conformant value, `parseInt(undefined, 10)` would produce `NaN`, and the rendered output would be `"NaN undefined"` rather than a crash or XSS. The backend guarantees `entered_at` is always a `YYYY-MM-DD` string (fallback chain ensures this), and the TypeScript type is `string` (not optional). The frontend also has a truthy check (`pos.entered_at && (...)`) before calling these functions in `PositionCard` (line 497) and `RiskListRow` (line 773).

**Risk:** Low — cosmetic rendering artifact only under conditions the backend guarantees cannot occur; no security impact.

---

## Summary Table

| ID | Category | Risk | Title | Status |
|----|----------|------|-------|--------|
| INF-001 | Auth | Informational | Auth guard confirmed on `get_positions_risk` | Confirmed secure |
| INF-002 | IDOR | Informational | Orders query strictly user-scoped via token | Confirmed secure |
| INF-003 | Injection | Informational | No new user-controlled DB input | Confirmed secure |
| INF-004 | XSS | Informational | Date output rendered as React text nodes | Confirmed secure |
| INF-005 | Data exposure | Informational | No cross-user leakage in fallback chain | Confirmed secure |
| INF-006 | Error handling | Informational | Exceptions logged, not propagated to response | Confirmed secure |
| INF-007 | Invariants | Informational | All CLAUDE.md invariants pass | Confirmed secure |
| INF-008 | Data exposure | Informational | `entered_at` is non-sensitive, user-owned | Confirmed secure |
| LOW-001 | Resilience | Low | `created_at[:10]` assumes ISO 8601 format | Recommend defensive guard; not a gate condition |
| LOW-002 | Resilience | Low | Date helpers do not validate input length | Backend guarantee makes this non-reachable; not a gate condition |

**Critical findings:** 0
**High findings:** 0
**Medium findings:** 0
**Low findings:** 2 (both non-gate-conditions)
**Informational findings:** 8

---

## Gate Decision

**PASS — cleared for Gate 6.**

The two Low findings are defensive coding recommendations with no security impact. They do not require a fix before release. Developers may address them as a post-launch housekeeping item.

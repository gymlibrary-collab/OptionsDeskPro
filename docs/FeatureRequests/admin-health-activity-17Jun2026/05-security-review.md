# Security Review — Admin Health Monitor and User Activity Log

**Date:** 17Jun2026  
**Reviewer:** Security Reviewer  
**Status:** Conditional Pass — all findings resolved prior to commit

---

## Executive Summary

The feature is well-structured and follows existing auth conventions correctly. Every new admin endpoint is protected by `require_admin()`. The logout endpoint is correctly gated by `verify_token`. The activity log query uses Supabase's parameterised filter methods — no SQL injection vector. RLS is enabled on the new table with no user-facing policies, making it inaccessible to anon-key clients. The JWT invariant is intact (`auth.get_user()` used throughout; `python-jose` and `SUPABASE_JWT_SECRET` absent). No secrets appear in frontend files. React renders all user-supplied data through normal JSX — no XSS vector. Three findings were identified and resolved before release.

---

## Findings

| # | Title | Severity | Status |
|---|-------|----------|--------|
| F1 | `asyncio.gather(return_exceptions=False)` allows `TimeoutError` to propagate as HTTP 500 | Medium | Fixed |
| F2 | Inline `X-Forwarded-For` extraction in `auth_routes.py` duplicates logic; IP spoofable | Low | Fixed |
| F3 | `cron.schedule()` in migration SQL fails hard if pg_cron not enabled | Low | Fixed |

---

### F1 — Health-check TimeoutError propagates as HTTP 500 (Medium) — FIXED

**File:** `backend/routes/admin_routes.py`

**Description:** `asyncio.gather()` was called with `return_exceptions=False`. If `asyncio.wait_for` raised `AsyncioTimeoutError` for any probe, the exception propagated unhandled through FastAPI, potentially exposing internal stack traces including connection strings and environment variable values in the response body.

**Fix applied:** Changed to `return_exceptions=True`. Added post-gather loop that converts any `Exception` result into a structured error component dict with the probe name preserved and a truncated message.

---

### F2 — Duplicate inline IP extraction; `X-Forwarded-For` fully attacker-controlled (Low) — FIXED

**File:** `backend/routes/auth_routes.py` line 118

**Description:** `on_login()` duplicated the X-Forwarded-For extraction logic inline instead of calling `extract_ip(request)`. Any future hardening of the extraction (e.g., rightmost-hop selection per Railway proxy config) would not apply to the login event. Additionally, `X-Forwarded-For` is attacker-controlled — logged IP can be spoofed. Impact is limited to audit log integrity (email and user_id come from the verified JWT).

**Fix applied:** Replaced inline extraction with `extract_ip(request)`. IP spoofing limitation noted as a known operational constraint pending Railway proxy configuration review.

---

### F3 — `cron.schedule()` fails hard if pg_cron not enabled (Low) — FIXED

**File:** `backend/migrations/015_user_action_log.sql`

**Description:** Bare `select cron.schedule(...)` call would raise a PostgreSQL error if the pg_cron extension is not enabled, potentially rolling back the entire migration including table creation.

**Fix applied:** Wrapped in `DO $$ BEGIN ... EXCEPTION WHEN others THEN RAISE WARNING ... END $$` block. A missing pg_cron extension now produces a warning with remediation instructions instead of a migration failure.

---

## Invariant Checklist

| Invariant | Status |
|-----------|--------|
| `auth.get_user(token)` used for all token verification | PASS |
| `python-jose` absent | PASS |
| `SUPABASE_JWT_SECRET` absent | PASS |
| `MARKETDATA_API_TOKEN` absent | PASS |
| All new admin routes protected by `require_admin()` | PASS |
| `POST /api/auth/logout` requires valid JWT | PASS |
| No user identity derived from request body | PASS |
| No frontend file references backend-only secrets | PASS |
| No `dangerouslySetInnerHTML` in new components | PASS |
| Activity log `user_email` filter is parameterised (not string-interpolated) | PASS |
| RLS enabled on `user_action_log` with no user-facing policy | PASS |
| `options.py` public routes remain accessible without auth | PASS |
| CSV export endpoint not accidentally implemented | PASS |

---

## Gate 5 Decision

**APPROVED** — all three findings resolved before commit. Feature is cleared for Gate 6 release.

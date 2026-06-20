# Security Review — Strategy Methodology Page & Catalog

**Feature:** strategy-methodology-page-20Jun2026
**Date:** 20Jun2026
**Reviewer:** security-reviewer agent
**Branch:** claude/modest-davinci-sxz7lv
**Gate:** 5 — Security

---

## Gate Decision: PASS

No Critical or High findings. One Medium finding (missing RLS on new table) does not block release but should be addressed in the next migration slot. Feature may proceed to Gate 6 (Release).

---

## 1. Scope

Files reviewed:

| File | Change type |
|---|---|
| `docs/strategy-selection-spec.md` | New (static doc) |
| `backend/migrations/016_strategy_catalog.sql` | New |
| `backend/services/strategy_engine.py` | Major rewrite |
| `frontend/src/components/StrategyMethodologyPage.tsx` | New |
| `frontend/src/App.tsx` | Modified |
| `frontend/src/components/StrategyScanner.tsx` | Modified |
| `backend/services/auth_utils.py` | Baseline read (unchanged) |
| `backend/main.py` | Baseline read (unchanged) |

---

## 2. Auth Invariant Checks

**JWT verification path (`auth_utils.py`):** `sb.auth.get_user(token)` is the sole verification path. `python-jose` is not imported anywhere in the backend. `SUPABASE_JWT_SECRET` does not appear in any backend file. Invariant intact.

**New API routes introduced:** None. The methodology page is a client-side-only static component. No backend route changes were made.

**Existing route auth:** `strategies.py` still uses `Depends(verify_token)` on all routes. Unchanged.

**`get_supabase()` module-level call check in `strategy_engine.py`:** No calls to `get_supabase()` exist anywhere in `strategy_engine.py`. The file is a pure in-memory computation module with no database access. Invariant intact.

---

## 3. Findings

### Finding 001 — Missing RLS on `strategy_catalog` table
**Severity: Medium**
**Affects:** `backend/migrations/016_strategy_catalog.sql`

Migration `016_strategy_catalog.sql` creates the `strategy_catalog` table but does not run `ALTER TABLE public.strategy_catalog ENABLE ROW LEVEL SECURITY`. The pattern established for all tables in this codebase is to enable RLS with a deny-all policy for `anon` and `authenticated` roles, relying on the service role to bypass RLS.

Without RLS enabled, an authenticated Supabase client using only `VITE_SUPABASE_ANON_KEY` (i.e., from the browser) could query `strategy_catalog` directly via Supabase's auto-generated REST API. The data in this table is strategy metadata already displayed to all logged-in users through the methodology page, so there is no confidentiality breach. However, the missing control is a deviation from the established hardening pattern.

**Recommendation:** Add a follow-up migration:
```sql
ALTER TABLE public.strategy_catalog ENABLE ROW LEVEL SECURITY;
-- No permissive policies added — service role bypasses RLS automatically.
```

**Does not block this release.** Log a ticket for the next migration slot.

---

### Finding 002 — `score_and_rank()` not yet exposed via route; `build_trade()` key lookup is safe
**Severity: Low / Informational**

`build_trade()` accepts a `strategy_key` string and resolves it via `STRATEGIES.get(strategy_key)`, returning a clean error dict if the key is absent. No SQL, no shell execution. The main analysis flow derives the key from the `STRATEGIES` dict itself (not raw user input), so no injection path exists today.

When `score_and_rank()` is eventually wired into a route, the route handler should validate `iv_env` against `{"HIGH","MEDIUM","LOW"}` and `bias` against the known set before calling the function.

---

### Finding 003 — `StrategyMethodologyPage.tsx`: no XSS surface
**Severity: Informational**

The methodology page renders entirely from hardcoded TypeScript literal arrays. There is no `dangerouslySetInnerHTML`, no dynamic content fetched from any API, no user input accepted, and no state derived from URL parameters. The `onTabChange` prop is invoked only by an internal button click passing a hardcoded string. No XSS surface is introduced.

---

### Finding 004 — `App.tsx`: methodology tab correctly ungated for all authenticated users
**Severity: Informational**

The methodology tab is correctly excluded from the trade panel sidebar (`activeTab !== 'methodology'`). It is available to all authenticated users, which is the intended design. The Dashboard component is only reachable after user authentication is confirmed (`user` non-null in `ClientAppInner`). No auth gap exists.

---

### Finding 005 — CORS: no new origins added
**Severity: Informational**

`main.py` CORS origins are unchanged. No new frontend domains are introduced by this feature.

---

### Finding 006 — No secrets in frontend components
**Severity: Informational (confirmed clean)**

Neither `StrategyMethodologyPage.tsx` nor the changes to `App.tsx` or `StrategyScanner.tsx` reference `MARKETDATA_API_TOKEN`, `SUPABASE_SERVICE_KEY`, or any new `VITE_`-prefixed variable.

---

### Finding 007 — No Alpaca re-introduction
**Severity: Informational (confirmed clean)**

No `alpaca` imports appear in any modified file. The `alpaca_id` column references in existing migrations `001` and `004` are pre-existing schema columns, not introduced by this feature.

---

## 4. CLAUDE.md Invariant Checklist

| Invariant | Status |
|---|---|
| `SUPABASE_JWT_SECRET` absent | ✅ PASS — not present anywhere |
| `python-jose` absent | ✅ PASS — not imported anywhere |
| JWT verification via `auth.get_user(token)` | ✅ PASS — `auth_utils.py` unchanged |
| No Alpaca re-introduction | ✅ PASS — no new alpaca references |
| No `MARKETDATA_API_TOKEN` | ✅ PASS — no references in any modified file |
| `get_supabase()` never at module level | ✅ PASS — `strategy_engine.py` has no Supabase calls |
| All routes protected by auth | ✅ PASS — no new routes introduced |
| `SUPABASE_SERVICE_KEY` absent from frontend | ✅ PASS |
| No RLS policies dropped | ✅ PASS — migration adds a new table; drops nothing |

---

## 5. Summary

This feature is low-risk:
- A static spec document with no code
- A migration adding a reference catalog table (no existing policies affected; RLS omitted — Finding 001)
- A backend service rewrite that is pure in-memory computation with no database access
- A frontend static educational page with no API calls, no user input, no dynamic content
- Minor wiring in `App.tsx` and `StrategyScanner.tsx`

**One action required post-release:** Add RLS enablement for `strategy_catalog` in the next migration slot (Finding 001). This does not block Gate 6.

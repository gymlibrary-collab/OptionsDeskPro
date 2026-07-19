# Security Review — Position Lifecycle & Risk Monitor Improvements

**Date:** 2026-07-19
**Reviewer:** security-reviewer agent (Gate 5)
**Branch:** `claude/modest-davinci-sxz7lv`

---

## Scope

`backend/migrations/025_position_lifecycle.sql`, `backend/services/settlement.py`, `backend/routes/positions.py`, `backend/services/user_portfolio.py`, `frontend/src/api/client.ts`, `frontend/src/components/Positions.tsx`, `frontend/src/components/RiskMonitor.tsx`, `frontend/e2e/*`, with `auth_utils.py` as the invariant baseline.

## Findings

### Critical / High — none

### Medium

**M01 — Event-loop blocking in `auto_settle_expired`** (`settlement.py:242`)
`_get_settlement_price()` performs blocking `thread.join(timeout=5)` waits (two tiers per position) directly inside an `async def` called from three endpoints. Worst case (user returns after weeks with ~20 expired positions, yfinance timing out) stalls the single uvicorn event loop for minutes, freezing the app for **all** users. Sync Supabase calls inside the loop compound this.
**Required fix before production deploy:** wrap the settlement computation in `asyncio.to_thread(...)` and bound positions settled per request.
**Status: FIXED** post-review — `auto_settle_expired` now runs the entire per-user settle pass via `asyncio.to_thread`, with a cap of 10 positions settled per request (remainder picked up on the next call).

### Low / Informational

- **L01** — No server-side upper bound on manual close price (`user_portfolio.py`): a user can close at $999,999 and inflate their own paper P&L and the leaderboard. Explicitly accepted in the spec for paper trading; add a cap (e.g. `price ≤ 50,000`) if the leaderboard becomes competitive.
- **L02** — No transaction around DELETE→cash→order sequence; crash mid-sequence orphans a settlement. Acknowledged in ADR-0015; consider a reconciliation query later.
- **L03** — Daemon threads that outlive their 5 s join linger until process exit under sustained yfinance timeouts. Partially mitigated by the M01 fix.
- **L04** — `SELECT *` in `get_closed_positions`; response is explicitly keyed so nothing leaks today, but prefer an explicit column list.
- **L05** — `max(float(leg.price), 0.0)` has no NaN guard; unreachable via JSON API (JSON has no NaN literal). Same pre-existing gap in `place_order`.

## Invariant checklist — all PASS

- All new/modified routes derive `user_id` from the verified JWT (`verify_token` → `sb.auth.get_user`); `GET /api/positions/closed` accepts no user_id parameter at all.
- IDOR: every settlement query is double-predicated (`id` + `user_id`); the initial SELECT, cash update, and order insert are all scoped to the verified UID. No cross-user vector found.
- Double-settle race: atomic `DELETE WHERE id AND user_id` — Postgres row-lock serialisation guarantees exactly one winner; loser sees empty result and skips. No double-credit path.
- Injection: all queries use parameterised Supabase client filters; no string concatenation with user input; OCC symbol only reaches `yf.Ticker()`; JSONB metadata built from DB-sourced values, never user-controlled keys.
- Data exposure: `/api/positions/closed` returns only the caller's own trade data; `user_action_log` writes match existing PII patterns (admin-only access).
- Migration 025: additive, nullable, idempotent; no RLS changes; safe on a live database.
- CLAUDE.md invariants: no module-level `get_supabase()`, no python-jose, no `SUPABASE_JWT_SECRET`, `_safe_float` on all yfinance reads, E2E auth fixture never touches real OAuth.

## Gate decision

**PASS WITH RECOMMENDATIONS**

- Required before production deploy: **M01** — resolved (see above).
- Recommended next cycle: L01 price cap, L04 explicit column list.

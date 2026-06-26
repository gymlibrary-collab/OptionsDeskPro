# ADR-0014 — `entered_at` Derived at Query Time from `orders.created_at`

**Date:** 27Jun2026
**Status:** Accepted
**Feature:** Risk Monitor Layout Redesign (`docs/FeatureRequests/risk-monitor-layout-27Jun2026/`)
**Deciders:** solution-architect

---

## Context

The Risk Monitor Master-Detail Split layout requires an `entered_at` field on every item in the `GET /api/positions/risk` response. This field represents the calendar date the position was first opened and is used to sort the left-panel list newest-first and to display an "N days ago" banner in the right panel.

The value must reflect the actual first order date, not the last modification date. For multi-leg strategy groups, all legs must share the earliest entry date across the group.

Three implementation options were considered.

---

## Options Considered

### Option A — Store `entered_at` as a column on the `positions` table

Add `entered_at date NOT NULL DEFAULT current_date` to `positions`. Populate it at insert time (when `_update_position` creates a new row) and leave it unchanged on subsequent updates.

**Pros:** Simple to read at query time; no extra join needed.

**Cons:**
- Requires a new migration (migration 025 or higher) and a backfill query for the ~50 existing position rows.
- Application logic in `_update_position` must explicitly avoid overwriting `entered_at` when updating an existing row (partial closes, avg_cost changes). This is a new invariant that must be tested and maintained.
- For partial-close / re-entry scenarios where the position row persists, `entered_at` would correctly be the original date — but if the position row is ever deleted and recreated (edge case: admin data correction), the value is lost.
- Does not reflect the `MIN(orders.created_at)` semantic directly; it reflects the position row's creation time, which may diverge after partial-close and re-entry if handled incorrectly.

### Option B — Store `entered_at` on the `orders` table as a denormalised field

Add `entered_at date` to `orders`, set to the date of the first order for that `(user_id, symbol, expiry, strike, option_type, strategy_key)` group at insert time.

**Pros:** Available in the orders table for future analytics.

**Cons:**
- Requires a migration.
- Requires application logic to detect whether this is the "first" order for the group at insert time (query + conditional write on every order placement — a race-condition risk).
- `orders.created_at` is already the canonical entry timestamp; storing `entered_at` as a separate column is redundant denormalisation.

### Option C — Derive at query time from `MIN(orders.created_at)` (chosen)

Fetch all `orders` rows for the user and compute the minimum `created_at` per `(symbol, expiry, strike, option_type, normalised_strategy_key)` group in Python. Attach the result to each risk item in the `GET /api/positions/risk` response.

**Pros:**
- No schema change; no migration; no backfill.
- Automatically correct for partial closes and re-entries — the source of truth is the orders table, which is never modified (only appended to).
- If a position row is ever deleted and recreated, the `entered_at` derived from orders remains correct as long as the order rows exist.
- Implementation is entirely within `backend/routes/positions.py`, with no change to order-placement logic or position-update logic.

**Cons:**
- One additional Supabase query per `GET /api/positions/risk` request.
- Adds ~20–50ms to the request (indexed query, ≤200 rows per user — negligible within the 60-second timeout).
- If a user's order rows are deleted independently of their position rows (not a supported operation, but theoretically possible via direct database manipulation), `entered_at` falls back to `positions.created_at`, which is a safe approximation.

---

## Decision

Option C is adopted. The existing `orders` table is the authoritative record of when each trade was placed. `MIN(created_at)` over the orders rows for a given position is the correct and precise answer to "when was this position first entered?" with no additional storage or maintenance burden.

---

## Consequences

- `GET /api/positions/risk` executes one extra `SELECT` from the `orders` table on every call. This is acceptable given the low order volume (capped at 200 per user) and the existing response timeout of 60 seconds.
- No database migration is required for this feature.
- The `entered_at` query is not cached independently. It refreshes with the full risk response on each call and on the 5-minute auto-refresh.
- Future features that require `entered_at` in other contexts (e.g. the Positions tab) would need to repeat this derivation pattern or consider adding the column at that time. This is not a concern for the current release.
- The fallback chain (orders `MIN` → positions `created_at` → today's date) ensures `entered_at` is never `null` in the response, regardless of data integrity edge cases.

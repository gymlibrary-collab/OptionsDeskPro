# ADR 0003 — DB-backed tier limits service replacing static tier_limits.py

**Date:** 12 Jun 2026
**Status:** Accepted
**Feature:** Multi-Tenanted SaaS Conversion

---

## Context

`backend/services/tier_limits.py` is a static Python dict that maps tier names
(free/starter/pro/enterprise) to `max_symbols` and `max_scans_per_month`. Two
routes call `get_limits()` at request time: `watchlist.py` and `strategies.py`.

FR-37 and FR-38 require that an Owner can change tier prices and entitlement limits
(watchlist symbol cap, monthly scan cap, tab unlock flags) from the admin portal
without a code deployment. This is incompatible with a hardcoded dict.

Three options were considered:

1. **Replace the file entirely with DB reads**: every call to `get_limits()` hits
   the database synchronously.

2. **DB-backed with in-process cache + hardcoded fallback**: read from a `plans`
   catalog table, cache in a module-level dict with a 60 s TTL, fall back to the
   existing hardcoded values if the table is unavailable.

3. **DB-backed with no fallback, fail open to free tier**: on DB error, return
   free-tier limits.

---

## Decision

Use **option 2: DB-backed with in-process cache and hardcoded fallback**.

---

## Rationale

Option 1 adds a DB round-trip to every watchlist read and every scan, which are
already multi-step operations. With 200 concurrent users the compound latency
increase is material.

Option 3 fails unsafe: a transient DB error would silently degrade all paid
subscribers to free-tier limits, which is a billing correctness problem.

Option 2 retains the performance profile of the current implementation for the
common case (cache hit), is resilient to DB connectivity problems (hardcoded
fallback is commercially correct since it matches the deployed tier contract at
the point of DB outage), and satisfies FR-38 (changes propagate within the cache
TTL, at most 60 seconds after the admin saves a change).

The 60 s TTL is a deliberate trade-off: it means a limit change is not instantaneous
for currently active sessions, but it avoids cache invalidation complexity
(pub/sub, Redis, or HTTP call to flush). 60 seconds is acceptable because entitlement
changes are an infrequent administrative action, not a subscriber-facing real-time
operation.

---

## Consequences

- A new `plans` table is created in migration 006. It stores one row per tier with
  columns `tier_key`, `display_name`, `price_monthly_usd`, `max_symbols`,
  `max_scans_per_month` (nullable = unlimited), `features_json` (JSONB for tab
  unlock flags), `stripe_price_id`, `is_active`.
- `tier_limits.py` gains a `_plans_cache: dict` and `_plans_cache_ts: float`
  at module level and a `_load_plans()` function that populates it from the DB.
  `get_limits(tier)` calls `_load_plans()` (no-op if TTL not expired) then looks
  up the tier. If the lookup fails (no DB row, no cache), it falls back to the
  hardcoded dict.
- The hardcoded `TIER_LIMITS` dict is kept in the file as the fallback constant.
  It is not deleted.
- A `features_json` column on the `plans` table drives which dashboard tabs are
  unlocked per tier. The entitlements endpoint reads this column.
- Admin pricing manager calls `POST /api/platform/pricing/{tier}` to update a row;
  the endpoint also invalidates the in-process cache (sets `_plans_cache_ts = 0`
  so the next request forces a reload).

---

## Rejected alternatives

**Option 1 (no cache)**: Rejected for per-request DB latency.

**Option 3 (fail open to free)**: Rejected for billing correctness violation.

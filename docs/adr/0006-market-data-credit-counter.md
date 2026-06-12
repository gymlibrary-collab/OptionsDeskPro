# ADR 0006 — Market Data App credit usage counter: in-process vs database

**Date:** 12 Jun 2026
**Status:** Accepted
**Feature:** Multi-Tenanted SaaS Conversion

---

## Context

FR-43, FR-44, and FR-45 require the admin health panel to display current-day Market
Data App credit usage without making a live call to `api.marketdata.app` at dashboard
load time. AC14.4 explicitly states: "Data is drawn from an internal counter in the
backend."

The existing `market_data.py` makes API calls but does not count them. Two counter
storage options were evaluated:

1. **In-process module-level counter**: a dict `_credit_usage: dict` in
   `market_data.py` keyed by UTC date string, incremented on each successful
   Market Data App call. Survives the process lifetime; resets on restart.

2. **Database counter**: a `market_data_usage` table with one row per UTC date,
   incremented via upsert. Survives restarts; accessible to multiple backend
   instances.

A Redis counter was also considered but rejected immediately: the project has no
Redis dependency and adding one for a single counter is disproportionate.

---

## Decision

Use **option 1: in-process module-level counter** for MVP, with the caveat that the
counter is documented as approximate (resets on process restart, not accurate if
multiple backend instances run).

---

## Rationale

The health panel is an operational convenience display, not a billing-critical
number. The Market Data App free plan has a 100-credit daily quota; the purpose
of FR-44 is to give the Owner early warning before the fallback chain kicks in.
An approximate counter that resets on deploy is sufficient for this purpose.

Railway runs a single backend instance in the free/hobby tier. Multi-instance
deployments (which would make the in-process counter inaccurate) are a scale
problem that does not exist at launch. If the backend is scaled horizontally,
migrating the counter to the DB can be done in a single migration + two-line code
change without any API contract change.

Option 2 (DB counter) would add a DB write on every Market Data App call (which
already triggers on every options chain request). This turns a hot path into a
DB write path, worsening latency for the primary data flow.

---

## Consequences

- `market_data.py` gains a module-level `_mda_credit_counter: dict[str, int]`
  (keyed by UTC date string `'YYYY-MM-DD'`, value = calls made today) and a
  `get_mda_credit_usage() -> dict` function that returns
  `{'date': '...', 'calls_today': N, 'limit': 100, 'pct': N/100*100}`.
- The counter is incremented inside `_marketdata_chain()` on each successful
  HTTP call (status 200 or any non-None response consumed), after the call
  returns, not before — so quota exhaustion returns `None` without incrementing.
- `GET /api/platform/health` reads this counter via `get_mda_credit_usage()`.
  No external API call is made.
- The counter rolls to 0 automatically at the UTC date boundary (the date key
  changes, old key is effectively abandoned; a daily cron or restart clears old keys).
- The health endpoint also returns the count of strategy analysis requests and
  scanner requests processed in the last 24 h. These come from the same in-process
  counter pattern: `_request_counter: dict` in a new `backend/services/metrics.py`
  module, incremented by the strategies routes, readable by the health endpoint.
- The `last_seen_at` active session count (users with activity in last 15 min) is
  read from the `user_profiles` table `last_seen_at` column, which is already
  updated on login. The `POST /api/auth/login` route is updated to also set
  `last_seen_at = now()` on each call (it currently does this via `ensure_portfolio`
  indirectly; the upsert should set it directly).

---

## Rejected alternatives

**Database counter**: Rejected for adding a write to the hot options-chain path
at a scale that does not require it.

**Redis counter**: Rejected as a new infrastructure dependency disproportionate
to the requirement.

# ADR-0015 — Lazy Auto-Settlement Triggered on Endpoint Read

**Date:** 2026-07-18
**Status:** Accepted
**Deciders:** Solution Architect, Product Owner
**Feature:** Position Lifecycle & Risk Monitor Improvements (18Jul2026)

---

## Context

Option positions in OptionsDesk are paper trades stored in the `positions` table. When the expiry date on a position passes, the position becomes economically closed (the option has expired), but no automated process removes it from the `positions` table or records a final P&L. Users were left with stale "ghost" positions showing zero or stale current prices after expiry.

The product requirement (FR-1) is to detect expired positions, compute a settlement price, adjust portfolio cash, record a closing order, and move the position out of the open positions table.

Two architectures were evaluated:

**Option A — Lazy settlement triggered on API read**: On every call to `GET /api/positions`, `GET /api/portfolio`, and `GET /api/positions/risk`, the backend runs a settlement pass before its main logic. Only positions belonging to the authenticated user are checked.

**Option B — Scheduled job (Railway cron / GitHub Actions)**: A background worker runs on a schedule (e.g., daily at 16:30 ET after US market close) and settles all expired positions across all users.

---

## Decision

**Option A (lazy settlement on read)** was selected.

---

## Reasons

### Why lazy settlement was chosen

**No infrastructure requirement.** OptionsDesk runs on Railway with no background worker dyno. Adding a scheduled job would require either a separate Railway service, a Railway cron trigger, or a GitHub Actions workflow with a service key stored as a GitHub secret. Each introduces operational complexity that is disproportionate to the value of settling positions a few hours earlier.

**Load proportional to user activity.** Under Option B, a daily cron must process every user's positions regardless of whether any user is active. Under Option A, settlement work only runs when the user actually visits the Positions tab. A user who has not logged in for three months does not generate settlement load. This is the correct model for a multi-tenant SaaS with highly variable activity across users.

**Natural idempotency.** Option A's trigger is the user's own read request. After successful settlement, the position row is gone — re-triggering on a subsequent read finds no expired rows and exits immediately. Option B requires its own idempotency mechanism (e.g., a `settled_at` flag or a separate `settlements` table), adding schema complexity.

**Correctness on re-entry after long absence.** Under Option A, if a user returns after 6 weeks with 15 expired positions, all 15 are settled on the next endpoint call. The 90-day Closed Positions window in `GET /api/positions/closed` means positions expired more than 3 months ago will still be settled (and appear in orders), but may fall outside the display window. This is a minor UX degradation with no financial consequence.

**Acceptable latency impact.** The settlement pass for a typical user (1–5 expired positions) adds roughly 1–5 seconds to the triggering endpoint. The `GET /api/positions` timeout on the client is 45 seconds. For the extreme case (15 positions, 6-week absence), the worst-case latency is approximately 15 seconds — still within the timeout budget.

### Why a scheduled job was rejected

- Requires new infrastructure (second Railway service or external scheduler).
- Forces per-service secrets management for the Supabase service key.
- Runs unnecessary computation for inactive users.
- Adds operational surface: the job must be monitored, alertable, and recoverable on failure.
- The BA spec explicitly states lazy evaluation to avoid requiring a background worker (FR-1, item 6).

---

## Concurrency and Idempotency Mechanism

The risk with lazy settlement is that two concurrent browser requests (e.g., two tabs) hit `GET /api/positions` simultaneously for the same user. Both could read the same expired position row and both attempt settlement, creating a double-settle (double cash credit, duplicate order).

**Mechanism chosen: atomic DELETE claim.**

Before computing the settlement price or adjusting cash, the service executes:
```sql
DELETE FROM positions WHERE id = :pos_id AND user_id = :user_id
```
via the Supabase Python client's `.delete().eq("id", pos_id).execute()`.

The supabase-py library returns the deleted rows in `result.data`. If `result.data` is an empty list, no row was deleted — another concurrent request already claimed this position — and the settlement for that position is skipped.

Postgres guarantees row-level serialisation of conflicting DML: when two DELETE statements target the same row, Postgres acquires a row-level lock on the first and the second blocks until the first commits. After the first commits (row deleted), the second finds no matching row and deletes zero rows.

**Consequence of a partial failure** (server crash after DELETE but before the order insert or cash update): the position row is gone but no closing order or cash credit exists. The user effectively loses the unsettled settlement value. For a paper-trading tool this is an acceptable risk. A full DB transaction (`BEGIN/COMMIT`) would prevent this but the Supabase Python client's postgrest-py layer does not expose explicit transaction control, and the added complexity of an RPC wrapper is not warranted here.

---

## Alternatives Considered and Rejected

| Alternative | Why rejected |
|-------------|-------------|
| Supabase Edge Function triggered by DB event (trigger on `positions` row when `expiry` passes) | No Supabase DB trigger fires on date passage without a scheduler; would require pg_cron which is not enabled by default on Supabase |
| Postgres advisory lock (`pg_try_advisory_xact_lock`) to prevent double-settle | Cannot call arbitrary SQL via supabase-py without an RPC function; overhead not justified |
| Dedicated `settlements` tracking table with `status` column for idempotency | More schema; idempotency from atomic DELETE is sufficient and simpler |
| Railway cron job | Adds infrastructure dependency; rejected by BA spec requirement |
| GitHub Actions scheduled workflow calling a `/admin/settle-all` endpoint | Requires permanent service key in GitHub secrets; admin endpoint callable from outside; security concern |

---

## Consequences

**Positive:**
- Zero new infrastructure.
- Settlement work proportional to user activity.
- Idempotency trivially guaranteed by the DB row lifecycle.
- No new environment variables, no new Python packages.

**Negative / accepted trade-offs:**
- Users who never return after their positions expire will never see settled results in the UI (irrelevant if they're not using the app).
- The triggering endpoint latency increases by ~1s per expired position. Monitored via Railway request timing; an alert should be added if p95 latency on `GET /api/positions` exceeds 30s.
- Partial failure between DELETE and order-insert leaves the user's account without a settlement record for that position. Estimated probability: extremely low (server crash mid-request). Acceptable for paper trading.
- The 90-day display window on `GET /api/positions/closed` means positions settled more than 90 days after expiry (users returning after a multi-month absence) will be settled but not displayed. The orders table still records them permanently.

---

## Review

This ADR should be revisited if:
- OptionsDesk gains 10,000+ active users and lazy settlement latency becomes measurable in aggregate.
- A future feature requires settlement data to exist before the user next logs in (e.g., leaderboard recalculation, admin settlement auditing at EOD).
- Railway introduces native cron support at no additional cost that makes Option B trivial to implement.

# ADR-0009 — Separate `user_action_log` Table and Fire-and-Forget Logging Pattern

**Date:** 17Jun2026
**Status:** Accepted
**Feature:** Admin Health Monitor and User Activity Log (admin-health-activity-17Jun2026)

---

## Context

The platform has an existing `activity_log` table with the schema:

```sql
create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  log_date    date not null default current_date,
  email       text not null,
  login_count integer not null default 1,
  last_login_at timestamptz not null default now(),
  ip_address  text,
  unique(user_id, log_date)
);
```

This table uses a one-row-per-user-per-day upsert pattern: each login increments `login_count` and updates `last_login_at` for the current `log_date`. The admin currently reads this table to see "how many times did user X log in today and when was their last login".

The new User Activity Log feature requires recording granular per-event data: one row per user action (login, logout, ticker search, etc.), with a JSONB detail payload and no deduplication or aggregation. Eight action types must be captured, each with a different detail shape, across six different route files.

Two architectural decisions were required:

1. Whether to extend `activity_log` or introduce a new `user_action_log` table.
2. How to write log rows from route handlers without making logging failures visible to users.

---

## Decision 1: New Table (`user_action_log`) Rather Than Extending `activity_log`

We introduce a new `user_action_log` table and leave `activity_log` untouched.

### Alternatives considered

**Option A — Extend `activity_log` with additional columns.**
Add columns such as `action_type text`, `detail jsonb`, and drop the `UNIQUE(user_id, log_date)` constraint to allow multiple rows per user per day.

Rejected because:
- Dropping the unique constraint changes the existing upsert semantics. Any existing code path that does `INSERT ... ON CONFLICT (user_id, log_date) DO UPDATE` would break silently or require rewriting.
- The daily-aggregate meaning of `login_count` and `last_login_at` becomes incoherent when non-login rows are mixed in.
- The "Activity Log (Logins)" admin tab reads from this table and displays `login_count` — mixing granular events into the same table forces the read query to filter by `action_type = 'login'` and re-aggregate, adding complexity that didn't exist before.
- Future schema evolution of `user_action_log` (e.g., adding indexes, partitioning by month, changing retention) would be entangled with the existing login aggregation logic.

**Option B — Replace `activity_log` entirely.**
Migrate the "Activity Log (Logins)" tab to read from `user_action_log` with an aggregation query.

Rejected because:
- The existing "Activity Log (Logins)" tab is a working, tested feature that the admin relies on daily. The spec explicitly states it must remain unchanged (FR-26 / Story 10).
- A migration that drops or renames `activity_log` creates unnecessary rollback risk.
- The login-count-per-day aggregation is a materially different query pattern from the new paginated event log. Conflating them into one table serves neither query well.

**Option C — Write to both tables (chosen approach).**
Retain `activity_log` for its existing login-aggregation purpose. Introduce `user_action_log` for granular per-event recording. The `on_login` handler writes to both: the existing `user_portfolio.log_activity()` call continues to upsert `activity_log`, and a new `log_action()` call writes to `user_action_log`.

This is the decision we are recording.

### Consequences

- Two tables serve two distinct read patterns: `activity_log` (daily aggregate for the Logins tab), `user_action_log` (per-event for the User Actions tab and CSV export).
- No existing code or data is modified.
- Storage cost is additive: `user_action_log` will accumulate one row per qualifying user action. At an estimated 200 user actions per user per day across 50 active users, this is approximately 10,000 rows per day, 300,000 rows per month. A 30-day pg_cron purge limits the table to ~300,000 rows at any time. At approximately 200 bytes per row (UUID, text fields, small JSONB), steady-state storage is under 60 MB — negligible.
- No GIN index on `detail`: the query patterns (filter by `user_email` ilike, `action_type` eq, `created_at` range) are fully served by the `created_at DESC` and `user_email` indexes. A GIN index on `detail` would benefit queries like "find all events where detail->>'symbol' = 'AAPL'" but no such query is in scope. Adding GIN now would cost write performance and index storage for a benefit that is not yet required.

---

## Decision 2: Fire-and-Forget Logging Pattern via `asyncio.create_task()`

Activity log writes use a fire-and-forget pattern: the route handler dispatches the write as a background coroutine and immediately continues to its return statement. The write is never awaited. Any exception from the write is caught inside `log_action()` and logged at WARNING level; it is never re-raised.

### Rationale

The core constraint from the spec (FR-16): "A logging failure must never cause the parent request to fail or return a non-2xx response to the user."

**Option A — Synchronous write before return.**
Call `log_action()` synchronously (or with `await`) in the request handler before the `return` statement.

Rejected because:
- Any Supabase write failure (network timeout, connection pool exhausted, PostgREST error) would propagate as an exception and either reach the user as a 500 response or require every injection site to wrap the call in try/except.
- The activity log is an observability concern, not a functional concern. It must be transparent to the user's experience.
- Supabase write latency (typically 20–100 ms) would be added to every logged endpoint's response time, harming user-visible P50 latency at all eight injection points.

**Option B — Background task via FastAPI `BackgroundTasks`.**
Use `background_tasks.add_task(log_action, ...)` with FastAPI's built-in `BackgroundTasks` dependency.

Not chosen because:
- Every route function that logs would need to add `background_tasks: BackgroundTasks` as a parameter. This touches eight route functions across six files, adding noise to every function signature.
- `asyncio.create_task()` achieves the same result with less boilerplate and is idiomatic in async Python.
- `BackgroundTasks` runs after the response is sent, which is fine, but the added parameter noise is a maintenance cost without benefit.

**Option C — Dedicated logging queue / worker (e.g., in-process asyncio queue with a consumer task).**
Rejected as overengineering. The write volume is low (one row per user action). No buffering, batching, or retry logic is specified. A simple `asyncio.create_task()` is the smallest mechanism that satisfies the requirement.

**Chosen: `asyncio.create_task()` inside `async def` route handlers.**

- `log_action()` is an `async` function in `backend/services/activity_logger.py`. It runs the Supabase insert (via a sync client called in a thread via `run_in_executor` if needed, or directly as the supabase-py calls are fast enough for fire-and-forget purposes) and swallows all exceptions.
- `asyncio.create_task(log_action(...))` schedules the coroutine on the running event loop without awaiting it. The route handler returns immediately after creating the task.
- If the FastAPI process shuts down with in-flight tasks, those tasks are cancelled. This is acceptable: log rows may be dropped during graceful shutdown. No retry mechanism is specified.
- Sync route handlers (those defined with `def` rather than `async def`) that need logging are converted to `async def`. This is a safe mechanical change — FastAPI handles both.

### Consequences

- Activity log writes are best-effort. Under Supabase unavailability, log rows are silently dropped. This is explicitly acceptable per FR-16.
- Operators must not rely on `user_action_log` completeness during Supabase outage periods. The table reflects "what we were able to record", not a guaranteed audit trail.
- The WARNING log in `log_action()` means Railway's log stream will surface write failures, giving the operator visibility without affecting users.
- No retry mechanism means a transient Supabase hiccup can cause a gap in the log. This is acceptable for operational visibility; it would not be acceptable for compliance or billing audit (which use different, stronger logging mechanisms).

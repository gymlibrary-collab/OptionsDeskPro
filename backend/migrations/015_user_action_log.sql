-- Migration 015: user_action_log table for granular per-action event recording
-- Separate from activity_log (daily login aggregates) — see ADR-0009

create table if not exists public.user_action_log (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  user_email   text        not null,
  action_type  text        not null check (
                 action_type in (
                   'login',
                   'logout',
                   'ticker_search',
                   'strategy_scan',
                   'options_chain_view',
                   'paper_trade_placed',
                   'watchlist_update',
                   'ai_query'
                 )
               ),
  detail       jsonb,
  ip_address   text,
  created_at   timestamptz not null default now()
);

-- Primary query pattern: newest-first filtered by email and/or action_type
create index user_action_log_created_at_idx
  on public.user_action_log (created_at desc);

create index user_action_log_user_email_idx
  on public.user_action_log (user_email);

-- No GIN index on detail: the query patterns (email, action_type, date range)
-- are fully served by the two indexes above. GIN on detail deferred until
-- a query-by-detail-field use case is demonstrated. See ADR-0009.

-- RLS: service role only (admin reads go through the service key on the backend)
alter table public.user_action_log enable row level security;

-- No user-facing RLS policy — regular users never read this table directly.
-- The service role key (used by the backend) bypasses RLS automatically.

-- 30-day rolling purge via pg_cron (requires pg_cron extension enabled in Supabase)
-- Schedule: 3:00 AM UTC daily. Deletes rows older than 30 days.
-- To enable: Dashboard → Database → Extensions → pg_cron → Enable
-- Wrapped in DO block so a missing pg_cron extension raises a WARNING rather
-- than failing the migration and rolling back the table creation (security finding F3).
do $$
begin
  perform cron.schedule(
    'purge-user-action-log-30d',
    '0 3 * * *',
    $cron$
      delete from public.user_action_log
      where created_at < now() - interval '30 days';
    $cron$
  );
exception when others then
  raise warning 'pg_cron not available — user_action_log 30-day purge job not scheduled. '
                'Enable pg_cron in Supabase Dashboard → Database → Extensions and re-run this statement manually.';
end $$;

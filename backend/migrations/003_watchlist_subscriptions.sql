-- Migration 003: Watchlist + Subscription Tiers
-- Run in Supabase → SQL Editor → New Query

-- 1. Add subscription_tier to user_profiles
alter table public.user_profiles
  add column if not exists subscription_tier text not null default 'free'
  check (subscription_tier in ('free', 'starter', 'pro', 'enterprise'));

-- Admin gets enterprise tier
update public.user_profiles
  set subscription_tier = 'enterprise'
  where email = 'leonard.simgt@gmail.com';

-- 2. User watchlists — persisted per-user symbol list
create table if not exists public.user_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, symbol)
);
alter table public.user_watchlists enable row level security;
create policy "users_own_watchlist" on public.user_watchlists
  for all using (auth.uid() = user_id);
create index if not exists idx_watchlist_user on public.user_watchlists(user_id, position);

-- 3. Monthly scan usage tracking
create table if not exists public.scan_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  month text not null,     -- 'YYYY-MM'
  scans_used integer not null default 0,
  last_scan_at timestamptz not null default now(),
  unique(user_id, month)
);
alter table public.scan_usage enable row level security;
create policy "users_own_scan_usage" on public.scan_usage
  for all using (auth.uid() = user_id);
create index if not exists idx_scan_usage_user_month on public.scan_usage(user_id, month);

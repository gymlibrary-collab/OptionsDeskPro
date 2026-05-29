-- OptionsDesk Database Schema
-- Run this entire file in Supabase → SQL Editor → New Query

-- 1. User profiles (extends Supabase auth.users)
create table if not exists public.user_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'user', -- 'user' | 'admin'
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table public.user_profiles enable row level security;
-- Users can read their own profile; service role can do everything
create policy "users_read_own" on public.user_profiles for select using (auth.uid() = id);
create policy "service_all" on public.user_profiles using (true) with check (true); -- service role bypasses RLS

-- 2. Whitelist — admin controls who can access
create table if not exists public.user_whitelist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  added_by uuid references auth.users(id),
  added_at timestamptz not null default now(),
  note text
);
alter table public.user_whitelist enable row level security;

-- 3. Portfolios — one per user, paper trading balance
create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  cash numeric(15,2) not null default 100000.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.portfolios enable row level security;
create policy "users_own_portfolio" on public.portfolios for all using (auth.uid() = user_id);

-- 4. Orders — paper trade history per user
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  expiry date not null,
  strike numeric(10,2) not null,
  option_type text not null check (option_type in ('call','put')),
  action text not null check (action in ('buy','sell')),
  quantity integer not null,
  price numeric(10,4) not null,
  status text not null default 'filled',
  alpaca_id text,
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create policy "users_own_orders" on public.orders for all using (auth.uid() = user_id);
create index on public.orders(user_id, created_at desc);

-- 5. Positions — current open positions per user
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  expiry date not null,
  strike numeric(10,2) not null,
  option_type text not null check (option_type in ('call','put')),
  quantity integer not null,
  avg_cost numeric(10,4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, symbol, expiry, strike, option_type)
);
alter table public.positions enable row level security;
create policy "users_own_positions" on public.positions for all using (auth.uid() = user_id);

-- 6. P&L snapshots — daily portfolio value per user
create table if not exists public.pnl_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  snapshot_date date not null default current_date,
  portfolio_value numeric(15,2) not null,
  cash numeric(15,2) not null,
  positions_value numeric(15,2) not null,
  total_pnl numeric(15,2) not null,
  created_at timestamptz not null default now(),
  unique(user_id, snapshot_date)
);
alter table public.pnl_snapshots enable row level security;
create policy "users_own_snapshots" on public.pnl_snapshots for all using (auth.uid() = user_id);

-- 7. Activity log — one record per user per day (upsert overwrites)
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  log_date date not null default current_date,
  email text not null,
  login_count integer not null default 1,
  last_login_at timestamptz not null default now(),
  ip_address text,
  unique(user_id, log_date)
);
alter table public.activity_log enable row level security;

-- Seed admin whitelist
insert into public.user_whitelist (email, note)
values ('leonard.simgt@gmail.com', 'Admin account')
on conflict (email) do nothing;

# OptionsDesk — Setup Guide

This document covers everything needed to rebuild and deploy OptionsDesk from scratch.

---

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- A Supabase account (free tier works)
- A Google Cloud project (for OAuth)
- A Railway account (for hosting) — or any platform that can run Python + Node
- (Optional) A [Market Data App](https://www.marketdata.app/) account for real options data

---

## Step 1: Supabase project

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (keep secret — backend only)
   - `anon` / `public` key → `VITE_SUPABASE_ANON_KEY` (frontend)

### 1a. Run the database migrations

1. Open **SQL Editor → New query** in your Supabase dashboard
2. Paste and run each migration in order:
   1. `backend/migrations/001_initial_schema.sql`
   2. `backend/migrations/002_whitelist_role.sql`
   3. `backend/migrations/003_position_strategy_link.sql`
   4. `backend/migrations/003_watchlist_subscriptions.sql`

> If you're starting fresh, the combined schema at the bottom of this file works too,
> but you'll still need to run the individual migration files for any incremental updates.

---

## Step 2: Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorised redirect URIs:
   - `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
4. Copy **Client ID** and **Client Secret**
5. In Supabase: **Authentication → Providers → Google**, paste both values and enable

---

## Step 3: Backend deployment (Railway)

1. Create a new Railway project and add a service pointing to the `backend/` folder
2. Set the start command:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
3. Add these environment variables in Railway:
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_KEY=<service_role key from step 1>
   ```
   > **Do NOT add `SUPABASE_JWT_SECRET`** — JWT verification is done via the Supabase Auth API, not python-jose.

4. (Optional) Add the Market Data App token for real options data:
   ```
   MARKETDATA_API_TOKEN=<your token from marketdata.app dashboard>
   ```
   Without this, the app falls back to yfinance automatically. If you see HTTP 429 from the first
   request, check that the token is correct and that your daily quota hasn't been exhausted.

5. Note the backend URL Railway assigns (e.g. `https://options-backend-production-xxxx.up.railway.app`)

---

## Step 4: Frontend configuration

1. Open `frontend/src/api/client.ts` and update `BACKEND_URL` to your Railway backend URL
2. Open `backend/main.py` and add your frontend domain to `allow_origins` in the CORS config
3. Add environment variables for the frontend build (Railway → frontend service, or a `.env` file):
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key from step 1>
   ```

---

## Step 5: Frontend deployment (Railway)

1. Add a second Railway service pointing to the `frontend/` folder
2. Build command: `npm install && npm run build`
3. Publish directory: `dist`
4. Add the two `VITE_*` environment variables from step 4

---

## Step 6: Admin account

The admin email is hardcoded in two places — update both before deploying:

- `backend/services/auth_utils.py` → `ADMIN_EMAIL = "your@gmail.com"`
- `frontend/src/context/AuthContext.tsx` → `const ADMIN_EMAIL = 'your@gmail.com'`

The admin bypasses the whitelist check and is always allowed to log in.
To seed your email into the whitelist as well (so the role shows correctly):

```sql
INSERT INTO public.user_whitelist (email, role, note)
VALUES ('your@gmail.com', 'admin', 'Admin account')
ON CONFLICT (email) DO NOTHING;
```

---

## Step 7: Local development

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Create a .env file (never commit this):
echo "SUPABASE_URL=https://..." > .env
echo "SUPABASE_SERVICE_KEY=..." >> .env
echo "MARKETDATA_API_TOKEN=..." >> .env   # optional

uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install

# Create frontend/.env.local (never commit this):
echo "VITE_SUPABASE_URL=https://..." > .env.local
echo "VITE_SUPABASE_ANON_KEY=..." >> .env.local

npm run dev   # opens http://localhost:5173
```

The frontend dev server proxies nothing — it hits the backend directly via the
hardcoded `BACKEND_URL` in `api/client.ts`. For local dev, change that to
`http://localhost:8000` temporarily (or use a `.env` override).

---

## Complete database schema

Run this entire block in Supabase SQL Editor to create everything from scratch:

```sql
-- 1. User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  subscription_tier text NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'starter', 'pro', 'enterprise')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own" ON public.user_profiles FOR SELECT USING (auth.uid() = id);

-- 2. Whitelist — controls who can log in
CREATE TABLE IF NOT EXISTS public.user_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  added_by uuid REFERENCES auth.users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  note text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))
);
ALTER TABLE public.user_whitelist ENABLE ROW LEVEL SECURITY;

-- 3. Portfolios — paper trading balance
CREATE TABLE IF NOT EXISTS public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  cash numeric(15,2) NOT NULL DEFAULT 100000.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_portfolio" ON public.portfolios FOR ALL USING (auth.uid() = user_id);

-- 4. Orders — paper trade history
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  expiry date NOT NULL,
  strike numeric(10,2) NOT NULL,
  option_type text NOT NULL CHECK (option_type IN ('call','put')),
  action text NOT NULL CHECK (action IN ('buy','sell')),
  quantity integer NOT NULL,
  price numeric(10,4) NOT NULL,
  status text NOT NULL DEFAULT 'filled',
  strategy_key text,
  strategy_name text,
  profit_target_pct numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_orders" ON public.orders FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS orders_user_created ON public.orders(user_id, created_at DESC);

-- 5. Positions — open positions
CREATE TABLE IF NOT EXISTS public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  expiry date NOT NULL,
  strike numeric(10,2) NOT NULL,
  option_type text NOT NULL CHECK (option_type IN ('call','put')),
  quantity integer NOT NULL,
  avg_cost numeric(10,4) NOT NULL,
  strategy_key text,
  strategy_name text,
  profit_target_pct numeric(6,2),
  entry_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol, expiry, strike, option_type)
);
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_positions" ON public.positions FOR ALL USING (auth.uid() = user_id);

-- 6. P&L snapshots — daily portfolio value history
CREATE TABLE IF NOT EXISTS public.pnl_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  snapshot_date date NOT NULL DEFAULT current_date,
  portfolio_value numeric(15,2) NOT NULL,
  cash numeric(15,2) NOT NULL,
  positions_value numeric(15,2) NOT NULL,
  total_pnl numeric(15,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);
ALTER TABLE public.pnl_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_snapshots" ON public.pnl_snapshots FOR ALL USING (auth.uid() = user_id);

-- 7. Activity log — one row per user per day
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date date NOT NULL DEFAULT current_date,
  email text NOT NULL,
  login_count integer NOT NULL DEFAULT 1,
  last_login_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  UNIQUE(user_id, log_date)
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- 8. User watchlists — persisted watchlist per user
CREATE TABLE IF NOT EXISTS public.user_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  symbols text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_watchlist" ON public.user_watchlists FOR ALL USING (auth.uid() = user_id);

-- 9. Scan usage — monthly scan counter
CREATE TABLE IF NOT EXISTS public.scan_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month text NOT NULL,  -- YYYY-MM
  scan_count integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, month)
);
ALTER TABLE public.scan_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_scan_usage" ON public.scan_usage FOR ALL USING (auth.uid() = user_id);

-- Seed admin into whitelist (replace email with your own)
INSERT INTO public.user_whitelist (email, role, note)
VALUES ('leonard.simgt@gmail.com', 'admin', 'Admin account')
ON CONFLICT (email) DO NOTHING;
```

---

## Environment variables reference

### Backend (Railway)
| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Yes | Service role key (bypasses RLS) |
| `MARKETDATA_API_TOKEN` | No | From marketdata.app dashboard; omit to use yfinance only |

### Frontend (Railway / build)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Same Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key |

---

## Hardcoded values to update

If you're cloning this for a different deployment, find and replace these:

| File | Value | What it controls |
|------|-------|------------------|
| `backend/services/auth_utils.py` | `leonard.simgt@gmail.com` | Admin bypass — always allowed |
| `frontend/src/context/AuthContext.tsx` | `leonard.simgt@gmail.com` | Frontend isAdmin flag |
| `frontend/src/api/client.ts` | `options-backend-production-28c6.up.railway.app` | Backend URL |
| `backend/main.py` (CORS) | `options-frontend-production.up.railway.app` | Allowed frontend origin |

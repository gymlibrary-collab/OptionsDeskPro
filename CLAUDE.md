# OptionsDesk — AI Assistant Reference

## What this app is

OptionsDesk is a paper-trading options dashboard with AI-driven strategy recommendations.
Users sign in with Google, pick a ticker, and get a plain-English breakdown of which
options strategy fits the current market (IV environment + directional bias), with
earnings awareness, news sentiment, options flow, and technical context woven in.

## Repository layout

```
options/
├── backend/                  FastAPI Python service
│   ├── main.py               App entry point; registers all routers
│   ├── requirements.txt
│   ├── routes/
│   │   ├── options.py        /api/options/* — quotes, chain, greeks
│   │   ├── orders.py         /api/orders — place/list paper trades
│   │   ├── positions.py      /api/positions — open positions, snapshot
│   │   ├── strategies.py     /api/strategies — IV analysis, bias, scanner
│   │   ├── auth_routes.py    /api/auth — login, me, pnl-history
│   │   └── admin_routes.py   /api/admin — user list, whitelist, stats
│   ├── services/
│   │   ├── auth_utils.py     JWT verify (via Supabase Auth API), admin check
│   │   ├── db.py             Supabase client factory
│   │   ├── market_data.py    yfinance wrappers for quotes + chains
│   │   ├── iv_analysis.py    IV rank, HV, environment classification
│   │   ├── greeks.py         Black-Scholes greeks
│   │   ├── strategy_engine.py 19-strategy catalog, fit scoring, strike selection
│   │   ├── interpreter.py    Plain-English narrative generator (7 sections)
│   │   ├── market_context.py Earnings, news, flow, IV term structure, MACD/ATR
│   │   ├── portfolio.py      Portfolio value, P&L calc
│   │   ├── user_portfolio.py Ensure portfolio exists, activity log upsert
│   │   └── alpaca_broker.py  Optional Alpaca paper-broker integration (unused)
│   └── migrations/
│       ├── 001_initial_schema.sql   Full DB schema (run first)
│       └── 002_whitelist_role.sql   Adds role column to user_whitelist
├── frontend/                 React + TypeScript + Vite
│   └── src/
│       ├── App.tsx           Root layout, tab routing, mobile drawer
│       ├── api/client.ts     Axios client, all typed API calls
│       ├── context/AuthContext.tsx  Supabase auth state, isAdmin flag
│       ├── lib/supabase.ts   Supabase JS client init
│       ├── hooks/useWindowSize.ts  isMobile/isTablet breakpoints
│       └── components/
│           ├── LoginPage.tsx
│           ├── QuoteBar.tsx         Live quote strip in header
│           ├── OptionsChain.tsx     Calls/puts table, expiry picker
│           ├── StrategyScanner.tsx  Watchlist scanner, deep-analysis flow
│           ├── StrategyDetail.tsx   Per-strategy card (legs, metrics)
│           ├── StrategyNarrative.tsx  7-section narrative accordion
│           ├── OrderEntry.tsx       Paper trade form (sidebar/drawer)
│           ├── Orders.tsx           Order history table
│           ├── Positions.tsx        Open positions + portfolio summary
│           ├── PnLChart.tsx         90-day portfolio value chart
│           ├── AdminPanel.tsx       User mgmt, whitelist, stats, leaderboard
│           └── UserGuide.tsx        In-app help (role-aware sections)
├── migrations/
│   └── add_whitelist_role.sql  (legacy copy — prefer backend/migrations/)
├── CLAUDE.md       ← this file
├── ARCHITECTURE.md
├── SETUP.md
└── README.md
```

## Dev commands

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

### Frontend
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ for production
```
Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Deployment

Both services run on **Railway**:
- Backend service: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
- Frontend service: build command `npm run build`, publish dir `dist`
- Backend URL is hardcoded in `frontend/src/api/client.ts` — update if re-deploying

CORS origins are hardcoded in `backend/main.py`. Add new frontend domains there.

## Auth architecture

1. Frontend: Supabase JS `signInWithOAuth({ provider: 'google' })`
2. On auth state change, frontend calls `POST /api/auth/login` with the session JWT
3. Backend verifies via `sb.auth.get_user(token)` — **not** python-jose (algorithm-agnostic)
4. Login endpoint checks `user_whitelist` table; rejects if email not present
5. Admin email (`leonard.simgt@gmail.com`) bypasses whitelist check always
6. `user_profiles` row is upserted; role comes from `user_whitelist.role`

## Admin check

`require_admin()` in `auth_utils.py` accepts the user if **any** of:
- email == `ADMIN_EMAIL` (hardcoded)
- `user_metadata.role == 'admin'` or `app_metadata.role == 'admin'`
- `user_profiles.role == 'admin'` in DB

## Key invariants

- `SUPABASE_JWT_SECRET` is **not** needed — do not add it back; it caused alg errors
- Strategy engine uses **yfinance** for all market data (no paid data feed)
- Paper trades are stored in Supabase; they do **not** hit a real broker
- `alpaca_broker.py` exists but the Alpaca integration is not wired to order flow
- IV rank is computed from 52-week high/low historical volatility (no external feed)

## Common mistakes to avoid

- Do not switch JWT verification back to `python-jose` — it breaks with newer Supabase RS256 tokens
- Do not call `get_supabase()` at module level — always inside a function (avoids import-time env var issues)
- `user_whitelist` must have a `role` column (see migration 002); the initial schema omits it
- After pushing files via GitHub MCP API, always sync local: `git fetch origin main && git reset --hard origin/main`

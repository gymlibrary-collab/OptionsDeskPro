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
│   │   ├── orders.py         /api/orders, /api/trades/record — place/list paper trades
│   │   ├── positions.py      /api/positions, /api/portfolio, /api/positions/snapshot
│   │   ├── strategies.py     /api/strategies — IV analysis, bias, scanner
│   │   ├── watchlist.py      /api/watchlist — GET/PUT persisted watchlist + tier limits
│   │   ├── trading_routes.py /api/trading/buzz/* — Reddit sentiment feeds
│   │   ├── auth_routes.py    /api/auth — login, me, pnl-history
│   │   └── admin_routes.py   /api/admin — user list, whitelist, stats
│   ├── services/
│   │   ├── auth_utils.py     JWT verify (via Supabase Auth API), admin check
│   │   ├── db.py             Supabase client factory
│   │   ├── market_data.py    Options chain: Market Data App (primary) → yfinance fallback → synthetic BS
│   │   ├── iv_analysis.py    IV rank, HV, environment classification
│   │   ├── greeks.py         Black-Scholes greeks
│   │   ├── strategy_engine.py 31-strategy catalog, fit scoring, strike selection
│   │   ├── interpreter.py    Plain-English narrative generator (7 sections)
│   │   ├── market_context.py Earnings, news, flow, IV term structure, MACD/ATR
│   │   ├── portfolio.py      Portfolio value, P&L calc
│   │   ├── user_portfolio.py Ensure portfolio exists, activity log upsert
│   │   ├── tier_limits.py    Subscription tier config (free/starter/pro/enterprise)
│   │   └── reddit.py         Reddit PRAW client for buzz feeds
│   └── migrations/
│       ├── 001_initial_schema.sql        Full DB schema (run first)
│       ├── 002_whitelist_role.sql        Adds role column to user_whitelist
│       ├── 003_position_strategy_link.sql Adds strategy columns to positions/orders
│       └── 003_watchlist_subscriptions.sql Adds subscription_tier, user_watchlists, scan_usage
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
│           ├── TradePanel.tsx       Trade structure display + order entry
│           ├── TradingDesk.tsx      Reddit buzz feeds + trading intelligence
│           ├── OrderEntry.tsx       Paper trade form (sidebar/drawer)
│           ├── Orders.tsx           Order history table
│           ├── Positions.tsx        Open positions + portfolio summary
│           ├── RiskMonitor.tsx      Per-position risk signals and alerts
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
Optional env var: `MARKETDATA_API_TOKEN` (from api.marketdata.app — omit to use yfinance only)

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
5. Admin email (`leonardsim.sm@gmail.com`) bypasses whitelist check always
6. `user_profiles` row is upserted; role comes from `user_whitelist.role`

## Admin check

`require_admin()` in `auth_utils.py` accepts the user if **any** of:
- email == `ADMIN_EMAIL` (hardcoded)
- `user_metadata.role == 'admin'` or `app_metadata.role == 'admin'`
- `user_profiles.role == 'admin'` in DB

## Market data

`market_data.py` uses a 3-tier fallback:

1. **Market Data App** (`MARKETDATA_API_TOKEN` set) — full greeks, real OPRA data, 5-min cache
2. **yfinance** — free fallback, 30-sec cache; volume/openInterest NaN-safe via `_safe_int()`
3. **Synthetic Black-Scholes chain** — last resort when both above fail; flagged `_synthetic=True`

The `MARKETDATA_API_TOKEN` is a backend-only variable — never expose it to the frontend.
Cache TTL is source-aware: 300 s for marketdata, 30 s for yfinance.

## Key invariants

- `SUPABASE_JWT_SECRET` is **not** needed — do not add it back; it caused alg errors
- Alpaca integration was removed — do not re-add `alpaca-py` or `alpaca_broker.py`
- Paper trades are stored in Supabase; they do **not** hit a real broker
- IV rank is computed from 52-week high/low historical volatility (no external feed)
- `MARKETDATA_API_TOKEN` is backend-only; a 429 on the first request usually means the token is wrong or the free-plan daily quota (100 credits) is exhausted

## Common mistakes to avoid

- Do not switch JWT verification back to `python-jose` — it breaks with newer Supabase RS256 tokens
- Do not call `get_supabase()` at module level — always inside a function (avoids import-time env var issues)
- `user_whitelist` must have a `role` column (see migration 002); the initial schema omits it
- After pushing files via GitHub MCP API, always sync local: `git fetch origin main && git reset --hard origin/main`
- Do not cast yfinance volume/openInterest directly to `int()` — yfinance returns NaN for some contracts; use `_safe_int()` from `market_data.py`

---

## SDLC — Gated Feature Workflow

All new features follow a six-gate sequence. Every gate requires explicit approval before the next agent runs. Say **approve** to advance, or give feedback to request changes.

### Gate sequence

```
Gate 1  BA Spec         business-analyst    →  docs/FeatureRequests/<feature>-<ddMMMyyyy>/01-spec.md
Gate 2  Architecture    solution-architect  →  docs/FeatureRequests/<feature>-<ddMMMyyyy>/02-design.md
Gate 3  Implementation  frontend-developer
                        backend-developer   →  code diff (branch/PR)
Gate 4  Test            qa-engineer         →  docs/FeatureRequests/<feature>-<ddMMMyyyy>/04-test-report.md
                        tester
Gate 5  Security        security-reviewer   →  docs/FeatureRequests/<feature>-<ddMMMyyyy>/05-security-review.md
Gate 6  Release         operator            →  docs/FeatureRequests/<feature>-<ddMMMyyyy>/06-release-note.md
                        technical-writer
                        devops-engineer
```

All approvals are recorded in `docs/FeatureRequests/<feature>-<ddMMMyyyy>/03-approvals.md`.

### How to start a feature

Describe the feature in plain English. The `business-analyst` agent will run automatically, explore the codebase, and write the spec. You only need to approve or give feedback at each gate — you do not need to know which agent runs next.

### Agent roster

| Agent | Model | Tools | Role |
|-------|-------|-------|------|
| `business-analyst` | sonnet | full | Requirements, user stories, acceptance criteria |
| `product-owner` | sonnet | full | Prioritisation, MVP boundary, tier gate validation |
| `solution-architect` | sonnet | full | Technical design, API contracts, migrations, ADRs |
| `frontend-developer` | sonnet | full | React components, TypeScript, API client |
| `backend-developer` | sonnet | full | FastAPI routes, services, migrations |
| `qa-engineer` | sonnet | full | Playwright automated tests |
| `tester` | sonnet | read-only | Manual / exploratory test plan |
| `security-reviewer` | sonnet | read-only | Security audit, invariant checklist |
| `devops-engineer` | sonnet | full | CI/CD, Railway deployment, GitHub Actions |
| `operator` | sonnet | read-only | Production health, incident diagnosis |
| `technical-writer` | haiku | full | Release notes, User Guide updates |
| `e2e-test-engineer` | sonnet | full | Playwright suite maintenance |

### Playwright E2E tests

- Test files: `frontend/e2e/pages/`
- Auth bypass fixture: `frontend/e2e/fixtures/auth.ts` — never uses real Google OAuth
- Mock data: `frontend/e2e/mock-data.ts`
- Config: `frontend/playwright.config.ts`
- Run locally: `cd frontend && npx playwright test`
- Nightly CI: `.github/workflows/e2e-nightly.yml` — 1am UTC; also has `workflow_dispatch` for manual runs
- HTML report uploaded as a CI artifact on every run

### Feature request documents

All feature documentation lives in `docs/FeatureRequests/<feature-slug>-<ddMMMyyyy>/`:

```
01-spec.md            Requirements, user stories, acceptance criteria
02-design.md          Technical design, API contracts, schema, caching
03-approvals.md       Gate-by-gate approval log
04-test-report.md     Automated + manual test results
05-security-review.md Security findings and gate decision
06-release-note.md    Release notes, deployment steps, rollback procedure
```

Templates are in `docs/FeatureRequests/_template/`.
Architecture Decision Records go in `docs/adr/NNNN-<title>.md`.
Operational incident reports go in `docs/ops/YYYY-MM-DD-<title>.md`.

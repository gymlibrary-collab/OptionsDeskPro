# OptionsDesk — Architecture

## System overview

```
Browser (React/Vite)
      │
      │  HTTPS  (Supabase JS SDK for auth; Axios for all other calls)
      ▼
Supabase Auth  ──────────────────────────────────────────┐
      │  Google OAuth redirect                           │
      │  Issues JWT (access_token)                       │
      ▼                                                  │
FastAPI Backend (Railway)                                │
      │  Verifies JWT via sb.auth.get_user(token)        │
      │  All business logic here                         ▼
      │                                         Supabase Postgres
      │  All reads/writes via supabase-py               (RLS on all tables)
      ▼
 yfinance (PyPI)  ←  real-time market data, options chains, news, earnings
```

## Backend routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | none | Liveness check |
| GET | `/api/options/quote/{symbol}` | JWT | Live quote |
| GET | `/api/options/chain/{symbol}` | JWT | Options chain with greeks |
| POST | `/api/orders` | JWT | Place paper trade |
| GET | `/api/orders` | JWT | Order history |
| GET | `/api/positions` | JWT | Open positions with live P&L |
| GET | `/api/portfolio` | JWT | Cash + positions value |
| POST | `/api/positions/snapshot` | JWT | Save daily P&L snapshot |
| GET | `/api/strategies/analyze/{symbol}` | JWT | Full AI analysis |
| GET | `/api/strategies/scan` | JWT | Multi-symbol scanner |
| POST | `/api/auth/login` | JWT | Whitelist check + profile upsert |
| GET | `/api/auth/me` | JWT | Current user profile |
| GET | `/api/auth/pnl-history` | JWT | 90-day P&L chart data |
| GET | `/api/admin/users` | Admin | All user profiles |
| POST | `/api/admin/users/invite` | Admin | Add user to whitelist |
| PATCH | `/api/admin/users/{id}/role` | Admin | Change user role |
| GET | `/api/admin/whitelist` | Admin | Whitelist entries |
| POST | `/api/admin/whitelist` | Admin | Add email to whitelist |
| DELETE | `/api/admin/whitelist/{email}` | Admin | Remove from whitelist |
| PATCH | `/api/admin/users/{id}/deactivate` | Admin | Soft-deactivate user |
| GET | `/api/admin/activity` | Admin | Today's login log |
| GET | `/api/admin/stats` | Admin | Aggregate stats + leaderboard |

## Strategy analysis pipeline

```
GET /api/strategies/analyze/{symbol}
          │
          ├─ 1. Fetch options chain (yfinance)
          │
          ├─ 2. IV Analysis (iv_analysis.py)
          │      current_iv (median ATM IV)
          │      iv_rank (current vs 52wk HV range)
          │      iv_environment: LOW | MEDIUM | HIGH
          │
          ├─ 3. Bias Analysis (market_data.py)
          │      SMA-20, SMA-50, RSI-14 from price history
          │      bias: BULLISH | BEARISH | NEUTRAL
          │      strength: STRONG | MODERATE | WEAK
          │
          ├─ 4. Market Context (market_context.py) — enriches narrative
          │      earnings: next date, days until, earnings_soon flag
          │      news: up to 6 recent headlines + publisher
          │      technicals: MACD (12/26/9), ATR-14, volume trend (5d/20d)
          │      term_structure: front vs back IV, contango/backwardation, put skew
          │      flow: put/call ratio, unusual volume strikes, flow_bias
          │
          ├─ 5. Strategy Scoring (strategy_engine.py)
          │      19-strategy catalog, each with direction + IV environment tags
          │      Fit score: IV match (40%) + direction match (40%) + DTE bonus (20%)
          │      Top 3 strategies selected
          │
          ├─ 6. Strike Selection (strategy_engine.py)
          │      Matches target deltas to live chain contracts
          │      Computes max profit, max loss, breakeven(s), PoP estimate
          │
          └─ 7. Narrative Generation (interpreter.py)
                 7 plain-English sections per strategy:
                 headline, market_snapshot, iv_context,
                 why_this_strategy, trade_plain_english,
                 profit_scenario, loss_scenario +
                 defensive_tactic, execution_checklist, confirmation_summary
                 All sections receive market_context for richer paragraphs.
```

## Frontend tab layout

```
Header: OptionsDesk logo | Symbol search | QuoteBar | User avatar | Sign Out
──────────────────────────────────────────────────────────────────────────────
Tabs:  Chain | P&L | Orders | Scanner | Guide | Admin (admin only)
──────────────────────────────────────────────────────────────────────────────
Main content area                          │  Sidebar (desktop only)
                                           │  OrderEntry panel
  Chain tab:   OptionsChain component      │  (hidden on admin/guide tabs)
  P&L tab:     Positions + PnLChart        │
  Orders tab:  Orders table                │
  Scanner tab: StrategyScanner             │
               → deep analysis opens       │
                 StrategyDetail +          │
                 StrategyNarrative         │
  Guide tab:   UserGuide                   │
  Admin tab:   AdminPanel                  │
──────────────────────────────────────────────────────────────────────────────
Mobile: FAB "Place Order" button → bottom drawer (OrderEntry)
```

## Database schema (Supabase Postgres)

See `backend/migrations/001_initial_schema.sql` for full DDL.

### Tables

**`user_profiles`** — extends `auth.users`
- `id` uuid PK → auth.users
- `email`, `full_name`, `avatar_url`
- `role` text ('user' | 'admin'), default 'user'
- `is_active` bool, `created_at`, `last_seen_at`

**`user_whitelist`** — controls who can log in
- `email` text unique
- `role` text ('user' | 'admin'), default 'user'
- `added_by` uuid → auth.users
- `note` text

**`portfolios`** — one per user, paper balance
- `user_id` uuid unique
- `cash` numeric(15,2) default 100,000.00

**`orders`** — paper trade history
- `user_id`, `symbol`, `expiry` date, `strike`, `option_type`, `action`
- `quantity` int, `price` numeric, `status` ('filled'), `alpaca_id`

**`positions`** — current open positions
- Unique on `(user_id, symbol, expiry, strike, option_type)`
- `quantity` can be negative (short positions)
- `avg_cost` tracked for P&L

**`pnl_snapshots`** — daily portfolio value
- Unique on `(user_id, snapshot_date)`
- `portfolio_value`, `cash`, `positions_value`, `total_pnl`
- Snapshot triggered when user opens Positions tab

**`activity_log`** — one row per user per calendar day
- Unique on `(user_id, log_date)`
- Upserted on login; tracks `login_count` and `last_login_at`

### RLS policies

All tables have RLS enabled. Users can only see/modify their own rows.
The backend connects with the **service role key** which bypasses RLS —
this is intentional so the backend can update any user's data.

## Authentication flow (detailed)

```
1. User clicks "Sign in with Google"
   └─ supabase.auth.signInWithOAuth({ provider: 'google' })
      Redirects to Google → back to app with session in URL hash

2. Supabase JS detects auth state change
   └─ onAuthStateChange fires with session
      Frontend sets Authorization header on Axios client

3. Frontend calls POST /api/auth/login (JWT in header)
   └─ backend: sb.auth.get_user(token)  ← validates with Supabase
      - If email == ADMIN_EMAIL: proceed
      - Else: check user_whitelist; 403 if absent
      - Determine role from whitelist.role
      - Upsert user_profiles row
      - ensure_portfolio() — creates portfolios row if missing
      - log_activity() — upserts activity_log for today

4. Frontend calls GET /api/auth/me
   └─ returns user_profiles row → stored as profile in AuthContext

5. isAdmin = email == ADMIN_EMAIL || profile.role == 'admin'
```

## Market context enrichment

`market_context.py` is called in `strategies.py` after fetching the chain:

```python
market_ctx = get_full_market_context(symbol, enriched_chain)
narrative = generate_narrative(strategy, trade, iv_analysis, bias, market_context=market_ctx)
```

The `market_ctx` dict contains five sub-dicts:
- `earnings` — next earnings date, days_until, earnings_soon (≤21 days)
- `news` — list of {title, publisher} from yfinance
- `technicals` — MACD, macd_bias, macd_diverging, ATR, atr_pct, volume_trend
- `term_structure` — front/back IV, term_slope, put_skew, skew_label
- `flow` — call/put volume, PCR, unusual strikes, flow_bias

The interpreter weaves these into plain English paragraphs in each of the 7 narrative sections.

## Responsive design

- `useWindowSize` hook exports `isMobile` (< 768px) and `isTablet` (< 1024px)
- Desktop: sidebar OrderEntry always visible; tabs have full labels
- Tablet: sidebar visible but user email hidden in header
- Mobile: tabs show short labels; OrderEntry lives in a bottom drawer with FAB button

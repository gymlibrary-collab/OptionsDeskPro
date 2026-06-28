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
Market Data (2-tier fallback)
  1. yfinance (PyPI)     ← primary (30-sec cache)
  2. Synthetic BS chain  ← last resort (Black-Scholes, flagged _synthetic=True)
```

## Backend routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | none | Liveness check |
| GET | `/api/options/quote/{symbol}` | JWT | Live quote |
| GET | `/api/options/chain/{symbol}` | JWT | Options chain with greeks |
| POST | `/api/orders` | JWT | Place paper trade |
| GET | `/api/orders` | JWT | Order history |
| POST | `/api/trades/record` | JWT | Record a real trade for monitoring |
| GET | `/api/positions` | JWT | Open positions with live P&L |
| GET | `/api/positions/risk` | JWT | Risk Monitor data: positions grouped by strategy with group risk levels and entry dates |
| GET | `/api/portfolio` | JWT | Cash + positions value |
| POST | `/api/positions/snapshot` | JWT | Save daily P&L snapshot |
| GET | `/api/watchlist` | JWT | Get saved watchlist + tier info |
| PUT | `/api/watchlist` | JWT | Save watchlist (enforces tier symbol limit) |
| GET | `/api/strategies/analyze/{symbol}` | JWT | Full AI analysis |
| GET | `/api/strategies/scan` | JWT | Multi-symbol scanner |
| GET | `/api/trading/buzz/earnings` | JWT | Reddit earnings buzz |
| GET | `/api/trading/buzz/stocks` | JWT | Reddit stocks buzz |
| GET | `/api/trading/buzz/crypto` | JWT | Reddit crypto buzz |
| GET | `/api/trading/buzz/tokens` | JWT | Reddit tokens buzz |
| GET | `/api/trading/buzz/selected` | JWT | Reddit buzz for specific symbols |
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
          ├─ 1. Fetch options chain (Market Data App → yfinance → synthetic BS)
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
          │      31-strategy catalog grouped by direction category:
          │        Bullish, Bearish, Neutral/Income, Omnidirectional
          │      Fit score: IV match (40%) + direction match (40%) + DTE bonus (20%)
          │      Top 3 per direction category returned
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

## Subscription tiers (tier_limits.py)

| Tier | Max watchlist symbols | Max scans/month |
|------|----------------------|-----------------|
| free | 5 | 10 |
| starter | 15 | 100 |
| pro | 50 | unlimited |
| enterprise | unlimited | unlimited |

Tier is stored in `user_profiles.subscription_tier`. The admin is always enterprise.
`GET /api/watchlist` returns current tier limits alongside the saved symbol list.
`PUT /api/watchlist` rejects if the new symbol count exceeds the tier maximum.

## Frontend tab layout

```
Header: OptionsDesk logo | Symbol search | QuoteBar | User avatar | Sign Out
──────────────────────────────────────────────────────────────────────────────
Tabs:  Chain | P&L | Risk | Orders | Scanner | Desk | Guide | Admin (admin only)
──────────────────────────────────────────────────────────────────────────────
Main content area                          │  Sidebar (desktop only)
                                           │  OrderEntry panel
  Chain tab:   OptionsChain component      │  (hidden on admin/guide tabs)
  P&L tab:     Positions + PnLChart        │
  Risk tab:    RiskMonitor component       │
  Orders tab:  Orders table                │
  Scanner tab: StrategyScanner             │
               → deep analysis opens       │
                 StrategyDetail +          │
                 StrategyNarrative         │
                 TradePanel                │
  Desk tab:    TradingDesk (Reddit buzz)   │
  Guide tab:   UserGuide                   │
  Admin tab:   AdminPanel                  │
──────────────────────────────────────────────────────────────────────────────
Mobile: FAB "Place Order" button → bottom drawer (OrderEntry)
```

## Risk Monitor Component

The **Risk Monitor** tab (`frontend/src/components/RiskMonitor.tsx`) displays all open strategy positions grouped by strategy and sorted by entry date, risk level, or P&L. Layout responds to viewport width:

**Desktop (> 768px):** Master-Detail split with a compact left-panel list (strategy groups, 3px risk-coloured border, entry date chip, DTE, net P&L, mini progress bar) and a scrollable right-panel detail showing strategy name, risk badge, combined P&L, header with entry date banner ("Trade entered DD Mon YYYY — N days ago"), compact leg cards in a responsive grid (symbol, BUY/SELL + CALL/PUT badges, ×N quantity, strike, DTE, 3-tile metrics: Qty · IV Rank · Cost/Collected, entry→current prices, P&L, risk-coloured top bar), an expandable Trade Narrative section (if strategy-linked), and an always-visible Action Plan (defensive narrative for losing trades, strategy context for profitable ones).

**Mobile (≤ 768px):** Single-column accordion where tapping a group row expands inline detail below it — same content as right panel, only one row expanded at a time.

**Sort modes (session-only, all tiers with Risk Monitor access):**
- **Newest first** (default): groups by entry date with date separator rails ("25 Jun 2026"). Identical to original layout.
- **Risk first**: flat list ordered red → yellow → green, with "Entered DD Mon" chip on each row. Tiebreak: worst P&L first within the same risk tier.
- **Worst P&L first**: flat list ordered by most negative combined P&L, with "Entered DD Mon" chip on each row.

**Group-based risk logic:** The group risk badge and left-panel progress bar reflect the **entire strategy's net P&L**, not the worst single leg. A net-profitable multi-leg strategy never shows HIGH RISK, even if one leg is individually stressed — it shows WATCH if a leg is stressed, OK if all legs are green. A net-losing group shows HIGH RISK only if the combined loss meets a trigger (≥50% cost basis, ≥100% cost basis, or soonest leg ≤7 DTE). Per-leg cards retain their own per-leg risk status (red/yellow/green top border).

**Backend endpoint:** `GET /api/positions/risk` returns a `PositionRisk[]` array with `entered_at` field (ISO date string, earliest order date for the position's group) and a `risk_level` field (per-leg). The component groups positions by `strategy_key`, computes `groupLevel` and `groupPnlPct` in JavaScript, and renders accordingly.

## Database schema (Supabase Postgres)

See `backend/migrations/001_initial_schema.sql` for full DDL.
Run migrations in order: 001 → 002 → 003_position_strategy_link → 003_watchlist_subscriptions.

### Tables

**`user_profiles`** — extends `auth.users`
- `id` uuid PK → auth.users
- `email`, `full_name`, `avatar_url`
- `role` text ('user' | 'admin'), default 'user'
- `subscription_tier` text ('free' | 'starter' | 'pro' | 'enterprise'), default 'free'
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
- `quantity` int, `price` numeric, `status` ('filled')
- `strategy_key`, `strategy_name`, `profit_target_pct` — strategy metadata

**`positions`** — current open positions
- Unique on `(user_id, symbol, expiry, strike, option_type)`
- `quantity` can be negative (short positions)
- `avg_cost` tracked for P&L
- `strategy_key`, `strategy_name`, `profit_target_pct`, `entry_action` — strategy metadata

**`pnl_snapshots`** — daily portfolio value
- Unique on `(user_id, snapshot_date)`
- `portfolio_value`, `cash`, `positions_value`, `total_pnl`
- Snapshot triggered when user opens Positions tab

**`activity_log`** — one row per user per calendar day
- Unique on `(user_id, log_date)`
- Upserted on login; tracks `login_count` and `last_login_at`

**`user_watchlists`** — persisted watchlist per user
- `user_id` uuid unique
- `symbols` text[] — ordered list of ticker symbols
- `updated_at` timestamptz

**`scan_usage`** — monthly scan counter per user
- `user_id`, `month` (YYYY-MM), `scan_count`
- Unique on `(user_id, month)`
- Incremented on each `/api/strategies/scan` call

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

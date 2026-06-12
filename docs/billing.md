# OptionsDesk — Development Billing Statement

**Project:** OptionsDesk — Paper-Trading Options Dashboard with AI Strategy Engine  
**Client:** Leonard Simongt  
**Prepared:** 12 June 2026  
**Rate:** $150.00 / hr  

---

## Summary

| Category | Hours | Amount |
|----------|------:|------:|
| Phase 1 — Planning & Architecture | 28.0 | $4,200.00 |
| Phase 2 — Backend Core Services | 84.0 | $12,600.00 |
| Phase 3 — Strategy Engine & Narrative | 72.0 | $10,800.00 |
| Phase 4 — Backend API Routes | 56.0 | $8,400.00 |
| Phase 5 — Frontend Core | 52.0 | $7,800.00 |
| Phase 6 — Frontend Features | 112.0 | $16,800.00 |
| Phase 7 — AI Integration | 24.0 | $3,600.00 |
| Phase 8 — Testing & QA | 20.0 | $3,000.00 |
| Phase 9 — DevOps & Deployment | 12.0 | $1,800.00 |
| Phase 10 — Documentation | 12.0 | $1,800.00 |
| **Total** | **472.0** | **$70,800.00** |

---

## Phase 1 — Planning & Architecture  `28.0 hrs · $4,200.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 1.1 | System architecture design — service topology, auth flow, market data fallback strategy | 6.0 |
| 1.2 | Database schema design — 9 core tables, RLS policies, index strategy | 8.0 |
| 1.3 | API contract design — route inventory, request/response shapes, auth matrix | 6.0 |
| 1.4 | Subscription tier model design — tier limits, scan quotas, watchlist caps | 2.0 |
| 1.5 | Development environment setup — monorepo structure, Python venv, Node workspace, Railway project scaffold | 4.0 |
| 1.6 | Third-party integration research — Market Data App API, StockTwits API, Anthropic Claude API, Supabase Auth | 2.0 |
| | **Phase 1 Total** | **28.0** |

---

## Phase 2 — Backend Core Services  `84.0 hrs · $12,600.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 2.1 | Supabase client factory (`db.py`) — env-safe singleton, service-role key wiring | 2.0 |
| 2.2 | Authentication service (`auth_utils.py`) — JWT verification via Supabase Auth API (algorithm-agnostic, no python-jose), admin bypass logic, `require_admin()` guard | 8.0 |
| 2.3 | Market data integration — tier-1 Market Data App client (full greeks, OPRA data, 5-min cache) | 12.0 |
| 2.4 | Market data integration — tier-2 yfinance fallback (30-sec cache, NaN-safe `_safe_int()`, volume/OI guards) | 8.0 |
| 2.5 | Market data integration — tier-3 synthetic Black-Scholes chain (last-resort generation, `_synthetic=True` flag) | 6.0 |
| 2.6 | IV analysis engine (`iv_analysis.py`, 238 LOC) — IV rank (52-week HV range), HV-30d, environment classification (LOW/MEDIUM/HIGH) | 10.0 |
| 2.7 | Directional bias engine — RSI-14, SMA-20/50 crossover, five-class bias output (BULLISH/BEARISH/NEUTRAL/NEUTRAL_BULLISH/NEUTRAL_BEARISH) | 8.0 |
| 2.8 | Black-Scholes greeks service (`greeks.py`, 54 LOC) — delta, gamma, theta, vega, rho via scipy | 4.0 |
| 2.9 | Market context enrichment (`market_context.py`, 252 LOC) — earnings dates, news headlines, options flow (PCR, unusual volume), IV term structure (contango/backwardation/skew), MACD (12/26/9), ATR-14, volume trend | 16.0 |
| 2.10 | StockTwits API client (`reddit.py`, 149 LOC) — five feed types (earnings, stocks, crypto, tokens, selected), per-feed caching (10–15 min) | 10.0 |
| | **Phase 2 Total** | **84.0** |

---

## Phase 3 — Strategy Engine & Narrative  `72.0 hrs · $10,800.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 3.1 | 31-strategy catalog (`strategy_engine.py`, 1,088 LOC) — full spec per strategy: direction category, IV environment fit, DTE target range, PoP range, profit target %, legs with delta targets | 20.0 |
| 3.2 | Fit scoring algorithm — IV match weight (40%), direction match weight (40%), DTE proximity bonus (20%) | 8.0 |
| 3.3 | Top-N ranking by direction category — best 3 strategies per quadrant (Bullish/Bearish/Neutral-Income/Omnidirectional) | 4.0 |
| 3.4 | Strike selection engine — match target deltas to live chain contracts, handle missing strikes, multi-leg ordering | 10.0 |
| 3.5 | Trade construction — estimated credit/debit per leg, max profit, max loss, breakeven(s), PoP estimate from short-strike delta | 8.0 |
| 3.6 | Earnings-aware DTE routing — detect earnings within window, shift DTE target to avoid earnings, flag `earnings_conflict` | 4.0 |
| 3.7 | 7-section narrative generator (`interpreter.py`, 1,270 LOC) — market snapshot, IV context, why-this-strategy, trade-plain-english, profit scenario, loss scenario, defensive tactic, execution checklist, confirmation summary | 18.0 |
| | **Phase 3 Total** | **72.0** |

---

## Phase 4 — Backend API Routes  `56.0 hrs · $8,400.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 4.1 | Auth routes (`auth_routes.py`, 70 LOC) — `POST /api/auth/login` (whitelist check, profile upsert, portfolio seed, activity log), `GET /api/auth/me`, `GET /api/auth/pnl-history` | 6.0 |
| 4.2 | Options routes (`options.py`) — `GET /api/options/chain/{symbol}` (greeks enrichment), `GET /api/options/quote/{symbol}` | 4.0 |
| 4.3 | Strategy routes (`strategies.py`, 321 LOC) — `GET /api/strategies/analyze/{symbol}` (full pipeline), `GET /api/strategies/scan` (multi-symbol, tier-gated) | 10.0 |
| 4.4 | Portfolio & positions routes (`positions.py`, 197 LOC) — `GET /api/positions` (live P&L), `GET /api/portfolio`, `POST /api/positions/snapshot` | 6.0 |
| 4.5 | Portfolio service (`user_portfolio.py`, 318 LOC) — order placement, position netting, P&L snapshot, activity log upsert, portfolio seed | 10.0 |
| 4.6 | Orders routes (`orders.py`) — `POST /api/orders`, `GET /api/orders`, `POST /api/trades/record` | 4.0 |
| 4.7 | Watchlist routes (`watchlist.py`, 78 LOC) — `GET /api/watchlist` (tier info), `PUT /api/watchlist` (symbol-cap enforcement, scan usage) | 4.0 |
| 4.8 | Trading/buzz routes (`trading_routes.py`) — five `GET /api/trading/buzz/*` StockTwits feed endpoints | 4.0 |
| 4.9 | Admin routes (`admin_routes.py`, 190 LOC) — user list, whitelist CRUD, role management, deactivation, activity log, leaderboard stats | 8.0 |
| | **Phase 4 Total** | **56.0** |

---

## Phase 5 — Frontend Core  `52.0 hrs · $7,800.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 5.1 | Supabase JS client init (`lib/supabase.ts`) and auth context (`AuthContext.tsx`) — session management, `onAuthStateChange`, Axios header injection, `isAdmin` flag | 8.0 |
| 5.2 | API client (`api/client.ts`, 382 LOC) — Axios instance, all typed interfaces (Quote, OptionContract, Order, Position, TradeStructure, StockOrder, AISettings), all API call wrappers | 10.0 |
| 5.3 | App shell (`App.tsx`, 309 LOC) — tab routing (chain/positions/scanner/guide/ai/admin), desk switcher (Options/Trading), symbol search bar, mobile FAB, sidebar wiring | 12.0 |
| 5.4 | Login page (`LoginPage.tsx`, 138 LOC) — Google OAuth button, whitelist rejection state, loading state | 4.0 |
| 5.5 | Quote bar (`QuoteBar.tsx`, 137 LOC) — live price strip, change/% change, polling | 4.0 |
| 5.6 | Mobile responsiveness — `useWindowSize` hook, breakpoint constants (isMobile < 768px, isTablet < 1024px), bottom-drawer order entry, tab label truncation | 8.0 |
| 5.7 | Responsive layout wiring — desktop sidebar always-visible, tablet email-hidden, mobile drawer with FAB | 6.0 |
| | **Phase 5 Total** | **52.0** |

---

## Phase 6 — Frontend Features  `112.0 hrs · $16,800.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 6.1 | Options chain viewer (`OptionsChain.tsx`, 453 LOC) — calls/puts table, expiry picker, greeks columns, ITM/OTM highlighting, click-to-prefill order entry | 14.0 |
| 6.2 | Strategy scanner (`StrategyScanner.tsx`, 489 LOC) — watchlist input, multi-symbol scan results table, IVR/bias/top-strategy columns, tier limit messaging | 12.0 |
| 6.3 | Strategy detail card (`StrategyDetail.tsx`, 552 LOC) — per-strategy card with legs, delta targets, IV environment fit, direction badge, metrics | 10.0 |
| 6.4 | Strategy narrative accordion (`StrategyNarrative.tsx`, 392 LOC) — 7-section collapsible narrative, copy-checklist button, earnings warning | 10.0 |
| 6.5 | Trade panel (`TradePanel.tsx`, 358 LOC) — leg-by-leg structure display, estimated credit/debit, max profit/loss, record-trade flow | 8.0 |
| 6.6 | Options order entry (`OrderEntry.tsx`, 413 LOC) — symbol/expiry/strike/type/action/quantity form, sidebar and bottom-drawer variants, submit + feedback | 10.0 |
| 6.7 | Stock order entry (`StockOrderEntry.tsx`, 310 LOC) — market/limit order form, quote fetch with debounce, confirmation modal | 8.0 |
| 6.8 | Positions & portfolio summary (`Positions.tsx`, 483 LOC) — open positions table, live P&L, greeks per position, cash + portfolio summary header | 12.0 |
| 6.9 | P&L chart (`PnLChart.tsx`, 112 LOC) — 90-day equity curve (recharts LineChart), snapshot trigger on tab open | 4.0 |
| 6.10 | Risk monitor (`RiskMonitor.tsx`, 279 LOC) — per-position risk signals (DTE, P&L threshold, IV regime, directional bias), red/yellow/green severity, aggregate risk score | 8.0 |
| 6.11 | Orders history (`Orders.tsx`, 243 LOC) — order table with filters, strategy metadata columns | 4.0 |
| 6.12 | Trading desk (`TradingDesk.tsx`, 363 LOC) — StockTwits feed tabs (earnings/stocks/crypto/tokens), post cards, refresh controls | 8.0 |
| 6.13 | Admin panel (`AdminPanel.tsx`, 669 LOC) — user list with role/status controls, whitelist tab, activity log (auto-refresh 60s), leaderboard | 14.0 |
| 6.14 | User guide (`UserGuide.tsx`, 395 LOC) — collapsible section accordion, options/greeks reference, glossary, deep-analysis guide, AI features section, admin-only section | 6.0 |
| 6.15 | AI settings panel (`AISettings.tsx`, 276 LOC) — toggle cards for 5 AI features, descriptions, persist to backend | 4.0 |
| | **Phase 6 Total** | **112.0** |

---

## Phase 7 — AI Integration  `24.0 hrs · $3,600.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 7.1 | Anthropic Claude API client (`ai_service.py`, 191 LOC) — four LLM functions: narrative enhancement, portfolio Q&A, risk summary synthesis, strategy reasoning; graceful `None` return when key absent | 10.0 |
| 7.2 | AI routes (`ai_routes.py`, 174 LOC) — settings CRUD (5 toggles), `POST /ai/chat`, `POST /ai/risk-summary`, `POST /ai/strategy-reasoning`, `POST /ai/enhance-narrative`; per-feature 403 guard | 8.0 |
| 7.3 | `ai_settings` DB table design and migration (`004_ai_settings.sql`, `005_earnings_awareness.sql`) | 2.0 |
| 7.4 | Frontend integration — `AISettings.tsx` toggle persistence, conditional AI output display in narrative and risk monitor | 4.0 |
| | **Phase 7 Total** | **24.0** |

---

## Phase 8 — Testing & QA  `20.0 hrs · $3,000.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 8.1 | Playwright E2E test infrastructure — `playwright.config.ts`, auth bypass fixture (`fixtures/auth.ts`), mock data module (`mock-data.ts`, 230 LOC) | 6.0 |
| 8.2 | E2E test suite — 7 spec files covering options chain, strategy scanner, positions, orders, trading desk, admin, AI features (1,035 LOC of tests) | 10.0 |
| 8.3 | Nightly CI workflow (`.github/workflows/e2e-nightly.yml`) — scheduled 1am UTC, `workflow_dispatch`, HTML report artifact upload | 4.0 |
| | **Phase 8 Total** | **20.0** |

---

## Phase 9 — DevOps & Deployment  `12.0 hrs · $1,800.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 9.1 | Railway backend service configuration — start command, environment variable setup, health check endpoint | 4.0 |
| 9.2 | Railway frontend service configuration — build command (`npm run build`), publish directory (`dist`), `VITE_*` env vars | 2.0 |
| 9.3 | CORS configuration (`main.py`) — allowed origins for production and local dev | 1.0 |
| 9.4 | Google OAuth setup — Supabase Auth provider configuration, authorised redirect URIs | 2.0 |
| 9.5 | Database seed — admin whitelist entry, migration sequencing verification | 1.0 |
| 9.6 | Production smoke testing — end-to-end login flow, market data fallback verification, paper trade round-trip | 2.0 |
| | **Phase 9 Total** | **12.0** |

---

## Phase 10 — Documentation  `12.0 hrs · $1,800.00`

| # | Line Item | Hours |
|---|-----------|------:|
| 10.1 | `CLAUDE.md` — AI assistant reference: repo layout, dev commands, auth architecture, market data tiers, AI features, invariants, common mistakes, SDLC workflow | 4.0 |
| 10.2 | `ARCHITECTURE.md` — system diagram, full route table, strategy pipeline, subscription tiers, DB schema, auth flow, market context | 3.0 |
| 10.3 | `SETUP.md` — step-by-step setup guide, full combined schema block, environment variable reference, hardcoded value table | 3.0 |
| 10.4 | `README.md` — feature overview, tech stack table, quick-start commands | 1.0 |
| 10.5 | `docs/billing.md` — this document | 1.0 |
| | **Phase 10 Total** | **12.0** |

---

## Grand Total

| | |
|---|---:|
| Total hours | **472.0 hrs** |
| Rate | $150.00 / hr |
| **Amount due** | **$70,800.00** |

---

*Paper trading only. Not financial advice. All work delivered as a fully functional, deployed application on Railway.*

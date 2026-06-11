# OptionsDesk

A paper-trading options dashboard with AI-driven strategy recommendations.

## What it does

- **Options chain viewer** — live calls/puts table with greeks (delta, gamma, theta, vega), bid/ask, IV, and volume
- **AI strategy scanner** — analyses IV environment + directional bias and recommends the best-fit options strategy from a catalog of 31 strategies
- **Plain-English narratives** — every recommendation comes with a 7-section breakdown: market snapshot, IV context, why this strategy, exact trade structure, profit/loss scenarios, and an execution checklist
- **AI-powered features** — optional Claude-powered coaching paragraphs, portfolio Q&A chat, risk summaries, and strategy reasoning (requires Anthropic API key; all off by default)
- **Paper trading** — place and track paper trades linked to strategy recommendations; P&L updates in real time
- **Risk monitor** — per-position risk signals showing DTE risk, P&L targets, IV environment and directional bias
- **90-day P&L chart** — daily portfolio value history
- **Watchlist scanner** — scan a saved list of symbols and surface the top strategy for each
- **Trading Desk** — StockTwits sentiment feeds for earnings, equities, crypto, and tokens
- **Subscription tiers** — free (5 symbols, 10 scans/mo), starter (15/100), pro (50/unlimited), enterprise (unlimited/unlimited)

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Axios |
| Backend | Python 3.11, FastAPI, uvicorn |
| Auth | Supabase Auth (Google OAuth) |
| Database | Supabase Postgres (RLS on all tables) |
| Market data | Market Data App (primary) → yfinance (fallback) → Black-Scholes synthetic chain |
| Hosting | Railway (separate backend + frontend services) |

## Quick start

See [SETUP.md](./SETUP.md) for the full setup guide.

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (backend); `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend).

Optional env vars (backend only):
- `MARKETDATA_API_TOKEN` — real options data from marketdata.app; falls back to yfinance without it
- `ANTHROPIC_API_KEY` — enables AI features (narrative, chat, risk summary, strategy reasoning); gracefully disabled without it

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system diagram, route table, DB schema, and strategy pipeline.

# Backend test suite

Unit/property tests for the strategy engine, P&L math, and narrative
consistency. These are the checks that verify the 31 strategies and their
calculations are still sound after a change.

## Run

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests/ -q
```

## What is covered

| File | What it verifies |
|------|------------------|
| `test_strategy_catalog.py` | All 31 strategies exist and have well-formed metadata (risk type, direction, POP range, delta targets, etc.). |
| `test_strategy_engine.py` | `build_trade()` for **every** strategy against dense / wide / sparse chains: builds without error, sane quotes, **no same-strike self-cancelling legs** (the SELL/BUY collision bug), defined-risk loss is capped, undefined-risk loss is unlimited, the vertical no-arbitrage identity `max_profit + max_loss == width`, breakevens ordered, and `net` equals the signed sum of leg mids. Also that verticals error gracefully on a one-strike chain. |
| `test_interpreter_pnl.py` | The profit panel and loss panel agree on the numbers — debit spreads quote the true max profit (not the debit paid) and never claim premium was "collected". |

## How the chains are built

`conftest.py` generates realistic chains using the app's own Black-Scholes
greeks/pricing (`services.greeks`), so strike selection by delta and the P&L
math are exercised against numbers shaped like real market data rather than
hand-picked values that could mask a bug.

- `dense_chain` — $1 increments, 70–130 (liquid name)
- `wide_chain` — $5 increments, 50–150 (mid-liquidity name)
- `sparse_chain` — three near-the-money strikes (collision-prone)
- `single_strike_chain` — one strike (degenerate; spreads must error)

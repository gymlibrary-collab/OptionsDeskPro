"""
Shared fixtures for the backend test suite.

Builds a realistic, dense options chain using the app's own Black-Scholes
greeks/pricing so that strike selection (_find_by_delta) and P&L math are
exercised against numbers shaped like real market data — not hand-picked
values that could hide bugs.
"""
import os
import sys

import pytest

# Make `services.*` importable when running pytest from anywhere.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.greeks import calculate_greeks, black_scholes_price  # noqa: E402


SPOT = 100.0
SIGMA = 0.30          # 30% IV
R = 0.05
T = 45 / 365.0        # ~45 DTE, matches the engine's default dte_target
EXPIRY = "2026-08-15"
# Later expiries so calendars/diagonals can resolve a distinct back month.
EXPIRATIONS = ["2026-08-15", "2026-09-19", "2026-10-17", "2026-12-19"]


def _build_contract(strike: float, option_type: str) -> dict:
    g = calculate_greeks(SPOT, strike, T, R, SIGMA, option_type)
    price = black_scholes_price(SPOT, strike, T, R, SIGMA, option_type)
    return {
        "strike": round(strike, 2),
        "option_type": option_type,
        "delta": g["delta"],
        "theta": g["theta"],
        "vega": g["vega"],
        "gamma": g["gamma"],
        "impliedVolatility": SIGMA,
        "bid": round(max(price - 0.05, 0.01), 2),
        "ask": round(price + 0.05, 2),
        "lastPrice": price,
        "volume": 500,
        "openInterest": 1000,
    }


def _make_chain(strikes: list[float]) -> dict:
    calls = [_build_contract(k, "call") for k in strikes]
    puts = [_build_contract(k, "put") for k in strikes]
    return {
        "expirations": EXPIRATIONS,
        "expiry": EXPIRY,
        "calls": calls,
        "puts": puts,
    }


@pytest.fixture
def dense_chain() -> dict:
    """A full chain in $1 increments from 70 to 130 — what a liquid name looks like."""
    strikes = [float(k) for k in range(70, 131)]
    return _make_chain(strikes)


@pytest.fixture
def wide_chain() -> dict:
    """A chain in $5 increments — typical for a mid-liquidity name."""
    strikes = [float(k) for k in range(50, 151, 5)]
    return _make_chain(strikes)


@pytest.fixture
def sparse_chain() -> dict:
    """
    A deliberately sparse chain: only three strikes near the money.
    With this few strikes, two delta targets can collide on the same strike —
    this is the condition that produced the SELL/BUY $750 self-cancelling bug.
    """
    strikes = [98.0, 100.0, 102.0]
    return _make_chain(strikes)


@pytest.fixture
def single_strike_chain() -> dict:
    """A pathological one-strike chain — a two-leg spread cannot be built from it."""
    return _make_chain([100.0])


@pytest.fixture
def spot() -> float:
    return SPOT

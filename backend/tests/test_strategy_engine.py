"""
Strategy engine soundness tests.

Exercises build_trade() for all 31 strategies against realistic chains and
asserts the structural and P&L-math invariants every options strategy must
satisfy. These are the checks that prove the engine is "still solid" after
a change.
"""
import pytest

from services.strategy_engine import STRATEGIES, build_trade

ALL_KEYS = sorted(STRATEGIES.keys())

# The four two-leg vertical spreads obey the exact no-arbitrage identity
# max_profit + max_loss == spread width.
VERTICALS = ["long_call_vertical", "short_call_vertical",
             "long_put_vertical", "short_put_vertical"]


def _option_legs(trade: dict) -> list:
    return [l for l in trade["legs"] if l.get("option_type") != "stock"]


# ── Build succeeds and is structurally sane ──────────────────────────────────

@pytest.mark.parametrize("key", ALL_KEYS)
def test_build_succeeds_on_dense_chain(key, dense_chain, spot):
    trade = build_trade("TEST", key, dense_chain, spot)
    assert "error" not in trade, f"{key}: build failed — {trade.get('error')}"
    assert trade["legs"], f"{key}: produced no legs"


@pytest.mark.parametrize("key", ALL_KEYS)
def test_legs_have_sane_quotes(key, dense_chain, spot):
    trade = build_trade("TEST", key, dense_chain, spot)
    for leg in _option_legs(trade):
        assert leg["strike"] > 0, f"{key}: leg strike <= 0"
        assert leg["bid"] <= leg["ask"] + 1e-9, f"{key}: bid > ask on {leg}"
        assert leg["mid"] >= 0, f"{key}: negative mid on {leg}"


@pytest.mark.parametrize("key", ALL_KEYS)
def test_pop_estimate_in_range(key, dense_chain, spot):
    trade = build_trade("TEST", key, dense_chain, spot)
    pop = trade.get("pop_estimate")
    if pop is not None:
        assert 0 <= pop <= 100, f"{key}: pop_estimate {pop} out of range"


# ── The same-strike self-cancel regression ───────────────────────────────────

@pytest.mark.parametrize("key", ALL_KEYS)
def test_no_self_cancelling_legs_dense(key, dense_chain, spot):
    """A buy and a sell of the same option type at the same strike cancel to a
    zero-value trade. This was the SELL/BUY $750 bug — guard it everywhere."""
    _assert_no_self_cancel(key, build_trade("TEST", key, dense_chain, spot))


@pytest.mark.parametrize("key", ALL_KEYS)
def test_no_self_cancelling_legs_wide(key, wide_chain, spot):
    _assert_no_self_cancel(key, build_trade("TEST", key, wide_chain, spot))


@pytest.mark.parametrize("key", ALL_KEYS)
def test_no_self_cancelling_legs_sparse(key, sparse_chain, spot):
    """Sparse chains are where the collision originally surfaced. A strategy may
    legitimately error out here, but it must never emit a self-cancelling pair."""
    trade = build_trade("TEST", key, sparse_chain, spot)
    if "error" not in trade:
        _assert_no_self_cancel(key, trade)


def _assert_no_self_cancel(key, trade):
    """Two legs cancel only if they share option type, strike AND expiry but have
    opposite actions. Calendars/diagonals reuse a strike across expiries on
    purpose, so expiry is part of the identity."""
    if "error" in trade:
        return
    default_expiry = trade.get("expiry")
    seen = {}  # (type, strike, expiry) -> action
    for leg in _option_legs(trade):
        sig = (leg["option_type"], leg["strike"], leg.get("expiry", default_expiry))
        if sig in seen and seen[sig] != leg["action"]:
            pytest.fail(
                f"{key}: self-cancelling legs — {leg['action']} and {seen[sig]} "
                f"of {leg['option_type']} at strike {leg['strike']} (same expiry)"
            )
        seen[sig] = leg["action"]


# ── P&L math invariants ──────────────────────────────────────────────────────

@pytest.mark.parametrize("key", ALL_KEYS)
def test_defined_risk_has_capped_loss(key, dense_chain, spot):
    strat = STRATEGIES[key]
    trade = build_trade("TEST", key, dense_chain, spot)
    if strat["risk_type"] == "DEFINED":
        assert trade["max_loss"] is not None, f"{key}: DEFINED risk but max_loss is None"
        assert trade["max_loss"] >= 0, f"{key}: negative max_loss {trade['max_loss']}"
        if trade["max_profit"] is not None:
            assert trade["max_profit"] >= 0, f"{key}: negative max_profit"


@pytest.mark.parametrize("key", ALL_KEYS)
def test_undefined_risk_has_unlimited_loss(key, dense_chain, spot):
    strat = STRATEGIES[key]
    trade = build_trade("TEST", key, dense_chain, spot)
    if strat["risk_type"] == "UNDEFINED":
        assert trade["max_loss"] is None, (
            f"{key}: UNDEFINED risk should have max_loss=None, got {trade['max_loss']}"
        )


@pytest.mark.parametrize("key", VERTICALS)
def test_vertical_no_arbitrage_identity(key, dense_chain, spot):
    """For a vertical, max_profit + max_loss must equal the spread width."""
    trade = build_trade("TEST", key, dense_chain, spot)
    strikes = [l["strike"] for l in _option_legs(trade)]
    width = abs(max(strikes) - min(strikes))
    total = trade["max_profit"] + trade["max_loss"]
    assert abs(total - width) < 0.02, (
        f"{key}: max_profit ({trade['max_profit']}) + max_loss ({trade['max_loss']}) "
        f"= {total}, but spread width is {width}"
    )


@pytest.mark.parametrize("key", VERTICALS)
def test_vertical_both_sides_positive(key, dense_chain, spot):
    trade = build_trade("TEST", key, dense_chain, spot)
    assert trade["max_profit"] > 0, f"{key}: max_profit not positive"
    assert trade["max_loss"] > 0, f"{key}: max_loss not positive"


# ── Iron condor / Iron fly max_loss correctness ──────────────────────────────

WINGS = ["iron_condor", "iron_fly"]


@pytest.mark.parametrize("key", WINGS)
def test_wing_max_loss_equals_spread_width_minus_credit(key, dense_chain, spot):
    """max_profit + max_loss must equal the wider individual spread width.
    The old bug used the total outer span (all 4 strikes), overstating max_loss ~6×."""
    trade = build_trade("TEST", key, dense_chain, spot)
    assert "error" not in trade

    legs = _option_legs(trade)
    put_strikes = [l["strike"] for l in legs if l["option_type"] == "put"]
    call_strikes = [l["strike"] for l in legs if l["option_type"] == "call"]

    put_width = abs(max(put_strikes) - min(put_strikes))
    call_width = abs(max(call_strikes) - min(call_strikes))
    spread_width = max(put_width, call_width)

    total = trade["max_profit"] + trade["max_loss"]
    assert abs(total - spread_width) < 0.02, (
        f"{key}: max_profit ({trade['max_profit']}) + max_loss ({trade['max_loss']}) "
        f"= {total}, but wider spread width is {spread_width} "
        f"(put_w={put_width}, call_w={call_width})"
    )


@pytest.mark.parametrize("key", WINGS)
def test_wing_max_loss_less_than_outer_span(key, dense_chain, spot):
    """Sanity: max_loss must be strictly less than the total outer-strike span."""
    trade = build_trade("TEST", key, dense_chain, spot)
    assert "error" not in trade

    legs = _option_legs(trade)
    all_strikes = [l["strike"] for l in legs]
    outer_span = abs(max(all_strikes) - min(all_strikes))

    assert trade["max_loss"] < outer_span, (
        f"{key}: max_loss ({trade['max_loss']}) >= outer span ({outer_span}) — "
        "looks like the old span-width bug"
    )


@pytest.mark.parametrize("key", ALL_KEYS)
def test_breakevens_ordered(key, dense_chain, spot):
    trade = build_trade("TEST", key, dense_chain, spot)
    bl, bh = trade.get("breakeven_low"), trade.get("breakeven_high")
    if bl is not None and bh is not None:
        assert bl < bh, f"{key}: breakeven_low {bl} >= breakeven_high {bh}"


@pytest.mark.parametrize("key", ALL_KEYS)
def test_credit_debit_sign_matches_legs(key, dense_chain, spot):
    """estimated_credit_or_debit must equal the signed sum of the legs' mids."""
    trade = build_trade("TEST", key, dense_chain, spot)
    expected = round(sum(
        (l["mid"] if l["action"] == "sell" else -l["mid"])
        for l in _option_legs(trade)
    ), 2)
    assert abs(trade["estimated_credit_or_debit"] - expected) < 0.02, (
        f"{key}: net {trade['estimated_credit_or_debit']} != signed leg sum {expected}"
    )


# ── Graceful degradation ─────────────────────────────────────────────────────

@pytest.mark.parametrize("key", VERTICALS)
def test_vertical_errors_on_single_strike_chain(key, single_strike_chain, spot):
    """With only one strike, a two-leg spread cannot be built — must error, not crash."""
    trade = build_trade("TEST", key, single_strike_chain, spot)
    assert "error" in trade, f"{key}: should error on a one-strike chain"


def test_unknown_strategy_returns_error(dense_chain, spot):
    trade = build_trade("TEST", "not_a_real_strategy", dense_chain, spot)
    assert "error" in trade

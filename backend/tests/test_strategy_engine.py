"""
Strategy engine soundness tests.

Exercises build_trade() for all 31 strategies against realistic chains and
asserts the structural and P&L-math invariants every options strategy must
satisfy.

build_trade() returns None for strategies that are non-viable at the given
prices (e.g. debit > max profit). Tests that require a successful build use
_build_or_none() and skip gracefully when the viability guard fires.
"""
import pytest

from services.strategy_engine import STRATEGIES, build_trade

ALL_KEYS = sorted(STRATEGIES.keys())

# Four two-leg verticals obey the exact no-arbitrage identity:
#   max_profit + max_loss == spread width
VERTICALS = [
    "long_call_vertical", "short_call_vertical",
    "long_put_vertical",  "short_put_vertical",
]

WINGS = ["iron_condor", "iron_fly"]

ZEBRAS = ["call_zebra", "put_zebra"]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _option_legs(trade: dict) -> list:
    return [l for l in trade["legs"] if l.get("option_type") != "stock"]


def _build_or_none(key, chain, spot):
    """Build a trade; return None if the viability guard suppresses it."""
    return build_trade("TEST", key, chain, spot)


def _require_build(key, chain, spot):
    """Build a trade; skip the test if the viability guard fires."""
    trade = build_trade("TEST", key, chain, spot)
    if trade is None:
        pytest.skip(f"{key}: suppressed by viability guard on this chain")
    return trade


# ── Build succeeds and is structurally sane ──────────────────────────────────

@pytest.mark.parametrize("key", ALL_KEYS)
def test_build_succeeds_on_dense_chain(key, dense_chain, spot):
    trade = _build_or_none(key, dense_chain, spot)
    if trade is None:
        return  # viability guard fired — not an error
    assert "error" not in trade, f"{key}: build failed — {trade.get('error')}"
    assert trade["legs"], f"{key}: produced no legs"


@pytest.mark.parametrize("key", ALL_KEYS)
def test_legs_have_sane_quotes(key, dense_chain, spot):
    trade = _require_build(key, dense_chain, spot)
    for leg in _option_legs(trade):
        assert leg["strike"] > 0, f"{key}: leg strike <= 0"
        assert leg["bid"] <= leg["ask"] + 1e-9, f"{key}: bid > ask on {leg}"
        assert leg["mid"] >= 0, f"{key}: negative mid on {leg}"


@pytest.mark.parametrize("key", ALL_KEYS)
def test_pop_estimate_in_range(key, dense_chain, spot):
    trade = _require_build(key, dense_chain, spot)
    pop = trade.get("pop_estimate")
    if pop is not None:
        assert 0 <= pop <= 100, f"{key}: pop_estimate {pop} out of range"


# ── The same-strike self-cancel regression ───────────────────────────────────

@pytest.mark.parametrize("key", ALL_KEYS)
def test_no_self_cancelling_legs_dense(key, dense_chain, spot):
    trade = _build_or_none(key, dense_chain, spot)
    if trade is not None:
        _assert_no_self_cancel(key, trade)


@pytest.mark.parametrize("key", ALL_KEYS)
def test_no_self_cancelling_legs_wide(key, wide_chain, spot):
    trade = _build_or_none(key, wide_chain, spot)
    if trade is not None:
        _assert_no_self_cancel(key, trade)


@pytest.mark.parametrize("key", ALL_KEYS)
def test_no_self_cancelling_legs_sparse(key, sparse_chain, spot):
    trade = _build_or_none(key, sparse_chain, spot)
    if trade is not None:
        _assert_no_self_cancel(key, trade)


def _assert_no_self_cancel(key, trade):
    if "error" in trade:
        return
    default_expiry = trade.get("expiry")
    seen = {}
    for leg in _option_legs(trade):
        sig = (leg["option_type"], leg["strike"], leg.get("expiry", default_expiry))
        if sig in seen and seen[sig] != leg["action"]:
            pytest.fail(
                f"{key}: self-cancelling legs — {leg['action']} and {seen[sig]} "
                f"of {leg['option_type']} at strike {leg['strike']} (same expiry)"
            )
        seen[sig] = leg["action"]


# ── Core viability invariants (the guards we added) ──────────────────────────

@pytest.mark.parametrize("key", ALL_KEYS)
def test_no_viable_trade_has_nonpositive_max_profit(key, dense_chain, spot):
    """Every strategy that builds must have either None (unlimited) or a strictly
    positive max_profit. Negative or zero max_profit means the strategy can never
    make money at these strikes — the guard should have suppressed it."""
    trade = _build_or_none(key, dense_chain, spot)
    if trade is None or "error" in trade:
        return
    mp = trade.get("max_profit")
    if mp is not None:
        assert mp > 0, (
            f"{key}: viable trade returned with max_profit={mp} — "
            "viability guard should have suppressed it"
        )


@pytest.mark.parametrize("key", ALL_KEYS)
def test_no_debit_trade_risks_more_than_it_can_make(key, dense_chain, spot):
    """For defined-risk debit strategies, max_profit must be >= max_loss.
    Showing a setup where you risk more than you can make teaches bad habits."""
    trade = _build_or_none(key, dense_chain, spot)
    if trade is None or "error" in trade:
        return
    strat = STRATEGIES[key]
    net = trade.get("estimated_credit_or_debit", 0)
    mp = trade.get("max_profit")
    ml = trade.get("max_loss")
    if net < 0 and strat["risk_type"] == "DEFINED" and mp is not None and ml is not None:
        assert mp >= ml, (
            f"{key}: debit trade has max_profit={mp} < max_loss={ml} — "
            "guard should have suppressed it"
        )


# ── P&L math invariants ──────────────────────────────────────────────────────

@pytest.mark.parametrize("key", ALL_KEYS)
def test_defined_risk_has_capped_loss(key, dense_chain, spot):
    strat = STRATEGIES[key]
    trade = _require_build(key, dense_chain, spot)
    if strat["risk_type"] == "DEFINED":
        assert trade["max_loss"] is not None, f"{key}: DEFINED risk but max_loss is None"
        assert trade["max_loss"] >= 0, f"{key}: negative max_loss {trade['max_loss']}"
        if trade["max_profit"] is not None:
            assert trade["max_profit"] > 0, f"{key}: non-positive max_profit"


@pytest.mark.parametrize("key", ALL_KEYS)
def test_undefined_risk_has_unlimited_loss(key, dense_chain, spot):
    strat = STRATEGIES[key]
    trade = _require_build(key, dense_chain, spot)
    if strat["risk_type"] == "UNDEFINED":
        assert trade["max_loss"] is None, (
            f"{key}: UNDEFINED risk should have max_loss=None, got {trade['max_loss']}"
        )


@pytest.mark.parametrize("key", VERTICALS)
def test_vertical_no_arbitrage_identity(key, dense_chain, spot):
    """For a vertical, max_profit + max_loss must equal the spread width."""
    trade = _require_build(key, dense_chain, spot)
    strikes = [l["strike"] for l in _option_legs(trade)]
    width = abs(max(strikes) - min(strikes))
    total = trade["max_profit"] + trade["max_loss"]
    assert abs(total - width) < 0.02, (
        f"{key}: max_profit ({trade['max_profit']}) + max_loss ({trade['max_loss']}) "
        f"= {total}, but spread width is {width}"
    )


@pytest.mark.parametrize("key", VERTICALS)
def test_vertical_both_sides_positive(key, dense_chain, spot):
    trade = _require_build(key, dense_chain, spot)
    assert trade["max_profit"] > 0, f"{key}: max_profit not positive"
    assert trade["max_loss"] > 0, f"{key}: max_loss not positive"


# ── Iron condor / Iron fly max_loss correctness ──────────────────────────────

@pytest.mark.parametrize("key", WINGS)
def test_wing_max_loss_equals_spread_width_minus_credit(key, dense_chain, spot):
    trade = _require_build(key, dense_chain, spot)
    legs = _option_legs(trade)
    put_strikes  = [l["strike"] for l in legs if l["option_type"] == "put"]
    call_strikes = [l["strike"] for l in legs if l["option_type"] == "call"]
    put_width    = abs(max(put_strikes)  - min(put_strikes))
    call_width   = abs(max(call_strikes) - min(call_strikes))
    spread_width = max(put_width, call_width)
    total = trade["max_profit"] + trade["max_loss"]
    assert abs(total - spread_width) < 0.02, (
        f"{key}: max_profit ({trade['max_profit']}) + max_loss ({trade['max_loss']}) "
        f"= {total}, expected {spread_width}"
    )


@pytest.mark.parametrize("key", WINGS)
def test_wing_max_loss_less_than_outer_span(key, dense_chain, spot):
    trade = _require_build(key, dense_chain, spot)
    legs = _option_legs(trade)
    outer_span = abs(max(l["strike"] for l in legs) - min(l["strike"] for l in legs))
    assert trade["max_loss"] < outer_span, (
        f"{key}: max_loss ({trade['max_loss']}) >= outer span ({outer_span})"
    )


# ── ZEBRA: unlimited upside ───────────────────────────────────────────────────

@pytest.mark.parametrize("key", ZEBRAS)
def test_zebra_has_unlimited_upside(key, dense_chain, spot):
    """ZEBRAs are 2:1 back-ratios with unlimited profit above the short strike.
    max_profit must be None (unlimited); max_loss must equal the debit paid."""
    trade = _build_or_none(key, dense_chain, spot)
    if trade is None:
        pytest.skip(f"{key}: suppressed on this chain")
    assert "error" not in trade
    assert trade["max_profit"] is None, (
        f"{key}: expected max_profit=None (unlimited), got {trade['max_profit']}"
    )
    assert trade["max_loss"] is not None, f"{key}: max_loss should be set (= debit)"
    net = abs(trade["estimated_credit_or_debit"])
    assert abs(trade["max_loss"] - net) < 0.02, (
        f"{key}: max_loss {trade['max_loss']} != debit {net}"
    )


@pytest.mark.parametrize("key", ZEBRAS)
def test_zebra_has_two_long_legs_one_short(key, dense_chain, spot):
    trade = _build_or_none(key, dense_chain, spot)
    if trade is None:
        pytest.skip(f"{key}: suppressed on this chain")
    legs = _option_legs(trade)
    buys  = [l for l in legs if l["action"] == "buy"]
    sells = [l for l in legs if l["action"] == "sell"]
    assert len(buys)  == 2, f"{key}: expected 2 long legs, got {len(buys)}"
    assert len(sells) == 1, f"{key}: expected 1 short leg, got {len(sells)}"


# ── Credit/debit sign sanity ──────────────────────────────────────────────────

@pytest.mark.parametrize("key", ALL_KEYS)
def test_credit_debit_sign_matches_legs(key, dense_chain, spot):
    """estimated_credit_or_debit must equal the signed sum of the legs' mids."""
    trade = _require_build(key, dense_chain, spot)
    expected = round(sum(
        (l["mid"] if l["action"] == "sell" else -l["mid"])
        for l in _option_legs(trade)
    ), 2)
    assert abs(trade["estimated_credit_or_debit"] - expected) < 0.02, (
        f"{key}: net {trade['estimated_credit_or_debit']} != signed leg sum {expected}"
    )


@pytest.mark.parametrize("key", ALL_KEYS)
def test_breakevens_ordered(key, dense_chain, spot):
    trade = _require_build(key, dense_chain, spot)
    bl, bh = trade.get("breakeven_low"), trade.get("breakeven_high")
    if bl is not None and bh is not None:
        assert bl < bh, f"{key}: breakeven_low {bl} >= breakeven_high {bh}"


# ── Graceful degradation ──────────────────────────────────────────────────────

@pytest.mark.parametrize("key", VERTICALS)
def test_vertical_errors_on_single_strike_chain(key, single_strike_chain, spot):
    trade = build_trade("TEST", key, single_strike_chain, spot)
    assert trade is None or "error" in trade, (
        f"{key}: should return None or error on a one-strike chain"
    )


def test_unknown_strategy_returns_error(dense_chain, spot):
    trade = build_trade("TEST", "not_a_real_strategy", dense_chain, spot)
    assert trade is not None and "error" in trade

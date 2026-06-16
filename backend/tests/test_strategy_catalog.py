"""
Catalog integrity tests — verify the 31-strategy metadata is internally
consistent. These catch typos and missing fields before they reach the
strike-selection or narrative layers.
"""
from services.strategy_engine import STRATEGIES

VALID_RISK_TYPES = {"DEFINED", "UNDEFINED"}
VALID_DIRECTIONS = {
    "BULLISH", "BEARISH", "NEUTRAL",
    "NEUTRAL_BULLISH", "NEUTRAL_BEARISH", "OMNIDIRECTIONAL",
}
REQUIRED_FIELDS = {
    "name", "direction", "iv_environment", "risk_type", "complexity",
    "dte_target", "pop_range", "profit_target_pct", "description",
    "legs", "delta_targets", "condition_explanation",
}


def test_exactly_31_strategies():
    assert len(STRATEGIES) == 31, f"Expected 31 strategies, found {len(STRATEGIES)}"


def test_every_strategy_has_required_fields():
    for key, strat in STRATEGIES.items():
        missing = REQUIRED_FIELDS - set(strat.keys())
        assert not missing, f"{key} missing fields: {missing}"


def test_risk_types_valid():
    for key, strat in STRATEGIES.items():
        assert strat["risk_type"] in VALID_RISK_TYPES, f"{key}: bad risk_type {strat['risk_type']}"


def test_directions_valid():
    for key, strat in STRATEGIES.items():
        for d in strat["direction"]:
            assert d in VALID_DIRECTIONS, f"{key}: bad direction {d}"


def test_pop_range_well_formed():
    for key, strat in STRATEGIES.items():
        lo, hi = strat["pop_range"]
        assert 0 <= lo <= hi <= 100, f"{key}: pop_range {strat['pop_range']} out of bounds"


def test_profit_target_pct_sane():
    for key, strat in STRATEGIES.items():
        assert 0 < strat["profit_target_pct"] <= 100, f"{key}: bad profit_target_pct"


def test_complexity_sane():
    for key, strat in STRATEGIES.items():
        assert strat["complexity"] in (1, 2, 3), f"{key}: complexity should be 1-3"


def test_delta_targets_present_for_option_strategies():
    """Every strategy with option legs must declare delta targets."""
    for key, strat in STRATEGIES.items():
        option_legs = [l for l in strat["legs"] if l != "long_stock"]
        if option_legs:
            assert strat["delta_targets"], f"{key}: has option legs but no delta_targets"

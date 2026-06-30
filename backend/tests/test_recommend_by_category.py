"""
Tests for recommend_by_category — cap-removal regression suite.

Before the fix, the function sliced each category's sorted match list to [:3],
silently dropping strategies beyond the third. The fix removes that slice so
all qualifying strategies per category are returned.

recommend_by_category is pure (no network, no DB) so these tests run without
any mocks or external services.
"""
import pytest

from services.strategy_engine import STRATEGIES, recommend_by_category


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _keys(result: dict, category: str) -> list[str]:
    """Extract the ordered list of strategy keys for a category."""
    return [rec["key"] for rec in result.get(category, [])]


# ---------------------------------------------------------------------------
# PRIMARY DEFECT CASE: OMNIDIRECTIONAL / HIGH
# All 6 qualifying strategies must be present; the 3 previously dropped by
# [:3] must now appear.
# ---------------------------------------------------------------------------

class TestOmnidirectionalHigh:
    """OMNIDIRECTIONAL/HIGH had 6 qualifying strategies; cap was keeping 3."""

    @pytest.fixture(autouse=True)
    def result(self):
        self._result = recommend_by_category(iv_env="HIGH")

    def test_count_is_six(self):
        keys = _keys(self._result, "OMNIDIRECTIONAL")
        assert len(keys) == 6, (
            f"Expected 6 OMNIDIRECTIONAL/HIGH strategies, got {len(keys)}: {keys}"
        )

    def test_put_broken_heart_butterfly_present(self):
        keys = _keys(self._result, "OMNIDIRECTIONAL")
        assert "put_broken_heart_butterfly" in keys, (
            f"put_broken_heart_butterfly was dropped — keys: {keys}"
        )

    def test_call_broken_wing_butterfly_present(self):
        keys = _keys(self._result, "OMNIDIRECTIONAL")
        assert "call_broken_wing_butterfly" in keys, (
            f"call_broken_wing_butterfly was dropped — keys: {keys}"
        )

    def test_call_broken_heart_butterfly_present(self):
        keys = _keys(self._result, "OMNIDIRECTIONAL")
        assert "call_broken_heart_butterfly" in keys, (
            f"call_broken_heart_butterfly was dropped — keys: {keys}"
        )

    def test_previously_kept_strategies_still_present(self):
        """The three strategies that were kept even under the cap must still appear."""
        keys = _keys(self._result, "OMNIDIRECTIONAL")
        for expected in ("put_front_ratio", "call_front_ratio", "put_broken_wing_butterfly"):
            assert expected in keys, f"{expected} missing from OMNIDIRECTIONAL/HIGH: {keys}"

    def test_sorted_by_complexity_ascending(self):
        """All OMNIDIRECTIONAL strategies have complexity 3; stable sort must preserve
        STRATEGIES dict insertion order as the tie-break."""
        keys = _keys(self._result, "OMNIDIRECTIONAL")
        complexities = [STRATEGIES[k]["complexity"] for k in keys]
        assert complexities == sorted(complexities), (
            f"OMNIDIRECTIONAL/HIGH not sorted by complexity: {list(zip(keys, complexities))}"
        )


# ---------------------------------------------------------------------------
# BULLISH / HIGH — was capping at 3, dropping call_butterfly + big_lizard
# ---------------------------------------------------------------------------

class TestBullishHigh:
    """BULLISH/HIGH has 5 qualifying strategies; cap was returning only 3."""

    @pytest.fixture(autouse=True)
    def result(self):
        self._result = recommend_by_category(iv_env="HIGH")

    def test_count_is_five(self):
        keys = _keys(self._result, "BULLISH")
        assert len(keys) == 5, (
            f"Expected 5 BULLISH/HIGH strategies, got {len(keys)}: {keys}"
        )

    def test_call_butterfly_present(self):
        keys = _keys(self._result, "BULLISH")
        assert "call_butterfly" in keys, (
            f"call_butterfly was dropped — keys: {keys}"
        )

    def test_big_lizard_present(self):
        keys = _keys(self._result, "BULLISH")
        assert "big_lizard" in keys, (
            f"big_lizard was dropped — keys: {keys}"
        )


# ---------------------------------------------------------------------------
# BEARISH / HIGH — was capping at 3, dropping put_butterfly + reverse_big_lizard
# ---------------------------------------------------------------------------

class TestBearishHigh:
    """BEARISH/HIGH has 5 qualifying strategies; cap was returning only 3."""

    @pytest.fixture(autouse=True)
    def result(self):
        self._result = recommend_by_category(iv_env="HIGH")

    def test_count_is_five(self):
        keys = _keys(self._result, "BEARISH")
        assert len(keys) == 5, (
            f"Expected 5 BEARISH/HIGH strategies, got {len(keys)}: {keys}"
        )

    def test_put_butterfly_present(self):
        keys = _keys(self._result, "BEARISH")
        assert "put_butterfly" in keys, (
            f"put_butterfly was dropped — keys: {keys}"
        )

    def test_reverse_big_lizard_present(self):
        keys = _keys(self._result, "BEARISH")
        assert "reverse_big_lizard" in keys, (
            f"reverse_big_lizard was dropped — keys: {keys}"
        )


# ---------------------------------------------------------------------------
# NEUTRAL / HIGH — was capping at 3, dropping dynamic_width_iron_condor + iron_fly
# ---------------------------------------------------------------------------

class TestNeutralHigh:
    """NEUTRAL/HIGH has 5 qualifying strategies; cap was returning only 3."""

    @pytest.fixture(autouse=True)
    def result(self):
        self._result = recommend_by_category(iv_env="HIGH")

    def test_count_is_five(self):
        keys = _keys(self._result, "NEUTRAL")
        assert len(keys) == 5, (
            f"Expected 5 NEUTRAL/HIGH strategies, got {len(keys)}: {keys}"
        )

    def test_dynamic_width_iron_condor_present(self):
        keys = _keys(self._result, "NEUTRAL")
        assert "dynamic_width_iron_condor" in keys, (
            f"dynamic_width_iron_condor was dropped — keys: {keys}"
        )

    def test_iron_fly_present(self):
        keys = _keys(self._result, "NEUTRAL")
        assert "iron_fly" in keys, (
            f"iron_fly was dropped — keys: {keys}"
        )


# ---------------------------------------------------------------------------
# BULLISH / LOW — was capping at 3, dropping call_calendar + call_butterfly
# ---------------------------------------------------------------------------

class TestBullishLow:
    """BULLISH/LOW has 5 qualifying strategies; cap was returning only 3."""

    @pytest.fixture(autouse=True)
    def result(self):
        self._result = recommend_by_category(iv_env="LOW")

    def test_count_is_five(self):
        keys = _keys(self._result, "BULLISH")
        assert len(keys) == 5, (
            f"Expected 5 BULLISH/LOW strategies, got {len(keys)}: {keys}"
        )

    def test_call_calendar_present(self):
        keys = _keys(self._result, "BULLISH")
        assert "call_calendar" in keys, (
            f"call_calendar was dropped — keys: {keys}"
        )

    def test_call_butterfly_present(self):
        keys = _keys(self._result, "BULLISH")
        assert "call_butterfly" in keys, (
            f"call_butterfly was dropped — keys: {keys}"
        )


# ---------------------------------------------------------------------------
# BEARISH / LOW — was capping at 3, dropping put_calendar + put_butterfly
# ---------------------------------------------------------------------------

class TestBearishLow:
    """BEARISH/LOW has 5 qualifying strategies; cap was returning only 3."""

    @pytest.fixture(autouse=True)
    def result(self):
        self._result = recommend_by_category(iv_env="LOW")

    def test_count_is_five(self):
        keys = _keys(self._result, "BEARISH")
        assert len(keys) == 5, (
            f"Expected 5 BEARISH/LOW strategies, got {len(keys)}: {keys}"
        )

    def test_put_calendar_present(self):
        keys = _keys(self._result, "BEARISH")
        assert "put_calendar" in keys, (
            f"put_calendar was dropped — keys: {keys}"
        )

    def test_put_butterfly_present(self):
        keys = _keys(self._result, "BEARISH")
        assert "put_butterfly" in keys, (
            f"put_butterfly was dropped — keys: {keys}"
        )


# ---------------------------------------------------------------------------
# Unchanged cells — verify cap removal does NOT inflate counts for categories
# that were already at or below 3
# ---------------------------------------------------------------------------

class TestUnchangedCells:
    """Categories where the old cap was not active must still return exactly 3."""

    @pytest.fixture(autouse=True)
    def result_high(self):
        self._high = recommend_by_category(iv_env="HIGH")

    def test_neutral_bullish_high_still_three(self):
        keys = _keys(self._high, "NEUTRAL_BULLISH")
        assert len(keys) == 3, (
            f"NEUTRAL_BULLISH/HIGH should still be 3, got {len(keys)}: {keys}"
        )

    def test_neutral_bearish_high_still_three(self):
        keys = _keys(self._high, "NEUTRAL_BEARISH")
        assert len(keys) == 3, (
            f"NEUTRAL_BEARISH/HIGH should still be 3, got {len(keys)}: {keys}"
        )

    def test_bullish_medium_still_three(self):
        result_medium = recommend_by_category(iv_env="MEDIUM")
        keys = _keys(result_medium, "BULLISH")
        assert len(keys) == 3, (
            f"BULLISH/MEDIUM should still be 3, got {len(keys)}: {keys}"
        )

    def test_bearish_medium_still_three(self):
        result_medium = recommend_by_category(iv_env="MEDIUM")
        keys = _keys(result_medium, "BEARISH")
        assert len(keys) == 3, (
            f"BEARISH/MEDIUM should still be 3, got {len(keys)}: {keys}"
        )

    def test_omnidirectional_low_empty(self):
        result_low = recommend_by_category(iv_env="LOW")
        keys = _keys(result_low, "OMNIDIRECTIONAL")
        assert keys == [], (
            f"OMNIDIRECTIONAL/LOW should be empty, got: {keys}"
        )

    def test_omnidirectional_medium_empty(self):
        result_medium = recommend_by_category(iv_env="MEDIUM")
        keys = _keys(result_medium, "OMNIDIRECTIONAL")
        assert keys == [], (
            f"OMNIDIRECTIONAL/MEDIUM should be empty, got: {keys}"
        )


# ---------------------------------------------------------------------------
# Return-shape invariants — every item must have the required fields
# ---------------------------------------------------------------------------

REQUIRED_FIELDS = {
    "key", "name", "description", "direction", "iv_environment",
    "risk_type", "complexity", "dte_target", "pop_range",
    "profit_target_pct",
}


@pytest.mark.parametrize("iv_env", ["LOW", "MEDIUM", "HIGH"])
def test_all_items_have_required_fields(iv_env):
    result = recommend_by_category(iv_env=iv_env)
    for category, recs in result.items():
        for rec in recs:
            missing = REQUIRED_FIELDS - rec.keys()
            assert not missing, (
                f"{category}/{iv_env} key={rec.get('key')!r} missing fields: {missing}"
            )


@pytest.mark.parametrize("iv_env", ["LOW", "MEDIUM", "HIGH"])
def test_all_items_qualify_for_iv_env(iv_env):
    """Every returned strategy must actually include the requested iv_env."""
    result = recommend_by_category(iv_env=iv_env)
    for category, recs in result.items():
        for rec in recs:
            assert iv_env in rec["iv_environment"], (
                f"{rec['key']} returned in {category}/{iv_env} but "
                f"iv_environment={rec['iv_environment']}"
            )


@pytest.mark.parametrize("iv_env", ["LOW", "MEDIUM", "HIGH"])
def test_all_items_qualify_for_category(iv_env):
    """Every returned strategy must include its category in its direction list."""
    result = recommend_by_category(iv_env=iv_env)
    for category, recs in result.items():
        for rec in recs:
            assert category in rec["direction"], (
                f"{rec['key']} returned in {category}/{iv_env} but "
                f"direction={rec['direction']}"
            )


@pytest.mark.parametrize("iv_env", ["LOW", "MEDIUM", "HIGH"])
def test_all_categories_present_in_result(iv_env):
    """The result always contains all six category keys, even if the list is empty."""
    result = recommend_by_category(iv_env=iv_env)
    expected_categories = {
        "BULLISH", "BEARISH", "NEUTRAL",
        "NEUTRAL_BULLISH", "NEUTRAL_BEARISH", "OMNIDIRECTIONAL",
    }
    assert set(result.keys()) == expected_categories, (
        f"Missing categories for iv_env={iv_env}: "
        f"{expected_categories - set(result.keys())}"
    )

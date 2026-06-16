"""
Narrative P&L consistency tests.

The profit panel and loss panel are generated independently from the same
trade dict. They must agree on the numbers. This guards the debit-spread bug
where the loss panel computed risk/reward from abs(net) (the debit paid)
instead of max_profit, producing "risk $1306 to make $1306" when the real
max profit was $2177.
"""
import re

from services.strategy_engine import build_trade
from services.interpreter import _profit_scenario, _loss_scenario

DOLLARS = re.compile(r"\$([0-9][0-9,]*)")


def _dollar_amounts(text: str) -> set[int]:
    return {int(m.replace(",", "")) for m in DOLLARS.findall(text)}


def test_debit_spread_max_profit_matches_across_panels(dense_chain, spot):
    """The max-profit figure quoted in the loss panel's risk/reward line must be
    the same max profit shown in the profit panel — not the debit paid."""
    strat_meta = __import__("services.strategy_engine", fromlist=["STRATEGIES"]).STRATEGIES
    trade = build_trade("TEST", "long_call_vertical", dense_chain, spot)
    assert "error" not in trade

    max_profit_dollars = round(trade["max_profit"] * 100)
    max_loss_dollars = round(trade["max_loss"] * 100)
    debit_dollars = round(abs(trade["estimated_credit_or_debit"]) * 100)

    # Sanity: this really is a debit spread where debit != max_profit
    assert trade["estimated_credit_or_debit"] < 0, "expected a debit spread"
    assert debit_dollars != max_profit_dollars, (
        "fixture no longer exercises the bug — pick a spread where debit != max profit"
    )

    loss_text = _loss_scenario("TEST", trade, strat_meta["long_call_vertical"])

    # The loss panel must quote the real max profit, and must NOT present the
    # debit as if it were the reward.
    assert max_profit_dollars in _dollar_amounts(loss_text), (
        f"loss panel never mentions true max profit ${max_profit_dollars}"
    )


def test_debit_spread_profit_panel_language(dense_chain, spot):
    """Debit spreads must not claim premium was 'collected'."""
    strat_meta = __import__("services.strategy_engine", fromlist=["STRATEGIES"]).STRATEGIES
    trade = build_trade("TEST", "long_call_vertical", dense_chain, spot)
    text = _profit_scenario("TEST", trade, strat_meta["long_call_vertical"]).lower()
    assert "net debit" in text or "paid" in text, (
        "debit-spread profit panel should describe a debit, not a collected credit"
    )


def test_credit_spread_risk_reward_uses_credit(dense_chain, spot):
    """For a credit spread, max profit == credit collected, and the loss panel
    risk/reward should reflect that."""
    strat_meta = __import__("services.strategy_engine", fromlist=["STRATEGIES"]).STRATEGIES
    trade = build_trade("TEST", "short_put_vertical", dense_chain, spot)
    assert "error" not in trade
    assert trade["estimated_credit_or_debit"] >= 0, "expected a credit spread"

    loss_text = _loss_scenario("TEST", trade, strat_meta["short_put_vertical"])
    max_profit_dollars = round(trade["max_profit"] * 100)
    assert max_profit_dollars in _dollar_amounts(loss_text)

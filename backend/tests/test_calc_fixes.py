"""
Regression tests for two calculation bugs:

1. Covered call / covered put max profit ignored the stock leg (reported only
   the option premium).
2. A trade that flips a position through zero (long -> short or short -> long)
   kept the old side's avg_cost instead of resetting to the trade price.
"""
import pytest

from services.strategy_engine import build_trade
from services.user_portfolio import _update_position


# ── Covered call / covered put ───────────────────────────────────────────────

def _short_option(trade):
    return next(l for l in trade["legs"] if l["option_type"] != "stock")


class TestCoveredStrategies:
    def test_covered_call_max_profit_includes_stock_gain_to_strike(self, dense_chain, spot):
        trade = build_trade("TEST", "covered_call", dense_chain, spot)
        assert trade and "error" not in trade
        call = _short_option(trade)
        net = trade["estimated_credit_or_debit"]
        assert call["strike"] > spot  # 0.30-delta call is OTM
        assert trade["max_profit"] == pytest.approx(call["strike"] - spot + net, abs=0.01)
        assert trade["max_profit"] > net  # more than premium alone

    def test_covered_call_breakeven(self, dense_chain, spot):
        trade = build_trade("TEST", "covered_call", dense_chain, spot)
        net = trade["estimated_credit_or_debit"]
        assert trade["max_loss"] is None  # UNDEFINED-risk convention
        assert trade["breakeven_low"] == pytest.approx(spot - net, abs=0.01)

    def test_covered_put_max_profit_includes_stock_gain_to_strike(self, dense_chain, spot):
        trade = build_trade("TEST", "covered_put", dense_chain, spot)
        assert trade and "error" not in trade
        put = _short_option(trade)
        net = trade["estimated_credit_or_debit"]
        assert put["strike"] < spot
        assert trade["max_profit"] == pytest.approx(spot - put["strike"] + net, abs=0.01)
        assert trade["max_loss"] is None  # short stock: unlimited
        assert trade["breakeven_high"] == pytest.approx(spot + net, abs=0.01)


# ── Position flip through zero ───────────────────────────────────────────────

class _Query:
    def __init__(self, sb, op, payload=None):
        self.sb, self.op, self.payload = sb, op, payload

    def eq(self, *_):
        return self

    def execute(self):
        if self.op == "select":
            return type("R", (), {"data": self.sb.rows})()
        self.sb.calls.append((self.op, self.payload))
        return type("R", (), {"data": []})()


class _Table:
    def __init__(self, sb):
        self.sb = sb

    def select(self, *_):
        return _Query(self.sb, "select")

    def update(self, payload):
        return _Query(self.sb, "update", payload)

    def insert(self, payload):
        return _Query(self.sb, "insert", payload)

    def delete(self):
        return _Query(self.sb, "delete")


class _FakeSb:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def table(self, _name):
        return _Table(self)


class _Req:
    symbol = "QQQ"
    expiry = "2030-01-18"
    strike = 500.0
    option_type = "put"
    strategy_key = "manual"
    strategy_name = "Manual"
    profit_target_pct = 50.0

    def __init__(self, action, quantity):
        self.action = action
        self.quantity = quantity


def _existing(qty, avg):
    return [{"id": "p1", "quantity": qty, "avg_cost": avg, "strategy_key": "manual"}]


class TestPositionFlip:
    def test_long_to_short_resets_basis_to_trade_price(self):
        sb = _FakeSb(_existing(5, 2.00))
        _update_position(sb, "u1", _Req("sell", 8), 3.00)
        op, payload = sb.calls[0]
        assert op == "update"
        assert payload["quantity"] == -3
        assert payload["avg_cost"] == 3.00
        assert payload["entry_action"] == "sell"

    def test_short_to_long_resets_basis_to_trade_price(self):
        sb = _FakeSb(_existing(-2, 4.00))
        _update_position(sb, "u1", _Req("buy", 5), 1.50)
        _, payload = sb.calls[0]
        assert payload["quantity"] == 3
        assert payload["avg_cost"] == 1.50
        assert payload["entry_action"] == "buy"

    def test_partial_close_keeps_basis(self):
        sb = _FakeSb(_existing(5, 2.00))
        _update_position(sb, "u1", _Req("sell", 2), 3.00)
        _, payload = sb.calls[0]
        assert payload["quantity"] == 3
        assert payload["avg_cost"] == 2.00
        assert "entry_action" not in payload

    def test_adding_same_direction_averages_basis(self):
        sb = _FakeSb(_existing(2, 2.00))
        _update_position(sb, "u1", _Req("buy", 2), 4.00)
        _, payload = sb.calls[0]
        assert payload["quantity"] == 4
        assert payload["avg_cost"] == 3.00

    def test_exact_close_deletes_position(self):
        sb = _FakeSb(_existing(5, 2.00))
        _update_position(sb, "u1", _Req("sell", 5), 3.00)
        assert sb.calls[0][0] == "delete"

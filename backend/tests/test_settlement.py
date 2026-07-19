"""
Tests for the auto-settlement engine (services/settlement.py) and the
related record_trade price-floor amendment (services/user_portfolio.py).

All supabase and yfinance calls are mocked — no network access occurs.

Coverage:
  1. _get_historical_close: exact trading-day close, weekend/holiday fallback,
     empty-history → None.
  2. _get_settlement_price: Tier 1 market price, Tier 2 ITM intrinsic, Tier 2
     OTM worthless, Tier 3 no-history worthless.
  3. Cash adjustment math: long contract, short contract, worthless short.
  4. realised_pnl formula: long call in profit, short put expiring worthless.
  5. record_trade price floor: close leg allows $0.00; open leg floors at $0.01.
"""
import math
import sys
import os
from datetime import date, timedelta
from unittest.mock import MagicMock, patch, call

import pandas as pd
import pytest

# Make the backend package importable when running pytest from any directory.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


# ── Helper to build a fake yfinance history DataFrame ───────────────────────

def _make_hist(dates: list[str], closes: list[float]) -> pd.DataFrame:
    """Return a DatetimeIndex DataFrame shaped like yfinance .history() output."""
    idx = pd.DatetimeIndex([pd.Timestamp(d) for d in dates])
    return pd.DataFrame({"Close": closes}, index=idx)


def _empty_hist() -> pd.DataFrame:
    idx = pd.DatetimeIndex([], dtype="datetime64[ns]")
    return pd.DataFrame({"Close": []}, index=idx)


# ── _get_historical_close ────────────────────────────────────────────────────

class TestGetHistoricalClose:
    """Unit tests for settlement._get_historical_close."""

    def test_returns_close_on_exact_trading_day(self):
        """When the expiry date is a trading day, returns its close price."""
        expiry = date(2026, 6, 19)  # a Friday
        hist = _make_hist(["2026-06-17", "2026-06-18", "2026-06-19"], [48.0, 49.5, 50.25])

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.return_value = hist

            from services.settlement import _get_historical_close
            result = _get_historical_close("INTC", expiry)

        assert result == pytest.approx(50.25, rel=1e-4)

    def test_returns_last_close_before_weekend_expiry(self):
        """
        When the expiry date is a Saturday (no bar), returns Friday's close.
        This is the Gate 2 Amendment 2 requirement: use the last trading close
        ON OR BEFORE the expiry date.
        """
        expiry = date(2026, 6, 20)  # Saturday
        # yfinance returns Thu+Fri bars but nothing for Saturday
        hist = _make_hist(["2026-06-18", "2026-06-19"], [49.0, 51.0])

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.return_value = hist

            from services.settlement import _get_historical_close
            result = _get_historical_close("INTC", expiry)

        assert result == pytest.approx(51.0, rel=1e-4)

    def test_returns_none_when_history_empty(self):
        """Returns None if yfinance history is empty (no data for the window)."""
        expiry = date(2026, 1, 2)

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.return_value = _empty_hist()

            from services.settlement import _get_historical_close
            result = _get_historical_close("XYZ", expiry)

        assert result is None

    def test_returns_none_on_yfinance_exception(self):
        """Returns None (not raises) when yfinance raises an exception."""
        expiry = date(2026, 6, 19)

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.side_effect = RuntimeError("network error")

            from services.settlement import _get_historical_close
            result = _get_historical_close("AAPL", expiry)

        assert result is None

    def test_returns_none_when_no_bar_on_or_before_expiry(self):
        """
        Returns None when the history window contains only bars AFTER expiry.
        (Edge case: data only available for future dates.)
        """
        expiry = date(2026, 6, 17)
        # Only bars after expiry
        hist = _make_hist(["2026-06-18", "2026-06-19"], [49.0, 51.0])

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.return_value = hist

            from services.settlement import _get_historical_close
            result = _get_historical_close("INTC", expiry)

        assert result is None


# ── _get_settlement_price ────────────────────────────────────────────────────

class TestGetSettlementPrice:
    """Unit tests for settlement._get_settlement_price."""

    def _pos(self, symbol="INTC", expiry="2026-06-19", strike=30.0,
             option_type="call", qty=1, avg_cost=0.75):
        return {
            "symbol": symbol,
            "expiry": expiry,
            "strike": strike,
            "option_type": option_type,
            "quantity": qty,
            "avg_cost": avg_cost,
        }

    def _mock_yf_no_tier1(self, mock_yf):
        """Configure yf so Tier 1 (option contract) returns empty history."""
        mock_ticker = MagicMock()
        mock_yf.Ticker.return_value = mock_ticker
        mock_ticker.history.return_value = _empty_hist()
        return mock_ticker

    def test_tier1_market_price(self):
        """Tier 1: expired contract has last-traded data → source='market'."""
        pos = self._pos(strike=30.0, option_type="call")
        contract_hist = _make_hist(["2026-06-17", "2026-06-19"], [1.10, 1.25])

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            # Both tier1 and underlying fetch use Ticker; tier1 uses period="5d"
            # underlying fetch uses start/end.  We return contract_hist for all calls.
            mock_ticker.history.return_value = contract_hist

            from services.settlement import _get_settlement_price
            price, source = _get_settlement_price(pos)

        assert source == "market"
        assert price == pytest.approx(1.25, rel=1e-4)

    def test_tier2_itm_call_intrinsic(self):
        """
        Tier 2: underlying close available, call expires ITM.
        source='intrinsic', price = max(underlying_close - strike, 0).
        """
        pos = self._pos(strike=30.0, option_type="call", expiry="2026-06-19")
        underlying_hist = _make_hist(["2026-06-17", "2026-06-19"], [28.0, 32.50])

        call_count = [0]

        def _history_side_effect(**kwargs):
            call_count[0] += 1
            if "period" in kwargs:
                # Tier 1 contract call → no data
                return _empty_hist()
            # Tier 2 underlying call → has data
            return underlying_hist

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.side_effect = _history_side_effect

            from services.settlement import _get_settlement_price
            price, source = _get_settlement_price(pos)

        assert source == "intrinsic"
        assert price == pytest.approx(2.50, rel=1e-4)  # 32.50 - 30.00

    def test_tier2_itm_put_intrinsic(self):
        """Tier 2: put expires ITM — intrinsic = max(strike - spot, 0)."""
        pos = self._pos(strike=35.0, option_type="put", expiry="2026-06-19")
        underlying_hist = _make_hist(["2026-06-19"], [32.00])

        def _history_side_effect(**kwargs):
            if "period" in kwargs:
                return _empty_hist()
            return underlying_hist

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.side_effect = _history_side_effect

            from services.settlement import _get_settlement_price
            price, source = _get_settlement_price(pos)

        assert source == "intrinsic"
        assert price == pytest.approx(3.00, rel=1e-4)  # 35.00 - 32.00

    def test_tier2_otm_call_worthless(self):
        """
        Tier 2: call expires OTM (underlying_close < strike) → intrinsic = 0 →
        source='worthless', price=0.00.
        """
        pos = self._pos(strike=35.0, option_type="call", expiry="2026-06-19")
        underlying_hist = _make_hist(["2026-06-19"], [32.00])

        def _history_side_effect(**kwargs):
            if "period" in kwargs:
                return _empty_hist()
            return underlying_hist

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.side_effect = _history_side_effect

            from services.settlement import _get_settlement_price
            price, source = _get_settlement_price(pos)

        assert source == "worthless"
        assert price == 0.0

    def test_tier3_worthless_fallback(self):
        """Tier 3: no contract data and no underlying history → 0.00 worthless."""
        pos = self._pos()

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.return_value = _empty_hist()

            from services.settlement import _get_settlement_price
            price, source = _get_settlement_price(pos)

        assert source == "worthless"
        assert price == 0.0

    def test_weekend_expiry_uses_friday_close(self):
        """
        Gate 2 Amendment 2: expiry on Saturday → use Friday's close for intrinsic.
        """
        pos = self._pos(strike=30.0, option_type="call", expiry="2026-06-20")  # Saturday
        # yfinance window covers Tue-Sat; only returns Fri bar
        underlying_hist = _make_hist(["2026-06-18", "2026-06-19"], [29.5, 31.0])

        def _history_side_effect(**kwargs):
            if "period" in kwargs:
                return _empty_hist()
            return underlying_hist

        with patch("services.settlement.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_yf.Ticker.return_value = mock_ticker
            mock_ticker.history.side_effect = _history_side_effect

            from services.settlement import _get_settlement_price
            price, source = _get_settlement_price(pos)

        # Friday close 31.00 > strike 30.00 → intrinsic 1.00
        assert source == "intrinsic"
        assert price == pytest.approx(1.00, rel=1e-4)

    def test_bad_expiry_returns_worthless(self):
        """Malformed expiry string → falls through to worthless without raising."""
        pos = self._pos(expiry="not-a-date")

        with patch("services.settlement.yf"):
            from services.settlement import _get_settlement_price
            price, source = _get_settlement_price(pos)

        assert source == "worthless"
        assert price == 0.0


# ── Cash adjustment math ─────────────────────────────────────────────────────

class TestCashAdjustmentMath:
    """
    Verify the cash delta formula used by auto_settle_expired without hitting DB.
    Formula: cash_delta = settlement_price × |qty| × 100
      Long  (qty > 0): cash += cash_delta
      Short (qty < 0): cash -= cash_delta
    """

    def _compute_cash_delta(self, settlement_price: float, qty: int,
                            current_cash: float) -> float:
        """Mirror the cash-adjustment logic from settlement.auto_settle_expired."""
        cash_delta = settlement_price * abs(qty) * 100
        return current_cash + cash_delta if qty > 0 else current_cash - cash_delta

    def test_long_call_settled_itm(self):
        """Long call, 2 contracts, settlement $1.50 → cash +$300."""
        new_cash = self._compute_cash_delta(1.50, qty=2, current_cash=10_000.0)
        assert new_cash == pytest.approx(10_300.0, rel=1e-6)

    def test_short_put_expires_worthless(self):
        """Short put (qty=-1), settlement $0.00 → cash unchanged."""
        new_cash = self._compute_cash_delta(0.0, qty=-1, current_cash=10_000.0)
        assert new_cash == pytest.approx(10_000.0, rel=1e-6)

    def test_short_call_settled_itm(self):
        """Short call (qty=-2), settlement $1.00 → cash -$200 (buy-to-close)."""
        new_cash = self._compute_cash_delta(1.00, qty=-2, current_cash=10_000.0)
        assert new_cash == pytest.approx(9_800.0, rel=1e-6)

    def test_long_call_expires_worthless(self):
        """Long call, 1 contract, settlement $0.00 → cash unchanged (premium gone)."""
        new_cash = self._compute_cash_delta(0.0, qty=1, current_cash=5_000.0)
        assert new_cash == pytest.approx(5_000.0, rel=1e-6)


# ── Realised P&L formula ─────────────────────────────────────────────────────

class TestRealisedPnlFormula:
    """
    Verify the P&L formula: (settlement_price - avg_cost) × signed_qty × 100
    """

    def _pnl(self, settlement_price: float, avg_cost: float, qty: int) -> float:
        return round((settlement_price - avg_cost) * qty * 100, 2)

    def test_long_call_in_profit(self):
        """Long call: avg_cost=0.75, settlement=1.25, qty=2 → pnl=+100."""
        assert self._pnl(1.25, 0.75, 2) == pytest.approx(100.0, rel=1e-6)

    def test_long_call_at_loss(self):
        """Long call: avg_cost=2.00, settlement=0.50, qty=1 → pnl=-150."""
        assert self._pnl(0.50, 2.00, 1) == pytest.approx(-150.0, rel=1e-6)

    def test_short_put_expires_worthless(self):
        """
        Short put: avg_cost=3.50 (premium sold), settlement=0.00, qty=-1.
        pnl = (0.00 - 3.50) × -1 × 100 = +350.
        """
        assert self._pnl(0.00, 3.50, -1) == pytest.approx(350.0, rel=1e-6)

    def test_short_put_expires_itm(self):
        """
        Short put: avg_cost=3.50, settlement=1.00 (ITM), qty=-1.
        pnl = (1.00 - 3.50) × -1 × 100 = +250.
        """
        assert self._pnl(1.00, 3.50, -1) == pytest.approx(250.0, rel=1e-6)

    def test_long_call_expires_worthless(self):
        """Long call, settlement=0, loses full premium."""
        assert self._pnl(0.00, 1.50, 1) == pytest.approx(-150.0, rel=1e-6)


# ── record_trade price floor (Gate 2 Amendment 1) ───────────────────────────

class TestRecordTradePriceFloor:
    """
    Verify that record_trade applies the correct price floor:
      - leg.role == 'close'  → price = max(leg.price, 0.0)  — allows $0.00
      - leg.role == 'open' or None → price = leg.price if > 0 else 0.01
    """

    def _make_leg(self, role, price):
        """Minimal TradeLegRecord-like object."""
        from models import TradeLegRecord
        return TradeLegRecord(
            role=role,
            option_type="call",
            strike=30.0,
            action="sell" if role == "close" else "buy",
            quantity=1,
            price=price,
        )

    def _make_req(self, legs):
        """Minimal TradeRecordRequest-like object."""
        class Req:
            symbol = "INTC"
            strategy_key = "manual"
            strategy_name = "Manual"
            expiry = "2030-01-01"
            profit_target_pct = 50.0
            narrative_json = None
        r = Req()
        r.legs = legs
        return r

    def _make_mock_sb(self):
        """
        Return a MagicMock supabase client whose chained calls all succeed.
        We capture orders.insert() calls to inspect the stored price.
        """
        mock_sb = MagicMock()
        # Portfolios cash query
        cash_execute = MagicMock()
        cash_execute.data = {"cash": 10_000.0}
        mock_sb.table("portfolios").select("cash").eq().single().execute.return_value = cash_execute

        # Positions select (no existing position)
        pos_execute = MagicMock()
        pos_execute.data = []
        mock_sb.table("positions").select().eq().eq().eq().eq().eq().execute.return_value = pos_execute

        return mock_sb

    def test_close_leg_zero_price_stored_as_zero(self):
        """A close leg with price=0.00 is stored as 0.00, not 0.01."""
        leg = self._make_leg("close", price=0.0)
        req = self._make_req([leg])

        inserted_rows = []

        def capture_insert(row):
            inserted_rows.append(row)
            m = MagicMock()
            return m

        with patch("services.user_portfolio.get_supabase") as mock_get_sb:
            mock_sb = MagicMock()
            mock_get_sb.return_value = mock_sb

            # Cash query returns 10000
            cash_mock = MagicMock()
            cash_mock.data = {"cash": 10_000.0}
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock

            # Positions select returns no existing position
            pos_mock = MagicMock()
            pos_mock.data = []
            mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = pos_mock

            # Capture orders.insert argument
            orders_table_mock = MagicMock()
            mock_sb.table.return_value = orders_table_mock
            orders_table_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock
            orders_table_mock.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = pos_mock

            insert_mock = MagicMock()
            orders_table_mock.insert.side_effect = capture_insert

            from services.user_portfolio import record_trade
            record_trade("user-123", req)

        # Find the orders insert call (the one with 'status' key)
        order_inserts = [r for r in inserted_rows if isinstance(r, dict) and "status" in r]
        assert order_inserts, "No orders insert was captured"
        assert order_inserts[0]["price"] == 0.0, (
            f"Expected 0.0 for close leg, got {order_inserts[0]['price']}"
        )

    def test_open_leg_zero_price_floored_at_001(self):
        """An open leg with price=0.00 is stored as 0.01 (existing floor preserved)."""
        leg = self._make_leg("open", price=0.0)
        req = self._make_req([leg])

        inserted_rows = []

        with patch("services.user_portfolio.get_supabase") as mock_get_sb:
            mock_sb = MagicMock()
            mock_get_sb.return_value = mock_sb

            cash_mock = MagicMock()
            cash_mock.data = {"cash": 10_000.0}
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock

            pos_mock = MagicMock()
            pos_mock.data = []

            orders_table_mock = MagicMock()
            mock_sb.table.return_value = orders_table_mock
            orders_table_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock
            orders_table_mock.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = pos_mock

            def capture_insert(row):
                inserted_rows.append(row)
                return MagicMock()

            orders_table_mock.insert.side_effect = capture_insert

            from services.user_portfolio import record_trade
            record_trade("user-123", req)

        order_inserts = [r for r in inserted_rows if isinstance(r, dict) and "status" in r]
        assert order_inserts, "No orders insert was captured"
        assert order_inserts[0]["price"] == pytest.approx(0.01), (
            f"Expected 0.01 floor for open leg, got {order_inserts[0]['price']}"
        )

    def test_open_leg_positive_price_unchanged(self):
        """An open leg with price=1.50 is stored unchanged."""
        leg = self._make_leg("open", price=1.50)
        req = self._make_req([leg])

        inserted_rows = []

        with patch("services.user_portfolio.get_supabase") as mock_get_sb:
            mock_sb = MagicMock()
            mock_get_sb.return_value = mock_sb

            cash_mock = MagicMock()
            cash_mock.data = {"cash": 10_000.0}
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock

            pos_mock = MagicMock()
            pos_mock.data = []

            orders_table_mock = MagicMock()
            mock_sb.table.return_value = orders_table_mock
            orders_table_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock
            orders_table_mock.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = pos_mock

            def capture_insert(row):
                inserted_rows.append(row)
                return MagicMock()

            orders_table_mock.insert.side_effect = capture_insert

            from services.user_portfolio import record_trade
            record_trade("user-123", req)

        order_inserts = [r for r in inserted_rows if isinstance(r, dict) and "status" in r]
        assert order_inserts, "No orders insert was captured"
        assert order_inserts[0]["price"] == pytest.approx(1.50), (
            f"Expected 1.50, got {order_inserts[0]['price']}"
        )

    def test_close_leg_positive_price_unchanged(self):
        """A close leg with price=2.10 is stored as 2.10 (positive price, no clamping)."""
        leg = self._make_leg("close", price=2.10)
        req = self._make_req([leg])

        inserted_rows = []

        with patch("services.user_portfolio.get_supabase") as mock_get_sb:
            mock_sb = MagicMock()
            mock_get_sb.return_value = mock_sb

            cash_mock = MagicMock()
            cash_mock.data = {"cash": 10_000.0}
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock

            pos_mock = MagicMock()
            pos_mock.data = []

            orders_table_mock = MagicMock()
            mock_sb.table.return_value = orders_table_mock
            orders_table_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock
            orders_table_mock.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = pos_mock

            def capture_insert(row):
                inserted_rows.append(row)
                return MagicMock()

            orders_table_mock.insert.side_effect = capture_insert

            from services.user_portfolio import record_trade
            record_trade("user-123", req)

        order_inserts = [r for r in inserted_rows if isinstance(r, dict) and "status" in r]
        assert order_inserts, "No orders insert was captured"
        assert order_inserts[0]["price"] == pytest.approx(2.10), (
            f"Expected 2.10, got {order_inserts[0]['price']}"
        )

    def test_leg_role_stored_on_order(self):
        """leg_role from leg.role is stored on the inserted order row."""
        leg = self._make_leg("close", price=1.00)
        req = self._make_req([leg])

        inserted_rows = []

        with patch("services.user_portfolio.get_supabase") as mock_get_sb:
            mock_sb = MagicMock()
            mock_get_sb.return_value = mock_sb

            cash_mock = MagicMock()
            cash_mock.data = {"cash": 10_000.0}
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock

            pos_mock = MagicMock()
            pos_mock.data = []

            orders_table_mock = MagicMock()
            mock_sb.table.return_value = orders_table_mock
            orders_table_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = cash_mock
            orders_table_mock.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = pos_mock

            def capture_insert(row):
                inserted_rows.append(row)
                return MagicMock()

            orders_table_mock.insert.side_effect = capture_insert

            from services.user_portfolio import record_trade
            record_trade("user-123", req)

        order_inserts = [r for r in inserted_rows if isinstance(r, dict) and "status" in r]
        assert order_inserts, "No orders insert was captured"
        assert order_inserts[0].get("leg_role") == "close"


# ── _safe_float ──────────────────────────────────────────────────────────────

class TestSafeFloat:
    """Spot-check the _safe_float helper in the settlement module."""

    def test_nan_returns_default(self):
        import math
        from services.settlement import _safe_float
        assert _safe_float(float("nan")) == 0.0

    def test_inf_returns_default(self):
        from services.settlement import _safe_float
        assert _safe_float(float("inf")) == 0.0

    def test_none_returns_default(self):
        from services.settlement import _safe_float
        assert _safe_float(None) == 0.0

    def test_normal_float_passes_through(self):
        from services.settlement import _safe_float
        assert _safe_float(3.14) == pytest.approx(3.14)

    def test_string_float_passes_through(self):
        from services.settlement import _safe_float
        assert _safe_float("2.50") == pytest.approx(2.50)

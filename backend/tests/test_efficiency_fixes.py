"""
Tests for the five backend efficiency fixes:
  1. verify_token / require_legal_acknowledgment wrap blocking calls in asyncio.to_thread
  2. place_order / record_trade wrapped in asyncio.to_thread (routes verified by import)
  3. get_supabase() returns a module-level singleton
  4. get_iv_rank / get_directional_bias / market_context functions hit a TTL cache
  5. record_trade reads and writes portfolios.cash exactly once
"""
import os
from unittest.mock import patch
import re
import sys
import time

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


# ─────────────────────────────────────────────────────────────────────────────
# Fix 3 — get_supabase() singleton
# ─────────────────────────────────────────────────────────────────────────────

class TestGetSupabaseSingleton:
    """get_supabase() must return the same Client instance on every call."""

    def test_returns_same_instance(self, monkeypatch):
        import services.db as db_mod

        # Ensure the cache starts empty for this test.
        original_client = db_mod._client
        db_mod._client = None
        created = []

        def _mock_create(url, key):
            obj = object()
            created.append(obj)
            return obj

        monkeypatch.setattr(db_mod, "create_client", _mock_create)
        try:
            c1 = db_mod.get_supabase()
            c2 = db_mod.get_supabase()
            c3 = db_mod.get_supabase()

            assert c1 is c2 is c3, "get_supabase() should return the same object each time"
            assert len(created) == 1, "create_client should be called exactly once"
        finally:
            # Restore original state so other tests are not affected.
            db_mod._client = original_client


# ─────────────────────────────────────────────────────────────────────────────
# Fix 4 — iv_analysis TTL cache
# ─────────────────────────────────────────────────────────────────────────────

class TestIvRankCache:
    """get_iv_rank() should serve repeated calls for the same symbol from cache."""

    def _good_result(self, symbol):
        return {
            "symbol": symbol,
            "iv_rank": 42.0,
            "current_iv": 0.25,
            "iv_source": "hv_proxy",
            "iv_environment": "MEDIUM",
            "hv_30d": 0.25,
            "hv_52wk_high": 0.40,
            "hv_52wk_low": 0.15,
            "percentile_label": "HV Rank 42 — Medium IV",
        }

    def test_second_call_returns_cached_result(self, monkeypatch):
        import services.iv_analysis as iv

        iv._IV_RANK_CACHE.clear()
        call_count = [0]

        def _mock_compute(symbol):
            call_count[0] += 1
            return self._good_result(symbol)

        monkeypatch.setattr(iv, "_get_iv_rank", _mock_compute)

        r1 = iv.get_iv_rank("AAPL")
        r2 = iv.get_iv_rank("AAPL")

        assert r1 == r2
        assert call_count[0] == 1, "underlying compute should be called once per cache miss"

    def test_different_symbols_each_computed_once(self, monkeypatch):
        import services.iv_analysis as iv

        iv._IV_RANK_CACHE.clear()
        called_with = []

        def _mock_compute(symbol):
            called_with.append(symbol)
            return self._good_result(symbol)

        monkeypatch.setattr(iv, "_get_iv_rank", _mock_compute)

        iv.get_iv_rank("AAPL")
        iv.get_iv_rank("TSLA")
        iv.get_iv_rank("AAPL")  # cache hit
        iv.get_iv_rank("TSLA")  # cache hit

        assert called_with == ["AAPL", "TSLA"]

    def test_error_result_not_cached(self, monkeypatch):
        """Results with an 'error' key must not be stored so a retry fires immediately."""
        import services.iv_analysis as iv

        iv._IV_RANK_CACHE.clear()
        call_count = [0]

        def _mock_compute(symbol):
            call_count[0] += 1
            return {
                "symbol": symbol,
                "error": "yfinance timeout",
                "iv_environment": "MEDIUM",
                "iv_rank": 50.0,
                "iv_source": "hv_proxy",
                "current_iv": 0.3,
                "hv_30d": 0.3,
                "hv_52wk_high": 0.4,
                "hv_52wk_low": 0.2,
                "percentile_label": "HV Rank N/A — Medium IV",
            }

        monkeypatch.setattr(iv, "_get_iv_rank", _mock_compute)

        iv.get_iv_rank("AAPL")
        iv.get_iv_rank("AAPL")

        assert call_count[0] == 2, "error results must not be cached"

    def test_cache_expires_after_ttl(self, monkeypatch):
        import services.iv_analysis as iv

        iv._IV_RANK_CACHE.clear()
        call_count = [0]

        def _mock_compute(symbol):
            call_count[0] += 1
            return self._good_result(symbol)

        monkeypatch.setattr(iv, "_get_iv_rank", _mock_compute)

        iv.get_iv_rank("SPY")
        # Fake that the entry is older than the TTL.
        iv._IV_RANK_CACHE["SPY"]["ts"] -= iv._IV_TTL + 1
        iv.get_iv_rank("SPY")

        assert call_count[0] == 2, "expired cache entry should trigger a recompute"


class TestDirectionalBiasCache:
    """get_directional_bias() should serve repeated calls for the same symbol from cache."""

    def _good_result(self, symbol):
        return {
            "symbol": symbol,
            "price": 150.0,
            "sma20": 148.0,
            "sma50": 145.0,
            "rsi14": 55.0,
            "bias": "NEUTRAL_BULLISH",
            "strength": "MODERATE",
        }

    def test_second_call_returns_cached_result(self, monkeypatch):
        import services.iv_analysis as iv

        iv._BIAS_CACHE.clear()
        call_count = [0]

        def _mock_compute(symbol):
            call_count[0] += 1
            return self._good_result(symbol)

        monkeypatch.setattr(iv, "_get_directional_bias", _mock_compute)

        r1 = iv.get_directional_bias("AAPL")
        r2 = iv.get_directional_bias("AAPL")

        assert r1 == r2
        assert call_count[0] == 1

    def test_error_result_not_cached(self, monkeypatch):
        import services.iv_analysis as iv

        iv._BIAS_CACHE.clear()
        call_count = [0]

        def _mock_compute(symbol):
            call_count[0] += 1
            return {
                "symbol": symbol, "error": "yfinance timeout",
                "price": 0.0, "sma20": 0.0, "sma50": 0.0,
                "rsi14": 50.0, "bias": "NEUTRAL", "strength": "MODERATE",
            }

        monkeypatch.setattr(iv, "_get_directional_bias", _mock_compute)

        iv.get_directional_bias("SPY")
        iv.get_directional_bias("SPY")

        assert call_count[0] == 2


# ─────────────────────────────────────────────────────────────────────────────
# Fix 4 — market_context TTL caches
# ─────────────────────────────────────────────────────────────────────────────

class TestMarketContextCache:
    """Each market_context function should hit the TTL cache on second call."""

    def test_earnings_cache_hit(self, monkeypatch):
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol):
            call_count[0] += 1
            return {
                "next_earnings": "2026-02-01",
                "days_until_earnings": 50,
                "earnings_soon": False,
                "earnings_passed": False,
            }

        monkeypatch.setattr(mc, "_get_earnings_info", _mock)

        mc.get_earnings_info("AAPL")
        mc.get_earnings_info("AAPL")

        assert call_count[0] == 1

    def test_earnings_none_not_cached(self, monkeypatch):
        """An all-None earnings result (yfinance failure) must not be cached."""
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol):
            call_count[0] += 1
            return {"next_earnings": None, "days_until_earnings": None,
                    "earnings_soon": False, "earnings_passed": False}

        monkeypatch.setattr(mc, "_get_earnings_info", _mock)

        mc.get_earnings_info("XYZ")
        mc.get_earnings_info("XYZ")

        assert call_count[0] == 2

    def test_news_cache_hit(self, monkeypatch):
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol, max_items=6):
            call_count[0] += 1
            return [{"title": "Headline 1", "publisher": "Reuters"}]

        monkeypatch.setattr(mc, "_get_news_headlines", _mock)

        mc.get_news_headlines("AAPL")
        mc.get_news_headlines("AAPL")

        assert call_count[0] == 1

    def test_news_empty_not_cached(self, monkeypatch):
        """An empty list (exception fallback) must not be cached."""
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol, max_items=6):
            call_count[0] += 1
            return []

        monkeypatch.setattr(mc, "_get_news_headlines", _mock)

        mc.get_news_headlines("XYZ")
        mc.get_news_headlines("XYZ")

        assert call_count[0] == 2

    def test_technicals_cache_hit(self, monkeypatch):
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol):
            call_count[0] += 1
            return {"macd": 0.5, "macd_signal": 0.3, "macd_histogram": 0.2,
                    "macd_bias": "bullish", "macd_diverging": True,
                    "atr": 2.0, "atr_pct": 1.5, "volume_trend": "normal",
                    "volume_ratio_5_20": 1.0}

        monkeypatch.setattr(mc, "_get_enhanced_technicals", _mock)

        mc.get_enhanced_technicals("SPY")
        mc.get_enhanced_technicals("SPY")

        assert call_count[0] == 1

    def test_technicals_empty_not_cached(self, monkeypatch):
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol):
            call_count[0] += 1
            return {}

        monkeypatch.setattr(mc, "_get_enhanced_technicals", _mock)

        mc.get_enhanced_technicals("XYZ")
        mc.get_enhanced_technicals("XYZ")

        assert call_count[0] == 2

    def test_term_structure_cache_hit(self, monkeypatch):
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol):
            call_count[0] += 1
            return {"front_month_iv": 0.25, "back_month_iv": 0.27,
                    "front_expiry": "2026-02-21", "back_expiry": "2026-04-18",
                    "term_slope": "contango", "put_skew": 0.03, "skew_label": "normal"}

        monkeypatch.setattr(mc, "_get_iv_term_structure", _mock)

        mc.get_iv_term_structure("SPY")
        mc.get_iv_term_structure("SPY")

        assert call_count[0] == 1

    def test_term_structure_empty_not_cached(self, monkeypatch):
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol):
            call_count[0] += 1
            return {}

        monkeypatch.setattr(mc, "_get_iv_term_structure", _mock)

        mc.get_iv_term_structure("XYZ")
        mc.get_iv_term_structure("XYZ")

        assert call_count[0] == 2

    def test_cache_ttl_short_expires(self, monkeypatch):
        """An entry older than _TTL_SHORT should be recomputed."""
        import services.market_context as mc

        mc._MKTCTX_CACHE.clear()
        call_count = [0]

        def _mock(symbol):
            call_count[0] += 1
            return {"macd": 0.1, "macd_signal": 0.0, "macd_histogram": 0.1,
                    "macd_bias": "bullish", "macd_diverging": False,
                    "atr": 1.0, "atr_pct": 0.5, "volume_trend": "normal",
                    "volume_ratio_5_20": 1.0}

        monkeypatch.setattr(mc, "_get_enhanced_technicals", _mock)

        mc.get_enhanced_technicals("TSLA")
        # Artificially age the cache entry.
        mc._MKTCTX_CACHE["technicals:TSLA"]["ts"] -= mc._TTL_SHORT + 1
        mc.get_enhanced_technicals("TSLA")

        assert call_count[0] == 2


# ─────────────────────────────────────────────────────────────────────────────
# Fix 5 — record_trade cash I/O batching
# ─────────────────────────────────────────────────────────────────────────────

class _Op:
    """Minimal chainable query builder that records operations."""

    def __init__(self, db, table, op, payload=None):
        self._db = db       # the _FakeDb instance (holds initial_cash)
        self._table = table
        self._op = op
        self._payload = payload

    # Allow arbitrary .eq() / .single() chaining without breaking.
    def eq(self, *_):
        return self

    def single(self):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        self._db.ops.append((self._table, self._op, self._payload))
        if self._table == "portfolios" and self._op == "select":
            return type("R", (), {"data": {"cash": self._db.initial_cash}})()
        if self._table == "portfolios" and self._op == "select_star":
            # ensure_portfolio path: return a row so it skips the INSERT branch
            return type("R", (), {"data": [{"user_id": "u1", "cash": self._db.initial_cash}]})()
        if self._table == "positions" and self._op == "select":
            return type("R", (), {"data": []})()
        return type("R", (), {"data": []})()


class _TableProxy:
    def __init__(self, db, name):
        self._db = db
        self._name = name

    def select(self, fields="*"):
        op = "select_star" if fields == "*" else "select"
        return _Op(self._db, self._name, op)

    def update(self, payload):
        return _Op(self._db, self._name, "update", payload)

    def insert(self, payload):
        return _Op(self._db, self._name, "insert", payload)

    def delete(self):
        return _Op(self._db, self._name, "delete")


class _FakeDb:
    """Minimal Supabase stand-in that records all table operations."""

    def __init__(self, initial_cash=5000.0):
        self.initial_cash = initial_cash
        self.ops: list = []

    def table(self, name):
        return _TableProxy(self, name)


class _Leg:
    def __init__(self, action, qty, price, strike, option_type):
        self.action = action
        self.quantity = qty
        self.price = price
        self.strike = strike
        self.option_type = option_type
        self.role = None


class _TradeReq:
    symbol = "SPY"
    expiry = "2027-01-15"
    strategy_key = "bull_call_spread"
    strategy_name = "Bull Call Spread"
    profit_target_pct = 50.0
    narrative_json = None

    def __init__(self, legs):
        self.legs = legs


class TestRecordTradeCashBatch:
    """
    record_trade must read portfolios.cash exactly once and write it exactly once,
    regardless of how many legs are in the trade.
    """

    def _run(self, monkeypatch, legs, initial_cash=10000.0):
        from services import user_portfolio

        db = _FakeDb(initial_cash=initial_cash)

        # Patch get_supabase so both the top-level sb AND ensure_portfolio use the same fake.
        monkeypatch.setattr(user_portfolio, "get_supabase", lambda: db)

        req = _TradeReq(legs)
        result = user_portfolio.record_trade("u1", req)
        return result, list(db.ops)  # copy so caller can't mutate

    def test_single_leg_one_read_one_write(self, monkeypatch):
        legs = [_Leg("buy", 1, 5.00, 450.0, "call")]
        result, ops = self._run(monkeypatch, legs, initial_cash=10000.0)

        portfolio_selects = [o for o in ops if o[0] == "portfolios" and o[1] == "select"]
        portfolio_updates = [o for o in ops if o[0] == "portfolios" and o[1] == "update"]

        assert len(portfolio_selects) == 1, "cash must be read exactly once"
        assert len(portfolio_updates) == 1, "cash must be written exactly once"
        assert result["recorded"] == 1

    def test_two_leg_strategy_still_one_read_one_write(self, monkeypatch):
        legs = [
            _Leg("buy",  1, 5.00, 450.0, "call"),
            _Leg("sell", 1, 2.00, 460.0, "call"),
        ]
        result, ops = self._run(monkeypatch, legs, initial_cash=10000.0)

        portfolio_selects = [o for o in ops if o[0] == "portfolios" and o[1] == "select"]
        portfolio_updates = [o for o in ops if o[0] == "portfolios" and o[1] == "update"]

        assert len(portfolio_selects) == 1, "cash must be read exactly once"
        assert len(portfolio_updates) == 1, "cash must be written exactly once"
        assert result["recorded"] == 2

    def test_four_leg_strategy_still_one_read_one_write(self, monkeypatch):
        legs = [
            _Leg("buy",  1, 3.00, 440.0, "call"),
            _Leg("sell", 1, 1.50, 450.0, "call"),
            _Leg("sell", 1, 1.50, 460.0, "put"),
            _Leg("buy",  1, 3.00, 470.0, "put"),
        ]
        result, ops = self._run(monkeypatch, legs, initial_cash=50000.0)

        portfolio_selects = [o for o in ops if o[0] == "portfolios" and o[1] == "select"]
        portfolio_updates = [o for o in ops if o[0] == "portfolios" and o[1] == "update"]

        assert len(portfolio_selects) == 1
        assert len(portfolio_updates) == 1
        assert result["recorded"] == 4

    def test_cash_total_is_correct_net_debit(self, monkeypatch):
        """Net debit of a bull call spread: buy $5 sell $2 → net -$300 per spread."""
        legs = [
            _Leg("buy",  1, 5.00, 450.0, "call"),
            _Leg("sell", 1, 2.00, 460.0, "call"),
        ]
        result, ops = self._run(monkeypatch, legs, initial_cash=10000.0)

        update_op = next(o for o in ops if o[0] == "portfolios" and o[1] == "update")
        final_cash = update_op[2]["cash"]

        # buy 1 × $5 × 100 = -$500; sell 1 × $2 × 100 = +$200 → net -$300
        assert final_cash == pytest.approx(10000.0 - 500.0 + 200.0, abs=0.01)

    def test_order_inserts_still_per_leg(self, monkeypatch):
        """Order rows must still be inserted one per leg (not batched)."""
        legs = [
            _Leg("buy",  2, 4.00, 450.0, "call"),
            _Leg("sell", 2, 2.00, 460.0, "call"),
        ]
        result, ops = self._run(monkeypatch, legs)

        order_inserts = [o for o in ops if o[0] == "orders" and o[1] == "insert"]
        assert len(order_inserts) == 2, "one order row per leg"


class TestAuthCallsUseUnsharedClient:
    """
    supabase-py swaps a client's Authorization header to the user's token on
    sign-in/refresh, so session-changing auth calls must never run on the shared
    service-role client returned by get_supabase().
    """

    _MUTATING = re.compile(
        r"sb\.auth\.(sign_in_with_oauth|sign_in_with_password|"
        r"exchange_code_for_session|refresh_session|sign_out)\b"
    )

    @pytest.mark.parametrize("rel", ["routes/auth_routes.py", "services/auth_utils.py"])
    def test_session_changing_calls_use_new_auth_client(self, rel):
        root = os.path.join(os.path.dirname(__file__), "..")
        lines = open(os.path.join(root, rel)).read().split("\n")
        found = 0
        for i, line in enumerate(lines):
            if not self._MUTATING.search(line):
                continue
            found += 1
            j = i
            while j >= 0 and not re.search(r"\bsb = ", lines[j]):
                j -= 1
            assert "new_auth_client()" in lines[j], f"{rel}:{i + 1} uses the shared client"
        assert found > 0

    def test_new_auth_client_is_not_the_shared_client(self):
        import services.db as db
        with patch.object(db, "create_client", side_effect=lambda *a, **k: object()):
            db._client = None
            shared = db.get_supabase()
            assert db.new_auth_client() is not shared
            assert db.new_auth_client() is not db.new_auth_client()
            db._client = None

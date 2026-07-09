"""
Tests for greeks.fill_quote — the bid/ask corrector for free-data problems.

Regression suite for the deep-ITM stale-quote bug (TSLA chain showing call
quotes above the stock price): yfinance carries stale prints on illiquid
deep-ITM strikes, both as "real" bid/ask and as lastPrice used by the
estimation fallback. fill_quote must enforce no-arbitrage bounds
(intrinsic <= price <= S for calls, <= K for puts) and reject stale
lastPrice whose time value is implausible.
"""
from services.greeks import fill_quote

SPOT = 394.06
T = 436 / 365.0  # ~14 months to expiry


def _contract(strike, bid, ask, last, iv=0.0):
    return {
        "strike": strike,
        "bid": bid,
        "ask": ask,
        "lastPrice": last,
        "impliedVolatility": iv,
    }


class TestRealQuotesPassThrough:
    def test_atm_call_untouched(self):
        bid, ask, src = fill_quote(_contract(400, 42.10, 42.60, 42.30, 0.55), SPOT, T, "call")
        assert (bid, ask, src) == (42.10, 42.60, "market")

    def test_otm_call_untouched(self):
        bid, ask, src = fill_quote(_contract(450, 21.05, 21.50, 21.20, 0.52), SPOT, T, "call")
        assert (bid, ask, src) == (21.05, 21.50, "market")

    def test_deep_itm_put_sane_quote_untouched(self):
        bid, ask, src = fill_quote(_contract(500, 108.00, 111.00, 109.50, 0.48), SPOT, T, "put")
        assert (bid, ask, src) == (108.00, 111.00, "market")

    def test_deep_itm_call_sane_quote_untouched(self):
        # Screenshot strike-40 row: real quote below spot, above intrinsic.
        bid, ask, src = fill_quote(_contract(40, 355.00, 364.00, 395.20, 3.59), SPOT, T, "call")
        assert (bid, ask, src) == (355.00, 364.00, "market")


class TestMissingQuotes:
    def test_one_sided_missing_bid_estimated(self):
        bid, ask, src = fill_quote(_contract(100, 0.0, 2.50, 2.30, 0.30), 100.0, 0.1, "call")
        assert src == "estimated"
        assert 0 < bid <= ask

    def test_both_sides_missing_estimated(self):
        bid, ask, src = fill_quote(_contract(100, 0.0, 0.0, 2.30, 0.30), 100.0, 0.1, "call")
        assert src == "estimated"
        assert 0 < bid <= ask


class TestNoArbitrageCeiling:
    """A call is never worth more than the stock; a put never more than its strike."""

    def test_market_bid_above_spot_is_reestimated(self):
        # Screenshot strike-15 row: "real" yfinance quote 411/421 with spot 394.06.
        bid, ask, src = fill_quote(_contract(15, 411.00, 421.00, 421.02, 0.0), SPOT, T, "call")
        assert src == "estimated"
        assert bid <= SPOT and ask <= SPOT
        assert bid >= SPOT - 15  # still floored at intrinsic

    def test_stale_lastprice_above_spot_is_rejected(self):
        # Screenshot strike-10 row: missing quote, lastPrice 404.47 > spot.
        # Old code produced bid 394.36 (above the stock price).
        bid, ask, src = fill_quote(_contract(10, 0.0, 0.0, 404.47, 0.0), SPOT, T, "call")
        assert src == "estimated"
        assert bid <= SPOT and ask <= SPOT
        assert bid >= SPOT - 10

    def test_put_bid_above_strike_is_reestimated(self):
        bid, ask, src = fill_quote(_contract(20, 25.00, 27.00, 26.00, 0.0), SPOT, T, "put")
        assert src == "estimated"
        assert bid <= 20 and ask <= 20

    def test_deep_itm_chain_is_monotonic_and_bounded(self):
        # Full replay of the broken screenshot rows: mixed missing/stale quotes.
        rows = [
            (5, 0.0, 408.72, 398.75, 0.0),
            (10, 0.0, 0.0, 404.47, 0.0),
            (15, 411.00, 421.00, 421.02, 0.0),
            (20, 397.15, 405.20, 429.13, 0.0),
            (25, 0.0, 393.29, 383.70, 0.0),
            (30, 402.05, 409.55, 450.85, 0.0),
            (35, 397.15, 404.40, 444.10, 0.0),
            (40, 355.00, 364.00, 395.20, 3.59),
        ]
        prev_bid = None
        for strike, b, a, last, iv in rows:
            bid, ask, _ = fill_quote(_contract(strike, b, a, last, iv), SPOT, T, "call")
            intrinsic = SPOT - strike
            assert intrinsic <= bid <= SPOT, f"strike {strike}: bid {bid} out of bounds"
            assert ask <= SPOT, f"strike {strike}: ask {ask} above spot"
            assert bid <= ask, f"strike {strike}: inverted spread"
            if prev_bid is not None:
                assert bid <= prev_bid, f"strike {strike}: bid not monotonic"
            prev_bid = bid


class TestPlausibleLastPriceStillUsed:
    def test_fresh_lastprice_within_band_is_used(self):
        # OTM contract, missing quote, lastPrice close to theoretical value:
        # estimate should derive from lastPrice (mid * 0.975 / 1.025).
        bid, ask, src = fill_quote(_contract(100, 0.0, 0.0, 2.30, 0.30), 100.0, 0.1, "call")
        assert src == "estimated"
        assert abs(bid - 2.30 * 0.975) < 0.02
        assert abs(ask - 2.30 * 1.025) < 0.02


class TestIntrinsicFloor:
    def test_below_intrinsic_quote_clamped(self):
        # Deep-ITM call quoted below intrinsic (stale below-intrinsic print).
        bid, ask, src = fill_quote(_contract(300, 80.00, 82.00, 81.00, 0.40), SPOT, T, "call")
        assert bid >= SPOT - 300
        assert ask >= bid
        assert src == "estimated"

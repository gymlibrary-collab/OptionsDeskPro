"""
Supplementary market context: earnings dates, news headlines, options flow,
IV term structure/skew, and enhanced technicals (MACD, ATR, volume trend).
"""
import logging
from datetime import date
import yfinance as yf

logger = logging.getLogger(__name__)


def get_earnings_info(symbol: str) -> dict:
    """Return next earnings date and days until it."""
    try:
        ticker = yf.Ticker(symbol)
        cal = ticker.calendar
        if cal is not None and not (hasattr(cal, 'empty') and cal.empty):
            candidates = []
            # Try as DataFrame (older yfinance)
            try:
                if hasattr(cal, 'loc') and "Earnings Date" in cal.index:
                    for d in cal.loc["Earnings Date"]:
                        try:
                            ed = d.date() if hasattr(d, 'date') else d
                            days = (ed - date.today()).days
                            if days >= -3:
                                candidates.append((days, ed))
                        except Exception:
                            continue
            except Exception:
                pass
            # Try as dict (newer yfinance)
            if isinstance(cal, dict) and "Earnings Date" in cal:
                dates = cal["Earnings Date"]
                if not hasattr(dates, '__iter__'):
                    dates = [dates]
                for d in dates:
                    try:
                        ed = d.date() if hasattr(d, 'date') else d
                        days = (ed - date.today()).days
                        if days >= -3:
                            candidates.append((days, ed))
                    except Exception:
                        continue
            if candidates:
                future = [(days, ed) for days, ed in candidates if days >= 0]
                chosen_days, chosen_ed = min(future) if future else min(candidates)
                return {
                    "next_earnings": chosen_ed.isoformat(),
                    "days_until_earnings": chosen_days,
                    "earnings_soon": 0 <= chosen_days <= 21,
                    "earnings_passed": chosen_days < 0,
                }
    except Exception as e:
        logger.warning(f"Earnings info failed for {symbol}: {e}")
    return {"next_earnings": None, "days_until_earnings": None, "earnings_soon": False, "earnings_passed": False}


def get_news_headlines(symbol: str, max_items: int = 6) -> list:
    """Return recent news headlines for the symbol."""
    try:
        ticker = yf.Ticker(symbol)
        news = ticker.news or []
        headlines = []
        for item in news[:max_items]:
            # Support both old and new yfinance news formats
            title = (
                item.get("title")
                or (item.get("content") or {}).get("title", "")
            )
            publisher = (
                item.get("publisher")
                or ((item.get("content") or {}).get("provider") or {}).get("displayName", "")
            )
            if title:
                headlines.append({"title": title, "publisher": publisher})
        return headlines
    except Exception as e:
        logger.warning(f"News headlines failed for {symbol}: {e}")
        return []


def get_options_flow(chain: dict) -> dict:
    """Analyse options chain for directional flow and unusual volume."""
    calls = chain.get("calls", [])
    puts = chain.get("puts", [])

    call_vol = sum(c.get("volume") or 0 for c in calls)
    put_vol = sum(p.get("volume") or 0 for p in puts)
    call_oi = sum(c.get("openInterest") or 0 for c in calls)
    put_oi = sum(p.get("openInterest") or 0 for p in puts)

    pcr_vol = round(put_vol / call_vol, 2) if call_vol > 0 else 1.0
    pcr_oi = round(put_oi / call_oi, 2) if call_oi > 0 else 1.0

    # Contracts where volume exceeds open interest (new positioning)
    unusual_calls = [
        c for c in calls
        if (c.get("volume") or 0) > max((c.get("openInterest") or 0), 100) and (c.get("volume") or 0) > 500
    ]
    unusual_puts = [
        p for p in puts
        if (p.get("volume") or 0) > max((p.get("openInterest") or 0), 100) and (p.get("volume") or 0) > 500
    ]

    if pcr_vol < 0.6:
        flow_bias = "strongly_bullish"
    elif pcr_vol < 0.85:
        flow_bias = "bullish"
    elif pcr_vol > 1.5:
        flow_bias = "strongly_bearish"
    elif pcr_vol > 1.1:
        flow_bias = "bearish"
    else:
        flow_bias = "neutral"

    return {
        "call_volume": call_vol,
        "put_volume": put_vol,
        "total_volume": call_vol + put_vol,
        "put_call_ratio_volume": pcr_vol,
        "put_call_ratio_oi": pcr_oi,
        "unusual_call_strikes": [c.get("strike") for c in unusual_calls[:3]],
        "unusual_put_strikes": [p.get("strike") for p in unusual_puts[:3]],
        "flow_bias": flow_bias,
    }


def get_enhanced_technicals(symbol: str) -> dict:
    """Return MACD, ATR, and volume trend from recent price history."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="3mo")
        if hist.empty or len(hist) < 30:
            return {}

        close = hist["Close"]
        volume = hist["Volume"]
        high = hist["High"]
        low = hist["Low"]

        # MACD (12, 26, 9)
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        macd_line = ema12 - ema26
        signal_line = macd_line.ewm(span=9, adjust=False).mean()
        macd_hist_series = macd_line - signal_line

        macd_val = float(macd_line.iloc[-1])
        signal_val = float(signal_line.iloc[-1])
        hist_val = float(macd_hist_series.iloc[-1])
        hist_prev = float(macd_hist_series.iloc[-2]) if len(macd_hist_series) >= 2 else hist_val
        macd_diverging = hist_val > hist_prev  # histogram expanding = momentum building

        # ATR (14-day)
        prev_close = close.shift(1)
        tr_high_low = high - low
        tr_high_pc = (high - prev_close).abs()
        tr_low_pc = (low - prev_close).abs()
        tr = tr_high_low.combine(tr_high_pc, max).combine(tr_low_pc, max)
        atr = float(tr.rolling(14).mean().iloc[-1])
        atr_pct = round(atr / float(close.iloc[-1]) * 100, 2)

        # Volume trend: 5-day vs 20-day average
        vol_5 = float(volume.rolling(5).mean().iloc[-1])
        vol_20 = float(volume.rolling(20).mean().iloc[-1])
        vol_ratio = round(vol_5 / vol_20, 2) if vol_20 > 0 else 1.0
        volume_trend = "rising" if vol_ratio > 1.2 else "falling" if vol_ratio < 0.8 else "normal"

        macd_bias = "bullish" if macd_val > signal_val else "bearish"

        return {
            "macd": round(macd_val, 4),
            "macd_signal": round(signal_val, 4),
            "macd_histogram": round(hist_val, 4),
            "macd_bias": macd_bias,
            "macd_diverging": macd_diverging,
            "atr": round(atr, 2),
            "atr_pct": atr_pct,
            "volume_trend": volume_trend,
            "volume_ratio_5_20": vol_ratio,
        }
    except Exception as e:
        logger.warning(f"Enhanced technicals failed for {symbol}: {e}")
        return {}


def get_iv_term_structure(symbol: str) -> dict:
    """Compare front-month and back-month IV; compute put skew."""
    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options
        if not expirations or len(expirations) < 2:
            return {}

        def _median_iv(records):
            ivs = [r.get("impliedVolatility") or 0 for r in records]
            ivs = [v for v in ivs if 0.01 < v < 5.0]
            return float(sorted(ivs)[len(ivs) // 2]) if ivs else 0.0

        def _chain_to_records(df):
            return df.to_dict("records") if df is not None and not df.empty else []

        front = ticker.option_chain(expirations[0])
        front_calls = _chain_to_records(front.calls)
        front_puts = _chain_to_records(front.puts)

        back_idx = min(2, len(expirations) - 1)
        back = ticker.option_chain(expirations[back_idx])
        back_calls = _chain_to_records(back.calls)

        front_iv = _median_iv(front_calls)
        back_iv = _median_iv(back_calls)

        # Put skew: OTM put IV vs ATM call IV
        otm_puts = [p for p in front_puts if not p.get("inTheMoney", True)]
        # Estimate spot from the ITM/OTM boundary in the calls chain; yfinance
        # does not populate a delta column so sorting by delta is a no-op.
        itm_strikes = [c["strike"] for c in front_calls if c.get("inTheMoney")]
        otm_strikes = [c["strike"] for c in front_calls if not c.get("inTheMoney")]
        if itm_strikes and otm_strikes:
            spot_est = (max(itm_strikes) + min(otm_strikes)) / 2.0
        else:
            strikes = sorted(c["strike"] for c in front_calls if c.get("strike", 0) > 0)
            spot_est = strikes[len(strikes) // 2] if strikes else 0
        atm_calls = sorted(front_calls, key=lambda c: abs(c.get("strike", 0) - spot_est)) if spot_est > 0 else front_calls
        otm_put_iv = _median_iv(otm_puts[:6]) if otm_puts else front_iv
        atm_call_iv = _median_iv(atm_calls[:4]) if atm_calls else front_iv
        skew = round(otm_put_iv - atm_call_iv, 4) if atm_call_iv > 0 else 0.0
        skew_label = "elevated" if skew > 0.05 else "low" if skew < 0.01 else "normal"

        if back_iv > front_iv * 1.03:
            term_slope = "contango"
        elif front_iv > back_iv * 1.03:
            term_slope = "backwardation"
        else:
            term_slope = "flat"

        return {
            "front_month_iv": round(front_iv, 4),
            "back_month_iv": round(back_iv, 4),
            "front_expiry": expirations[0],
            "back_expiry": expirations[back_idx],
            "term_slope": term_slope,
            "put_skew": skew,
            "skew_label": skew_label,
        }
    except Exception as e:
        logger.warning(f"IV term structure failed for {symbol}: {e}")
        return {}


def get_full_market_context(symbol: str, chain: dict | None = None) -> dict:
    """Aggregate all supplementary context into one dict."""
    return {
        "earnings": get_earnings_info(symbol),
        "news": get_news_headlines(symbol),
        "technicals": get_enhanced_technicals(symbol),
        "term_structure": get_iv_term_structure(symbol),
        "flow": get_options_flow(chain) if chain else {},
    }

import yfinance as yf
import time
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Simple in-memory cache to avoid rate limiting
_cache: dict = {}
_cache_ttl = 30  # seconds


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and (time.time() - entry["ts"]) < _cache_ttl:
        return entry["data"]
    return None


def _cache_set(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


def get_quote(symbol: str) -> dict:
    cache_key = f"quote:{symbol}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        hist = ticker.history(period="2d")

        if hist.empty:
            return _empty_quote(symbol)

        last_close = float(hist["Close"].iloc[-1])
        prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else last_close
        change = last_close - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0.0

        volume = int(hist["Volume"].iloc[-1]) if "Volume" in hist.columns else 0

        try:
            market_cap = getattr(info, "market_cap", None) or 0
        except Exception:
            market_cap = 0

        result = {
            "symbol": symbol.upper(),
            "price": round(last_close, 2),
            "previousClose": round(prev_close, 2),
            "change": round(change, 2),
            "changePercent": round(change_pct, 2),
            "volume": volume,
            "marketCap": market_cap,
        }
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        logger.warning(f"Failed to get quote for {symbol}: {e}")
        return _empty_quote(symbol)


def _empty_quote(symbol: str) -> dict:
    return {
        "symbol": symbol.upper(),
        "price": 0.0,
        "previousClose": 0.0,
        "change": 0.0,
        "changePercent": 0.0,
        "volume": 0,
        "marketCap": 0,
    }


def get_options_chain(symbol: str, expiry: Optional[str] = None) -> dict:
    cache_key = f"chain:{symbol}:{expiry}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options

        if not expirations:
            return {"expirations": [], "calls": [], "puts": [], "expiry": None}

        if expiry is None or expiry not in expirations:
            expiry = expirations[0]

        chain = ticker.option_chain(expiry)
        calls_df = chain.calls
        puts_df = chain.puts

        def df_to_list(df) -> list:
            rows = []
            for _, row in df.iterrows():
                rows.append({
                    "contractSymbol": str(row.get("contractSymbol", "")),
                    "strike": float(row.get("strike", 0)),
                    "lastPrice": float(row.get("lastPrice", 0)),
                    "bid": float(row.get("bid", 0)),
                    "ask": float(row.get("ask", 0)),
                    "change": float(row.get("change", 0)),
                    "percentChange": float(row.get("percentChange", 0)),
                    "volume": int(row.get("volume", 0) or 0),
                    "openInterest": int(row.get("openInterest", 0) or 0),
                    "impliedVolatility": float(row.get("impliedVolatility", 0)),
                    "inTheMoney": bool(row.get("inTheMoney", False)),
                })
            return rows

        result = {
            "expirations": list(expirations),
            "expiry": expiry,
            "calls": df_to_list(calls_df),
            "puts": df_to_list(puts_df),
        }
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        logger.warning(f"Failed to get options chain for {symbol}: {e}")
        return {"expirations": [], "calls": [], "puts": [], "expiry": None}


def synthetic_options_chain(symbol: str, spot: float, iv: float) -> dict:
    """
    Build a Black-Scholes options chain when Yahoo Finance is blocked from this IP.
    Uses the stock's historically-computed IV. Prices and strikes are realistic.
    Flagged with _synthetic=True so narratives can add a disclaimer.
    """
    from datetime import date, timedelta
    from math import log, sqrt, exp

    try:
        from scipy.stats import norm
    except ImportError:
        return {"expirations": [], "expiry": None, "calls": [], "puts": [], "_synthetic": True}

    spot = max(float(spot), 0.01)
    iv   = max(min(float(iv), 3.0), 0.05)
    r    = 0.05

    if   spot < 20:   inc = 0.5
    elif spot < 50:   inc = 1.0
    elif spot < 200:  inc = 2.5
    elif spot < 500:  inc = 5.0
    else:             inc = 10.0

    def _next_friday(d: date) -> date:
        skip = (4 - d.weekday()) % 7
        return d + timedelta(days=skip or 7)

    today = date.today()
    expirations = sorted({
        _next_friday(today + timedelta(days=d)).isoformat()
        for d in [21, 35, 45, 63, 90]
    })

    def _dte(s: str) -> int:
        try: return max(0, (date.fromisoformat(s) - today).days)
        except: return 0

    target_exp = min(expirations, key=lambda e: abs(_dte(e) - 45))
    T = max(_dte(target_exp), 1) / 365.0

    atm = round(spot / inc) * inc
    strikes = sorted({
        round(atm + inc * i, 2)
        for i in range(-15, 16)
        if atm + inc * i > 0
    })

    def _bs(S: float, K: float, otype: str) -> float:
        try:
            d1 = (log(S / K) + (r + 0.5 * iv * iv) * T) / (iv * sqrt(T))
            d2 = d1 - iv * sqrt(T)
            if otype == "call":
                return S * norm.cdf(d1) - K * exp(-r * T) * norm.cdf(d2)
            return K * exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        except Exception:
            return max(0.01, (S - K) if otype == "call" else (K - S))

    def _make(K: float, otype: str) -> dict:
        price = float(max(0.01, _bs(spot, K, otype)))
        bid   = round(max(0.01, price * 0.95), 2)
        ask   = round(price * 1.05, 2)
        itm   = (K < spot) if otype == "call" else (K > spot)
        tag   = "C" if otype == "call" else "P"
        return {
            "contractSymbol":  f"{symbol}{target_exp.replace('-','')}{tag}{int(K*1000):08d}",
            "strike":          float(K),
            "lastPrice":       round((bid + ask) / 2, 2),
            "bid":             float(bid),
            "ask":             float(ask),
            "change":          0.0,
            "percentChange":   0.0,
            "volume":          0,
            "openInterest":    0,
            "impliedVolatility": float(iv),
            "inTheMoney":      itm,
        }

    return {
        "expirations": expirations,
        "expiry":      target_exp,
        "calls":       [_make(K, "call") for K in strikes],
        "puts":        [_make(K, "put")  for K in strikes],
        "_synthetic":  True,
    }


def get_option_price(symbol: str, expiry: str, strike: float, option_type: str) -> float:
    try:
        chain = get_options_chain(symbol, expiry)
        contracts = chain["calls"] if option_type.lower() == "call" else chain["puts"]
        for c in contracts:
            if abs(c["strike"] - strike) < 0.01:
                bid = c["bid"]
                ask = c["ask"]
                if bid > 0 and ask > 0:
                    return round((bid + ask) / 2, 2)
                if c["lastPrice"] > 0:
                    return float(c["lastPrice"])
        return 0.0
    except Exception as e:
        logger.warning(f"Failed to get option price: {e}")
        return 0.0

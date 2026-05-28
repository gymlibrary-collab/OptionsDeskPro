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

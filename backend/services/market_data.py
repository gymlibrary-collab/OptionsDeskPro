import yfinance as yf
import time
import math
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def _safe_int(val, default: int = 0) -> int:
    try:
        if val is None:
            return default
        f = float(val)
        return default if math.isnan(f) or math.isinf(f) else int(f)
    except (ValueError, TypeError):
        return default


def _safe_float(val, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        f = float(val)
        return default if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return default

_cache: dict = {}
_TTL_QUOTE = 30      # 30 s — quotes need to be fresh
_TTL_CHAIN = 300     # 5 min — chains are expensive; positions/risk/options tab share the cache


def _cache_get(key: str, ttl: int = _TTL_QUOTE) -> Optional[dict]:
    entry = _cache.get(key)
    if not entry:
        return None
    if (time.time() - entry["ts"]) < ttl:
        return entry["data"]
    return None


def _cache_set(key: str, data: dict):
    _cache[key] = {"data": data, "ts": time.time()}


# ── yfinance (options chain source) ──────────────────────────────────────────

def _yfinance_chain(symbol: str, expiry: Optional[str] = None) -> Optional[dict]:
    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options
        if not expirations:
            return None

        if expiry is None or expiry not in expirations:
            # Skip today's expiry — 0-DTE options have stale/unreliable bid/ask and zero greeks.
            # Also skip thin expirations (< 20 total contracts on either side) in favour of the
            # next date that has a full chain, up to a 4-expiry look-ahead.  This avoids landing
            # on holiday-adjacent or exotic expirations (e.g. QQQ on the Monday after Juneteenth)
            # that yfinance returns but which have very sparse data.
            today = datetime.utcnow().strftime("%Y-%m-%d")
            future = [e for e in expirations if e > today]
            if not future:
                expiry = expirations[0]
            else:
                expiry = future[0]  # default: nearest future
                for candidate in future[:4]:
                    try:
                        c = ticker.option_chain(candidate)
                        n_calls = len(c.calls) if c.calls is not None else 0
                        n_puts = len(c.puts) if c.puts is not None else 0
                        if max(n_calls, n_puts) >= 20:
                            expiry = candidate
                            break
                    except Exception:
                        continue

        chain = ticker.option_chain(expiry)

        def df_to_list(df) -> list:
            rows = []
            for _, row in df.iterrows():
                # Raw quotes only. Missing/stale bid-ask is corrected downstream
                # in greeks.fill_quote (BS theoretical + intrinsic-value floor),
                # where spot price and time-to-expiry are available.
                rows.append({
                    "contractSymbol":    str(row.get("contractSymbol", "")),
                    "strike":            _safe_float(row.get("strike")),
                    "lastPrice":         _safe_float(row.get("lastPrice")),
                    "bid":               _safe_float(row.get("bid")),
                    "ask":               _safe_float(row.get("ask")),
                    "change":            _safe_float(row.get("change")),
                    "percentChange":     _safe_float(row.get("percentChange")),
                    "volume":            _safe_int(row.get("volume")),
                    "openInterest":      _safe_int(row.get("openInterest")),
                    "impliedVolatility": _safe_float(row.get("impliedVolatility")),
                    "inTheMoney":        bool(row.get("inTheMoney", False)),
                })
            return rows

        return {
            "expirations": list(expirations),
            "expiry":      expiry,
            "calls":       df_to_list(chain.calls),
            "puts":        df_to_list(chain.puts),
            # Underlying spot price from the same API response — more reliable
            # than a separate get_quote call and avoids S=0 when that call fails.
            "underlying_price": _safe_float(
                (chain.underlying or {}).get("regularMarketPrice") or
                (chain.underlying or {}).get("ask") or
                (chain.underlying or {}).get("bid")
            ),
        }
    except Exception as e:
        logger.warning("yfinance chain failed for %s: %s", symbol, e)
        return None


# ── Public API ───────────────────────────────────────────────────────────────

def get_quote(symbol: str) -> dict:
    cache_key = f"quote:{symbol}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        hist = ticker.history(period="2d")

        # Prefer the real-time last price from fast_info; fall back to the
        # most recent daily close only if it's unavailable.
        last_price = None
        try:
            lp = getattr(info, "last_price", None)
            if lp is not None:
                lp = float(lp)
                if lp > 0 and not (math.isnan(lp) or math.isinf(lp)):
                    last_price = lp
        except Exception:
            last_price = None

        hist_close = float(hist["Close"].iloc[-1]) if not hist.empty else 0.0

        if last_price is None:
            if hist.empty:
                return _empty_quote(symbol)
            last_price = hist_close

        # Previous close: prefer fast_info, else the prior daily bar.
        prev_close = None
        try:
            pc = getattr(info, "previous_close", None)
            if pc is not None:
                pc = float(pc)
                if pc > 0 and not (math.isnan(pc) or math.isinf(pc)):
                    prev_close = pc
        except Exception:
            prev_close = None
        if prev_close is None:
            prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else last_price

        change = last_price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0.0
        volume = int(hist["Volume"].iloc[-1]) if (not hist.empty and "Volume" in hist.columns) else 0

        try:
            market_cap = getattr(info, "market_cap", None) or 0
        except Exception:
            market_cap = 0

        result = {
            "symbol":        symbol.upper(),
            "price":         round(last_price, 2),
            "previousClose": round(prev_close, 2),
            "change":        round(change, 2),
            "changePercent": round(change_pct, 2),
            "volume":        volume,
            "marketCap":     market_cap,
        }
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        logger.warning("Failed to get quote for %s: %s", symbol, e)
        return _empty_quote(symbol)


def _empty_quote(symbol: str) -> dict:
    return {"symbol": symbol.upper(), "price": 0.0, "previousClose": 0.0,
            "change": 0.0, "changePercent": 0.0, "volume": 0, "marketCap": 0}


def get_options_chain(symbol: str, expiry: Optional[str] = None) -> dict:
    cache_key = f"chain:{symbol}:{expiry}"
    cached = _cache_get(cache_key, ttl=_TTL_CHAIN)
    if cached:
        return cached

    result = _yfinance_chain(symbol, expiry)
    if result:
        _cache_set(cache_key, result)
        return result
    return {"expirations": [], "calls": [], "puts": [], "expiry": None}


def get_option_price(symbol: str, expiry: str, strike: float, option_type: str) -> float:
    try:
        chain = get_options_chain(symbol, expiry)
        contracts = chain["calls"] if option_type.lower() == "call" else chain["puts"]
        for c in contracts:
            if abs(c["strike"] - strike) < 0.01:
                bid, ask = c.get("bid", 0), c.get("ask", 0)
                if bid > 0 and ask > 0:
                    return round((bid + ask) / 2, 2)
                last = c.get("lastPrice", 0)
                if last > 0:
                    return float(last)
        return 0.0
    except Exception as e:
        logger.warning("Failed to get option price: %s", e)
        return 0.0


def synthetic_options_chain(symbol: str, spot: float, iv: float) -> dict:
    """
    Black-Scholes synthetic chain — last resort when yfinance fails.
    Flagged with _synthetic=True so callers can add a disclaimer.
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

    if   spot < 20:  inc = 0.5
    elif spot < 50:  inc = 1.0
    elif spot < 200: inc = 2.5
    elif spot < 500: inc = 5.0
    else:            inc = 10.0

    from calendar import monthcalendar, FRIDAY as _FRI

    def _third_friday(year: int, month: int) -> date:
        weeks = monthcalendar(year, month)
        fridays = [w[_FRI] for w in weeks if w[_FRI] != 0]
        return date(year, month, fridays[2])

    today = date.today()
    expirations = []
    y, m = today.year, today.month
    for _ in range(7):
        m += 1
        if m > 12:
            m, y = 1, y + 1
        tf = _third_friday(y, m)
        if tf > today:
            expirations.append(tf.isoformat())
        if len(expirations) == 6:
            break
    expirations = sorted(expirations)

    def _dte(s: str) -> int:
        try:
            return max(0, (date.fromisoformat(s) - today).days)
        except Exception:
            return 0

    target_exp = min(expirations, key=lambda e: abs(_dte(e) - 45))
    T = max(_dte(target_exp), 1) / 365.0

    atm = round(spot / inc) * inc
    strikes = sorted({round(atm + inc * i, 2) for i in range(-15, 16) if atm + inc * i > 0})

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
        tag   = "C" if otype == "call" else "P"
        return {
            "contractSymbol":    f"{symbol}{target_exp.replace('-','')}{tag}{int(K*1000):08d}",
            "strike":            float(K),
            "lastPrice":         round((bid + ask) / 2, 2),
            "bid":               float(bid),
            "ask":               float(ask),
            "change":            0.0,
            "percentChange":     0.0,
            "volume":            0,
            "openInterest":      0,
            "impliedVolatility": float(iv),
            "inTheMoney":        (K < spot) if otype == "call" else (K > spot),
        }

    return {
        "expirations": expirations,
        "expiry":      target_exp,
        "calls":       [_make(K, "call") for K in strikes],
        "puts":        [_make(K, "put")  for K in strikes],
        "_synthetic":  True,
    }

import yfinance as yf
import time
import os
import math
import requests as _requests
from datetime import datetime, timezone
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
_TTL_MARKETDATA = 300   # 5 min — conserve API credits
_TTL_YFINANCE   = 30    # 30 s

# ── Market Data App credit counter (ADR-0006) ────────────────────────────────
# In-process counter keyed by UTC date string. Resets on process restart.
# Approximate — not accurate across multiple backend instances.
_mda_credit_counter: dict[str, int] = {}

_MDA_DAILY_LIMIT = 100  # Market Data App free plan daily quota


def _mda_increment() -> None:
    """Increment today's Market Data App credit counter."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    _mda_credit_counter[today] = _mda_credit_counter.get(today, 0) + 1


def get_mda_credit_usage() -> dict:
    """
    Return the current-day Market Data App credit usage.
    Called by GET /api/platform/health — no external API call made.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    calls_today = _mda_credit_counter.get(today, 0)
    pct = round(calls_today / _MDA_DAILY_LIMIT * 100, 1)
    if pct >= 100:
        alert_level = "critical"
    elif pct >= 80:
        alert_level = "warning"
    else:
        alert_level = "ok"
    return {
        "date": today,
        "calls_today": calls_today,
        "limit": _MDA_DAILY_LIMIT,
        "pct": pct,
        "alert_level": alert_level,
    }


def _cache_get(key: str) -> Optional[dict]:
    entry = _cache.get(key)
    if not entry:
        return None
    ttl = _TTL_MARKETDATA if entry["data"].get("_source") == "marketdata" else _TTL_YFINANCE
    if (time.time() - entry["ts"]) < ttl:
        return entry["data"]
    return None


def _cache_set(key: str, data: dict):
    _cache[key] = {"data": data, "ts": time.time()}


# ── Market Data App (primary) ────────────────────────────────────────────────

def _marketdata_chain(symbol: str, expiry: Optional[str] = None) -> Optional[dict]:
    """Fetch options chain from api.marketdata.app. Returns None if unconfigured or on any error."""
    token = os.environ.get("MARKETDATA_API_TOKEN", "").strip()
    if not token:
        return None

    url = f"https://api.marketdata.app/v1/options/chain/{symbol}/"
    headers = {"Authorization": f"Token {token}"}
    params: dict = {}
    if expiry:
        params["expiration"] = expiry
    else:
        params["minDte"] = 0
        params["maxDte"] = 180  # up to ~6 months of expirations

    try:
        resp = _requests.get(url, headers=headers, params=params, timeout=15)
        if resp.status_code == 401:
            logger.error("MarketData.app: invalid MARKETDATA_API_TOKEN")
            return None
        if resp.status_code != 200:
            logger.warning("MarketData.app chain %s: HTTP %s", symbol, resp.status_code)
            return None

        data = resp.json()
        if data.get("s") != "ok":
            logger.info("MarketData.app chain %s: s=%s", symbol, data.get("s"))
            return None

        opt_symbols = data.get("optionSymbol", [])
        n = len(opt_symbols)
        if n == 0:
            return None

        def _val(field: str, i: int, default=0):
            arr = data.get(field)
            if not arr or i >= len(arr) or arr[i] is None:
                return default
            return arr[i]

        def _exp_str(raw) -> str:
            if isinstance(raw, (int, float)):
                return datetime.utcfromtimestamp(raw).strftime("%Y-%m-%d")
            if isinstance(raw, str):
                return raw[:10]
            return expiry or ""

        contracts = []
        for i in range(n):
            contracts.append({
                "contractSymbol":    opt_symbols[i],
                "strike":            float(_val("strike", i, 0)),
                "lastPrice":         float(_val("last",   i, 0)),
                "bid":               float(_val("bid",    i, 0)),
                "ask":               float(_val("ask",    i, 0)),
                "change":            0.0,
                "percentChange":     0.0,
                "volume":            int(_val("volume",       i, 0)),
                "openInterest":      int(_val("openInterest", i, 0)),
                "impliedVolatility": float(_val("iv",    i, 0)),
                "inTheMoney":        bool(_val("inTheMoney", i, False)),
                "delta":             float(_val("delta", i, 0)),
                "gamma":             float(_val("gamma", i, 0)),
                "theta":             float(_val("theta", i, 0)),
                "vega":              float(_val("vega",  i, 0)),
                "_side": _val("side", i, "call"),
                "_exp":  _exp_str(_val("expiration", i, expiry)),
            })

        all_expiries = sorted({c["_exp"] for c in contracts if c["_exp"]})
        actual_expiry = expiry if expiry in all_expiries else (all_expiries[0] if all_expiries else expiry)

        calls, puts = [], []
        for c in contracts:
            if c["_exp"] != actual_expiry:
                continue
            row = {k: v for k, v in c.items() if not k.startswith("_")}
            if c["_side"] == "call":
                calls.append(row)
            else:
                puts.append(row)

        result = {
            "expirations": all_expiries,
            "expiry":      actual_expiry,
            "calls":       calls,
            "puts":        puts,
            "_source":     "marketdata",
        }
        # Increment credit counter after a successful API response (ADR-0006)
        _mda_increment()
        return result
    except Exception as e:
        logger.warning("MarketData.app chain failed for %s: %s", symbol, e)
        return None


# ── yfinance (fallback) ──────────────────────────────────────────────────────

def _yfinance_chain(symbol: str, expiry: Optional[str] = None) -> Optional[dict]:
    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options
        if not expirations:
            return None

        if expiry is None or expiry not in expirations:
            # Skip today's expiry — 0-DTE options have stale/unreliable bid/ask and zero greeks
            today = datetime.utcnow().strftime("%Y-%m-%d")
            future = [e for e in expirations if e > today]
            expiry = future[0] if future else expirations[0]

        chain = ticker.option_chain(expiry)

        def df_to_list(df) -> list:
            rows = []
            for _, row in df.iterrows():
                bid      = _safe_float(row.get("bid"))
                ask      = _safe_float(row.get("ask"))
                last     = _safe_float(row.get("lastPrice"))
                # yfinance returns NaN for bid/ask on illiquid/after-hours contracts
                if not bid and not ask and last:
                    bid = round(last * 0.95, 2)
                    ask = round(last * 1.05, 2)
                rows.append({
                    "contractSymbol":    str(row.get("contractSymbol", "")),
                    "strike":            _safe_float(row.get("strike")),
                    "lastPrice":         last,
                    "bid":               bid,
                    "ask":               ask,
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
            "symbol":        symbol.upper(),
            "price":         round(last_close, 2),
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


def _patch_bid_ask_from_yfinance(mda_chain: dict, symbol: str, expiry: Optional[str]) -> dict:
    """Fill in missing bid/ask on MDA contracts using yfinance, matched by strike.

    If yfinance doesn't carry the exact expiry, picks the nearest available one
    (strikes usually overlap for equity options). Any contracts still at 0 after
    the yfinance patch are synthesised from lastPrice ± 5%.
    """
    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options
        if not expirations:
            raise ValueError("no expirations")

        # Find the closest available yfinance expiry to the MDA expiry
        target = expiry or (expirations[0] if expirations else None)
        if target and target not in expirations:
            from datetime import datetime
            try:
                target_dt = datetime.strptime(target, "%Y-%m-%d")
                target = min(expirations, key=lambda e: abs((datetime.strptime(e, "%Y-%m-%d") - target_dt).days))
            except Exception:
                target = expirations[0]

        chain = ticker.option_chain(target)

        def df_to_index(df):
            idx = {}
            for _, row in df.iterrows():
                strike = _safe_float(row.get("strike"))
                idx[round(strike, 2)] = {
                    "bid": _safe_float(row.get("bid")),
                    "ask": _safe_float(row.get("ask")),
                    "lastPrice": _safe_float(row.get("lastPrice")),
                }
            return idx

        yf_calls = df_to_index(chain.calls)
        yf_puts  = df_to_index(chain.puts)
    except Exception as e:
        logger.debug("yfinance bid/ask patch failed for %s: %s", symbol, e)
        yf_calls, yf_puts = {}, {}

    def patch(contracts: list, yf_index: dict) -> list:
        patched = []
        for c in contracts:
            if not c.get("bid") and not c.get("ask"):
                yf = yf_index.get(round(c["strike"], 2), {})
                bid = yf.get("bid", 0.0)
                ask = yf.get("ask", 0.0)
                # Final fallback: synthesise from lastPrice if yfinance also has no quote
                if not bid and not ask:
                    last = c.get("lastPrice") or yf.get("lastPrice", 0.0)
                    if last:
                        bid = round(last * 0.95, 2)
                        ask = round(last * 1.05, 2)
                c = {**c, "bid": bid, "ask": ask}
            patched.append(c)
        return patched

    return {
        **mda_chain,
        "calls": patch(mda_chain.get("calls", []), yf_calls),
        "puts":  patch(mda_chain.get("puts",  []), yf_puts),
    }


def get_options_chain(symbol: str, expiry: Optional[str] = None) -> dict:
    cache_key = f"chain:{symbol}:{expiry}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    mda = _marketdata_chain(symbol, expiry)
    if mda:
        # Patch any contracts where MDA returned null/0 bid+ask (common outside market hours)
        all_contracts = mda.get("calls", []) + mda.get("puts", [])
        missing_quotes = sum(1 for c in all_contracts if not c.get("bid") and not c.get("ask"))
        if missing_quotes > 0:
            logger.info("MDA chain for %s: %d/%d contracts missing bid/ask — patching from yfinance",
                        symbol, missing_quotes, len(all_contracts))
            mda = _patch_bid_ask_from_yfinance(mda, symbol, expiry)
        result = mda
    else:
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
    Black-Scholes synthetic chain — last resort when both Market Data App and yfinance fail.
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

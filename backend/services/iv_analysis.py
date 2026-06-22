"""IV Rank and IV environment classification.

Four-tier source sequence (first success wins):
  Tier 1  volradar.com        equities only   real historical IV
  Tier 2  CBOE vol index      indices only    e.g. ^VIX for ^SPX
  Tier 3  ATM IV from chain   all symbols     live options chain
  Tier 4  HV proxy            all symbols     price history, always works
"""
import threading
import time
import yfinance as yf
import numpy as np
import logging
from datetime import date

logger = logging.getLogger(__name__)


# ── Tier 1: Volradar ─────────────────────────────────────────────────────────

_VOLRADAR_PAGE_URL = "https://volradar.com/tools/iv-rank-lookup"
_VOLRADAR_API_URL  = "https://volradar.com/api/tools/iv-rank"
_VOLRADAR_TIMEOUT  = 10

_VOLRADAR_CACHE: dict[str, tuple[float, dict | None]] = {}
_VOLRADAR_TTL_OK   = 3600   # 1 hour — stay unblocked; IVR buckets rarely flip within an hour
_VOLRADAR_TTL_FAIL = 600    # 10 min — lightweight circuit breaker on outage


def _to_decimal(val) -> float | None:
    """volradar reports IV in percentage points (30.5 → 0.305). Normalise."""
    if val is None:
        return None
    try:
        return float(val) / 100.0
    except (TypeError, ValueError):
        return None


def _fetch_volradar_ivr(symbol: str) -> dict | None:
    """Cached wrapper around _fetch_volradar_ivr_uncached. Never raises."""
    cached = _VOLRADAR_CACHE.get(symbol.upper())
    if cached is not None:
        expires_at, value = cached
        if time.time() < expires_at:
            return value

    result = _fetch_volradar_ivr_uncached(symbol)
    ttl = _VOLRADAR_TTL_OK if result is not None else _VOLRADAR_TTL_FAIL
    if len(_VOLRADAR_CACHE) >= 1000:
        del _VOLRADAR_CACHE[next(iter(_VOLRADAR_CACHE))]
    _VOLRADAR_CACHE[symbol.upper()] = (time.time() + ttl, result)
    return result


def _fetch_volradar_ivr_uncached(symbol: str) -> dict | None:
    """Two-step curl_cffi session fetch from volradar. Never raises."""
    try:
        from curl_cffi import requests as cffi_requests
        session = cffi_requests.Session()
        session.get(
            _VOLRADAR_PAGE_URL, impersonate="chrome120", timeout=_VOLRADAR_TIMEOUT,
            headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                     "Accept-Language": "en-US,en;q=0.9"},
        )
        resp = session.get(
            _VOLRADAR_API_URL, impersonate="chrome120", timeout=_VOLRADAR_TIMEOUT,
            params={"ticker": symbol.upper()},
            headers={"Accept": "*/*", "Accept-Language": "en-US,en;q=0.9",
                     "Referer": _VOLRADAR_PAGE_URL,
                     "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors",
                     "Sec-Fetch-Site": "same-origin"},
        )
        if resp.status_code != 200:
            logger.warning(f"volradar {resp.status_code} for {symbol}")
            return None
        data = resp.json()
        if data.get("status") != "success" or data.get("iv_rank") is None:
            logger.warning(f"volradar bad response for {symbol}: {data.get('status')}")
            return None
        iv_rank = float(data["iv_rank"])
        logger.info(f"volradar IVR {symbol}: {iv_rank}")
        return {
            "iv_rank":       iv_rank,
            "current_iv":    _to_decimal(data.get("current_iv")),
            "iv_52w_low":    _to_decimal(data.get("iv_52w_low")),
            "iv_52w_high":   _to_decimal(data.get("iv_52w_high")),
            "iv_percentile": data.get("iv_percentile"),
        }
    except Exception as e:
        logger.warning(f"volradar fetch failed for {symbol}: {e}")
        return None


# ── Tier 2: CBOE Volatility Index ────────────────────────────────────────────
# Maps each index symbol to its CBOE vol index proxy.
# ^VIX self-references so its price (which IS implied vol) is ranked against
# its own 52-week price history — the correct interpretation of "is VIX high?"
_INDEX_PROXY: dict[str, str] = {
    "^SPX":  "^VIX",
    "^GSPC": "^VIX",
    "^NDX":  "^VXN",
    "^RUT":  "^RVX",
    "^VIX":  "^VIX",   # self-referencing: rank VIX price vs its own price history
}

_CBOE_CACHE: dict[str, tuple[float, dict | None]] = {}
_CBOE_TTL_OK   = 3600
_CBOE_TTL_FAIL = 600


def _fetch_cboe_vol_index_ivr(symbol: str) -> dict | None:
    """
    Tier 2: fetch the CBOE volatility index proxy for an index symbol and
    compute IVR from the proxy's own 52-week price range.

    CBOE vol indices (VIX, VXN, RVX) report in percentage points (e.g. 17.53
    means 17.53% implied vol). Dividing by 100 stores them as decimals (0.1753)
    consistent with the rest of the app. The IVR formula cancels the scaling,
    so the resulting 0–100 rank is unaffected.
    """
    proxy = _INDEX_PROXY.get(symbol.upper())
    if not proxy:
        return None

    cached = _CBOE_CACHE.get(symbol.upper())
    if cached is not None:
        expires_at, value = cached
        if time.time() < expires_at:
            return value

    result_holder: list[dict | None] = [None]

    def _run():
        try:
            hist = yf.Ticker(proxy).history(period="1y")
            if hist.empty or len(hist) < 35:
                logger.warning(f"CBOE vol index {proxy}: insufficient history")
                return
            closes = hist["Close"].values
            current  = float(closes[-1])  / 100.0
            high_52  = float(closes.max()) / 100.0
            low_52   = float(closes.min()) / 100.0
            rng = high_52 - low_52
            if rng < 0.0001:
                return
            iv_rank = round((current - low_52) / rng * 100.0, 1)
            iv_rank = max(0.0, min(100.0, iv_rank))
            logger.info(f"CBOE vol index IVR {symbol} (via {proxy}): {iv_rank}")
            result_holder[0] = {
                "iv_rank":     iv_rank,
                "current_iv":  current,
                "iv_52w_high": high_52,
                "iv_52w_low":  low_52,
                "proxy":       proxy,
            }
        except Exception as e:
            logger.warning(f"CBOE vol index fetch failed for {symbol} (proxy {proxy}): {e}")

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(5)
    if t.is_alive():
        logger.warning(f"CBOE vol index fetch timed out for {symbol}")

    result = result_holder[0]
    ttl = _CBOE_TTL_OK if result is not None else _CBOE_TTL_FAIL
    _CBOE_CACHE[symbol.upper()] = (time.time() + ttl, result)
    return result


# ── Shared helpers ────────────────────────────────────────────────────────────

def _classify(iv_rank: float) -> str:
    if iv_rank > 50:
        return "HIGH"
    if iv_rank < 30:
        return "LOW"
    return "MEDIUM"


def _calculate_rsi(prices: np.ndarray, period: int = 14) -> float:
    if len(prices) < period + 1:
        return 50.0
    deltas = np.diff(prices)
    gains  = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    return round(100.0 - (100.0 / (1.0 + avg_gain / avg_loss)), 2)


# ── Main entry point ──────────────────────────────────────────────────────────

def get_iv_rank(symbol: str) -> dict:
    """
    Calculate IV Rank for a symbol using a four-tier source sequence.
    Returns dict with symbol, current_iv, iv_rank, iv_source, iv_environment,
    percentile_label, hv_30d, hv_52wk_high, hv_52wk_low, and optional error.
    """
    is_index = symbol.startswith("^")

    # ── Tier 1: volradar (equities only) ─────────────────────────────────────
    if not is_index:
        vr = _fetch_volradar_ivr(symbol)
        if vr is not None:
            iv_rank = vr["iv_rank"]
            env = _classify(iv_rank)
            return {
                "symbol":           symbol,
                "current_iv":       vr.get("current_iv"),
                "iv_rank":          iv_rank,
                "iv_source":        "volradar",
                "hv_30d":           None,
                "hv_52wk_high":     vr.get("iv_52w_high"),
                "hv_52wk_low":      vr.get("iv_52w_low"),
                "iv_environment":   env,
                "percentile_label": f"IVR {iv_rank:.0f} — {env.capitalize()} IV",
            }

    # ── Tier 2: CBOE vol index proxy (index symbols only) ────────────────────
    if is_index:
        cboe = _fetch_cboe_vol_index_ivr(symbol)
        if cboe is not None:
            iv_rank = cboe["iv_rank"]
            env = _classify(iv_rank)
            proxy = cboe.get("proxy", "")
            return {
                "symbol":           symbol,
                "current_iv":       cboe.get("current_iv"),
                "iv_rank":          iv_rank,
                "iv_source":        "cboe_vol_index",
                "hv_30d":           None,
                "hv_52wk_high":     cboe.get("iv_52w_high"),
                "hv_52wk_low":      cboe.get("iv_52w_low"),
                "iv_environment":   env,
                "percentile_label": f"IVR {iv_rank:.0f} — {env.capitalize()} IV (via {proxy})",
            }

    # ── Tiers 3 & 4: yfinance (all symbols) ──────────────────────────────────
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")

        if hist.empty or len(hist) < 35:
            return _hardcoded_fallback(symbol, "Insufficient historical data")

        closes = hist["Close"].values
        log_returns = np.log(closes[1:] / closes[:-1])

        hv_series = np.array([
            float(np.std(log_returns[i - 29: i + 1], ddof=1) * np.sqrt(252))
            for i in range(29, len(log_returns))
        ])
        current_hv   = float(hv_series[-1])
        hv_52wk_high = float(hv_series.max())
        hv_52wk_low  = float(hv_series.min())

        # ── Tier 3: ATM IV from options chain ────────────────────────────────
        current_iv = None
        iv_source  = None
        try:
            expirations = ticker.options
            if expirations:
                chain = ticker.option_chain(expirations[0])
                spot  = float(closes[-1])
                calls = chain.calls
                if not calls.empty:
                    calls = calls.copy()
                    calls["dist"] = abs(calls["strike"] - spot)
                    atm_iv = float(calls.loc[calls["dist"].idxmin()].get("impliedVolatility", 0))
                    if atm_iv > 0.01:
                        current_iv = atm_iv
                        iv_source  = "option_chain"
        except Exception as e:
            logger.warning(f"ATM IV fetch failed for {symbol}: {e}")

        # ── Tier 4: HV proxy ──────────────────────────────────────────────────
        if current_iv is None:
            current_iv = current_hv
            iv_source  = "hv_proxy"

        hv_range = hv_52wk_high - hv_52wk_low
        if hv_range < 0.001:
            iv_rank = 50.0
        else:
            iv_rank = round((current_iv - hv_52wk_low) / hv_range * 100.0, 1)
            iv_rank = max(0.0, min(100.0, iv_rank))

        env = _classify(iv_rank)
        label_prefix = "IVR" if iv_source == "option_chain" else "HV Rank"

        return {
            "symbol":           symbol,
            "current_iv":       round(current_iv, 4),
            "iv_rank":          iv_rank,
            "iv_source":        iv_source,
            "hv_30d":           round(current_hv, 4),
            "hv_52wk_high":     round(hv_52wk_high, 4),
            "hv_52wk_low":      round(hv_52wk_low, 4),
            "iv_environment":   env,
            "percentile_label": f"{label_prefix} {iv_rank:.0f} — {env.capitalize()} IV",
        }

    except Exception as e:
        logger.error(f"get_iv_rank failed for {symbol}: {e}")
        return _hardcoded_fallback(symbol, str(e))


def _hardcoded_fallback(symbol: str, error: str) -> dict:
    return {
        "symbol":           symbol,
        "error":            error,
        "iv_environment":   "MEDIUM",
        "iv_rank":          50.0,
        "iv_source":        "hv_proxy",
        "current_iv":       0.3,
        "hv_30d":           0.3,
        "hv_52wk_high":     0.4,
        "hv_52wk_low":      0.2,
        "percentile_label": "HV Rank N/A — Medium IV",
    }


def get_directional_bias(symbol: str) -> dict:
    """
    Momentum-based directional bias: SMA20/50 crossover + RSI(14).
    Returns dict with symbol, price, sma20, sma50, rsi14, bias, strength.
    """
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="3mo")

        if hist.empty or len(hist) < 55:
            return {
                "symbol": symbol, "error": "Insufficient data",
                "price": 0.0, "sma20": 0.0, "sma50": 0.0,
                "rsi14": 50.0, "bias": "NEUTRAL", "strength": "MODERATE",
            }

        closes = hist["Close"].values
        price  = float(closes[-1])
        sma20  = float(np.mean(closes[-20:]))
        sma50  = float(np.mean(closes[-50:]))
        rsi14  = _calculate_rsi(closes, period=14)

        if price > sma20 and sma20 > sma50:
            sma_dir = "BULLISH"
        elif price < sma20 and sma20 < sma50:
            sma_dir = "BEARISH"
        else:
            sma_dir = "NEUTRAL"

        rsi_tilt = "BULLISH" if rsi14 > 60 else "BEARISH" if rsi14 < 40 else "NEUTRAL"

        if sma_dir == rsi_tilt and sma_dir != "NEUTRAL":
            bias, strength = sma_dir, "STRONG"
        elif sma_dir == "BULLISH" or rsi_tilt == "BULLISH":
            if sma_dir == "BEARISH" or rsi_tilt == "BEARISH":
                bias, strength = "NEUTRAL", "MODERATE"
            else:
                bias, strength = "NEUTRAL_BULLISH", "MODERATE"
        elif sma_dir == "BEARISH" or rsi_tilt == "BEARISH":
            bias, strength = "NEUTRAL_BEARISH", "MODERATE"
        else:
            bias, strength = "NEUTRAL", "MODERATE"

        return {
            "symbol": symbol, "price": round(price, 2),
            "sma20": round(sma20, 2), "sma50": round(sma50, 2),
            "rsi14": rsi14, "bias": bias, "strength": strength,
        }

    except Exception as e:
        logger.error(f"get_directional_bias failed for {symbol}: {e}")
        return {
            "symbol": symbol, "error": str(e),
            "price": 0.0, "sma20": 0.0, "sma50": 0.0,
            "rsi14": 50.0, "bias": "NEUTRAL", "strength": "MODERATE",
        }

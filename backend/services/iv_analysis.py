"""IV Rank and IV environment classification using yfinance historical data."""
import time
import yfinance as yf
import numpy as np
import logging
from datetime import date

logger = logging.getLogger(__name__)

# ── Volradar IVR scraper ──────────────────────────────────────────────────────
# Two-step approach:
#   1. Load the main page in a curl_cffi session — Cloudflare issues cf_clearance cookie
#   2. Call /api/tools/iv-rank?ticker=SYMBOL within the same session, which carries
#      the cookie and the correct Sec-Fetch-* headers the endpoint requires.
# Falls back to yfinance HV-proxy on any error.

_VOLRADAR_PAGE_URL = "https://volradar.com/tools/iv-rank-lookup"
_VOLRADAR_API_URL  = "https://volradar.com/api/tools/iv-rank"
_VOLRADAR_TIMEOUT  = 10  # seconds

# In-process TTL cache for volradar results, keyed by symbol. Each IVR lookup
# costs two external HTTP round-trips, so we cache aggressively to keep latency
# down and to avoid hammering (and getting blocked by) volradar. Successful
# results are cached longer; failures are cached briefly so a transient outage
# doesn't trigger a retry storm (acts as a lightweight circuit breaker) while
# still recovering within minutes.
_VOLRADAR_CACHE: dict[str, tuple[float, dict | None]] = {}
_VOLRADAR_TTL_OK   = 3600   # 1 hour for a good result
_VOLRADAR_TTL_FAIL = 600    # 10 minutes for a failure


def _to_decimal(val) -> float | None:
    """volradar reports IV in percentage points (e.g. 30.5); the rest of the
    app works in decimal fractions (0.305). Normalise, preserving None."""
    if val is None:
        return None
    try:
        return float(val) / 100.0
    except (TypeError, ValueError):
        return None


def _fetch_volradar_ivr(symbol: str) -> dict | None:
    """
    Fetch IVR data for *symbol* from volradar.com/api/tools/iv-rank.

    Returns a dict with iv_rank, current_iv, iv_52w_low, iv_52w_high,
    iv_percentile — or None on any failure.  Never raises.

    Endpoint discovered via browser DevTools:
      GET https://volradar.com/api/tools/iv-rank?ticker=AMZN
      Response: {"status":"success","iv_rank":52.0,"current_iv":30.5,...}
    """
    # Serve from cache when warm (covers both successes and recent failures).
    cached = _VOLRADAR_CACHE.get(symbol.upper())
    if cached is not None:
        expires_at, value = cached
        if time.time() < expires_at:
            return value

    result = _fetch_volradar_ivr_uncached(symbol)
    ttl = _VOLRADAR_TTL_OK if result is not None else _VOLRADAR_TTL_FAIL
    # Evict oldest entry when cap is reached (FIFO, ~250 bytes per entry → ~250 KB at limit).
    if len(_VOLRADAR_CACHE) >= 1000:
        oldest_key = next(iter(_VOLRADAR_CACHE))
        del _VOLRADAR_CACHE[oldest_key]
    _VOLRADAR_CACHE[symbol.upper()] = (time.time() + ttl, result)
    return result


def _fetch_volradar_ivr_uncached(symbol: str) -> dict | None:
    """Underlying two-step volradar fetch. See _fetch_volradar_ivr for the
    cached wrapper. Values are normalised to decimal fractions to match the
    rest of the app (volradar reports IV in percentage points). Never raises."""
    try:
        from curl_cffi import requests as cffi_requests

        # curl_cffi Session keeps cookies across requests so cf_clearance
        # obtained from the page load is sent automatically to the API.
        session = cffi_requests.Session()

        # Step 1 — load the page to negotiate Cloudflare and receive cf_clearance
        session.get(
            _VOLRADAR_PAGE_URL,
            impersonate="chrome120",
            timeout=_VOLRADAR_TIMEOUT,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )

        # Step 2 — call the JSON API with the fetch headers the browser sends
        resp = session.get(
            _VOLRADAR_API_URL,
            impersonate="chrome120",
            timeout=_VOLRADAR_TIMEOUT,
            params={"ticker": symbol.upper()},
            headers={
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": _VOLRADAR_PAGE_URL,
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            },
        )

        if resp.status_code != 200:
            logger.warning(f"volradar API returned {resp.status_code} for {symbol}")
            return None

        data = resp.json()
        if data.get("status") != "success":
            logger.warning(f"volradar non-success for {symbol}: {data.get('status')}")
            return None

        iv_rank = data.get("iv_rank")
        if iv_rank is None:
            logger.warning(f"volradar: iv_rank missing in response for {symbol}")
            return None

        logger.info(f"volradar IVR for {symbol}: {iv_rank}")
        # iv_rank stays on the 0–100 scale; IV magnitudes are normalised to
        # decimal fractions so they render correctly downstream (frontend ×100).
        return {
            "iv_rank":      float(iv_rank),
            "current_iv":   _to_decimal(data.get("current_iv")),
            "iv_52w_low":   _to_decimal(data.get("iv_52w_low")),
            "iv_52w_high":  _to_decimal(data.get("iv_52w_high")),
            "iv_percentile": data.get("iv_percentile"),
        }

    except Exception as e:
        logger.warning(f"volradar fetch failed for {symbol}: {e}")
        return None


def _calculate_rsi(prices: np.ndarray, period: int = 14) -> float:
    """Calculate RSI for the last period using simple moving average method."""
    if len(prices) < period + 1:
        return 50.0
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    # Use simple average for initial values
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])

    # Smooth over remaining values
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100.0 - (100.0 / (1.0 + rs)), 2)


def get_iv_rank(symbol: str) -> dict:
    """
    Calculate IV Rank (IVR) for a symbol.

    Primary source: volradar.com (real IVR from historical implied volatility).
    Fallback: 30-day rolling HV ranked against its own 52-week range (proxy).

    Returns:
        dict with symbol, current_iv, iv_rank, hv_30d, hv_52wk_high, hv_52wk_low,
        iv_environment, percentile_label, iv_source, and optional error field.
    """
    # ── Primary: real IVR from volradar.com ──────────────────────────────────
    # Skip volradar for index symbols (^SPX, ^VIX, ^NDX etc) — volradar only
    # covers equities. yfinance returns ATM IV from the CBOE chain for indices.
    vr = None if symbol.startswith("^") else _fetch_volradar_ivr(symbol)
    if vr is not None:
        iv_rank = vr["iv_rank"]
        if iv_rank > 50:
            iv_environment = "HIGH"
        elif iv_rank < 30:
            iv_environment = "LOW"
        else:
            iv_environment = "MEDIUM"
        return {
            "symbol": symbol,
            "current_iv": vr.get("current_iv"),
            "iv_rank": iv_rank,
            "iv_source": "volradar",
            "hv_30d": None,
            "hv_52wk_high": vr.get("iv_52w_high"),
            "hv_52wk_low":  vr.get("iv_52w_low"),
            "iv_environment": iv_environment,
            "percentile_label": f"IVR {iv_rank:.0f} — {iv_environment.capitalize()} IV",
        }

    # ── Fallback: yfinance HV-proxy ───────────────────────────────────────────
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")

        if hist.empty or len(hist) < 35:
            return {
                "symbol": symbol,
                "error": "Insufficient historical data",
                "iv_environment": "MEDIUM",
                "iv_rank": 50,
                "iv_source": "hv_proxy",
                "current_iv": 0.3,
                "hv_30d": 0.3,
                "hv_52wk_high": 0.4,
                "hv_52wk_low": 0.2,
                "percentile_label": "HV Rank N/A — Medium IV",
            }

        closes = hist["Close"].values
        log_returns = np.log(closes[1:] / closes[:-1])

        # 30-day rolling HV (annualized)
        hv_series = []
        for i in range(29, len(log_returns)):
            window = log_returns[i - 29: i + 1]
            hv = float(np.std(window, ddof=1) * np.sqrt(252))
            hv_series.append(hv)

        hv_series = np.array(hv_series)
        current_hv = float(hv_series[-1])
        hv_52wk_high = float(np.max(hv_series))
        hv_52wk_low = float(np.min(hv_series))

        # Get current ATM IV from nearest expiry options chain — used only as
        # the displayed "Current IV" figure. The rank itself is always HV-based
        # (see below), so the source stays "hv_proxy" regardless; we do not
        # claim the rank is IV-derived when it isn't.
        current_iv = current_hv
        iv_source = "hv_proxy"
        try:
            expirations = ticker.options
            if expirations:
                chain = ticker.option_chain(expirations[0])
                spot = float(closes[-1])
                calls_df = chain.calls
                if not calls_df.empty:
                    calls_df = calls_df.copy()
                    calls_df["dist"] = abs(calls_df["strike"] - spot)
                    atm_row = calls_df.loc[calls_df["dist"].idxmin()]
                    atm_iv = float(atm_row.get("impliedVolatility", 0))
                    if atm_iv > 0.01:
                        current_iv = atm_iv
        except Exception as e:
            logger.warning(f"Could not get ATM IV for {symbol}: {e}")

        # IVR: current HV ranked against the 52-week HV range.
        # ATM IV is NOT used as the numerator — IV is structurally above HV
        # (variance risk premium), so ranking IV against the HV range would
        # routinely produce values above 100 (clamped to 100). Using HV for
        # both numerator and denominator keeps the comparison on the same scale.
        hv_range = hv_52wk_high - hv_52wk_low
        if hv_range < 0.001:
            iv_rank = 50.0
        else:
            iv_rank = round((current_hv - hv_52wk_low) / hv_range * 100.0, 1)
            iv_rank = max(0.0, min(100.0, iv_rank))

        # Classify environment
        if iv_rank > 50:
            iv_environment = "HIGH"
        elif iv_rank < 30:
            iv_environment = "LOW"
        else:
            iv_environment = "MEDIUM"

        percentile_label = f"HV Rank {iv_rank:.0f} — {iv_environment.capitalize()} IV"

        return {
            "symbol": symbol,
            "current_iv": round(current_iv, 4),
            "iv_rank": iv_rank,
            "iv_source": iv_source,
            "hv_30d": round(current_hv, 4),
            "hv_52wk_high": round(hv_52wk_high, 4),
            "hv_52wk_low": round(hv_52wk_low, 4),
            "iv_environment": iv_environment,
            "percentile_label": percentile_label,
        }

    except Exception as e:
        logger.error(f"Error computing IV rank for {symbol}: {e}")
        return {
            "symbol": symbol,
            "error": str(e),
            "iv_environment": "MEDIUM",
            "iv_rank": 50.0,
            "iv_source": "hv_proxy",
            "current_iv": 0.3,
            "hv_30d": 0.3,
            "hv_52wk_high": 0.4,
            "hv_52wk_low": 0.2,
            "percentile_label": "HV Rank N/A — Medium IV",
        }


def get_directional_bias(symbol: str) -> dict:
    """
    Simple momentum-based directional bias using SMA crossover + RSI.

    Logic:
    - price > 20SMA > 50SMA  → BULLISH
    - price < 20SMA < 50SMA  → BEARISH
    - otherwise              → NEUTRAL

    RSI(14):
    - RSI > 60  → bullish tilt
    - RSI < 40  → bearish tilt
    - 40-60     → neutral

    Combined:
    - SMA and RSI agree: STRONG signal
    - Only one: MODERATE signal, may refine bias to NEUTRAL_BULLISH / NEUTRAL_BEARISH

    Returns:
        dict with symbol, price, sma20, sma50, rsi14, bias, strength, and optional error.
    """
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="3mo")

        if hist.empty or len(hist) < 55:
            return {
                "symbol": symbol,
                "error": "Insufficient data for bias calculation",
                "price": 0.0,
                "sma20": 0.0,
                "sma50": 0.0,
                "rsi14": 50.0,
                "bias": "NEUTRAL",
                "strength": "MODERATE",
            }

        closes = hist["Close"].values
        price = float(closes[-1])
        sma20 = float(np.mean(closes[-20:]))
        sma50 = float(np.mean(closes[-50:]))
        rsi14 = _calculate_rsi(closes, period=14)

        # SMA-based direction
        if price > sma20 and sma20 > sma50:
            sma_direction = "BULLISH"
        elif price < sma20 and sma20 < sma50:
            sma_direction = "BEARISH"
        else:
            sma_direction = "NEUTRAL"

        # RSI-based tilt
        if rsi14 > 60:
            rsi_tilt = "BULLISH"
        elif rsi14 < 40:
            rsi_tilt = "BEARISH"
        else:
            rsi_tilt = "NEUTRAL"

        # Combine signals
        if sma_direction == rsi_tilt and sma_direction != "NEUTRAL":
            bias = sma_direction
            strength = "STRONG"
        elif sma_direction == "BULLISH" or rsi_tilt == "BULLISH":
            if sma_direction == "BEARISH" or rsi_tilt == "BEARISH":
                bias = "NEUTRAL"
                strength = "MODERATE"
            else:
                bias = "NEUTRAL_BULLISH"
                strength = "MODERATE"
        elif sma_direction == "BEARISH" or rsi_tilt == "BEARISH":
            bias = "NEUTRAL_BEARISH"
            strength = "MODERATE"
        else:
            bias = "NEUTRAL"
            strength = "MODERATE"

        return {
            "symbol": symbol,
            "price": round(price, 2),
            "sma20": round(sma20, 2),
            "sma50": round(sma50, 2),
            "rsi14": rsi14,
            "bias": bias,
            "strength": strength,
        }

    except Exception as e:
        logger.error(f"Error computing directional bias for {symbol}: {e}")
        return {
            "symbol": symbol,
            "error": str(e),
            "price": 0.0,
            "sma20": 0.0,
            "sma50": 0.0,
            "rsi14": 50.0,
            "bias": "NEUTRAL",
            "strength": "MODERATE",
        }

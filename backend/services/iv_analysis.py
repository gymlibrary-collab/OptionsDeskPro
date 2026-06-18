"""IV Rank and IV environment classification using yfinance historical data."""
import yfinance as yf
import numpy as np
import logging
from datetime import date

logger = logging.getLogger(__name__)


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
    IVR = (Current IV - 52wk Low IV) / (52wk High IV - 52wk Low IV) * 100

    Uses 30-day rolling historical volatility as a proxy for IV history
    since yfinance does not store IV history. Uses ATM option IV as current IV.

    Returns:
        dict with symbol, current_iv, iv_rank, hv_30d, hv_52wk_high, hv_52wk_low,
        iv_environment, percentile_label, and optional error field.
    """
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")

        if hist.empty or len(hist) < 35:
            return {
                "symbol": symbol,
                "error": "Insufficient historical data",
                "iv_environment": "MEDIUM",
                "iv_rank": 50,
                "current_iv": 0.3,
                "hv_30d": 0.3,
                "hv_52wk_high": 0.4,
                "hv_52wk_low": 0.2,
                "percentile_label": "IVR N/A — Medium IV",
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

        # Get current ATM IV from nearest expiry options chain
        current_iv = current_hv  # fallback
        try:
            expirations = ticker.options
            if expirations:
                chain = ticker.option_chain(expirations[0])
                spot = float(closes[-1])
                # Find ATM call (strike closest to spot)
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

        # IV Rank
        hv_range = hv_52wk_high - hv_52wk_low
        if hv_range < 0.001:
            iv_rank = 50.0
        else:
            iv_rank = round((current_iv - hv_52wk_low) / hv_range * 100.0, 1)
            iv_rank = max(0.0, min(100.0, iv_rank))

        # Classify environment
        if iv_rank > 50:
            iv_environment = "HIGH"
        elif iv_rank < 30:
            iv_environment = "LOW"
        else:
            iv_environment = "MEDIUM"

        percentile_label = f"IVR {iv_rank:.0f} — {iv_environment.capitalize()} IV"

        return {
            "symbol": symbol,
            "current_iv": round(current_iv, 4),
            "iv_rank": iv_rank,
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
            "current_iv": 0.3,
            "hv_30d": 0.3,
            "hv_52wk_high": 0.4,
            "hv_52wk_low": 0.2,
            "percentile_label": "IVR N/A — Medium IV",
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

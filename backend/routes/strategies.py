import time
import logging
from fastapi import APIRouter

from services.iv_analysis import get_iv_rank, get_directional_bias
from services.strategy_engine import recommend_strategies, build_trade, STRATEGIES
from services.market_data import get_options_chain, get_quote
from services.greeks import calculate_greeks
from services.interpreter import generate_narrative
from datetime import date

logger = logging.getLogger(__name__)

router = APIRouter()


def _enrich_chain_with_greeks(chain: dict, spot_price: float) -> dict:
    """Add Black-Scholes greeks to every contract in the chain."""

    def enrich(contracts: list, option_type: str) -> list:
        enriched = []
        for c in contracts:
            strike = c["strike"]
            sigma = c.get("impliedVolatility", 0.3)
            if sigma <= 0:
                sigma = 0.3
            try:
                exp_date = date.fromisoformat(chain["expiry"]) if chain["expiry"] else None
                T = max((exp_date - date.today()).days, 0) / 365.0 if exp_date else 0.0
            except Exception:
                T = 0.0
            greeks = calculate_greeks(spot_price, strike, T, 0.05, sigma, option_type)
            enriched.append({**c, **greeks})
        return enriched

    return {
        **chain,
        "calls": enrich(chain.get("calls", []), "call"),
        "puts": enrich(chain.get("puts", []), "put"),
    }


def _get_enriched_chain_for_symbol(symbol: str, expiry: str | None = None) -> tuple:
    """Return (spot_price, enriched_chain). Raises on failure."""
    quote = get_quote(symbol)
    spot = quote.get("price", 0.0)
    chain = get_options_chain(symbol, expiry)
    enriched = _enrich_chain_with_greeks(chain, spot)
    return spot, enriched


@router.get("/strategies/analyze/{symbol}")
async def analyze_symbol(symbol: str):
    """
    Full analysis: IV rank, directional bias, top strategy recommendations,
    and pre-built trade structures with specific strikes for the top 3 strategies.
    """
    symbol = symbol.upper()

    iv_data = get_iv_rank(symbol)
    bias_data = get_directional_bias(symbol)

    iv_env = iv_data.get("iv_environment", "MEDIUM")
    bias = bias_data.get("bias", "NEUTRAL")

    recommendations = recommend_strategies(iv_env, bias)

    # Build trade structures for top 3 strategies
    trades = []
    try:
        spot, enriched_chain = _get_enriched_chain_for_symbol(symbol)
    except Exception as e:
        logger.warning(f"Could not load options chain for {symbol}: {e}")
        enriched_chain = {"expirations": [], "expiry": None, "calls": [], "puts": []}
        spot = bias_data.get("price", 0.0)

    for rec in recommendations[:3]:
        strategy_key = rec["key"]
        try:
            trade = build_trade(symbol, strategy_key, enriched_chain, spot)
        except Exception as e:
            logger.warning(f"build_trade failed for {strategy_key}: {e}")
            trade = {"error": str(e)}

        # Attach plain-English narrative
        strategy_catalog_entry = {**STRATEGIES.get(strategy_key, {}), "key": strategy_key}
        try:
            narrative = generate_narrative(symbol, iv_data, bias_data, strategy_catalog_entry, trade)
        except Exception as e:
            logger.warning(f"generate_narrative failed for {strategy_key}: {e}")
            narrative = None

        if not trade.get("error") and narrative:
            trade["narrative"] = narrative

        trades.append({
            "strategy_key": strategy_key,
            "strategy_name": rec["name"],
            "trade": trade,
        })

    return {
        "symbol": symbol,
        "iv_analysis": iv_data,
        "bias_analysis": bias_data,
        "recommendations": recommendations,
        "trades": trades,
    }


@router.get("/strategies/scan")
async def scan_watchlist(symbols: str = "SPY,QQQ,AAPL,TSLA,NVDA,AMZN,GLD,TLT"):
    """
    Scan a comma-separated list of symbols.
    For each: compute IV rank + bias, return top 1 strategy recommendation.
    Returns list sorted by IVR descending (highest IV opportunities first).
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    results = []

    for symbol in symbol_list:
        try:
            iv_data = get_iv_rank(symbol)
            time.sleep(0.5)  # Avoid yfinance rate limiting
            bias_data = get_directional_bias(symbol)

            iv_env = iv_data.get("iv_environment", "MEDIUM")
            bias = bias_data.get("bias", "NEUTRAL")
            recs = recommend_strategies(iv_env, bias)
            top_rec = recs[0] if recs else None

            # Add brief narrative (headline + confirmation_summary) for scan table
            scan_narrative = None
            if top_rec:
                try:
                    spot = bias_data.get("price", 0.0)
                    enriched_chain = {"expirations": [], "expiry": None, "calls": [], "puts": []}
                    strategy_catalog_entry = {**STRATEGIES.get(top_rec["key"], {}), "key": top_rec["key"]}
                    # Build a minimal stub trade for the scan narrative (no chain needed for text fields)
                    stub_trade = {"error": "scan mode — no chain loaded"}
                    full_narrative = generate_narrative(symbol, iv_data, bias_data, strategy_catalog_entry, stub_trade)
                    scan_narrative = {
                        "headline": full_narrative.get("headline", ""),
                        "confirmation_summary": full_narrative.get("confirmation_summary", ""),
                    }
                except Exception as e:
                    logger.debug(f"Scan narrative failed for {symbol}: {e}")

            results.append({
                "symbol": symbol,
                "price": bias_data.get("price", 0.0),
                "iv_rank": iv_data.get("iv_rank", 0.0),
                "current_iv": iv_data.get("current_iv", 0.0),
                "iv_environment": iv_env,
                "percentile_label": iv_data.get("percentile_label", ""),
                "bias": bias,
                "bias_strength": bias_data.get("strength", "MODERATE"),
                "rsi14": bias_data.get("rsi14", 50.0),
                "top_strategy": top_rec,
                "scan_narrative": scan_narrative,
                "error": iv_data.get("error") or bias_data.get("error"),
            })

        except Exception as e:
            logger.error(f"Scan error for {symbol}: {e}")
            results.append({
                "symbol": symbol,
                "price": 0.0,
                "iv_rank": 0.0,
                "current_iv": 0.0,
                "iv_environment": "MEDIUM",
                "percentile_label": "IVR N/A",
                "bias": "NEUTRAL",
                "bias_strength": "MODERATE",
                "rsi14": 50.0,
                "top_strategy": None,
                "error": str(e),
            })

    # Sort by IVR descending — highest opportunity first
    results.sort(key=lambda x: x.get("iv_rank", 0.0), reverse=True)
    return results

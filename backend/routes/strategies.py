import time
import logging
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException

from services.iv_analysis import get_iv_rank, get_directional_bias
from services.strategy_engine import recommend_strategies, recommend_by_category, build_trade, STRATEGIES
from services.market_data import get_options_chain, get_quote, synthetic_options_chain
from services.greeks import calculate_greeks
from services.interpreter import generate_narrative
from services.market_context import get_full_market_context
from services.auth_utils import verify_token
from services.db import get_supabase
from services.tier_limits import get_user_tier, get_limits

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_scan_headline(symbol: str, iv_data: dict, bias_data: dict, top_rec: dict) -> str:
    """Generate a plain-English headline from IV + bias data without needing a full trade."""
    ivr = iv_data.get("iv_rank", 50.0)
    iv_env = iv_data.get("iv_environment", "MEDIUM")
    bias = bias_data.get("bias", "NEUTRAL")
    strategy_name = top_rec.get("name", "options strategy")

    iv_phrase = {
        "HIGH": f"options on {symbol} are expensive (IVR {ivr:.0f}) — sellers have an edge",
        "MEDIUM": f"options on {symbol} are fairly priced (IVR {ivr:.0f})",
        "LOW": f"options on {symbol} are cheap (IVR {ivr:.0f}) — buyers have an edge",
    }.get(iv_env, f"IVR is {ivr:.0f}")

    bias_phrase = {
        "BULLISH": "the trend is bullish",
        "BEARISH": "the trend is bearish",
        "NEUTRAL": "the stock looks range-bound",
        "NEUTRAL_BULLISH": "the stock leans bullish",
        "NEUTRAL_BEARISH": "the stock leans bearish",
    }.get(bias, "momentum is mixed")

    return f"{iv_phrase.capitalize()}, and {bias_phrase} — suggesting a {strategy_name}."


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
    Full analysis: IV rank, directional bias, and top 3 strategy recommendations
    per direction category (Bullish, Bearish, Neutral, Neutral-Bullish,
    Neutral-Bearish, Omnidirectional). The user chooses their directional view.
    """
    symbol = symbol.upper()

    iv_data = get_iv_rank(symbol)
    bias_data = get_directional_bias(symbol)

    iv_env = iv_data.get("iv_environment", "MEDIUM")
    bias = bias_data.get("bias", "NEUTRAL")

    recommendations_by_category = recommend_by_category(iv_env)

    try:
        spot, enriched_chain = _get_enriched_chain_for_symbol(symbol)
    except Exception as e:
        logger.warning(f"Could not load options chain for {symbol}: {e}")
        enriched_chain = None
        spot = bias_data.get("price", 0.0)

    if not enriched_chain or not enriched_chain.get("expirations"):
        logger.info(f"Generating synthetic options chain for {symbol} (live data unavailable)")
        spot = spot or bias_data.get("price", 1.0)
        current_iv = iv_data.get("current_iv", 0.30) or 0.30
        raw = synthetic_options_chain(symbol, spot, current_iv)
        enriched_chain = _enrich_chain_with_greeks(raw, spot)
        enriched_chain["_synthetic"] = True

    try:
        market_ctx = get_full_market_context(symbol, enriched_chain)
    except Exception as e:
        logger.warning(f"market_context failed for {symbol}: {e}")
        market_ctx = {}

    # Build trades for all unique strategy keys across categories
    unique_keys = {
        rec["key"]
        for strats in recommendations_by_category.values()
        for rec in strats
    }
    trades_by_key: dict = {}
    for strategy_key in unique_keys:
        try:
            trade = build_trade(symbol, strategy_key, enriched_chain, spot)
            if enriched_chain.get("_synthetic"):
                trade["_synthetic"] = True
        except Exception as e:
            logger.warning(f"build_trade failed for {strategy_key}: {e}")
            trade = {"error": str(e)}

        strategy_catalog_entry = {**STRATEGIES.get(strategy_key, {}), "key": strategy_key}
        try:
            narrative = generate_narrative(symbol, iv_data, bias_data, strategy_catalog_entry, trade, market_context=market_ctx)
        except Exception as e:
            logger.warning(f"generate_narrative failed for {strategy_key}: {e}")
            narrative = None
        if narrative:
            trade["narrative"] = narrative

        trades_by_key[strategy_key] = trade

    result_categories = {
        cat: [
            {**rec, "trade": trades_by_key.get(rec["key"], {"error": "Not built"})}
            for rec in strats
        ]
        for cat, strats in recommendations_by_category.items()
    }

    return {
        "symbol": symbol,
        "iv_analysis": iv_data,
        "bias_analysis": bias_data,
        "detected_bias": bias,
        "recommendations_by_category": result_categories,
    }


@router.get("/strategies/scan")
async def scan_watchlist(
    symbols: str = "SPY,QQQ,AAPL,TSLA,NVDA,AMZN,GLD,TLT",
    payload: dict = Depends(verify_token),
):
    """
    Scan a comma-separated list of symbols.
    Enforces per-tier symbol count and monthly scan limits.
    Returns list sorted by IVR descending (highest IV opportunities first).
    """
    user_id = payload["sub"]
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    db = get_supabase()
    tier = get_user_tier(db, user_id)
    limits = get_limits(tier)

    max_syms = limits["max_symbols"]
    if max_syms is not None and len(symbol_list) > max_syms:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "symbol_limit_exceeded",
                "limit": max_syms,
                "tier": tier,
                "message": f"Your {tier} plan supports scanning up to {max_syms} symbols at a time.",
            },
        )

    max_scans = limits["max_scans_per_month"]
    if max_scans is not None:
        month = datetime.utcnow().strftime("%Y-%m")
        usage_result = (
            db.table("scan_usage")
            .select("scans_used")
            .eq("user_id", user_id)
            .eq("month", month)
            .execute()
        )
        scans_used = usage_result.data[0]["scans_used"] if usage_result.data else 0
        if scans_used >= max_scans:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "scan_limit_reached",
                    "limit": max_scans,
                    "used": scans_used,
                    "tier": tier,
                    "message": f"You've used all {max_scans} scans for this month on your {tier} plan.",
                },
            )
        db.table("scan_usage").upsert(
            {"user_id": user_id, "month": month, "scans_used": scans_used + 1, "last_scan_at": datetime.utcnow().isoformat()},
            on_conflict="user_id,month",
        ).execute()

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
                    scan_narrative = {
                        "headline": _build_scan_headline(symbol, iv_data, bias_data, top_rec),
                        "confirmation_summary": "",
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

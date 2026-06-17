import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials

from datetime import date as _date
from services.iv_analysis import get_iv_rank, get_directional_bias
from services.strategy_engine import recommend_by_category, build_trade, build_comparison_matrix, get_strategy_count, get_condition_match_count, STRATEGIES
from services.market_data import get_options_chain, get_quote, synthetic_options_chain
from services.greeks import calculate_greeks, fill_quote
from services.interpreter import generate_narrative
from services.market_context import get_full_market_context
from services.auth_utils import verify_token, security as bearer_security
from services.db import get_supabase
from services.legal_service import legal_gate_dep
from services.tier_limits import get_user_tier, get_limits
from services.entitlements import compute_entitlements
from services.activity_logger import log_action, extract_ip
import services.metrics as _metrics

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
            bid, ask = fill_quote(c, spot_price, T, option_type)
            enriched.append({**c, **greeks, "bid": bid, "ask": ask})
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


@router.get("/strategies/analyze/{symbol}", dependencies=[Depends(legal_gate_dep)])
async def analyze_symbol(
    symbol: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
):
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
    else:
        # Re-fetch the chain for the target expiry (closest to 45 DTE) so that
        # build_trade has contract data for the right cycle, not just the front month.
        expirations = enriched_chain.get("expirations", [])
        target = _date.today()
        from datetime import timedelta as _td
        ideal_date = target + _td(days=45)
        best_exp = None
        best_diff = None
        for exp_str in expirations:
            try:
                d = _date.fromisoformat(exp_str)
                diff = abs((d - ideal_date).days)
                if best_diff is None or diff < best_diff:
                    best_diff = diff
                    best_exp = exp_str
            except ValueError:
                continue
        loaded_exp = enriched_chain.get("expiry")
        if best_exp and best_exp != loaded_exp:
            try:
                _, enriched_chain = _get_enriched_chain_for_symbol(symbol, best_exp)
                logger.info(f"Reloaded chain for {symbol} at target expiry {best_exp}")
            except Exception as e:
                logger.warning(f"Could not reload chain for {best_exp}: {e}")

    try:
        market_ctx = get_full_market_context(symbol, enriched_chain)
    except Exception as e:
        logger.warning(f"market_context failed for {symbol}: {e}")
        market_ctx = {}

    # Resolve user identity and entitlements once for all per-user AI gates
    _user_id: str | None = None
    _user_features: dict = {}
    if credentials:
        try:
            from services.db import get_supabase as _get_sb
            _sb = _get_sb()
            _result = _sb.auth.get_user(credentials.credentials)
            if _result.user:
                _user_id = _result.user.id
                from services.entitlements import compute_entitlements as _ce
                _user_features = _ce(_user_id).get("features", {})
        except Exception:
            pass

    # E2 — News Sentiment Digest (gated by news_sentiment entitlement)
    news_sentiment: dict = {
        "sentiment": "NEUTRAL",
        "confidence": 0.0,
        "digest": "No recent news available.",
    }
    if _user_features.get("news_sentiment"):
        try:
            from services import ai_service as _ai
            raw_news = market_ctx.get("news") or []
            headlines = [item.get("title", "") for item in raw_news if item.get("title")]
            if headlines:
                news_sentiment = _ai.classify_news_sentiment(symbol, headlines)
        except Exception as _e:
            logger.debug(f"News sentiment failed for {symbol}: {_e}")

    # Check earnings awareness setting for authenticated users
    earnings_data: dict | None = None
    if _user_id:
        try:
            from services.db import get_supabase
            sb = get_supabase()
            s = sb.table("ai_settings").select("earnings_awareness_enabled").eq("user_id", _user_id).execute()
            if s.data and s.data[0].get("earnings_awareness_enabled"):
                earnings_data = (market_ctx or {}).get("earnings") or {}
        except Exception:
            pass

    # Build trades for all unique strategy keys across categories
    unique_keys = {
        rec["key"]
        for strats in recommendations_by_category.values()
        for rec in strats
    }
    trades_by_key: dict = {}
    for strategy_key in unique_keys:
        try:
            trade = build_trade(symbol, strategy_key, enriched_chain, spot, earnings_data=earnings_data)
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

    comparison_matrix = build_comparison_matrix(
        symbol=symbol,
        iv_env=iv_env,
        current_bias=bias,
        options_chain=enriched_chain,
        spot_price=spot,
        earnings_data=earnings_data,
        trades_by_key=trades_by_key,
    )

    # Increment request counter for health panel (ADR-0006)
    _metrics.increment("strategy_analyze")

    return {
        "symbol": symbol,
        "iv_analysis": iv_data,
        "bias_analysis": bias_data,
        "detected_bias": bias,
        "recommendations_by_category": result_categories,
        "news_sentiment": news_sentiment,
        "comparison_matrix": comparison_matrix,
    }


@router.get("/strategies/scan", dependencies=[Depends(legal_gate_dep)])
async def scan_watchlist(
    request: Request,
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

    # Use compute_entitlements for authoritative DB-backed limits (ADR-0003)
    entitlements = compute_entitlements(user_id)
    tier = entitlements["effective_tier"]
    max_syms = entitlements["max_symbols"]
    max_scans = entitlements["max_scans_per_month"]

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

    # Increment request counter for health panel (ADR-0006)
    _metrics.increment("strategy_scan")

    def _scan_one(symbol: str) -> dict:
        try:
            iv_data = get_iv_rank(symbol)
            bias_data = get_directional_bias(symbol)

            iv_env = iv_data.get("iv_environment", "MEDIUM")
            bias = bias_data.get("bias", "NEUTRAL")

            return {
                "symbol": symbol,
                "price": bias_data.get("price", 0.0),
                "iv_rank": iv_data.get("iv_rank", 0.0),
                "current_iv": iv_data.get("current_iv", 0.0),
                "iv_environment": iv_env,
                "percentile_label": iv_data.get("percentile_label", ""),
                "bias": bias,
                "bias_strength": bias_data.get("strength", "MODERATE"),
                "rsi14": bias_data.get("rsi14", 50.0),
                "strategy_count": get_strategy_count(iv_env),
                "condition_matches": get_condition_match_count(iv_env, bias),
                "error": iv_data.get("error") or bias_data.get("error"),
            }
        except Exception as e:
            logger.error(f"Scan error for {symbol}: {e}")
            return {
                "symbol": symbol,
                "price": 0.0,
                "iv_rank": 0.0,
                "current_iv": 0.0,
                "iv_environment": "MEDIUM",
                "percentile_label": "IVR N/A",
                "bias": "NEUTRAL",
                "bias_strength": "MODERATE",
                "rsi14": 50.0,
                "strategy_count": get_strategy_count("MEDIUM"),
                "condition_matches": 0,
                "error": str(e),
            }

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=min(len(symbol_list), 8)) as pool:
        tasks = [loop.run_in_executor(pool, _scan_one, sym) for sym in symbol_list]
        results = list(await asyncio.gather(*tasks))

    # Sort by IVR descending — highest opportunity first
    results.sort(key=lambda x: x.get("iv_rank", 0.0), reverse=True)

    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=payload.get("email", ""),
        action_type="strategy_scan",
        detail={"symbols": symbol_list},
        ip_address=extract_ip(request),
    ))

    return results

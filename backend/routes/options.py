from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from typing import Optional
from datetime import date
import logging

from services.market_data import get_quote, get_options_chain, _marketdata_chain, _yfinance_chain
from services.greeks import calculate_greeks

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/options/debug/{symbol}")
def debug_chain(symbol: str, expiry: Optional[str] = Query(None)):
    """Temporary debug endpoint — shows raw bid/ask from each data source."""
    from services.market_data import get_options_chain as _get_chain
    sym = symbol.upper()
    mda = _marketdata_chain(sym, expiry)
    yf  = _yfinance_chain(sym, expiry)
    final = _get_chain(sym, expiry)

    def sample(contracts, n=5):
        return [{"strike": c["strike"], "bid": c.get("bid"), "ask": c.get("ask"), "lastPrice": c.get("lastPrice")}
                for c in contracts[:n]]

    return {
        "mda_source": bool(mda),
        "mda_calls_sample": sample(mda.get("calls", [])) if mda else [],
        "yf_source": bool(yf),
        "yf_calls_sample": sample(yf.get("calls", [])) if yf else [],
        "final_expiry": final.get("expiry"),
        "final_calls_sample": sample(final.get("calls", [])),
    }


@router.get("/options/chain/{symbol}")
def get_chain(symbol: str, expiry: Optional[str] = Query(None)):
    chain = get_options_chain(symbol.upper(), expiry)
    quote = get_quote(symbol.upper())
    S = quote["price"]

    # Enrich with greeks
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

            greeks = calculate_greeks(S, strike, T, 0.05, sigma, option_type)
            enriched.append({**c, **greeks})
        return enriched

    calls = enrich(chain["calls"], "call")
    puts  = enrich(chain["puts"], "put")
    if calls:
        logger.info("chain %s expiry=%s first_call bid=%s ask=%s", symbol, chain["expiry"],
                    calls[0].get("bid"), calls[0].get("ask"))
    return JSONResponse(
        content={
            "symbol": symbol.upper(),
            "quote": quote,
            "expiry": chain["expiry"],
            "expirations": chain["expirations"],
            "calls": calls,
            "puts": puts,
        },
        headers={"Cache-Control": "no-store"},
    )


@router.get("/options/quote/{symbol}")
def get_stock_quote(symbol: str):
    return get_quote(symbol.upper())

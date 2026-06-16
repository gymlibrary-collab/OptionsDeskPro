from fastapi import APIRouter, Query, Response
from typing import Optional
from datetime import date
import logging

from services.market_data import get_quote, get_options_chain, _marketdata_chain, _yfinance_chain
from services.greeks import calculate_greeks, fill_quote

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/options/chain/{symbol}")
def get_chain(symbol: str, expiry: Optional[str] = Query(None), response: Response = None):
    chain = get_options_chain(symbol.upper(), expiry)
    quote = get_quote(symbol.upper())
    S = quote["price"]
    if response:
        response.headers["Cache-Control"] = "no-store"

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
            bid, ask = fill_quote(c, S, T, option_type)
            enriched.append({**c, **greeks, "bid": bid, "ask": ask})
        return enriched

    calls = enrich(chain["calls"], "call")
    puts  = enrich(chain["puts"], "put")
    if calls:
        logger.info("chain %s expiry=%s first_call bid=%s ask=%s", symbol, chain["expiry"],
                    calls[0].get("bid"), calls[0].get("ask"))
    return {
        "symbol": symbol.upper(),
        "quote": quote,
        "expiry": chain["expiry"],
        "expirations": chain["expirations"],
        "calls": calls,
        "puts": puts,
    }


@router.get("/options/quote/{symbol}")
def get_stock_quote(symbol: str):
    return get_quote(symbol.upper())

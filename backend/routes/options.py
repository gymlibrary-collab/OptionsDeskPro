from fastapi import APIRouter, Query
from typing import Optional
from datetime import date

from services.market_data import get_quote, get_options_chain
from services.greeks import calculate_greeks

router = APIRouter()


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

    return {
        "symbol": symbol.upper(),
        "quote": quote,
        "expiry": chain["expiry"],
        "expirations": chain["expirations"],
        "calls": enrich(chain["calls"], "call"),
        "puts": enrich(chain["puts"], "put"),
    }


@router.get("/options/quote/{symbol}")
def get_stock_quote(symbol: str):
    return get_quote(symbol.upper())

import asyncio
from fastapi import APIRouter, Query, Request, Response, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional
from datetime import date
import logging

from services.market_data import get_quote, get_options_chain
from services.greeks import calculate_greeks, fill_quote
from services.auth_utils import get_user_id, get_user_email
from services.activity_logger import log_action, extract_ip

# Local bearer security instance for optional-auth endpoints (public routes that
# log activity when a valid token is present but do not require authentication).
bearer_security = HTTPBearer(auto_error=False)

router = APIRouter()
logger = logging.getLogger(__name__)


def _resolve_optional_payload(credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[dict]:
    """
    Attempt to verify optional credentials. Returns payload dict if valid, else None.
    Never raises — unauthenticated callers simply receive None.
    """
    if not credentials:
        return None
    try:
        from services.db import get_supabase
        sb = get_supabase()
        result = sb.auth.get_user(credentials.credentials)
        user = result.user
        if not user:
            return None
        return {
            "sub": user.id,
            "email": user.email,
            "user_metadata": user.user_metadata or {},
            "app_metadata": user.app_metadata or {},
        }
    except Exception:
        return None


@router.get("/options/chain/{symbol}")
async def get_chain(
    symbol: str,
    request: Request,
    expiry: Optional[str] = Query(None),
    response: Response = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
):
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

    payload = _resolve_optional_payload(credentials)
    if payload:
        asyncio.create_task(log_action(
            user_id=get_user_id(payload),
            user_email=get_user_email(payload),
            action_type="options_chain_view",
            detail={"symbol": symbol.upper()},
            ip_address=extract_ip(request),
        ))

    return {
        "symbol": symbol.upper(),
        "quote": quote,
        "expiry": chain["expiry"],
        "expirations": chain["expirations"],
        "calls": calls,
        "puts": puts,
    }


@router.get("/options/quote/{symbol}")
async def get_stock_quote(
    symbol: str,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
):
    result = get_quote(symbol.upper())

    payload = _resolve_optional_payload(credentials)
    if payload:
        asyncio.create_task(log_action(
            user_id=get_user_id(payload),
            user_email=get_user_email(payload),
            action_type="ticker_search",
            detail={"symbol": symbol.upper()},
            ip_address=extract_ip(request),
        ))

    return result

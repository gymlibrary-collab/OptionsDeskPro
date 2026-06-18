import asyncio
import base64
import json
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
    Decode JWT claims locally (no network call) for activity-logging purposes.
    We only need user_id/email — cryptographic verification is not required here
    since these routes are public and we're just enriching the activity log.
    Never raises — returns None if the token cannot be decoded.
    """
    if not credentials:
        return None
    try:
        token = credentials.credentials
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload_b64))
        user_id = claims.get("sub")
        email = claims.get("email", "")
        if not user_id:
            return None
        return {
            "sub": user_id,
            "email": email,
            "user_metadata": claims.get("user_metadata") or {},
            "app_metadata": claims.get("app_metadata") or {},
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
    loop = asyncio.get_event_loop()
    chain, quote = await asyncio.gather(
        loop.run_in_executor(None, get_options_chain, symbol.upper(), expiry),
        loop.run_in_executor(None, get_quote, symbol.upper()),
    )
    # Prefer the spot price embedded in the chain response (same API call,
    # no extra yfinance round-trip). Fall back to get_quote if missing.
    S = chain.get("underlying_price") or quote["price"]
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
        # Compute T for logging (same formula as enrich)
        try:
            _exp = date.fromisoformat(chain["expiry"]) if chain["expiry"] else None
            _T_log = max((_exp - date.today()).days, 0) / 365.0 if _exp else 0.0
        except Exception:
            _T_log = -1.0
        logger.info(
            "chain %s expiry=%s S=%.2f(underlying=%.2f quote=%.2f) T=%.5f n_calls=%d "
            "first_call raw_bid=%s enriched_bid=%s ask=%s",
            symbol, chain["expiry"], S,
            chain.get("underlying_price") or 0.0, quote["price"],
            _T_log, len(calls),
            chain["calls"][0].get("bid") if chain["calls"] else "n/a",
            calls[0].get("bid"), calls[0].get("ask"),
        )

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
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, get_quote, symbol.upper())

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

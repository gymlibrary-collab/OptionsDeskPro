from fastapi import APIRouter, Depends, Query
from services.auth_utils import verify_token
from services import reddit

router = APIRouter()


@router.get("/trading/buzz/earnings")
async def earnings_buzz(payload: dict = Depends(verify_token)):
    return reddit.get_earnings_buzz()


@router.get("/trading/buzz/stocks")
async def stocks_buzz(payload: dict = Depends(verify_token)):
    return reddit.get_stocks_buzz()


@router.get("/trading/buzz/crypto")
async def crypto_buzz(payload: dict = Depends(verify_token)):
    return reddit.get_crypto_buzz()


@router.get("/trading/buzz/selected")
async def selected_buzz(
    symbols: str = Query("SPY,AAPL,NVDA,TSLA,MSFT"),
    payload: dict = Depends(verify_token),
):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return reddit.get_selected_stocks_buzz(symbol_list)


@router.get("/trading/buzz/tokens")
async def tokens_buzz(payload: dict = Depends(verify_token)):
    return reddit.get_new_tokens_buzz()

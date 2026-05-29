import logging
from fastapi import APIRouter, Depends, HTTPException
from models import OrderRequest
from services.auth_utils import verify_token, get_user_id
from services import user_portfolio
import services.alpaca_broker as alpaca

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/orders")
def place_order(req: OrderRequest, payload: dict = Depends(verify_token)):
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    if req.action.lower() not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Action must be 'buy' or 'sell'")
    if req.option_type.lower() not in ("call", "put"):
        raise HTTPException(status_code=400, detail="option_type must be 'call' or 'put'")

    user_id = get_user_id(payload)

    if alpaca.is_configured():
        try:
            result = alpaca.place_order(
                symbol=req.symbol,
                expiry=req.expiry,
                strike=req.strike,
                option_type=req.option_type,
                action=req.action,
                quantity=req.quantity,
            )
            alpaca_id = result.get("alpaca_id")
            order = user_portfolio.place_order(user_id, req, alpaca_id=alpaca_id)
            order.status = result["status"]
            return order
        except Exception as e:
            logger.error("Alpaca order failed: %s", e)
            raise HTTPException(status_code=502, detail=f"Alpaca order failed: {e}")
    else:
        # Paper trading — DB-backed per user
        order = user_portfolio.place_order(user_id, req)
        return order


@router.get("/orders")
def list_orders(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    return user_portfolio.get_orders(user_id)


@router.get("/broker/account")
def broker_account(payload: dict = Depends(verify_token)):
    """Return live Alpaca account info when configured."""
    if not alpaca.is_configured():
        return {"configured": False, "message": "Alpaca keys not set — using paper trading"}
    try:
        info = alpaca.get_account()
        info["configured"] = True
        return info
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

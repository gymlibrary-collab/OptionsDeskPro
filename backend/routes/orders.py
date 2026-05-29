import logging
from fastapi import APIRouter, HTTPException
from models import OrderRequest
from services.portfolio import portfolio
import services.alpaca_broker as alpaca

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/orders")
def place_order(req: OrderRequest):
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    if req.action.lower() not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Action must be 'buy' or 'sell'")
    if req.option_type.lower() not in ("call", "put"):
        raise HTTPException(status_code=400, detail="option_type must be 'call' or 'put'")

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
            # Also record in local portfolio for P&L tracking
            order = portfolio.place_order(req)
            order.status = result["status"]
            order.id = result["alpaca_id"]
            return order
        except Exception as e:
            logger.error("Alpaca order failed: %s", e)
            raise HTTPException(status_code=502, detail=f"Alpaca order failed: {e}")
    else:
        # Paper trading fallback
        order = portfolio.place_order(req)
        return order


@router.get("/orders")
def list_orders():
    return portfolio.get_orders()


@router.get("/broker/account")
def broker_account():
    """Return live Alpaca account info when configured."""
    if not alpaca.is_configured():
        return {"configured": False, "message": "Alpaca keys not set — using paper trading"}
    try:
        info = alpaca.get_account()
        info["configured"] = True
        return info
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

import logging
from fastapi import APIRouter, Depends, HTTPException
from models import OrderRequest, TradeRecordRequest
from services.auth_utils import verify_token, get_user_id
from services.legal_service import legal_gate_dep
from services import user_portfolio

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(legal_gate_dep)])


@router.post("/orders")
def place_order(req: OrderRequest, payload: dict = Depends(verify_token)):
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    if req.action.lower() not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Action must be 'buy' or 'sell'")
    if req.option_type.lower() not in ("call", "put"):
        raise HTTPException(status_code=400, detail="option_type must be 'call' or 'put'")
    user_id = get_user_id(payload)
    return user_portfolio.place_order(user_id, req)


@router.get("/orders")
def list_orders(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    return user_portfolio.get_orders(user_id)


@router.post("/trades/record")
def record_trade(req: TradeRecordRequest, payload: dict = Depends(verify_token)):
    """Record a real multi-leg strategy trade for monitoring."""
    if not req.legs:
        raise HTTPException(status_code=400, detail="At least one leg required")
    user_id = get_user_id(payload)
    return user_portfolio.record_trade(user_id, req)

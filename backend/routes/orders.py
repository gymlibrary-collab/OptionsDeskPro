from fastapi import APIRouter, HTTPException
from models import OrderRequest
from services.portfolio import portfolio

router = APIRouter()


@router.post("/orders")
def place_order(req: OrderRequest):
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    if req.action.lower() not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Action must be 'buy' or 'sell'")
    if req.option_type.lower() not in ("call", "put"):
        raise HTTPException(status_code=400, detail="option_type must be 'call' or 'put'")

    order = portfolio.place_order(req)
    return order


@router.get("/orders")
def list_orders():
    return portfolio.get_orders()

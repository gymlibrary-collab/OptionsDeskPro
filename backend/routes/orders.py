import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from models import OrderRequest, TradeRecordRequest
from services.auth_utils import verify_token, get_user_id, get_user_email
from services.legal_service import legal_gate_dep
from services import user_portfolio
from services.activity_logger import log_action, extract_ip

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(legal_gate_dep)])


@router.post("/orders")
async def place_order(req: OrderRequest, request: Request, payload: dict = Depends(verify_token)):
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    if req.action.lower() not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Action must be 'buy' or 'sell'")
    if req.option_type.lower() not in ("call", "put"):
        raise HTTPException(status_code=400, detail="option_type must be 'call' or 'put'")
    user_id = get_user_id(payload)
    result = user_portfolio.place_order(user_id, req)
    if result.status == "filled":
        asyncio.create_task(log_action(
            user_id=user_id,
            user_email=get_user_email(payload),
            action_type="paper_trade_placed",
            detail={
                "symbol": req.symbol,
                "strategy_name": getattr(req, "strategy_name", None),
                "legs": [{
                    "contract_symbol": req.symbol,
                    "option_type": req.option_type,
                    "strike": req.strike,
                    "expiry": req.expiry,
                    "side": req.action,
                    "qty": req.quantity,
                    "price": result.price,
                }],
                "net_debit_credit": result.price * (-1 if req.action == "buy" else 1),
                "total_contracts": req.quantity,
            },
            ip_address=extract_ip(request),
        ))
    return result


@router.get("/orders")
def list_orders(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    return user_portfolio.get_orders(user_id)


@router.post("/trades/record")
async def record_trade(req: TradeRecordRequest, request: Request, payload: dict = Depends(verify_token)):
    """Record a real multi-leg strategy trade for monitoring."""
    if not req.legs:
        raise HTTPException(status_code=400, detail="At least one leg required")
    user_id = get_user_id(payload)
    result = user_portfolio.record_trade(user_id, req)
    asyncio.create_task(log_action(
        user_id=user_id,
        user_email=get_user_email(payload),
        action_type="paper_trade_placed",
        detail={
            "symbol": req.symbol,
            "strategy_name": getattr(req, "strategy_name", None),
            "legs": [
                {
                    "contract_symbol": req.symbol,
                    "option_type": leg.option_type,
                    "strike": leg.strike,
                    "expiry": req.expiry,
                    "side": leg.action,
                    "qty": leg.quantity,
                    "price": leg.price,
                }
                for leg in req.legs
            ],
            "net_debit_credit": sum(
                -leg.price * leg.quantity if leg.action == "buy"
                else leg.price * leg.quantity
                for leg in req.legs
            ),
            "total_contracts": max(leg.quantity for leg in req.legs),
        },
        ip_address=extract_ip(request),
    ))
    return result

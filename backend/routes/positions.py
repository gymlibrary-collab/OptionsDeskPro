from fastapi import APIRouter, Depends
from services.auth_utils import verify_token, get_user_id
from services import user_portfolio

router = APIRouter()


@router.get("/positions")
def list_positions(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    return user_portfolio.get_positions(user_id)


@router.get("/portfolio")
def get_portfolio(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    return user_portfolio.get_summary(user_id)


@router.post("/positions/snapshot")
async def take_snapshot(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    user_portfolio.take_pnl_snapshot(user_id)
    return {"ok": True}

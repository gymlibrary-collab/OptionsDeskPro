from fastapi import APIRouter
from services.portfolio import portfolio

router = APIRouter()


@router.get("/positions")
def list_positions():
    return portfolio.get_positions()


@router.get("/portfolio")
def get_portfolio():
    return portfolio.get_summary()

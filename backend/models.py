from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OptionContract(BaseModel):
    symbol: str
    expiry: str
    strike: float
    option_type: str  # "call" or "put"
    bid: float
    ask: float
    last: float
    volume: int
    open_interest: int
    implied_volatility: float
    delta: float
    gamma: float
    theta: float
    vega: float


class OrderRequest(BaseModel):
    symbol: str
    expiry: str
    strike: float
    option_type: str  # "call" or "put"
    action: str  # "buy" or "sell"
    quantity: int


class Order(BaseModel):
    id: str
    timestamp: datetime
    symbol: str
    expiry: str
    strike: float
    option_type: str
    action: str
    quantity: int
    price: float
    status: str  # "filled", "rejected", "pending"


class Position(BaseModel):
    symbol: str
    expiry: str
    strike: float
    option_type: str
    quantity: int
    avg_cost: float
    current_price: float
    pnl: float
    delta: float
    gamma: float


class PortfolioSummary(BaseModel):
    cash: float
    positions_value: float
    total_value: float
    total_pnl: float

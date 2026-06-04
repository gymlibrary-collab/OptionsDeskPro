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
    price: Optional[float] = None  # user-supplied fill price; falls back to market quote if omitted
    strategy_key: Optional[str] = None
    strategy_name: Optional[str] = None
    profit_target_pct: Optional[float] = None


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
    strategy_key: Optional[str] = None
    strategy_name: Optional[str] = None
    profit_target_pct: Optional[float] = None


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
    strategy_key: Optional[str] = None
    strategy_name: Optional[str] = None
    profit_target_pct: Optional[float] = None
    entry_action: Optional[str] = None


class PortfolioSummary(BaseModel):
    cash: float
    positions_value: float
    total_value: float
    total_pnl: float


class StockOrderRequest(BaseModel):
    symbol: str
    action: str  # "buy" or "sell"
    quantity: int
    order_type: str = "market"  # "market" or "limit"
    limit_price: Optional[float] = None


class StockOrder(BaseModel):
    id: str
    timestamp: datetime
    symbol: str
    action: str
    quantity: int
    order_type: str
    limit_price: Optional[float] = None
    fill_price: float
    total_value: float
    status: str
    alpaca_id: Optional[str] = None

import uuid
from datetime import datetime, timezone
from typing import Optional
import logging

from models import Order, OrderRequest, Position, PortfolioSummary
from services.market_data import get_option_price, get_quote
from services.greeks import calculate_greeks

logger = logging.getLogger(__name__)


class Portfolio:
    def __init__(self):
        self.cash = 100_000.0  # $100k starting balance
        # key: "symbol|expiry|strike|option_type"
        self.positions: dict = {}
        self.orders: list[Order] = []

    def _pos_key(self, symbol: str, expiry: str, strike: float, option_type: str) -> str:
        return f"{symbol.upper()}|{expiry}|{strike}|{option_type.lower()}"

    def place_order(self, req: OrderRequest) -> Order:
        # Get current mid price
        price = get_option_price(req.symbol, req.expiry, req.strike, req.option_type)
        if price <= 0:
            # fallback: use a nominal price so order doesn't completely fail
            price = 0.01

        order = Order(
            id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            symbol=req.symbol.upper(),
            expiry=req.expiry,
            strike=req.strike,
            option_type=req.option_type.lower(),
            action=req.action.lower(),
            quantity=req.quantity,
            price=price,
            status="pending",
        )

        # Options represent 100 shares per contract
        total_cost = price * req.quantity * 100

        if req.action.lower() == "buy":
            if self.cash < total_cost:
                order.status = "rejected"
                self.orders.append(order)
                return order
            self.cash -= total_cost
        else:  # sell
            # Allow selling short (naked options for paper trading)
            self.cash += total_cost

        order.status = "filled"
        self.orders.append(order)

        # Update positions
        key = self._pos_key(req.symbol, req.expiry, req.strike, req.option_type)
        if key in self.positions:
            pos = self.positions[key]
            if req.action.lower() == "buy":
                new_qty = pos["quantity"] + req.quantity
                pos["avg_cost"] = (pos["avg_cost"] * pos["quantity"] + price * req.quantity) / new_qty
                pos["quantity"] = new_qty
            else:  # sell
                new_qty = pos["quantity"] - req.quantity
                if new_qty == 0:
                    del self.positions[key]
                else:
                    pos["quantity"] = new_qty
        else:
            if req.action.lower() == "buy":
                self.positions[key] = {
                    "symbol": req.symbol.upper(),
                    "expiry": req.expiry,
                    "strike": req.strike,
                    "option_type": req.option_type.lower(),
                    "quantity": req.quantity,
                    "avg_cost": price,
                }
            else:
                # Short position
                self.positions[key] = {
                    "symbol": req.symbol.upper(),
                    "expiry": req.expiry,
                    "strike": req.strike,
                    "option_type": req.option_type.lower(),
                    "quantity": -req.quantity,
                    "avg_cost": price,
                }

        return order

    def get_positions(self) -> list[Position]:
        result = []
        for key, pos in list(self.positions.items()):
            symbol = pos["symbol"]
            expiry = pos["expiry"]
            strike = pos["strike"]
            option_type = pos["option_type"]
            quantity = pos["quantity"]
            avg_cost = pos["avg_cost"]

            current_price = get_option_price(symbol, expiry, strike, option_type)
            if current_price <= 0:
                current_price = avg_cost

            pnl = (current_price - avg_cost) * quantity * 100

            # Calculate greeks
            try:
                quote = get_quote(symbol)
                S = quote["price"]
                from datetime import date
                expiry_date = date.fromisoformat(expiry)
                today = date.today()
                T = max((expiry_date - today).days, 0) / 365.0
                # Use a rough IV estimate from chain or fallback
                chain_data = None
                try:
                    from services.market_data import get_options_chain
                    chain = get_options_chain(symbol, expiry)
                    contracts = chain["calls"] if option_type == "call" else chain["puts"]
                    for c in contracts:
                        if abs(c["strike"] - strike) < 0.01:
                            chain_data = c
                            break
                except Exception:
                    pass

                sigma = chain_data["impliedVolatility"] if chain_data else 0.3
                greeks = calculate_greeks(S, strike, T, 0.05, sigma, option_type)
            except Exception:
                greeks = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0}

            result.append(Position(
                symbol=symbol,
                expiry=expiry,
                strike=strike,
                option_type=option_type,
                quantity=quantity,
                avg_cost=round(avg_cost, 2),
                current_price=round(current_price, 2),
                pnl=round(pnl, 2),
                delta=greeks.get("delta", 0.0),
                gamma=greeks.get("gamma", 0.0),
            ))
        return result

    def get_orders(self) -> list[Order]:
        return list(reversed(self.orders))

    def get_summary(self) -> PortfolioSummary:
        positions = self.get_positions()
        positions_value = sum(p.current_price * p.quantity * 100 for p in positions)
        total_pnl = sum(p.pnl for p in positions)
        return PortfolioSummary(
            cash=round(self.cash, 2),
            positions_value=round(positions_value, 2),
            total_value=round(self.cash + positions_value, 2),
            total_pnl=round(total_pnl, 2),
        )


# Singleton
portfolio = Portfolio()

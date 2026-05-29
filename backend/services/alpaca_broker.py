"""
Alpaca broker integration for real options order execution.
Falls back to paper trading if ALPACA_API_KEY is not set.
"""
import os
import logging
from datetime import date

logger = logging.getLogger(__name__)

ALPACA_API_KEY = os.getenv("ALPACA_API_KEY")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY")
ALPACA_PAPER = os.getenv("ALPACA_PAPER", "true").lower() != "false"


def is_configured() -> bool:
    return bool(ALPACA_API_KEY and ALPACA_SECRET_KEY)


def _get_client():
    from alpaca.trading.client import TradingClient
    return TradingClient(ALPACA_API_KEY, ALPACA_SECRET_KEY, paper=ALPACA_PAPER)


def _resolve_option_symbol(client, symbol: str, expiry: str, strike: float, option_type: str) -> str:
    """Find the OCC option symbol on Alpaca for the given contract spec."""
    from alpaca.trading.requests import GetOptionContractsRequest
    from alpaca.trading.enums import ContractType

    contract_type = ContractType.CALL if option_type.lower() == "call" else ContractType.PUT
    expiry_date = date.fromisoformat(expiry)

    req = GetOptionContractsRequest(
        underlying_symbols=[symbol.upper()],
        expiration_date=expiry_date,
        strike_price_gte=str(strike - 0.01),
        strike_price_lte=str(strike + 0.01),
        type=contract_type,
    )
    contracts = client.get_option_contracts(req)
    if not contracts or not contracts.option_contracts:
        raise ValueError(f"No Alpaca contract found for {symbol} {expiry} ${strike} {option_type}")
    return contracts.option_contracts[0].symbol


def place_order(symbol: str, expiry: str, strike: float, option_type: str,
                action: str, quantity: int) -> dict:
    """
    Place a real options order via Alpaca.
    Returns a dict with: alpaca_id, option_symbol, status, filled_avg_price.
    Raises on failure.
    """
    from alpaca.trading.requests import OptionOrderRequest
    from alpaca.trading.enums import OrderSide, TimeInForce, OrderType

    client = _get_client()
    option_symbol = _resolve_option_symbol(client, symbol, expiry, strike, option_type)

    order_req = OptionOrderRequest(
        symbol=option_symbol,
        qty=quantity,
        side=OrderSide.BUY if action.lower() == "buy" else OrderSide.SELL,
        type=OrderType.MARKET,
        time_in_force=TimeInForce.DAY,
    )

    order = client.submit_order(order_req)
    logger.info("Alpaca order submitted: %s %s x%d → %s", action, option_symbol, quantity, order.id)

    return {
        "alpaca_id": str(order.id),
        "option_symbol": option_symbol,
        "status": str(order.status),
        "filled_avg_price": float(order.filled_avg_price) if order.filled_avg_price else None,
    }


def get_account() -> dict:
    """Return Alpaca account info: buying power, cash, equity."""
    client = _get_client()
    acct = client.get_account()
    return {
        "cash": float(acct.cash),
        "buying_power": float(acct.buying_power),
        "equity": float(acct.equity),
        "paper": ALPACA_PAPER,
    }


def get_positions() -> list[dict]:
    """Return open option positions from Alpaca."""
    client = _get_client()
    positions = client.get_all_positions()
    result = []
    for p in positions:
        if p.asset_class == "us_option":
            result.append({
                "symbol": p.symbol,
                "qty": int(p.qty),
                "avg_entry_price": float(p.avg_entry_price),
                "current_price": float(p.current_price) if p.current_price else None,
                "unrealized_pl": float(p.unrealized_pl) if p.unrealized_pl else None,
            })
    return result

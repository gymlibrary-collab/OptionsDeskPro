"""
DB-backed portfolio operations. Each function takes user_id and operates
on that user's data in Supabase. Replaces the in-memory Portfolio class
for authenticated users.
"""
from datetime import datetime, timezone, date
from services.db import get_supabase
from services.market_data import get_option_price, get_quote
from services.greeks import calculate_greeks
from models import Order, OrderRequest, Position, PortfolioSummary


def ensure_portfolio(user_id: str) -> dict:
    """Create portfolio row if it doesn't exist. Return portfolio row."""
    sb = get_supabase()
    result = sb.table("portfolios").select("*").eq("user_id", user_id).execute()
    if result.data:
        return result.data[0]
    sb.table("portfolios").insert({"user_id": user_id, "cash": 100000.0}).execute()
    return {"user_id": user_id, "cash": 100000.0}


def place_order(user_id: str, req: OrderRequest, alpaca_id: str = None) -> Order:
    sb = get_supabase()
    price = req.price if (req.price and req.price > 0) else get_option_price(req.symbol, req.expiry, req.strike, req.option_type)
    if price <= 0:
        price = 0.01
    _update_position(sb, user_id, req, price)
    order_row = {
        "user_id": user_id,
        "symbol": req.symbol.upper(),
        "expiry": req.expiry,
        "strike": req.strike,
        "option_type": req.option_type.lower(),
        "action": req.action.lower(),
        "quantity": req.quantity,
        "price": price,
        "status": "filled",
        "strategy_key": req.strategy_key,
        "strategy_name": req.strategy_name,
        "profit_target_pct": req.profit_target_pct,
    }
    result = sb.table("orders").insert(order_row).execute()
    row = result.data[0]
    return Order(
        id=row["id"],
        timestamp=row["created_at"],
        symbol=row["symbol"],
        expiry=row["expiry"],
        strike=row["strike"],
        option_type=row["option_type"],
        action=row["action"],
        quantity=row["quantity"],
        price=row["price"],
        status=row["status"],
        strategy_key=row.get("strategy_key"),
        strategy_name=row.get("strategy_name"),
        profit_target_pct=row.get("profit_target_pct"),
    )


def record_trade(user_id: str, req) -> dict:
    """Record a real multi-leg strategy trade for monitoring. Nets quantities per strike."""
    sb = get_supabase()
    leg_map: dict = {}
    for leg in req.legs:
        key = (req.expiry, round(leg.strike, 2), leg.option_type.lower())
        qty_delta = leg.quantity if leg.action.lower() == "buy" else -leg.quantity
        if key not in leg_map:
            leg_map[key] = {"qty": 0, "price": leg.price, "action": leg.action}
        leg_map[key]["qty"] += qty_delta

    recorded = 0
    for (expiry, strike, opt_type), info in leg_map.items():
        if info["qty"] == 0:
            continue
        existing = sb.table("positions").select("*") \
            .eq("user_id", user_id) \
            .eq("symbol", req.symbol.upper()) \
            .eq("expiry", expiry) \
            .eq("strike", strike) \
            .eq("option_type", opt_type) \
            .execute().data
        if existing:
            pos = existing[0]
            old_qty = pos["quantity"]
            old_avg = float(pos["avg_cost"])
            new_qty = old_qty + info["qty"]
            if new_qty == 0:
                sb.table("positions").delete().eq("id", pos["id"]).execute()
            else:
                new_avg = (old_avg * abs(old_qty) + info["price"] * abs(info["qty"])) / abs(new_qty) if new_qty != 0 else info["price"]
                sb.table("positions").update({
                    "quantity": new_qty,
                    "avg_cost": round(new_avg, 4),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", pos["id"]).execute()
        else:
            sb.table("positions").insert({
                "user_id": user_id,
                "symbol": req.symbol.upper(),
                "expiry": expiry,
                "strike": strike,
                "option_type": opt_type,
                "quantity": info["qty"],
                "avg_cost": info["price"],
                "strategy_key": req.strategy_key,
                "strategy_name": req.strategy_name,
                "profit_target_pct": req.profit_target_pct,
                "entry_action": "buy" if info["qty"] > 0 else "sell",
            }).execute()
        recorded += 1

    return {"recorded": recorded, "strategy": req.strategy_name}


def _update_position(sb, user_id: str, req: OrderRequest, price: float):
    existing = sb.table("positions").select("*")\
        .eq("user_id", user_id)\
        .eq("symbol", req.symbol.upper())\
        .eq("expiry", req.expiry)\
        .eq("strike", req.strike)\
        .eq("option_type", req.option_type.lower())\
        .execute()

    if existing.data:
        pos = existing.data[0]
        qty = pos["quantity"]
        avg = float(pos["avg_cost"])
        if req.action.lower() == "buy":
            new_qty = qty + req.quantity
            new_avg = (avg * qty + price * req.quantity) / new_qty
            sb.table("positions").update({
                "quantity": new_qty,
                "avg_cost": new_avg,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", pos["id"]).execute()
        else:
            new_qty = qty - req.quantity
            if new_qty == 0:
                sb.table("positions").delete().eq("id", pos["id"]).execute()
            else:
                sb.table("positions").update({
                    "quantity": new_qty,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", pos["id"]).execute()
    else:
        qty = req.quantity if req.action.lower() == "buy" else -req.quantity
        sb.table("positions").insert({
            "user_id": user_id,
            "symbol": req.symbol.upper(),
            "expiry": req.expiry,
            "strike": req.strike,
            "option_type": req.option_type.lower(),
            "quantity": qty,
            "avg_cost": price,
            "strategy_key": req.strategy_key,
            "strategy_name": req.strategy_name,
            "profit_target_pct": req.profit_target_pct,
            "entry_action": req.action.lower(),
        }).execute()


def get_positions(user_id: str) -> list[Position]:
    sb = get_supabase()
    rows = sb.table("positions").select("*").eq("user_id", user_id).execute().data
    result = []
    for pos in rows:
        symbol = pos["symbol"]
        expiry = pos["expiry"]
        strike = float(pos["strike"])
        option_type = pos["option_type"]
        quantity = pos["quantity"]
        avg_cost = float(pos["avg_cost"])
        current_price = get_option_price(symbol, expiry, strike, option_type)
        if current_price <= 0:
            current_price = avg_cost
        pnl = (current_price - avg_cost) * quantity * 100
        try:
            quote = get_quote(symbol)
            S = quote["price"]
            T = max((date.fromisoformat(expiry) - date.today()).days, 0) / 365.0
            sigma = 0.3
            greeks = calculate_greeks(S, strike, T, 0.05, sigma, option_type)
        except Exception:
            greeks = {"delta": 0.0, "gamma": 0.0}
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
            strategy_key=pos.get("strategy_key"),
            strategy_name=pos.get("strategy_name"),
            profit_target_pct=pos.get("profit_target_pct"),
            entry_action=pos.get("entry_action"),
        ))
    return result


def get_orders(user_id: str) -> list[Order]:
    sb = get_supabase()
    rows = sb.table("orders").select("*")\
        .eq("user_id", user_id)\
        .order("created_at", desc=True)\
        .limit(200)\
        .execute().data
    return [
        Order(
            id=r["id"],
            timestamp=r["created_at"],
            symbol=r["symbol"],
            expiry=r["expiry"],
            strike=r["strike"],
            option_type=r["option_type"],
            action=r["action"],
            quantity=r["quantity"],
            price=r["price"],
            status=r["status"],
            strategy_key=r.get("strategy_key"),
            strategy_name=r.get("strategy_name"),
            profit_target_pct=r.get("profit_target_pct"),
        )
        for r in rows
    ]


def get_summary(user_id: str) -> PortfolioSummary:
    positions = get_positions(user_id)
    positions_value = sum(p.current_price * p.quantity * 100 for p in positions)
    total_pnl = sum(p.pnl for p in positions)
    return PortfolioSummary(
        cash=0.0,
        positions_value=round(positions_value, 2),
        total_value=round(positions_value, 2),
        total_pnl=round(total_pnl, 2),
    )


def take_pnl_snapshot(user_id: str):
    """Call once daily to record portfolio value. Upserts on date."""
    sb = get_supabase()
    summary = get_summary(user_id)
    sb.table("pnl_snapshots").upsert({
        "user_id": user_id,
        "snapshot_date": date.today().isoformat(),
        "portfolio_value": summary.total_value,
        "cash": summary.cash,
        "positions_value": summary.positions_value,
        "total_pnl": summary.total_pnl,
    }, on_conflict="user_id,snapshot_date").execute()


def log_activity(user_id: str, email: str, ip: str = None):
    """Upsert today's activity log — overwrites on same date."""
    sb = get_supabase()
    existing = sb.table("activity_log").select("*")\
        .eq("user_id", user_id)\
        .eq("log_date", date.today().isoformat())\
        .execute().data
    if existing:
        sb.table("activity_log").update({
            "login_count": existing[0]["login_count"] + 1,
            "last_login_at": datetime.now(timezone.utc).isoformat(),
            "ip_address": ip,
        }).eq("id", existing[0]["id"]).execute()
    else:
        sb.table("activity_log").insert({
            "user_id": user_id,
            "email": email,
            "log_date": date.today().isoformat(),
            "login_count": 1,
            "ip_address": ip,
        }).execute()


def place_stock_order(user_id: str, req, alpaca_id: str = None, fill_price: float = None):
    from models import StockOrderRequest, StockOrder
    sb = get_supabase()
    portfolio = ensure_portfolio(user_id)
    cash = float(portfolio["cash"])

    if fill_price and fill_price > 0:
        price = fill_price
    else:
        try:
            q = get_quote(req.symbol)
            price = q["price"]
        except Exception:
            price = 0.0

    total_value = price * req.quantity
    status = "filled"

    if req.action.lower() == "buy":
        if cash < total_value:
            status = "rejected"
        else:
            cash -= total_value
    else:
        cash += total_value

    if status == "filled":
        sb.table("portfolios").update({
            "cash": cash,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()

    row_data = {
        "user_id": user_id,
        "symbol": req.symbol.upper(),
        "action": req.action.lower(),
        "quantity": req.quantity,
        "order_type": req.order_type,
        "limit_price": req.limit_price,
        "fill_price": price,
        "total_value": total_value,
        "status": status,
        "alpaca_id": alpaca_id,
    }
    result = sb.table("stock_orders").insert(row_data).execute()
    row = result.data[0]
    from models import StockOrder
    return StockOrder(
        id=row["id"],
        timestamp=row["created_at"],
        symbol=row["symbol"],
        action=row["action"],
        quantity=row["quantity"],
        order_type=row["order_type"],
        limit_price=row.get("limit_price"),
        fill_price=row["fill_price"],
        total_value=row["total_value"],
        status=row["status"],
        alpaca_id=row.get("alpaca_id"),
    )


def get_stock_orders(user_id: str, limit: int = 50):
    from models import StockOrder
    sb = get_supabase()
    rows = sb.table("stock_orders").select("*")\
        .eq("user_id", user_id)\
        .order("created_at", desc=True)\
        .limit(limit)\
        .execute().data
    return [
        StockOrder(
            id=r["id"],
            timestamp=r["created_at"],
            symbol=r["symbol"],
            action=r["action"],
            quantity=r["quantity"],
            order_type=r["order_type"],
            limit_price=r.get("limit_price"),
            fill_price=r["fill_price"],
            total_value=r["total_value"],
            status=r["status"],
            alpaca_id=r.get("alpaca_id"),
        )
        for r in rows
    ]

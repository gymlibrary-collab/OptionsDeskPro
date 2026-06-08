"""
DB-backed portfolio operations. Each function takes user_id and operates
on that user's data in Supabase. Replaces the in-memory Portfolio class
for authenticated users.
"""
from datetime import datetime, timezone, date
import math
from scipy.stats import norm
from services.db import get_supabase
from services.market_data import get_options_chain, get_option_price, get_quote
from services.greeks import calculate_greeks
from models import Order, OrderRequest, Position, PortfolioSummary


def _bs_price(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float:
    """Black-Scholes theoretical option price."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return 0.0
    try:
        sqrt_T = math.sqrt(T)
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
        d2 = d1 - sigma * sqrt_T
        if option_type.lower() == "call":
            return round(S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2), 2)
        else:
            return round(K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1), 2)
    except Exception:
        return 0.0


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
    portfolio = ensure_portfolio(user_id)
    price = get_option_price(req.symbol, req.expiry, req.strike, req.option_type)
    if price <= 0:
        price = 0.01
    total_cost = price * req.quantity * 100
    cash = float(portfolio["cash"])

    status = "filled"
    if req.action.lower() == "buy":
        if cash < total_cost:
            status = "rejected"
        else:
            cash -= total_cost
    else:
        cash += total_cost

    # Update cash
    if status == "filled":
        sb.table("portfolios").update({
            "cash": cash,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
        _update_position(sb, user_id, req, price)

    # Insert order with strategy metadata
    order_row = {
        "user_id": user_id,
        "symbol": req.symbol.upper(),
        "expiry": req.expiry,
        "strike": req.strike,
        "option_type": req.option_type.lower(),
        "action": req.action.lower(),
        "quantity": req.quantity,
        "price": price,
        "status": status,
        "alpaca_id": alpaca_id,
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
        # Strategy metadata stored on first open — drives P&L monitoring
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
    if not rows:
        return []

    # ── Batch fetches: one quote + one chain per unique symbol/expiry ──────────────
    unique_symbols = list({r["symbol"] for r in rows})
    spot_cache: dict[str, float] = {}
    for symbol in unique_symbols:
        try:
            spot_cache[symbol] = get_quote(symbol).get("price", 0.0)
        except Exception:
            spot_cache[symbol] = 0.0

    # Build a fast lookup: (symbol, expiry, strike, option_type) → mid price
    price_lookup: dict[tuple, float] = {}
    unique_chains = list({(r["symbol"], r["expiry"]) for r in rows})
    for symbol, expiry in unique_chains:
        try:
            chain = get_options_chain(symbol, expiry)
            for otype, contracts in [("call", chain.get("calls", [])), ("put", chain.get("puts", []))]:
                for c in contracts:
                    bid, ask, last = c.get("bid", 0), c.get("ask", 0), c.get("lastPrice", 0)
                    price = round((bid + ask) / 2, 2) if bid > 0 and ask > 0 else (float(last) if last > 0 else 0.0)
                    if price > 0:
                        price_lookup[(symbol, expiry, float(c["strike"]), otype)] = price
        except Exception:
            pass  # will fall back to BS below

    result = []
    for pos in rows:
        symbol = pos["symbol"]
        expiry = pos["expiry"]
        strike = float(pos["strike"])
        option_type = pos["option_type"]
        quantity = pos["quantity"]
        avg_cost = float(pos["avg_cost"])

        # 1) Live mid price from cached chain
        current_price = price_lookup.get((symbol, expiry, strike, option_type), 0.0)

        # 2) Black-Scholes estimate when live price unavailable
        if current_price <= 0:
            S = spot_cache.get(symbol, 0.0)
            if S > 0:
                T = max((date.fromisoformat(expiry) - date.today()).days, 0) / 365.0
                current_price = _bs_price(S, strike, T, 0.05, 0.30, option_type)

        # 3) Last resort: avg_cost (P&L = 0, but avoids a misleading negative)
        if current_price <= 0:
            current_price = avg_cost

        pnl = (current_price - avg_cost) * quantity * 100

        S = spot_cache.get(symbol, 0.0)
        greeks = {"delta": 0.0, "gamma": 0.0}
        if S > 0:
            try:
                T = max((date.fromisoformat(expiry) - date.today()).days, 0) / 365.0
                greeks = calculate_greeks(S, strike, T, 0.05, 0.30, option_type)
            except Exception:
                pass

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
    sb = get_supabase()
    portfolio = ensure_portfolio(user_id)
    positions = get_positions(user_id)
    positions_value = sum(p.current_price * p.quantity * 100 for p in positions)
    total_pnl = sum(p.pnl for p in positions)
    return PortfolioSummary(
        cash=round(float(portfolio["cash"]), 2),
        positions_value=round(positions_value, 2),
        total_value=round(float(portfolio["cash"]) + positions_value, 2),
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

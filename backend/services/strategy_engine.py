"""
Strategy recommendation engine based on tastylive Options Strategy Guide.
Recommends strategies by matching IV environment + directional bias,
then selects specific strikes from the live options chain.
31 strategies total.
"""
import logging
from datetime import date, datetime, timedelta

logger = logging.getLogger(__name__)

# Full strategy catalog — 31 strategies
STRATEGIES = {
    # ── Bullish ────────────────────────────────────────────
    "covered_call": {
        "name": "Covered Call",
        "direction": ["BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (50, 70),
        "profit_target_pct": 50,
        "description": "Sell ATM/OTM call against 100 long shares to reduce cost basis.",
        "legs": ["long_stock", "short_call_otm"],
        "delta_targets": {"short_call": 30},
    },
    "long_call_vertical": {
        "name": "Long Call Vertical Spread",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (40, 60),
        "profit_target_pct": 50,
        "description": "Buy ITM call + sell OTM call. Bullish defined risk debit spread.",
        "legs": ["long_call_itm", "short_call_otm"],
        "delta_targets": {"long_call": 70, "short_call": 30},
    },
    "poor_mans_covered_call": {
        "name": "Poor Man's Covered Call",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 60),
        "profit_target_pct": 50,
        "description": "Buy long-term ITM call + sell near-term OTM call. Low IV synthetic covered call.",
        "legs": ["long_call_itm_back", "short_call_otm_front"],
        "delta_targets": {"long_call": 70, "short_call": 30},
    },
    "call_butterfly": {
        "name": "Call Butterfly",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 30,
        "pop_range": (20, 40),
        "profit_target_pct": 25,
        "description": "Buy ATM call, sell 2 OTM calls, buy further OTM call. Cheap directional bet.",
        "legs": ["long_call_atm", "short_2_calls_otm", "long_call_further_otm"],
        "delta_targets": {"body": 50, "wing": 20},
    },
    "big_lizard": {
        "name": "Big Lizard",
        "direction": ["BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 25,
        "description": "Sell ATM put + sell ATM call spread. Credit > call spread width = no upside risk.",
        "legs": ["short_put_atm", "short_call_spread_atm"],
        "delta_targets": {"short_put": 50, "short_call": 50, "long_call": 30},
    },
    "long_call": {
        "name": "Long Call",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (40, 60),
        "profit_target_pct": 100,
        "description": "Buy ATM call outright. Simple bullish directional bet with defined risk in low IV.",
        "legs": ["long_call_atm"],
        "delta_targets": {"long_call": 0.50},
    },
    "call_diagonal": {
        "name": "Call Diagonal Spread",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW", "MEDIUM"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 30,
        "pop_range": (50, 65),
        "profit_target_pct": 50,
        "description": "Sell near-term OTM call + buy back-month ITM call. Diagonal bullish spread that benefits from time decay.",
        "legs": ["short_call_otm_front", "long_call_itm_back"],
        "delta_targets": {"short_call": 0.30, "long_call": 0.70},
    },
    # ── Bearish ─────────────────────────────────────────────
    "long_put_vertical": {
        "name": "Long Put Vertical Spread",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (50, 60),
        "profit_target_pct": 50,
        "description": "Buy ITM put + sell OTM put. Bearish defined risk debit spread.",
        "legs": ["long_put_itm", "short_put_otm"],
        "delta_targets": {"long_put": -70, "short_put": -30},
    },
    "put_butterfly": {
        "name": "Put Butterfly",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 30,
        "pop_range": (20, 40),
        "profit_target_pct": 25,
        "description": "Buy ATM put, sell 2 OTM puts, buy further OTM put. Cheap directional bet.",
        "legs": ["long_put_atm", "short_2_puts_otm", "long_put_further_otm"],
        "delta_targets": {"body": -50, "wing": -20},
    },
    "reverse_big_lizard": {
        "name": "Reverse Big Lizard",
        "direction": ["BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 25,
        "description": "Sell ATM call + sell ATM put spread. Credit > put spread width = no downside risk.",
        "legs": ["short_call_atm", "short_put_spread_atm"],
        "delta_targets": {"short_call": -50, "short_put": -50, "long_put": -30},
    },
    "long_put": {
        "name": "Long Put",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (40, 60),
        "profit_target_pct": 100,
        "description": "Buy ATM put outright. Simple bearish directional bet with defined risk in low IV.",
        "legs": ["long_put_atm"],
        "delta_targets": {"long_put": -0.50},
    },
    "put_diagonal": {
        "name": "Put Diagonal Spread",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW", "MEDIUM"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 30,
        "pop_range": (50, 65),
        "profit_target_pct": 50,
        "description": "Sell near-term OTM put + buy back-month ITM put. Diagonal bearish spread that benefits from time decay.",
        "legs": ["short_put_otm_front", "long_put_itm_back"],
        "delta_targets": {"short_put": -0.30, "long_put": -0.70},
    },
    # ── Neutral ─────────────────────────────────────────────
    "short_strangle": {
        "name": "Short Strangle",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put + OTM call. Profit from time decay + IV contraction within strikes.",
        "legs": ["short_put_otm", "short_call_otm"],
        "delta_targets": {"short_put": -16, "short_call": 16},
    },
    "short_straddle": {
        "name": "Short Straddle",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 60),
        "profit_target_pct": 25,
        "description": "Sell ATM put + ATM call. Max premium collection, stock must stay near strike.",
        "legs": ["short_put_atm", "short_call_atm"],
        "delta_targets": {"short_put": -50, "short_call": 50},
    },
    "iron_condor": {
        "name": "Iron Condor",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put spread + OTM call spread. Collect ~1/3 width. Stock stays between short strikes.",
        "legs": ["short_put_spread", "short_call_spread"],
        "delta_targets": {"short_put": -16, "short_call": 16},
    },
    "iron_fly": {
        "name": "Iron Fly",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 25,
        "description": "Sell ATM straddle + buy OTM wings. Defined risk version of short straddle.",
        "legs": ["short_put_atm", "short_call_atm", "long_put_wing", "long_call_wing"],
        "delta_targets": {"short_put": -50, "short_call": 50, "wing_put": -16, "wing_call": 16},
    },
    # ── Neutral-Bullish ─────────────────────────────────────────
    "short_naked_put": {
        "name": "Short Naked Put",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put. High probability trade betting stock won't fall below strike.",
        "legs": ["short_put_otm"],
        "delta_targets": {"short_put": -30},
    },
    "short_put_vertical": {
        "name": "Short Put Vertical Spread",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put + buy further OTM put. Defined risk bullish credit spread.",
        "legs": ["short_put_otm", "long_put_further_otm"],
        "delta_targets": {"short_put": -30, "long_put": -16},
    },
    "jade_lizard": {
        "name": "Jade Lizard",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put + sell OTM call spread. Net credit > call spread width = no upside risk.",
        "legs": ["short_put_otm", "short_call_spread_otm"],
        "delta_targets": {"short_put": -30, "short_call": 30, "long_call": 16},
    },
    "put_calendar": {
        "name": "Put Calendar Spread",
        "direction": ["NEUTRAL_BEARISH"],
        "iv_environment": ["LOW", "MEDIUM"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 30,
        "pop_range": (50, 60),
        "profit_target_pct": 25,
        "description": "Sell near-term ATM put + buy back-month ATM put at same strike. Profits from time decay differential.",
        "legs": ["short_put_front", "long_put_back"],
        "delta_targets": {"short_put": -0.50, "long_put": -0.50},
    },
    "put_ratio_spread": {
        "name": "Put Ratio Spread",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 75),
        "profit_target_pct": 50,
        "description": "Buy 1 OTM put + sell 2 further OTM puts. Profits from IV contraction; net credit in high IV.",
        "legs": ["long_put_otm", "short_2_puts_further_otm"],
        "delta_targets": {"long_put": -0.40, "short_put": -0.20},
    },
    "collar": {
        "name": "Collar",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 70),
        "profit_target_pct": 50,
        "description": "Long stock + sell OTM call + buy OTM put. Hedges downside while giving up some upside.",
        "legs": ["long_stock", "short_call_otm", "long_put_otm"],
        "delta_targets": {"short_call": 0.30, "long_put": -0.30},
    },
    # ── Neutral-Bearish ─────────────────────────────────────────
    "short_naked_call": {
        "name": "Short Naked Call",
        "direction": ["NEUTRAL_BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM call. High probability trade betting stock won't rise above strike.",
        "legs": ["short_call_otm"],
        "delta_targets": {"short_call": 30},
    },
    "short_call_vertical": {
        "name": "Short Call Vertical Spread",
        "direction": ["NEUTRAL_BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM call + buy further OTM call. Defined risk bearish credit spread.",
        "legs": ["short_call_otm", "long_call_further_otm"],
        "delta_targets": {"short_call": 30, "long_call": 16},
    },
    "reverse_jade_lizard": {
        "name": "Reverse Jade Lizard",
        "direction": ["NEUTRAL_BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM call + sell OTM put spread. Net credit > put spread width = no downside risk.",
        "legs": ["short_call_otm", "short_put_spread_otm"],
        "delta_targets": {"short_call": 30, "short_put": -30, "long_put": -16},
    },
    "call_calendar": {
        "name": "Call Calendar Spread",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["LOW", "MEDIUM"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 30,
        "pop_range": (50, 60),
        "profit_target_pct": 25,
        "description": "Sell near-term ATM call + buy back-month ATM call at same strike. Profits from time decay differential.",
        "legs": ["short_call_front", "long_call_back"],
        "delta_targets": {"short_call": 0.50, "long_call": 0.50},
    },
    "call_ratio_spread": {
        "name": "Call Ratio Spread",
        "direction": ["NEUTRAL_BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 75),
        "profit_target_pct": 50,
        "description": "Buy 1 OTM call + sell 2 further OTM calls. Profits from IV contraction; net credit in high IV.",
        "legs": ["long_call_otm", "short_2_calls_further_otm"],
        "delta_targets": {"long_call": 0.40, "short_call": 0.20},
    },
    # ── Omnidirectional ─────────────────────────────────────────
    "put_broken_wing_butterfly": {
        "name": "Put Broken Wing Butterfly",
        "direction": ["NEUTRAL", "NEUTRAL_BULLISH", "OMNIDIRECTIONAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 30,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Long put spread + wider short put spread for credit. No upside risk, max profit at short strikes.",
        "legs": ["long_put_atm", "short_2_puts_otm", "long_put_further_otm_wide"],
        "delta_targets": {"long_put": -50, "short_puts": -30, "wing": -10},
    },
    "call_broken_wing_butterfly": {
        "name": "Call Broken Wing Butterfly",
        "direction": ["NEUTRAL", "NEUTRAL_BEARISH", "OMNIDIRECTIONAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 30,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Long call spread + wider short call spread for credit. No downside risk, max profit at short strikes.",
        "legs": ["long_call_atm", "short_2_calls_otm", "long_call_further_otm_wide"],
        "delta_targets": {"long_call": 50, "short_calls": 30, "wing": 10},
    },
    "long_strangle": {
        "name": "Long Strangle",
        "direction": ["OMNIDIRECTIONAL"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (30, 50),
        "profit_target_pct": 100,
        "description": "Buy OTM call + OTM put. Profits from large moves in either direction in low IV.",
        "legs": ["long_call_otm", "long_put_otm"],
        "delta_targets": {"long_call": 0.30, "long_put": -0.30},
    },
    "long_straddle": {
        "name": "Long Straddle",
        "direction": ["OMNIDIRECTIONAL"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (30, 50),
        "profit_target_pct": 100,
        "description": "Buy ATM call + ATM put. Maximum sensitivity to large moves in either direction.",
        "legs": ["long_call_atm", "long_put_atm"],
        "delta_targets": {"long_call": 0.50, "long_put": -0.50},
    },
}

# Bias compatibility mapping: a given bias can also match broader categories
BIAS_COMPATIBILITY = {
    "BULLISH": ["BULLISH"],
    "BEARISH": ["BEARISH"],
    "NEUTRAL": ["NEUTRAL"],
    "NEUTRAL_BULLISH": ["NEUTRAL_BULLISH", "BULLISH", "NEUTRAL"],
    "NEUTRAL_BEARISH": ["NEUTRAL_BEARISH", "BEARISH", "NEUTRAL"],
    "OMNIDIRECTIONAL": ["OMNIDIRECTIONAL", "NEUTRAL"],
}


def recommend_strategies(iv_env: str, bias: str) -> list:
    """
    Match strategies to current IV environment and directional bias.
    Return top 3-5 matching strategies sorted by fit score (descending).

    Fit score:
    - +3: exact direction match
    - +1: partial direction match (compatible bias)
    - +2: exact IV environment match
    - -1 per complexity point (favor simpler when equal fit)
    """
    compatible_biases = BIAS_COMPATIBILITY.get(bias, [bias])
    scored = []

    for key, strat in STRATEGIES.items():
        iv_match = iv_env in strat["iv_environment"]
        direction_match = bias in strat["direction"]
        partial_match = any(b in strat["direction"] for b in compatible_biases)

        if not iv_match and not partial_match:
            continue

        score = 0
        if iv_match:
            score += 2
        if direction_match:
            score += 3
        elif partial_match:
            score += 1
        score -= strat["complexity"] * 0.1  # small tiebreaker: prefer simpler

        scored.append((score, key, strat))

    scored.sort(key=lambda x: -x[0])

    results = []
    for score, key, strat in scored[:5]:
        results.append({
            "key": key,
            "name": strat["name"],
            "description": strat["description"],
            "direction": strat["direction"],
            "iv_environment": strat["iv_environment"],
            "risk_type": strat["risk_type"],
            "complexity": strat["complexity"],
            "dte_target": strat["dte_target"],
            "pop_range": strat["pop_range"],
            "profit_target_pct": strat["profit_target_pct"],
            "fit_score": round(score, 2),
        })

    return results


def recommend_by_category(iv_env: str) -> dict:
    """
    For each directional category, return the top 3 strategies (sorted by
    complexity ascending) whose iv_environment includes iv_env.

    Categories: BULLISH, BEARISH, NEUTRAL, NEUTRAL_BULLISH, NEUTRAL_BEARISH,
                OMNIDIRECTIONAL

    Returns a dict keyed by category name, each value a list of up to 3 strategy
    dicts (same fields as recommend_strategies minus fit_score).
    """
    categories = [
        "BULLISH",
        "BEARISH",
        "NEUTRAL",
        "NEUTRAL_BULLISH",
        "NEUTRAL_BEARISH",
        "OMNIDIRECTIONAL",
    ]

    result = {}
    for category in categories:
        matches = []
        for key, strat in STRATEGIES.items():
            if iv_env in strat["iv_environment"] and category in strat["direction"]:
                matches.append((strat["complexity"], key, strat))

        matches.sort(key=lambda x: x[0])  # simpler first

        result[category] = [
            {
                "key": key,
                "name": strat["name"],
                "description": strat["description"],
                "direction": strat["direction"],
                "iv_environment": strat["iv_environment"],
                "risk_type": strat["risk_type"],
                "complexity": strat["complexity"],
                "dte_target": strat["dte_target"],
                "pop_range": strat["pop_range"],
                "profit_target_pct": strat["profit_target_pct"],
            }
            for _, key, strat in matches[:3]
        ]

    return result


def _find_nearest_expiry(expirations: list, dte_target: int = 45) -> str | None:
    """Find the expiration date closest to today + dte_target days."""
    if not expirations:
        return None
    target = date.today() + timedelta(days=dte_target)
    best = None
    best_diff = None
    for exp_str in expirations:
        try:
            exp_date = date.fromisoformat(exp_str)
            diff = abs((exp_date - target).days)
            if best_diff is None or diff < best_diff:
                best_diff = diff
                best = exp_str
        except ValueError:
            continue
    return best


def _find_by_delta(contracts: list, target_delta: float) -> dict | None:
    """Find the contract whose delta is closest to target_delta."""
    if not contracts:
        return None
    best = None
    best_diff = None
    for c in contracts:
        delta = c.get("delta", 0.0)
        diff = abs(delta - target_delta)
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best = c
    return best


def _mid(contract: dict) -> float:
    bid = contract.get("bid", 0.0)
    ask = contract.get("ask", 0.0)
    if bid > 0 and ask > 0:
        return round((bid + ask) / 2, 2)
    return round(contract.get("lastPrice", 0.0), 2)


def build_trade(symbol: str, strategy_key: str, options_chain: dict, spot_price: float) -> dict:
    """
    Given a strategy key and live options chain (already enriched with greeks),
    find the nearest 45 DTE expiry and select strikes closest to the delta targets.

    Returns a trade structure with legs, P&L estimates, and PoP.
    """
    strat = STRATEGIES.get(strategy_key)
    if not strat:
        return {"error": f"Unknown strategy: {strategy_key}"}

    expirations = options_chain.get("expirations", [])
    expiry = _find_nearest_expiry(expirations, strat["dte_target"])
    if not expiry:
        return {"error": "No expirations available"}

    # We need to get chain data for the target expiry if different from current
    chain_expiry = options_chain.get("expiry")
    if expiry != chain_expiry:
        # The caller should pass the correct expiry chain; fall back to whatever is available
        expiry = chain_expiry or (expirations[0] if expirations else None)
        if not expiry:
            return {"error": "Cannot resolve expiry"}

    calls = options_chain.get("calls", [])
    puts = options_chain.get("puts", [])

    legs = []
    estimated_credit = 0.0

    def make_leg(role: str, option_type: str, target_delta: float, action: str) -> dict | None:
        contracts = calls if option_type == "call" else puts
        c = _find_by_delta(contracts, target_delta)
        if not c:
            return None
        mid = _mid(c)
        signed_mid = mid if action == "sell" else -mid
        return {
            "role": role,
            "option_type": option_type,
            "strike": c["strike"],
            "delta": c.get("delta", 0.0),
            "bid": c.get("bid", 0.0),
            "ask": c.get("ask", 0.0),
            "mid": mid,
            "action": action,
            "signed_mid": signed_mid,
        }

    # ── Build legs based on strategy ──────────────────────────────────────────
    if strategy_key == "covered_call":
        leg = make_leg("Short Call", "call", 0.30, "sell")
        if leg:
            legs.append(leg)
        legs.append({
            "role": "Long Stock",
            "option_type": "stock",
            "strike": spot_price,
            "delta": 1.0,
            "bid": spot_price,
            "ask": spot_price,
            "mid": spot_price,
            "action": "buy",
            "signed_mid": -spot_price,
        })

    elif strategy_key == "long_call_vertical":
        long_leg = make_leg("Long Call (ITM)", "call", 0.70, "buy")
        short_leg = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        for l in [long_leg, short_leg]:
            if l:
                legs.append(l)

    elif strategy_key == "poor_mans_covered_call":
        long_leg = make_leg("Long Call (LEAPS ITM)", "call", 0.70, "buy")
        short_leg = make_leg("Short Call (OTM front)", "call", 0.30, "sell")
        back_expiry_pmcc = next(
            (e for e in sorted(expirations)
             if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 45),
            expirations[-1] if expirations else expiry
        )
        if long_leg:
            long_leg["expiry"] = back_expiry_pmcc
            legs.append(long_leg)
        if short_leg:
            short_leg["expiry"] = expiry
            legs.append(short_leg)

    elif strategy_key == "call_butterfly":
        atm = make_leg("Long Call (ATM)", "call", 0.50, "buy")
        otm1 = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        wing = make_leg("Long Call (Wing)", "call", 0.15, "buy")
        for l in [atm, otm1, wing]:
            if l:
                legs.append(l)
        # Remove duplicate otm2 — it's same strike as otm1
        if otm1:
            legs.append({**otm1, "role": "Short Call (OTM) 2"})

    elif strategy_key == "big_lizard":
        short_put = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        short_call = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        long_call = make_leg("Long Call (OTM)", "call", 0.30, "buy")
        for l in [short_put, short_call, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "long_call":
        leg = make_leg("Long Call (ATM)", "call", 0.50, "buy")
        if leg:
            legs.append(leg)

    elif strategy_key == "call_diagonal":
        short_call = make_leg("Short Call (OTM, Front)", "call", 0.30, "sell")
        long_call = make_leg("Long Call (ITM, Back)", "call", 0.70, "buy")
        back_expiry_diag = next(
            (e for e in sorted(expirations)
             if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 28),
            expirations[-1] if expirations else expiry
        )
        if short_call:
            short_call["expiry"] = expiry
            legs.append(short_call)
        if long_call:
            long_call["expiry"] = back_expiry_diag
            legs.append(long_call)

    elif strategy_key == "long_put_vertical":
        long_leg = make_leg("Long Put (ITM)", "put", -0.70, "buy")
        short_leg = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        for l in [long_leg, short_leg]:
            if l:
                legs.append(l)

    elif strategy_key == "put_butterfly":
        atm = make_leg("Long Put (ATM)", "put", -0.50, "buy")
        otm1 = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        wing = make_leg("Long Put (Wing)", "put", -0.15, "buy")
        for l in [atm, otm1, wing]:
            if l:
                legs.append(l)
        if otm1:
            legs.append({**otm1, "role": "Short Put (OTM) 2"})

    elif strategy_key == "reverse_big_lizard":
        short_call = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        short_put = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        long_put = make_leg("Long Put (OTM)", "put", -0.30, "buy")
        for l in [short_call, short_put, long_put]:
            if l:
                legs.append(l)

    elif strategy_key == "long_put":
        leg = make_leg("Long Put (ATM)", "put", -0.50, "buy")
        if leg:
            legs.append(leg)

    elif strategy_key == "put_diagonal":
        short_put = make_leg("Short Put (OTM, Front)", "put", -0.30, "sell")
        long_put = make_leg("Long Put (ITM, Back)", "put", -0.70, "buy")
        back_expiry_pdiag = next(
            (e for e in sorted(expirations)
             if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 28),
            expirations[-1] if expirations else expiry
        )
        if short_put:
            short_put["expiry"] = expiry
            legs.append(short_put)
        if long_put:
            long_put["expiry"] = back_expiry_pdiag
            legs.append(long_put)

    elif strategy_key == "short_strangle":
        short_put = make_leg("Short Put (OTM)", "put", -0.16, "sell")
        short_call = make_leg("Short Call (OTM)", "call", 0.16, "sell")
        for l in [short_put, short_call]:
            if l:
                legs.append(l)

    elif strategy_key == "short_straddle":
        short_put = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        short_call = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        for l in [short_put, short_call]:
            if l:
                legs.append(l)

    elif strategy_key == "iron_condor":
        short_put = make_leg("Short Put", "put", -0.16, "sell")
        long_put = make_leg("Long Put (wing)", "put", -0.08, "buy")
        short_call = make_leg("Short Call", "call", 0.16, "sell")
        long_call = make_leg("Long Call (wing)", "call", 0.08, "buy")
        for l in [short_put, long_put, short_call, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "iron_fly":
        short_put = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        short_call = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        long_put = make_leg("Long Put (wing)", "put", -0.16, "buy")
        long_call = make_leg("Long Call (wing)", "call", 0.16, "buy")
        for l in [short_put, short_call, long_put, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "short_naked_put":
        leg = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        if leg:
            legs.append(leg)

    elif strategy_key == "short_put_vertical":
        short_leg = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        long_leg = make_leg("Long Put (further OTM)", "put", -0.16, "buy")
        for l in [short_leg, long_leg]:
            if l:
                legs.append(l)

    elif strategy_key == "jade_lizard":
        short_put = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        short_call = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        long_call = make_leg("Long Call (further OTM)", "call", 0.16, "buy")
        for l in [short_put, short_call, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "put_calendar":
        front_leg = make_leg("Short Put (Front Month)", "put", -0.50, "sell")
        if front_leg:
            front_leg["expiry"] = expiry
            legs.append(front_leg)
            back_mid = round(front_leg["mid"] * 1.6, 2)
            back_expiry = next(
                (e for e in sorted(expirations)
                 if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 28),
                expirations[-1] if expirations else expiry
            )
            back_leg = {
                "role": "Long Put (Back Month)",
                "option_type": "put",
                "strike": front_leg["strike"],
                "delta": front_leg.get("delta", 0.0),
                "bid": round(back_mid * 0.95, 2),
                "ask": round(back_mid * 1.05, 2),
                "mid": back_mid,
                "action": "buy",
                "signed_mid": -back_mid,
                "expiry": back_expiry,
            }
            legs.append(back_leg)

    elif strategy_key == "put_ratio_spread":
        long_put = make_leg("Long Put (OTM)", "put", -0.40, "buy")
        short1 = make_leg("Short Put (Further OTM) 1", "put", -0.20, "sell")
        if long_put:
            legs.append(long_put)
        if short1:
            legs.append(short1)
            legs.append({**short1, "role": "Short Put (Further OTM) 2"})

    elif strategy_key == "collar":
        short_call = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        long_put = make_leg("Long Put (OTM)", "put", -0.30, "buy")
        if short_call:
            legs.append(short_call)
        if long_put:
            legs.append(long_put)
        legs.append({
            "role": "Long Stock",
            "option_type": "stock",
            "strike": spot_price,
            "delta": 1.0,
            "bid": spot_price,
            "ask": spot_price,
            "mid": spot_price,
            "action": "buy",
            "signed_mid": -spot_price,
        })

    elif strategy_key == "short_naked_call":
        leg = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        if leg:
            legs.append(leg)

    elif strategy_key == "short_call_vertical":
        short_leg = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        long_leg = make_leg("Long Call (further OTM)", "call", 0.16, "buy")
        for l in [short_leg, long_leg]:
            if l:
                legs.append(l)

    elif strategy_key == "reverse_jade_lizard":
        short_call = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        short_put = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        long_put = make_leg("Long Put (further OTM)", "put", -0.16, "buy")
        for l in [short_call, short_put, long_put]:
            if l:
                legs.append(l)

    elif strategy_key == "call_calendar":
        front_leg = make_leg("Short Call (Front Month)", "call", 0.50, "sell")
        if front_leg:
            front_leg["expiry"] = expiry
            legs.append(front_leg)
            back_mid = round(front_leg["mid"] * 1.6, 2)
            back_expiry = next(
                (e for e in sorted(expirations)
                 if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 28),
                expirations[-1] if expirations else expiry
            )
            back_leg = {
                "role": "Long Call (Back Month)",
                "option_type": "call",
                "strike": front_leg["strike"],
                "delta": front_leg.get("delta", 0.0),
                "bid": round(back_mid * 0.95, 2),
                "ask": round(back_mid * 1.05, 2),
                "mid": back_mid,
                "action": "buy",
                "signed_mid": -back_mid,
                "expiry": back_expiry,
            }
            legs.append(back_leg)

    elif strategy_key == "call_ratio_spread":
        long_call = make_leg("Long Call (OTM)", "call", 0.40, "buy")
        short1 = make_leg("Short Call (Further OTM) 1", "call", 0.20, "sell")
        if long_call:
            legs.append(long_call)
        if short1:
            legs.append(short1)
            legs.append({**short1, "role": "Short Call (Further OTM) 2"})

    elif strategy_key == "put_broken_wing_butterfly":
        long_put = make_leg("Long Put (ATM)", "put", -0.50, "buy")
        short_put1 = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        short_put2 = make_leg("Short Put (OTM) 2", "put", -0.30, "sell")
        wing = make_leg("Long Put (wide wing)", "put", -0.10, "buy")
        for l in [long_put, short_put1, wing]:
            if l:
                legs.append(l)
        if short_put1:
            legs.append({**short_put1, "role": "Short Put (OTM) 2"})

    elif strategy_key == "call_broken_wing_butterfly":
        long_call = make_leg("Long Call (ATM)", "call", 0.50, "buy")
        short_call1 = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        wing = make_leg("Long Call (wide wing)", "call", 0.10, "buy")
        for l in [long_call, short_call1, wing]:
            if l:
                legs.append(l)
        if short_call1:
            legs.append({**short_call1, "role": "Short Call (OTM) 2"})

    elif strategy_key == "long_strangle":
        long_call = make_leg("Long Call (OTM)", "call", 0.30, "buy")
        long_put = make_leg("Long Put (OTM)", "put", -0.30, "buy")
        for l in [long_call, long_put]:
            if l:
                legs.append(l)

    elif strategy_key == "long_straddle":
        long_call = make_leg("Long Call (ATM)", "call", 0.50, "buy")
        long_put = make_leg("Long Put (ATM)", "put", -0.50, "buy")
        for l in [long_call, long_put]:
            if l:
                legs.append(l)

    if not legs:
        return {"error": "Could not build legs — options chain may be empty or insufficient"}

    # Calculate net credit/debit (from perspective of trader; credit = positive)
    net = sum(
        (l["mid"] if l["action"] == "sell" else -l["mid"])
        for l in legs
        if l["option_type"] != "stock"
    )
    net = round(net, 2)

    # Determine max profit and max loss
    pop_estimate = None
    max_profit = None
    max_loss = None
    breakeven_low = None
    breakeven_high = None

    # Simplified heuristics per risk type
    short_strikes = [l["strike"] for l in legs if l["action"] == "sell" and l["option_type"] != "stock"]
    long_strikes = [l["strike"] for l in legs if l["action"] == "buy" and l["option_type"] != "stock"]

    if strat["risk_type"] == "DEFINED":
        # Width of spread as proxy for max loss
        if short_strikes and long_strikes:
            width = abs(
                max(short_strikes + long_strikes) - min(short_strikes + long_strikes)
            )
            if net >= 0:  # credit spread
                max_profit = net
                max_loss = round(width - net, 2)
            else:  # debit spread
                max_profit = round(width + net, 2)  # net is negative for debit
                max_loss = round(-net, 2)
        else:
            max_profit = abs(net)
            max_loss = abs(net) * 2
    else:
        # Undefined risk
        max_profit = abs(net) if net >= 0 else None
        max_loss = None  # theoretically unlimited

    # PoP estimate: use 1 - abs(delta of short strike) for single-leg, average for multi
    short_legs = [l for l in legs if l["action"] == "sell" and l["option_type"] != "stock"]
    if short_legs:
        avg_short_delta = sum(abs(l["delta"]) for l in short_legs) / len(short_legs)
        pop_estimate = round((1 - avg_short_delta) * 100, 1)
    else:
        pop_estimate = round(sum(strat["pop_range"]) / 2, 1)

    # Breakevens
    if strategy_key in ("short_naked_put",) and short_strikes:
        breakeven_low = round(min(short_strikes) - abs(net), 2)
    elif strategy_key in ("short_naked_call",) and short_strikes:
        breakeven_high = round(max(short_strikes) + abs(net), 2)
    elif strategy_key in ("short_strangle", "short_straddle", "iron_condor", "iron_fly") and short_strikes:
        low_strike = min(short_strikes)
        high_strike = max(short_strikes)
        breakeven_low = round(low_strike - abs(net), 2)
        breakeven_high = round(high_strike + abs(net), 2)

    tastylive_profit_target = None
    if max_profit is not None:
        tastylive_profit_target = round(max_profit * strat["profit_target_pct"] / 100, 2)

    # For calendar spreads: max_loss = debit, max_profit ≈ front premium (synthetic estimate)
    if strategy_key in ("call_calendar", "put_calendar") and legs:
        front = next((l for l in legs if "Front" in l.get("role", "")), None)
        if front:
            max_loss = round(abs(net), 2)
            max_profit = round(front["mid"], 2)
            if max_profit > 0:
                tastylive_profit_target = round(max_profit * strat["profit_target_pct"] / 100, 2)

    # Clean up internal field; preserve per-leg expiry for multi-expiry strategies
    clean_legs = []
    for l in legs:
        leg_out = {
            "role": l["role"],
            "option_type": l["option_type"],
            "strike": l["strike"],
            "delta": l["delta"],
            "bid": l["bid"],
            "ask": l["ask"],
            "mid": l["mid"],
            "action": l["action"],
        }
        if "expiry" in l:
            leg_out["expiry"] = l["expiry"]
        clean_legs.append(leg_out)

    return {
        "strategy": strat["name"],
        "strategy_key": strategy_key,
        "expiry": expiry,
        "legs": clean_legs,
        "max_profit": max_profit,
        "max_loss": max_loss,
        "estimated_credit_or_debit": net,
        "pop_estimate": pop_estimate,
        "breakeven_low": breakeven_low,
        "breakeven_high": breakeven_high,
        "tastylive_profit_target": tastylive_profit_target,
        "risk_type": strat["risk_type"],
        "profit_target_pct": strat["profit_target_pct"],
    }

import math
from scipy.stats import norm


def calculate_greeks(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> dict:
    """
    Calculate Black-Scholes Greeks.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiry in years
        r: Risk-free rate (use 0.05)
        sigma: Implied volatility (annualized)
        option_type: "call" or "put"

    Returns:
        dict with delta, gamma, theta, vega, rho
    """
    if S <= 0 or K <= 0:
        return {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}

    # At expiry (T=0) return binary delta: 1 for ITM call, -1 for ITM put, 0 otherwise.
    if T <= 0 or sigma <= 0:
        is_call = option_type.lower() == "call"
        if is_call:
            delta = 1.0 if S > K else 0.0
        else:
            delta = -1.0 if S < K else 0.0
        return {"delta": delta, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}

    try:
        sqrt_T = math.sqrt(T)
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
        d2 = d1 - sigma * sqrt_T

        nd1 = norm.pdf(d1)
        Nd1 = norm.cdf(d1)
        Nd2 = norm.cdf(d2)
        Nd1_neg = norm.cdf(-d1)
        Nd2_neg = norm.cdf(-d2)

        gamma = nd1 / (S * sigma * sqrt_T)
        vega = S * nd1 * sqrt_T / 100  # per 1% change in vol

        if option_type.lower() == "call":
            delta = Nd1
            theta = (-(S * nd1 * sigma) / (2 * sqrt_T) - r * K * math.exp(-r * T) * Nd2) / 365
            rho = K * T * math.exp(-r * T) * Nd2 / 100
        else:
            delta = Nd1 - 1
            theta = (-(S * nd1 * sigma) / (2 * sqrt_T) + r * K * math.exp(-r * T) * Nd2_neg) / 365
            rho = -K * T * math.exp(-r * T) * Nd2_neg / 100

        return {
            "delta": round(delta, 4) + 0.0,
            "gamma": round(gamma, 4) + 0.0,
            "theta": round(theta, 4) + 0.0,
            "vega": round(vega, 4) + 0.0,
            "rho": round(rho, 4) + 0.0,
        }
    except Exception:
        return {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}


def black_scholes_price(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float:
    """Theoretical option price. Always returns at least the intrinsic value
    (a no-arbitrage lower bound), so it can never imply a below-intrinsic quote."""
    is_call = option_type.lower() == "call"
    intrinsic = max(0.0, (S - K) if is_call else (K - S))
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return round(float(intrinsic), 2)
    try:
        sqrt_T = math.sqrt(T)
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
        d2 = d1 - sigma * sqrt_T
        if is_call:
            price = S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)
        else:
            price = K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        return round(float(max(price, intrinsic)), 2)
    except Exception:
        return round(float(intrinsic), 2)


def fill_quote(contract: dict, S: float, T: float, option_type: str, r: float = 0.05) -> tuple:
    """
    Return (bid, ask, quote_source) for a contract, corrected for free-data problems:

    quote_source is "market" when yfinance bid/ask are used directly,
    "estimated" when a Black-Scholes or lastPrice fallback was applied.

    1. Missing quote — yfinance returns 0/NaN bid/ask for illiquid or 0-DTE contracts.
       Estimated from lastPrice when its time value is plausible against the
       Black-Scholes theoretical price, otherwise from Black-Scholes directly.
       (0-DTE OTM always uses Black-Scholes: lastPrice is stale from when the
       option had different moneyness as the stock moved during the day.)
    2. Stale quote below intrinsic — deep-ITM contracts that barely trade can
       carry a bid/ask below intrinsic value. We clamp to the intrinsic floor.
    3. Stale quote above the no-arbitrage ceiling — a call is never worth more
       than the stock, a put never more than its strike. Illiquid deep-ITM
       strikes routinely carry prints from when the stock traded higher; a bid
       at/above the ceiling is treated as broken and re-estimated.

    Real, sane quotes are left untouched.
    """
    K = float(contract.get("strike", 0.0) or 0.0)
    bid = float(contract.get("bid", 0.0) or 0.0)
    ask = float(contract.get("ask", 0.0) or 0.0)
    is_call = option_type.lower() == "call"
    intrinsic = max(0.0, (S - K) if is_call else (K - S))
    # No-arbitrage ceiling: C <= S, P <= K.
    ceiling = S if is_call else K
    estimated = False

    # Treat any value that rounds to $0.00 as missing — catches tiny yfinance
    # fractional quotes (e.g. 0.001) that are not meaningful displayed prices.
    # A bid at/above the no-arbitrage ceiling is equally unusable — a stale
    # print, not a real market.
    if round(bid, 2) <= 0 or round(ask, 2) <= 0 or (ceiling > 0 and bid >= ceiling):
        estimated = True
        last = float(contract.get("lastPrice", 0.0) or 0.0)
        sigma = float(contract.get("impliedVolatility", 0.0) or 0.0)
        if T <= 0:
            # yfinance returns near-zero IV for 0-DTE (BS inversion unstable as
            # T→0). Any annualised equity IV below ~20% is unreliably small here.
            if sigma < 0.20 or sigma > 5.0:
                sigma = 0.3
            theo = black_scholes_price(S, K, 1.0 / 365.0, r, sigma, option_type)
        else:
            # Minimum meaningful equity annualised IV is ~5%.
            if sigma < 0.05 or sigma > 5.0:
                sigma = 0.3
            theo = black_scholes_price(S, K, max(T, 1.0 / 365.0), r, sigma, option_type)
        # Trust lastPrice only when its time value is in the same regime as the
        # model's. A relative-price check can't catch stale deep-ITM prints
        # (e.g. a $10-strike call marked $404 with the stock at $394 is only 5%
        # off in price but carries $20 of phantom time value vs ~$0.35 fair),
        # so compare extrinsic value instead.
        last_ok = round(last, 2) > 0 and (last - intrinsic) <= 3.0 * (theo - intrinsic) + 0.50
        if T <= 0 and intrinsic <= 0.01:
            # 0-DTE OTM: lastPrice was set when the contract might have been ITM
            # (stock moved against it); BS with current S gives a better estimate.
            last_ok = False
        mid = max(last, intrinsic) if last_ok else max(theo, intrinsic)
        bid = round(mid * 0.975, 2)
        ask = round(mid * 1.025, 2)

    # No-arbitrage floor: an option is worth at least its intrinsic value.
    if intrinsic > 0:
        if bid < intrinsic:
            bid = round(intrinsic, 2)
            estimated = True
    # No-arbitrage ceiling on whatever survived: clamp rather than re-estimate
    # (only the ask can still exceed it here; broken bids were caught above).
    if ceiling > 0 and ask > ceiling:
        ask = round(ceiling, 2)
        estimated = True
    # Correct inverted spreads on all contracts (including OTM where intrinsic=0).
    if ask < bid:
        ask = bid

    quote_source = "estimated" if estimated else "market"
    return round(float(bid), 2), round(float(ask), 2), quote_source

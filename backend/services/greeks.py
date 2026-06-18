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
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}

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
            "delta": round(delta, 4),
            "gamma": round(gamma, 4),
            "theta": round(theta, 4),
            "vega": round(vega, 4),
            "rho": round(rho, 4),
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
    Return (bid, ask) for a contract, corrected for two free-data problems:

    1. Missing quote — yfinance returns 0/NaN bid/ask for illiquid contracts.
       We substitute a Black-Scholes theoretical price ± a 2.5% spread.
    2. Stale quote below intrinsic — deep-ITM contracts that barely trade can
       carry a last-traded bid/ask below intrinsic value, which is an
       impossible (arbitrageable) market. We clamp to the intrinsic floor.

    Real, sane quotes are left untouched.
    """
    K = float(contract.get("strike", 0.0) or 0.0)
    bid = float(contract.get("bid", 0.0) or 0.0)
    ask = float(contract.get("ask", 0.0) or 0.0)
    is_call = option_type.lower() == "call"
    intrinsic = max(0.0, (S - K) if is_call else (K - S))

    # Treat any value that rounds to $0.00 as missing — catches tiny yfinance
    # fractional quotes (e.g. 0.001) that are not meaningful displayed prices.
    if round(bid, 2) <= 0 and round(ask, 2) <= 0:
        sigma = float(contract.get("impliedVolatility", 0.0) or 0.0)
        if sigma <= 0 or sigma > 5.0:   # also reject absurd IV values from stale data
            sigma = 0.3
        # Use at least 0.5 days of time value so OTM options on expiry day still
        # get a small theoretical price rather than $0.00 across the board.
        T_bs = max(T, 0.5 / 365.0)
        theo = black_scholes_price(S, K, T_bs, r, sigma, option_type)
        bid = round(theo * 0.975, 2)
        ask = round(theo * 1.025, 2)

    # No-arbitrage floor: an option is worth at least its intrinsic value.
    if intrinsic > 0:
        if bid < intrinsic:
            bid = round(intrinsic, 2)
        if ask < bid:
            ask = bid

    return round(float(bid), 2), round(float(ask), 2)

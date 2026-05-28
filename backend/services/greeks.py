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

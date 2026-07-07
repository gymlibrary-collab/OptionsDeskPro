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
    Return (bid, ask, quote_source) for a contract, corrected for free-data problems:

    quote_source is "market" when yfinance bid/ask are used directly,
    "estimated" when a Black-Scholes or lastPrice fallback was applied.

    1. Missing quote — yfinance returns 0/NaN bid/ask for illiquid or 0-DTE contracts.
       Fallback strategy depends on time-to-expiry:
       - 0-DTE ITM: use lastPrice (it closely tracks intrinsic; stale lastPrice is
         still directionally correct for ITM options).
       - 0-DTE OTM: use Black-Scholes with current S (lastPrice is stale from when
         the option had different moneyness as the stock moved during the day).
       - Non-0-DTE: try lastPrice, then Black-Scholes.
    2. Stale quote below intrinsic — deep-ITM contracts that barely trade can
       carry a bid/ask below intrinsic value. We clamp to the intrinsic floor.

    Real, sane quotes are left untouched.
    """
    K = float(contract.get("strike", 0.0) or 0.0)
    bid = float(contract.get("bid", 0.0) or 0.0)
    ask = float(contract.get("ask", 0.0) or 0.0)
    is_call = option_type.lower() == "call"
    intrinsic = max(0.0, (S - K) if is_call else (K - S))
    estimated = False

    # Treat any value that rounds to $0.00 as missing — catches tiny yfinance
    # fractional quotes (e.g. 0.001) that are not meaningful displayed prices.
    if round(bid, 2) <= 0 or round(ask, 2) <= 0:
        estimated = True
        if T <= 0:
            # 0-DTE: yfinance bid/ask are absent; lastPrice can be stale in the
            # wrong direction when the stock moved and flipped a contract's moneyness.
            # Split on whether the contract is currently ITM or OTM:
            # - ITM: lastPrice was from a trade that also saw intrinsic value, so it's
            #   a reasonable proxy; floor it at intrinsic.
            # - OTM: lastPrice was set when the contract might have been ITM (stock
            #   moved against it); BS with current S gives a better estimate.
            last = float(contract.get("lastPrice", 0.0) or 0.0)
            if intrinsic > 0.01 and round(last, 2) > 0:
                mid = max(last, intrinsic)
                bid = round(mid * 0.975, 2)
                ask = round(mid * 1.025, 2)
            else:
                sigma = float(contract.get("impliedVolatility", 0.0) or 0.0)
                # yfinance returns near-zero IV for 0-DTE (BS inversion unstable as
                # T→0). Any annualised equity IV below ~20% is unreliably small here.
                if sigma < 0.20 or sigma > 5.0:
                    sigma = 0.3
                theo = black_scholes_price(S, K, 1.0 / 365.0, r, sigma, option_type)
                bid = round(theo * 0.975, 2)
                ask = round(theo * 1.025, 2)
        else:
            # Non-0-DTE: lastPrice is generally fresh enough relative to S changes.
            last = float(contract.get("lastPrice", 0.0) or 0.0)
            if round(last, 2) > 0:
                mid = max(last, intrinsic)
                bid = round(mid * 0.975, 2)
                ask = round(mid * 1.025, 2)
            else:
                sigma = float(contract.get("impliedVolatility", 0.0) or 0.0)
                # Minimum meaningful equity annualised IV is ~5%.
                if sigma < 0.05 or sigma > 5.0:
                    sigma = 0.3
                T_bs = max(T, 1.0 / 365.0)
                theo = black_scholes_price(S, K, T_bs, r, sigma, option_type)
                bid = round(theo * 0.975, 2)
                ask = round(theo * 1.025, 2)

    # No-arbitrage floor: an option is worth at least its intrinsic value.
    if intrinsic > 0:
        if bid < intrinsic:
            bid = round(intrinsic, 2)
            estimated = True
    # Correct inverted spreads on all contracts (including OTM where intrinsic=0).
    if ask < bid:
        ask = bid

    quote_source = "estimated" if estimated else "market"
    return round(float(bid), 2), round(float(ask), 2), quote_source

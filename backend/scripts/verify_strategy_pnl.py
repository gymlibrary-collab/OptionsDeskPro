"""
Verify P&L calculations across all strategies.

Run from the backend/ directory:
    python scripts/verify_strategy_pnl.py

Prints a table with the key computed values for every strategy built against
a realistic synthetic chain (spot=100, IV=30%, 45 DTE). Each row is followed
by the mathematical check that should hold for that strategy type.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.greeks import calculate_greeks, black_scholes_price
from services.strategy_engine import STRATEGIES, build_trade

SPOT   = 100.0
SIGMA  = 0.30
R      = 0.05
T      = 45 / 365.0
EXPIRY = "2026-08-15"
EXPIRATIONS = ["2026-08-15", "2026-09-19", "2026-10-17", "2026-12-19"]


def _contract(strike, option_type):
    g     = calculate_greeks(SPOT, strike, T, R, SIGMA, option_type)
    price = black_scholes_price(SPOT, strike, T, R, SIGMA, option_type)
    return {
        "strike": round(strike, 2), "option_type": option_type,
        "delta": g["delta"], "theta": g["theta"], "vega": g["vega"],
        "gamma": g["gamma"], "impliedVolatility": SIGMA,
        "bid": round(max(price - 0.05, 0.01), 2),
        "ask": round(price + 0.05, 2),
        "lastPrice": price, "volume": 500, "openInterest": 1000,
    }


def _chain(strikes):
    calls = [_contract(k, "call") for k in strikes]
    puts  = [_contract(k, "put")  for k in strikes]
    return {"expirations": EXPIRATIONS, "expiry": EXPIRY, "calls": calls, "puts": puts}


DENSE_CHAIN = _chain([float(k) for k in range(70, 131)])

# ── P&L invariant checkers ────────────────────────────────────────────────────

def _check(key, trade):
    """Return (passed: bool, detail: str) for this trade's P&L invariant."""
    if trade is None:
        return None, "SUPPRESSED (non-viable at these prices)"
    if "error" in trade:
        return False, f"BUILD ERROR: {trade['error']}"

    strat = STRATEGIES[key]
    net = trade.get("estimated_credit_or_debit", 0)
    mp  = trade.get("max_profit")
    ml  = trade.get("max_loss")

    legs = [l for l in trade["legs"] if l.get("option_type") != "stock"]

    # Guard 1 — max_profit must be None (unlimited) or strictly positive
    if mp is not None and mp <= 0:
        return False, f"FAIL max_profit={mp} <= 0"

    # Guard 2 — debit + defined → max_profit >= max_loss
    if net < 0 and strat["risk_type"] == "DEFINED" and mp is not None and ml is not None:
        if mp < ml:
            return False, f"FAIL debit: max_profit={mp} < max_loss={ml}"

    # Vertical no-arbitrage: max_profit + max_loss == spread width
    if key in ("long_call_vertical", "short_call_vertical",
               "long_put_vertical",  "short_put_vertical"):
        strikes = [l["strike"] for l in legs]
        width   = abs(max(strikes) - min(strikes))
        total   = (mp or 0) + (ml or 0)
        if abs(total - width) > 0.05:
            return False, f"FAIL vertical arb: mp+ml={total:.2f} != width={width}"

    # Iron condor / iron fly: mp + ml == wider individual spread width
    if key in ("iron_condor", "iron_fly", "dynamic_width_iron_condor"):
        put_w  = abs(max(l["strike"] for l in legs if l["option_type"] == "put")
                   - min(l["strike"] for l in legs if l["option_type"] == "put"))
        call_w = abs(max(l["strike"] for l in legs if l["option_type"] == "call")
                   - min(l["strike"] for l in legs if l["option_type"] == "call"))
        width  = max(put_w, call_w)
        total  = (mp or 0) + (ml or 0)
        if abs(total - width) > 0.05:
            return False, f"FAIL wing arb: mp+ml={total:.2f} != width={width}"

    # ZEBRA: unlimited upside, max_loss == debit
    if key in ("call_zebra", "put_zebra"):
        if mp is not None:
            return False, f"FAIL ZEBRA: max_profit should be None (unlimited), got {mp}"
        if ml is None or abs(ml - abs(net)) > 0.02:
            return False, f"FAIL ZEBRA: max_loss={ml} != debit={abs(net):.2f}"

    # Credit/debit sign: net == signed leg sum
    signed_sum = round(sum(
        l["mid"] if l["action"] == "sell" else -l["mid"] for l in legs
    ), 2)
    if abs(net - signed_sum) > 0.02:
        return False, f"FAIL sign: net={net} != leg_sum={signed_sum}"

    # Undefined risk must have max_loss=None
    if strat["risk_type"] == "UNDEFINED" and ml is not None:
        return False, f"FAIL: UNDEFINED risk has capped max_loss={ml}"

    return True, "OK"


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    COL = 36
    header = (
        f"{'STRATEGY':<{COL}} {'NET':>8} {'MAX_P':>8} {'MAX_L':>8}  "
        f"{'RISK':<9} {'CHECK'}"
    )
    print(header)
    print("─" * len(header))

    failures = []
    suppressed = 0
    passes = 0

    for key in sorted(STRATEGIES):
        trade  = build_trade("TEST", key, DENSE_CHAIN, SPOT)
        passed, detail = _check(key, trade)

        if trade is None:
            suppressed += 1
            net_s = mp_s = ml_s = "—"
            risk_s = "—"
        elif "error" in trade:
            net_s = mp_s = ml_s = "ERR"
            risk_s = "—"
        else:
            net = trade.get("estimated_credit_or_debit", 0)
            mp  = trade.get("max_profit")
            ml  = trade.get("max_loss")
            net_s  = f"${net:+.2f}"
            mp_s   = "∞" if mp is None else f"${mp:.2f}"
            ml_s   = "∞" if ml is None else f"${ml:.2f}"
            risk_s = STRATEGIES[key]["risk_type"]

        status = "✓" if passed else ("⚡ suppressed" if passed is None else "✗")
        if passed is False:
            failures.append((key, detail))
        elif passed is True:
            passes += 1

        print(
            f"{key:<{COL}} {net_s:>8} {mp_s:>8} {ml_s:>8}  "
            f"{risk_s:<9} {status}  {detail if passed is False else ''}"
        )

    print("─" * len(header))
    print(f"\n{passes} passed  |  {suppressed} suppressed (non-viable)  |  {len(failures)} failed")

    if failures:
        print("\nFAILURES:")
        for k, d in failures:
            print(f"  {k}: {d}")
        sys.exit(1)


if __name__ == "__main__":
    main()

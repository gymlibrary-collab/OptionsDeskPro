"""
Plain-English narrative engine for options trade interpretation.
All values come directly from computed data — no AI, no approximations.
"""
from datetime import date


def _days_to_expiry(expiry: str) -> int:
    """Return calendar days from today to the expiry date."""
    try:
        exp_date = date.fromisoformat(expiry)
        return max(0, (exp_date - date.today()).days)
    except Exception:
        return 0


def _market_snapshot(symbol: str, bias_analysis: dict) -> str:
    price = bias_analysis.get("price", 0.0)
    sma20 = bias_analysis.get("sma20", 0.0)
    sma50 = bias_analysis.get("sma50", 0.0)
    rsi14 = bias_analysis.get("rsi14", 50.0)
    bias = bias_analysis.get("bias", "NEUTRAL")

    # SMA relationship
    above_20 = price > sma20 if sma20 else None
    above_50 = price > sma50 if sma50 else None

    if above_20 is not None and above_50 is not None:
        if above_20 and above_50:
            ma_line = f"{symbol} is trading at ${price:.2f}, above both its 20-day (${sma20:.2f}) and 50-day (${sma50:.2f}) moving averages — a sign of underlying strength."
        elif not above_20 and not above_50:
            ma_line = f"{symbol} is trading at ${price:.2f}, below both its 20-day (${sma20:.2f}) and 50-day (${sma50:.2f}) moving averages — a sign of underlying weakness."
        elif above_20 and not above_50:
            ma_line = f"{symbol} is trading at ${price:.2f}, above its 20-day average (${sma20:.2f}) but still below its 50-day average (${sma50:.2f}) — the short-term trend is recovering but the longer-term picture is mixed."
        else:
            ma_line = f"{symbol} is trading at ${price:.2f}, below its 20-day average (${sma20:.2f}) but still above its 50-day average (${sma50:.2f}) — the short-term trend is softening while the longer-term trend remains intact."
    else:
        ma_line = f"{symbol} is trading at ${price:.2f}."

    # RSI interpretation
    if rsi14 > 60:
        rsi_line = f"The RSI (a momentum indicator) reads {rsi14:.1f} — momentum is strong, meaning buyers have been in control recently."
    elif rsi14 < 40:
        rsi_line = f"The RSI (a momentum indicator) reads {rsi14:.1f} — the stock is oversold, meaning it has fallen fast and a bounce is possible."
    else:
        rsi_line = f"The RSI (a momentum indicator) reads {rsi14:.1f} — momentum is neutral, with no strong lean in either direction."

    # Directional conclusion
    bias_clean = bias.replace("_", " ").capitalize()
    conclusion = f"Overall, the stock looks {bias_clean.lower()}."

    return f"{ma_line} {rsi_line} {conclusion}"


def _iv_context(symbol: str, iv_analysis: dict) -> str:
    ivr = iv_analysis.get("iv_rank", 0.0)
    iv_pct = iv_analysis.get("current_iv", 0.0) * 100

    if ivr < 30:
        return (
            f"Options on {symbol} are cheap right now — IV Rank (a measure of how expensive options are) "
            f"is {ivr:.0f}/100, meaning options premiums are in the bottom {100 - ivr:.0f}% of their annual range. "
            f"The current implied volatility is {iv_pct:.1f}%. "
            f"When options are cheap, buying strategies tend to work better than selling."
        )
    elif ivr <= 50:
        return (
            f"Options on {symbol} are moderately priced — IV Rank (a measure of how expensive options are) "
            f"is {ivr:.0f}/100. "
            f"The current implied volatility is {iv_pct:.1f}%. "
            f"Neither buying nor selling has a strong edge from a volatility standpoint."
        )
    else:
        return (
            f"Options on {symbol} are expensive right now — IV Rank (a measure of how expensive options are) "
            f"is {ivr:.0f}/100, meaning options premiums are in the top {ivr:.0f}% of their annual range. "
            f"The current implied volatility is {iv_pct:.1f}%. "
            f"When options are expensive, selling strategies tend to collect more premium and have an edge."
        )


def _why_this_strategy(symbol: str, iv_analysis: dict, bias_analysis: dict, strategy: dict) -> str:
    iv_env = iv_analysis.get("iv_environment", "MEDIUM")
    ivr = iv_analysis.get("iv_rank", 0.0)
    bias = bias_analysis.get("bias", "NEUTRAL")
    strat_name = strategy.get("name", "this strategy")
    risk_type = strategy.get("risk_type", "DEFINED")

    iv_desc = "high" if iv_env == "HIGH" else ("low" if iv_env == "LOW" else "moderate")
    bias_clean = bias.replace("_", " ").lower()

    # Strategy-type-specific reasoning
    key = strategy.get("key", "")

    if key in ("short_strangle", "iron_condor", "short_straddle", "iron_fly"):
        return (
            f"Because IV Rank is {ivr:.0f}/100 (high) and the stock looks {bias_clean}, "
            f"selling premium on both sides of the market makes sense. "
            f"The {strat_name} collects cash upfront and profits as long as {symbol} doesn't move too far in either direction. "
            f"High IV means you're selling inflated options — and when volatility contracts, those options lose value faster, working in your favor."
        )
    elif key in ("short_naked_put", "short_put_vertical", "jade_lizard"):
        return (
            f"With IV Rank at {ivr:.0f}/100 and a {bias_clean} market lean, "
            f"selling a put makes sense: you collect premium and only lose if {symbol} falls below your strike. "
            f"The {strat_name} is a high-probability trade that profits from time decay and any upward or sideways price movement."
        )
    elif key in ("short_naked_call", "short_call_vertical", "reverse_jade_lizard"):
        return (
            f"With IV Rank at {ivr:.0f}/100 and a {bias_clean} market lean, "
            f"selling a call makes sense: you collect premium and only lose if {symbol} rises above your strike. "
            f"The {strat_name} is a high-probability trade that profits from time decay and any downward or sideways price movement."
        )
    elif key in ("long_call_vertical", "covered_call", "poor_mans_covered_call", "big_lizard"):
        return (
            f"The stock looks {bias_clean} and IV is {iv_desc} at {ivr:.0f}/100. "
            f"The {strat_name} positions you to profit if {symbol} continues higher, "
            f"while {'limiting your risk to a defined amount' if risk_type == 'DEFINED' else 'using options to reduce your cost basis'}."
        )
    elif key in ("long_put_vertical", "reverse_big_lizard"):
        return (
            f"The stock looks {bias_clean} and IV is {iv_desc} at {ivr:.0f}/100. "
            f"The {strat_name} positions you to profit if {symbol} continues lower, "
            f"with risk limited to the premium paid."
        )
    elif key in ("call_butterfly", "put_butterfly",
                 "put_broken_wing_butterfly", "call_broken_wing_butterfly"):
        return (
            f"With a {bias_clean} lean and IV Rank at {ivr:.0f}/100, "
            f"the {strat_name} is a low-cost directional bet that profits most if {symbol} lands near a specific target price by expiration. "
            f"The wings of the spread cap your maximum loss to what you paid."
        )
    else:
        return (
            f"Given the current IV Rank of {ivr:.0f}/100 ({iv_desc} IV environment) "
            f"and a {bias_clean} directional bias, the {strat_name} is the best-fitting strategy. "
            f"It is {'defined-risk, capping your maximum loss' if risk_type == 'DEFINED' else 'undefined-risk, but managed with tastylive rules'}."
        )


def _trade_plain_english(symbol: str, trade: dict) -> str:
    legs = trade.get("legs", [])
    net = trade.get("estimated_credit_or_debit", 0.0)
    expiry = trade.get("expiry", "")
    lines = []

    for leg in legs:
        action = leg.get("action", "buy")
        otype = leg.get("option_type", "call")
        strike = leg.get("strike", 0.0)
        mid = leg.get("mid", 0.0)

        if otype == "stock":
            lines.append(f"Buy 100 shares of {symbol} at ~${strike:.2f} (this is the stock position).")
            continue

        cost_per = mid * 100
        if action == "sell":
            lines.append(
                f"Sell the ${strike:.0f} {otype.upper()} → you collect ${cost_per:.0f} per contract upfront."
            )
        else:
            lines.append(
                f"Buy the ${strike:.0f} {otype.upper()} → you pay ${cost_per:.0f} per contract (this caps your risk)."
            )

    # Net summary
    abs_net = abs(net) * 100
    if net >= 0:
        lines.append(
            f"Net: you collect ${abs_net:.0f} total per contract (each contract = 100 shares). "
            f"This cash is yours immediately."
        )
    else:
        lines.append(
            f"Net: you pay ${abs_net:.0f} total per contract (each contract = 100 shares). "
            f"This is your maximum possible loss on the trade."
        )

    return " ".join(lines)


def _profit_scenario(symbol: str, trade: dict, strategy: dict) -> str:
    max_profit = trade.get("max_profit")
    profit_target_pct = strategy.get("profit_target_pct", 50)
    expiry = trade.get("expiry", "")
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")

    if max_profit is None:
        max_profit_dollars = "an unlimited amount"
        target_dollars = "50% of max profit"
    else:
        max_profit_dollars = f"${max_profit * 100:.0f}"
        target_dollars = f"${max_profit * 100 * profit_target_pct / 100:.0f}"

    # Profit range description
    if bl is not None and bh is not None:
        range_text = f"{symbol} stays between ${bl:.2f} and ${bh:.2f}"
    elif bl is not None:
        range_text = f"{symbol} stays above ${bl:.2f}"
    elif bh is not None:
        range_text = f"{symbol} stays below ${bh:.2f}"
    else:
        # Fallback: describe profit based on strategy direction
        direction = strategy.get("direction", ["NEUTRAL"])[0]
        if "BULLISH" in direction:
            legs = trade.get("legs", [])
            strikes = [l["strike"] for l in legs if l.get("option_type") != "stock"]
            if strikes:
                range_text = f"{symbol} rises above ${max(strikes):.0f}"
            else:
                range_text = f"{symbol} moves in your favor"
        elif "BEARISH" in direction:
            legs = trade.get("legs", [])
            strikes = [l["strike"] for l in legs if l.get("option_type") != "stock"]
            if strikes:
                range_text = f"{symbol} falls below ${min(strikes):.0f}"
            else:
                range_text = f"{symbol} moves in your favor"
        else:
            range_text = f"{symbol} stays near current levels"

    if max_profit is None:
        return (
            f"This trade makes money if {range_text} through {expiry}. "
            f"TastyLive recommends closing early when you've made 50% of your initial credit collected."
        )
    else:
        return (
            f"This trade makes money if {range_text} through {expiry}. "
            f"If that happens, you keep the {max_profit_dollars} you collected. "
            f"TastyLive recommends closing early when you've made {profit_target_pct}% of max profit ({target_dollars})."
        )


def _loss_scenario(symbol: str, trade: dict, strategy: dict) -> str:
    max_loss = trade.get("max_loss")
    risk_type = trade.get("risk_type", "DEFINED")
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")
    legs = trade.get("legs", [])
    short_strikes = [l["strike"] for l in legs if l.get("action") == "sell" and l.get("option_type") != "stock"]

    if risk_type == "DEFINED" and max_loss is not None:
        max_loss_dollars = f"${max_loss * 100:.0f}"
        loss_text = f"Your maximum loss on this trade is {max_loss_dollars} per contract — you can't lose more than that, no matter what {symbol} does."
    else:
        loss_text = f"This is an undefined-risk trade, meaning losses can grow if {symbol} moves sharply against you. TastyLive recommends keeping position size small (1-3% of your portfolio) and using their 2x credit rule as a hard stop."

    # Trigger for loss
    if bl is not None and bh is not None:
        trigger = f"The loss is triggered if {symbol} breaks below ${bl:.2f} or above ${bh:.2f} at expiration."
    elif bl is not None:
        trigger = f"The loss is triggered if {symbol} falls below ${bl:.2f} at expiration."
    elif bh is not None:
        trigger = f"The loss is triggered if {symbol} rises above ${bh:.2f} at expiration."
    elif short_strikes:
        trigger = f"The loss grows as {symbol} moves past your short strike(s) at ${', $'.join(str(int(s)) for s in sorted(short_strikes))}."
    else:
        trigger = f"The loss grows if {symbol} moves significantly against the position before expiration."

    exit_rule = "TastyLive's rule: close the trade if the loss reaches 2× the credit collected, to avoid a large tail loss."

    return f"{loss_text} {trigger} {exit_rule}"


def _defensive_tactic(strategy_key: str) -> str:
    tactics = {
        "short_strangle": (
            "If the stock moves toward one of your strikes, roll the untested (opposite) side closer to the current price to collect more credit. "
            "This lowers your breakeven and reduces directional exposure."
        ),
        "iron_condor": (
            "If the stock moves toward one of your short strikes, roll the untested (opposite) spread closer to the current price to collect more credit. "
            "This lowers your breakeven and reduces directional exposure."
        ),
        "short_naked_put": (
            "If the stock drops below your strike, roll the position out in time (to a later expiry) for additional credit. "
            "This adds more time for the stock to recover without taking a loss."
        ),
        "short_put_vertical": (
            "If the stock drops below your short strike, roll the spread out in time (to a later expiry) for additional credit. "
            "This adds more time for the stock to recover without taking a loss."
        ),
        "iron_fly": (
            "If the stock moves outside your breakeven, roll the untested side past the tested side (creating an inversion) to collect more credit and widen your profit zone."
        ),
        "short_straddle": (
            "If the stock moves outside your breakeven, roll the untested side past the tested side (creating an inversion) to collect more credit and widen your profit zone."
        ),
        "long_call_vertical": (
            "If the trade moves against you, you can roll the short strike closer to the long strike to reduce your net debit, "
            "but don't roll below your breakeven."
        ),
        "long_put_vertical": (
            "If the trade moves against you, you can roll the short strike closer to the long strike to reduce your net debit, "
            "but don't roll below your breakeven."
        ),
        "covered_call": (
            "If the short call loses value, roll it out to a further expiry and optionally down a few strikes to reduce your cost basis further."
        ),
        "jade_lizard": (
            "If the short put (jade lizard) goes ITM, roll it out in time for credit, or roll the spread to defend it."
        ),
        "reverse_jade_lizard": (
            "If the short call (reverse jade lizard) goes ITM, roll it out in time for credit, or roll the spread to defend it."
        ),
        "big_lizard": (
            "If the naked put goes ITM near expiry, roll it out in time and close the call spread, then redeploy a new call spread."
        ),
        "reverse_big_lizard": (
            "If the naked call goes ITM near expiry, roll it out in time and close the put spread, then redeploy a new put spread."
        ),
    }
    return tactics.get(
        strategy_key,
        "Monitor the position. If the trade moves significantly against you, consider rolling to a later expiry for additional credit before taking a loss.",
    )


def _execution_checklist(symbol: str, trade: dict) -> list:
    legs = trade.get("legs", [])
    expiry = trade.get("expiry", "")
    dte = _days_to_expiry(expiry)
    net = trade.get("estimated_credit_or_debit", 0.0)
    abs_net = abs(net) * 100
    is_credit = net >= 0
    profit_target = trade.get("tastylive_profit_target")
    profit_target_dollars = f"${profit_target * 100:.0f}" if profit_target is not None else "50% of max profit"
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")
    strategy_name = trade.get("strategy", "this strategy")

    steps = [
        "Open your broker platform (thinkorswim, Robinhood, tastytrade, etc.).",
        f"Search for {symbol} and navigate to the Options Chain.",
        f"Select the {expiry} expiration date ({dte} days away).",
    ]

    for leg in legs:
        otype = leg.get("option_type", "call")
        if otype == "stock":
            steps.append(f"Ensure you hold (or buy) 100 shares of {symbol}.")
            continue
        action = leg.get("action", "buy")
        strike = leg.get("strike", 0.0)
        mid = leg.get("mid", 0.0)
        cost_per = mid * 100
        verb = "SELL" if action == "sell" else "BUY"
        flow = "collect" if action == "sell" else "pay"
        steps.append(
            f"{verb} 1 × ${strike:.0f} {otype.upper()} — {flow} ~${cost_per:.0f} per contract."
        )

    option_legs = [l for l in legs if l.get("option_type") != "stock"]
    if len(option_legs) > 1:
        steps.append(
            f"If your broker supports it, look for a strategy order type (Spread / Condor / Straddle / {strategy_name}) "
            "to submit all legs as a single order — this avoids leg-risk."
        )

    if is_credit:
        steps.append(
            f"Set a limit price of ${abs_net / 100:.2f} credit or better (you want to collect at least this much)."
        )
    else:
        steps.append(
            f"Set a limit price of ${abs_net / 100:.2f} debit or better (you want to pay no more than this)."
        )

    if bl is not None and bh is not None:
        breakeven_note = f"${bl:.2f} (low) or ${bh:.2f} (high)"
    elif bl is not None:
        breakeven_note = f"${bl:.2f}"
    elif bh is not None:
        breakeven_note = f"${bh:.2f}"
    else:
        breakeven_note = "your short strike(s)"

    steps.append(
        f"Exit plan: close the trade when P&L reaches {profit_target_dollars} profit, "
        f"or if {symbol} breaks {breakeven_note} — whichever comes first."
    )

    return steps


def _confirmation_summary(symbol: str, trade: dict, strategy: dict) -> str:
    strat_name = trade.get("strategy", strategy.get("name", "this strategy"))
    expiry = trade.get("expiry", "")
    dte = _days_to_expiry(expiry)
    net = trade.get("estimated_credit_or_debit", 0.0)
    max_profit = trade.get("max_profit")
    max_loss = trade.get("max_loss")
    profit_target = trade.get("tastylive_profit_target")
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")
    profit_target_pct = strategy.get("profit_target_pct", 50)

    is_credit = net >= 0
    net_dollars = abs(net) * 100

    if is_credit:
        cash_line = f"You'll collect ${net_dollars:.0f} upfront"
    else:
        cash_line = f"You'll pay ${net_dollars:.0f} upfront"

    if bl is not None and bh is not None:
        range_line = f"the trade profits as long as {symbol} stays between ${bl:.2f} and ${bh:.2f}"
    elif bl is not None:
        range_line = f"the trade profits as long as {symbol} stays above ${bl:.2f}"
    elif bh is not None:
        range_line = f"the trade profits as long as {symbol} stays below ${bh:.2f}"
    else:
        range_line = "the trade profits if the stock moves in your favor"

    if max_profit is not None:
        profit_line = f"Your maximum profit is ${max_profit * 100:.0f}"
    else:
        profit_line = "Your profit is theoretically unlimited"

    if max_loss is not None:
        loss_line = f"your maximum loss is ${max_loss * 100:.0f} if {symbol} breaks sharply outside those levels"
    else:
        loss_line = f"losses are undefined — keep position size small and follow the 2× credit rule"

    if profit_target is not None:
        target_line = (
            f"TastyLive recommends closing this trade when you've made "
            f"${profit_target * 100:.0f} ({profit_target_pct}% of max profit)."
        )
    else:
        target_line = f"TastyLive recommends closing this trade when you've made {profit_target_pct}% of max profit."

    return (
        f"You're about to open 1 {strat_name} on {symbol} expiring {expiry} ({dte} days away). "
        f"{cash_line}, and {range_line}. "
        f"{profit_line}; {loss_line}. "
        f"{target_line}"
    )


def generate_narrative(
    symbol: str,
    iv_analysis: dict,
    bias_analysis: dict,
    strategy: dict,
    trade: dict,
) -> dict:
    """
    Returns a dict with plain-English fields explaining the trade opportunity.

    Parameters
    ----------
    symbol       : ticker, e.g. "SPY"
    iv_analysis  : from get_iv_rank()
    bias_analysis: from get_directional_bias()
    strategy     : entry from STRATEGIES catalog (must include 'key')
    trade        : from build_trade()
    """
    if trade.get("error"):
        return {
            "headline": f"Unable to build a trade for {symbol}.",
            "market_snapshot": "",
            "iv_context": "",
            "why_this_strategy": "",
            "trade_plain_english": "",
            "profit_scenario": "",
            "loss_scenario": "",
            "defensive_tactic": "",
            "execution_checklist": [],
            "confirmation_summary": f"Trade could not be built: {trade['error']}",
        }

    strat_key = strategy.get("key", trade.get("strategy_key", ""))
    strat_name = strategy.get("name", trade.get("strategy", "this strategy"))
    iv_env = iv_analysis.get("iv_environment", "MEDIUM")
    ivr = iv_analysis.get("iv_rank", 0.0)
    bias = bias_analysis.get("bias", "NEUTRAL")
    bias_clean = bias.replace("_", " ").capitalize()
    iv_word = "expensive" if iv_env == "HIGH" else ("cheap" if iv_env == "LOW" else "moderately priced")

    # Headline
    net = trade.get("estimated_credit_or_debit", 0.0)
    max_profit = trade.get("max_profit")
    expiry = trade.get("expiry", "")
    net_dollars = abs(net) * 100

    if net >= 0:
        headline = (
            f"{symbol}: Sell a {strat_name} expiring {expiry} — collect ${net_dollars:.0f} with options {iv_word} "
            f"(IVR {ivr:.0f}) and a {bias_clean} market."
        )
    else:
        headline = (
            f"{symbol}: Buy a {strat_name} expiring {expiry} — pay ${net_dollars:.0f} for defined upside "
            f"with options {iv_word} (IVR {ivr:.0f}) and a {bias_clean} market."
        )

    return {
        "headline": headline,
        "market_snapshot": _market_snapshot(symbol, bias_analysis),
        "iv_context": _iv_context(symbol, iv_analysis),
        "why_this_strategy": _why_this_strategy(symbol, iv_analysis, bias_analysis, strategy),
        "trade_plain_english": _trade_plain_english(symbol, trade),
        "profit_scenario": _profit_scenario(symbol, trade, strategy),
        "loss_scenario": _loss_scenario(symbol, trade, strategy),
        "defensive_tactic": _defensive_tactic(strat_key),
        "execution_checklist": _execution_checklist(symbol, trade),
        "confirmation_summary": _confirmation_summary(symbol, trade, strategy),
    }

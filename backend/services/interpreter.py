"""
Plain-English narrative engine for options trade interpretation.
All values come directly from computed data — no AI, no approximations.
"""
from datetime import date


def _days_to_expiry(expiry: str) -> int:
    try:
        exp_date = date.fromisoformat(expiry)
        return max(0, (exp_date - date.today()).days)
    except Exception:
        return 0


def _market_snapshot(symbol: str, bias_analysis: dict, ctx: dict | None = None) -> str:
    price = bias_analysis.get("price", 0.0)
    sma20 = bias_analysis.get("sma20", 0.0)
    sma50 = bias_analysis.get("sma50", 0.0)
    rsi14 = bias_analysis.get("rsi14", 50.0)
    bias = bias_analysis.get("bias", "NEUTRAL")
    strength = bias_analysis.get("strength", "WEAK")

    above_20 = price > sma20 if sma20 else None
    above_50 = price > sma50 if sma50 else None
    gap_20 = ((price - sma20) / sma20 * 100) if sma20 else 0
    gap_50 = ((price - sma50) / sma50 * 100) if sma50 else 0

    if above_20 and above_50:
        ma_line = (
            f"{symbol} is trading at ${price:.2f}, sitting {abs(gap_20):.1f}% above its 20-day moving average "
            f"(${sma20:.2f}) and {abs(gap_50):.1f}% above its 50-day moving average (${sma50:.2f}). "
            f"When a stock is above both key moving averages, it signals that both short- and medium-term momentum "
            f"are pointing upward — buyers have been in control. The further above these averages, "
            f"the stronger the trend, but also the greater the chance of a mean-reversion pullback."
        )
    elif not above_20 and not above_50:
        ma_line = (
            f"{symbol} is trading at ${price:.2f}, sitting {abs(gap_20):.1f}% below its 20-day moving average "
            f"(${sma20:.2f}) and {abs(gap_50):.1f}% below its 50-day moving average (${sma50:.2f}). "
            f"Trading below both key moving averages signals that sellers have been in control across both "
            f"the short- and medium-term timeframe. This kind of setup often means the stock is in a "
            f"defined downtrend until it can reclaim those averages."
        )
    elif above_20 and not above_50:
        ma_line = (
            f"{symbol} is trading at ${price:.2f}, {abs(gap_20):.1f}% above its 20-day average (${sma20:.2f}) "
            f"but still {abs(gap_50):.1f}% below its 50-day average (${sma50:.2f}). "
            f"This is a transitional setup — short-term buyers are showing up, but the stock hasn't yet "
            f"reclaimed its medium-term trend. A decisive close above ${sma50:.2f} would be a bullish signal; "
            f"failure there could mean another leg lower."
        )
    else:
        ma_line = (
            f"{symbol} is trading at ${price:.2f}, {abs(gap_20):.1f}% below its 20-day average (${sma20:.2f}) "
            f"but {abs(gap_50):.1f}% above its 50-day average (${sma50:.2f}). "
            f"The short-term trend is breaking down while the medium-term trend holds. This is a warning sign "
            f"— if the stock loses the 50-day at ${sma50:.2f}, selling pressure could accelerate."
        )

    if rsi14 >= 70:
        rsi_line = (
            f"The 14-day RSI reads {rsi14:.1f} — this is in overbought territory (above 70). "
            f"RSI measures the speed and magnitude of recent price moves on a 0–100 scale. "
            f"A reading above 70 doesn't mean the stock must fall immediately, but it does mean "
            f"the rally has been fast and strong, and short-term exhaustion is a real risk. "
            f"Many traders use overbought RSI as a signal to be cautious about chasing further upside."
        )
    elif rsi14 >= 60:
        rsi_line = (
            f"The 14-day RSI reads {rsi14:.1f} — momentum is firmly bullish. "
            f"RSI above 60 indicates that buyers have been consistently dominating sellers over the past "
            f"two weeks of trading. The stock isn't yet overbought (that threshold is 70), "
            f"so there's still room to run, but the move is already well underway."
        )
    elif rsi14 <= 30:
        rsi_line = (
            f"The 14-day RSI reads {rsi14:.1f} — this is in oversold territory (below 30). "
            f"RSI measures the speed and magnitude of recent price declines. "
            f"A reading below 30 means the stock has fallen hard and fast, and sellers may be exhausted. "
            f"Oversold doesn't guarantee a bounce, but historically these levels attract buyers "
            f"who see the selloff as excessive."
        )
    elif rsi14 <= 40:
        rsi_line = (
            f"The 14-day RSI reads {rsi14:.1f} — momentum is weakening. "
            f"RSI below 40 indicates that sellers have had the upper hand recently, "
            f"though the stock hasn't yet hit oversold levels (below 30). "
            f"This reading often accompanies stocks in short-term downtrends or consolidation "
            f"after a sharp move lower."
        )
    else:
        rsi_line = (
            f"The 14-day RSI reads {rsi14:.1f} — momentum is neutral. "
            f"RSI in the 40–60 range means neither buyers nor sellers have decisively taken control recently. "
            f"The stock is essentially in a tug-of-war, and the next directional move is unclear "
            f"purely from momentum alone."
        )

    bias_clean = bias.replace("_", " ").capitalize()
    strength_line = (
        f"Combining the moving average picture and the RSI, the overall directional signal for {symbol} "
        f"is {bias_clean.lower()} with {strength.lower()} conviction. "
        + (
            f"The {'bullish' if 'BULLISH' in bias else 'bearish' if 'BEARISH' in bias else 'neutral'} case "
            f"is backed by multiple confirming indicators, which raises confidence in the directional read."
            if strength == "STRONG"
            else
            f"The signal is present but not overwhelming — conflicting indicators suggest staying "
            f"cautious about directional size."
        )
    )

    extra_paras = []
    if ctx:
        tech = ctx.get("technicals") or {}
        if tech:
            macd_bias = tech.get("macd_bias", "")
            macd_div = tech.get("macd_diverging", False)
            atr_pct = tech.get("atr_pct", 0.0)
            atr = tech.get("atr", 0.0)
            vol_trend = tech.get("volume_trend", "normal")
            vol_ratio = tech.get("volume_ratio_5_20", 1.0)

            macd_dir = "above" if macd_bias == "bullish" else "below"
            div_note = (
                "The histogram is expanding, meaning momentum is building in that direction."
                if macd_div
                else "The histogram is contracting, suggesting the move may be losing steam."
            )
            vol_note = (
                f"Volume is running {vol_ratio:.1f}× its 20-day average — elevated activity suggests institutional participation."
                if vol_trend == "rising"
                else f"Volume is subdued at {vol_ratio:.1f}× its 20-day average — the move lacks strong conviction behind it."
                if vol_trend == "falling"
                else f"Volume is tracking close to its 20-day average — normal participation, no unusual accumulation or distribution."
            )
            extra_paras.append(
                f"The MACD indicator shows the fast line {macd_dir} the signal line, pointing to a {macd_bias} momentum read. "
                f"{div_note} The ATR (average true range) is {atr_pct:.1f}% of the stock price — "
                f"this means the market is pricing in a typical daily move of about {atr_pct:.1f}% in either direction. "
                f"{vol_note}"
            )

        earnings = ctx.get("earnings") or {}
        days_earn = earnings.get("days_until_earnings")
        if days_earn is not None and 0 <= days_earn <= 30:
            extra_paras.append(
                f"EARNINGS ALERT: {symbol} reports earnings in approximately {days_earn} day{'s' if days_earn != 1 else ''}. "
                f"Earnings events typically cause implied volatility to spike in the days leading up to the announcement "
                f"and then sharply collapse immediately afterward (known as the 'IV crush'). "
                f"Any strategy you put on now will be heavily influenced by this event — "
                f"factor in whether your expiry straddles the earnings date before entering."
            )

        news = ctx.get("news") or []
        if news:
            headlines_text = "; ".join(
                f'"{ h["title"]}"' + (f' ({h["publisher"]})' if h.get("publisher") else "")
                for h in news[:4]
            )
            extra_paras.append(
                f"Recent headlines for {symbol}: {headlines_text}. "
                f"News flow can accelerate or reverse the technical picture — "
                f"read the headlines in the context of the directional signal above. "
                f"Positive catalysts reinforce bullish setups; negative headlines increase the risk of downside gaps."
            )

    parts = [ma_line, rsi_line, strength_line] + extra_paras
    return "\n\n".join(parts)


def _iv_context(symbol: str, iv_analysis: dict, ctx: dict | None = None) -> str:
    ivr = iv_analysis.get("iv_rank", 0.0)
    iv_pct = (iv_analysis.get("current_iv") or 0.0) * 100
    hv_30 = (iv_analysis.get("hv_30d") or 0.0) * 100
    hv_high = (iv_analysis.get("hv_52wk_high") or 0.0) * 100
    hv_low = (iv_analysis.get("hv_52wk_low") or 0.0) * 100

    iv_vs_hv = iv_pct - hv_30
    iv_premium = "premium" if iv_vs_hv > 0 else "discount"

    iv_env_label = "LOW" if ivr < 30 else ("MEDIUM" if ivr <= 50 else "HIGH")
    base = (
        f"IV Rank (IVR) is currently {ivr:.0f} out of 100. "
        f"IVR measures where today's implied volatility sits relative to the past 52 weeks — "
        f"a reading of {ivr:.0f} means options are currently priced higher than {ivr:.0f}% of all days "
        f"in the past year. The current implied volatility is {iv_pct:.1f}%. "
        f"This places {symbol} in a {iv_env_label} implied volatility environment."
    )

    hv_line = ""
    if hv_30 > 0:
        hv_line = (
            f"\n\nFor context, the stock's actual 30-day historical volatility (how much it has actually moved) "
            f"is {hv_30:.1f}%. Implied volatility is currently trading at a {abs(iv_vs_hv):.1f}% {iv_premium} "
            f"to realised moves. "
            + (
                f"When IV exceeds HV like this, options are priced as if the stock will move more than it has been — "
                f"that's the premium sellers are collecting."
                if iv_vs_hv > 0
                else
                f"When IV is below HV like this, the market is pricing in less movement than the stock has actually shown — "
                f"options buyers may be getting an edge."
            )
        )
        if hv_high > 0 and hv_low > 0:
            hv_line += (
                f" Over the past 52 weeks, realised volatility has ranged from {hv_low:.1f}% to {hv_high:.1f}%."
            )

    if ivr < 30:
        interpretation = (
            f"\n\nWith IVR at {ivr:.0f}, options are cheap by historical standards. "
            f"When you sell options in a low-IV environment, you collect less premium — "
            f"the market simply isn't paying much for protection. Selling strategies work best when IV is high "
            f"because you're selling inflated premiums that have room to contract. "
            f"In a low-IV environment, buying strategies (like debit spreads or long options) tend to have a better "
            f"edge because you're paying fair or below-fair prices for the move you're anticipating."
        )
    elif ivr <= 50:
        interpretation = (
            f"\n\nWith IVR at {ivr:.0f}, options are fairly priced — not screaming cheap, not excessively expensive. "
            f"Neither pure sellers nor pure buyers have a strong structural edge here. "
            f"Strategy selection should lean more on the directional picture than on the volatility environment. "
            f"Defined-risk strategies like verticals and diagonals tend to work well in this middle zone."
        )
    else:
        interpretation = (
            f"\n\nWith IVR at {ivr:.0f}, options are expensive relative to their recent history. "
            f"This is the environment that premium sellers look for — you're collecting inflated prices "
            f"for options that, statistically, will lose value faster than their pricing implies. "
            f"When IV eventually contracts (which it almost always does after spikes), "
            f"short options positions benefit from that contraction on top of normal time decay. "
            f"This is commonly referred to as 'selling overpriced insurance.'"
        )

    term_para = ""
    skew_para = ""
    if ctx:
        ts = ctx.get("term_structure") or {}
        if ts:
            slope = ts.get("term_slope", "flat")
            front_iv_pct = (ts.get("front_month_iv") or 0) * 100
            back_iv_pct = (ts.get("back_month_iv") or 0) * 100
            front_exp = ts.get("front_expiry", "")
            back_exp = ts.get("back_expiry", "")

            if slope == "contango" and front_iv_pct > 0 and back_iv_pct > 0:
                term_para = (
                    f"\n\nThe IV term structure is in contango — near-term options ({front_exp}) carry {front_iv_pct:.1f}% IV "
                    f"while further-out options ({back_exp}) have {back_iv_pct:.1f}% IV. "
                    f"This is the normal state: the market is more uncertain about the near-term than the long-term. "
                    f"Front-month premium sellers benefit from this structure because near-term options decay faster "
                    f"and carry relatively more premium per day."
                )
            elif slope == "backwardation" and front_iv_pct > 0 and back_iv_pct > 0:
                term_para = (
                    f"\n\nThe IV term structure is in backwardation — near-term options ({front_exp}) carry {front_iv_pct:.1f}% IV "
                    f"but further-out options ({back_exp}) have only {back_iv_pct:.1f}% IV. "
                    f"This is unusual and typically signals an imminent near-term event (earnings, FDA decision, macro data) "
                    f"driving front-month premium above back-month. "
                    f"Selling front-month premium into backwardation can be lucrative but requires caution "
                    f"around the catalyst that is driving the elevated near-term IV."
                )

            skew_label = ts.get("skew_label", "normal")
            skew_val = ts.get("put_skew", 0.0)
            if skew_label == "elevated":
                skew_para = (
                    f"\n\nPut skew is elevated — out-of-the-money puts are carrying {skew_val*100:.1f}% more IV "
                    f"than at-the-money calls. This means the market is paying a premium to protect against a sharp downside move. "
                    f"Elevated put skew benefits put sellers (you collect more for downside protection) "
                    f"but also signals that large players are hedging — pay attention to why."
                )
            elif skew_label == "low":
                skew_para = (
                    f"\n\nPut skew is compressed — downside puts are cheap relative to calls. "
                    f"This typically appears in strongly trending markets where fear of a crash is low. "
                    f"It makes buying downside protection relatively cheap if you want to hedge a long position."
                )

    return base + hv_line + interpretation + term_para + skew_para


def _why_this_strategy(symbol: str, iv_analysis: dict, bias_analysis: dict, strategy: dict, ctx: dict | None = None) -> str:
    iv_env = iv_analysis.get("iv_environment", "MEDIUM")
    ivr = iv_analysis.get("iv_rank", 0.0)
    bias = bias_analysis.get("bias", "NEUTRAL")
    strat_name = strategy.get("name", "this strategy")
    risk_type = strategy.get("risk_type", "DEFINED")
    pop_range = strategy.get("pop_range", [50, 70])
    complexity = strategy.get("complexity", 2)
    dte_target = strategy.get("dte_target", 45)
    key = strategy.get("key", "")
    bias_clean = bias.replace("_", " ").lower()
    iv_word = "high" if iv_env == "HIGH" else ("low" if iv_env == "LOW" else "moderate")

    complexity_note = (
        "This is a straightforward single-leg trade." if complexity == 1
        else "This is a two-leg spread — both legs must be entered simultaneously." if complexity == 2
        else "This is a multi-leg position — use your broker's strategy order entry to fill all legs at once."
    )

    risk_note = (
        f"It is a DEFINED-RISK trade — no matter what {symbol} does, your maximum loss is capped at the spread width minus the credit collected. "
        f"You know exactly what you can lose before you enter."
        if risk_type == "DEFINED"
        else
        f"It is an UNDEFINED-RISK trade — losses can theoretically grow if {symbol} moves sharply against you. "
        f"As a good practice, it is recommended to keep this position to 1–3% of your total portfolio and use the 2× credit rule as a stop."
    )

    if pop_range[0] >= 50:
        pop_note = (
            f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}%, "
            f"meaning that statistically, this trade wins more often than it loses. "
            f"A common approach is to put on many high-probability trades, take losses when they happen, "
            f"and let the math work over time."
        )
    else:
        pop_note = (
            f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}% — "
            f"this trade wins less often than it loses by design. "
            f"The strategy is sized so that when it does win, the gain more than offsets the more frequent smaller losses. "
            f"Correct position sizing and discipline on loss limits are essential for this structure to be positive-expectancy."
        )

    if key in ("short_strangle", "iron_condor", "short_straddle", "iron_fly"):
        core = (
            f"The {strat_name} is the go-to strategy when IV is elevated (IVR {ivr:.0f}) and "
            f"the stock has no strong directional conviction. "
            f"By selling both a call and a put, you collect premium on both sides of the market. "
            f"You profit if {symbol} stays within a range — you don't need it to go up or down, "
            f"just sideways. The high IV environment means you're collecting more premium than usual, "
            f"and when volatility eventually compresses, your short options lose value faster, "
            f"adding an extra tailwind to the trade beyond normal time decay."
        )
    elif key in ("short_naked_put", "short_put_vertical", "jade_lizard"):
        core = (
            f"The {strat_name} is appropriate because the market is leaning {bias_clean} and IV is {iv_word} at IVR {ivr:.0f}. "
            f"You're selling a put — meaning you collect cash upfront and accept the obligation to buy {symbol} "
            f"at the strike price if it falls below it. If you're bullish or neutral on the stock anyway, "
            f"this is an efficient way to get paid while you wait for it to stay flat or rise. "
            f"Time decay works for you every day — the put loses value as expiration approaches, "
            f"as long as the stock stays above your strike."
        )
    elif key in ("short_naked_call", "short_call_vertical", "reverse_jade_lizard"):
        core = (
            f"The {strat_name} is appropriate because the market is leaning {bias_clean} and IV is {iv_word} at IVR {ivr:.0f}. "
            f"You're selling a call — meaning you collect cash upfront and accept the obligation to deliver {symbol} "
            f"at the strike price if it rises above it. If you're bearish or neutral on the stock, "
            f"this is an efficient way to get paid while you wait for it to stay flat or fall. "
            f"Time decay works for you every day — the call loses value as expiration approaches, "
            f"as long as the stock stays below your strike."
        )
    elif key in ("long_call_vertical", "big_lizard", "poor_mans_covered_call"):
        core = (
            f"The {strat_name} is appropriate because the market is leaning {bias_clean}. "
            f"You're buying exposure to the upside with defined risk — you pay a net debit to enter "
            f"and your maximum loss is that debit, no matter what happens. "
            f"While selling would collect more premium, a low-to-moderate IVR of {ivr:.0f} means "
            f"option prices are fair, making it reasonable to be a buyer here. "
            f"The short call in the spread reduces your cost and brings breakeven closer to the current price."
        )
    elif key in ("long_put_vertical", "reverse_big_lizard"):
        core = (
            f"The {strat_name} is appropriate because the market is leaning {bias_clean}. "
            f"You're buying downside exposure with defined risk — you pay a net debit to enter "
            f"and your maximum loss is that debit, no matter what happens. "
            f"An IVR of {ivr:.0f} means option prices are not prohibitively expensive for buyers. "
            f"The short put in the spread reduces your cost and brings your breakeven closer to the current price."
        )
    elif key in ("covered_call",):
        core = (
            f"The {strat_name} is the classic income strategy for stock holders. "
            f"You already own (or are buying) shares of {symbol}, and you're selling a call against them. "
            f"The call premium you collect reduces your cost basis — effectively getting paid to "
            f"agree to sell your shares at a higher price. With IV at {ivr:.0f}, the premium collected "
            f"is {'above average' if iv_env == 'HIGH' else 'fair'}. "
            f"If the stock stays below the call strike, you keep the shares AND the premium. "
            f"If it rises above the strike, your shares are called away at a profit."
        )
    elif key in ("call_butterfly", "put_butterfly", "call_broken_wing_butterfly", "put_broken_wing_butterfly"):
        core = (
            f"The {strat_name} is a precision, low-cost directional trade. "
            f"It profits most when {symbol} lands near a specific target price at expiration — "
            f"it's a bet not just on direction, but on where exactly the stock will be. "
            f"The two 'wings' of the spread cap your loss to the small net debit paid, "
            f"while the 'body' of the fly at the middle strike is where maximum profit lives. "
            f"With IV at IVR {ivr:.0f}, this structure is {'attractively priced' if iv_env != 'HIGH' else 'a cost-efficient alternative to outright options'}."
        )
    else:
        core = (
            f"The {strat_name} is structured to perform in a {iv_word} IV environment (IV Rank {ivr:.0f}) "
            f"with a {bias_clean} directional bias. In a {iv_word} volatility environment, "
            f"{'premium sellers benefit from elevated option prices that decay as volatility compresses back toward its mean' if iv_env == 'HIGH' else 'defined-risk structures are more attractively priced, making it practical to buy spreads or pay a debit for directional exposure' if iv_env == 'LOW' else 'both buying and selling structures are reasonably priced, and the strategy can be sized without paying an outsized volatility premium'}. "
            f"A {bias_clean} bias means the position is constructed so that its profit zone sits in the direction the analysis suggests {symbol} is leaning — without requiring a precise price target. "
            f"Targeting the {dte_target}-day expiration window places the trade in the region where theta decay is meaningful but gamma risk has not yet become the dominant force."
        )

    # FR-N2: append condition_explanation as a "Why these conditions" paragraph
    cond_exp = strategy.get("condition_explanation", "")
    conditions_rationale = f"Why these conditions: {cond_exp}" if cond_exp else ""

    # FR-N4: inline IV/direction match check
    designed_for_iv = strategy.get("designed_for_iv", "any")
    designed_for_dir = strategy.get("designed_for_direction", "any")

    iv_match = designed_for_iv == "any" or designed_for_iv.upper() == iv_env.upper()

    _DIR_MAP = {
        "bullish":  {"BULLISH", "NEUTRAL_BULLISH"},
        "bearish":  {"BEARISH", "NEUTRAL_BEARISH"},
        "neutral":  {"NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH"},
        "any":      {"BULLISH", "BEARISH", "NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH"},
    }
    dir_match = bias in _DIR_MAP.get(designed_for_dir, set())

    if designed_for_iv == "any":
        iv_cond_note = "IV conditions: designed for any IV environment — conditions met by definition"
    else:
        iv_label = iv_env  # "HIGH", "MEDIUM", or "LOW"
        iv_cond_note = (
            f"IV conditions: {iv_label} (strategy designed for {designed_for_iv.upper()} IV) — "
            + ("match" if iv_match else "MISMATCH — strategy recommended despite sub-optimal IV environment")
        )

    if designed_for_dir == "any":
        dir_cond_note = "Direction conditions: designed for any directional bias — conditions met by definition"
    else:
        dir_cond_note = (
            f"Direction conditions: {bias_clean} (strategy designed for {designed_for_dir} bias) — "
            + ("match" if dir_match else "MISMATCH — strategy recommended despite sub-optimal directional conditions")
        )

    conditions_match_note = f"Conditions check:\n{iv_cond_note}\n{dir_cond_note}"

    extra_confirmations = []
    if ctx:
        tech = ctx.get("technicals") or {}
        if tech:
            macd_bias = tech.get("macd_bias", "")
            macd_div = tech.get("macd_diverging", False)
            if macd_bias:
                alignment = (
                    "aligns with" if (
                        (macd_bias == "bullish" and "BULLISH" in bias)
                        or (macd_bias == "bearish" and "BEARISH" in bias)
                        or (macd_bias == "bullish" and bias == "NEUTRAL_BULLISH")
                        or (macd_bias == "bearish" and bias == "NEUTRAL_BEARISH")
                    ) else "diverges from"
                )
                extra_confirmations.append(
                    f"MACD confirmation: the MACD is currently {macd_bias}, which {alignment} the directional bias. "
                    + (
                        "With MACD momentum building (expanding histogram), the setup has multiple confirming signals."
                        if alignment == "aligns with" and macd_div
                        else "The histogram is contracting — momentum may be fading, so watch for a MACD crossover before adding size."
                        if alignment == "aligns with"
                        else "When MACD diverges from the primary bias, it's a signal to reduce position size and wait for alignment before entering."
                    )
                )

        flow = ctx.get("flow") or {}
        if flow and flow.get("total_volume", 0) > 1000:
            pcr = flow.get("put_call_ratio_volume", 1.0)
            flow_bias_str = flow.get("flow_bias", "neutral")
            unusual_calls = flow.get("unusual_call_strikes", [])
            unusual_puts = flow.get("unusual_put_strikes", [])
            pcr_note = (
                f"The put/call volume ratio is {pcr:.2f} — "
                + (
                    "call volume dominates, a bullish signal that suggests large traders are positioning for upside."
                    if flow_bias_str in ("bullish", "strongly_bullish")
                    else "put volume dominates, a bearish signal that suggests hedging or downside bets from larger players."
                    if flow_bias_str in ("bearish", "strongly_bearish")
                    else "roughly balanced between calls and puts, with no strong institutional directional signal."
                )
            )
            unusual_note = ""
            if unusual_calls:
                unique_uc = sorted(set(int(s) for s in unusual_calls))
                unusual_note += f" Unusual call activity detected at strikes ${', $'.join(str(s) for s in unique_uc)} — volume exceeded open interest, signalling new bullish positioning."
            if unusual_puts:
                unique_up = sorted(set(int(s) for s in unusual_puts))
                unusual_note += f" Unusual put activity at strikes ${', $'.join(str(s) for s in unique_up)} — volume exceeded open interest, signalling new bearish or protective positioning."
            extra_confirmations.append(f"Options flow: {pcr_note}{unusual_note}")

        earnings = ctx.get("earnings") or {}
        days_earn = earnings.get("days_until_earnings")
        if days_earn is not None:
            strategy_key = strategy.get("key", "")
            is_seller = strategy_key in (
                "short_strangle", "iron_condor", "short_straddle", "iron_fly",
                "short_naked_put", "short_put_vertical", "jade_lizard",
                "short_naked_call", "short_call_vertical", "reverse_jade_lizard", "covered_call",
            )
            if 0 <= days_earn <= 14:
                extra_confirmations.append(
                    f"Earnings risk — IMPORTANT: {symbol} reports earnings in {days_earn} day{'s' if days_earn != 1 else ''}. "
                    + (
                        f"Selling premium into an earnings event is high-risk: implied volatility will collapse immediately after the announcement, "
                        f"but the stock may gap sharply through your strikes. "
                        f"As a good practice, it is recommended to either close the position before earnings, or size it at half your normal allocation."
                        if is_seller
                        else f"Buying options into an earnings event can be powerful — you benefit from both the directional move AND the pre-earnings IV expansion. "
                        f"However, if the stock moves less than the options are pricing in, IV crush can hurt you even if you're directionally right."
                    )
                )
            elif 15 <= days_earn <= 30:
                extra_confirmations.append(
                    f"Earnings in {days_earn} days: this trade may overlap with the earnings event depending on the expiry chosen. "
                    f"Check whether your selected expiry date is before or after the earnings date — "
                    f"a pre-earnings expiry avoids the event entirely; a post-earnings expiry captures the IV expansion but takes on event risk."
                )

    all_parts = [core]
    if conditions_rationale:
        all_parts.append(conditions_rationale)
    all_parts.append(conditions_match_note)
    all_parts += [risk_note, pop_note, complexity_note] + extra_confirmations
    return "\n\n".join(all_parts)


def _trade_plain_english(symbol: str, trade: dict, ctx: dict | None = None) -> str:
    legs = trade.get("legs", [])
    net = trade.get("estimated_credit_or_debit", 0.0)
    expiry = trade.get("expiry", "")
    dte = _days_to_expiry(expiry)
    sections = []

    if trade.get("_synthetic"):
        sections.append(
            "NOTE — THEORETICAL PRICING: Live options data from Yahoo Finance could not be fetched "
            "for this symbol (the server IP is rate-limited). The trade structure below uses "
            "Black-Scholes pricing based on the stock's historical implied volatility — "
            "the strategy logic, strikes, and mechanics are correct, but you MUST verify "
            "the actual bid/ask prices in your broker before placing any order."
        )

    # FR-E1: inject earnings_note from the strategy engine if present
    earnings_note = trade.get("earnings_note")
    if earnings_note:
        sections.append(f"EARNINGS-AWARE EXPIRY: {earnings_note}")

    sections.append(
        f"Here is exactly what this trade looks like, leg by leg:"
    )

    if ctx:
        tech = ctx.get("technicals") or {}
        atr_pct = tech.get("atr_pct", 0.0)
        atr = tech.get("atr", 0.0)
        earnings = ctx.get("earnings") or {}
        days_earn = earnings.get("days_until_earnings")
        if atr_pct > 0:
            sections.insert(1,
                f"Before we look at the legs: {symbol}'s average daily move (ATR) is ${atr:.2f}, or {atr_pct:.1f}% of the stock price. "
                f"This is the market's expectation of a typical day's range. "
                f"Use this to calibrate your strike selection — strikes within 1–2 ATRs of the current price are likely to be tested during the trade."
            )
        if days_earn is not None and 0 <= days_earn <= int(trade.get("dte", 45) or 45):
            sections.append(
                f"NOTE: Earnings are in approximately {days_earn} days, which falls within this trade's {_days_to_expiry(trade.get('expiry', ''))} day window. "
                f"The trade will experience an IV crush event around earnings — plan for it and consider whether to close before the announcement."
            )

    # Consolidate duplicate option legs (same strike + action + type, e.g. butterfly body)
    seen_keys: dict = {}
    consolidated_legs = []
    for leg in legs:
        if leg.get("option_type") == "stock":
            consolidated_legs.append({**leg, "_qty": 1})
            continue
        key = (leg.get("option_type"), leg.get("action"), leg.get("strike"))
        if key in seen_keys:
            seen_keys[key]["_qty"] += 1
        else:
            entry = {**leg, "_qty": 1}
            seen_keys[key] = entry
            consolidated_legs.append(entry)

    for i, leg in enumerate(consolidated_legs, 1):
        action = leg.get("action", "buy")
        otype = leg.get("option_type", "call")
        strike = leg.get("strike", 0.0)
        mid = leg.get("mid", 0.0)
        delta = leg.get("delta", 0.0)
        bid = leg.get("bid", 0.0)
        ask = leg.get("ask", 0.0)
        qty = leg.get("_qty", 1)
        qty_label = f"{qty}×" if qty > 1 else "1×"
        cost_per = mid * 100 * qty

        if otype == "stock":
            sections.append(
                f"Leg {i} — BUY 100 shares of {symbol} at ~${strike:.2f}. "
                f"This is the stock position that the options are written against."
            )
            continue

        if action == "sell":
            sections.append(
                f"Leg {i} — SELL {qty_label} ${strike:.0f} {otype.upper()} expiring {expiry}. "
                f"By selling {'these options' if qty > 1 else 'this option'}, you collect ~${cost_per:.0f} per contract upfront (mid-price ${mid:.2f}; market is ${bid:.2f}×${ask:.2f}). "
                f"This option has a delta of {abs(delta):.2f}, meaning the market is pricing in roughly a "
                f"{abs(delta)*100:.0f}% chance it expires in-the-money. "
                f"Time decay works in your favour — this option loses value every day that passes "
                f"without {symbol} reaching ${strike:.0f}."
            )
        else:
            sections.append(
                f"Leg {i} — BUY {qty_label} ${strike:.0f} {otype.upper()} expiring {expiry}. "
                f"You pay ~${cost_per:.0f} per contract for {'these options' if qty > 1 else 'this option'} (mid-price ${mid:.2f}; market is ${bid:.2f}×${ask:.2f}). "
                f"This option has a delta of {abs(delta):.2f}, meaning it moves approximately ${abs(delta):.2f} "
                f"for every $1 move in {symbol}. "
                f"This leg defines and caps your maximum risk on the trade."
            )

    abs_net = abs(net) * 100
    if net >= 0:
        sections.append(
            f"\nNet result: you COLLECT ${abs_net:.0f} per contract (${net:.2f} per share × 100 shares). "
            f"This cash is deposited into your account the moment the trade fills. "
            f"It is yours regardless of what happens — the only question is whether you have to give any of it back."
        )
    else:
        sections.append(
            f"\nNet result: you PAY ${abs_net:.0f} per contract (${abs(net):.2f} per share × 100 shares). "
            f"This is your total out-of-pocket cost AND your maximum possible loss. "
            f"No matter how badly {symbol} moves against you, you cannot lose more than this amount."
        )

    sections.append(
        f"The trade expires on {expiry} — that is {dte} calendar days from today. "
        f"You do not need to hold until expiration. As a good practice, it is recommended to close early once the "
        f"trade has reached its profit target, to avoid last-week gamma risk."
    )

    return "\n\n".join(sections)


def _profit_scenario(symbol: str, trade: dict, strategy: dict) -> str:
    max_profit = trade.get("max_profit")
    profit_target_pct = strategy.get("profit_target_pct", 50)
    expiry = trade.get("expiry", "")
    dte = _days_to_expiry(expiry)
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")
    net = trade.get("estimated_credit_or_debit", 0.0)
    pop_range = strategy.get("pop_range", [50, 70])
    legs = trade.get("legs", [])

    if max_profit is None:
        max_profit_dollars = "theoretically unlimited"
        target_dollars = "50% of credit collected"
    else:
        max_profit_dollars = f"${max_profit * 100:.0f}"
        target_dollars = f"${max_profit * 100 * profit_target_pct / 100:.0f}"

    if bl is not None and bh is not None:
        condition = (
            f"This trade is profitable at expiration if {symbol} closes anywhere between "
            f"${bl:.2f} and ${bh:.2f} — a range of ${bh - bl:.2f}. "
            f"That means the stock can move up or down from here and you still win, "
            f"as long as it stays inside that zone."
        )
    elif bl is not None:
        condition = (
            f"This trade is profitable at expiration if {symbol} closes above ${bl:.2f}. "
            f"The stock can fall from its current level and you still win, as long as it stays above that breakeven."
        )
    elif bh is not None:
        condition = (
            f"This trade is profitable at expiration if {symbol} closes below ${bh:.2f}. "
            f"The stock can rise from its current level and you still win, as long as it stays below that breakeven."
        )
    else:
        short_strikes = [l["strike"] for l in legs if l.get("action") == "sell" and l.get("option_type") != "stock"]
        if short_strikes:
            unique_short_strikes = sorted(set(short_strikes))
            strike_label = "short strike" if len(unique_short_strikes) == 1 else "short strikes"
            condition = (
                f"This trade profits as long as {symbol} doesn't close beyond your {strike_label} "
                f"at ${', $'.join(str(int(s)) for s in unique_short_strikes)} by expiration."
            )
        else:
            condition = f"This trade profits if {symbol} moves in the expected direction by expiration."

    if max_profit is not None:
        if net >= 0:  # credit spread
            profit_detail = (
                f"Your maximum possible profit is {max_profit_dollars} per contract. "
                f"This is achieved if all short options expire worthless (i.e. you keep every dollar of premium collected). "
                f"As a good practice, it is recommended NOT to wait for maximum profit — the last few percent of gain isn't worth "
                f"the additional gamma risk in the final days before expiration."
            )
        else:  # debit spread
            profit_detail = (
                f"Your maximum possible profit is {max_profit_dollars} per contract. "
                f"This is achieved when the spread reaches its full value at expiration — i.e. when {symbol} closes firmly past your short strike, "
                f"so both legs are deep in-the-money and the spread is worth its full width. "
                f"As a good practice, it is recommended NOT to wait for maximum profit — close early once you've captured a meaningful portion of the potential gain."
            )
    else:
        if net >= 0:
            profit_detail = (
                f"Your profit is uncapped on the upside — it grows the further {symbol} moves in your favour. "
                f"As a good practice, it is recommended to close when you've captured 50% of the initial credit collected."
            )
        else:
            profit_detail = (
                f"Your profit is uncapped on the upside — it grows the further {symbol} moves beyond your short strike. "
                f"This structure behaves like a leveraged long position above the short strike with defined downside risk. "
                f"Close when your thesis has played out or when you've achieved a meaningful gain relative to what you paid."
            )

    if net >= 0:  # credit spread
        early_exit = (
            f"A common exit guideline (established options trading methodology) is to close the trade when it reaches {profit_target_pct}% of max profit "
            f"({target_dollars}). "
            f"Since you collected ${abs(net)*100:.0f} in premium, you'd aim to close the position "
            f"when you've made ${abs(net)*100*profit_target_pct/100:.0f} — at that point the position should "
            f"cost around ${abs(net)*100*(1-profit_target_pct/100):.0f} to buy back. "
            f"Closing early also frees up your capital to put on the next trade."
        )
    else:  # debit spread: net is negative
        if max_profit is not None:
            gain_target = round(max_profit * 100 * profit_target_pct / 100)
            sell_for = round(abs(net) * 100 + gain_target)
            early_exit = (
                f"A common exit guideline is to close the trade when it reaches {profit_target_pct}% of max profit "
                f"({target_dollars}). "
                f"Since you paid ${abs(net)*100:.0f} as a net debit, aim to sell the spread for approximately "
                f"${sell_for:.0f} — that locks in ${gain_target:.0f} of the ${max_profit * 100:.0f} maximum profit. "
                f"Closing early avoids the risk of a reversal eroding your unrealized gain."
            )
        else:
            # Unlimited upside debit (e.g. ZEBRA): no fixed max profit to target
            double_target = round(abs(net) * 200)
            early_exit = (
                f"For unlimited-upside structures like this, set a personal monetary target rather than a fixed % of max. "
                f"A common approach: close when the position has doubled in value (i.e. you can sell it for ~${double_target:.0f}, "
                f"locking in a ${round(abs(net)*100):.0f} gain per contract). "
                f"Also apply the 21 DTE rule — close or roll any time the position reaches 21 days to expiration, "
                f"regardless of P&L, as gamma risk accelerates sharply inside three weeks."
            )

    pop_note = (
        f"Based on the delta of the short strikes, this setup has an estimated {pop_range[0]}–{pop_range[1]}% "
        f"theoretical probability of being profitable at expiration — derived from options delta theory, not historical backtesting. "
        f"This is a positive-expectancy structure — you will have losing trades, "
        f"but the winners should more than offset them when managed consistently."
    )

    return f"{condition}\n\n{profit_detail}\n\n{early_exit}\n\n{pop_note}"


def _loss_scenario(symbol: str, trade: dict, strategy: dict) -> str:
    max_loss = trade.get("max_loss")
    risk_type = trade.get("risk_type", "DEFINED")
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")
    net = trade.get("estimated_credit_or_debit", 0.0)
    legs = trade.get("legs", [])
    short_strikes = sorted(set(l["strike"] for l in legs if l.get("action") == "sell" and l.get("option_type") != "stock"))

    if risk_type == "DEFINED" and max_loss is not None:
        max_loss_dollars = max_loss * 100
        if net >= 0:  # credit spread
            loss_frame = (
                f"Your maximum loss on this trade is ${max_loss_dollars:.0f} per contract — and that number "
                f"cannot be exceeded no matter what {symbol} does. Even if the stock gaps down 30% overnight, "
                f"your loss is still capped at ${max_loss_dollars:.0f}. "
                f"This is the power of defined-risk spreads: you trade off some premium collected "
                f"in exchange for a hard ceiling on how much you can lose."
            )
        else:  # debit spread
            loss_frame = (
                f"Your maximum loss on this trade is ${max_loss_dollars:.0f} per contract — the net debit you paid to enter. "
                f"No matter what {symbol} does, you cannot lose more than that upfront cost. "
                f"This is the power of defined-risk debit spreads: your worst case is fully known before you enter the trade."
            )
        if max_loss_dollars > 0:
            max_profit_trade = trade.get("max_profit")
            if max_profit_trade is not None:
                max_reward = max_profit_trade * 100
                ratio = max_reward / max_loss_dollars
                loss_frame += (
                    f"\n\nTo put it in reward-to-risk terms: you're risking ${max_loss_dollars:.0f} to make up to "
                    f"${max_reward:.0f} — a {ratio:.1f}:1 reward-to-risk ratio (reward : risk). "
                    f"The high probability of profit (from the delta positioning) is what makes this asymmetry acceptable."
                )
            else:
                loss_frame += (
                    f"\n\nIn risk/reward terms: your maximum loss is capped at ${max_loss_dollars:.0f}, "
                    f"but your upside is theoretically unlimited — the further {symbol} moves in your favour, "
                    f"the more this trade makes. There is no ceiling on reward, which means the risk/reward "
                    f"improves the more the stock moves your way."
                )
    else:
        loss_frame = (
            f"This is an undefined-risk trade, which means there is no hard ceiling on losses. "
            f"In theory, if {symbol} moves far enough against you, the loss can be substantial. "
            f"A common way to manage this risk follows two rules:\n"
            f"1. Position sizing: never let this trade represent more than 1–3% of your total portfolio value.\n"
            f"2. The 2× rule: if the trade has lost 2× the credit you collected (i.e. you collected "
            f"${abs(net)*100:.0f} and the trade is now showing a ${abs(net)*200:.0f} loss), close it "
            f"immediately without hesitation. Do not hope for a recovery."
        )

    if bl is not None and bh is not None:
        trigger = (
            f"You start losing money at expiration if {symbol} closes below ${bl:.2f} or above ${bh:.2f}. "
            f"Between those levels, the trade is profitable. Outside them, the loss grows the further the "
            f"stock moves away from your strikes."
        )
    elif bl is not None:
        trigger = (
            f"You start losing money at expiration if {symbol} closes below ${bl:.2f}. "
            f"Every dollar the stock falls below that level adds to your loss."
        )
    elif bh is not None:
        trigger = (
            f"You start losing money at expiration if {symbol} closes above ${bh:.2f}. "
            f"Every dollar the stock rises above that level adds to your loss."
        )
    elif short_strikes:
        trigger = (
            f"The loss begins when {symbol} moves past your short strike(s) at "
            f"${', $'.join(str(int(s)) for s in sorted(short_strikes))}. "
            f"The loss accelerates as the stock moves further past those levels."
        )
    else:
        trigger = f"The loss grows as {symbol} moves significantly against the position."

    dte_loss = _days_to_expiry(trade.get("expiry", ""))
    if dte_loss <= 21:
        monitor = (
            f"NOTE: this trade is already inside 21 DTE ({dte_loss} days remaining) — it is now in its active management phase. "
            f"Monitor P&L intraday rather than daily. "
            f"Close the position as soon as your profit target is reached — do not hold for the last few percent of gain. "
            f"Gamma risk is accelerating: small moves in {symbol} will cause outsized swings in position value. "
            f"If the trade is at a loss, close it now rather than riding to expiration."
        )
    else:
        monitor = (
            f"During the life of the trade, monitor it daily in the final two weeks. "
            f"A common guideline is to close any trade that has reached 21 DTE (21 days to expiration) "
            f"regardless of profit or loss — the risk/reward deteriorates sharply inside 21 days "
            f"due to accelerating gamma, which makes short options much more sensitive to price moves."
        )

    return f"{loss_frame}\n\n{trigger}\n\n{monitor}"


def _defensive_tactic(strategy_key: str) -> str:
    tactics = {
        "short_strangle": (
            "If the stock moves toward one of your strikes and that short option is now in-the-money or close to it, "
            "the standard adjustment is to 'roll the untested side.' "
            "This means moving the opposite (winning) short option closer to the current stock price — "
            "say, from a strike that was far out-of-the-money to one that is closer to at-the-money. "
            "By doing so, you collect more premium from the adjustment, which widens your total credit "
            "and lowers your breakeven on the tested side. "
            "Think of it as collecting extra payment to accept more risk on the side that's working. "
            "Do not roll the tested (losing) leg — rolling a loser can lock in a larger loss. "
            "Repeated rolls can turn a losing trade into a near-breakeven over time."
        ),
        "iron_condor": (
            "If the stock pushes into one of your short strikes, roll the opposite spread (the untested side) "
            "closer to the current stock price to collect additional credit. "
            "For example, if the put spread is being tested and the call spread is sitting comfortably, "
            "roll the call spread down in strike price and collect extra premium — this offsets some of the "
            "unrealized loss on the put spread side. "
            "Never add more spreads to average down — instead, roll one side to generate credit. "
            "If the stock breaks through your long strike (the maximum loss point), close the entire position."
        ),
        "short_naked_put": (
            "If the stock drops below your short put strike, resist the urge to close immediately for a loss. "
            "The first defensive move is to roll the put out in time — close the current put and reopen "
            "the same or slightly lower strike at a further expiration date, collecting a net credit to do so. "
            "Rolling for credit means you're not adding to your cost — you're getting paid to extend your time horizon. "
            "You can do this multiple times as long as you can roll for a credit. "
            "If you can no longer roll for credit (the further-dated put offers less premium than the current one costs to close), "
            "take the loss and move on. Consider whether you'd be comfortable owning 100 shares at the put strike — "
            "if yes, assignment is not a disaster."
        ),
        "short_put_vertical": (
            "If the stock drops below your short put strike, roll the entire spread out in time "
            "(both legs, same width) to a further expiration for a net credit. "
            "This gives the stock more time to recover above your short strike. "
            "You can also consider rolling down both strikes if the credit for doing so is sufficient. "
            "If at 21 DTE the spread is still in trouble, close it to avoid gamma risk — "
            "defined-risk spreads can move from 50% loss to max loss very quickly in the final three weeks."
        ),
        "iron_fly": (
            "The iron fly is sensitive to stock movement because the body of the fly (the at-the-money short straddle) "
            "is very close to the current price. If the stock moves significantly, you can 'invert' the fly — "
            "roll the untested side past the tested side, so the short options cross each other. "
            "This collects additional credit and gives you a wider zone to work with. "
            "Inverted iron flies require active management — you're now running two separate credit spreads "
            "rather than a symmetric structure."
        ),
        "short_straddle": (
            "Short straddles are the most aggressive premium-selling structure. "
            "If the stock moves significantly, the adjustment is to roll the untested side (the leg that's winning) "
            "past the tested side, inverting the straddle into two separate options. "
            "This creates a 'strangle' structure with a net wider breakeven. "
            "The key risk to manage is the undefined upside on a short call — "
            "use the 2× credit rule strictly: close the entire position if your loss reaches twice the credit collected."
        ),
        "long_call_vertical": (
            "If the stock drops and the spread is moving against you, you have two choices: "
            "1. Do nothing and let time decay work (the short call you sold decays faster than the long call you bought). "
            "2. Close early and accept a partial loss rather than waiting for the full spread width to be at risk. "
            "A common rule for debit spreads is to close if the spread loses 50% of what you paid — "
            "if you paid $200, close at a $100 loss. This preserves capital for the next trade."
        ),
        "long_put_vertical": (
            "If the stock rises and the spread is moving against you, consider closing early at a 50% loss "
            "rather than riding to max loss. "
            "A common rule for debit spreads: if you paid $200, close at a $100 loss maximum. "
            "Alternatively, if you believe the directional thesis is still intact (just delayed), "
            "you can roll the spread to a closer expiry and higher strikes to reduce your net debit "
            "and potentially recover with less stock movement required."
        ),
        "covered_call": (
            "If the stock rallies above your short call strike and you're facing assignment (having your shares called away), "
            "you have two options: "
            "1. Let it happen — you sell your shares at the strike, which was a price you agreed to anyway, and you keep the premium. This is often the right outcome. "
            "2. Roll up and out — close the current call and sell a higher-strike call at a further expiration, collecting a net credit. "
            "This lets your shares continue participating in the rally while generating more income. "
            "Never roll a covered call at a debit — it defeats the purpose of the strategy."
        ),
        "jade_lizard": (
            "The jade lizard combines a short put with a short call spread, structured so total premium "
            "collected exceeds the call spread width — this eliminates upside risk entirely. "
            "If the stock drops below the short put strike, roll the put out in time for credit (same as managing a naked put). "
            "The call spread side is self-contained and defined-risk — if it expires worthless, great. "
            "If the stock gaps up through the call spread, close the call spread and let the put run separately."
        ),
        "reverse_jade_lizard": (
            "The reverse jade lizard is bearish — a short call plus a short put spread. "
            "If the stock rallies above the short call strike, roll the call out in time for credit (similar to managing a naked call). "
            "The put spread on the downside is defined-risk and self-contained. "
            "Focus your management attention on the naked call leg, as that's where the undefined risk lives."
        ),
        "call_zebra": (
            "The ZEBRA has unlimited upside, so there is no fixed 'max profit' to target a percentage of. "
            "Instead, set a personal monetary target before you enter — a common approach is to close when the position has doubled in value. "
            "If the stock moves against you, the structure's defined risk means the most you can lose is the net debit paid — "
            "close if the position loses 50% of what you paid rather than riding to max loss. "
            "Apply the 21 DTE rule: close or roll at 21 days to expiration regardless of P&L, "
            "as gamma risk accelerates sharply and can erode gains quickly in the final three weeks."
        ),
        "put_zebra": (
            "The put ZEBRA has unlimited downside profit potential, so there is no fixed 'max profit' to target a percentage of. "
            "Set a personal monetary target before you enter — a common approach is to close when the position has doubled in value. "
            "If the stock moves against you (rallies), the defined-risk structure caps your loss at the net debit paid — "
            "close if the position loses 50% of what you paid rather than riding to max loss. "
            "Apply the 21 DTE rule: close or roll at 21 days to expiration regardless of P&L."
        ),
    }
    generic = (
        "Monitor the position daily as expiration approaches. "
        "The established options education methodology for management is: "
        "(1) Close at your profit target — for capped-profit strategies, that is typically 50% of max profit; "
        "for unlimited-upside structures, set a personal monetary target such as doubling the position value. "
        "(2) Close at 21 DTE regardless of P&L — avoid the accelerated gamma risk in the final three weeks. "
        "(3) Use the 2× credit rule for undefined-risk positions — if you're down 2× what you collected, close without exception. "
        "Rolling (closing the current position and reopening at a later date) is a valid technique when you can do so for a credit, "
        "but it should be used to improve the trade, not to avoid acknowledging a loss."
    )
    return tactics.get(strategy_key, generic)


def _trade_ticket(symbol: str, trade: dict) -> str:
    """Single-line broker order string — exactly what an intern types into the order ticket."""
    legs = trade.get("legs", [])
    expiry = trade.get("expiry", "")
    net = trade.get("estimated_credit_or_debit", 0.0)
    strategy_name = trade.get("strategy", "")

    try:
        exp_fmt = date.fromisoformat(expiry).strftime("%d-%b-%Y")
    except Exception:
        exp_fmt = expiry

    option_legs = [l for l in legs if l.get("option_type") != "stock"]
    is_credit = net >= 0
    abs_net = abs(net)
    flow = f"@ ${abs_net:.2f} {'credit' if is_credit else 'debit'} per share  (${abs_net * 100:.0f} per contract)"

    synthetic_note = "  [THEORETICAL — verify in broker]" if trade.get("_synthetic") else ""

    if len(option_legs) == 1:
        leg = option_legs[0]
        action = leg.get("action", "buy").upper()
        otype = leg.get("option_type", "call").upper()
        strike = leg.get("strike", 0)
        return f"{action} 1 {symbol}  ·  {exp_fmt}  ·  ${strike:.0f} {otype}  ·  {flow}{synthetic_note}"

    sells = [l for l in option_legs if l.get("action") == "sell"]
    buys = [l for l in option_legs if l.get("action") == "buy"]
    sell_calls = sorted([l for l in sells if l.get("option_type") == "call"], key=lambda x: x.get("strike", 0))
    sell_puts  = sorted([l for l in sells if l.get("option_type") == "put"],  key=lambda x: x.get("strike", 0), reverse=True)
    buy_calls  = sorted([l for l in buys  if l.get("option_type") == "call"], key=lambda x: x.get("strike", 0))
    buy_puts   = sorted([l for l in buys  if l.get("option_type") == "put"],  key=lambda x: x.get("strike", 0), reverse=True)

    parts: list[str] = []
    if sell_puts and buy_puts:
        parts.append(f"${sell_puts[0]['strike']:.0f}/${buy_puts[0]['strike']:.0f} PUT SPREAD")
    elif sell_puts:
        parts.append(f"${sell_puts[0]['strike']:.0f} PUT (short)")
    elif buy_puts:
        parts.append(f"${buy_puts[0]['strike']:.0f} PUT (long)")

    if sell_calls and buy_calls:
        parts.append(f"${sell_calls[0]['strike']:.0f}/${buy_calls[0]['strike']:.0f} CALL SPREAD")
    elif sell_calls:
        parts.append(f"${sell_calls[0]['strike']:.0f} CALL (short)")
    elif buy_calls:
        parts.append(f"${buy_calls[0]['strike']:.0f} CALL (long)")

    structure = "  +  ".join(parts) if parts else strategy_name.upper()
    overall = "SELL" if all(l.get("action") == "sell" for l in option_legs) else (
              "BUY"  if all(l.get("action") == "buy"  for l in option_legs) else "SELL")

    return f"{overall} 1 {symbol}  ·  {exp_fmt}  ·  {structure}  ·  {flow}{synthetic_note}"


def _execution_checklist(symbol: str, trade: dict) -> list:
    legs = trade.get("legs", [])
    expiry = trade.get("expiry", "")
    dte = _days_to_expiry(expiry)
    net = trade.get("estimated_credit_or_debit", 0.0)
    abs_net = abs(net) * 100
    is_credit = net >= 0
    profit_target = trade.get("tastylive_profit_target")
    profit_target_pct = trade.get("profit_target_pct", 50)
    profit_target_dollars = f"${profit_target * 100:.0f}" if profit_target is not None else f"{profit_target_pct}% of max profit"
    exit_loss_dollars = f"${abs_net * 2:.0f}" if not is_credit else None
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")
    # FR-C6: hoist these before step 1 so approval level can be computed
    option_legs = [l for l in legs if l.get("option_type") != "stock"]
    has_stock_leg = any(l.get("option_type") == "stock" for l in legs)

    # FR-C6: determine correct options approval level
    risk_type = trade.get("risk_type", "DEFINED")
    _NAKED_OPTION_KEYS = {
        "short_naked_put", "short_naked_call", "short_straddle", "short_strangle",
    }
    strat_key_checklist = trade.get("strategy_key", trade.get("strategy", ""))
    is_naked = (
        risk_type == "UNDEFINED" and not has_stock_leg
    ) or strat_key_checklist in _NAKED_OPTION_KEYS
    approval_level = (
        "level 3 or higher (required for naked short options — contact your broker if you are not yet approved for Level 3)"
        if is_naked
        else "level 2 or higher"
    )

    try:
        exp_fmt = date.fromisoformat(expiry).strftime("%B %d, %Y")
    except Exception:
        exp_fmt = expiry

    steps = []

    steps.append(
        f"OPEN YOUR BROKER and search for the ticker '{symbol}'. "
        f"Platforms that support multi-leg options include: tastytrade, "
        f"thinkorswim by Schwab, Interactive Brokers (IBKR), or E*TRADE Power E*TRADE. "
        f"Log in and make sure you have options trading enabled on your account (a one-time setup "
        f"if you haven't already — brokers call it 'options approval {approval_level}')."
    )

    steps.append(
        f"NAVIGATE TO THE OPTIONS CHAIN for {symbol}. "
        f"Look for a 'Trade' tab or a button labelled 'Options', 'Options Chain', or 'Option Board'. "
        f"You should see a table that looks like a grid: strike prices run down the middle column, "
        f"CALLS are on the left side (they go up when the stock goes up), and PUTS are on the right "
        f"side (they go up when the stock falls). Each row is a different strike price. "
        f"Each column group is a different expiration date."
    )

    steps.append(
        f"SELECT THE EXPIRATION DATE: {exp_fmt} ({dte} calendar days away). "
        f"Click on that date in the expiry header row to expand it (some brokers show a dropdown; "
        f"others show all dates at once — scroll to find '{expiry}'). "
        f"A commonly used window for new trades is 30–45 days to expiration (DTE). "
        f"At {dte} DTE this expiry falls within that range — a well-studied window in which time decay accelerates "
        f"without gamma risk being too extreme yet."
    )

    if has_stock_leg:
        steps.append(
            f"STOCK LEG: Confirm you hold 100 shares of {symbol} in your account, or place a 'Buy 100 shares' "
            f"market order first. Every options contract controls exactly 100 shares — the stock position "
            f"is what the options are written against. Without the shares, the short call is 'naked' (higher margin required)."
        )

    seen_leg_keys: dict = {}
    consolidated_option_legs = []
    for leg in option_legs:
        key = (leg.get("option_type"), leg.get("action"), leg.get("strike"))
        if key in seen_leg_keys:
            seen_leg_keys[key]["_qty"] += 1
        else:
            entry = {**leg, "_qty": 1}
            seen_leg_keys[key] = entry
            consolidated_option_legs.append(entry)

    for i, leg in enumerate(consolidated_option_legs, 1):
        action = leg.get("action", "buy")
        otype  = leg.get("option_type", "call")
        strike = leg.get("strike", 0.0)
        mid    = leg.get("mid", 0.0)
        bid    = leg.get("bid", 0.0)
        ask    = leg.get("ask", 0.0)
        delta  = leg.get("delta", 0.0)
        qty    = leg.get("_qty", 1)
        qty_label = f"{qty}×" if qty > 1 else ""
        cost_per = mid * 100 * qty

        side = "CALLS side (left half of the chain)" if otype == "call" else "PUTS side (right half of the chain)"
        verb = "SELL" if action == "sell" else "BUY"
        delta_pct = abs(delta) * 100

        if action == "sell":
            explanation = (
                f"Selling {'these' if qty > 1 else 'this'} means you are taking the other side of the contract: you collect cash now "
                f"and accept an obligation if {symbol} moves past ${strike:.0f} by {exp_fmt}. "
                f"The delta of {abs(delta):.2f} means the market prices this at a {delta_pct:.0f}% chance "
                f"of expiring in-the-money — so you have roughly a {100 - delta_pct:.0f}% chance "
                f"of keeping the full premium."
            )
            how_to = (
                f"In the options chain, go to the {side}. "
                f"Find the row where the Strike column shows ${strike:.0f}. "
                f"Click the 'Ask' price (or right-click the row → 'Sell') to add a short {otype} to your order ticket."
                + (f" You need to sell {qty} contracts at this strike." if qty > 1 else "")
            )
        else:
            explanation = (
                f"Buying {'these options give' if qty > 1 else 'this option gives'} you the right (but not the obligation) to {'buy' if otype == 'call' else 'sell'} "
                f"100 shares of {symbol} at ${strike:.0f} before {exp_fmt}. "
                f"The delta of {abs(delta):.2f} means for every $1 {symbol} moves in your favour, "
                f"this option gains approximately ${abs(delta):.2f} per share (${abs(delta)*100:.0f} per contract)."
            )
            how_to = (
                f"In the options chain, go to the {side}. "
                f"Find the row where the Strike column shows ${strike:.0f}. "
                f"Click the 'Bid' price (or right-click → 'Buy') to add a long {otype} to your order ticket."
                + (f" You need to buy {qty} contracts at this strike." if qty > 1 else "")
            )

        steps.append(
            f"LEG {i}: {verb} {qty_label + ' ' if qty_label else ''}${strike:.0f} {otype.upper()} (expires {exp_fmt}) "
            f"— {explanation} "
            f"{how_to} "
            f"Current market: ${bid:.2f} bid × ${ask:.2f} ask  |  Mid-price: ${mid:.2f}  |  "
            f"{'Collect' if action == 'sell' else 'Pay'} ~${cost_per:.0f} per contract at mid."
        )

    if len(option_legs) > 1:
        order_type = (
            "Vertical" if len(consolidated_option_legs) == 2 else
            "Condor" if len(consolidated_option_legs) == 4 and
                        len({l.get("option_type") for l in consolidated_option_legs}) == 2 else
            "Straddle" if len(consolidated_option_legs) == 2 and
                          len({l.get("option_type") for l in consolidated_option_legs}) == 2 else
            "Spread / Custom"
        )
        steps.append(
            f"COMBINE INTO ONE ORDER — do NOT submit the legs separately. "
            f"Using a combined strategy order guarantees both legs fill together (called 'leg-risk elimination'). "
            f"In tastytrade: after clicking both strikes the platform auto-creates a spread order. "
            f"In thinkorswim: right-click on the first strike → 'Buy/Sell' → '{order_type}', then select the second strike. "
            f"In IBKR: use the 'Combo' order builder. "
            f"Your order ticket should show all {len(option_legs)} legs before you submit."
        )

    if is_credit:
        steps.append(
            f"SET A LIMIT ORDER at ${abs_net / 100:.2f} credit per share (= ${abs_net:.0f} per contract). "
            f"'Credit' means money flows INTO your account when the order fills — you receive ${abs_net:.0f} immediately. "
            f"In the order ticket, set Order Type = 'Limit', Quantity = 1, and enter ${abs_net / 100:.2f} as the price. "
            f"Make sure it says 'Sell to Open' (or 'STO') for your short legs. "
            f"If unfilled after 30–60 seconds, nudge the limit 1–2 cents lower (e.g. ${abs_net / 100 - 0.01:.2f}) "
            f"and resubmit. NEVER use a Market order for options — the bid/ask spread can cost you 10–20% on entry."
        )
    else:
        steps.append(
            f"SET A LIMIT ORDER at ${abs_net / 100:.2f} debit per share (= ${abs_net:.0f} per contract). "
            f"'Debit' means money flows OUT of your account — you pay ${abs_net:.0f} to open this trade, "
            f"and that is also your maximum possible loss. "
            f"In the order ticket, set Order Type = 'Limit', Quantity = 1, and enter ${abs_net / 100:.2f} as the price. "
            f"Make sure it says 'Buy to Open' (or 'BTO') for your long legs. "
            f"If unfilled after 30–60 seconds, nudge the limit 1–2 cents higher and resubmit. "
            f"NEVER use a Market order for options."
        )

    if is_credit:
        close_price = (profit_target * 100) if profit_target is not None else abs_net * (profit_target_pct / 100)
        close_debit = abs_net - close_price
        steps.append(
            f"SET A GTC PROFIT-TARGET ORDER immediately after your entry fills. "
            f"GTC = 'Good-Till-Cancelled' — it stays active until the trade hits your target or you cancel it. "
            f"Create a closing order: 'Buy to Close' all legs at ${close_debit / 100:.2f} debit per share "
            f"(${close_debit:.0f} per contract). "
            f"Why this price? You collected ${abs_net:.0f} credit. When the position costs ${close_debit:.0f} to close, "
            f"you've captured ${close_price:.0f} profit — that is {profit_target_pct}% of the maximum possible gain. "
            f"It is common practice to close at 50% of max profit to avoid the riskier final weeks near expiration."
        )
    else:
        close_credit = abs_net * (profit_target_pct / 100)
        steps.append(
            f"SET A GTC PROFIT-TARGET ORDER immediately after your entry fills. "
            f"Create a closing order: 'Sell to Close' all legs at ${close_credit / 100:.2f} credit per share "
            f"(${close_credit:.0f} per contract). "
            f"You paid ${abs_net:.0f} to open. When it sells for ${close_credit:.0f}, "
            f"you've made back {profit_target_pct}% of your cost — a ${close_credit:.0f} profit. "
            f"That is the standard exit rule for this strategy."
        )

    if bl is not None and bh is not None:
        breakeven_note = f"${bl:.2f} (downside breakeven) and ${bh:.2f} (upside breakeven)"
    elif bl is not None:
        breakeven_note = f"${bl:.2f} (your breakeven)"
    elif bh is not None:
        breakeven_note = f"${bh:.2f} (your breakeven)"
    else:
        breakeven_note = "your short strike(s)"

    steps.append(
        f"SET A STOCK PRICE ALERT on {symbol} at {breakeven_note}. "
        f"Most brokers let you do this from the quote page: look for a 'bell' icon or 'Alerts' menu. "
        f"If {symbol} touches those levels, the trade needs your attention — either roll or close it "
        f"using the defensive tactic described in the section above."
    )

    if exit_loss_dollars:
        steps.append(
            f"HARD STOP RULE (undefined-risk position): if the position P&L reaches −{exit_loss_dollars} "
            f"(a loss of 2× the credit you collected), CLOSE THE ENTIRE POSITION immediately. "
            f"Do not wait for a recovery. In your broker, check 'Positions' → find this trade → 'Close Position'. "
            f"This is the well-established 2× rule — it prevents a small loser from becoming a large one."
        )

    close_date_days = dte - 21
    if close_date_days <= 0:
        if dte == 0:
            steps.append(
                "MARK YOUR CALENDAR: this trade expires TODAY — close the position immediately if you have not already done so. "
                "Go to Positions in your broker and close all legs now."
            )
        else:
            steps.append(
                f"MARK YOUR CALENDAR: NOTE — this trade is already inside 21 DTE ({dte} days remaining). "
                f"Apply the 21-DTE close rule immediately: the trade is in its active management phase. "
                f"Monitor P&L intraday and close as soon as your profit target is reached. "
                f"Do not hold past expiration — go to Positions in your broker and close all legs once the target is met."
            )
    else:
        steps.append(
            f"MARK YOUR CALENDAR: set a reminder for {close_date_days} days from today "
            f"(that will be approximately 21 DTE — 21 days before {exp_fmt}). "
            f"A well-established rule: close ALL positions at 21 DTE regardless of profit or loss. "
            f"Inside 21 days, gamma risk accelerates sharply — small stock moves cause outsized option "
            f"price changes, and the risk/reward of holding further no longer justifies it. "
            f"To close: go to Positions → select this trade → click 'Close' or 'Buy to Close' (for short positions). "
            f"Even if the trade is at a loss at that point, close it and move on."
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
    profit_target_pct = strategy.get("profit_target_pct", 50)
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")
    pop_range = strategy.get("pop_range", [50, 70])
    risk_type = strategy.get("risk_type", "DEFINED")

    is_credit = net >= 0
    net_dollars = abs(net) * 100

    cash_line = (
        f"collecting ${net_dollars:.0f} premium upfront"
        if is_credit
        else f"paying ${net_dollars:.0f} debit"
    )

    if bl is not None and bh is not None:
        range_line = f"profitable as long as {symbol} stays between ${bl:.2f} and ${bh:.2f} — a ${bh - bl:.2f} wide profit zone"
    elif bl is not None:
        range_line = f"profitable as long as {symbol} stays above ${bl:.2f}"
    elif bh is not None:
        range_line = f"profitable as long as {symbol} stays below ${bh:.2f}"
    else:
        range_line = "profitable if the stock moves in the expected direction"

    profit_line = (
        f"Maximum profit: ${max_profit * 100:.0f} per contract"
        if max_profit is not None
        else "Maximum profit: unlimited"
    )
    loss_line = (
        f"Maximum loss: ${max_loss * 100:.0f} per contract (defined-risk)"
        if max_loss is not None
        else f"Maximum loss: undefined — use the 2× rule (close at ${net_dollars * 2:.0f} loss)"
    )

    target_line = (
        f"Exit target: close when P&L reaches ${profit_target * 100:.0f} "
        f"({profit_target_pct}% of max profit)"
        if profit_target is not None
        else f"Exit target: close when {profit_target_pct}% of max profit is achieved"
    )

    return (
        f"TRADE SUMMARY\n"
        f"{chr(9472) * 40}\n"
        f"Position:    1× {strat_name} on {symbol}\n"
        f"Expiry:      {expiry} ({dte} days away)\n"
        f"Entry:       {cash_line}\n"
        f"Profit zone: {range_line}\n"
        f"{profit_line}\n"
        f"{loss_line}\n"
        f"{target_line}\n"
        f"Probability: {pop_range[0]}–{pop_range[1]}% estimated chance of profit\n"
        f"Risk type:   {'Defined — max loss is fixed' if risk_type == 'DEFINED' else 'Undefined — size small, use 2× stop'}\n"
        f"{chr(9472) * 40}\n"
        f"If everything looks right, use the Order Entry panel to place each leg."
    )


def generate_narrative(
    symbol: str,
    iv_analysis: dict,
    bias_analysis: dict,
    strategy: dict,
    trade: dict,
    market_context: dict | None = None,
) -> dict:
    if trade.get("error"):
        strat_key_err = strategy.get("key", "")
        strat_name_err = strategy.get("name", "this strategy")
        return {
            "headline": f"{symbol} — {strat_name_err}: market data ready, trade structure unavailable.",
            "market_snapshot": _market_snapshot(symbol, bias_analysis, ctx=market_context),
            "iv_context": _iv_context(symbol, iv_analysis, ctx=market_context),
            "why_this_strategy": _why_this_strategy(symbol, iv_analysis, bias_analysis, strategy, ctx=market_context),
            "trade_plain_english": f"The specific strike/expiry data needed to build this trade could not be retrieved right now ({trade['error']}). The IV environment and directional bias analysis above still applies to {symbol} — the market snapshot, IV context, and strategy alignment sections reflect current conditions and are not affected by the missing chain data.",
            "profit_scenario": "",
            "loss_scenario": "",
            "defensive_tactic": _defensive_tactic(strat_key_err),
            "trade_ticket": "",
            "execution_checklist": [],
            "confirmation_summary": f"Trade structure unavailable: {trade['error']}",
        }

    strat_key = strategy.get("key", trade.get("strategy_key", ""))
    strat_name = strategy.get("name", trade.get("strategy", "this strategy"))
    iv_env = iv_analysis.get("iv_environment", "MEDIUM")
    ivr = iv_analysis.get("iv_rank", 0.0)
    bias = bias_analysis.get("bias", "NEUTRAL")
    bias_clean = bias.replace("_", " ").capitalize()
    iv_word = "expensive" if iv_env == "HIGH" else ("cheap" if iv_env == "LOW" else "moderately priced")

    net = trade.get("estimated_credit_or_debit", 0.0)
    expiry = trade.get("expiry", "")
    dte = _days_to_expiry(expiry)
    net_dollars = abs(net) * 100
    hv_30 = (iv_analysis.get("hv_30d") or 0.0) * 100
    iv_pct = (iv_analysis.get("current_iv") or 0.0) * 100

    if net >= 0:
        if iv_env == "HIGH":
            headline = (
                f"{symbol} — Sell a {strat_name} expiring {expiry} ({dte}d). "
                f"Collect ${net_dollars:.0f} premium with IV elevated at IVR {ivr:.0f} "
                f"({iv_pct:.1f}% IV vs {hv_30:.1f}% HV). Market is {bias_clean}."
            )
        else:
            headline = (
                f"{symbol} — Sell a {strat_name} expiring {expiry} ({dte}d). "
                f"Collect ${net_dollars:.0f} with IVR {ivr:.0f} and a {bias_clean} market lean."
            )
    else:
        _BEARISH_DEBIT_KEYS = {
            "long_put_vertical", "put_zebra", "put_butterfly",
            "put_broken_wing_butterfly", "put_calendar", "reverse_big_lizard",
        }
        exposure_word = "downside" if strat_key in _BEARISH_DEBIT_KEYS else "upside"
        headline = (
            f"{symbol} — Buy a {strat_name} expiring {expiry} ({dte}d). "
            f"Pay ${net_dollars:.0f} for defined {exposure_word} exposure "
            f"with IVR {ivr:.0f} ({iv_word}) and a {bias_clean} market."
        )

    return {
        "headline": headline,
        "market_snapshot": _market_snapshot(symbol, bias_analysis, ctx=market_context),
        "iv_context": _iv_context(symbol, iv_analysis, ctx=market_context),
        "why_this_strategy": _why_this_strategy(symbol, iv_analysis, bias_analysis, strategy, ctx=market_context),
        "trade_plain_english": _trade_plain_english(symbol, trade, ctx=market_context),
        "profit_scenario": _profit_scenario(symbol, trade, strategy),
        "loss_scenario": _loss_scenario(symbol, trade, strategy),
        "defensive_tactic": _defensive_tactic(strat_key),
        "trade_ticket": _trade_ticket(symbol, trade),
        "execution_checklist": _execution_checklist(symbol, trade),
        "confirmation_summary": _confirmation_summary(symbol, trade, strategy),
    }

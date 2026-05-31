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
                f'"{h["title"]}"' + (f' ({h["publisher"]})' if h.get("publisher") else "")
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
    iv_pct = iv_analysis.get("current_iv", 0.0) * 100
    hv_30 = iv_analysis.get("hv_30d", 0.0) * 100
    hv_high = iv_analysis.get("hv_52wk_high", 0.0) * 100
    hv_low = iv_analysis.get("hv_52wk_low", 0.0) * 100

    iv_vs_hv = iv_pct - hv_30
    iv_premium = "premium" if iv_vs_hv > 0 else "discount"

    base = (
        f"IV Rank (IVR) is currently {ivr:.0f} out of 100. "
        f"IVR measures where today's implied volatility sits relative to the past 52 weeks — "
        f"a reading of {ivr:.0f} means options are currently priced higher than {ivr:.0f}% of all days "
        f"in the past year. The current implied volatility is {iv_pct:.1f}%."
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
            f"This is what tastylive calls 'selling overpriced insurance.'"
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
        f"It is a **defined-risk** trade — no matter what {symbol} does, your maximum loss is capped at the spread width minus the credit collected. "
        f"You know exactly what you can lose before you enter."
        if risk_type == "DEFINED"
        else
        f"It is an **undefined-risk** trade — losses can theoretically grow if {symbol} moves sharply against you. "
        f"tastylive recommends keeping this position to 1–3% of your total portfolio and using the 2× credit rule as a stop."
    )

    pop_note = (
        f"The estimated probability of profit is {pop_range[0]}–{pop_range[1]}%, "
        f"meaning that statistically, this trade wins more often than it loses. "
        f"tastylive's approach is to put on many high-probability trades, take losses when they happen, "
        f"and let the math work over time."
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
            f"Given an IV Rank of {ivr:.0f} ({iv_word} volatility environment) "
            f"and a {bias_clean} directional lean, the {strat_name} ranks as the best-fit strategy "
            f"across the tastylive framework. It aligns the volatility environment with the directional bias "
            f"and targets the {dte_target}-day expiration window where time decay is most efficient."
        )

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
                unusual_note += f" Unusual call activity detected at strikes ${', $'.join(str(int(s)) for s in unusual_calls)} — volume exceeded open interest, signalling new bullish positioning."
            if unusual_puts:
                unusual_note += f" Unusual put activity at strikes ${', $'.join(str(int(s)) for s in unusual_puts)} — volume exceeded open interest, signalling new bearish or protective positioning."
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
                        f"tastylive's rule: either close the position before earnings, or size it at half your normal allocation."
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

    all_parts = [core, risk_note, pop_note, complexity_note] + extra_confirmations
    return "\n\n".join(all_parts)


def _trade_plain_english(symbol: str, trade: dict, ctx: dict | None = None) -> str:
    legs = trade.get("legs", [])
    net = trade.get("estimated_credit_or_debit", 0.0)
    expiry = trade.get("expiry", "")
    dte = _days_to_expiry(expiry)
    sections = []

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

    for i, leg in enumerate(legs, 1):
        action = leg.get("action", "buy")
        otype = leg.get("option_type", "call")
        strike = leg.get("strike", 0.0)
        mid = leg.get("mid", 0.0)
        delta = leg.get("delta", 0.0)
        bid = leg.get("bid", 0.0)
        ask = leg.get("ask", 0.0)
        cost_per = mid * 100

        if otype == "stock":
            sections.append(
                f"Leg {i} — BUY 100 shares of {symbol} at ~${strike:.2f}. "
                f"This is the stock position that the options are written against."
            )
            continue

        if action == "sell":
            sections.append(
                f"Leg {i} — SELL 1× ${strike:.0f} {otype.upper()} expiring {expiry}. "
                f"By selling this option, you collect ~${cost_per:.0f} per contract upfront (mid-price ${mid:.2f}; market is ${bid:.2f}×${ask:.2f}). "
                f"This option has a delta of {abs(delta):.2f}, meaning the market is pricing in roughly a "
                f"{abs(delta)*100:.0f}% chance it expires in-the-money. "
                f"Time decay works in your favour — this option loses value every day that passes "
                f"without {symbol} reaching ${strike:.0f}."
            )
        else:
            sections.append(
                f"Leg {i} — BUY 1× ${strike:.0f} {otype.upper()} expiring {expiry}. "
                f"You pay ~${cost_per:.0f} per contract for this option (mid-price ${mid:.2f}; market is ${bid:.2f}×${ask:.2f}). "
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
        f"You do not need to hold until expiration. tastylive recommends closing early once the "
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
            condition = (
                f"This trade profits as long as {symbol} doesn't close beyond your short strikes "
                f"at ${', $'.join(str(int(s)) for s in sorted(short_strikes))} by expiration."
            )
        else:
            condition = f"This trade profits if {symbol} moves in the expected direction by expiration."

    if max_profit is not None:
        profit_detail = (
            f"Your maximum possible profit is {max_profit_dollars} per contract. "
            f"This is achieved if all short options expire worthless (i.e. you keep every dollar of premium collected). "
            f"tastylive recommends NOT waiting for maximum profit — the last few percent of gain isn't worth "
            f"the additional gamma risk in the final days before expiration."
        )
    else:
        profit_detail = (
            f"Your profit is uncapped on the upside — it grows the further {symbol} moves in your favour. "
            f"tastylive recommends closing when you've captured 50% of the initial credit collected."
        )

    early_exit = (
        f"The recommended exit point is when the trade reaches {profit_target_pct}% of max profit "
        f"({target_dollars}). "
        f"For example, if you collected ${abs(net)*100:.0f} in premium, you'd aim to close the position "
        f"when you've made ${abs(net)*100*profit_target_pct/100:.0f} — at that point the position should "
        f"cost around ${abs(net)*100*(1-profit_target_pct/100):.0f} to buy back. "
        f"Closing early also frees up your capital to put on the next trade."
    )

    pop_note = (
        f"Based on the delta of the short strikes, this setup has an estimated {pop_range[0]}–{pop_range[1]}% "
        f"probability of being profitable at expiration. Over a large sample of similar trades, "
        f"this is a positive-expectancy strategy — you will have losing trades, "
        f"but the winners should more than offset them."
    )

    return f"{condition}\n\n{profit_detail}\n\n{early_exit}\n\n{pop_note}"


def _loss_scenario(symbol: str, trade: dict, strategy: dict) -> str:
    max_loss = trade.get("max_loss")
    risk_type = trade.get("risk_type", "DEFINED")
    bl = trade.get("breakeven_low")
    bh = trade.get("breakeven_high")
    net = trade.get("estimated_credit_or_debit", 0.0)
    legs = trade.get("legs", [])
    short_strikes = [l["strike"] for l in legs if l.get("action") == "sell" and l.get("option_type") != "stock"]

    if risk_type == "DEFINED" and max_loss is not None:
        max_loss_dollars = max_loss * 100
        loss_frame = (
            f"Your maximum loss on this trade is ${max_loss_dollars:.0f} per contract — and that number "
            f"cannot be exceeded no matter what {symbol} does. Even if the stock gaps down 30% overnight, "
            f"your loss is still capped at ${max_loss_dollars:.0f}. "
            f"This is the power of defined-risk spreads: you trade off some premium collected "
            f"in exchange for a hard ceiling on how much you can lose."
        )
        loss_frame += (
            f"\n\nTo put it in risk/reward terms: you're risking ${max_loss_dollars:.0f} to make up to "
            f"${abs(net)*100:.0f} — a {abs(net)*100/max_loss_dollars:.1f}:1 risk/reward ratio. "
            f"The high probability of profit (from the delta positioning) is what makes this asymmetry acceptable."
        )
    else:
        loss_frame = (
            f"This is an undefined-risk trade, which means there is no hard ceiling on losses. "
            f"In theory, if {symbol} moves far enough against you, the loss can be substantial. "
            f"In practice, tastylive manages this risk with two rules:\n"
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

    monitor = (
        f"During the life of the trade, monitor it daily in the final two weeks. "
        f"tastylive's guideline is to close any trade that has reached 21 DTE (21 days to expiration) "
        f"regardless of profit or loss — the risk/reward deteriorates sharply inside 21 days "
        f"due to accelerating gamma, which makes short options much more sensitive to price moves."
    )

    return f"{loss_frame}\n\n{trigger}\n\n{monitor}"


def _defensive_tactic(strategy_key: str) -> str:
    tactics = {
        "short_strangle": (
            "If the stock moves toward one of your strikes and that short option is now in-the-money or close to it, "
            "the standard tastylive adjustment is to 'roll the untested side.' "
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
            "tastylive's rule for debit spreads is to close if the spread loses 50% of what you paid — "
            "if you paid $200, close at a $100 loss. This preserves capital for the next trade."
        ),
        "long_put_vertical": (
            "If the stock rises and the spread is moving against you, consider closing early at a 50% loss "
            "rather than riding to max loss. "
            "tastylive's rule for debit spreads: if you paid $200, close at a $100 loss maximum. "
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
    }
    generic = (
        "Monitor the position daily as expiration approaches. "
        "The general tastylive framework for management is: "
        "(1) Close at 50% of max profit — take the win early and redeploy. "
        "(2) Close at 21 DTE regardless of P&L — avoid the accelerated gamma risk in the final three weeks. "
        "(3) Use the 2× credit rule for undefined-risk positions — if you're down 2× what you collected, close without exception. "
        "Rolling (closing the current position and reopening at a later date) is a valid technique when you can do so for a credit, "
        "but it should be used to improve the trade, not to avoid acknowledging a loss."
    )
    return tactics.get(strategy_key, generic)


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
    option_legs = [l for l in legs if l.get("option_type") != "stock"]

    steps = [
        f"Log into your broker. Best platforms for this: tastytrade, thinkorswim (TD Ameritrade / Schwab), "
        f"Interactive Brokers, or E*TRADE Power. All support multi-leg options orders.",
        f"Search for '{symbol}' and open the Options Chain.",
        f"Filter the expiration chain to show the {expiry} date ({dte} days away). "
        f"tastylive targets 45 DTE for new entries — this expiry is within the optimal window.",
    ]

    for leg in legs:
        otype = leg.get("option_type", "call")
        if otype == "stock":
            steps.append(
                f"Confirm you hold 100 shares of {symbol} in your account — or buy them at market price. "
                f"The options are written against this stock position."
            )
            continue
        action = leg.get("action", "buy")
        strike = leg.get("strike", 0.0)
        mid = leg.get("mid", 0.0)
        bid = leg.get("bid", 0.0)
        ask = leg.get("ask", 0.0)
        cost_per = mid * 100
        verb = "SELL" if action == "sell" else "BUY"
        flow = "collecting" if action == "sell" else "paying"
        steps.append(
            f"{verb} 1 contract of the ${strike:.0f} {otype.upper()} — {flow} ~${cost_per:.0f}. "
            f"The current market is ${bid:.2f} bid × ${ask:.2f} ask (mid: ${mid:.2f}). "
            f"Start with a limit order at the mid-price."
        )

    if len(option_legs) > 1:
        steps.append(
            f"IMPORTANT: Enter all {len(option_legs)} legs as a single strategy order (not individually). "
            f"Look for 'Spread', 'Condor', 'Straddle', or 'Custom' order types in your broker. "
            f"This eliminates leg-risk — the risk that you fill one leg but not the other."
        )

    if is_credit:
        steps.append(
            f"Set your limit price to ${abs_net / 100:.2f} credit per share (${abs_net:.0f} per contract). "
            f"If the order doesn't fill within a minute, move the limit 1–2 cents toward the ask and try again. "
            f"Never use a market order for options — the bid/ask spread can cost you significantly."
        )
    else:
        steps.append(
            f"Set your limit price to ${abs_net / 100:.2f} debit per share (${abs_net:.0f} per contract). "
            f"If the order doesn't fill within a minute, move the limit 1–2 cents toward the ask and try again. "
            f"Never use a market order for options — the bid/ask spread can cost you significantly."
        )

    steps.append(
        f"Once filled, set a GTC (Good-Till-Cancelled) closing order at "
        f"{'a credit of' if not is_credit else 'a debit of'} "
        f"{'50% of your entry debit' if not is_credit else profit_target_dollars + ' profit'}. "
        f"This automatically closes the trade when it hits your profit target."
    )

    if bl is not None and bh is not None:
        breakeven_note = f"${bl:.2f} on the downside or ${bh:.2f} on the upside"
    elif bl is not None:
        breakeven_note = f"${bl:.2f}"
    elif bh is not None:
        breakeven_note = f"${bh:.2f}"
    else:
        breakeven_note = "your short strike(s)"

    steps.append(
        f"Set a price alert on {symbol} at {breakeven_note} — if the stock hits those levels, "
        f"review the position and consider rolling or closing per the defensive tactic below."
    )

    if exit_loss_dollars:
        steps.append(
            f"Hard stop rule: if the trade is showing a loss of {exit_loss_dollars} or more "
            f"(2× the credit collected), CLOSE IT. Do not hold and hope. "
            f"Taking a defined small loss is far better than a large undefined loss."
        )

    steps.append(
        f"Mark your calendar for 21 DTE ({dte - 21} days from now, around the date {expiry}). "
        f"tastylive recommends closing all positions at 21 DTE to avoid the final weeks' gamma risk, "
        f"regardless of profit or loss at that point."
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
        f"{'─' * 40}\n"
        f"Position:    1× {strat_name} on {symbol}\n"
        f"Expiry:      {expiry} ({dte} days away)\n"
        f"Entry:       {cash_line}\n"
        f"Profit zone: {range_line}\n"
        f"{profit_line}\n"
        f"{loss_line}\n"
        f"{target_line}\n"
        f"Probability: {pop_range[0]}–{pop_range[1]}% estimated chance of profit\n"
        f"Risk type:   {'Defined — max loss is fixed' if risk_type == 'DEFINED' else 'Undefined — size small, use 2× stop'}\n"
        f"{'─' * 40}\n"
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
            "trade_plain_english": f"The specific strike/expiry data needed to build this trade could not be retrieved right now ({trade['error']}). The analysis above still applies — when data is available, this strategy remains the recommendation given current IV and bias conditions.",
            "profit_scenario": "",
            "loss_scenario": "",
            "defensive_tactic": _defensive_tactic(strat_key_err),
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
    hv_30 = iv_analysis.get("hv_30d", 0.0) * 100
    iv_pct = iv_analysis.get("current_iv", 0.0) * 100

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
        headline = (
            f"{symbol} — Buy a {strat_name} expiring {expiry} ({dte}d). "
            f"Pay ${net_dollars:.0f} for defined upside exposure "
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
        "execution_checklist": _execution_checklist(symbol, trade),
        "confirmation_summary": _confirmation_summary(symbol, trade, strategy),
    }

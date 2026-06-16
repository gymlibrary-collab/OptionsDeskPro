"""
AI-powered analysis features using Google Gemini.
Each function returns None gracefully if the API key is missing or the call fails.
Never call get_supabase() at module level.

Model: gemini-1.5-flash (free tier on Google AI Studio)
Get your API key at: https://aistudio.google.com/app/apikey
Set env var: GEMINI_API_KEY
"""
import os
import json
import logging
import time
from typing import Optional

_MODEL = "gemini-1.5-flash"
logger = logging.getLogger(__name__)


def _generate(prompt: str, system: Optional[str] = None) -> str:
    """Call Gemini and return the response text."""
    import google.generativeai as genai

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")

    genai.configure(api_key=key)
    model = genai.GenerativeModel(
        _MODEL,
        system_instruction=system or "You are a helpful assistant.",
    )
    response = model.generate_content(prompt)
    return response.text.strip()


# ── In-process cache helpers ─────────────────────────────────────────────────

_sentiment_cache: dict[str, dict] = {}
_SENTIMENT_TTL = 30.0  # seconds


def enhance_narrative(
    symbol: str,
    iv_analysis: dict,
    bias_analysis: dict,
    strategy: dict,
    trade: dict,
) -> Optional[str]:
    """Feature 1: Short AI-written insight paragraph for a strategy setup."""
    try:
        ivr = iv_analysis.get("iv_rank", 0)
        iv_env = iv_analysis.get("iv_environment", "MEDIUM")
        iv_pct = iv_analysis.get("current_iv", 0) * 100
        hv_30 = iv_analysis.get("hv_30d", 0) * 100
        bias = bias_analysis.get("bias", "NEUTRAL")
        price = bias_analysis.get("price", 0)
        rsi = bias_analysis.get("rsi14", 50)
        strat_name = strategy.get("name", "options strategy")
        net = trade.get("estimated_credit_or_debit", 0)
        expiry = trade.get("expiry", "")
        max_profit = trade.get("max_profit")
        max_loss = trade.get("max_loss")

        prompt = (
            f"You are an options trading coach trained in established options trading methodology.\n\n"
            f"Setup for {symbol}:\n"
            f"- Price: ${price:.2f}, RSI: {rsi:.1f}\n"
            f"- IV Rank: {ivr:.0f}/100 ({iv_env}) — IV {iv_pct:.1f}% vs HV {hv_30:.1f}%\n"
            f"- Bias: {bias}\n"
            f"- Strategy: {strat_name}\n"
            f"- Net: ${net * 100:.0f} per contract ({'credit' if net >= 0 else 'debit'}), expires {expiry}\n"
            f"- Max profit: {f'${max_profit * 100:.0f}' if max_profit else 'unlimited'}, "
            f"Max loss: {f'${max_loss * 100:.0f}' if max_loss else 'undefined'}\n\n"
            f"Write ONE paragraph (3-5 sentences) that coaches a retail trader on WHY this specific "
            f"setup has edge right now. Be concrete about the IV/bias interaction, the exact numbers, "
            f"and what has to go wrong for the trade to lose. No generic options theory — specific insight only."
        )
        return _generate(prompt)
    except Exception as e:
        logger.error("enhance_narrative failed: %s", e)
        return None


def explain_strategy_reasoning(
    symbol: str,
    iv_analysis: dict,
    bias_analysis: dict,
    strategy: dict,
    trade: dict,
) -> Optional[str]:
    """Feature 5: Explain why this strategy is the best fit for this ticker right now."""
    try:
        ivr = iv_analysis.get("iv_rank", 0)
        iv_env = iv_analysis.get("iv_environment", "MEDIUM")
        iv_pct = iv_analysis.get("current_iv", 0) * 100
        hv_30 = iv_analysis.get("hv_30d", 0) * 100
        bias = bias_analysis.get("bias", "NEUTRAL")
        price = bias_analysis.get("price", 0)
        rsi = bias_analysis.get("rsi14", 50)
        strat_name = strategy.get("name", "options strategy")
        fit_score = strategy.get("fit_score", 0)
        pop_range = strategy.get("pop_range", [50, 70])
        net = trade.get("estimated_credit_or_debit", 0)
        expiry = trade.get("expiry", "")

        prompt = (
            f"You are an options strategist. In 3-4 sentences, explain WHY {strat_name} "
            f"is the top-ranked strategy for {symbol} right now.\n\n"
            f"Data: price=${price:.2f}, RSI={rsi:.1f}, IVR={ivr:.0f} ({iv_env}), "
            f"IV={iv_pct:.1f}% vs HV={hv_30:.1f}%, bias={bias}, "
            f"fit score={fit_score:.0f}/100, POP={pop_range[0]}-{pop_range[1]}%, "
            f"net=${net * 100:.0f} ({'credit' if net >= 0 else 'debit'}), expiry={expiry}.\n\n"
            f"Cover: (1) the specific IV+bias combination that makes this strategy win, "
            f"(2) one concrete edge in current conditions, "
            f"(3) what has to go wrong for it to lose. "
            f"Be specific to these numbers only. No generic theory."
        )
        return _generate(prompt)
    except Exception as e:
        logger.error("explain_strategy_reasoning failed: %s", e)
        return None


def synthesize_risk_summary(positions_risk: list[dict]) -> Optional[str]:
    """Feature 3: One-paragraph risk overview of the entire portfolio."""
    try:
        if not positions_risk:
            return None

        lines = []
        for p in positions_risk:
            level = p.get("risk_level", "green").upper()
            sigs = "; ".join(s["msg"][:100] for s in p.get("signals", [])[:2])
            lines.append(
                f"{p['symbol']} {p['option_type'].upper()} ${p['strike']} "
                f"exp={p['expiry']} DTE={p.get('dte', '?')} "
                f"P&L={p.get('pnl_pct', 0):.0f}% [{level}]: {sigs}"
            )

        prompt = (
            f"You are an options risk manager reviewing a paper trading portfolio.\n\n"
            f"Positions:\n" + "\n".join(lines) + "\n\n"
            f"Write ONE paragraph (4-6 sentences) for the trader:\n"
            f"1. State the most urgent action needed (if any RED signals)\n"
            f"2. Summarize overall portfolio health\n"
            f"3. Highlight 1-2 things to watch closely\n"
            f"4. End with one specific, actionable recommendation\n"
            f"Use the actual ticker symbols. Be direct and practical."
        )
        return _generate(prompt)
    except Exception as e:
        logger.error("synthesize_risk_summary failed: %s", e)
        return None


def answer_portfolio_question(
    question: str,
    positions_data: list[dict],
    portfolio_summary: dict,
) -> str:
    """Feature 2: Answer a question about the user's portfolio."""
    try:
        pos_lines = []
        for p in positions_data:
            sign = "+" if p.get("pnl", 0) >= 0 else ""
            line = (
                f"  {p['symbol']} {p['option_type'].upper()} ${p['strike']} "
                f"exp={p['expiry']} qty={p['quantity']} "
                f"avg=${p['avg_cost']:.2f} cur=${p['current_price']:.2f} "
                f"P&L={sign}${p['pnl']:.2f}"
            )
            if p.get("strategy_name"):
                line += f" [{p['strategy_name']}]"
            pos_lines.append(line)

        portfolio_text = (
            f"Cash: ${portfolio_summary.get('cash', 0):,.2f}  "
            f"Positions: ${portfolio_summary.get('positions_value', 0):,.2f}  "
            f"Total: ${portfolio_summary.get('total_value', 0):,.2f}  "
            f"P&L: ${portfolio_summary.get('total_pnl', 0):,.2f}"
        )

        system = (
            "You are an options trading assistant specialising in established options trading methodology. "
            "Answer concisely and practically. Reference the trader's actual positions when relevant. "
            "Keep answers under 200 words."
        )
        user_content = (
            f"Portfolio summary: {portfolio_text}\n"
            f"Open positions:\n" + ("\n".join(pos_lines) if pos_lines else "  (none)") + "\n\n"
            f"Question: {question}"
        )

        return _generate(user_content, system=system)
    except Exception as e:
        logger.error("ai_chat failed: %s", e)
        return "I couldn't process your question right now — please try again."


# ── E2: News Sentiment Digest ─────────────────────────────────────────────────

_NEUTRAL_SENTIMENT: dict = {
    "sentiment": "NEUTRAL",
    "confidence": 0.0,
    "digest": "No recent news available.",
}


def classify_news_sentiment(symbol: str, headlines: list[str]) -> dict:
    """E2 — News Sentiment Digest."""
    if not headlines:
        return _NEUTRAL_SENTIMENT

    now = time.time()
    cached = _sentiment_cache.get(symbol)
    if cached and (now - cached["ts"]) < _SENTIMENT_TTL:
        return cached["result"]

    try:
        joined = "\n".join(f"- {h}" for h in headlines[:10])
        prompt = (
            f"You are a financial news analyst. Analyse these recent news headlines for {symbol} "
            f"and classify the overall sentiment.\n\n"
            f"Headlines:\n{joined}\n\n"
            f"Respond with JSON only — no markdown, no explanation outside the JSON:\n"
            f'{{"sentiment": "BULLISH"|"BEARISH"|"NEUTRAL", "confidence": 0.0-1.0, '
            f'"digest": "1-2 sentence summary of why"}}'
        )
        raw = _generate(prompt)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        sentiment = str(parsed.get("sentiment", "NEUTRAL")).upper()
        if sentiment not in ("BULLISH", "BEARISH", "NEUTRAL"):
            sentiment = "NEUTRAL"
        result = {
            "sentiment": sentiment,
            "confidence": float(parsed.get("confidence", 0.5)),
            "digest": str(parsed.get("digest", "")),
        }
        _sentiment_cache[symbol] = {"result": result, "ts": now}
        return result
    except Exception:
        return _NEUTRAL_SENTIMENT


# ── E8: AI Strategy Comparison ────────────────────────────────────────────────

def compare_and_recommend(
    symbol: str,
    strategies: list[dict],
    iv_environment: str,
    bias: str,
) -> dict:
    """E8 — AI Strategy Comparison."""
    if not strategies:
        return {"recommended_key": "", "recommended_name": "", "reasoning": ""}

    key_set = {s.get("key", "") for s in strategies}
    top_by_score = max(strategies, key=lambda s: s.get("fit_score", 0))

    try:
        strat_lines = "\n".join(
            f"- key={s.get('key')} name={s.get('name')} "
            f"fit_score={s.get('fit_score', 0):.0f} "
            f"description={s.get('description', '')[:120]}"
            for s in strategies
        )
        prompt = (
            f"You are an options strategist. Given the following strategies scored for {symbol} "
            f"(IV environment: {iv_environment}, directional bias: {bias}), "
            f"pick the single BEST strategy and explain why in 2-3 sentences.\n\n"
            f"Strategies:\n{strat_lines}\n\n"
            f"Respond with JSON only — no markdown:\n"
            f'{{"recommended_key": "<key from list>", "recommended_name": "<name>", '
            f'"reasoning": "2-3 sentence explanation"}}'
        )
        raw = _generate(prompt)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        rec_key = str(parsed.get("recommended_key", ""))
        if rec_key not in key_set:
            return {
                "recommended_key": top_by_score.get("key", ""),
                "recommended_name": top_by_score.get("name", ""),
                "reasoning": "",
            }
        return {
            "recommended_key": rec_key,
            "recommended_name": str(parsed.get("recommended_name", "")),
            "reasoning": str(parsed.get("reasoning", "")),
        }
    except Exception:
        return {
            "recommended_key": top_by_score.get("key", ""),
            "recommended_name": top_by_score.get("name", ""),
            "reasoning": "",
        }


# ── E4: Daily Morning Briefing ────────────────────────────────────────────────

def generate_morning_briefing(
    user_id: str,
    watchlist: list[str],
    market_contexts: list[dict],
) -> str:
    """E4 — Daily Morning Briefing."""
    if not watchlist:
        return "No symbols in your watchlist. Add some tickers to receive a personalised morning briefing."

    try:
        ctx_lines = []
        for ctx in market_contexts[:10]:
            sym = ctx.get("symbol", "")
            iv_env = ctx.get("iv_environment", "MEDIUM")
            bias = ctx.get("bias", "NEUTRAL")
            ivr = ctx.get("iv_rank", 0.0)
            earnings = " [EARNINGS SOON]" if ctx.get("earnings_soon") else ""
            ctx_lines.append(f"  {sym}: IVR={ivr:.0f} ({iv_env}), Bias={bias}{earnings}")

        ctx_block = "\n".join(ctx_lines)
        prompt = (
            f"You are an options trading coach. Write a morning briefing for a retail options trader "
            f"covering their watchlist. Keep it under 120 words.\n\n"
            f"Watchlist market scan (today):\n{ctx_block}\n\n"
            f"Cover:\n"
            f"1. Overall IV regime summary (are options expensive or cheap across the board?)\n"
            f"2. Any earnings risk in the next 21 days — name the tickers\n"
            f"3. One or two strategy adjustments worth considering today\n\n"
            f"Write in second-person ('Your watchlist...'), be specific to these tickers, "
            f"no more than 120 words total."
        )
        return _generate(prompt)
    except Exception as e:
        logger.error("generate_morning_briefing failed: %s", e)
        symbols_str = ", ".join(watchlist[:10])
        return (
            f"Good morning. Your watchlist covers: {symbols_str}. "
            f"Market briefing generation is temporarily unavailable — "
            f"check back shortly or run a manual scan."
        )


# ── E1: Trade Journal AI Review ───────────────────────────────────────────────

def review_closed_trade(trade: dict, recent_trades: list[dict]) -> dict:
    """E1 — Trade Journal AI Review."""
    _fallback = {
        "entry_consistency": "Analysis unavailable.",
        "rule_adherence": "Analysis unavailable.",
        "behavioural_patterns": "Analysis unavailable.",
        "overall_grade": "C",
    }
    try:
        trade_line = (
            f"{trade.get('symbol')} {trade.get('option_type', '').upper()} "
            f"${trade.get('strike')} exp={trade.get('expiry')} "
            f"action={trade.get('action')} qty={trade.get('quantity')} "
            f"@${trade.get('price')} strategy={trade.get('strategy_name', 'unknown')} "
            f"opened={trade.get('created_at', '')[:10]}"
        )
        recent_lines = []
        for r in recent_trades[:10]:
            recent_lines.append(
                f"  {r.get('symbol')} {r.get('option_type', '').upper()} "
                f"${r.get('strike')} {r.get('action')} "
                f"@${r.get('price')} [{r.get('strategy_name', '')}] "
                f"{r.get('created_at', '')[:10]}"
            )
        recent_block = "\n".join(recent_lines) if recent_lines else "  (no prior trades)"

        prompt = (
            f"You are an options trading coach reviewing a paper trade post-mortem. "
            f"Use established options trading methodology as the standard (21-DTE entry, 2× credit stop, "
            f"delta targets 0.15-0.30 for short options, 50% profit target).\n\n"
            f"Trade reviewed:\n  {trade_line}\n\n"
            f"Last 10 trades for context:\n{recent_block}\n\n"
            f"Write a post-mortem with exactly three sections. "
            f"Respond with JSON only — no markdown:\n"
            f'{{"entry_consistency": "1-2 sentences on whether the entry followed the standard setup rules", '
            f'"rule_adherence": "1-2 sentences on 21-DTE timing, stop discipline, delta selection", '
            f'"behavioural_patterns": "1-2 sentences on any repeated mistakes or positive habits seen across recent trades", '
            f'"overall_grade": "A|B|C|D"}}'
        )
        raw = _generate(prompt)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        grade = str(parsed.get("overall_grade", "C")).upper()
        if grade not in ("A", "B", "C", "D"):
            grade = "C"
        return {
            "entry_consistency": str(parsed.get("entry_consistency", "")),
            "rule_adherence": str(parsed.get("rule_adherence", "")),
            "behavioural_patterns": str(parsed.get("behavioural_patterns", "")),
            "overall_grade": grade,
        }
    except Exception:
        return _fallback


# ── E5: Roll/Adjustment Advisor ───────────────────────────────────────────────

def suggest_roll_adjustment(position: dict, market_context: dict) -> dict:
    """E5 — Roll/Adjustment Advisor."""
    _fallback = {
        "suggestions": [
            {"action": "Hold", "rationale": "Unable to generate advice at this time.", "urgency": "low"}
        ],
        "summary": "Review position manually.",
    }
    try:
        sig_lines = "; ".join(
            s.get("msg", "")[:80] for s in (position.get("signals") or [])[:3]
        )
        earnings_soon = (market_context.get("earnings") or {}).get("earnings_soon", False)
        flow_bias = (market_context.get("flow") or {}).get("flow_bias", "neutral")

        prompt = (
            f"You are an options risk manager. A paper trader needs help deciding what to do "
            f"with this position:\n\n"
            f"  Symbol: {position.get('symbol')}  Type: {position.get('option_type', '').upper()}  "
            f"Strike: ${position.get('strike')}  Expiry: {position.get('expiry')}\n"
            f"  DTE: {position.get('dte', '?')}  Qty: {position.get('quantity')}  "
            f"Avg cost: ${position.get('avg_cost', 0):.2f}  Current: ${position.get('current_price', 0):.2f}\n"
            f"  P&L: ${position.get('pnl', 0):.2f}  Risk level: {position.get('risk_level', 'green').upper()}\n"
            f"  Signals: {sig_lines or 'none'}\n"
            f"  Earnings soon: {earnings_soon}  Options flow bias: {flow_bias}\n\n"
            f"Propose 1-3 ranked defensive actions from: Roll Strikes, Roll Expiry, Close Position, Hold.\n"
            f"Respond with JSON only — no markdown:\n"
            f'{{"suggestions": ['
            f'{{"action": "...", "rationale": "1-2 sentences", "urgency": "high|medium|low"}}'
            f'], "summary": "one sentence"}}'
        )
        raw = _generate(prompt)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        suggestions = []
        for s in (parsed.get("suggestions") or [])[:3]:
            urgency = str(s.get("urgency", "low")).lower()
            if urgency not in ("high", "medium", "low"):
                urgency = "low"
            suggestions.append({
                "action": str(s.get("action", "")),
                "rationale": str(s.get("rationale", "")),
                "urgency": urgency,
            })
        if not suggestions:
            suggestions = [{"action": "Hold", "rationale": "Insufficient data.", "urgency": "low"}]
        return {
            "suggestions": suggestions,
            "summary": str(parsed.get("summary", "")),
        }
    except Exception:
        return _fallback


# ── E6: Portfolio Greeks Coaching ─────────────────────────────────────────────

def generate_greeks_coaching(
    net_delta: float,
    net_theta: float,
    net_vega: float,
    positions: list[dict],
) -> str:
    """E6 — Portfolio Greeks Coaching."""
    try:
        pos_lines = []
        for p in positions[:10]:
            pos_lines.append(
                f"  {p.get('symbol')} {p.get('option_type', '').upper()} "
                f"qty={p.get('quantity')} delta={p.get('delta', 0):.2f}"
            )
        pos_block = "\n".join(pos_lines) if pos_lines else "  (no open positions)"

        prompt = (
            f"You are an options portfolio risk coach trained in established options trading methodology.\n\n"
            f"Portfolio net greeks:\n"
            f"  Net delta: {net_delta:+.4f}\n"
            f"  Net theta: {net_theta:+.2f} (daily)\n"
            f"  Net vega:  {net_vega:+.2f}\n\n"
            f"Positions contributing to these greeks:\n{pos_block}\n\n"
            f"Write exactly 2-3 sentences of practical concentration-risk coaching. "
            f"Be specific to these greek values. Suggest one concrete hedge or adjustment if appropriate. "
            f"No generic theory — only actionable insight for this exact portfolio."
        )
        return _generate(prompt)
    except Exception as e:
        logger.error("generate_greeks_coaching failed: %s", e)
        return (
            f"Your portfolio carries net delta {net_delta:+.2f}, "
            f"theta {net_theta:+.2f}/day, vega {net_vega:+.2f}. "
            f"Greeks coaching is temporarily unavailable — review your exposures manually."
        )

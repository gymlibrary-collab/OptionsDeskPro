"""
AI-powered analysis features using Anthropic Claude.
Each function returns None gracefully if the API key is missing or the call fails.
Never call get_supabase() at module level.
"""
import os
from typing import Optional


def _client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


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
            f"You are an options trading coach trained in the tastylive framework.\n\n"
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

        msg = _client().messages.create(
            model="claude-opus-4-8",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
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

        msg = _client().messages.create(
            model="claude-opus-4-8",
            max_tokens=250,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
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

        msg = _client().messages.create(
            model="claude-haiku-4-5",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
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

        sys_prompt = (
            "You are an options trading assistant specialising in the tastylive framework. "
            "Answer concisely and practically. Reference the trader's actual positions when relevant. "
            "Keep answers under 200 words."
        )

        user_content = (
            f"Portfolio summary: {portfolio_text}\n"
            f"Open positions:\n" + ("\n".join(pos_lines) if pos_lines else "  (none)") + "\n\n"
            f"Question: {question}"
        )

        msg = _client().messages.create(
            model="claude-opus-4-8",
            max_tokens=400,
            system=sys_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        return msg.content[0].text.strip()
    except Exception:
        return "I couldn't process your question right now — please try again."

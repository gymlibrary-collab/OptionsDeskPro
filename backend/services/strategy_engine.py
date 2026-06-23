"""
Strategy engine for OptionsDesk.

SOURCE OF TRUTH: backend/migrations/016_strategy_catalog.sql and
docs/strategy-selection-spec.md (tastylive Options Strategy Guide 2023).

The STRATEGIES dict below MIRRORS the strategy_catalog DB table.
Any change to direction, iv_environment, complexity, dte_target, or pop_range
MUST be accompanied by a migration that updates strategy_catalog FIRST.

Selection algorithm: IV Environment (HIGH/MEDIUM/LOW) + Directional Bias
scored via score_and_rank(). DTE, POP, P&L are outputs attached post-selection.
"""
import logging
from datetime import date, datetime, timedelta

logger = logging.getLogger(__name__)

# ── Strategy catalog — 31 strategies ────────────────────────────────────────
# Mirrors strategy_catalog DB table (migration 016). To change any selection
# attribute (direction, iv_environment, complexity) open a migration FIRST.
STRATEGIES = {
    # ── Bullish ────────────────────────────────────────────────────────────
    "covered_call": {
        "name": "Covered Call",
        "direction": ["BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (50, 70),
        "profit_target_pct": 50,
        "description": "Sell ATM/OTM call against 100 long shares to reduce cost basis.",
        "legs": ["long_stock", "short_call_otm"],
        "delta_targets": {"short_call": 30},
        "designed_for_iv": "high",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "Covered calls collect elevated premium when implied volatility is high "
            "and expire worthless when the underlying stays flat or rises modestly."
        ),
    },
    "long_call_vertical": {
        "name": "Long Call Vertical Spread",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (40, 60),
        "profit_target_pct": 50,
        "description": "Buy ITM call + sell OTM call. Bullish defined risk debit spread.",
        "legs": ["long_call_itm", "short_call_otm"],
        "delta_targets": {"long_call": 70, "short_call": 30},
        "designed_for_iv": "any",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "Long call verticals are defined-risk bullish spreads that work across IV environments "
            "because the debit paid is capped; lower IV reduces cost basis."
        ),
    },
    "call_zebra": {
        "name": "Call ZEBRA",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 50),
        "profit_target_pct": 25,
        "description": "Buy 2 ITM calls + sell 1 ATM call. Zero extrinsic value back-ratio with 100-delta upside exposure and defined risk.",
        "legs": ["long_2_calls_itm", "short_call_atm"],
        "delta_targets": {"long_call": 70, "short_call": 50},
        "designed_for_iv": "any",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "The Call ZEBRA (Zero Extrinsic value BacK RAtio) removes all extrinsic cost by "
            "buying two deep ITM calls and selling one ATM call, replicating 100 long shares with defined downside risk."
        ),
    },
    "poor_mans_covered_call": {
        "name": "Poor Man's Covered Call",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 60),
        "profit_target_pct": 50,
        "description": "Buy long-term ITM call + sell near-term OTM call. Low IV synthetic covered call.",
        "legs": ["long_call_itm_back", "short_call_otm_front"],
        "delta_targets": {"long_call": 70, "short_call": 30},
        "designed_for_iv": "low",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "The Poor Man's Covered Call uses a long LEAPS call as a stock substitute; "
            "low IV makes the back-month long call cheaper to purchase, reducing capital outlay."
        ),
    },
    "call_calendar": {
        "name": "Call Calendar Spread",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 50),
        "profit_target_pct": 25,
        "description": "Sell near-term ATM call + buy back-month ATM call at same strike. Profits from time decay differential.",
        "legs": ["short_call_front", "long_call_back"],
        "delta_targets": {"short_call": 0.50, "long_call": 0.50},
        "designed_for_iv": "low",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "Call calendar spreads profit from the front-month call decaying faster than the back-month call; "
            "low IV keeps the back-month long call affordable and the structure net debit small."
        ),
    },
    "call_butterfly": {
        "name": "Call Butterfly",
        "direction": ["BULLISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 30,
        "pop_range": (20, 40),
        "profit_target_pct": 25,
        "description": "Buy ATM call, sell 2 OTM calls, buy further OTM call. Cheap directional bet.",
        "legs": ["long_call_atm", "short_2_calls_otm", "long_call_further_otm"],
        "delta_targets": {"body": 50, "wing": 20},
        "designed_for_iv": "any",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "Call butterflies are low-cost defined-risk structures that profit when the underlying "
            "closes near the short strikes at expiration, applicable across IV environments."
        ),
    },
    "big_lizard": {
        "name": "Big Lizard",
        "direction": ["BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 25,
        "description": "Sell ATM put + sell ATM call spread. Credit > call spread width = no upside risk.",
        "legs": ["short_put_atm", "short_call_spread_atm"],
        "delta_targets": {"short_put": 50, "short_call": 50, "long_call": 30},
        "designed_for_iv": "high",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "The Big Lizard is a high-IV premium-selling structure where elevated option prices "
            "allow the collected credit to exceed the call spread width, eliminating upside risk."
        ),
    },
    # ── Bearish ────────────────────────────────────────────────────────────
    "covered_put": {
        "name": "Covered Put",
        "direction": ["BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (50, 70),
        "profit_target_pct": 50,
        "description": "Sell ATM/OTM put against 100 short shares to reduce cost basis.",
        "legs": ["short_stock", "short_put_otm"],
        "delta_targets": {"short_put": -30},
        "designed_for_iv": "high",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "Covered puts collect elevated premium when implied volatility is high "
            "and expire worthless when the underlying stays flat or falls modestly."
        ),
    },
    "long_put_vertical": {
        "name": "Long Put Vertical Spread",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (50, 60),
        "profit_target_pct": 50,
        "description": "Buy ITM put + sell OTM put. Bearish defined risk debit spread.",
        "legs": ["long_put_itm", "short_put_otm"],
        "delta_targets": {"long_put": -70, "short_put": -30},
        "designed_for_iv": "any",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "Long put verticals are defined-risk bearish spreads that cap both the maximum loss "
            "and the cost of entry, making them applicable across IV environments."
        ),
    },
    "put_zebra": {
        "name": "Put ZEBRA",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 50),
        "profit_target_pct": 25,
        "description": "Buy 2 ITM puts + sell 1 ATM put. Zero extrinsic value back-ratio with 100-delta downside exposure and defined risk.",
        "legs": ["long_2_puts_itm", "short_put_atm"],
        "delta_targets": {"long_put": -70, "short_put": -50},
        "designed_for_iv": "any",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "The Put ZEBRA removes all extrinsic cost by buying two deep ITM puts and selling one "
            "ATM put, replicating 100 short shares with defined upside risk."
        ),
    },
    "poor_mans_covered_put": {
        "name": "Poor Man's Covered Put",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 60),
        "profit_target_pct": 50,
        "description": "Buy long-term ITM put + sell near-term OTM put. Low IV synthetic covered put.",
        "legs": ["long_put_itm_back", "short_put_otm_front"],
        "delta_targets": {"long_put": -70, "short_put": -30},
        "designed_for_iv": "low",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "The Poor Man's Covered Put uses a long LEAPS put as a short-stock substitute; "
            "low IV makes the back-month long put cheaper to purchase, reducing capital outlay."
        ),
    },
    "put_calendar": {
        "name": "Put Calendar Spread",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW"],
        "risk_type": "DEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 50),
        "profit_target_pct": 25,
        "description": "Sell near-term ATM put + buy back-month ATM put at same strike. Profits from time decay differential.",
        "legs": ["short_put_front", "long_put_back"],
        "delta_targets": {"short_put": -0.50, "long_put": -0.50},
        "designed_for_iv": "low",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "Put calendar spreads profit from the front-month put decaying faster than the back-month put; "
            "low IV keeps the back-month long put affordable and the structure net debit small."
        ),
    },
    "put_butterfly": {
        "name": "Put Butterfly",
        "direction": ["BEARISH"],
        "iv_environment": ["LOW", "MEDIUM", "HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 30,
        "pop_range": (20, 40),
        "profit_target_pct": 25,
        "description": "Buy ATM put, sell 2 OTM puts, buy further OTM put. Cheap directional bet.",
        "legs": ["long_put_atm", "short_2_puts_otm", "long_put_further_otm"],
        "delta_targets": {"body": -50, "wing": -20},
        "designed_for_iv": "any",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "Put butterflies are low-cost defined-risk structures that profit when the underlying "
            "closes near the short strikes at expiration, applicable across IV environments."
        ),
    },
    "reverse_big_lizard": {
        "name": "Reverse Big Lizard",
        "direction": ["BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 25,
        "description": "Sell ATM call + sell ATM put spread. Credit > put spread width = no downside risk.",
        "legs": ["short_call_atm", "short_put_spread_atm"],
        "delta_targets": {"short_call": -50, "short_put": -50, "long_put": -30},
        "designed_for_iv": "high",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "The Reverse Big Lizard is a high-IV premium-selling structure where elevated prices "
            "allow the collected credit to exceed the put spread width, eliminating downside risk."
        ),
    },
    # ── Omnidirectional ────────────────────────────────────────────────────
    "put_front_ratio": {
        "name": "Put Front-Ratio Spread",
        "direction": ["OMNIDIRECTIONAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Buy 1 OTM put + sell 2 further OTM puts. Profits from IV contraction; net credit in high IV.",
        "legs": ["long_put_otm", "short_2_puts_further_otm"],
        "delta_targets": {"long_put": -0.40, "short_put": -0.20},
        "designed_for_iv": "high",
        "designed_for_direction": "any",
        "condition_explanation": (
            "Put front-ratio spreads sell more puts than bought; high IV produces a net credit "
            "and the strategy profits when the underlying stays above the short put strikes."
        ),
    },
    "call_front_ratio": {
        "name": "Call Front-Ratio Spread",
        "direction": ["OMNIDIRECTIONAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Buy 1 OTM call + sell 2 further OTM calls. Profits from IV contraction; net credit in high IV.",
        "legs": ["long_call_otm", "short_2_calls_further_otm"],
        "delta_targets": {"long_call": 0.40, "short_call": 0.20},
        "designed_for_iv": "high",
        "designed_for_direction": "any",
        "condition_explanation": (
            "Call front-ratio spreads sell more calls than bought; high IV produces a net credit "
            "and the strategy profits when the underlying stays below the short call strikes."
        ),
    },
    "put_broken_wing_butterfly": {
        "name": "Put Broken Wing Butterfly",
        "direction": ["OMNIDIRECTIONAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 30,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Long put spread + wider short put spread for credit. No upside risk, max profit at short strikes.",
        "legs": ["long_put_atm", "short_2_puts_otm", "long_put_further_otm_wide"],
        "delta_targets": {"long_put": -50, "short_puts": -30, "wing": -10},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "Put broken wing butterflies are structured for credit in high IV; "
            "elevated premiums allow the skewed wing placement to produce a net credit rather than a debit."
        ),
    },
    "call_broken_wing_butterfly": {
        "name": "Call Broken Wing Butterfly",
        "direction": ["OMNIDIRECTIONAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 30,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Long call spread + wider short call spread for credit. No downside risk, max profit at short strikes.",
        "legs": ["long_call_atm", "short_2_calls_otm", "long_call_further_otm_wide"],
        "delta_targets": {"long_call": 50, "short_calls": 30, "wing": 10},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "Call broken wing butterflies are structured for credit in high IV; "
            "elevated premiums allow the skewed wing placement to produce a net credit rather than a debit."
        ),
    },
    "call_broken_heart_butterfly": {
        "name": "Call Broken Heart Butterfly",
        "direction": ["OMNIDIRECTIONAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Buy narrow near-OTM call spread + sell wider further OTM call spread for net credit. Wide upside profit zone.",
        "legs": ["long_call_spread_narrow", "short_call_spread_wide"],
        "delta_targets": {"long_call": 0.40, "short_call_narrow": 0.30, "short_call_wide": 0.20, "long_call_wide": 0.10},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "The Call Broken Heart Butterfly disconnects the two call spreads to create a wide upside "
            "profit zone; high IV allows routing the structure for a credit with high probability of success."
        ),
    },
    "put_broken_heart_butterfly": {
        "name": "Put Broken Heart Butterfly",
        "direction": ["OMNIDIRECTIONAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Buy narrow near-OTM put spread + sell wider further OTM put spread for net credit. Wide downside profit zone.",
        "legs": ["long_put_spread_narrow", "short_put_spread_wide"],
        "delta_targets": {"long_put": -0.40, "short_put_narrow": -0.30, "short_put_wide": -0.20, "long_put_wide": -0.10},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "The Put Broken Heart Butterfly disconnects the two put spreads to create a wide downside "
            "profit zone; high IV allows routing the structure for a credit with high probability of success."
        ),
    },
    # ── Neutral ────────────────────────────────────────────────────────────
    "short_strangle": {
        "name": "Short Strangle",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put + OTM call. Profit from time decay + IV contraction within strikes.",
        "legs": ["short_put_otm", "short_call_otm"],
        "delta_targets": {"short_put": -16, "short_call": 16},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "Short strangles sell OTM premium on both sides; elevated IV produces a wider "
            "breakeven range and a larger credit, which is the mechanical design intent of this structure."
        ),
    },
    "short_straddle": {
        "name": "Short Straddle",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 2,
        "dte_target": 45,
        "pop_range": (50, 60),
        "profit_target_pct": 25,
        "description": "Sell ATM put + ATM call. Max premium collection, stock must stay near strike.",
        "legs": ["short_put_atm", "short_call_atm"],
        "delta_targets": {"short_put": -50, "short_call": 50},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "Short straddles sell ATM calls and puts to collect maximum premium; "
            "high IV produces a large credit that widens the range over which the trade profits."
        ),
    },
    "iron_condor": {
        "name": "Iron Condor",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put spread + OTM call spread. Collect ~1/3 width. Stock stays between short strikes.",
        "legs": ["short_put_spread", "short_call_spread"],
        "delta_targets": {"short_put": -16, "short_call": 16},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "Iron condors are defined-risk neutral structures; high IV widens the spread between "
            "short strikes and increases the credit received relative to the capital at risk."
        ),
    },
    "dynamic_width_iron_condor": {
        "name": "Dynamic Width Iron Condor",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put spread + OTM call spread with asymmetric wing widths sized to skew and liquidity.",
        "legs": ["short_put_spread_wide", "short_call_spread_standard"],
        "delta_targets": {"short_put": -16, "short_call": 16},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "Dynamic width iron condors adjust put and call wing widths independently based on skew; "
            "high IV provides sufficient credit even with asymmetric wing placement."
        ),
    },
    "iron_fly": {
        "name": "Iron Fly",
        "direction": ["NEUTRAL"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 25,
        "description": "Sell ATM straddle + buy OTM wings. Defined risk version of short straddle.",
        "legs": ["short_put_atm", "short_call_atm", "long_put_wing", "long_call_wing"],
        "delta_targets": {"short_put": -50, "short_call": 50, "wing_put": -16, "wing_call": 16},
        "designed_for_iv": "high",
        "designed_for_direction": "neutral",
        "condition_explanation": (
            "Iron flies sell ATM straddle premium with defined-risk wings; "
            "high IV inflates ATM option prices, increasing the credit collected at the short strikes."
        ),
    },
    # ── Neutral-Bullish ────────────────────────────────────────────────────
    "short_naked_put": {
        "name": "Short Naked Put",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put. High probability trade betting stock won't fall below strike.",
        "legs": ["short_put_otm"],
        "delta_targets": {"short_put": -30},
        "designed_for_iv": "high",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "Short naked puts collect credit by selling downside protection; "
            "high IV inflates put premiums, producing a larger credit and a wider downside breakeven."
        ),
    },
    "short_put_vertical": {
        "name": "Short Put Vertical Spread",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put + buy further OTM put. Defined risk bullish credit spread.",
        "legs": ["short_put_otm", "long_put_further_otm"],
        "delta_targets": {"short_put": -30, "long_put": -16},
        "designed_for_iv": "high",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "Short put verticals collect credit by selling a put spread below the current price; "
            "high IV increases the premium received relative to the spread width."
        ),
    },
    "jade_lizard": {
        "name": "Jade Lizard",
        "direction": ["NEUTRAL_BULLISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM put + sell OTM call spread. Net credit > call spread width = no upside risk.",
        "legs": ["short_put_otm", "short_call_spread_otm"],
        "delta_targets": {"short_put": -30, "short_call": 30, "long_call": 16},
        "designed_for_iv": "high",
        "designed_for_direction": "bullish",
        "condition_explanation": (
            "The Jade Lizard combines a short put with a short call spread; "
            "high IV allows the combined credit to exceed the call spread width, eliminating upside risk."
        ),
    },
    # ── Neutral-Bearish ────────────────────────────────────────────────────
    "short_naked_call": {
        "name": "Short Naked Call",
        "direction": ["NEUTRAL_BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM call. High probability trade betting stock won't rise above strike.",
        "legs": ["short_call_otm"],
        "delta_targets": {"short_call": 30},
        "designed_for_iv": "high",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "Short naked calls collect credit by selling upside risk; "
            "high IV inflates call premiums, producing a larger credit and a wider upside breakeven."
        ),
    },
    "short_call_vertical": {
        "name": "Short Call Vertical Spread",
        "direction": ["NEUTRAL_BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "DEFINED",
        "complexity": 1,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM call + buy further OTM call. Defined risk bearish credit spread.",
        "legs": ["short_call_otm", "long_call_further_otm"],
        "delta_targets": {"short_call": 30, "long_call": 16},
        "designed_for_iv": "high",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "Short call verticals collect credit by selling a call spread above the current price; "
            "high IV increases the premium received relative to the spread width."
        ),
    },
    "reverse_jade_lizard": {
        "name": "Reverse Jade Lizard",
        "direction": ["NEUTRAL_BEARISH"],
        "iv_environment": ["HIGH"],
        "risk_type": "UNDEFINED",
        "complexity": 3,
        "dte_target": 45,
        "pop_range": (60, 80),
        "profit_target_pct": 50,
        "description": "Sell OTM call + sell OTM put spread. Net credit > put spread width = no downside risk.",
        "legs": ["short_call_otm", "short_put_spread_otm"],
        "delta_targets": {"short_call": 30, "short_put": -30, "long_put": -16},
        "designed_for_iv": "high",
        "designed_for_direction": "bearish",
        "condition_explanation": (
            "The Reverse Jade Lizard combines a short call with a short put spread; "
            "high IV allows the combined credit to exceed the put spread width, eliminating downside risk."
        ),
    },
}

# ── Greek profiles (tastylive Options Strategy Guide, 2023) ──────────────────
# The expected SIGN of each position greek for every strategy, taken directly
# from the EXAMPLE box on each strategy's page in the guide. These describe the
# intended risk profile of the structure:
#   delta — directional exposure (long = bullish, short = bearish, flat = neutral)
#   gamma — how fast delta changes as the underlying moves
#   theta — time decay (long = decay helps you, short = decay hurts you)
#   vega  — volatility exposure (long = profits from IV rise, short = from IV fall)
# "dynamic" means the greek flips sign across the structure's strikes (back-ratios
# and butterflies) and cannot be summarised by a single static sign.
# build_trade() computes the ACTUAL net greeks of the selected strikes and the
# frontend compares them against these expected signs.
#
# SOURCE OF TRUTH: strategy_catalog.greek_{delta,gamma,theta,vega} columns
# (backend/migrations/020_strategy_greek_profiles.sql). This dict MIRRORS those
# columns. Any change here MUST be made in a migration FIRST, then mirrored here —
# same migration-first governance as direction/iv_environment/complexity/etc.
GREEK_PROFILES = {
    # Bullish
    "covered_call":           {"delta": "long",          "gamma": "dynamic", "theta": "long",  "vega": "short"},
    "long_call_vertical":     {"delta": "long",          "gamma": "flat",    "theta": "flat",  "vega": "flat"},
    "call_zebra":             {"delta": "long/dynamic",  "gamma": "dynamic", "theta": "flat",  "vega": "flat"},
    "poor_mans_covered_call": {"delta": "long",          "gamma": "dynamic", "theta": "flat",  "vega": "long"},
    "call_calendar":          {"delta": "long",          "gamma": "dynamic", "theta": "short", "vega": "long"},
    "call_butterfly":         {"delta": "long/dynamic",  "gamma": "dynamic", "theta": "short", "vega": "long"},
    "big_lizard":             {"delta": "long",          "gamma": "short",   "theta": "long",  "vega": "short"},
    # Bearish
    "covered_put":            {"delta": "short",         "gamma": "dynamic", "theta": "long",  "vega": "short"},
    "long_put_vertical":      {"delta": "short",         "gamma": "flat",    "theta": "flat",  "vega": "flat"},
    "put_zebra":              {"delta": "short/dynamic", "gamma": "dynamic", "theta": "flat",  "vega": "flat"},
    "poor_mans_covered_put":  {"delta": "short",         "gamma": "dynamic", "theta": "flat",  "vega": "long"},
    "put_calendar":           {"delta": "short",         "gamma": "dynamic", "theta": "short", "vega": "long"},
    "put_butterfly":          {"delta": "short/dynamic", "gamma": "dynamic", "theta": "short", "vega": "long"},
    "reverse_big_lizard":     {"delta": "short",         "gamma": "short",   "theta": "long",  "vega": "short"},
    # Omnidirectional
    "put_front_ratio":            {"delta": "long/dynamic",  "gamma": "dynamic", "theta": "long", "vega": "short"},
    "call_front_ratio":           {"delta": "short/dynamic", "gamma": "dynamic", "theta": "long", "vega": "short"},
    "put_broken_wing_butterfly":  {"delta": "long/dynamic",  "gamma": "dynamic", "theta": "long", "vega": "short"},
    "call_broken_wing_butterfly": {"delta": "short/dynamic", "gamma": "dynamic", "theta": "long", "vega": "short"},
    "call_broken_heart_butterfly":{"delta": "flat/dynamic",  "gamma": "dynamic", "theta": "long", "vega": "short"},
    "put_broken_heart_butterfly": {"delta": "flat/dynamic",  "gamma": "dynamic", "theta": "long", "vega": "short"},
    # Neutral
    "short_strangle":            {"delta": "flat", "gamma": "short", "theta": "long", "vega": "short"},
    "short_straddle":            {"delta": "flat", "gamma": "short", "theta": "long", "vega": "short"},
    "iron_condor":               {"delta": "flat", "gamma": "flat",  "theta": "long", "vega": "short"},
    "dynamic_width_iron_condor": {"delta": "flat", "gamma": "flat",  "theta": "long", "vega": "short"},
    "iron_fly":                  {"delta": "flat", "gamma": "flat",  "theta": "long", "vega": "short"},
    # Neutral-Bullish
    "short_naked_put":    {"delta": "long", "gamma": "short", "theta": "long", "vega": "short"},
    "short_put_vertical": {"delta": "long", "gamma": "flat",  "theta": "long", "vega": "short"},
    "jade_lizard":        {"delta": "long", "gamma": "short", "theta": "long", "vega": "short"},
    # Neutral-Bearish
    "short_naked_call":    {"delta": "short", "gamma": "short", "theta": "long", "vega": "short"},
    "short_call_vertical": {"delta": "short", "gamma": "flat",  "theta": "long", "vega": "short"},
    "reverse_jade_lizard": {"delta": "short", "gamma": "short", "theta": "long", "vega": "short"},
}

# Attach the expected greek profile to each strategy in the catalog.
for _key, _profile in GREEK_PROFILES.items():
    if _key in STRATEGIES:
        STRATEGIES[_key]["greek_profile"] = _profile

SELLER_STRATEGIES = {
    "covered_call", "covered_put",
    "short_naked_put", "short_put_vertical", "jade_lizard",
    "short_naked_call", "short_call_vertical", "reverse_jade_lizard",
    "short_strangle", "short_straddle", "iron_condor", "dynamic_width_iron_condor", "iron_fly",
    "put_calendar", "call_calendar",
    "put_front_ratio", "call_front_ratio",
    "put_broken_wing_butterfly", "call_broken_wing_butterfly",
    "call_broken_heart_butterfly", "put_broken_heart_butterfly",
    "big_lizard", "reverse_big_lizard",
}

# Bias compatibility mapping: a given bias can also match broader categories
BIAS_COMPATIBILITY = {
    "BULLISH": ["BULLISH"],
    "BEARISH": ["BEARISH"],
    "NEUTRAL": ["NEUTRAL"],
    "NEUTRAL_BULLISH": ["NEUTRAL_BULLISH", "BULLISH", "NEUTRAL"],
    "NEUTRAL_BEARISH": ["NEUTRAL_BEARISH", "BEARISH", "NEUTRAL"],
    "OMNIDIRECTIONAL": ["OMNIDIRECTIONAL", "NEUTRAL"],
}

# Maps designed_for_direction to the set of current-bias values it aligns with
_DIRECTION_MAP: dict[str, set] = {
    "bullish":  {"BULLISH", "NEUTRAL_BULLISH"},
    "bearish":  {"BEARISH", "NEUTRAL_BEARISH"},
    "neutral":  {"NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH"},
    "volatile": {"OMNIDIRECTIONAL"},
    "any":      {"BULLISH", "BEARISH", "NEUTRAL", "NEUTRAL_BULLISH", "NEUTRAL_BEARISH", "OMNIDIRECTIONAL"},
}


def _iv_matches(designed_for_iv: str, current_iv_env: str) -> bool:
    if designed_for_iv == "any":
        return True
    return designed_for_iv.upper() == current_iv_env.upper()


def _direction_matches(designed_for_direction: str, current_bias: str) -> bool:
    return current_bias in _DIRECTION_MAP.get(designed_for_direction, set())


def recommend_strategies(iv_env: str, bias: str, top_n: int = 5) -> list[dict]:
    """
    Score and rank all strategies per docs/strategy-selection-spec.md §4.
    Returns the top_n strategies sorted by score descending.

    Used by: Scanner (decides the directional view for the user).

    Scoring:
      +2  IV environment match
      +3  exact direction match
      +1  adjacent direction match (from BIAS_COMPATIBILITY)
      -0.1 * complexity  tiebreak toward simpler structures

    Strategies matching neither axis are excluded.
    Maximum score = 4.9 (iv_match + exact direction + complexity 1).
    """
    compatible = BIAS_COMPATIBILITY.get(bias, [bias])
    scored: list[tuple] = []
    for key, strat in STRATEGIES.items():
        iv_match        = iv_env in strat["iv_environment"]
        direction_match = bias in strat["direction"]
        partial_match   = any(c in strat["direction"] for c in compatible)

        if not iv_match and not partial_match:
            continue

        score: float = 0.0
        if iv_match:
            score += 2
        if direction_match:
            score += 3
        elif partial_match:
            score += 1
        score -= strat["complexity"] * 0.1

        scored.append((score, key, strat))

    scored.sort(key=lambda x: -x[0])
    return [
        {
            "key": k,
            "name": s["name"],
            "score": round(sc, 2),
            "direction": s["direction"],
            "iv_environment": s["iv_environment"],
            "risk_type": s["risk_type"],
            "complexity": s["complexity"],
            "dte_target": s["dte_target"],
            "pop_range": s["pop_range"],
            "profit_target_pct": s["profit_target_pct"],
        }
        for sc, k, s in scored[:top_n]
    ]


def recommend_by_category(iv_env: str) -> dict:
    """
    For each directional category, return the top 3 strategies (sorted by
    complexity ascending) whose iv_environment includes iv_env.

    Categories: BULLISH, BEARISH, NEUTRAL, NEUTRAL_BULLISH, NEUTRAL_BEARISH,
                OMNIDIRECTIONAL

    Returns a dict keyed by category name, each value a list of up to 3 strategy
    dicts (same fields as before, without fit_score).
    """
    categories = [
        "BULLISH",
        "BEARISH",
        "NEUTRAL",
        "NEUTRAL_BULLISH",
        "NEUTRAL_BEARISH",
        "OMNIDIRECTIONAL",
    ]

    result = {}
    for category in categories:
        matches = []
        for key, strat in STRATEGIES.items():
            if iv_env in strat["iv_environment"] and category in strat["direction"]:
                matches.append((strat["complexity"], key, strat))

        matches.sort(key=lambda x: x[0])  # simpler first

        result[category] = [
            {
                "key": key,
                "name": strat["name"],
                "description": strat["description"],
                "direction": strat["direction"],
                "iv_environment": strat["iv_environment"],
                "risk_type": strat["risk_type"],
                "complexity": strat["complexity"],
                "dte_target": strat["dte_target"],
                "pop_range": strat["pop_range"],
                "profit_target_pct": strat["profit_target_pct"],
                "greek_profile": strat.get("greek_profile"),
            }
            for _, key, strat in matches[:3]
        ]

    return result


def get_strategy_count(iv_env: str) -> int:
    """Returns count of strategies whose iv_environment includes iv_env."""
    return sum(1 for s in STRATEGIES.values() if iv_env in s["iv_environment"])


def get_condition_match_count(iv_env: str, bias: str) -> int:
    """Returns count of strategies where both IV and direction conditions match."""
    return sum(
        1
        for s in STRATEGIES.values()
        if _iv_matches(s["designed_for_iv"], iv_env) and _direction_matches(s["designed_for_direction"], bias)
    )


def build_comparison_matrix(
    symbol: str,
    iv_env: str,
    current_bias: str,
    options_chain: dict,
    spot_price: float,
    earnings_data: dict | None = None,
    trades_by_key: dict | None = None,
) -> list[dict]:
    """
    Returns a list of MatrixRow dicts for all strategies whose iv_environment
    includes iv_env. Rows are ordered by complexity ascending within each
    directional category, then by CATEGORY_ORDER.

    trades_by_key — optional pre-built trade dict keyed by strategy key;
    avoids duplicate build_trade() calls when the route has already built them.
    """
    CATEGORY_ORDER = [
        "BULLISH", "NEUTRAL_BULLISH", "NEUTRAL", "NEUTRAL_BEARISH",
        "BEARISH", "OMNIDIRECTIONAL",
    ]

    is_synthetic = options_chain.get("_synthetic", False)

    # Collect and order all applicable strategies
    ordered_entries: list[tuple] = []
    for key, strat in STRATEGIES.items():
        if iv_env not in strat["iv_environment"]:
            continue
        primary_dir = strat["direction"][0]
        cat_rank = CATEGORY_ORDER.index(primary_dir) if primary_dir in CATEGORY_ORDER else len(CATEGORY_ORDER)
        ordered_entries.append((cat_rank, strat["complexity"], key, strat))

    ordered_entries.sort(key=lambda x: (x[0], x[1]))

    matrix: list[dict] = []
    for _, _, key, strat in ordered_entries:
        # Resolve trade data
        if trades_by_key and key in trades_by_key:
            trade = trades_by_key[key]
        else:
            try:
                trade = build_trade(symbol, key, options_chain, spot_price, earnings_data=earnings_data)
                if trade is None:
                    # Suppressed by max_profit guard — skip this strategy
                    continue
                if is_synthetic:
                    trade["_synthetic"] = True
            except Exception as e:
                logger.warning(f"build_comparison_matrix: build_trade failed for {key}: {e}")
                trade = {"error": str(e)}

        if trade is None:
            continue
        has_error = "error" in trade

        # Aggregate net greeks from legs
        net_delta: float | None = None
        net_theta: float | None = None
        net_vega: float | None = None

        if not has_error:
            legs = trade.get("legs", [])
            delta_sum = 0.0
            theta_sum = 0.0
            vega_sum = 0.0
            has_theta_vega = False

            for leg in legs:
                if leg.get("option_type") == "stock":
                    delta_sum += leg.get("delta", 1.0)
                    continue
                # Short positions negate the per-leg greek; long positions keep it.
                sign = -1.0 if leg.get("action") == "sell" else 1.0
                delta_sum += sign * leg.get("delta", 0.0)
                t = leg.get("theta")
                v = leg.get("vega")
                if t is not None:
                    theta_sum += sign * t
                    has_theta_vega = True
                if v is not None:
                    vega_sum += sign * v

            net_delta = round(delta_sum, 4)
            net_theta = round(theta_sum, 4) if has_theta_vega else None
            net_vega = round(vega_sum, 4) if has_theta_vega else None

        # Condition alignment
        iv_condition_match = _iv_matches(strat["designed_for_iv"], iv_env)
        direction_condition_match = _direction_matches(strat["designed_for_direction"], current_bias)

        # iv_fit_label
        iv_env_list = strat["iv_environment"]
        if len(iv_env_list) >= 3:
            iv_fit_label = "Performs well in any IV environment"
        else:
            iv_fit_label = "Performs well in " + "/".join(iv_env_list) + " IV"

        # credit_or_debit
        net_flow = trade.get("estimated_credit_or_debit", 0.0) if not has_error else 0.0
        credit_or_debit = "credit" if net_flow >= 0 else "debit"

        row: dict = {
            "key": key,
            "name": strat["name"],
            "direction": strat["direction"],
            "credit_or_debit": credit_or_debit,
            "risk_type": strat["risk_type"],
            "complexity": strat["complexity"],
            "iv_environment_fit": strat["iv_environment"],
            "iv_fit_label": iv_fit_label,
            "dte_target": strat["dte_target"],
            "max_profit": trade.get("max_profit") if not has_error else None,
            "max_loss": trade.get("max_loss") if not has_error else None,
            "breakeven_low": trade.get("breakeven_low") if not has_error else None,
            "breakeven_high": trade.get("breakeven_high") if not has_error else None,
            "net_delta": net_delta,
            "net_theta": net_theta,
            "net_vega": net_vega,
            "pop_range": list(strat["pop_range"]),
            "designed_for_iv": strat["designed_for_iv"],
            "designed_for_direction": strat["designed_for_direction"],
            "iv_condition_match": iv_condition_match,
            "direction_condition_match": direction_condition_match,
            "condition_explanation": strat["condition_explanation"],
            "_synthetic": trade.get("_synthetic", is_synthetic) if not has_error else is_synthetic,
        }
        matrix.append(row)

    return matrix


def _find_earnings_adjusted_expiry(expirations: list, dte_target: int, earnings_date_str: str, is_seller: bool):
    """
    Returns (expiry, note) adjusted around an upcoming earnings date.
    Sellers: use last expiry BEFORE earnings (min 7 DTE); fall back to first post-earnings.
    Buyers: use first expiry AFTER earnings closest to dte_target.
    """
    try:
        earn_date = date.fromisoformat(earnings_date_str)
    except Exception:
        return None, None

    today = date.today()
    sorted_exps = sorted(expirations)

    if is_seller:
        pre = [e for e in sorted_exps if date.fromisoformat(e) < earn_date and (date.fromisoformat(e) - today).days >= 7]
        if pre:
            expiry = pre[-1]
            dte = (date.fromisoformat(expiry) - today).days
            note = (
                f"Earnings awareness active: {earnings_date_str} earnings detected. "
                f"As a premium seller, this trade uses the {expiry} expiry ({dte} DTE) — "
                f"expiring BEFORE earnings to avoid the post-announcement IV crush risk."
            )
            return expiry, note
        post = [e for e in sorted_exps if date.fromisoformat(e) > earn_date]
        if post:
            target = today + timedelta(days=dte_target)
            expiry = min(post, key=lambda e: abs((date.fromisoformat(e) - target).days))
            dte = (date.fromisoformat(expiry) - today).days
            note = (
                f"Earnings awareness active: {earnings_date_str} earnings detected. "
                f"No pre-earnings expiry with sufficient DTE found; using {expiry} ({dte} DTE) after earnings. "
                f"Size at half normal allocation given elevated earnings risk."
            )
            return expiry, note
    else:
        post = [e for e in sorted_exps if date.fromisoformat(e) > earn_date]
        if post:
            target = today + timedelta(days=dte_target)
            expiry = min(post, key=lambda e: abs((date.fromisoformat(e) - target).days))
            dte = (date.fromisoformat(expiry) - today).days
            note = (
                f"Earnings awareness active: {earnings_date_str} earnings detected. "
                f"As a premium buyer, this trade uses the {expiry} expiry ({dte} DTE) — "
                f"expiring AFTER earnings to capture the post-announcement move."
            )
            return expiry, note

    return None, None


def _find_nearest_expiry(expirations: list, dte_target: int = 45) -> str | None:
    """Pick the closest expiry at or above today + dte_target; fall back to the
    highest available below-target expiry.  Matches market_data.py chain-fetch
    logic so both always resolve to the same date."""
    if not expirations:
        return None
    target = date.today() + timedelta(days=dte_target)
    valid = []
    for exp_str in expirations:
        try:
            valid.append((date.fromisoformat(exp_str), exp_str))
        except ValueError:
            continue
    if not valid:
        return None
    valid.sort()
    at_or_above = [(d, s) for d, s in valid if d >= target]
    if at_or_above:
        return at_or_above[0][1]   # closest at or above
    return valid[-1][1]            # highest below target


def _find_by_delta(contracts: list, target_delta: float, exclude_strikes: set | None = None) -> dict | None:
    """Find the contract whose delta is closest to target_delta."""
    if not contracts:
        return None
    best = None
    best_diff = None
    for c in contracts:
        if exclude_strikes and c.get("strike") in exclude_strikes:
            continue
        delta = c.get("delta", 0.0)
        diff = abs(delta - target_delta)
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best = c
    return best


def _mid(contract: dict) -> float:
    bid = contract.get("bid", 0.0)
    ask = contract.get("ask", 0.0)
    if bid > 0 and ask > 0:
        return round((bid + ask) / 2, 2)
    if ask > 0:
        return round(ask / 2, 2)
    return round(contract.get("lastPrice", 0.0), 2)


def _sign_label(value: float, flat_threshold: float) -> str:
    """Classify a net greek into long / short / flat for comparison with the
    catalog's expected profile."""
    if abs(value) < flat_threshold:
        return "flat"
    return "long" if value > 0 else "short"


def compute_net_greeks(legs: list) -> dict:
    """
    Sum the per-share greeks of every leg into the net position greeks, applying
    +1 for long (buy) legs and -1 for short (sell) legs and scaling to one
    100-share contract. The sign convention matches the tastylive guide:
      net positive theta  → "long theta"  (time decay works for you)
      net positive vega   → "long vega"   (profits from rising IV)
      net positive gamma  → "long gamma"
      net positive delta  → bullish
    Stock legs contribute delta only (±1 per share); their gamma/theta/vega are 0.
    Returns both the raw values and their long/short/flat classification.
    """
    net = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0}
    for leg in legs:
        sign = 1.0 if leg.get("action") == "buy" else -1.0
        for g in net:
            val = leg.get(g)
            if val is None:
                continue
            net[g] += sign * float(val)

    # Scale to a single 100-share contract for realistic position greeks.
    scaled = {g: round(v * 100, 2) for g, v in net.items()}
    # Flat thresholds are generous for delta (share-equivalent) and tight for the
    # smaller per-contract greeks so genuine exposure is not labelled "flat".
    return {
        **scaled,
        "signs": {
            "delta": _sign_label(scaled["delta"], 8.0),
            "gamma": _sign_label(scaled["gamma"], 0.5),
            "theta": _sign_label(scaled["theta"], 0.5),
            "vega": _sign_label(scaled["vega"], 1.0),
        },
    }


def build_trade(symbol: str, strategy_key: str, options_chain: dict, spot_price: float, earnings_data: dict | None = None) -> dict:
    """
    Given a strategy key and live options chain (already enriched with greeks),
    find the nearest 45 DTE expiry and select strikes closest to the delta targets.

    Returns a trade structure with legs, P&L estimates, and PoP.
    """
    strat = STRATEGIES.get(strategy_key)
    if not strat:
        return {"error": f"Unknown strategy: {strategy_key}"}

    expirations = options_chain.get("expirations", [])
    earnings_note: str | None = None
    earnings_adjusted = False

    if earnings_data:
        earn_date_str = earnings_data.get("earnings_date") or earnings_data.get("next_earnings_date")
        if earn_date_str:
            is_seller = strategy_key in SELLER_STRATEGIES
            adj_expiry, note = _find_earnings_adjusted_expiry(
                expirations, strat["dte_target"], earn_date_str, is_seller
            )
            if adj_expiry:
                expiry = adj_expiry
                earnings_note = note
                earnings_adjusted = True

    if not earnings_adjusted:
        expiry = _find_nearest_expiry(expirations, strat["dte_target"])
    if not expiry:
        return {"error": "No expirations available"}

    # We need to get chain data for the target expiry if different from current
    chain_expiry = options_chain.get("expiry")
    if expiry != chain_expiry:
        # The caller should pass the correct expiry chain; fall back to whatever is available
        expiry = chain_expiry or (expirations[0] if expirations else None)
        if not expiry:
            return {"error": "Cannot resolve expiry"}

    calls = options_chain.get("calls", [])
    puts = options_chain.get("puts", [])

    legs = []

    # Track strikes already claimed per option_type so two legs of the same type
    # never resolve to the same strike on a sparse chain. Intentional same-strike
    # legs (butterfly body, calendar back month, ratio second short) are always
    # built via dict-copy, not a second make_leg call, so they bypass this.
    _used_strikes: dict[str, set] = {"call": set(), "put": set()}

    def make_leg(role: str, option_type: str, target_delta: float, action: str, exclude_strikes: set | None = None) -> dict | None:
        contracts = calls if option_type == "call" else puts
        combined = set(_used_strikes.get(option_type, set()))
        if exclude_strikes:
            combined |= exclude_strikes
        c = _find_by_delta(contracts, target_delta, exclude_strikes=combined or None)
        if not c:
            return None
        _used_strikes.setdefault(option_type, set()).add(c["strike"])
        mid = _mid(c)
        signed_mid = mid if action == "sell" else -mid
        return {
            "role": role,
            "option_type": option_type,
            "strike": c["strike"],
            "delta": c.get("delta", 0.0),
            "gamma": c.get("gamma"),
            "theta": c.get("theta"),
            "vega": c.get("vega"),
            "bid": c.get("bid", 0.0),
            "ask": c.get("ask", 0.0),
            "mid": mid,
            "action": action,
            "signed_mid": signed_mid,
        }

    # ── Build legs based on strategy ────────────────────────────────────────────
    if strategy_key == "covered_call":
        leg = make_leg("Short Call", "call", 0.30, "sell")
        if leg:
            legs.append(leg)
        legs.append({
            "role": "Long Stock",
            "option_type": "stock",
            "strike": spot_price,
            "delta": 1.0,
            "bid": spot_price,
            "ask": spot_price,
            "mid": spot_price,
            "action": "buy",
            "signed_mid": -spot_price,
        })

    elif strategy_key == "long_call_vertical":
        long_leg = make_leg("Long Call (ITM)", "call", 0.70, "buy")
        short_leg = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        for l in [long_leg, short_leg]:
            if l:
                legs.append(l)
        if not (long_leg and short_leg) or long_leg["strike"] >= short_leg["strike"]:
            return {"error": "Could not build valid vertical spread — strikes too close; options chain may be too sparse"}

    elif strategy_key == "poor_mans_covered_call":
        long_leg = make_leg("Long Call (LEAPS ITM)", "call", 0.70, "buy")
        short_leg = make_leg("Short Call (OTM front)", "call", 0.30, "sell")
        back_expiry_pmcc = next(
            (e for e in sorted(expirations)
             if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 45),
            expirations[-1] if expirations else expiry
        )
        if long_leg:
            long_leg["expiry"] = back_expiry_pmcc
            legs.append(long_leg)
        if short_leg:
            short_leg["expiry"] = expiry
            legs.append(short_leg)

    elif strategy_key == "call_butterfly":
        atm = make_leg("Long Call (ATM)", "call", 0.50, "buy")
        otm1 = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        wing = make_leg("Long Call (Wing)", "call", 0.15, "buy")
        for l in [atm, otm1, wing]:
            if l:
                legs.append(l)
        # Remove duplicate otm2 — it's same strike as otm1
        if otm1:
            legs.append({**otm1, "role": "Short Call (OTM) 2"})

    elif strategy_key == "big_lizard":
        short_put = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        short_call = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        long_call = make_leg("Long Call (OTM)", "call", 0.30, "buy")
        for l in [short_put, short_call, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "long_put_vertical":
        long_leg = make_leg("Long Put (ITM)", "put", -0.70, "buy")
        short_leg = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        for l in [long_leg, short_leg]:
            if l:
                legs.append(l)
        if not (long_leg and short_leg) or long_leg["strike"] <= short_leg["strike"]:
            return {"error": "Could not build valid vertical spread — strikes too close; options chain may be too sparse"}

    elif strategy_key == "put_butterfly":
        atm = make_leg("Long Put (ATM)", "put", -0.50, "buy")
        otm1 = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        wing = make_leg("Long Put (Wing)", "put", -0.15, "buy")
        for l in [atm, otm1, wing]:
            if l:
                legs.append(l)
        if otm1:
            legs.append({**otm1, "role": "Short Put (OTM) 2"})

    elif strategy_key == "reverse_big_lizard":
        short_call = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        short_put = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        long_put = make_leg("Long Put (OTM)", "put", -0.30, "buy")
        for l in [short_call, short_put, long_put]:
            if l:
                legs.append(l)

    elif strategy_key == "short_strangle":
        short_put = make_leg("Short Put (OTM)", "put", -0.16, "sell")
        short_call = make_leg("Short Call (OTM)", "call", 0.16, "sell")
        for l in [short_put, short_call]:
            if l:
                legs.append(l)

    elif strategy_key == "short_straddle":
        short_put = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        short_call = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        for l in [short_put, short_call]:
            if l:
                legs.append(l)

    elif strategy_key == "iron_condor":
        short_put = make_leg("Short Put", "put", -0.16, "sell")
        long_put = make_leg("Long Put (wing)", "put", -0.08, "buy")
        short_call = make_leg("Short Call", "call", 0.16, "sell")
        long_call = make_leg("Long Call (wing)", "call", 0.08, "buy")
        for l in [short_put, long_put, short_call, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "iron_fly":
        short_put = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        short_call = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        long_put = make_leg("Long Put (wing)", "put", -0.16, "buy")
        long_call = make_leg("Long Call (wing)", "call", 0.16, "buy")
        for l in [short_put, short_call, long_put, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "short_naked_put":
        leg = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        if leg:
            legs.append(leg)

    elif strategy_key == "short_put_vertical":
        short_leg = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        long_leg = make_leg("Long Put (further OTM)", "put", -0.16, "buy")
        for l in [short_leg, long_leg]:
            if l:
                legs.append(l)
        if not (short_leg and long_leg) or short_leg["strike"] <= long_leg["strike"]:
            return {"error": "Could not build valid vertical spread — strikes too close; options chain may be too sparse"}

    elif strategy_key == "jade_lizard":
        short_put = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        short_call = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        long_call = make_leg("Long Call (further OTM)", "call", 0.16, "buy")
        for l in [short_put, short_call, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "put_calendar":
        front_leg = make_leg("Short Put (Front Month)", "put", -0.50, "sell")
        if front_leg:
            front_leg["expiry"] = expiry
            legs.append(front_leg)
            back_mid = round(front_leg["mid"] * 1.6, 2)
            back_expiry = next(
                (e for e in sorted(expirations)
                 if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 28),
                expirations[-1] if expirations else expiry
            )
            back_leg = {
                "role": "Long Put (Back Month)",
                "option_type": "put",
                "strike": front_leg["strike"],
                "delta": front_leg.get("delta", 0.0),
                "theta": None,
                "vega": None,
                "bid": round(back_mid * 0.95, 2),
                "ask": round(back_mid * 1.05, 2),
                "mid": back_mid,
                "action": "buy",
                "signed_mid": -back_mid,
                "expiry": back_expiry,
            }
            legs.append(back_leg)

    elif strategy_key == "put_front_ratio":
        long_put = make_leg("Long Put (OTM)", "put", -0.40, "buy")
        short1 = make_leg("Short Put (Further OTM) 1", "put", -0.20, "sell")
        if long_put:
            legs.append(long_put)
        if short1:
            legs.append(short1)
            legs.append({**short1, "role": "Short Put (Further OTM) 2"})

    elif strategy_key == "short_naked_call":
        leg = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        if leg:
            legs.append(leg)

    elif strategy_key == "short_call_vertical":
        short_leg = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        long_leg = make_leg("Long Call (further OTM)", "call", 0.16, "buy")
        for l in [short_leg, long_leg]:
            if l:
                legs.append(l)
        if not (short_leg and long_leg) or short_leg["strike"] >= long_leg["strike"]:
            return {"error": "Could not build valid vertical spread — strikes too close; options chain may be too sparse"}

    elif strategy_key == "reverse_jade_lizard":
        short_call = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        short_put = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        long_put = make_leg("Long Put (further OTM)", "put", -0.16, "buy")
        for l in [short_call, short_put, long_put]:
            if l:
                legs.append(l)

    elif strategy_key == "call_calendar":
        front_leg = make_leg("Short Call (Front Month)", "call", 0.50, "sell")
        if front_leg:
            front_leg["expiry"] = expiry
            legs.append(front_leg)
            back_mid = round(front_leg["mid"] * 1.6, 2)
            back_expiry = next(
                (e for e in sorted(expirations)
                 if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 28),
                expirations[-1] if expirations else expiry
            )
            back_leg = {
                "role": "Long Call (Back Month)",
                "option_type": "call",
                "strike": front_leg["strike"],
                "delta": front_leg.get("delta", 0.0),
                "theta": None,
                "vega": None,
                "bid": round(back_mid * 0.95, 2),
                "ask": round(back_mid * 1.05, 2),
                "mid": back_mid,
                "action": "buy",
                "signed_mid": -back_mid,
                "expiry": back_expiry,
            }
            legs.append(back_leg)

    elif strategy_key == "call_front_ratio":
        long_call = make_leg("Long Call (OTM)", "call", 0.40, "buy")
        short1 = make_leg("Short Call (Further OTM) 1", "call", 0.20, "sell")
        if long_call:
            legs.append(long_call)
        if short1:
            legs.append(short1)
            legs.append({**short1, "role": "Short Call (Further OTM) 2"})

    elif strategy_key == "put_broken_wing_butterfly":
        long_put = make_leg("Long Put (ATM)", "put", -0.50, "buy")
        short_put1 = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        wing = make_leg("Long Put (wide wing)", "put", -0.10, "buy")
        for l in [long_put, short_put1, wing]:
            if l:
                legs.append(l)
        if short_put1:
            legs.append({**short_put1, "role": "Short Put (OTM) 2"})

    elif strategy_key == "call_broken_wing_butterfly":
        long_call = make_leg("Long Call (ATM)", "call", 0.50, "buy")
        short_call1 = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        wing = make_leg("Long Call (wide wing)", "call", 0.10, "buy")
        for l in [long_call, short_call1, wing]:
            if l:
                legs.append(l)
        if short_call1:
            legs.append({**short_call1, "role": "Short Call (OTM) 2"})

    elif strategy_key == "covered_put":
        leg = make_leg("Short Put (ATM/OTM)", "put", -0.30, "sell")
        if leg:
            legs.append(leg)
        legs.append({
            "role": "Short Stock",
            "option_type": "stock",
            "strike": spot_price,
            "delta": -1.0,
            "bid": spot_price,
            "ask": spot_price,
            "mid": spot_price,
            "action": "sell",
            "signed_mid": spot_price,
        })

    elif strategy_key == "call_zebra":
        long1 = make_leg("Long Call (ITM) 1", "call", 0.70, "buy")
        short_atm = make_leg("Short Call (ATM)", "call", 0.50, "sell")
        if long1:
            legs.append(long1)
            legs.append({**long1, "role": "Long Call (ITM) 2"})
        if short_atm:
            legs.append(short_atm)

    elif strategy_key == "put_zebra":
        long1 = make_leg("Long Put (ITM) 1", "put", -0.70, "buy")
        short_atm = make_leg("Short Put (ATM)", "put", -0.50, "sell")
        if long1:
            legs.append(long1)
            legs.append({**long1, "role": "Long Put (ITM) 2"})
        if short_atm:
            legs.append(short_atm)

    elif strategy_key == "poor_mans_covered_put":
        long_leg = make_leg("Long Put (LEAPS ITM)", "put", -0.70, "buy")
        short_leg = make_leg("Short Put (OTM front)", "put", -0.30, "sell")
        back_expiry_pmcp = next(
            (e for e in sorted(expirations)
             if e > expiry and (date.fromisoformat(e) - date.fromisoformat(expiry)).days >= 45),
            expirations[-1] if expirations else expiry
        )
        if long_leg:
            long_leg["expiry"] = back_expiry_pmcp
            legs.append(long_leg)
        if short_leg:
            short_leg["expiry"] = expiry
            legs.append(short_leg)

    elif strategy_key == "dynamic_width_iron_condor":
        short_put = make_leg("Short Put", "put", -0.16, "sell")
        long_put = make_leg("Long Put (wide wing)", "put", -0.05, "buy")
        short_call = make_leg("Short Call", "call", 0.16, "sell")
        long_call = make_leg("Long Call (wing)", "call", 0.08, "buy")
        for l in [short_put, long_put, short_call, long_call]:
            if l:
                legs.append(l)

    elif strategy_key == "call_broken_heart_butterfly":
        long_call_n = make_leg("Long Call (near OTM)", "call", 0.40, "buy")
        short_call_n = make_leg("Short Call (OTM)", "call", 0.30, "sell")
        short_call_w = make_leg("Short Call (further OTM)", "call", 0.20, "sell")
        long_call_w = make_leg("Long Call (wide wing)", "call", 0.10, "buy")
        for l in [long_call_n, short_call_n, short_call_w, long_call_w]:
            if l:
                legs.append(l)

    elif strategy_key == "put_broken_heart_butterfly":
        long_put_n = make_leg("Long Put (near OTM)", "put", -0.40, "buy")
        short_put_n = make_leg("Short Put (OTM)", "put", -0.30, "sell")
        short_put_w = make_leg("Short Put (further OTM)", "put", -0.20, "sell")
        long_put_w = make_leg("Long Put (wide wing)", "put", -0.10, "buy")
        for l in [long_put_n, short_put_n, short_put_w, long_put_w]:
            if l:
                legs.append(l)

    if not legs:
        return {"error": "Could not build legs — options chain may be empty or insufficient"}

    # Calculate net credit/debit (from perspective of trader; credit = positive)
    net = sum(
        (l["mid"] if l["action"] == "sell" else -l["mid"])
        for l in legs
        if l["option_type"] != "stock"
    )
    net = round(net, 2)

    # Determine max profit and max loss
    pop_estimate = None
    max_profit = None
    max_loss = None
    breakeven_low = None
    breakeven_high = None

    # Simplified heuristics per risk type
    short_strikes = [l["strike"] for l in legs if l["action"] == "sell" and l["option_type"] != "stock"]
    long_strikes = [l["strike"] for l in legs if l["action"] == "buy" and l["option_type"] != "stock"]

    if strat["risk_type"] == "DEFINED":
        # Width of spread as proxy for max loss
        if short_strikes and long_strikes:
            if strategy_key in ("iron_condor", "dynamic_width_iron_condor", "iron_fly"):
                # Max loss = wider individual spread width minus total credit.
                # Using the total outer-strike span would overstate max_loss by ~6×.
                put_strikes_all = [l["strike"] for l in legs if l["option_type"] == "put"]
                call_strikes_all = [l["strike"] for l in legs if l["option_type"] == "call"]
                put_w = abs(max(put_strikes_all) - min(put_strikes_all)) if put_strikes_all else 0.0
                call_w = abs(max(call_strikes_all) - min(call_strikes_all)) if call_strikes_all else 0.0
                spread_width = max(put_w, call_w)
                max_profit = round(net, 2)
                max_loss = round(spread_width - net, 2)
            elif strategy_key in (
                "call_butterfly",
                "put_butterfly",
                "call_broken_wing_butterfly",
                "put_broken_wing_butterfly",
                "call_broken_heart_butterfly",
                "put_broken_heart_butterfly",
            ):
                # For butterflies the body strike is the short strike(s).
                # Max profit zone is the INNER span (body to nearest wing),
                # not the full outer span which would double-count it.
                body = min(short_strikes)
                inner_lower = body - min(long_strikes)   # lower wing distance
                inner_upper = max(long_strikes) - body   # upper wing distance
                inner_width = min(inner_lower, inner_upper)
                max_profit = round(inner_width + net, 2)  # works for credit and debit
                raw_loss = round(max(inner_lower, inner_upper) - inner_width - net, 2)
                max_loss = max(raw_loss, 0)
            elif strategy_key in ("call_zebra", "put_zebra"):
                # A 2:1 back-ratio spread has a DEFINED max loss (the debit paid if the
                # underlying moves against both long legs) but UNLIMITED profit potential
                # above the short strike, where the net position behaves like a synthetic
                # long call (call_zebra) or long put (put_zebra).
                # Setting max_profit = None signals unlimited upside, consistent with how
                # the engine handles other unlimited-upside structures.
                max_profit = None
                max_loss = round(-net, 2)
            else:
                width = abs(
                    max(short_strikes + long_strikes) - min(short_strikes + long_strikes)
                )
                if net >= 0:  # credit spread
                    max_profit = net
                    max_loss = round(width - net, 2)
                else:  # debit spread
                    max_profit = round(width + net, 2)  # net is negative for debit
                    max_loss = round(-net, 2)
        else:
            max_profit = abs(net)
            max_loss = abs(net) * 2
    else:
        # Undefined risk
        max_profit = abs(net) if net >= 0 else None
        max_loss = None  # theoretically unlimited

    # PoP estimate: use 1 - abs(delta of short strike) for single-leg, average for multi
    short_legs = [l for l in legs if l["action"] == "sell" and l["option_type"] != "stock"]
    if short_legs:
        avg_short_delta = sum(abs(l["delta"]) for l in short_legs) / len(short_legs)
        pop_estimate = round((1 - avg_short_delta) * 100, 1)
    else:
        pop_estimate = round(sum(strat["pop_range"]) / 2, 1)

    # Breakevens
    if strategy_key in ("short_naked_put",) and short_strikes:
        breakeven_low = round(min(short_strikes) - abs(net), 2)
    elif strategy_key in ("short_naked_call",) and short_strikes:
        breakeven_high = round(max(short_strikes) + abs(net), 2)
    elif strategy_key in ("short_strangle", "short_straddle", "iron_condor", "dynamic_width_iron_condor", "iron_fly") and short_strikes:
        low_strike = min(short_strikes)
        high_strike = max(short_strikes)
        breakeven_low = round(low_strike - abs(net), 2)
        breakeven_high = round(high_strike + abs(net), 2)

    tastylive_profit_target = None
    if max_profit is not None:
        tastylive_profit_target = round(max_profit * strat["profit_target_pct"] / 100, 2)

    # For calendar spreads: max_loss = debit, max_profit ≈ front premium (synthetic estimate)
    if strategy_key in ("call_calendar", "put_calendar") and legs:
        front = next((l for l in legs if "Front" in l.get("role", "")), None)
        if front:
            max_loss = round(abs(net), 2)
            max_profit = round(front["mid"], 2)
            if max_profit > 0:
                tastylive_profit_target = round(max_profit * strat["profit_target_pct"] / 100, 2)

    # Guard 1 — negative or zero max_profit: strategy can never be profitable.
    if max_profit is not None and max_profit <= 0:
        return None

    # Clean up internal fields; preserve per-leg expiry for multi-expiry strategies
    clean_legs = []
    for l in legs:
        leg_out = {
            "role": l["role"],
            "option_type": l["option_type"],
            "strike": l["strike"],
            "delta": l["delta"],
            "gamma": l.get("gamma"),
            "theta": l.get("theta"),
            "vega": l.get("vega"),
            "bid": l["bid"],
            "ask": l["ask"],
            "mid": l["mid"],
            "action": l["action"],
        }
        if "expiry" in l:
            leg_out["expiry"] = l["expiry"]
        clean_legs.append(leg_out)

    # Net position greeks of the selected strikes, plus the strategy's expected
    # greek profile from the tastylive guide so the frontend can show whether the
    # built trade matches the intended risk profile.
    net_greeks = compute_net_greeks(legs)

    return {
        "strategy": strat["name"],
        "strategy_key": strategy_key,
        "expiry": expiry,
        "legs": clean_legs,
        "max_profit": max_profit,
        "max_loss": max_loss,
        "estimated_credit_or_debit": net,
        "pop_estimate": pop_estimate,
        "breakeven_low": breakeven_low,
        "breakeven_high": breakeven_high,
        "tastylive_profit_target": tastylive_profit_target,
        "risk_type": strat["risk_type"],
        "profit_target_pct": strat["profit_target_pct"],
        "greek_profile": strat.get("greek_profile"),
        "net_greeks": net_greeks,
        "earnings_adjusted": earnings_adjusted,
        "earnings_note": earnings_note,
    }

-- Migration 018: add profit_target_pct to strategy_catalog
--
-- This column brings profit_target_pct under the same migration-first governance
-- as direction, iv_environment, complexity, dte, and pop — preventing silent drift
-- in strategy_engine.py.  Any future change to a strategy's profit target MUST be
-- accompanied by a migration that updates this table FIRST, followed by the matching
-- edit to the STRATEGIES dict in backend/services/strategy_engine.py.
--
-- Source of truth: strategy_engine.py as audited on 2026-06-20.
-- Values: 25 % for high-precision structures (butterflies, calendars, ZEBRAs,
--          straddle, iron fly, big lizard / reverse big lizard);
--          50 % for all remaining strategies.

ALTER TABLE public.strategy_catalog
    ADD COLUMN IF NOT EXISTS profit_target_pct int not null default 50;

-- ── profit_target_pct = 25 ─────────────────────────────────────────────────
UPDATE public.strategy_catalog
SET    profit_target_pct = 25,
       updated_at        = now()
WHERE  slug IN (
    'call_zebra',
    'put_zebra',
    'call_calendar',
    'put_calendar',
    'call_butterfly',
    'put_butterfly',
    'big_lizard',
    'reverse_big_lizard',
    'short_straddle',
    'iron_fly'
);

-- ── profit_target_pct = 50 ─────────────────────────────────────────────────
UPDATE public.strategy_catalog
SET    profit_target_pct = 50,
       updated_at        = now()
WHERE  slug IN (
    'covered_call',
    'covered_put',
    'long_call_vertical',
    'long_put_vertical',
    'poor_mans_covered_call',
    'poor_mans_covered_put',
    'put_front_ratio',
    'call_front_ratio',
    'put_broken_wing_butterfly',
    'call_broken_wing_butterfly',
    'call_broken_heart_butterfly',
    'put_broken_heart_butterfly',
    'short_strangle',
    'iron_condor',
    'dynamic_width_iron_condor',
    'short_naked_put',
    'short_put_vertical',
    'jade_lizard',
    'short_naked_call',
    'short_call_vertical',
    'reverse_jade_lizard'
);

comment on column public.strategy_catalog.profit_target_pct is
    'Percentage of max profit at which the tastylive management rule closes the position. '
    'Source: strategy_engine.py STRATEGIES dict. Governed by migration-first policy.';

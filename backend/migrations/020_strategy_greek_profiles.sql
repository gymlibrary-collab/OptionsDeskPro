-- Migration 020: add greek profile columns to strategy_catalog
--
-- Brings the four position-greek signs (delta, gamma, theta, vega) under the same
-- migration-first governance as direction, iv_environment, complexity, dte, pop,
-- and profit_target_pct. Any future change to a strategy's intended greek profile
-- MUST be made here FIRST, then mirrored into the GREEK_PROFILES dict in
-- backend/services/strategy_engine.py.
--
-- These signs describe the INTENDED risk profile of each structure:
--   delta — directional exposure (long = bullish, short = bearish, flat = neutral)
--   gamma — rate of change of delta as the underlying moves
--   theta — time decay (long = decay works for you, short = against you)
--   vega  — volatility exposure (long = profits from IV rise, short = from IV fall)
-- "dynamic" means the greek flips sign across the structure's strikes (back-ratios
-- and butterflies) and cannot be summarised by a single static sign.
--
-- Source of truth: tastylive Options Strategy Guide (2023), the EXAMPLE box on
-- each strategy's page. Codified in strategy_engine.py GREEK_PROFILES.

ALTER TABLE public.strategy_catalog
    ADD COLUMN IF NOT EXISTS greek_delta text,
    ADD COLUMN IF NOT EXISTS greek_gamma text,
    ADD COLUMN IF NOT EXISTS greek_theta text,
    ADD COLUMN IF NOT EXISTS greek_vega  text;

-- ── Bullish ──────────────────────────────────────────────────────────────────
UPDATE public.strategy_catalog SET greek_delta='long',         greek_gamma='dynamic', greek_theta='long',  greek_vega='short', updated_at=now() WHERE slug='covered_call';
UPDATE public.strategy_catalog SET greek_delta='long',         greek_gamma='flat',    greek_theta='flat',  greek_vega='flat',  updated_at=now() WHERE slug='long_call_vertical';
UPDATE public.strategy_catalog SET greek_delta='long/dynamic', greek_gamma='dynamic', greek_theta='flat',  greek_vega='flat',  updated_at=now() WHERE slug='call_zebra';
UPDATE public.strategy_catalog SET greek_delta='long',         greek_gamma='dynamic', greek_theta='flat',  greek_vega='long',  updated_at=now() WHERE slug='poor_mans_covered_call';
UPDATE public.strategy_catalog SET greek_delta='long',         greek_gamma='dynamic', greek_theta='short', greek_vega='long',  updated_at=now() WHERE slug='call_calendar';
UPDATE public.strategy_catalog SET greek_delta='long/dynamic', greek_gamma='dynamic', greek_theta='short', greek_vega='long',  updated_at=now() WHERE slug='call_butterfly';
UPDATE public.strategy_catalog SET greek_delta='long',         greek_gamma='short',   greek_theta='long',  greek_vega='short', updated_at=now() WHERE slug='big_lizard';

-- ── Bearish ──────────────────────────────────────────────────────────────────
UPDATE public.strategy_catalog SET greek_delta='short',         greek_gamma='dynamic', greek_theta='long',  greek_vega='short', updated_at=now() WHERE slug='covered_put';
UPDATE public.strategy_catalog SET greek_delta='short',         greek_gamma='flat',    greek_theta='flat',  greek_vega='flat',  updated_at=now() WHERE slug='long_put_vertical';
UPDATE public.strategy_catalog SET greek_delta='short/dynamic', greek_gamma='dynamic', greek_theta='flat',  greek_vega='flat',  updated_at=now() WHERE slug='put_zebra';
UPDATE public.strategy_catalog SET greek_delta='short',         greek_gamma='dynamic', greek_theta='flat',  greek_vega='long',  updated_at=now() WHERE slug='poor_mans_covered_put';
UPDATE public.strategy_catalog SET greek_delta='short',         greek_gamma='dynamic', greek_theta='short', greek_vega='long',  updated_at=now() WHERE slug='put_calendar';
UPDATE public.strategy_catalog SET greek_delta='short/dynamic', greek_gamma='dynamic', greek_theta='short', greek_vega='long',  updated_at=now() WHERE slug='put_butterfly';
UPDATE public.strategy_catalog SET greek_delta='short',         greek_gamma='short',   greek_theta='long',  greek_vega='short', updated_at=now() WHERE slug='reverse_big_lizard';

-- ── Omnidirectional ──────────────────────────────────────────────────────────
UPDATE public.strategy_catalog SET greek_delta='long/dynamic',  greek_gamma='dynamic', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='put_front_ratio';
UPDATE public.strategy_catalog SET greek_delta='short/dynamic', greek_gamma='dynamic', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='call_front_ratio';
UPDATE public.strategy_catalog SET greek_delta='long/dynamic',  greek_gamma='dynamic', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='put_broken_wing_butterfly';
UPDATE public.strategy_catalog SET greek_delta='short/dynamic', greek_gamma='dynamic', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='call_broken_wing_butterfly';
UPDATE public.strategy_catalog SET greek_delta='flat/dynamic',  greek_gamma='dynamic', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='call_broken_heart_butterfly';
UPDATE public.strategy_catalog SET greek_delta='flat/dynamic',  greek_gamma='dynamic', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='put_broken_heart_butterfly';

-- ── Neutral ──────────────────────────────────────────────────────────────────
UPDATE public.strategy_catalog SET greek_delta='flat', greek_gamma='short', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='short_strangle';
UPDATE public.strategy_catalog SET greek_delta='flat', greek_gamma='short', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='short_straddle';
UPDATE public.strategy_catalog SET greek_delta='flat', greek_gamma='flat',  greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='iron_condor';
UPDATE public.strategy_catalog SET greek_delta='flat', greek_gamma='flat',  greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='dynamic_width_iron_condor';
UPDATE public.strategy_catalog SET greek_delta='flat', greek_gamma='flat',  greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='iron_fly';

-- ── Neutral-Bullish ──────────────────────────────────────────────────────────
UPDATE public.strategy_catalog SET greek_delta='long', greek_gamma='short', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='short_naked_put';
UPDATE public.strategy_catalog SET greek_delta='long', greek_gamma='flat',  greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='short_put_vertical';
UPDATE public.strategy_catalog SET greek_delta='long', greek_gamma='short', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='jade_lizard';

-- ── Neutral-Bearish ──────────────────────────────────────────────────────────
UPDATE public.strategy_catalog SET greek_delta='short', greek_gamma='short', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='short_naked_call';
UPDATE public.strategy_catalog SET greek_delta='short', greek_gamma='flat',  greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='short_call_vertical';
UPDATE public.strategy_catalog SET greek_delta='short', greek_gamma='short', greek_theta='long', greek_vega='short', updated_at=now() WHERE slug='reverse_jade_lizard';

comment on column public.strategy_catalog.greek_delta is
    'Intended net delta sign (long/short/flat/dynamic). Source: tastylive Options Strategy Guide 2023. Mirrored in strategy_engine.py GREEK_PROFILES. Migration-first governance.';
comment on column public.strategy_catalog.greek_gamma is
    'Intended net gamma sign (long/short/flat/dynamic). Source: tastylive Options Strategy Guide 2023. Mirrored in strategy_engine.py GREEK_PROFILES. Migration-first governance.';
comment on column public.strategy_catalog.greek_theta is
    'Intended net theta sign (long/short/flat/dynamic). Source: tastylive Options Strategy Guide 2023. Mirrored in strategy_engine.py GREEK_PROFILES. Migration-first governance.';
comment on column public.strategy_catalog.greek_vega is
    'Intended net vega sign (long/short/flat/dynamic). Source: tastylive Options Strategy Guide 2023. Mirrored in strategy_engine.py GREEK_PROFILES. Migration-first governance.';

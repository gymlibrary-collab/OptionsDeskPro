-- Migration 016: strategy_catalog
--
-- Creates the canonical 31-strategy reference table drawn from the tastylive
-- Options Strategy Guide (2023) as codified in docs/strategy-selection-spec.md.
--
-- This table is the SOURCE OF TRUTH for selection-tier attributes
-- (direction, iv_environment, complexity, dte, pop, family).
-- backend/services/strategy_engine.py MIRRORS these values in the STRATEGIES
-- dict. Any change to strategy metadata MUST be accompanied by a migration
-- that updates this table FIRST.
--
-- Governance rule (enforced by convention):
--   1. Propose change via a new migration to strategy_catalog.
--   2. Apply the migration.
--   3. Update strategy_engine.py to match.
--   No code PR that changes STRATEGIES is valid without a corresponding
--   migration that updates this table.

create table if not exists strategy_catalog (
    slug                text        primary key,
    name                text        not null,
    category            text        not null,   -- bullish / bearish / neutral / neutral_bullish / neutral_bearish / omnidirectional
    direction           text[]      not null,   -- bias tags that score this strategy
    iv_environment      text[]      not null,   -- HIGH / LOW / MEDIUM / ANY subset
    dte_min             int,                    -- null = no lower bound (ANY)
    dte_max             int,                    -- null = no upper bound (ANY)
    pop_low             int,                    -- null = N/A (calendar spreads)
    pop_high            int,                    -- null = N/A (calendar spreads)
    family              text        not null,   -- P&L formula family (§7 of spec)
    complexity          int         not null check (complexity between 1 and 3),
    is_active           boolean     not null default true,
    spec_notes          text,                   -- documents deliberate divergences from literal guide
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table strategy_catalog is
    'Canonical 31-strategy reference from docs/strategy-selection-spec.md. '
    'strategy_engine.py STRATEGIES dict must mirror this table. '
    'Source: tastylive Options Strategy Guide 2023.';

-- ── Bullish ────────────────────────────────────────────────────────────────
insert into strategy_catalog (slug, name, category, direction, iv_environment, dte_min, dte_max, pop_low, pop_high, family, complexity) values
('covered_call',          'Covered Call',                   'bullish',          array['BULLISH'],                                                   array['HIGH'],               45,   45,   50, 70, 'covered',               1),
('long_call_vertical',    'Long Call Vertical Spread',      'bullish',          array['BULLISH'],                                                   array['LOW','MEDIUM','HIGH'], 45,   45,   40, 60, 'debit_spread',          1),
('call_zebra',            'Call ZEBRA',                     'bullish',          array['BULLISH'],                                                   array['LOW','MEDIUM','HIGH'], null, null, 50, 50, 'long_debit',            2),
('poor_mans_covered_call','Poor Man''s Covered Call',       'bullish',          array['BULLISH'],                                                   array['LOW'],                45,   60,   50, 60, 'diagonal',              2),
('call_calendar',         'Call Calendar Spread',           'bullish',          array['NEUTRAL_BULLISH'],                                           array['LOW','MEDIUM'],       45,   45,   null, null, 'calendar',           2),
('call_butterfly',        'Call Butterfly',                 'bullish',          array['BULLISH'],                                                   array['LOW','MEDIUM','HIGH'], 15,   45,   20, 40, 'butterfly',             3),
('big_lizard',            'Big Lizard',                     'bullish',          array['BULLISH'],                                                   array['HIGH'],               45,   45,   60, 80, 'naked_with_spread',     3)
on conflict (slug) do update set
    name           = excluded.name,
    category       = excluded.category,
    direction      = excluded.direction,
    iv_environment = excluded.iv_environment,
    dte_min        = excluded.dte_min,
    dte_max        = excluded.dte_max,
    pop_low        = excluded.pop_low,
    pop_high       = excluded.pop_high,
    family         = excluded.family,
    complexity     = excluded.complexity,
    updated_at     = now();

-- ── Bearish ────────────────────────────────────────────────────────────────
insert into strategy_catalog (slug, name, category, direction, iv_environment, dte_min, dte_max, pop_low, pop_high, family, complexity) values
('covered_put',           'Covered Put',                    'bearish',          array['BEARISH'],                                                   array['HIGH'],               45,   45,   50, 70, 'covered',               1),
('long_put_vertical',     'Long Put Vertical Spread',       'bearish',          array['BEARISH'],                                                   array['LOW','MEDIUM','HIGH'], 45,   45,   50, 60, 'debit_spread',          1),
('put_zebra',             'Put ZEBRA',                      'bearish',          array['BEARISH'],                                                   array['LOW','MEDIUM','HIGH'], null, null, 50, 50, 'long_debit',            2),
('poor_mans_covered_put', 'Poor Man''s Covered Put',        'bearish',          array['BEARISH'],                                                   array['LOW'],                45,   60,   50, 60, 'diagonal',              2),
('put_calendar',          'Put Calendar Spread',            'bearish',          array['NEUTRAL_BEARISH'],                                           array['LOW','MEDIUM'],       45,   45,   null, null, 'calendar',           2),
('put_butterfly',         'Put Butterfly',                  'bearish',          array['BEARISH'],                                                   array['LOW','MEDIUM','HIGH'], 15,   45,   20, 40, 'butterfly',             3),
('reverse_big_lizard',    'Reverse Big Lizard',             'bearish',          array['BEARISH'],                                                   array['HIGH'],               45,   45,   60, 80, 'naked_with_spread',     3)
on conflict (slug) do update set
    name           = excluded.name,
    category       = excluded.category,
    direction      = excluded.direction,
    iv_environment = excluded.iv_environment,
    dte_min        = excluded.dte_min,
    dte_max        = excluded.dte_max,
    pop_low        = excluded.pop_low,
    pop_high       = excluded.pop_high,
    family         = excluded.family,
    complexity     = excluded.complexity,
    updated_at     = now();

-- ── Omnidirectional ────────────────────────────────────────────────────────
insert into strategy_catalog (slug, name, category, direction, iv_environment, dte_min, dte_max, pop_low, pop_high, family, complexity, spec_notes) values
('put_front_ratio',              'Put Front-Ratio Spread',         'omnidirectional',  array['OMNIDIRECTIONAL'],                                           array['HIGH'],               15,   45,   60, 80, 'ratio_spread',          3, null),
('call_front_ratio',             'Call Front-Ratio Spread',        'omnidirectional',  array['OMNIDIRECTIONAL'],                                           array['HIGH'],               15,   45,   60, 80, 'ratio_spread',          3, null),
('put_broken_wing_butterfly',    'Put Broken Wing Butterfly',      'omnidirectional',  array['NEUTRAL','NEUTRAL_BULLISH','OMNIDIRECTIONAL'],                array['HIGH'],               15,   45,   60, 80, 'broken_wing_butterfly', 3, 'direction expanded beyond guide literal OMNIDIRECTIONAL to also match NEUTRAL and NEUTRAL_BULLISH market conditions'),
('call_broken_wing_butterfly',   'Call Broken Wing Butterfly',     'omnidirectional',  array['NEUTRAL','NEUTRAL_BEARISH','OMNIDIRECTIONAL'],                array['HIGH'],               15,   45,   60, 80, 'broken_wing_butterfly', 3, 'direction expanded beyond guide literal OMNIDIRECTIONAL to also match NEUTRAL and NEUTRAL_BEARISH market conditions'),
('call_broken_heart_butterfly',  'Call Broken Heart Butterfly',    'omnidirectional',  array['OMNIDIRECTIONAL'],                                           array['HIGH'],               45,   45,   60, 80, 'broken_wing_butterfly', 3, null),
('put_broken_heart_butterfly',   'Put Broken Heart Butterfly',     'omnidirectional',  array['OMNIDIRECTIONAL'],                                           array['HIGH'],               45,   45,   60, 80, 'broken_wing_butterfly', 3, null)
on conflict (slug) do update set
    name           = excluded.name,
    category       = excluded.category,
    direction      = excluded.direction,
    iv_environment = excluded.iv_environment,
    dte_min        = excluded.dte_min,
    dte_max        = excluded.dte_max,
    pop_low        = excluded.pop_low,
    pop_high       = excluded.pop_high,
    family         = excluded.family,
    complexity     = excluded.complexity,
    spec_notes     = excluded.spec_notes,
    updated_at     = now();

-- ── Neutral ────────────────────────────────────────────────────────────────
insert into strategy_catalog (slug, name, category, direction, iv_environment, dte_min, dte_max, pop_low, pop_high, family, complexity) values
('short_strangle',              'Short Strangle',                  'neutral',          array['NEUTRAL'],                                                   array['HIGH'],               45,   45,   60, 80, 'naked_double',          2),
('short_straddle',              'Short Straddle',                  'neutral',          array['NEUTRAL'],                                                   array['HIGH'],               45,   45,   50, 60, 'naked_double',          2),
('iron_condor',                 'Iron Condor',                     'neutral',          array['NEUTRAL'],                                                   array['HIGH'],               45,   45,   60, 80, 'iron_condor',           2),
('dynamic_width_iron_condor',   'Dynamic Width Iron Condor',       'neutral',          array['NEUTRAL'],                                                   array['HIGH'],               45,   45,   60, 80, 'iron_condor',           2),
('iron_fly',                    'Iron Fly',                        'neutral',          array['NEUTRAL'],                                                   array['HIGH'],               45,   45,   60, 80, 'iron_fly',              2)
on conflict (slug) do update set
    name           = excluded.name,
    category       = excluded.category,
    direction      = excluded.direction,
    iv_environment = excluded.iv_environment,
    dte_min        = excluded.dte_min,
    dte_max        = excluded.dte_max,
    pop_low        = excluded.pop_low,
    pop_high       = excluded.pop_high,
    family         = excluded.family,
    complexity     = excluded.complexity,
    updated_at     = now();

-- ── Neutral-Bullish ────────────────────────────────────────────────────────
insert into strategy_catalog (slug, name, category, direction, iv_environment, dte_min, dte_max, pop_low, pop_high, family, complexity) values
('short_naked_put',     'Short Naked Put',                'neutral_bullish',   array['NEUTRAL_BULLISH'],                                           array['HIGH'],               45,   45,   60, 80, 'naked_single',          1),
('short_put_vertical',  'Short Put Vertical Spread',      'neutral_bullish',   array['NEUTRAL_BULLISH'],                                           array['HIGH'],               45,   45,   60, 80, 'credit_spread',         1),
('jade_lizard',         'Jade Lizard',                    'neutral_bullish',   array['NEUTRAL_BULLISH'],                                           array['HIGH'],               45,   45,   60, 80, 'naked_with_spread',     3)
on conflict (slug) do update set
    name           = excluded.name,
    category       = excluded.category,
    direction      = excluded.direction,
    iv_environment = excluded.iv_environment,
    dte_min        = excluded.dte_min,
    dte_max        = excluded.dte_max,
    pop_low        = excluded.pop_low,
    pop_high       = excluded.pop_high,
    family         = excluded.family,
    complexity     = excluded.complexity,
    updated_at     = now();

-- ── Neutral-Bearish ────────────────────────────────────────────────────────
insert into strategy_catalog (slug, name, category, direction, iv_environment, dte_min, dte_max, pop_low, pop_high, family, complexity) values
('short_naked_call',    'Short Naked Call',               'neutral_bearish',   array['NEUTRAL_BEARISH'],                                           array['HIGH'],               45,   45,   60, 80, 'naked_single',          1),
('short_call_vertical', 'Short Call Vertical Spread',     'neutral_bearish',   array['NEUTRAL_BEARISH'],                                           array['HIGH'],               45,   45,   60, 80, 'credit_spread',         1),
('reverse_jade_lizard', 'Reverse Jade Lizard',            'neutral_bearish',   array['NEUTRAL_BEARISH'],                                           array['HIGH'],               45,   45,   60, 80, 'naked_with_spread',     3)
on conflict (slug) do update set
    name           = excluded.name,
    category       = excluded.category,
    direction      = excluded.direction,
    iv_environment = excluded.iv_environment,
    dte_min        = excluded.dte_min,
    dte_max        = excluded.dte_max,
    pop_low        = excluded.pop_low,
    pop_high       = excluded.pop_high,
    family         = excluded.family,
    complexity     = excluded.complexity,
    updated_at     = now();

-- Deactivate any legacy slugs that were removed from the 31-strategy spec.
-- These rows are kept for historical reference but excluded from scoring.
update strategy_catalog
set    is_active  = false,
       updated_at = now()
where  slug in ('long_call', 'long_put', 'collar', 'long_strangle', 'long_straddle',
                'call_diagonal', 'put_diagonal', 'call_ratio_spread', 'put_ratio_spread')
  and  slug not in (select slug from strategy_catalog where slug in (
       'covered_call','long_call_vertical','call_zebra','poor_mans_covered_call',
       'call_calendar','call_butterfly','big_lizard','covered_put','long_put_vertical',
       'put_zebra','poor_mans_covered_put','put_calendar','put_butterfly','reverse_big_lizard',
       'put_front_ratio','call_front_ratio','put_broken_wing_butterfly','call_broken_wing_butterfly',
       'call_broken_heart_butterfly','put_broken_heart_butterfly','short_strangle','short_straddle',
       'iron_condor','dynamic_width_iron_condor','iron_fly','short_naked_put','short_put_vertical',
       'jade_lizard','short_naked_call','short_call_vertical','reverse_jade_lizard'
  ));

-- Fix catalog to match tastylive Options Strategy Guide 2023 (PDF) strictly.
--
-- Corrections applied:
--   call_calendar:           direction BULLISH (was NEUTRAL_BULLISH), iv_environment LOW only (was LOW+MEDIUM), dte 45
--   put_calendar:            direction BEARISH (was NEUTRAL_BEARISH), iv_environment LOW only (was LOW+MEDIUM), dte 45
--   put_broken_wing_butterfly:  direction OMNIDIRECTIONAL only (removed NEUTRAL, NEUTRAL_BULLISH expansion)
--   call_broken_wing_butterfly: direction OMNIDIRECTIONAL only (removed NEUTRAL, NEUTRAL_BEARISH expansion)
--
-- Source of truth: tastylive Options Strategy Guide 2023, pages 9, 16, 21, 22.

UPDATE public.strategy_catalog
SET
  direction      = array['BULLISH'],
  iv_environment = array['LOW'],
  dte_min        = 45,
  dte_max        = 45,
  updated_at     = now()
WHERE slug = 'call_calendar';

UPDATE public.strategy_catalog
SET
  direction      = array['BEARISH'],
  iv_environment = array['LOW'],
  dte_min        = 45,
  dte_max        = 45,
  updated_at     = now()
WHERE slug = 'put_calendar';

UPDATE public.strategy_catalog
SET
  direction  = array['OMNIDIRECTIONAL'],
  updated_at = now()
WHERE slug IN ('put_broken_wing_butterfly', 'call_broken_wing_butterfly');

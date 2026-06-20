-- Fix call_calendar and put_calendar to match tastylive Options Strategy Guide 2023 (PDF).
--
-- Corrections:
--   call_calendar: direction BULLISH (was NEUTRAL_BULLISH), iv_environment LOW only (was LOW+MEDIUM)
--   put_calendar:  direction BEARISH (was NEUTRAL_BEARISH), iv_environment LOW only (was LOW+MEDIUM)
--   Both: dte_min/dte_max corrected to 45 (was 30/45 → now 45/45)
--
-- Source of truth: tastylive Options Strategy Guide 2023, pages 9 (Call Calendar) and 16 (Put Calendar).

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

-- Migration 019: Set pop_low=50, pop_high=50 for calendar spreads.
-- Previously null (N/A per PDF). Standardised to 50% per product decision.
update strategy_catalog
set    pop_low  = 50,
       pop_high = 50,
       updated_at = now()
where  slug in ('call_calendar', 'put_calendar');

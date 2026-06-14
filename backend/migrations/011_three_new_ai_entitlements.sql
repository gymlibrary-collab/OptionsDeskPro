-- Migration 011: Add news_sentiment, morning_briefing, ai_strategy_comparison
-- entitlement keys to all four tier plans.
-- These three features were previously free-for-all (no gate).
-- After this migration the platform admin can configure them per tier.

UPDATE public.plans
SET features_json = features_json ||
    '{"news_sentiment": false, "morning_briefing": false, "ai_strategy_comparison": false}'::jsonb
WHERE tier_key IN ('free', 'starter');

UPDATE public.plans
SET features_json = features_json ||
    '{"news_sentiment": true, "morning_briefing": true, "ai_strategy_comparison": true}'::jsonb
WHERE tier_key IN ('pro', 'enterprise');

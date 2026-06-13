-- Migration 009: AI feature gates in plans features_json
-- Sets ai_narrative, ai_chat, ai_risk_summary, ai_strategy_reasoning,
-- ai_earnings_awareness to false for free/starter and true for pro/enterprise.
-- Run this against Supabase SQL editor or via the Supabase CLI.

UPDATE public.plans
SET features_json = '{"trading_desk":false,"positions":false,"risk_monitor":false,"ai_narrative":false,"ai_chat":false,"ai_risk_summary":false,"ai_strategy_reasoning":false,"ai_earnings_awareness":false}'
WHERE tier_key = 'free';

UPDATE public.plans
SET features_json = '{"trading_desk":false,"positions":true,"risk_monitor":false,"ai_narrative":false,"ai_chat":false,"ai_risk_summary":false,"ai_strategy_reasoning":false,"ai_earnings_awareness":false}'
WHERE tier_key = 'starter';

UPDATE public.plans
SET features_json = '{"trading_desk":true,"positions":true,"risk_monitor":false,"ai_narrative":true,"ai_chat":true,"ai_risk_summary":true,"ai_strategy_reasoning":true,"ai_earnings_awareness":true}'
WHERE tier_key = 'pro';

UPDATE public.plans
SET features_json = '{"trading_desk":true,"positions":true,"risk_monitor":true,"ai_narrative":true,"ai_chat":true,"ai_risk_summary":true,"ai_strategy_reasoning":true,"ai_earnings_awareness":true}'
WHERE tier_key = 'enterprise';

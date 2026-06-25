-- Migration 024: extend user_action_log action_type CHECK constraint
-- Adds: tc_acknowledged, ai_features_enabled
-- Safe to run multiple times (idempotent via DO block).

DO $$
BEGIN
  -- Drop the inline constraint created by migration 015.
  -- Name is the Postgres default: <table>_<col>_check.
  ALTER TABLE public.user_action_log
    DROP CONSTRAINT IF EXISTS user_action_log_action_type_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Drop the new named constraint if it already exists (full idempotency).
DO $$
BEGIN
  ALTER TABLE public.user_action_log
    DROP CONSTRAINT IF EXISTS user_action_log_action_type_valid;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add a new, explicitly-named constraint with the full value set.
ALTER TABLE public.user_action_log
  ADD CONSTRAINT user_action_log_action_type_valid
  CHECK (
    action_type IN (
      'login',
      'logout',
      'ticker_search',
      'strategy_scan',
      'options_chain_view',
      'paper_trade_placed',
      'watchlist_update',
      'ai_query',
      'tc_acknowledged',
      'ai_features_enabled'
    )
  );

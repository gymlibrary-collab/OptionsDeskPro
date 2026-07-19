-- Migration 025: Position lifecycle & Risk Monitor improvements
-- 1. Adds leg_role to orders to distinguish open vs close legs
-- 2. Adds settlement_metadata JSONB for P&L data on closed orders
-- 3. Extends user_action_log action_type CHECK to include position_auto_settled
-- Safe to run multiple times (idempotent via IF NOT EXISTS / DO blocks).

-- ── Orders table extensions ──────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS leg_role text,
  ADD COLUMN IF NOT EXISTS settlement_metadata JSONB;

-- leg_role values: 'open' | 'close' | 'auto_settled' | NULL (legacy rows)
-- settlement_metadata shape for auto_settled orders:
--   { "source": "market"|"intrinsic"|"worthless",
--     "entry_avg_cost": <numeric>,
--     "entry_action": "buy"|"sell",
--     "entry_quantity": <signed integer>,
--     "realised_pnl": <numeric> }
-- settlement_metadata shape for manual close orders:
--   { "source": null,
--     "entry_avg_cost": <numeric>,
--     "entry_action": "buy"|"sell" }

-- ── user_action_log CHECK constraint extension ───────────────────────────────

DO $$
BEGIN
  ALTER TABLE public.user_action_log
    DROP CONSTRAINT IF EXISTS user_action_log_action_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.user_action_log
    DROP CONSTRAINT IF EXISTS user_action_log_action_type_valid;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.user_action_log
  ADD CONSTRAINT user_action_log_action_type_valid
  CHECK (action_type IN (
    'login',
    'logout',
    'ticker_search',
    'strategy_scan',
    'options_chain_view',
    'paper_trade_placed',
    'watchlist_update',
    'ai_query',
    'tc_acknowledged',
    'ai_features_enabled',
    'position_auto_settled'
  ));

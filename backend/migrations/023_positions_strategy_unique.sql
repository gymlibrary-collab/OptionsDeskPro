-- Migration 023: broaden the positions uniqueness constraint to include strategy_key
--
-- The original constraint (user_id, symbol, expiry, strike, option_type) assumed
-- one row per contract per user. Now that positions are tracked per strategy, two
-- rows for the same contract under different strategies must be allowed.
--
-- COALESCE(strategy_key, 'manual') ensures that rows with a NULL strategy_key
-- (legacy data) are treated the same as rows with strategy_key = 'manual',
-- so the manual group still enforces its own uniqueness.

-- 1. Drop the old 5-column constraint
ALTER TABLE public.positions
  DROP CONSTRAINT IF EXISTS positions_user_id_symbol_expiry_strike_option_type_key;

-- 2. Add the new 6-column unique index (using COALESCE for NULL-safe strategy_key)
CREATE UNIQUE INDEX IF NOT EXISTS positions_user_contract_strategy_uidx
  ON public.positions (
    user_id,
    symbol,
    expiry,
    strike,
    option_type,
    COALESCE(strategy_key, 'manual')
  );

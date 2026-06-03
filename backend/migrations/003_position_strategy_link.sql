-- Migration 003: Link positions and orders to strategies for P&L monitoring
-- Run in Supabase → SQL Editor → New Query

-- Add strategy metadata to positions so P&L can be tracked against the
-- specific profit target recommended by the strategy engine.
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS strategy_key    text,
  ADD COLUMN IF NOT EXISTS strategy_name   text,
  ADD COLUMN IF NOT EXISTS profit_target_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS entry_action    text;   -- 'buy' | 'sell'

-- Store same metadata on the order for audit trail.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS strategy_key    text,
  ADD COLUMN IF NOT EXISTS strategy_name   text,
  ADD COLUMN IF NOT EXISTS profit_target_pct numeric(5,2);

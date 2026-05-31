-- Add role column to user_whitelist so invited users get the right role on first login.
-- Run in Supabase → SQL Editor

ALTER TABLE public.user_whitelist
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

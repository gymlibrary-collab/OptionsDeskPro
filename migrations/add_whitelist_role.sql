-- Add role column to user_whitelist so invited users can be assigned a role
-- at invite time. Existing rows default to 'user'.
-- Run this once in your Supabase dashboard → SQL Editor.

ALTER TABLE public.user_whitelist
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

-- =============================================================================
-- Migration 007: Onboarding backfill for pre-existing users
--
-- Migration 006 only marked the admin email as onboarding_completed = true.
-- All other users who existed before the SaaS conversion are pre-onboarding
-- (they never went through the new onboarding flow) and should be treated as
-- already complete so they are not forced through onboarding on next login.
--
-- Safe to re-run: UPDATE is idempotent.
-- =============================================================================

UPDATE public.user_profiles
SET onboarding_completed = true,
    onboarding_step       = 'complete'
WHERE created_at < now();

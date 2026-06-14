-- Migration 013: Harden publish_legal_version() SECURITY DEFINER function
--
-- SECURITY DEFINER functions run with the privileges of the function owner.
-- Without SET search_path = public, an attacker who can create schemas could
-- inject shadow objects into the search path and intercept the function's
-- table references. Adding this guard prevents search-path hijacking.
--
-- Ref: PostgreSQL docs § "Writing SECURITY DEFINER Functions Safely"
-- Security finding: F-04 from Gate 5 review (legal-terms-acknowledgment-14Jun2026)

ALTER FUNCTION public.publish_legal_version()
  SET search_path = public;

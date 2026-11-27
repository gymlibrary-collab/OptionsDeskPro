-- =============================================================================
-- Migration 026: lock the database against direct (browser) access
--
-- The Supabase project URL and anon key are public by design (they are compiled
-- into the frontend). Anyone holding them can call PostgREST directly, bypassing
-- the FastAPI backend, so row-level security is the ONLY barrier on the tables.
-- The backend uses the service-role key, which bypasses RLS entirely, and the
-- frontend never queries tables, so tightening RLS changes nothing for the app.
--
-- What this does (all idempotent, safe to re-run):
--   1. Drops every public-schema policy that lets anon/authenticated/public
--      INSERT, UPDATE, DELETE or do ALL. This removes:
--        - "service_all" on user_profiles (using (true) with check (true)):
--          anyone could read every profile and a logged-in user could set their
--          own role to 'admin';
--        - the FOR ALL "own rows" policies on portfolios, orders, positions,
--          pnl_snapshots, user_watchlists, scan_usage, ai_settings, stock_orders
--          (a subscriber could set their own cash balance, forge orders, ...);
--        - the INSERT policy on morning_briefings.
--   2. For each dropped FOR ALL policy that was scoped to the row owner, re-creates
--      a SELECT-only version (so reading your own rows directly still works).
--   3. Enables RLS on every public table that does not have it yet. A table with
--      RLS enabled and no policy is deny-all for anon/authenticated.
--
-- Not changed: SELECT-only policies (users_read_own, subscriptions_read_own,
-- invoices_read_own, la_select_own, ldv_select, ...).
--
-- Review the NOTICE output when running it in the SQL editor: it lists every
-- policy dropped and every table that had RLS switched on.
-- =============================================================================

DO $$
DECLARE
  p record;
  t record;
BEGIN
  -- 1 + 2: remove write-capable policies, keep owner-scoped read access
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, roles, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd <> 'SELECT'
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    RAISE NOTICE 'dropped policy % (%) on %.%', p.policyname, p.cmd, p.schemaname, p.tablename;

    IF p.cmd = 'ALL' AND p.qual IS NOT NULL AND btrim(p.qual) NOT IN ('true', '(true)') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING (%s)',
        left(p.policyname, 50) || '_select', p.schemaname, p.tablename, p.qual
      );
      RAISE NOTICE 'created read-only policy % on %.%', left(p.policyname, 50) || '_select', p.schemaname, p.tablename;
    END IF;
  END LOOP;

  -- 3: every public table gets RLS
  FOR t IN
    SELECT n.nspname AS schemaname, c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    RAISE NOTICE 'enabled RLS on %.%', t.schemaname, t.tablename;
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- Verification (run after the migration; both should return zero rows):
--
--   -- policies that still allow writes to non-service roles
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND cmd <> 'SELECT'
--     AND roles && ARRAY['public','anon','authenticated']::name[];
--
--   -- public tables without RLS
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
-- -----------------------------------------------------------------------------

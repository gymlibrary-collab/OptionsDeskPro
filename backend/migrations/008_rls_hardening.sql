-- =============================================================================
-- Migration 008: RLS hardening for service-role-only tables
--
-- Eight tables introduced in migration 006 were created without RLS enabled.
-- Without RLS, any authenticated user can read them directly via the Supabase
-- REST API using their own JWT (anon key path). Enabling RLS with no permissive
-- policies makes these tables deny-all for anon/authenticated roles.
--
-- The backend exclusively accesses these tables via SUPABASE_SERVICE_KEY, which
-- bypasses RLS entirely — so no backend behaviour changes.
--
-- Public read endpoints (GET /api/public/pricing, GET /api/public/faq) are
-- served by public_routes.py which calls get_supabase() (service role) inside
-- the function, so they are unaffected by deny-all RLS on plans and faq tables.
-- =============================================================================

-- 1. plans — tier catalog; Stripe price IDs must not be readable by subscribers
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
-- No permissive policies: deny-all for anon/authenticated. Service role bypasses RLS.

-- 2. stripe_webhook_events — internal idempotency log; no subscriber access needed
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No permissive policies.

-- 3. platform_staff — staff roster; email/role enumeration must be blocked
ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;
-- No permissive policies.

-- 4. platform_audit_log — staff action log; subscribers must not read audit records
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
-- No permissive policies.

-- 5. support_sessions — active impersonation records; cross-user data leak risk
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
-- No permissive policies.

-- 6. faq_categories — category metadata; draft state must not be readable by subscribers
ALTER TABLE public.faq_categories ENABLE ROW LEVEL SECURITY;
-- No permissive policies.

-- 7. faq_articles — draft articles must not be readable by subscribers
ALTER TABLE public.faq_articles ENABLE ROW LEVEL SECURITY;
-- No permissive policies.

-- 8. platform_settings — invite_only_mode and maintenance_mode flags; internal only
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
-- No permissive policies.

-- =============================================================================
-- Migration 006: Multi-Tenanted SaaS Conversion
-- Run in Supabase → SQL Editor → New Query
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PLANS CATALOG
-- Replaces the hardcoded tier_limits.py dict. One row per tier.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
    tier_key             TEXT        PRIMARY KEY,
    -- 'free' | 'starter' | 'pro' | 'enterprise'
    display_name         TEXT        NOT NULL,
    price_monthly_usd    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    max_symbols          INT,            -- NULL = unlimited
    max_scans_per_month  INT,            -- NULL = unlimited
    features_json        JSONB       NOT NULL DEFAULT '{}',
    -- e.g. {"trading_desk": true, "positions": true, "risk_monitor": true}
    stripe_price_id      TEXT,           -- NULL for free and enterprise
    stripe_product_id    TEXT,           -- NULL for free; set after Stripe product creation
    is_active            BOOLEAN     NOT NULL DEFAULT true,
    sort_order           INT         NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with current tier_limits.py values (OQ-2: keep existing free limits)
INSERT INTO public.plans
    (tier_key, display_name, price_monthly_usd, max_symbols, max_scans_per_month,
     features_json, sort_order)
VALUES
    ('free',       'Free',       0.00,  5,    10,   '{"trading_desk":false,"positions":false,"risk_monitor":false}', 0),
    ('starter',    'Starter',    9.00,  15,   100,  '{"trading_desk":false,"positions":true,"risk_monitor":false}',  1),
    ('pro',        'Pro',        29.00, 50,   NULL, '{"trading_desk":true,"positions":true,"risk_monitor":false}',   2),
    ('enterprise', 'Enterprise', 99.00, NULL, NULL, '{"trading_desk":true,"positions":true,"risk_monitor":true}',    3)
ON CONFLICT (tier_key) DO NOTHING;

-- No RLS: read by service role only; public pricing read via /api/public/pricing


-- -----------------------------------------------------------------------------
-- 2. SUBSCRIPTIONS
-- One row per subscriber (including free-tier users). Stripe-backed via webhooks.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID        NOT NULL UNIQUE
                                            REFERENCES auth.users(id) ON DELETE CASCADE,
    tier_key                    TEXT        NOT NULL DEFAULT 'free'
                                            REFERENCES public.plans(tier_key),
    stripe_customer_id          TEXT        UNIQUE,
    stripe_subscription_id      TEXT        UNIQUE,
    stripe_subscription_item_id TEXT,       -- base plan item; used for upgrades/downgrades
    stripe_price_id             TEXT,       -- the price the subscriber is actually on
                                            -- (may differ from plans.stripe_price_id for
                                            --  grandfathered subscribers — see ADR-0004)
    status                      TEXT        NOT NULL DEFAULT 'active',
    -- values: active | past_due | canceled | incomplete
    current_period_start        TIMESTAMPTZ,
    current_period_end          TIMESTAMPTZ,
    cancel_at_period_end        BOOLEAN     NOT NULL DEFAULT false,
    pending_tier_key            TEXT        REFERENCES public.plans(tier_key),
    -- set when a downgrade is scheduled; applied at period end by webhook
    admin_override_tier_key     TEXT        REFERENCES public.plans(tier_key),
    -- non-null when an Owner has manually overridden the tier (FR-32)
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user    ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier    ON public.subscriptions(tier_key);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_read_own" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);
-- Writes are service-role only (webhook handler, admin routes)


-- -----------------------------------------------------------------------------
-- 3. INVOICES
-- Synced from Stripe webhooks. Never written by the subscriber directly.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_invoice_id   TEXT        UNIQUE NOT NULL,
    amount_due          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    amount_paid         NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    currency            TEXT        NOT NULL DEFAULT 'usd',
    status              TEXT        NOT NULL,
    -- values: paid | open | void | uncollectible
    description         TEXT,
    tier_key            TEXT,       -- tier at time of invoice (denormalised for revenue reports)
    period_start        TIMESTAMPTZ,
    period_end          TIMESTAMPTZ,
    invoice_pdf         TEXT,       -- Stripe-hosted PDF URL
    hosted_invoice_url  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user       ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created    ON public.invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON public.invoices(status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_read_own" ON public.invoices
    FOR SELECT USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 4. STRIPE WEBHOOK EVENT LOG (idempotency)
-- Prevents double-processing replayed Stripe events.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    stripe_event_id     TEXT        PRIMARY KEY,
    event_type          TEXT        NOT NULL,
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload_summary     TEXT        -- first 500 chars of event JSON for debugging
);

-- No RLS: service role only. No user data.


-- -----------------------------------------------------------------------------
-- 5. PLATFORM STAFF
-- Staff members with differentiated roles for the admin portal.
-- Completely separate from subscriber user_profiles.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_staff (
    id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT        NOT NULL UNIQUE,
    full_name       TEXT,
    staff_role      TEXT        NOT NULL DEFAULT 'support'
                                CHECK (staff_role IN ('owner', 'support', 'finance')),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    invited_by      UUID        REFERENCES auth.users(id),
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_staff_role ON public.platform_staff(staff_role);

-- No RLS: all reads/writes via service role on backend only.
-- Staff authenticate via Supabase Auth (same project); backend checks platform_staff
-- table after token verification.

-- Seed the platform owner from the existing ADMIN_EMAIL
-- This INSERT is safe to re-run (ON CONFLICT DO NOTHING).
-- It will only succeed after leonard.simgt@gmail.com has logged in at least once
-- and has a row in auth.users. The backend also upserts this on first staff login.
INSERT INTO public.platform_staff (id, email, full_name, staff_role)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email), 'owner'
FROM auth.users
WHERE email = 'leonard.simgt@gmail.com'
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 6. PLATFORM AUDIT LOG
-- Records all admin actions against subscriber accounts and platform settings.
-- Separate from the existing activity_log (which records subscriber actions).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID        NOT NULL REFERENCES auth.users(id),
    actor_email     TEXT        NOT NULL,
    target_user_id  UUID        REFERENCES auth.users(id),
    action_type     TEXT        NOT NULL,
    -- values: 'tier_override' | 'account_deactivate' | 'account_reactivate' |
    --         'support_session_start' | 'support_session_end' |
    --         'staff_invite' | 'staff_role_change' | 'staff_deactivate' |
    --         'pricing_change' | 'faq_publish' | 'faq_delete' |
    --         'platform_setting_change' | 'subscription_cancel_admin'
    payload         JSONB,      -- before/after values where applicable
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor    ON public.platform_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target   ON public.platform_audit_log(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON public.platform_audit_log(action_type);

-- No RLS: service role only.


-- -----------------------------------------------------------------------------
-- 7. SUPPORT SESSIONS (active impersonation tracking)
-- Allows detection of concurrent support sessions and enforces audit completeness.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        UUID        NOT NULL REFERENCES auth.users(id),
    subscriber_id   UUID        NOT NULL REFERENCES auth.users(id),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,        -- NULL while session is active
    UNIQUE (staff_id, subscriber_id, ended_at)
    -- partial unique: one active session per (staff, subscriber) pair
);

-- No RLS: service role only.


-- -----------------------------------------------------------------------------
-- 8. FAQ
-- Managed by Owner/Support in admin portal; public read via /api/public/faq.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faq_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faq_articles (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID        REFERENCES public.faq_categories(id) ON DELETE SET NULL,
    question        TEXT        NOT NULL,
    answer_markdown TEXT        NOT NULL,
    is_published    BOOLEAN     NOT NULL DEFAULT false,
    sort_order      INT         NOT NULL DEFAULT 0,
    created_by      UUID        REFERENCES auth.users(id),
    updated_by      UUID        REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_published ON public.faq_articles(is_published, sort_order);

-- No RLS: public read is via service role in public_routes; admin writes via service role.


-- -----------------------------------------------------------------------------
-- 9. PLATFORM SETTINGS
-- Single-row config table for platform-wide flags (invite-only mode etc.)
-- See ADR-0005.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
    id                  INT         PRIMARY KEY DEFAULT 1
                                    CHECK (id = 1),  -- enforces single row
    invite_only_mode    BOOLEAN     NOT NULL DEFAULT false,
    maintenance_mode    BOOLEAN     NOT NULL DEFAULT false,
    updated_by          UUID        REFERENCES auth.users(id),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id, invite_only_mode, maintenance_mode)
VALUES (1, false, false)
ON CONFLICT (id) DO NOTHING;

-- No RLS: service role only.


-- -----------------------------------------------------------------------------
-- 10. ALTER user_profiles: add onboarding and subscription state columns
-- Additive only — no existing columns removed or type-changed.
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS onboarding_step       TEXT    NOT NULL DEFAULT 'plan_selection',
    -- values: 'plan_selection' | 'payment' | 'complete'
    ADD COLUMN IF NOT EXISTS is_platform_staff     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS deactivated_at        TIMESTAMPTZ;
    -- non-null when an Owner has deactivated the account (FR-33)

-- Mark the admin as having completed onboarding (they pre-date the onboarding flow).
UPDATE public.user_profiles
SET onboarding_completed = true,
    onboarding_step = 'complete'
WHERE email = 'leonard.simgt@gmail.com';


-- -----------------------------------------------------------------------------
-- 11. AUTO-CREATE subscriptions row on new user_profiles insert
-- Mirrors the pattern from multi-tenanted-saas.md §4 trigger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.subscriptions (user_id, tier_key, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_user_create_subscription ON public.user_profiles;
CREATE TRIGGER on_new_user_create_subscription
    AFTER INSERT ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_subscription();

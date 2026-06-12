# Technical Design — Multi-Tenanted SaaS Conversion

**Date:** 12Jun2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

This document converts OptionsDesk from an invite-only single-admin dashboard into a
multi-tenanted SaaS product. The key architectural commitments are:

- Self-signup via Supabase (Google OAuth + new email/password) replaces the whitelist
  gate, which becomes a reversible invite-only mode controlled by a platform setting.
- Stripe handles all subscription billing (monthly, USD) via Stripe Checkout for
  initial card entry and the Stripe Customer Portal for card management; no card data
  touches OptionsDesk servers.
- Entitlements are computed server-side from a new `subscriptions` table (Stripe-backed
  via webhooks) and a DB-backed `plans` catalog that replaces the hardcoded
  `tier_limits.py` values.
- A platform admin portal runs as a second Railway frontend service (same codebase,
  `VITE_PORTAL_MODE=admin`) with its own `StaffAuthContext` backed by a new
  `platform_staff` table.
- All tier names (free/starter/pro/enterprise) are unchanged throughout the codebase.
- Enterprise tier is admin-provisioned; it does not appear in the Stripe Checkout flow.
- Phone verification (Twilio) and add-ons are deferred per approved open-question
  resolutions OQ-4 and OQ-5.

ADRs 0001–0006 record all significant architectural decisions for this feature.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/migrations/006_saas_conversion.sql` | New | All schema changes for this feature |
| `backend/requirements.txt` | Modified | Add `stripe>=8.0.0` |
| `backend/main.py` | Modified | Register new routers; dynamic CORS from env |
| `backend/services/auth_utils.py` | Modified | Add `require_staff(role)` dependency; update login to remove hard whitelist check (invite-only mode); keep `require_admin()` as Owner alias |
| `backend/services/tier_limits.py` | Modified | DB-backed with cache + hardcoded fallback (ADR-0003) |
| `backend/services/stripe_service.py` | New | Stripe API wrapper: checkout session, customer portal, subscription CRUD, webhook handler |
| `backend/services/entitlements.py` | New | `compute_entitlements(user_id)` — reads subscriptions + plans, returns entitlement dict |
| `backend/services/metrics.py` | New | In-process request counters for health panel (ADR-0006) |
| `backend/routes/auth_routes.py` | Modified | Remove hard whitelist check; add invite-only mode gate; add `GET /api/auth/entitlements` |
| `backend/routes/billing_routes.py` | New | `/api/billing/*` — checkout session, portal session, invoices, payment method |
| `backend/routes/platform_routes.py` | New | `/api/platform/*` — staff auth, subscriber mgmt, pricing CRUD, FAQ CRUD, revenue metrics, health panel |
| `backend/routes/public_routes.py` | New | `/api/public/*` — pricing page data, FAQ public read |
| `backend/routes/watchlist.py` | Modified | Read limits from `entitlements.py` not `tier_limits.py` directly |
| `backend/routes/strategies.py` | Modified | Read scan limits from `entitlements.py`; increment metrics counter |
| `frontend/src/App.tsx` | Modified | Branch on `VITE_PORTAL_MODE`: mount `<ClientApp>` or `<AdminApp>` |
| `frontend/src/context/AuthContext.tsx` | Modified | Add `entitlements` to context; add email/password sign-in/sign-up; remove 403 whitelist alert |
| `frontend/src/context/StaffAuthContext.tsx` | New | Staff authentication state for admin portal |
| `frontend/src/context/EntitlementsContext.tsx` | New | Fetches and caches entitlements; exposes `useEntitlements()` hook |
| `frontend/src/api/client.ts` | Modified | Add billing, platform, public endpoint calls; add entitlements types |
| `frontend/src/components/LoginPage.tsx` | Modified | Add email/password form alongside Google OAuth |
| `frontend/src/components/OnboardingFlow.tsx` | New | 3-step wizard: plan selection → payment (Stripe Checkout redirect) → complete |
| `frontend/src/components/PricingPage.tsx` | New | Public pricing page (no auth required) |
| `frontend/src/components/SettingsPage.tsx` | New | Tabs: Account / Subscription / Billing / Danger Zone |
| `frontend/src/components/FaqPage.tsx` | New | Public FAQ page |
| `frontend/src/components/LockedTabPlaceholder.tsx` | New | Locked tab UI with upgrade CTA |
| `frontend/src/components/PaymentFailedBanner.tsx` | New | Banner shown when subscription_status = past_due |
| `frontend/src/components/admin/AdminApp.tsx` | New | Root component for admin portal |
| `frontend/src/components/admin/StaffLoginPage.tsx` | New | Staff login (Google OAuth + email/password) |
| `frontend/src/components/admin/SubscriberList.tsx` | New | Paginated subscriber table |
| `frontend/src/components/admin/SubscriberDetail.tsx` | New | Single subscriber profile + support view entry |
| `frontend/src/components/admin/PricingManager.tsx` | New | Per-tier price and entitlement editor |
| `frontend/src/components/admin/RevenuePanel.tsx` | New | MRR chart, subscriber counts, churn (Owner/Finance only) |
| `frontend/src/components/admin/HealthPanel.tsx` | New | Market Data credits, request counters, active sessions |
| `frontend/src/components/admin/FaqEditor.tsx` | New | FAQ CRUD with publish/draft toggle |
| `frontend/src/components/admin/StaffManager.tsx` | New | Invite staff, role management, deactivation |
| `frontend/src/components/AdminPanel.tsx` | Retired | Replaced by admin portal; tab removed from client dashboard |

---

## 3. Database Schema Changes

### Migration: `006_saas_conversion.sql`

The highest existing migration is `005_earnings_awareness.sql`. This is migration 006.
All changes are additive except the two noted alterations to `user_profiles`.

```sql
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
```

**Tables created:**

| Table | Purpose |
|-------|---------|
| `plans` | DB-backed tier catalog (replaces hardcoded tier_limits.py) |
| `subscriptions` | Per-subscriber Stripe billing state |
| `invoices` | Stripe invoice cache (webhook-synced) |
| `stripe_webhook_events` | Idempotency log for webhook event IDs |
| `platform_staff` | Admin portal staff with role-based access |
| `platform_audit_log` | All admin actions against subscribers/settings |
| `support_sessions` | Active and historical impersonation sessions |
| `faq_categories` | FAQ category groupings |
| `faq_articles` | FAQ entries with publish/draft status |
| `platform_settings` | Single-row platform-wide config flags |

**Tables altered:**

| Table | Change |
|-------|--------|
| `user_profiles` | Added: `onboarding_completed`, `onboarding_step`, `is_platform_staff`, `deactivated_at` |

**Tables retained unchanged:**

`user_whitelist`, `user_watchlists`, `scan_usage`, `activity_log`, `portfolios`,
`orders`, `positions`, `pnl_snapshots`, `ai_settings`.

**RLS summary:**

| Table | RLS | Policy |
|-------|-----|--------|
| `subscriptions` | Enabled | SELECT own row only; writes via service role |
| `invoices` | Enabled | SELECT own rows only; writes via service role |
| All other new tables | RLS not enabled | Service role only; no client-side access |

---

## 4. API Contracts

### Auth changes

#### `POST /api/auth/login`

**Auth required:** Yes (Supabase JWT)

Existing endpoint. Behaviour change: whitelist check is now conditional on
`platform_settings.invite_only_mode`. If `invite_only_mode = false`, the check
is skipped. If `invite_only_mode = true`, existing whitelist check runs unchanged.

Platform staff are also checked: if the email is in `platform_staff` and
`is_platform_staff = true`, the profile is upserted with `is_platform_staff = true`.
This endpoint remains the client portal login path; staff logging into the admin
portal go through the same Supabase token but are then checked against `platform_staff`.

After the whitelist gate, a `subscriptions` row is created (via trigger) and the
`onboarding_completed` flag from `user_profiles` is returned so the frontend can
route to onboarding or dashboard.

**Response (200):**
```json
{
  "ok": true,
  "email": "user@example.com",
  "onboarding_completed": false,
  "onboarding_step": "plan_selection",
  "is_deactivated": false
}
```

**Error responses:**
| Status | Condition |
|--------|-----------|
| 401 | Invalid/expired Supabase token |
| 403 | `invite_only_mode = true` and email not whitelisted |
| 403 | Account is deactivated (`deactivated_at` is not null): `{"detail": "Account suspended. Contact support.", "code": "account_suspended"}` |

---

#### `GET /api/auth/entitlements`

**Auth required:** Yes (Supabase JWT)

Returns the computed entitlement set for the requesting user. Called by the client
portal on login and after any subscription change. Reads from `subscriptions`,
`plans` (via cached tier_limits service — ADR-0003). Result includes resolved
effective tier (admin override takes precedence over Stripe tier; `past_due` and
`canceled` degrade to free).

**Response (200):**
```json
{
  "effective_tier": "pro",
  "subscription_status": "active",
  "stripe_tier": "pro",
  "admin_override_tier": null,
  "max_symbols": 50,
  "max_scans_per_month": null,
  "features": {
    "trading_desk": true,
    "positions": true,
    "risk_monitor": false
  },
  "current_period_end": "2026-07-12T00:00:00Z",
  "cancel_at_period_end": false,
  "pending_tier_key": null,
  "payment_failed": false
}
```

When `subscription_status = "past_due"`, `effective_tier` is `"free"` and
`payment_failed = true` regardless of the Stripe tier key on record.

When `cancel_at_period_end = true` and `pending_tier_key` is set, the downgrade
takes effect at `current_period_end`.

---

### Billing routes (`/api/billing/*`)

All billing routes require auth (subscriber JWT). No admin role required.

#### `POST /api/billing/checkout-session`

Creates a Stripe Checkout Session for the subscriber to initiate or change to a paid
subscription. Used during onboarding and for upgrades from the settings page.

**Request:**
```json
{
  "tier_key": "starter"
}
```
`tier_key` must be `"starter"` or `"pro"`. `"enterprise"` and `"free"` are rejected
(enterprise is admin-provisioned; free requires no checkout).

**Response (200):**
```json
{
  "checkout_url": "https://checkout.stripe.com/pay/cs_live_..."
}
```

The backend creates a Stripe Customer if `subscriptions.stripe_customer_id` is null,
then creates a Checkout Session with:
- `mode: "subscription"`
- `success_url: "<CLIENT_PORTAL_URL>/onboarding/complete?session_id={CHECKOUT_SESSION_ID}"`
- `cancel_url: "<CLIENT_PORTAL_URL>/onboarding/plan"`
- `customer: stripe_customer_id`
- `line_items: [{price: plans[tier_key].stripe_price_id, quantity: 1}]`
- `subscription_data.metadata: {user_id: <user_id>, tier_key: <tier_key>}`

Entitlement is activated by the `checkout.session.completed` webhook, not by the
redirect URL.

**Error responses:**
| Status | Condition |
|--------|-----------|
| 400 | `tier_key` is `"free"` or `"enterprise"` |
| 400 | Subscriber already has an active paid subscription (use upgrade endpoint) |
| 500 | Stripe API error |

---

#### `POST /api/billing/upgrade`

Immediately switch an active paid subscriber to a higher tier. Stripe applies
proration. Cannot downgrade via this endpoint.

**Request:**
```json
{
  "tier_key": "pro"
}
```

Backend: calls `stripe.subscriptions.update` with the new price ID on the existing
subscription item. Updates `subscriptions.tier_key` and `stripe_price_id` optimistically;
the `customer.subscription.updated` webhook confirms and sets period dates.

**Response (200):**
```json
{
  "ok": true,
  "effective_tier": "pro",
  "current_period_end": "2026-07-12T00:00:00Z"
}
```

**Error responses:**
| Status | Condition |
|--------|-----------|
| 400 | `tier_key` is same as or lower than current tier |
| 400 | No active paid subscription |

---

#### `POST /api/billing/downgrade`

Schedule a downgrade to take effect at `current_period_end`. Sets
`cancel_at_period_end = false` (keeps subscription alive) and
`pending_tier_key = target_tier` on the `subscriptions` row. The
`customer.subscription.updated` webhook with `cancel_at_period_end = true` is not
used for downgrades; instead, the backend uses a Stripe Subscription Schedule or
simply updates the price at the next renewal via the `invoice.upcoming` webhook.

Implementation note: for simplicity at MVP, a Stripe Subscription Schedule is not
used. Instead, the `pending_tier_key` is stored in the DB. The
`customer.subscription.updated` webhook handler checks `pending_tier_key` and
applies the new price when `current_period_end` has elapsed (i.e., when the subscription
renews and a new `current_period_start > old current_period_start`). This is detected
by comparing the incoming webhook's `current_period_start` to the stored value.

**Request:**
```json
{
  "tier_key": "starter"
}
```

**Response (200):**
```json
{
  "ok": true,
  "pending_tier_key": "starter",
  "effective_until": "2026-07-12T00:00:00Z"
}
```

**Error responses:**
| Status | Condition |
|--------|-----------|
| 400 | `tier_key` is same as or higher than current tier |
| 400 | A downgrade is already scheduled |

---

#### `POST /api/billing/cancel`

Schedule subscription cancellation at period end.

**Request:**
```json
{
  "confirmation": "CANCEL"
}
```
`confirmation` must equal the string `"CANCEL"` (case-sensitive). This is the
server-side deliberate-action check required by FR-16 / AC7.1.

Backend: calls `stripe.subscriptions.modify(sub_id, cancel_at_period_end=True)`.

**Response (200):**
```json
{
  "ok": true,
  "cancels_at": "2026-07-12T00:00:00Z"
}
```

---

#### `POST /api/billing/reactivate`

Remove scheduled cancellation (FR-17).

**Request:** empty body `{}`

Backend: calls `stripe.subscriptions.modify(sub_id, cancel_at_period_end=False)`.

**Response (200):**
```json
{ "ok": true }
```

---

#### `GET /api/billing/invoices`

List the subscriber's invoices from the DB (not a live Stripe call).

**Response (200):**
```json
{
  "invoices": [
    {
      "id": "uuid",
      "stripe_invoice_id": "in_...",
      "amount_paid": 29.00,
      "currency": "usd",
      "status": "paid",
      "description": "Pro subscription",
      "period_start": "2026-06-12T00:00:00Z",
      "period_end": "2026-07-12T00:00:00Z",
      "invoice_pdf": "https://pay.stripe.com/invoice/...",
      "created_at": "2026-06-12T10:00:00Z"
    }
  ]
}
```

---

#### `GET /api/billing/payment-method`

Returns summary of the subscriber's payment method. Makes a single Stripe API call
(`stripe.customers.retrieve(stripe_customer_id, expand=['default_source'])` or
reads the default payment method from the customer object). Cached in-process per
user for 300 s to avoid repeated Stripe calls on settings page load.

**Response (200):**
```json
{
  "brand": "visa",
  "last4": "4242",
  "exp_month": 12,
  "exp_year": 2028
}
```

Returns `null` fields if no payment method is on file.

**Caching:** in-process dict `_pm_cache[user_id]` with 300 s TTL.
**Fallback:** on Stripe API error, returns `{"brand": null, "last4": null, "exp_month": null, "exp_year": null}` with a `"stale": true` flag. Never surfaces a 500 to the frontend for this endpoint.

---

#### `POST /api/billing/portal`

Creates a Stripe Customer Portal session and returns the URL.

**Request:** empty body `{}`

Backend: calls `stripe.billing_portal.sessions.create(customer=stripe_customer_id, return_url=<CLIENT_PORTAL_URL>/settings/billing)`.

**Response (200):**
```json
{
  "portal_url": "https://billing.stripe.com/session/..."
}
```

**Error responses:**
| Status | Condition |
|--------|-----------|
| 400 | Subscriber has no Stripe customer (free tier, no card yet) |
| 503 | Stripe API unreachable — frontend shows error toast |

---

#### `POST /api/billing/webhook`

Stripe webhook handler. **No auth required.** Verifies
`Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET` before processing.

Idempotency: before any state change, the handler checks `stripe_webhook_events`
for the incoming `event.id`. If found, returns `200` immediately without reprocessing.
If not found, inserts the event ID and processes.

**Handled events:**

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Set `subscriptions.tier_key`, `stripe_subscription_id`, `stripe_subscription_item_id`, `stripe_price_id`, `status='active'`. Set `user_profiles.onboarding_completed=true`, `onboarding_step='complete'`. |
| `customer.subscription.updated` | Update `tier_key` (if `pending_tier_key` downgrade triggered at renewal), `status`, `cancel_at_period_end`, `current_period_start`, `current_period_end`. |
| `customer.subscription.deleted` | Set `status='canceled'`, `tier_key='free'`, clear Stripe subscription fields. |
| `invoice.payment_succeeded` | Insert or update `invoices` row. Set `subscriptions.status='active'` (recover from `past_due`). |
| `invoice.payment_failed` | Set `subscriptions.status='past_due'`. |
| `customer.updated` | Invalidate `_pm_cache[user_id]` (payment method may have changed via Customer Portal). |

All other events: return `200` with `{"ignored": true}`.

**Response (200):** `{"received": true}`

**Response (400):** signature verification failure.

---

### Public routes (`/api/public/*`)

No authentication required.

#### `GET /api/public/pricing`

Returns the plans catalog for the public pricing page.

**Response (200):**
```json
{
  "plans": [
    {
      "tier_key": "free",
      "display_name": "Free",
      "price_monthly_usd": 0.00,
      "max_symbols": 5,
      "max_scans_per_month": 10,
      "features": {
        "trading_desk": false,
        "positions": false,
        "risk_monitor": false
      }
    },
    ...
  ]
}
```

Enterprise tier is included with `"contact_us": true` and no Stripe checkout CTA.

**Caching:** same 60 s in-process plans cache used by the entitlements service.

---

#### `GET /api/public/faq`

Returns published FAQ entries grouped by category.

**Response (200):**
```json
{
  "categories": [
    {
      "id": "uuid",
      "title": "Getting Started",
      "articles": [
        {
          "id": "uuid",
          "question": "What is OptionsDesk?",
          "answer_markdown": "OptionsDesk is...",
          "sort_order": 0
        }
      ]
    }
  ]
}
```

Only `is_published = true` articles are returned.

**Caching:** in-process cache, 30 s TTL. Invalidated when an admin publishes or
unpublishes an article via `POST /api/platform/faq/{id}/publish`.

---

### Platform routes (`/api/platform/*`)

All platform routes require the requesting user to have a row in `platform_staff`
with `is_active = true`. The `require_staff(role)` FastAPI dependency (see section
on auth changes) enforces this. Routes further restricted by role are noted.

#### `GET /api/platform/staff/me`

Returns the authenticated staff member's profile and role. Used by `StaffAuthContext`
on admin portal load.

**Auth:** Any active staff member.

**Response (200):**
```json
{
  "id": "uuid",
  "email": "owner@example.com",
  "full_name": "Owner Name",
  "staff_role": "owner",
  "is_active": true
}
```

---

#### `GET /api/platform/subscribers`

Paginated list of all subscriber profiles.

**Auth:** staff role `owner` or `support` only. Finance gets 403.

**Query params:**
- `page` (int, default 1)
- `page_size` (int, default 50, max 200)
- `search` (string, optional — matches email or full_name prefix, case-insensitive)
- `tier_key` (string, optional filter)
- `status` (string, optional filter — `active|past_due|canceled`)

**Response (200):**
```json
{
  "total": 342,
  "page": 1,
  "page_size": 50,
  "subscribers": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "Jane Smith",
      "tier_key": "pro",
      "subscription_status": "active",
      "stripe_customer_id": "cus_...abcd",
      "created_at": "2026-06-01T10:00:00Z",
      "last_seen_at": "2026-06-12T08:30:00Z",
      "is_active": true
    }
  ]
}
```

---

#### `GET /api/platform/subscribers/{user_id}`

Full subscriber profile for support view.

**Auth:** `owner` or `support`.

**Response (200):**
```json
{
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Jane Smith",
    "avatar_url": null,
    "created_at": "2026-06-01T10:00:00Z",
    "last_seen_at": "2026-06-12T08:30:00Z",
    "onboarding_completed": true,
    "is_active": true
  },
  "subscription": {
    "tier_key": "pro",
    "status": "active",
    "current_period_end": "2026-07-12T00:00:00Z",
    "cancel_at_period_end": false,
    "stripe_customer_id": "cus_...",
    "stripe_subscription_id": "sub_..."
  },
  "positions_count": 3,
  "orders_count": 12,
  "invoices": [ ... ]
}
```

---

#### `POST /api/platform/subscribers/{user_id}/support-session`

Begin a support session (read-only impersonation). Returns a short-lived token
scoped to the subscriber's data that the admin portal passes to the client portal.

**Auth:** `owner` or `support`.

Implementation: inserts a `support_sessions` row. Returns the subscriber's user ID
and a session UUID. The admin portal opens the client portal URL with
`?support_session_id=<uuid>&subscriber_id=<user_id>` in a new tab. The client
portal detects these params and enters read-only support view mode — it sets
`support_mode = true` in a React context, shows the watermark banner, and disables
write actions. The subscriber's JWT is not used; all data is fetched server-side
under the staff's token via `/api/platform/subscribers/{user_id}/*` proxy endpoints.

Logs to `platform_audit_log` with `action_type = 'support_session_start'`.

**Request:** `{}`

**Response (200):**
```json
{
  "support_session_id": "uuid",
  "subscriber_id": "uuid",
  "subscriber_email": "user@example.com",
  "started_at": "2026-06-12T10:00:00Z"
}
```

---

#### `DELETE /api/platform/subscribers/{user_id}/support-session`

End a support session. Sets `ended_at` on the `support_sessions` row.
Logs `support_session_end`.

**Auth:** `owner` or `support`.

**Response (200):** `{"ok": true}`

---

#### `PATCH /api/platform/subscribers/{user_id}/tier-override`

Admin tier override (FR-32). Does not touch Stripe.

**Auth:** `owner` only.

**Request:**
```json
{
  "tier_key": "enterprise",
  "reason": "Enterprise trial for partnership evaluation"
}
```

Sets `subscriptions.admin_override_tier_key`. The entitlements service uses this
when non-null. Logs to `platform_audit_log` with before/after values.

**Response (200):**
```json
{
  "ok": true,
  "admin_override_tier_key": "enterprise"
}
```

Pass `tier_key: null` to clear the override.

---

#### `PATCH /api/platform/subscribers/{user_id}/deactivate`

Suspend a subscriber account (FR-33). Sets `user_profiles.deactivated_at = now()`.
Does not cancel Stripe subscription (owner may wish to retain billing while
investigating; cancellation is a separate action).

**Auth:** `owner` only.

**Response (200):** `{"ok": true}`

#### `PATCH /api/platform/subscribers/{user_id}/reactivate`

Clear `deactivated_at`. Restores login access.

**Auth:** `owner` only.

**Response (200):** `{"ok": true}`

---

#### `GET /api/platform/pricing`

Returns all plans with current prices and entitlements. Visible to all staff roles.

**Response (200):** Same shape as `GET /api/public/pricing` but includes `stripe_price_id`
and `stripe_product_id` fields for Owner context.

---

#### `PATCH /api/platform/pricing/{tier_key}`

Update a tier's price or entitlements.

**Auth:** `owner` only. Returns 403 for support and finance.

Free tier `price_monthly_usd` is immutable at 0.00 — rejected with 400.

For price changes:
1. Validates `price_monthly_usd > 0` for paid tiers.
2. Queries `COUNT(*) FROM subscriptions WHERE tier_key = ? AND status = 'active'` and returns `affected_count` in the response for the frontend confirmation step (FR-39 / AC9.1).
3. Creates new Stripe Price, archives old (ADR-0004).
4. Updates `plans` row.
5. Flushes plans cache.
6. Logs to `platform_audit_log`.

For entitlement changes (no price change):
- Updates `max_symbols`, `max_scans_per_month`, `features_json`.
- Flushes plans cache (propagates within 60 s to all active sessions — ADR-0003).

**Request:**
```json
{
  "price_monthly_usd": 34.00,
  "max_symbols": 60,
  "max_scans_per_month": null,
  "features_json": {
    "trading_desk": true,
    "positions": true,
    "risk_monitor": false
  }
}
```
All fields are optional. Only supplied fields are updated.

**Response (200):**
```json
{
  "ok": true,
  "affected_subscriber_count": 87,
  "new_stripe_price_id": "price_..."
}
```

---

#### `GET /api/platform/revenue`

Revenue metrics computed from the `invoices` and `subscriptions` tables. No live
Stripe call at request time (FR-41).

**Auth:** `owner` or `finance`. Returns 403 for support.

**Response (200):**
```json
{
  "mrr_current_usd": 2523.00,
  "mrr_by_month": [
    {"month": "2025-07", "mrr_usd": 1200.00},
    ...
  ],
  "active_subscribers_by_tier": {
    "free": 412,
    "starter": 63,
    "pro": 24,
    "enterprise": 2
  },
  "new_this_month": 18,
  "churned_this_month": 3,
  "past_due_count": 4,
  "past_due_amount_at_risk_usd": 116.00
}
```

MRR is computed as `SUM(plans.price_monthly_usd)` for all `subscriptions` where
`status = 'active'` and `tier_key != 'free'`. Monthly trend uses `invoices.created_at`
grouped by month. Churn is subscriptions where `status` moved to `'canceled'` in
the current calendar month (detected from `platform_audit_log` entries or by a
`canceled_at` column — the webhook handler records `updated_at` on the `subscriptions`
row when status changes to `canceled`, which allows a monthly GROUP BY).

---

#### `GET /api/platform/revenue/export-csv`

**Auth:** `owner` or `finance`.

**Query params:** `from_date` (YYYY-MM-DD), `to_date` (YYYY-MM-DD)

Returns a CSV file as `text/csv` response. Columns: invoice_date, subscriber_email,
tier_key, amount_paid_usd, status.

Joins `invoices` with `user_profiles` on `user_id`.

---

#### `GET /api/platform/health`

System health panel data (FR-43, FR-44, FR-45, ADR-0006).

**Auth:** `owner` only.

No external API calls. All data from in-process counters and the DB.

**Response (200):**
```json
{
  "api_status": "ok",
  "market_data_credits": {
    "date": "2026-06-12",
    "calls_today": 43,
    "limit": 100,
    "pct": 43.0,
    "alert_level": "ok"
  },
  "requests_last_24h": {
    "strategy_analyze": 312,
    "strategy_scan": 87
  },
  "active_sessions_last_15min": 14
}
```

`alert_level` values: `"ok"` (< 80%), `"warning"` (>= 80%), `"critical"` (>= 100%).

`active_sessions_last_15min` is a DB count: `SELECT COUNT(*) FROM user_profiles WHERE last_seen_at > now() - interval '15 minutes'`.

---

#### `GET /api/platform/staff`

List all platform staff.

**Auth:** `owner` only.

**Response (200):**
```json
{
  "staff": [
    {
      "id": "uuid",
      "email": "support@example.com",
      "full_name": "Support User",
      "staff_role": "support",
      "is_active": true,
      "last_seen_at": "2026-06-12T09:00:00Z",
      "created_at": "2026-06-01T00:00:00Z"
    }
  ]
}
```

---

#### `POST /api/platform/staff/invite`

Invite a new staff member by email. Uses Supabase Admin API
(`sb.auth.admin.invite_user_by_email(email, options={redirect_to: <ADMIN_PORTAL_URL>/auth/callback})`).

**Auth:** `owner` only.

**Request:**
```json
{
  "email": "newstaff@example.com",
  "staff_role": "support",
  "full_name": "Support Person"
}
```

Creates a `platform_staff` row with `is_active = true`. If the email already has a
Supabase Auth user (existing subscriber), a 400 is returned with
`"code": "email_is_subscriber"` — subscribers cannot be dual-enrolled as staff.

Logs `staff_invite` to `platform_audit_log`.

**Response (200):** `{"ok": true, "email": "newstaff@example.com"}`

---

#### `PATCH /api/platform/staff/{staff_id}/role`

Change a staff member's role.

**Auth:** `owner` only. Cannot change self (to prevent self-demotion of last Owner).

Checks that after the change there is still at least one `owner` with `is_active = true`
(FR-29). Rejects with 400 if this would leave zero owners.

**Request:**
```json
{ "staff_role": "finance" }
```

**Response (200):** `{"ok": true}`

---

#### `PATCH /api/platform/staff/{staff_id}/deactivate`

Deactivate a staff account.

**Auth:** `owner` only. Same last-owner guard as role change.

**Response (200):** `{"ok": true}`

---

#### `GET /api/platform/faq`

List all FAQ articles (published and draft) for the admin editor.

**Auth:** `owner` or `support`.

**Response (200):** Same shape as `GET /api/public/faq` but includes `is_published` and
draft entries.

---

#### `POST /api/platform/faq`

Create a new FAQ article.

**Auth:** `owner` or `support`.

**Request:**
```json
{
  "category_id": "uuid or null",
  "question": "How do I cancel?",
  "answer_markdown": "You can cancel from Settings...",
  "sort_order": 5
}
```

Article is created with `is_published = false` by default.

**Response (200):** `{"id": "uuid", "is_published": false}`

---

#### `PATCH /api/platform/faq/{article_id}`

Update question, answer, sort_order, or category. Sets `updated_by`.

**Auth:** `owner` or `support`.

---

#### `POST /api/platform/faq/{article_id}/publish`

Toggle `is_published`. Invalidates the public FAQ cache.

**Auth:** `owner` or `support`.

**Request:** `{"is_published": true}`

**Response (200):** `{"ok": true}`

---

#### `DELETE /api/platform/faq/{article_id}`

Delete an FAQ article. Logs to `platform_audit_log`.

**Auth:** `owner` or `support`.

---

#### `GET /api/platform/settings`

Returns current platform settings.

**Auth:** `owner` only.

**Response (200):**
```json
{
  "invite_only_mode": false,
  "maintenance_mode": false
}
```

---

#### `PATCH /api/platform/settings`

Update platform settings.

**Auth:** `owner` only.

**Request:**
```json
{
  "invite_only_mode": true
}
```

Logs to `platform_audit_log`. Flushes the settings cache.

**Response (200):** `{"ok": true}`

---

### Account deletion

#### `DELETE /api/auth/account`

**Auth:** Yes (subscriber JWT).

Deliberate-action confirmation required.

**Request:**
```json
{ "confirmation": "DELETE" }
```

Sequence (all-or-nothing; partial failures return 500 with `"step"` indicating
which action failed — frontend shows "Deletion partially failed, contact support"):

1. If `subscriptions.stripe_subscription_id` is not null: call
   `stripe.subscriptions.cancel(sub_id)` (immediate cancel, not at period end).
2. Delete the Supabase Auth user: `sb.auth.admin.delete_user(user_id)`.
   The CASCADE on `auth.users` deletes all user data automatically.

Returns `200` after both steps succeed.

---

## 5. Caching Strategy

| Data | Cache Key | TTL | Fallback |
|------|-----------|-----|----------|
| Plans catalog | `_plans_cache` (module-level dict in `tier_limits.py`) | 60 s | Hardcoded `TIER_LIMITS` dict in same file |
| Platform settings (invite-only mode) | `_settings_cache` (module-level dict in new `platform_routes.py` settings helper) | 60 s | Default to `invite_only_mode = false` (safe open) |
| Public FAQ | `_faq_cache` (module-level dict in `public_routes.py`) | 30 s | Return empty `categories: []` with `stale: true` |
| Payment method (Stripe) | `_pm_cache[user_id]` (module-level dict in `stripe_service.py`) | 300 s | Return null fields with `stale: true`; never 500 |
| Market Data App credit counter | `_mda_credit_counter` (module-level dict in `market_data.py`) | Process lifetime / UTC day rollover | Zero count |
| Request metrics | `_request_counter` (module-level dict in `metrics.py`) | Process lifetime | Zero count |

All module-level caches follow the existing pattern established by `market_data.py`
(in-process dict with timestamp). `get_supabase()` is never called at module level;
it is always called inside a function.

---

## 6. External Dependency Fallback Chain

### Stripe API

| Call | Fallback | Behaviour if fallback fails |
|------|----------|-----------------------------|
| `stripe.billing_portal.sessions.create` | None (hosted Stripe service) | Return 503 to frontend; display error toast "Unable to open billing portal. Please try again." |
| `stripe.checkout.sessions.create` | None | Return 503; display "Unable to start checkout. Please try again." |
| `stripe.subscriptions.update` (upgrade/downgrade) | None | Return 500; UI shows "Action failed, please retry." Subscription state unchanged. |
| `stripe.customers.retrieve` (payment method) | Return stale=true null card | Frontend shows "Card details unavailable" without blocking settings page |
| Webhook event processing | Stripe retries for up to 3 days | Idempotency table prevents double-processing on retry |

### Supabase Auth (staff invite)

`sb.auth.admin.invite_user_by_email` — if this call fails, the `platform_staff` row
is not inserted (transaction rolled back). No staff row exists without a successful
Supabase invite. Frontend shows "Invitation failed, please retry."

### Market Data App (unchanged)

Three-tier fallback is unchanged: Market Data App → yfinance → synthetic Black-Scholes.
Refer to existing `market_data.py` design. FR-44/45 health panel reads the in-process
counter; no new external dependency is introduced.

---

## 7. Frontend State Management

### Client portal

| Component | State owned | Props received | Loading state | Error state |
|-----------|-------------|----------------|---------------|-------------|
| `AuthContext` | `user`, `session`, `profile`, `entitlements`, `loading` | — | Spinner on root | Redirect to `/auth` on 401 |
| `EntitlementsContext` | `entitlements` (refreshed after billing actions), `paymentFailed` | — | Uses `AuthContext.loading` | Falls back to free tier entitlements; shows banner |
| `OnboardingFlow` | `step` (`plan_selection / payment / complete`), `selectedTier` | `onStep` from parent | Step-level skeleton | Inline error per step |
| `SettingsPage` | Active tab | — | Per-tab suspense | Per-section error card |
| `SettingsPage > BillingTab` | `invoices`, `paymentMethod`, `portalLoading` | `subscription` from parent | Skeleton table | Error toast on portal failure |
| `SettingsPage > SubscriptionTab` | `cancelLoading`, `upgradeLoading` | `entitlements`, `subscription` | Button spinner | Inline error message |
| `LockedTabPlaceholder` | None | `requiredTier: string`, `onUpgradeClick: fn` | — | — |
| `PaymentFailedBanner` | None | `paymentFailed: boolean`, `onUpdateCard: fn` | — | — |

`AuthContext` is extended to include:
- `entitlements: Entitlements | null` — fetched from `GET /api/auth/entitlements` after login.
- `refreshEntitlements()` — callable after subscription changes; re-fetches entitlements.
- `signUpWithEmail(email, password)` — calls `supabase.auth.signUp()`.
- `signInWithEmail(email, password)` — calls `supabase.auth.signInWithPassword()`.

The `isAdmin` flag in `AuthContext` is replaced by `isOwner` (derived from `is_platform_staff`
flag on the profile) to avoid confusion with the admin portal staff concept. The old
`AdminPanel.tsx` tab is no longer rendered.

### Admin portal

| Component | State owned | Props received | Loading state | Error state |
|-----------|-------------|----------------|---------------|-------------|
| `StaffAuthContext` | `staffUser`, `staffRole`, `loading` | — | Full-page spinner | Redirect to `/staff-login` |
| `AdminApp` | Active section (`dashboard / subscribers / pricing / revenue / health / faq / staff`) | — | Section-level skeleton | Error boundary per section |
| `SubscriberList` | `subscribers[]`, `total`, `page`, `search`, `filters` | — | Table skeleton rows | Error state with retry |
| `SubscriberDetail` | `subscriber`, `invoices[]`, `supportSessionActive` | `userId` from URL | Full-page skeleton | 404 page |
| `PricingManager` | `plans[]`, `editingTier`, `pendingChange`, `affectedCount` | — | Read-only skeleton | Error toast on save failure |
| `RevenuePanel` | `metrics`, `exportLoading` | — | Chart skeleton | Error message |
| `HealthPanel` | `health`, `lastRefreshed` | — | Skeleton | Error with stale data shown |
| `FaqEditor` | `categories[]`, `articles[]`, `editingArticle` | — | Skeleton | Error toast |
| `StaffManager` | `staff[]`, `inviteLoading` | — | Skeleton | Error toast |

`StaffAuthContext`:
- On mount, calls `supabase.auth.getSession()`.
- With a session token, calls `GET /api/platform/staff/me`.
- If the user is not in `platform_staff` or `is_active = false`, signs out and redirects
  to `/staff-login` with error "You do not have admin portal access."
- Exposes `staffRole: 'owner' | 'support' | 'finance'` for role-based tab visibility.

---

## 8. Subscription Tier Enforcement

### Server-side (authoritative)

**Entitlements computation** (`backend/services/entitlements.py`):

```
effective_tier = subscriptions.admin_override_tier_key
                 OR (if status in ('past_due', 'canceled') → 'free')
                 OR subscriptions.tier_key
```

`compute_entitlements(user_id: str) -> dict` fetches the subscription row and the
plan row (from DB-backed cache), applies the degradation rules above, and returns
the full entitlement dict. This function is called by:
- `GET /api/auth/entitlements`
- `PUT /api/watchlist` (max_symbols check)
- `GET /api/strategies/scan` (max_scans_per_month check)
- `GET /api/platform/subscribers/{user_id}` (for admin view — no degradation applied,
  raw subscription state shown)

`watchlist.py` and `strategies.py` stop calling `tier_limits.get_limits()` directly;
they call `entitlements.compute_entitlements(user_id)` instead.

### Client-side (UI only, never authoritative)

The `EntitlementsContext` holds the last-fetched entitlements and drives:
- Tab visibility: `LockedTabPlaceholder` rendered for tabs where `features[tab] = false`.
- Watchlist `PUT` prevention at the UI level (server still enforces).
- Scanner exhaustion message with reset date.
- `PaymentFailedBanner` when `payment_failed = true`.

Frontend never gate-keeps API calls based on locally stored tier alone. A compromised
or manipulated client will still receive 403 from the backend.

### Entitlement degradation rules

| `subscriptions.status` | Effective tier |
|------------------------|----------------|
| `active` | `tier_key` (or `admin_override_tier_key` if set) |
| `past_due` | `free` (FR-15) |
| `canceled` | `free` (FR-7, AC7.4) |
| `incomplete` | `free` (payment capture in progress) |

Subscribers downgrading who have more watchlist symbols than the new tier allows:
`GET /api/watchlist` returns current symbols plus `over_limit: true` flag (FR-23 edge
case). The UI shows a warning; symbols are not deleted automatically.

---

## 9. New Environment Variables

| Variable | Side | Description | Required |
|----------|------|-------------|----------|
| `STRIPE_SECRET_KEY` | Backend | Stripe API secret key. Never in frontend. | Yes (for billing) |
| `STRIPE_WEBHOOK_SECRET` | Backend | Webhook signature verification secret from Stripe dashboard. | Yes (for billing) |
| `STRIPE_PRICE_STARTER` | Backend | Stripe Price ID for the Starter tier (monthly). Set after Stripe product creation; OR stored in `plans.stripe_price_id` and read from DB. Recommended: DB-stored, not env. | No (if DB-stored) |
| `STRIPE_PRICE_PRO` | Backend | Stripe Price ID for the Pro tier (monthly). Same note as above. | No (if DB-stored) |
| `ADMIN_PORTAL_ORIGINS` | Backend | Comma-separated list of allowed CORS origins for the admin portal (e.g. `https://optionspro-admin-production.up.railway.app,https://admin.optionsdeskpro.com`). Read in `main.py` to extend `allow_origins`. | Yes |
| `CLIENT_PORTAL_URL` | Backend | Base URL of the client portal (e.g. `https://optionspro-client-production.up.railway.app`). Used in Stripe Checkout `success_url` / `cancel_url` and Customer Portal `return_url`. | Yes |
| `ADMIN_PORTAL_URL` | Backend | Base URL of the admin portal. Used in staff invite `redirect_to`. | Yes |
| `VITE_PORTAL_MODE` | Frontend (build-time) | `client` or `admin`. Set in Railway environment for each service. Defaults to `client`. | Yes (admin service) |
| `VITE_BACKEND_URL` | Frontend | Backend API base URL. Replaces the hardcoded string in `client.ts`. | Yes |

`SUPABASE_JWT_SECRET` must not be added. JWT verification continues via `sb.auth.get_user(token)`.

---

## 10. Deployment

Two Railway frontend services, same codebase (ADR-0002):

| Service | `VITE_PORTAL_MODE` | URL (staging) | Custom domain (production) |
|---------|-------------------|---------------|----------------------------|
| `optionspro-client` (existing) | `client` | `optionspro-frontend-production.up.railway.app` | `optionsdeskpro.<domain>.com` |
| `optionspro-admin` (new) | `admin` | `optionspro-admin-production.up.railway.app` | `admin.<domain>.com` |

Backend: single existing Railway service. No new backend service.

**`main.py` CORS change:**

```python
import os

_client_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://optionspro-frontend-production.up.railway.app",
]
_admin_origins = [
    o.strip()
    for o in os.getenv("ADMIN_PORTAL_ORIGINS", "").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_client_origins + _admin_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

When the production domain is set, the operator adds it to `ADMIN_PORTAL_ORIGINS`
on the backend Railway service and to the client origins list (or also via an env
var `CLIENT_PORTAL_ORIGINS` — the developer agent should extract both to env).

**`backend/requirements.txt` addition:**

```
stripe>=8.0.0
```

`python-jose` is already in requirements.txt from an earlier migration but is not
used for JWT verification (per CLAUDE.md invariant). It is not removed here to avoid
breaking any indirect dependency — this is a Gate 3 concern.

---

## 11. MVP Boundary

The following is binding for Gate 3 implementation scope, aligned with the approved
spec section 5 and the Gate 1 open-question resolutions.

### Ships in this iteration (MVP)

| Story | Description |
|-------|-------------|
| 1 | Free tier self-signup (no card, Google OAuth + email/password) |
| 2 | Paid tier self-signup via Stripe Checkout |
| 3 | Returning subscriber login with onboarding routing |
| 4 | Upgrade subscription (immediate, prorated) |
| 5 | Downgrade subscription (scheduled, at period end) |
| 6 | Failed payment handling (past_due degradation, banner) |
| 7 | Cancel subscription (deliberate confirmation, period-end access) |
| 8 | Billing self-service (payment method summary, Stripe Customer Portal, invoice list) |
| 9 | Platform Owner views pricing; edits tier prices and entitlements via admin portal |
| 10 | Revenue dashboard (MRR, subscriber counts, churn, CSV export) |
| 11 | Support staff subscriber list, subscriber detail, support view (read-only) |
| 12 | Platform Owner manages staff (invite, role change, deactivate) |
| 13 | Support staff manages FAQ (create, edit, publish, reorder) |
| 14 | Infrastructure health panel |
| 15 | Tier-gated dashboard (locked tab placeholders, scan exhaustion message) |

All 15 stories ship. The spec's section 12 suggested deferring stories 10–14; the
Gate 1 pre-authorisation and scope coverage in this design accommodate all 15 stories.
The backend-developer and frontend-developer agents should implement them in dependency
order: auth/signup infrastructure first, then billing, then admin portal.

### Explicitly deferred (not in scope, not to be implemented)

- Twilio phone verification (OQ-5)
- Add-on subscription items (OQ-4)
- Annual billing
- Trial periods
- Multi-currency
- GDPR data export
- Admin portal mobile optimisation
- Whitelist management UI in admin portal (owners can use Supabase dashboard)

---

## 12. ADR References

- `docs/adr/0001-stripe-checkout-vs-elements.md` — Stripe Checkout (hosted) chosen over Stripe Elements for onboarding payment
- `docs/adr/0002-admin-portal-deployment.md` — Two Railway frontend services (`VITE_PORTAL_MODE`) chosen over single service or separate codebases
- `docs/adr/0003-tier-limits-db-backed-service.md` — DB-backed plans catalog with in-process cache + hardcoded fallback replaces static `tier_limits.py`
- `docs/adr/0004-stripe-price-change-strategy.md` — New Stripe Price + archive old + grandfather existing subscribers; no mid-cycle repricing
- `docs/adr/0005-whitelist-invite-only-mode.md` — Whitelist retained as optional invite-only mode; not deleted
- `docs/adr/0006-market-data-credit-counter.md` — In-process module-level counter for Market Data App credits; no DB write on hot path

---

## 13. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

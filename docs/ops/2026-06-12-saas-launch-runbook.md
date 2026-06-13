# Ops Runbook — Multi-Tenanted SaaS Launch

**Date:** 2026-06-12
**Feature branch:** claude/modest-davinci-sxz7lv
**Design reference:** docs/FeatureRequests/multi-tenant-saas-12Jun2026/02-design.md (ADR-0002)
**Rollback procedure:** Section 9 of this document.

---

## Prerequisites

- Railway CLI authenticated (`railway login`)
- Stripe account with two Products and matching Prices created (Starter monthly, Pro monthly)
- Supabase project dashboard access
- Access to the GitHub repository on the correct branch

---

## 1. Run Database Migrations in Order

All migrations must be run in Supabase SQL Editor (Project → SQL Editor → New Query).
Run them in strict order — each migration depends on the previous one completing
without errors.

### Migration 006 — SaaS Conversion (this feature)

Location: `backend/migrations/006_saas_conversion.sql`

Copy the full contents of that file and paste into the SQL Editor. Click Run.

Expected output: no errors. The final INSERT into `platform_staff` for
`leonard.simgt@gmail.com` will silently do nothing (`ON CONFLICT DO NOTHING`)
if that email has not yet logged in and created a row in `auth.users` — this is
expected and safe. The backend upserts the platform owner row automatically on
first staff login.

**Verification:** After running, confirm these tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'plans', 'subscriptions', 'invoices', 'stripe_webhook_events',
    'platform_staff', 'platform_audit_log', 'support_sessions',
    'faq_categories', 'faq_articles', 'platform_settings'
  )
ORDER BY table_name;
```

Expected: 10 rows returned.

Also confirm the `plans` seed data loaded:

```sql
SELECT tier_key, price_monthly_usd, max_symbols FROM public.plans ORDER BY sort_order;
```

Expected: 4 rows — free (0.00, 5), starter (9.00, 15), pro (29.00, 50), enterprise (99.00, null).

---

## 2. Enable Email/Password Auth in Supabase

The self-signup flow uses Supabase email/password in addition to Google OAuth.

1. Go to Supabase dashboard → Authentication → Providers.
2. Under "Email", ensure "Enable Email provider" is toggled ON.
3. Confirm "Confirm email" is set per your preference (recommended: enabled for
   production to reduce spam signups).
4. Under "URL Configuration", verify "Site URL" is set to the client portal URL
   (e.g. `https://optionspro-client-production.up.railway.app`).
5. Under "Redirect URLs", add both the client portal URL and the admin portal URL
   so Supabase OAuth callbacks are accepted:
   - `https://optionspro-client-production.up.railway.app/**`
   - `https://optionspro-admin-production.up.railway.app/**`

---

## 3. Create Stripe Products and Prices

If not already done, create the two paid tier products in the Stripe dashboard
(Developers → Products → Add Product):

| Product | Price | Interval | Currency |
|---------|-------|----------|----------|
| OptionsDesk Starter | 9.00 | Monthly | USD |
| OptionsDesk Pro | 29.00 | Monthly | USD |

After creating each price, copy the Price ID (format: `price_...`). These are
needed in step 4 (backend env vars) or can be stored directly in the `plans` table:

```sql
UPDATE public.plans SET stripe_price_id = 'price_STARTER_ID_HERE' WHERE tier_key = 'starter';
UPDATE public.plans SET stripe_price_id = 'price_PRO_ID_HERE'     WHERE tier_key = 'pro';
```

The design stores price IDs in the DB (not env vars). Populate the DB rather than
adding `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` as Railway env vars unless your
stripe_service.py implementation reads them from env.

---

## 4. Set Backend Environment Variables in Railway

Open the Railway dashboard → backend service → Variables tab.

Add or update the following five variables. Never paste these into code or commit
them to the repository.

| Variable | Value | Notes |
|----------|-------|-------|
| `STRIPE_SECRET_KEY` | `sk_live_...` (or `sk_test_...` for staging) | Stripe API secret key. Live key for production. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Obtained from the Stripe dashboard after registering the webhook (step 5 below). Complete step 5 first on staging, then update on production. |
| `CLIENT_PORTAL_URL` | `https://optionspro-client-production.up.railway.app` | No trailing slash. Used in Stripe Checkout success_url / cancel_url and Customer Portal return_url. Update if a custom domain is added. |
| `ADMIN_PORTAL_URL` | `https://optionspro-admin-production.up.railway.app` | No trailing slash. Used in staff invite redirect_to. Update if a custom domain is added. |
| `ADMIN_PORTAL_ORIGINS` | `https://optionspro-admin-production.up.railway.app` | Comma-separated. Add the custom domain here too once DNS is wired: `https://optionspro-admin-production.up.railway.app,https://admin.optionsdeskpro.com` |

After saving, redeploy the backend service so the new env vars are picked up.

**Verification:** Call the health endpoint and confirm a 200:

```
curl https://<backend-railway-url>/api/health
```

---

## 5. Register the Stripe Webhook Endpoint

1. Go to Stripe dashboard → Developers → Webhooks → Add endpoint.
2. Set endpoint URL:
   ```
   https://<backend-railway-url>/api/billing/webhook
   ```
3. Select the following events to listen for:

   | Event |
   |-------|
   | `checkout.session.completed` |
   | `customer.subscription.updated` |
   | `customer.subscription.deleted` |
   | `invoice.payment_succeeded` |
   | `invoice.payment_failed` |
   | `customer.updated` |

4. Click "Add endpoint". Stripe generates a signing secret (`whsec_...`).
5. Copy the signing secret and set it as `STRIPE_WEBHOOK_SECRET` on the Railway
   backend service (step 4 above). Redeploy the backend after setting this value.

**Verification:** In the Stripe dashboard → Webhooks → your endpoint, use
"Send test webhook" with event type `checkout.session.completed`. Confirm the
backend logs a 200 response.

---

## 6. Create the Admin Portal Railway Service

The admin portal is a third Railway service built from the same repository and
frontend directory, with `VITE_PORTAL_MODE=admin` set at build time.

In the Railway dashboard:

1. Click "New Service" → "GitHub Repo" → select this repository.
2. Service name: `optionspro-admin`
3. Under Settings → Build:
   - Root directory: `frontend`
   - Build command: `npm install && npm run build`
   - Start command: `npm run preview -- --host 0.0.0.0 --port $PORT`
4. Under Variables, add:

   | Variable | Value |
   |----------|-------|
   | `VITE_PORTAL_MODE` | `admin` |
   | `VITE_SUPABASE_URL` | Same value as the client portal service |
   | `VITE_SUPABASE_ANON_KEY` | Same value as the client portal service |
   | `VITE_BACKEND_URL` | Full URL of the backend Railway service (e.g. `https://<backend>.up.railway.app`) |

5. Deploy the service.

Note on `VITE_BACKEND_URL`: this variable replaces the hardcoded URL in
`frontend/src/api/client.ts` for the multi-tenant build. The client portal service
also needs `VITE_BACKEND_URL` set to the same backend URL once the refactor to
read from env is in place.

Note on `npm run preview`: the Vite `preview` command serves the pre-built `dist/`
directory. It is suitable for Railway's always-on container model. If the frontend
team switches to a static-file serving approach (e.g. `serve -s dist`), update the
start command accordingly.

---

## 7. Update Client Portal Service Variables

On the `optionspro-client-production.up.railway.app` Railway service, add or
verify:

| Variable | Value |
|----------|-------|
| `VITE_PORTAL_MODE` | `client` (or omit — the default in `App.tsx` is `'client'`) |
| `VITE_BACKEND_URL` | Full URL of the backend Railway service |
| `VITE_SUPABASE_URL` | existing value |
| `VITE_SUPABASE_ANON_KEY` | existing value |

Redeploy if any values were changed.

---

## 8. Health Check Verification After Deployment

Run these checks after all services are deployed and before announcing the launch.

### Backend

```bash
# Basic health
curl https://<backend-url>/api/health
# Expected: {"status": "ok"}

# Public pricing endpoint (no auth required)
curl https://<backend-url>/api/public/pricing
# Expected: JSON with 4 plans including free, starter, pro, enterprise

# Public FAQ endpoint (no auth required)
curl https://<backend-url>/api/public/faq
# Expected: {"categories": []} or populated list — no 500

# Confirm CORS accepts admin portal origin
curl -I -H "Origin: https://optionspro-admin-production.up.railway.app" \
     https://<backend-url>/api/health
# Expected: Access-Control-Allow-Origin header present
```

### Client portal

1. Open the client portal URL in a browser.
2. Confirm the login page loads (Google OAuth button + email/password form).
3. Sign in with a test email/password account. Confirm onboarding flow appears for
   new users (plan selection step).
4. Confirm Google OAuth sign-in still works.

### Admin portal

See section 9 below for admin-specific verification.

---

## 9. Admin Portal Verification

1. Open the admin portal URL in a browser.
2. Sign in as `leonardsim.sm@gmail.com` using Google OAuth or email/password.
3. After login, `StaffAuthContext` calls `GET /api/platform/staff/me`. Confirm:
   - No redirect to `/staff-login` with an error (would indicate the `platform_staff`
     row was not seeded).
   - The navigation shows the Owner role tabs: Dashboard, Subscribers, Pricing,
     Revenue, Health, FAQ, Staff.
4. If `GET /api/platform/staff/me` returns 403 (staff row not yet bootstrapped from
   migration 006 because `leonard.simgt@gmail.com` had not yet signed up at migration
   time), run the following in the Supabase SQL Editor to insert the row manually:

   ```sql
   INSERT INTO public.platform_staff (id, email, full_name, staff_role)
   SELECT id, email,
          COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email),
          'owner'
   FROM auth.users
   WHERE email = 'leonard.simgt@gmail.com'
   ON CONFLICT (id) DO NOTHING;
   ```

   Then refresh the admin portal page.

5. Navigate to Subscribers. Confirm the subscriber list loads (may be empty or show
   existing users).
6. Navigate to Health. Confirm the health panel shows `"api_status": "ok"` and
   Market Data credit counters.

---

## 10. Rollback Procedure

### Backend rollback

Railway keeps a deployment history. To roll back the backend:

1. Railway dashboard → backend service → Deployments tab.
2. Select the last known-good deployment.
3. Click "Rollback to this deployment".

The backend will restart on the previous image within ~60 seconds. No database
changes are reversed by a backend rollback alone — see DB rollback below.

### Frontend rollbacks (client portal and admin portal)

Same process: Deployments tab → select previous deployment → Rollback.

The admin portal service can be taken offline entirely by clicking
"Remove Service" if it needs to be pulled before the client portal is
stabilised. This has no effect on the backend or the client portal.

### Database rollback

Migration 006 is all-additive (new tables only, plus two `ADD COLUMN IF NOT EXISTS`
statements on `user_profiles`). There is no automatic down-migration.

If a full rollback to pre-SaaS state is required:

1. Redeploy the backend to the pre-SaaS commit.
2. Run the following in the Supabase SQL Editor to drop the new tables. **This is
   destructive and will delete all subscriber, billing, and staff data. Only
   execute after confirming with the product owner.**

   ```sql
   -- Run only if a full pre-SaaS rollback is authorised by the product owner.
   DROP TABLE IF EXISTS public.support_sessions CASCADE;
   DROP TABLE IF EXISTS public.platform_audit_log CASCADE;
   DROP TABLE IF EXISTS public.platform_staff CASCADE;
   DROP TABLE IF EXISTS public.stripe_webhook_events CASCADE;
   DROP TABLE IF EXISTS public.invoices CASCADE;
   DROP TABLE IF EXISTS public.subscriptions CASCADE;
   DROP TABLE IF EXISTS public.faq_articles CASCADE;
   DROP TABLE IF EXISTS public.faq_categories CASCADE;
   DROP TABLE IF EXISTS public.platform_settings CASCADE;
   DROP TABLE IF EXISTS public.plans CASCADE;
   DROP TRIGGER IF EXISTS on_new_user_create_subscription ON public.user_profiles;
   DROP FUNCTION IF EXISTS public.handle_new_user_subscription();
   ALTER TABLE public.user_profiles
       DROP COLUMN IF EXISTS onboarding_completed,
       DROP COLUMN IF EXISTS onboarding_step,
       DROP COLUMN IF EXISTS is_platform_staff,
       DROP COLUMN IF EXISTS deactivated_at;
   ```

3. Remove the five backend env vars added in step 4 (`STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `CLIENT_PORTAL_URL`, `ADMIN_PORTAL_URL`,
   `ADMIN_PORTAL_ORIGINS`) from the Railway backend service, then redeploy.

### Stripe webhook rollback

If rolling back to pre-billing state, disable the webhook endpoint in the Stripe
dashboard (Developers → Webhooks → select endpoint → Disable) to prevent further
events being delivered to a backend that is no longer handling them.

---

## 11. Playwright Config Note (do not modify config without a test run)

The existing `frontend/playwright.config.ts` hardcodes a single `webServer` block
pointing to `http://localhost:5173` and does not pass `VITE_PORTAL_MODE` in the
`webServer.env` block.

For the E2E nightly workflow, `VITE_PORTAL_MODE` is now injected via the workflow
`env:` block (set to `client` for the first job and `admin` for the second job).
Vite's dev server picks up process environment variables, so the workflow-level
injection is sufficient without modifying the config file.

However, if the e2e-test-engineer adds test files that are admin-portal-specific
(e.g. `frontend/e2e/pages/admin-*.spec.ts`), the config will need a second
`webServer` project entry or a conditional `VITE_PORTAL_MODE` env injection inside
the config itself — for example:

```ts
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:5173',
  reuseExistingServer: !process.env.CI,
  timeout: 120 * 1000,
  env: {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://mock.supabase.co',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key',
    // Pass through VITE_PORTAL_MODE from the workflow env
    VITE_PORTAL_MODE: process.env.VITE_PORTAL_MODE || 'client',
  },
},
```

That change must be verified with a local `npx playwright test` run before
committing. The devops-engineer does not modify the config unilaterally — raise
this with the e2e-test-engineer agent at Gate 4 of the next feature cycle or when
admin portal E2E specs are authored.

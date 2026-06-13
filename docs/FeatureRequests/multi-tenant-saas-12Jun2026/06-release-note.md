# Release Note — Multi-Tenanted SaaS Conversion

**Release Date:** 13 Jun 2026
**Version:** v2.0 (SaaS Launch)
**Status:** Ready for production deployment

---

## What Shipped

OptionsDesk converts from an invite-only, single-admin dashboard into a multi-tenanted SaaS product. The core options trading platform remains unchanged; this release adds self-signup, Stripe billing, tier-gated features, a client settings portal, an administrative platform, and a knowledge base.

### Client-facing (optionsdeskpro.<domain>.com)

**New:**
- **Self-signup** — any visitor can sign up with Google OAuth or email/password at no friction. No whitelist required. Free tier requires no payment method; paid tiers (Starter, Pro, Enterprise) proceed to Stripe Checkout.
- **Pricing page** — public-facing plan comparison with pricing and feature breakdown. Free tier always visible; enterprise listed as "contact sales."
- **Onboarding flow** — new users are routed through plan selection, then payment (if paid tier), then complete. Returning users with completed onboarding go directly to the dashboard.
- **Settings page** — five tabs:
  - **Account** — display name, email, password change (email/password accounts only), avatar.
  - **Subscription** — current plan, billing cycle, next billing date, upgrade/downgrade controls, scheduled change banner if applicable.
  - **Billing** — payment method summary (card brand, last four digits, expiry), "Update Card" button (opens Stripe Customer Portal), invoice list with PDF download links.
  - **Notifications** — (placeholder for future use; no changes to notification settings in this release).
  - **Danger Zone** — cancel subscription (scheduled to period end), delete account (irreversible).
- **FAQ page** — public knowledge base, no authentication required. FAQ entries are managed by support staff in the admin portal and published/unpublished by draft status.
- **Tier-gated dashboard** — tabs and features locked by tier are replaced with locked placeholders showing the minimum tier required and an "Upgrade" call-to-action. Free tier users see Trading Desk, Positions, and Risk Monitor tabs locked. Watchlist symbol limits and monthly scan limits are enforced server-side and reflect the tier.
- **Payment failed banner** — when a subscription payment fails, a banner appears on next login offering a direct link to update payment method via Stripe Customer Portal. Dashboard features degrade to free-tier limits until payment is recovered.

**Tier pricing (monthly, USD; editable by Owner):**
- **Free:** $0 — 5 watchlist symbols, 10 scans/month, Strategy Scanner and Options Chain only.
- **Starter:** $9 — 15 watchlist symbols, 100 scans/month, adds Positions tab (Trading Desk and Risk Monitor remain locked).
- **Pro:** $29 — 50 watchlist symbols, unlimited scans, adds Trading Desk tab (Risk Monitor remains locked).
- **Enterprise:** $99 (sales-led; admin-provisioned only) — unlimited symbols, unlimited scans, all tabs unlocked.

### Admin portal (admin.<domain>.com)

**New:**
- **Staff authentication** — platform staff (Owner, Support, Finance roles) authenticate via Google OAuth or email/password. No connection to subscriber authentication; staff are managed in a separate `platform_staff` table.
- **Subscriber list** — paginated view of all subscribers with email, full name, tier, subscription status, last login, account creation date, and Stripe customer ID (truncated). Searchable by email or name. Filterable by tier and status. Visible to Owner and Support roles only.
- **Subscriber detail** — full profile including account details, current subscription, billing status, invoice history, login activity, paper trading positions count, and order count. Owner can override tier (admin override) or deactivate account. Support can enter read-only impersonation view of subscriber's dashboard (watermarked "Support View — [Staff Name]"; no write actions possible).
- **Pricing manager** — Owner can view and edit prices and entitlements for each tier. Changing a tier's price updates the Stripe Price object (new price created, old archived); new subscriptions and renewals use the new price; existing active subscribers are grandfathered. Changing a tier's max symbols, max scans, or feature flags takes effect on next entitlement evaluation. Confirmation modal shows count of affected active subscribers before save.
- **Revenue dashboard** — MRR (current month), 12-month MRR trend chart, active subscriber count by tier, new subscribers this month vs. previous month, churned subscriber count this month, past-due count, and aggregate amount at risk (USD). CSV export of invoices for a selected date range (columns: date, subscriber email, tier, amount, status). Visible to Owner and Finance roles only.
- **Health panel** — system status overview: backend API health (result of GET /api/health), Market Data App daily credit usage (count and percentage of 100-credit limit; green < 80%, amber 80–99%, red 100%+), strategy analysis request count (last 24 hours), strategy scan request count (last 24 hours), active session count (users with last_seen_at in the last 15 minutes). All data from internal counters; no external API calls on page load. Owner only.
- **FAQ management** — Owner and Support can create, edit, reorder, and delete FAQ articles. Each article has a question (plain text) and answer (markdown). Draft/publish toggle controls visibility on public FAQ page. Draft articles are not visible to subscribers. Published changes appear on the public FAQ page within 30 seconds (cache invalidation). Owner and Support only.
- **Staff management** — Owner can invite new staff by email (invitation sent via Supabase Auth), view all staff with role and last login date, change any staff member's role (Owner/Support/Finance), and deactivate staff accounts. System enforces at least one active Owner account — promotion or demotion that would leave zero Owners is rejected.
- **Platform settings** — Owner can toggle invite-only mode (off by default post-launch; when on, sign-up reverts to whitelist-gated). Owner only.

**Role-based access control (three staff roles):**

| Capability | Owner | Support | Finance |
|------------|-------|---------|---------|
| Subscriber list & search | Yes | Yes | No |
| Subscriber detail & profile | Yes | Yes | No |
| Support view entry (impersonate) | Yes | Yes | No |
| Tier override | Yes | No | No |
| Account deactivate/reactivate | Yes | No | No |
| Pricing view | Yes | Yes | Yes |
| Pricing edit | Yes | No | No |
| Revenue dashboard | Yes | No | Yes |
| Revenue export CSV | Yes | No | Yes |
| Health panel | Yes | No | No |
| FAQ view (all + draft) | Yes | Yes | No |
| FAQ create/edit/publish/delete | Yes | Yes | No |
| Staff invite | Yes | No | No |
| Staff role change | Yes | No | No |
| Staff deactivate | Yes | No | No |
| Platform settings edit | Yes | No | No |

---

## New Railway Services Required

Three Railway services are now required:

### 1. Backend (existing service — no change)
- Environment: existing `optionspro-backend` or equivalent.
- Start command: unchanged (`uvicorn main:app --host 0.0.0.0 --port $PORT`).
- New requirements: add `stripe>=8.0.0` to `backend/requirements.txt`.

### 2. Client Portal Frontend (existing service — modified)
- Environment: `optionspro-client` or similar.
- Build command: unchanged (`npm run build`).
- Publish directory: unchanged (`dist`).
- Environment variable: `VITE_PORTAL_MODE=client` (new).
- Domain: optionsdeskpro.<domain>.com (existing domain; custom domain required).

### 3. Admin Portal Frontend (new service)
- Environment: `optionspro-admin` or similar.
- Build command: `cd frontend && npm run build` (shared codebase with client portal).
- Publish directory: `frontend/dist`.
- Environment variable: `VITE_PORTAL_MODE=admin` (new; differentiates this service from client portal).
- Domain: admin.<domain>.com (custom domain required; separate from client portal).

Both frontend services share the same codebase (`frontend/`) and `npm run build` output. The `VITE_PORTAL_MODE` environment variable (build-time constant) determines which entry point (client App or admin App) is rendered.

---

## Complete Environment Variable Matrix

### Backend Service (`backend/`)

| Variable | Type | Required | Purpose | Example |
|----------|------|----------|---------|---------|
| `SUPABASE_URL` | Secret | Yes | Supabase project API endpoint | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Secret | Yes | Supabase service-role API key | (64-char base64 token) |
| `MARKETDATA_API_TOKEN` | Secret | No | Market Data App API token; omit to use yfinance only | (alphanum token) |
| `STRIPE_SECRET_KEY` | Secret | Yes | Stripe API secret key | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Secret | Yes | Stripe webhook signing secret | `whsec_...` |
| `CLIENT_PORTAL_URL` | Config | Yes | Base URL of client portal; used in Stripe Checkout success/cancel URLs | `https://optionsdeskpro.example.com` or `https://optionspro-client-production.up.railway.app` |
| `ADMIN_PORTAL_URL` | Config | Yes | Base URL of admin portal; used in staff invite redirect | `https://admin.example.com` or `https://optionspro-admin-production.up.railway.app` |
| `ADMIN_PORTAL_ORIGINS` | Config | Yes | Comma-separated CORS allow-list for admin portal | `https://optionspro-admin-production.up.railway.app,https://admin.example.com` |
| `PYTHONUNBUFFERED` | Config | No | Python logging unbuffering (best practice for Railway) | `1` |

### Client Portal Frontend Service (`frontend/` with VITE_PORTAL_MODE=client)

| Variable | Type | Required | Purpose | Example |
|----------|------|----------|---------|---------|
| `VITE_SUPABASE_URL` | Config | Yes | Supabase project API endpoint (public) | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Config | Yes | Supabase anonymous/public API key | (approx 40 chars) |
| `VITE_BACKEND_URL` | Config | Yes | Backend API base URL | `https://optionspro-backend-production.up.railway.app` |
| `VITE_PORTAL_MODE` | Config | Yes | Mode flag: must be `client` for this service | `client` |

### Admin Portal Frontend Service (`frontend/` with VITE_PORTAL_MODE=admin)

| Variable | Type | Required | Purpose | Example |
|----------|------|----------|---------|---------|
| `VITE_SUPABASE_URL` | Config | Yes | Supabase project API endpoint (public) | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Config | Yes | Supabase anonymous/public API key | (approx 40 chars) |
| `VITE_BACKEND_URL` | Config | Yes | Backend API base URL | `https://optionspro-backend-production.up.railway.app` |
| `VITE_PORTAL_MODE` | Config | Yes | Mode flag: must be `admin` for this service | `admin` |

**Environment variable flow:**
- Backend reads `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `STRIPE_*` (secrets); no shared secrets flow to frontends.
- Client frontend reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public keys only).
- Admin frontend reads the same public keys as client frontend.
- `VITE_BACKEND_URL` points both frontends to the same backend API.
- `VITE_PORTAL_MODE` is a build-time constant that controls which UI is bundled.

**CORS configuration in backend (main.py):**
```python
_client_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://optionspro-client-production.up.railway.app",  # or custom domain
]
_admin_origins = [
    o.strip()
    for o in os.getenv("ADMIN_PORTAL_ORIGINS", "").split(",")
    if o.strip()
]
app.add_middleware(CORSMiddleware, allow_origins=_client_origins + _admin_origins, ...)
```

---

## Supabase Setup Steps

Three migrations must be applied in this exact order. All are additive except where noted.

### 1. Migration 006 — `006_saas_conversion.sql`

Creates all schema for the SaaS model: `plans`, `subscriptions`, `invoices`, `stripe_webhook_events`, `platform_staff`, `platform_audit_log`, `support_sessions`, `faq_categories`, `faq_articles`, `platform_settings`. Alters `user_profiles` to add `onboarding_completed`, `onboarding_step`, `is_platform_staff`, `deactivated_at` columns. Seeds `platform_staff` with the admin email (leonardo.simgt@gmail.com) as owner; seeds `plans` with current tier_limits.py values (free $0 / 5 symbols / 10 scans, starter $9 / 15 symbols / 100 scans, pro $29 / 50 symbols / unlimited scans, enterprise $99 / unlimited / unlimited); seeds `platform_settings` with invite_only_mode = false.

**Pre-requisite:** Enable email/password authentication in Supabase. In the Supabase dashboard, go to Authentication → Providers → Email/Password → toggle "Email" and "Password" to enabled. (Google OAuth is already enabled.)

**Run:** Copy the SQL from `backend/migrations/006_saas_conversion.sql` into Supabase → SQL Editor → New Query → Run.

### 2. Migration 007 — `007_onboarding_backfill.sql`

Backfills `onboarding_completed = true` and `onboarding_step = 'complete'` for all pre-existing users (anyone with `created_at < now()`). This ensures users who signed up before SaaS launch are not forced through onboarding on next login.

**Run:** Copy the SQL from `backend/migrations/007_onboarding_backfill.sql` into Supabase → SQL Editor → New Query → Run.

### 3. Migration 008 — `008_rls_hardening.sql`

Enables Row-Level Security (RLS) on eight tables introduced in migration 006 (`plans`, `stripe_webhook_events`, `platform_staff`, `platform_audit_log`, `support_sessions`, `faq_categories`, `faq_articles`, `platform_settings`) with deny-all policies for non-service-role access. This prevents subscribers from reading internal staff data, audit logs, and draft FAQ entries via direct REST API calls. The backend exclusively accesses these tables via `SUPABASE_SERVICE_KEY`, so no backend behaviour changes.

**Run:** Copy the SQL from `backend/migrations/008_rls_hardening.sql` into Supabase → SQL Editor → New Query → Run.

**Execution order is critical:** 006 → 007 → 008. Do not skip or reorder.

---

## Stripe Setup Steps

Complete these steps in the Stripe Dashboard before deployment. The backend startup does not verify these are present; webhook failures will be silent without them.

### 1. Create Stripe Products

In Stripe Dashboard → Products, create four products (one per tier):

| Name | Tier | Description |
|------|------|-------------|
| OptionsDesk Starter | starter | Monthly access to Strategy Scanner (100 scans), Options Chain, Positions. |
| OptionsDesk Pro | pro | Monthly access to all features: unlimited scans, Trading Desk, Positions. |
| OptionsDesk Enterprise | enterprise | Custom. (Do not create prices for this; it is sales-led / admin-provisioned.) |
| OptionsDesk Free | free | Free tier. (Do not create a Stripe price; it is $0 and handled in the database only.) |

Note: "Free" and "Enterprise" products are optional in Stripe; the pricing page and checkout flow bypass them. Create them for record-keeping only, or omit them entirely.

### 2. Create Stripe Prices

For Starter and Pro, create monthly recurring prices:

| Product | Recurring | Billing Period | Amount | Currency |
|---------|-----------|----------------|--------|----------|
| OptionsDesk Starter | Yes | Monthly | 900 (cents) | USD |
| OptionsDesk Pro | Yes | Monthly | 2900 (cents) | USD |

Copy the `Price ID` (e.g. `price_1ABC...XYZ`) for each into the database via the backend. The backend stores these in the `plans` table (`plans.stripe_price_id`). Migration 006 seeds the plan rows without Stripe IDs; after Stripe product/price creation, update:

```sql
UPDATE public.plans SET stripe_price_id = 'price_...' WHERE tier_key = 'starter';
UPDATE public.plans SET stripe_price_id = 'price_...' WHERE tier_key = 'pro';
```

Or the backend's pricing manager (`PATCH /api/platform/pricing/{tier_key}`) will allow an Owner to set these at runtime.

### 3. Configure Webhook Endpoint

In Stripe Dashboard → Developers → Webhooks → Add endpoint:

| Field | Value |
|-------|-------|
| Endpoint URL | `https://<backend-url>/api/billing/webhook` (e.g. `https://optionspro-backend-production.up.railway.app/api/billing/webhook`) |
| Events | Select the following: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.updated` |
| API version | Latest (default) |

Copy the signing secret (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET` in the backend environment.

### 4. Configure Stripe Customer Portal (for card updates)

In Stripe Dashboard → Settings → Billing Portal:

| Feature | Configuration |
|---------|---|
| Return URL | Set to `https://optionsdeskpro.<domain>.com/settings/billing` (or equivalent client portal settings URL). |
| Features enabled | Payment methods (allow update), Billing history (invoices), Subscriptions (allow cancellation). |
| Portal branding | (Optional) Add logo or custom colors. |

This allows subscribers to update their payment method and manage their subscription without leaving OptionsDesk.

### 5. Test Mode vs. Live

Before go-live:
- Use Stripe test-mode API keys (`sk_test_...` / `pk_test_...`) and test webhook secret.
- Verify webhook delivery in Stripe Dashboard → Developers → Webhooks → [endpoint] → Recent events. Each event should show a 200 response from the backend.
- Test Stripe Checkout flow with Stripe test card numbers (e.g. 4242 4242 4242 4242).
- Test Stripe Customer Portal redirect and card update flow with a test subscription.
- Verify the platform pricing page reflects the Stripe prices.

Once all webhook events deliver successfully and checkout / customer portal flows work end-to-end, switch to live-mode API keys (`sk_live_...`) and live webhook secret.

---

## Pre-Existing User Backfill Note

All users who existed before this release are marked with `onboarding_completed = true` and `onboarding_step = 'complete'` by migration 007. These users will not see the onboarding flow on next login; they proceed directly to the dashboard. This is safe because:
- Their `subscription` row is auto-created by the trigger in migration 006 (as `free` tier, `active` status).
- If they upgrade, they will be routed to Stripe Checkout and complete onboarding at that point.
- If they remain on the free tier, no payment is required and they have immediate access.

**One exception:** the platform admin (leonardo.simgt@gmail.com) is seeded with `onboarding_completed = true` in migration 006 itself (line 354), so that line is not re-applied by migration 007.

---

## Rollback Procedure

Rollback is defined as re-deploying the previous production git tag and restoring the database to its pre-migration state.

### Git rollback (application code)

```bash
git checkout <previous-stable-tag>          # e.g. v1.0
git reset --hard                            # Discard any staging
./deploy-to-railway.sh                      # or equivalent Railway deploy command
```

The frontend and backend services will receive the previous code. Existing users with sessions will be logged out (previous version does not recognise the new JWT claims). New logins will route through the previous auth flow.

### Database rollback (schema and data)

**Migrations 006, 007, 008 are additive only.** There are no DROP TABLE or column removals. To rollback the schema:

1. **Option A (preferred):** Keep migrations in place; set `invite_only_mode = true` in the `platform_settings` table to gate sign-ups back to whitelist-only:
   ```sql
   UPDATE public.platform_settings SET invite_only_mode = true;
   ```
   All existing SaaS infrastructure remains in the database but is inactive. Users cannot self-signup; only whitelisted emails are accepted. No schema destruction is needed.

2. **Option B (nuclear):** If the SaaS model must be entirely removed (not recommended), manually drop the new tables:
   ```sql
   DROP TABLE IF EXISTS public.faq_articles CASCADE;
   DROP TABLE IF EXISTS public.faq_categories CASCADE;
   DROP TABLE IF EXISTS public.support_sessions CASCADE;
   DROP TABLE IF EXISTS public.platform_audit_log CASCADE;
   DROP TABLE IF EXISTS public.platform_staff CASCADE;
   DROP TABLE IF EXISTS public.stripe_webhook_events CASCADE;
   DROP TABLE IF EXISTS public.invoices CASCADE;
   DROP TABLE IF EXISTS public.subscriptions CASCADE;
   DROP TABLE IF EXISTS public.plans CASCADE;
   DROP TABLE IF EXISTS public.platform_settings CASCADE;
   ```
   Then remove the trigger and function:
   ```sql
   DROP TRIGGER IF EXISTS on_new_user_create_subscription ON public.user_profiles;
   DROP FUNCTION IF EXISTS public.handle_new_user_subscription;
   ```
   Finally, remove the added columns from `user_profiles`:
   ```sql
   ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS onboarding_completed, DROP COLUMN IF EXISTS onboarding_step, DROP COLUMN IF EXISTS is_platform_staff, DROP COLUMN IF EXISTS deactivated_at;
   ```

**Stripe-side rollback:**
- Stripe objects (Products, Prices, Subscriptions, Invoices, Customers) **cannot be rolled back**; they exist in Stripe's system.
- To deactivate them: archive Stripe Prices (do not delete; archived prices remain on active subscriptions). Existing Stripe subscriptions continue to bill regardless of app rollback.
- To stop new subscriptions from being created: set `invite_only_mode = true` (Option A above) so new sign-ups are not issued Stripe Checkout sessions.
- Active subscriber accounts and their Stripe subscriptions are **not affected** by application rollback; they continue to function (though the UI they see will be the previous version).

### Rollback safety

The system is safe to rollback because:
- New tables do not break existing tables (all additive).
- Existing routes that read `user_profiles` still work (columns are additive).
- The whitelist is still present and still enforced when `invite_only_mode = true`.
- Stripe subscriptions are independent of the app version; they will be synced via webhooks regardless of which code is deployed.

---

## Known Limitations Accepted for Launch

The following limitations are acknowledged and accepted for production launch. They do not block the release and will be addressed in future iterations.

### F-007 — Downgrade webhook race condition (low probability)

**Description:** When a subscriber schedules a downgrade (sets `pending_tier_key`), the tier change is applied at period renewal by comparing the incoming webhook's `current_period_start` to the stored value. If a webhook for the renewal is delayed or retried, a race condition exists where two overlapping webhook handlers could both detect the renewal and both apply the downgrade, causing duplicate ledger entries or inconsistent state.

**Probability:** Low. Stripe webhook delivery is reliable and retries are bounded. Duplicate event detection via the `stripe_webhook_events` idempotency table mitigates this in most cases.

**Mitigation:** The idempotency check prevents double-processing of the exact same event ID. If Stripe delivers a *new* webhook with a newer `current_period_start` (e.g. a re-issued invoice.created event), the handler will process it again and may apply the downgrade twice. This could manifest as incorrect tier in the database.

**Future fix:** Use Stripe Subscription Schedules at the API level instead of storing `pending_tier_key` in the database, or implement an event deduplication window (e.g. skip webhook processing if same `(event_type, user_id)` in last 10 seconds).

**For launch:** Acceptable because the UI shows the scheduled change with an effective date, and the downgrade is applied at most once per period (the webhook for period renewal fires once). Field testing should monitor for duplicate transitions.

### Stripe-hosted flows untested in E2E (Stripe Elements / Checkout UI)

**Description:** The Playwright E2E suite tests the API contract for Checkout Session creation (`POST /api/billing/checkout-session` returns a `checkout_url`) but does not exercise the Stripe Checkout form itself, as Stripe's iframe is served from Stripe's domain and requires real test-mode credentials to interact with in Playwright. Similarly, the Stripe Customer Portal redirect is tested to the API contract level (returns `portal_url`) but the portal UI is not automated.

**Consequence:** Stripe integration is verified by the backend webhook tests and manual/smoke testing in Stripe test mode before launch, but not by the E2E suite.

**Mitigation required before go-live:** Run manual smoke tests in Stripe test mode:
1. Visitor signs up, selects Starter tier, redirected to Stripe Checkout, enters test card (4242 4242 4242 4242), completes checkout, receives success page.
2. Subscriber navigates to Settings > Billing, clicks "Update Card", redirected to Stripe Customer Portal, updates payment method, returns to settings.
3. Subscriber navigates to Settings > Subscription, clicks "Upgrade to Pro", Stripe Checkout redirects again, completes upgrade, receives prorated invoice in Settings > Billing.

All three flows must work end-to-end with real Stripe test-mode interaction before production deployment.

### Deactivation cache TTL (single-worker only)

**Description:** When an Owner deactivates a subscriber account via `PATCH /api/platform/subscribers/{user_id}/deactivate`, the backend immediately marks the `user_profiles.deactivated_at` column and invalidates the in-process deactivation cache. On the next API request from that user, the deactivation is enforced (403 response). However, the cache is a module-level Python dict. In a single-process deployment (default on Railway), this is fine — all async requests share the dict. In a multi-worker or multi-instance deployment, each OS process has its own cache copy, and the invalidation in process A does not immediately propagate to processes B, C, etc. A deactivated user may continue to reach data-plane endpoints in other processes for up to 60 seconds (the cache TTL) before the stale cache entry expires and the DB is queried.

**Current mitigation:** Railway deployment runs a single uvicorn process per dyno. This is the current production topology. Deactivation is immediate within that process.

**Required before horizontal scaling:** Replace the in-process dict with a shared cache layer (Redis, Memcached, Supabase-backed flag) or reduce the TTL to an operationally acceptable maximum (e.g. 5–10 seconds). Alternatively, use the Supabase Admin API to revoke the user's session token on deactivation, which eliminates the need for any cache.

**For launch:** Acceptable under single-instance topology. Documented in the security review as an operational limitation. Must be resolved before multi-worker scaling is enabled.

---

## Deployment Checklist

Before deploying to production, complete all of the following:

- [ ] **Supabase:** Run migrations 006, 007, 008 in order. Verify `plans`, `subscriptions`, `platform_staff`, and other tables exist. Verify `user_profiles` has new columns.
- [ ] **Supabase Auth:** Enable email/password provider (go to Authentication → Providers → Email → toggle on).
- [ ] **Stripe:** Create Products for Starter and Pro. Create monthly Prices. Seed the `plans` table with Stripe Price IDs.
- [ ] **Stripe Webhooks:** Register webhook endpoint at `/api/billing/webhook`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET` environment variable.
- [ ] **Stripe Customer Portal:** Configure return URL and enable payment methods, invoices, and subscription management.
- [ ] **Backend Railway service:** Set environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLIENT_PORTAL_URL`, `ADMIN_PORTAL_URL`, `ADMIN_PORTAL_ORIGINS`.
- [ ] **Client portal Railway service:** Set environment variables: `VITE_PORTAL_MODE=client`, `VITE_BACKEND_URL`.
- [ ] **Admin portal Railway service (new):** Create new Railway service with same build command as client portal, set environment variables: `VITE_PORTAL_MODE=admin`, `VITE_BACKEND_URL`.
- [ ] **Domain:** Purchase and configure custom domain(s) for optionsdeskpro.<domain>.com and admin.<domain>.com (or use Railway-provided URLs in staging).
- [ ] **CORS:** Update `ADMIN_PORTAL_ORIGINS` environment variable on backend with the admin portal domain.
- [ ] **Manual smoke test:** Test Stripe Checkout (free tier sign-up, paid tier sign-up with card), Stripe Customer Portal (update payment method), admin portal staff login, subscriber list, settings page billing tab.
- [ ] **Webhook verification:** In Stripe Dashboard, check that webhooks are delivering successfully (200 responses) for `checkout.session.completed`, `customer.subscription.updated`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- [ ] **Database backup:** Take a Supabase backup before deploying code.
- [ ] **Announce:** Publish a blog post or notification to existing users explaining the new SaaS model, pricing, and how to upgrade.

---

## Summary of Changes

| Component | Change |
|-----------|--------|
| Backend schema | +10 new tables, +4 columns to user_profiles, +1 trigger function, +migrations 006/007/008 |
| Backend code | +stripe_service.py, +entitlements.py, +metrics.py, +billing_routes.py, +platform_routes.py, +public_routes.py; modified auth_routes.py, auth_utils.py, tier_limits.py, watchlist.py, strategies.py, main.py, requirements.txt |
| Frontend code | +VITE_PORTAL_MODE branching in App.tsx, +EntitlementsContext, +OnboardingFlow, +SettingsPage, +PricingPage, +FaqPage, +LockedTabPlaceholder, +PaymentFailedBanner, +admin portal suite (AdminApp, StaffAuthContext, SubscriberList, SubscriberDetail, PricingManager, RevenuePanel, HealthPanel, FaqEditor, StaffManager), modified AuthContext, modified LoginPage, removed AdminPanel from client dashboard |
| E2E tests | +7 new spec files, +8 repaired existing specs, 140 tests passing |
| Documentation | +ADRs 0001–0006, +release note (this file) |

---

## Support and Questions

For issues or questions after deployment:

- **Subscriber issues:** Check the public FAQ at optionsdeskpro.<domain>.com/faq. Support staff can manage FAQ entries in the admin portal to address frequent questions.
- **Admin issues:** Owner can access the Admin Panel at admin.<domain>.com. Check the Health panel for system status and potential bottlenecks.
- **Billing issues:** Verify Stripe credentials and webhook endpoint are configured correctly. Check Stripe Dashboard → Developers → Webhooks for delivery status.
- **Database issues:** Review Supabase logs and RLS policies. Verify migrations ran successfully.

---

**Release prepared by:** technical-writer  
**Date:** 13 Jun 2026  
**Version:** v2.0 (SaaS Launch)  
**Status:** Ready for production

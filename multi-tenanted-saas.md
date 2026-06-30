# OptionsDesk — Multi-Tenanted SaaS Architecture

**Status:** Superseded by current production implementation. See [ARCHITECTURE.md](./ARCHITECTURE.md), [CLAUDE.md](./CLAUDE.md), and [README.md](./README.md) for current state.

**Legacy version:** 1.0 — Design document archived below for historical reference.

---

## 1. Product Overview

OptionsDesk is an AI-driven paper-trading options dashboard. This document redesigns it as a fully multi-tenanted SaaS from day one: public marketing site, self-serve sign-up, tiered subscriptions billed monthly via Stripe, and an admin console for operations.

### Core features by layer

| Layer | What it does |
|---|---|
| **Marketing site** | Public landing page, pricing table, sign-up CTA |
| **Auth** | Email/password + Google OAuth via Supabase; phone verification via Twilio |
| **Onboarding** | Post-signup flow: verify phone → choose plan → enter card → welcome |
| **Dashboard** | Options scanning, strategy analysis, paper trading — gated by tier |
| **Settings** | Account details, subscription management, billing, invoices |
| **Admin console** | User management, subscription overrides, revenue stats |

---

## 2. Subscription Tiers & Add-ons

### Base tiers

| | L1 — Starter | L2 — Pro | L3 — Elite |
|---|---|---|---|
| Watchlist size | 1 symbol | 3 symbols | 8 symbols |
| Watchlist change cooldown | 30 days | 14 days | None |
| Trading Desk workspace | — | ✓ | ✓ |
| Strategy scanner | ✓ | ✓ | ✓ |
| Options chain | ✓ | ✓ | ✓ |

### Add-ons (purchasable on any tier)

| Add-on | Unlocks |
|---|---|
| **Trades Monitoring** | Positions tab + 90-day P&L chart |
| **Risk Monitor** | Everything in Trades Monitoring + Risk Monitor panel (supersedes it) |

> **Entitlement rule:** `trades_monitoring = addon_trades OR addon_risk`. `risk_monitor = addon_risk only`.

### Lifecycle rules

- **Upgrade (tier or add-on):** Takes effect immediately. Stripe creates a prorated charge for the remainder of the billing period.
- **Downgrade / cancel add-on:** Takes effect at the end of the current billing period (`cancel_at_period_end = true`). No refund for current period.
- **Cancel subscription:** At period end. User retains access until then.
- **Reactivate:** Allowed any time before period end (removes scheduled cancellation).

---

## 3. User Journeys

### 3.1 New visitor → subscriber

```
Landing page (/)
  → clicks "Get Started" or "View Pricing"
  → Pricing section (anchor on landing page)
  → clicks "Sign up" on a plan card
  → /auth?plan=L2  (auth page, pre-selects plan)
  → Signs up with Google or email+password
  → Supabase sends verification email (if email/password)
  → /onboarding
      Step 1: Verify phone (Twilio SMS OTP)
      Step 2: Review chosen plan + add-ons
      Step 3: Enter payment (Stripe Elements embedded card form)
      Step 4: Welcome screen → "Go to Dashboard"
  → /app  (dashboard, gated by entitlements)
```

### 3.2 Returning user → login

```
Landing page (/) or direct /auth
  → "Sign in" link
  → Google OAuth or email+password
  → /app  (directly, skipping onboarding)
```

### 3.3 Subscription management

```
/app → top-right avatar → "Settings"
  → /app/settings#subscription
  → Change tier (upgrade: immediate; downgrade: scheduled)
  → Toggle add-ons (enable: immediate + prorated; disable: at period end)
  → Update credit card → Stripe Customer Portal
  → Download invoice PDF (inline list)
  → Cancel subscription → confirmation modal
```

### 3.4 Admin operations

```
/app → avatar → "Admin" (only visible to admins)
  → /admin/users         User list, activate/deactivate, override subscription
  → /admin/subscriptions Plan + add-on management per user
  → /admin/stats         Revenue, active users, plan distribution
```

---

## 4. Database Schema

Design principles:
- RLS enabled on every user-data table; service role key bypasses for backend
- Stripe is the source of truth for billing; DB mirrors it via webhooks
- `auth.users` is owned by Supabase; all app data hangs off `user_id` FK to it
- Catalog tables (plans, addons) are seeded, not user-editable
- No whitelist table in the SaaS model — anyone can sign up; entitlements control access

```sql
-- ─────────────────────────────────────────────
-- CATALOG TABLES (seeded by migration, read-only)
-- ─────────────────────────────────────────────

CREATE TABLE public.plans (
    id                  TEXT PRIMARY KEY,          -- 'L1' | 'L2' | 'L3'
    name                TEXT        NOT NULL,       -- 'Starter' | 'Pro' | 'Elite'
    price_monthly       DECIMAL(10,2) NOT NULL,
    max_watchlist       INT         NOT NULL,
    change_cooldown_days INT        NOT NULL DEFAULT 30,
    trading_desk        BOOLEAN     NOT NULL DEFAULT false,
    stripe_price_id     TEXT,                       -- set after Stripe product creation
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.plans VALUES
  ('L1', 'Starter', 0.00,  1, 30, false, null, now()),
  ('L2', 'Pro',     29.00, 3, 14, true,  null, now()),
  ('L3', 'Elite',   79.00, 8,  0, true,  null, now());

CREATE TABLE public.addons (
    id                  TEXT PRIMARY KEY,           -- 'trades_monitoring' | 'risk_monitor'
    name                TEXT        NOT NULL,
    price_monthly       DECIMAL(10,2) NOT NULL,
    stripe_price_id     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.addons VALUES
  ('trades_monitoring', 'Trades Monitoring', 9.00,  null, now()),
  ('risk_monitor',      'Risk Monitor',      19.00, null, now());


-- ─────────────────────────────────────────────
-- USER PROFILE (extends Supabase auth.users)
-- ─────────────────────────────────────────────

CREATE TABLE public.user_profiles (
    id                   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name            TEXT,
    phone                TEXT,
    phone_verified       BOOLEAN     NOT NULL DEFAULT false,
    stripe_customer_id   TEXT        UNIQUE,
    avatar_url           TEXT,
    onboarding_completed BOOLEAN     NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_profiles_own" ON public.user_profiles
    FOR ALL USING (auth.uid() = id);


-- ─────────────────────────────────────────────
-- SUBSCRIPTIONS (one per user, Stripe-backed)
-- ─────────────────────────────────────────────

CREATE TABLE public.subscriptions (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id                     TEXT        NOT NULL REFERENCES public.plans(id) DEFAULT 'L1',
    stripe_subscription_id      TEXT        UNIQUE,
    stripe_subscription_item_id TEXT,                   -- base plan item on Stripe subscription
    status                      TEXT        NOT NULL DEFAULT 'active',
    -- status values: active | trialing | past_due | canceled | incomplete
    current_period_start        TIMESTAMPTZ,
    current_period_end          TIMESTAMPTZ,
    cancel_at_period_end        BOOLEAN     NOT NULL DEFAULT false,
    last_watchlist_change_at    TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_own" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- USER ADD-ONS (active add-ons per user)
-- ─────────────────────────────────────────────

CREATE TABLE public.user_addons (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    addon_id                    TEXT        NOT NULL REFERENCES public.addons(id),
    stripe_subscription_item_id TEXT,                   -- add-on item on Stripe subscription
    active_from                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    active_until                TIMESTAMPTZ,            -- NULL = still active; set at period end on cancel
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.user_addons (user_id, addon_id) WHERE active_until IS NULL;

ALTER TABLE public.user_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_addons_own" ON public.user_addons
    FOR SELECT USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- INVOICES (synced from Stripe webhooks)
-- ─────────────────────────────────────────────

CREATE TABLE public.invoices (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_invoice_id   TEXT        UNIQUE NOT NULL,
    amount_due          DECIMAL(10,2) NOT NULL,
    amount_paid         DECIMAL(10,2) NOT NULL,
    currency            TEXT        NOT NULL DEFAULT 'usd',
    status              TEXT        NOT NULL,           -- paid | open | void | uncollectible
    description         TEXT,
    period_start        TIMESTAMPTZ,
    period_end          TIMESTAMPTZ,
    invoice_pdf         TEXT,                           -- Stripe-hosted PDF URL
    hosted_invoice_url  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_own" ON public.invoices
    FOR SELECT USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- USER WATCHLIST (per-user, symbol list)
-- ─────────────────────────────────────────────

CREATE TABLE public.user_watchlist (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol      TEXT        NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, symbol)
);
CREATE INDEX ON public.user_watchlist (user_id);

ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_own" ON public.user_watchlist
    FOR ALL USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- PAPER TRADING (existing tables, kept as-is)
-- ─────────────────────────────────────────────
-- portfolios       (user_id, cash)
-- orders           (user_id, symbol, expiry, strike, option_type, action, quantity, price, status)
-- positions        (user_id, symbol, expiry, strike, option_type, quantity, avg_cost, strategy_key, ...)
-- pnl_snapshots    (user_id, snapshot_date, portfolio_value, cash, positions_value, total_pnl)
-- (Existing RLS policies retained)


-- ─────────────────────────────────────────────
-- ACTIVITY LOG (audit trail)
-- ─────────────────────────────────────────────

CREATE TABLE public.activity_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type  TEXT        NOT NULL,   -- 'login' | 'watchlist_change' | 'plan_change' | 'order_placed' | ...
    payload     JSONB,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.activity_log (user_id, created_at DESC);

-- No RLS: only service role writes; admin reads via service role


-- ─────────────────────────────────────────────
-- ADMIN USERS (explicit grant table)
-- ─────────────────────────────────────────────

CREATE TABLE public.admin_users (
    user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_by  UUID        REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: insert admin after they first log in
-- INSERT INTO public.admin_users (user_id)
-- SELECT id FROM auth.users WHERE email = 'leonard.simgt@gmail.com';


-- ─────────────────────────────────────────────
-- HELPER: auto-create subscription row on first login
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, 'L1', 'active')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_user_profile
    AFTER INSERT ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_subscription();
```

---

## 5. Entitlements Computation

Computed server-side on every request to `/api/auth/entitlements`. Never trust the client.

```python
def compute_entitlements(user_id: str) -> dict:
    sub  = fetch subscription row (plan_id, last_watchlist_change_at, status)
    plan = fetch plan row (max_watchlist, change_cooldown_days, trading_desk)

    if sub.status in ('canceled', 'past_due'):
        # degrade to L1 read-only; they can still log in and see settings
        plan = PLANS['L1']

    active_addons = fetch user_addons where user_id = user_id AND active_until IS NULL
    addon_ids     = {row.addon_id for row in active_addons}

    trades_monitoring = 'trades_monitoring' in addon_ids or 'risk_monitor' in addon_ids
    risk_monitor      = 'risk_monitor' in addon_ids

    can_change, next_change_allowed = compute_cooldown(
        plan.change_cooldown_days,
        sub.last_watchlist_change_at
    )

    return {
        'tier':                plan.id,
        'plan_name':           plan.name,
        'max_watchlist':       plan.max_watchlist,
        'trading_desk':        plan.trading_desk,
        'trades_monitoring':   trades_monitoring,
        'risk_monitor':        risk_monitor,
        'can_change_watchlist': can_change,
        'next_change_allowed': next_change_allowed,    # ISO string or null
        'change_cooldown_days': plan.change_cooldown_days,
        'subscription_status': sub.status,
        'current_period_end':  sub.current_period_end, # for "access until" display
    }
```

---

## 6. Backend API Specification

### 6.1 Public endpoints (no auth required)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/plans` | Return plans catalog (id, name, price, features) |
| GET | `/api/addons` | Return add-ons catalog |
| POST | `/api/stripe/webhook` | Stripe event handler (verified by signature) |
| GET | `/api/health` | Health check |

### 6.2 Auth endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Exchange Supabase JWT → create/upsert profile + subscription; log activity |
| GET | `/api/auth/me` | Current user profile |
| GET | `/api/auth/entitlements` | Computed entitlements (tier, add-ons, watchlist limits) |
| PUT | `/api/auth/profile` | Update full_name, avatar_url |
| POST | `/api/auth/verify-phone/start` | Send Twilio OTP to phone number |
| POST | `/api/auth/verify-phone/confirm` | Verify OTP; set phone_verified = true |
| GET | `/api/auth/pnl-history` | Last 90 days of P&L snapshots |

### 6.3 Subscription management

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/subscription` | Current subscription + plan details |
| POST | `/api/subscription/checkout` | Create Stripe Checkout session (new subscriber) |
| POST | `/api/subscription/upgrade` | Switch to higher plan immediately (prorated) |
| POST | `/api/subscription/downgrade` | Schedule switch to lower plan at period end |
| POST | `/api/subscription/cancel` | Set cancel_at_period_end = true |
| POST | `/api/subscription/reactivate` | Remove scheduled cancellation |
| GET | `/api/subscription/addons` | List available add-ons + which are active |
| POST | `/api/subscription/addons/enable` | Enable add-on immediately (prorated charge) |
| POST | `/api/subscription/addons/disable` | Schedule add-on removal at period end |

### 6.4 Billing

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/billing/invoices` | List invoices (from DB, synced via webhook) |
| GET | `/api/billing/payment-method` | Current card last4, brand, expiry (via Stripe API) |
| POST | `/api/billing/portal` | Create Stripe Customer Portal session → return URL |

### 6.5 Watchlist

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/watchlist` | Return user's saved symbols |
| PUT | `/api/watchlist` | Replace watchlist; enforces max_watchlist + cooldown |

### 6.6 Strategy & trading (existing, preserved)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/strategies/analyze/{symbol}` | Full IV + bias + strategy + narrative |
| GET | `/api/strategies/scan?symbols=...` | Multi-symbol scan |
| GET | `/api/options/chain/{symbol}` | Options chain with greeks |
| GET | `/api/options/quote/{symbol}` | Stock quote |
| POST | `/api/orders` | Place paper options order |
| GET | `/api/orders` | Order history |
| GET | `/api/positions` | Open positions |
| GET | `/api/portfolio` | Cash + positions value + P&L |
| GET | `/api/positions/risk` | Risk assessment with signals |
| POST | `/api/positions/snapshot` | Take daily P&L snapshot |
| GET | `/api/trading/buzz/*` | Reddit sentiment feeds |

### 6.7 Admin (require admin role)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/users` | All user profiles + plan + last login |
| PATCH | `/api/admin/users/{id}/subscription` | Override plan + add-ons |
| PATCH | `/api/admin/users/{id}/deactivate` | Suspend user |
| GET | `/api/admin/stats` | Revenue, user counts, plan distribution |
| GET | `/api/admin/activity` | Recent login activity |

### 6.8 Stripe webhook event handlers

| Stripe event | Action |
|---|---|
| `customer.subscription.created` | Create/update subscriptions row; set status, period dates |
| `customer.subscription.updated` | Update plan_id, status, cancel_at_period_end, period dates |
| `customer.subscription.deleted` | Set status = 'canceled' |
| `invoice.payment_succeeded` | Insert invoice row; update subscription status = 'active' |
| `invoice.payment_failed` | Update subscription status = 'past_due' |
| `customer.subscription.trial_will_end` | (future) send reminder email |

---

## 7. Frontend Pages & Routes

### Route map

```
/                        Landing page (public)
/auth                    Sign in / Sign up
/auth/callback           Supabase OAuth redirect handler
/onboarding              Post-signup flow (4 steps)
/onboarding/verify       Step 1: Phone verification
/onboarding/plan         Step 2: Choose plan
/onboarding/payment      Step 3: Enter card (Stripe Elements)
/onboarding/welcome      Step 4: Welcome + go to dashboard

/app                     Dashboard (requires auth + onboarding_completed)
/app/settings            Settings shell (tabs)
/app/settings/account    Name, email, phone, password
/app/settings/subscription  Plan, add-ons, upgrade/downgrade
/app/settings/billing    Payment method, invoice list
/app/settings/danger     Cancel subscription, delete account

/admin                   Admin console (requires admin role)
/admin/users             User table
/admin/subscriptions     Subscription overrides
/admin/stats             Revenue + usage stats
```

### Page specifications

#### `/` — Landing page

Sections:
1. **Hero** — headline, sub-headline, primary CTA "Start free", secondary "See how it works"
2. **How it works** — 3 steps (sign up → scan → trade smarter)
3. **Features** — cards for Strategy Scanner, Trading Desk, Risk Monitor, P&L Tracking
4. **Pricing** — tier cards (L1/L2/L3) with add-on toggles; CTA per card → `/auth?plan=L2`
5. **FAQ** — 5–6 common questions
6. **Footer** — links, legal

#### `/auth` — Auth page

- Tab: "Sign in" / "Sign up"
- Google OAuth button (primary)
- Email + password form (secondary)
- On sign-up: reads `?plan=` query param, stores in sessionStorage for onboarding
- On sign-in: redirects to `/app` (or `/onboarding` if not completed)

#### `/onboarding` — 4-step wizard

- Step indicator at top (1 of 4)
- **Step 1 — Phone**: input + "Send code"; OTP input; resend timer
- **Step 2 — Plan**: shows pre-selected plan (from `?plan=` or default L1); can change; add-on toggles; price summary
- **Step 3 — Payment**: Stripe Elements card input; "Subscribe $XX/mo" button; for L1 (free) skip this step
- **Step 4 — Welcome**: confetti/animation; "Go to Dashboard" CTA; "Complete guide" link

#### `/app` — Dashboard

Identical to current app, with entitlement-gated tabs:
- Strategy Scanner (always visible, watchlist enforced by tier)
- Options Chain (always visible)
- Trading Desk (only if `trading_desk = true`)
- Positions + P&L (only if `trades_monitoring = true`)
- Risk Monitor (only if `risk_monitor = true`)
- Locked placeholders with upgrade prompt for unavailable features

#### `/app/settings/subscription` — Subscription management

Layout: current plan card + add-ons section + billing schedule

**Current plan card:**
- Plan name, price, feature list
- "Upgrade" button (opens plan picker modal, immediate + prorated)
- "Downgrade" button (confirmation: "takes effect MM DD")
- "Cancel subscription" link → `/app/settings/danger`

**Add-ons section:**
- "Trades Monitoring — $9/mo" toggle — enable: immediate prorated charge; disable: "removes on MM DD"
- "Risk Monitor — $19/mo" toggle — same pattern
- Note: enabling Risk Monitor auto-disables Trades Monitoring (it supersedes)

**Billing schedule:**
- "Next billing: $XX on MM DD YYYY"
- "Cancel_at_period_end" banner: "Your plan cancels on MM DD — Reactivate"

#### `/app/settings/billing` — Billing

- **Payment method card**: brand icon, "••••  ••••  ••••  XXXX", expiry, "Update card" → Stripe Customer Portal
- **Invoice table**: Date, Description, Amount, Status (badge), "Download PDF" link
  - Paginated, most recent first

#### `/app/settings/danger` — Danger zone

- "Cancel subscription" — confirmation input ("type CANCEL to confirm"); sets cancel_at_period_end = true; shows "Your access continues until MM DD"
- "Delete account" — separate confirmation; deletes auth.users row (cascades to all tables)

#### `/admin` — Admin console

Three tabs:
1. **Users** — table: name, email, plan badge, add-ons, status, last login, actions (override plan, deactivate)
2. **Stats** — MRR, active users, plan distribution pie, recent signups, top P&L leaderboard
3. **Activity** — recent logins with IP, timestamp, plan at time of login

---

## 8. External Services

### Supabase
- Auth (Google OAuth + email/password)
- PostgreSQL DB (all app data)
- Service role key used by backend (bypasses RLS)
- Anon key used by frontend (subject to RLS)

### Stripe
- Products: one per plan (L1 free, L2, L3) + one per add-on
- Prices: monthly recurring per product
- Subscriptions: one per user; add-ons added as subscription items
- Customer Portal: for card updates (hosted by Stripe — no PCI scope for us)
- Webhooks: `stripe.webhooks.construct_event()` signature verification required on every request

### Twilio Verify
- Service: create one Verify Service in Twilio console
- `POST /v2/Services/{ServiceSid}/Verifications` → send SMS OTP
- `POST /v2/Services/{ServiceSid}/VerificationCheck` → verify code

---

## 9. Security Model

### Authentication

- Every non-public endpoint calls `verify_token(Authorization header)` → `sb.auth.get_user(token)`
- Never use python-jose — Supabase tokens are RS256; use the Supabase API for verification
- Sessions expire per Supabase default (1 hour); frontend refreshes automatically

### Tenant isolation

- All user data tables have `user_id UUID` FK to `auth.users`
- Backend always reads/writes with `WHERE user_id = <verified user_id from JWT>`
- Never trust `user_id` from request body — always from verified JWT
- RLS is a defence-in-depth layer; backend service role bypasses it intentionally

### Stripe security

- Webhook endpoint verifies `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET`
- Never expose Stripe secret key to frontend — all Stripe operations go through backend
- Store only `stripe_customer_id`, `stripe_subscription_id` in DB — never card data

### Admin

- `require_admin()` checks `admin_users` table (explicit grant) OR hardcoded ADMIN_EMAIL
- Admin routes are prefixed `/api/admin/*` and all require this check
- Admin operations are logged to `activity_log`

### Rate limiting

- `/api/auth/verify-phone/*`: 3 attempts per phone per 10 minutes
- `/api/strategies/scan`: 1 request per 10 seconds per user
- `/api/strategies/analyze`: 1 request per 5 seconds per user
- Implement via Redis or simple in-memory dict with TTL (Redis preferred for multi-instance)

### Environment variables required

```
# Backend
SUPABASE_URL
SUPABASE_SERVICE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID
ADMIN_EMAIL=leonard.simgt@gmail.com

# Frontend
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_STRIPE_PUBLISHABLE_KEY
```

---

## 10. Implementation Sequence

### Step 1 — Architecture (this document ✓)

### Step 2 — UI (all pages, no real data)

Build all pages with static/mock data so the complete user journey is navigable:
1. Landing page (full marketing site)
2. Auth page (Google + email, no real auth wired)
3. Onboarding wizard (4 steps, mock phone verify + Stripe form)
4. Settings pages (subscription, billing, danger)
5. Admin console

### Step 3 — Connect existing logic + revamp APIs

In this order:
1. Run DB migration (new schema)
2. Wire Supabase Auth to auth page (Google OAuth + email/password)
3. Implement `/api/auth/login` with auto-create profile + subscription
4. Implement `/api/auth/entitlements` with `compute_entitlements()`
5. Wire Twilio Verify to onboarding Step 1
6. Create Stripe products/prices; store IDs in plans/addons table
7. Implement `/api/subscription/checkout` + Stripe Checkout redirect
8. Implement Stripe webhook handler (subscription + invoice events)
9. Implement upgrade/downgrade/cancel/reactivate endpoints
10. Implement `/api/billing/invoices` + `/api/billing/portal`
11. Wire EntitlementsContext to dashboard — gate all features
12. Wire StrategyScanner watchlist to `/api/watchlist`
13. Wire all existing strategy/trading/positions routes (minimal changes needed)
14. Wire admin console to real data
15. Add rate limiting
16. End-to-end test the full onboarding flow

---

## 11. What Changes vs. What's Preserved

### Preserved (minimal changes)
- All strategy engine logic (`strategy_engine.py`, `interpreter.py`, `market_context.py`)
- Options chain + quote routes
- Paper trading order placement + position tracking
- P&L snapshot logic
- Risk assessment signals
- Reddit buzz feeds
- Black-Scholes greeks

### Removed
- `user_whitelist` table and all whitelist admin UI (replaced by open sign-up)
- `user_profiles.role` column (admin is now via `admin_users` table)
- Old `user_subscriptions` table (replaced by `subscriptions` + `user_addons`)
- `portfolios` default cash wiring via login (keep, just move to subscription creation trigger)

### New
- `plans`, `addons`, `subscriptions`, `user_addons`, `invoices`, `user_watchlist`, `admin_users` tables
- Stripe integration (checkout, webhooks, customer portal, proration)
- Twilio Verify integration
- Full landing page + pricing
- Onboarding wizard
- Settings pages (subscription, billing, danger)
- Entitlements service (compute_entitlements)
- Subscription management endpoints
- Admin stats with revenue view

---

## 12. Open Questions for Step 2 (resolve before building UI)

1. **Free tier?** Is L1 truly free (no card required at sign-up), or does it require a card on file from day one?
   - Recommended: L1 free with no card required → lower sign-up friction.

2. **Trial period?** Offer a 7-day or 14-day free trial on L2/L3 before charging?
   - Stripe supports `trial_period_days` natively.

3. **Currency?** USD only, or multi-currency?

4. **Annual billing?** Monthly only for now, with annual discount option later?

5. **Phone verify mandatory?** Can user skip it and verify later?
   - Recommended: make it skippable; show a persistent banner until verified.

6. **Delete account?** Immediate or 30-day grace period?

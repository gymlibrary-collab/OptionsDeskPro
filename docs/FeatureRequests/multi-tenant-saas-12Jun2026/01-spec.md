# Feature Spec — Multi-Tenanted SaaS Conversion

**Date:** 12Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 0. Relationship to Prior Document

`/home/user/OptionsDeskPro/multi-tenanted-saas.md` (repo root) contains a pre-existing
architecture/design document that was written independently of this SDLC process. That
document is **informative but not authoritative** at the Gate 1 stage. It covers schema
design, API contract sketches, and implementation sequencing — all of which are properly
resolved at Gate 2 (Architecture). This spec supersedes it as the requirements baseline.

Decisions in that document that this spec endorses as requirements:

- Open self-signup replacing whitelist model (FR-1).
- Stripe as billing backbone; Stripe Customer Portal for card management (FR-20, FR-27).
- Server-side entitlement computation — never trust client (FR-14).
- Webhook-driven subscription state sync (FR-22).
- Existing strategy engine, paper trading, P&L, options chain, and Reddit buzz feeds
  are preserved without functional change (see Section 5, Out of Scope).

Decisions in that document that this spec leaves open or defers:

- Tier naming (L1/L2/L3 vs free/starter/pro/enterprise): the existing codebase uses
  free/starter/pro/enterprise throughout `tier_limits.py` and `user_profiles.subscription_tier`.
  The prior document proposes renaming these. This is a Gate 2 decision; requirements
  here use the existing names until the architect resolves the mapping.
- Add-on model (Trades Monitoring, Risk Monitor as purchasable add-ons): the prior
  document introduces add-ons not present in the current app. This is in scope as a
  billing concept but is flagged as an Open Question (OQ-4) because feature-gating
  logic must be re-validated against what the current app actually delivers.
- Twilio phone verification: flagged as OQ-5 — mandatory vs. optional is a product
  decision not yet made.
- Trial periods, annual billing, multi-currency: deferred to a future billing iteration
  (Section 5).

---

## 1. Summary

OptionsDesk currently operates as a single-tenant, invite-only paper-trading options
dashboard. Access is controlled by a whitelist maintained by one administrator. Billing
does not exist; all users access the app at no cost.

This feature converts OptionsDesk into a multi-tenanted SaaS product operating on two
subdomains. A client portal at `optionsdeskpro.<domain>.com` allows any member of the
public to self-register, choose a subscription tier, supply payment details via Stripe,
and access the existing options desk application — with features gated by their paid tier.
A platform admin portal at `admin.<domain>.com` gives OptionsDesk staff the tools to
operate the business: manage pricing, monitor subscribers and infrastructure, handle
support access, manage an FAQ knowledge base, monitor revenue, and administer the
platform across a multi-role staff team.

The whitelist-gated single-admin model is retired. Paper trading remains the product's
core; no real-money broker connectivity is introduced.

---

## 2. User Personas

| Persona | Portal | Tier / Role | Job-to-be-done |
|---------|--------|-------------|----------------|
| **New Visitor** | Client | Unauthenticated | Evaluate OptionsDesk, understand pricing, sign up |
| **Free Subscriber** | Client | Free (no card) | Access basic scanner and options chain at no cost |
| **Paid Subscriber** | Client | Starter / Pro / Enterprise | Access tier-gated features; manage subscription and billing self-serve |
| **Platform Owner** | Admin | Owner / Super-Admin | Full platform control; manage staff, pricing, view all revenue |
| **Support Staff** | Admin | Support | Assist subscribers; view and impersonate accounts; manage FAQ |
| **Finance Staff** | Admin | Finance | View revenue metrics, export financial reports, manage Stripe config |

---

## 3. Functional Requirements

### 3.1 Client Portal — Self-Signup and Authentication

**FR-1.** The client portal must allow any member of the public to create an account
without requiring prior whitelisting by an administrator. The whitelist gate on
`POST /api/auth/login` must be removed from the client portal authentication path.

**FR-2.** Sign-up must support Google OAuth via Supabase (existing mechanism retained).

**FR-3.** Sign-up must support email and password as an alternative to Google OAuth.
Supabase email/password auth must be enabled.

**FR-4.** After initial sign-up (regardless of method), the user must be routed through
an onboarding flow before reaching the main dashboard. The onboarding flow must include:
(a) plan selection, (b) payment entry for paid tiers. For the free tier, (b) is skipped.

**FR-5.** A returning authenticated user who has completed onboarding must be routed
directly to the dashboard without repeating onboarding.

**FR-6.** A user who began sign-up but did not complete onboarding must be returned to
the incomplete onboarding step when they next log in.

### 3.2 Client Portal — Subscription and Billing

**FR-7.** The client portal must present a public pricing page (accessible without login)
displaying all subscription tiers and their prices and feature sets.

**FR-8.** At plan selection during onboarding, the user must be able to choose from the
available tiers. Free tier selection must not require a payment method.

**FR-9.** Paid tier selection during onboarding must present a Stripe-hosted or
Stripe-Elements card entry form. The card must be charged via Stripe at the point of
subscription creation.

**FR-10.** After completing onboarding, the system must create a Stripe subscription for
the user and persist the Stripe customer ID and subscription ID against the user's
profile in the database.

**FR-11.** Subscription state (active, past_due, canceled) must be synchronised in real
time from Stripe via webhook events. The database must not be the source of truth for
payment status — Stripe is.

**FR-12.** A subscriber must be able to upgrade their tier from the Settings page. An
upgrade must take effect immediately. Stripe must apply proration for the remainder of
the billing period.

**FR-13.** A subscriber must be able to downgrade their tier from the Settings page. A
downgrade must be scheduled to take effect at the end of the current billing period.
The subscriber retains the higher tier's access until that date.

**FR-14.** Feature access within the dashboard must be determined server-side by an
entitlements computation that reads the current subscription state from the database.
The frontend must not gate features based on any locally stored tier value alone.

**FR-15.** When a subscriber's payment fails (Stripe `invoice.payment_failed` event),
the system must immediately degrade their entitlements to the free tier's limits. A
banner visible on login must inform the subscriber of the payment failure and prompt
them to update their payment method.

**FR-16.** A subscriber must be able to cancel their subscription from the Settings
danger zone. Cancellation must be scheduled to the end of the current billing period.
Access continues until that date. A confirmation step requiring deliberate user action
must precede the cancellation API call.

**FR-17.** A subscriber must be able to reactivate a scheduled cancellation before
the period end date.

### 3.3 Client Portal — Settings Page

**FR-18.** The client portal must include a Settings page, accessible from the
authenticated dashboard, with the following sections:
(a) Account — display name, email (read-only if Google OAuth), change password
    (only visible for email/password accounts), profile avatar.
(b) Subscription — current plan, billing cycle, next billing date, upgrade/downgrade
    controls, scheduled change banner if applicable.
(c) Billing — current payment method summary (card brand, last four digits, expiry),
    button to update card via Stripe Customer Portal, invoice list with PDF download.
(d) Danger Zone — cancel subscription, delete account.

**FR-19.** The invoice list on the Billing settings tab must be populated from invoices
synced from Stripe webhooks. Each row must show: date, description, amount, status
(paid/open/void), and a link to the Stripe-hosted invoice PDF.

**FR-20.** Updating a payment method must redirect the subscriber to the Stripe Customer
Portal. No raw card data must pass through OptionsDesk servers.

**FR-21.** Account deletion must permanently delete the user's Supabase Auth record,
which must cascade to all associated data (profile, positions, orders, P&L snapshots,
watchlist). A confirmation step requiring deliberate user action must precede the
deletion API call.

### 3.4 Client Portal — Tier-Gated Dashboard

**FR-22.** Dashboard tabs and features must be conditionally rendered based on
server-returned entitlements. Tabs that the subscriber's tier does not unlock must be
replaced by a locked placeholder displaying the tier required to access them and a
direct "Upgrade" call-to-action.

**FR-23.** The watchlist symbol limit enforced by `PUT /api/watchlist` must be driven by
the subscriber's active tier entitlement, not a hardcoded lookup. The current
`tier_limits.py` mapping must remain compatible or be superseded by the new entitlement
service — both must agree.

**FR-24.** The monthly scan limit enforced by `GET /api/strategies/scan` must similarly
be driven by entitlements. When a subscriber exhausts their monthly scan allocation, the
scanner must display a clear message stating the limit, when it resets, and the tier
required for more scans.

### 3.5 Platform Admin Portal — Portal Structure and Access

**FR-25.** The platform admin portal must be served at a separate subdomain
(`admin.<domain>.com`). It must not share the same web application entry point as the
client portal. Platform staff must log in to the admin portal independently.

**FR-26.** Platform staff must authenticate to the admin portal via Google OAuth or
email/password. Supabase Auth is retained for admin portal authentication.

**FR-27.** Access to the admin portal must be restricted to users explicitly granted a
platform staff role. No subscriber, regardless of subscription tier, must be able to
access the admin portal.

**FR-28.** The admin portal must support at least three distinct staff roles with
differentiated permissions:

| Role | Permissions |
|------|-------------|
| **Owner** | All permissions. Can create and remove staff accounts, change any staff role, view all data, manage pricing, manage Stripe keys, close accounts. |
| **Support** | View subscriber list and individual subscriber details. Initiate support access to a subscriber's account (read-only impersonation). Manage FAQ entries. Cannot view financial data or modify pricing. |
| **Finance** | View revenue dashboard, export revenue reports, manage Stripe webhook configuration. Cannot view individual subscriber account details or modify platform settings. |

**FR-29.** There must always be at least one Owner account. The system must reject any
action that would remove or demote the last Owner.

### 3.6 Platform Admin Portal — Subscriber Management

**FR-30.** The admin portal must display a paginated list of all subscribers showing:
full name, email, current tier, subscription status, last login date, account creation
date, and Stripe customer ID (truncated).

**FR-31.** An Owner or Support user must be able to view a single subscriber's full
profile including: account details, current subscription and add-ons, billing status,
invoice history, login activity, and paper trading positions summary.

**FR-32.** An Owner must be able to override a subscriber's subscription tier
(upgrade or downgrade) without going through Stripe. This is an administrative override
for support purposes. The override must be logged in the activity log with the acting
admin's identity.

**FR-33.** An Owner must be able to deactivate a subscriber account. A deactivated
account must be blocked from logging in. The subscriber must receive a clear error
message on login indicating their account is suspended and directing them to support.

**FR-34.** Support staff must be able to enter a read-only support-access view of a
subscriber's dashboard. All data shown must be the subscriber's real data. The support
session must be clearly watermarked "Support View — [Staff Name]" to distinguish it
from the subscriber's own session. No write actions (order placement, watchlist changes,
settings changes) must be possible during a support session.

**FR-35.** All admin actions against subscriber accounts (role override, deactivation,
support access entry/exit) must be recorded in the activity log with: timestamp,
acting admin identity, target subscriber identity, action type, and before/after values
where applicable.

### 3.7 Platform Admin Portal — Pricing Management

**FR-36.** The admin portal must display the current pricing for each subscription tier
(free/starter/pro/enterprise or equivalent mapping) and each purchasable add-on.

**FR-37.** An Owner must be able to change the monthly price of any paid tier or add-on.
A price change must update the corresponding Stripe Price object and update the catalog
in the database. Price changes must apply only to new subscriptions and renewals; they
must not mid-cycle reprice existing active subscribers.

**FR-38.** An Owner must be able to edit the feature entitlements associated with each
tier: watchlist symbol limit, monthly scan limit, and which dashboard tabs are included.
Changes must take effect for all subscribers on that tier at the next entitlement
evaluation.

**FR-39.** The pricing management UI must display a confirmation step before any price
or entitlement change is saved, summarising the number of currently active subscribers
who will be affected on their next renewal.

### 3.8 Platform Admin Portal — Revenue Monitoring

**FR-40.** The admin portal must display a revenue dashboard visible to Owner and Finance
roles showing:
- Monthly Recurring Revenue (MRR) — current month.
- MRR trend over the last 12 months (chart).
- Active subscriber count by tier.
- New subscriber count this month vs. previous month.
- Churned subscriber count this month.
- Outstanding (past_due) subscriber count and aggregate amount at risk.

**FR-41.** Revenue data must be derived from invoices and subscription records synced
from Stripe via webhooks. It must not require a separate call to the Stripe API at
dashboard load time (avoid rate limits and load latency).

**FR-42.** Finance users must be able to export a CSV of all invoices for a selected
date range. The export must include: invoice date, subscriber email, tier, amount, and
payment status.

### 3.9 Platform Admin Portal — Infrastructure and Capacity Monitoring

**FR-43.** The admin portal must display a system health panel showing:
- Backend API health (result of `GET /api/health`).
- Market Data App credit usage for the current day (current usage vs. 100-credit
  daily limit on the free plan).
- Number of strategy analysis requests processed in the last 24 hours.
- Number of scanner requests processed in the last 24 hours.
- Active session count (users with a `last_seen_at` within the last 15 minutes).

**FR-44.** When Market Data App daily credits are at 80% or above, the health panel must
display a warning indicator. At 100% it must display a critical indicator.

**FR-45.** The system health panel must not require a real-time external API call on
page load. Credit usage data must be derived from the existing backend counter or a
lightweight internal counter. The architect will determine the implementation mechanism
at Gate 2.

### 3.10 Platform Admin Portal — FAQ Management

**FR-46.** The admin portal must include an FAQ management interface accessible to Owner
and Support roles. Staff must be able to create, edit, reorder, and delete FAQ entries.
Each entry has a question (plain text) and an answer (rich text / markdown).

**FR-47.** Published FAQ entries must be visible on the client portal's public FAQ page
without requiring authentication.

**FR-48.** FAQ entries must have a published/draft status. Only published entries are
visible to subscribers. Draft entries are visible only within the admin FAQ editor.

### 3.11 Platform Admin Portal — Multi-Staff Account Management

**FR-49.** An Owner must be able to invite new platform staff by email. An invitation
email must be sent via Supabase Auth. The invited staff member must complete account
creation before they can access the admin portal.

**FR-50.** An Owner must be able to change any staff member's role (Owner, Support,
Finance) and deactivate any staff account except the last Owner.

**FR-51.** The admin portal must display a list of all platform staff members with their
role, last login date, and account status.

---

## 4. User Stories and Acceptance Criteria

### Story 1 — New Visitor Self-Signup (Free Tier)

**As a** new visitor, **I want** to create a free OptionsDesk account without being
invited **so that** I can evaluate the platform's scanner and options chain features
without commitment.

**Acceptance Criteria:**
- [ ] AC1.1: A user navigates to `optionsdeskpro.<domain>.com`, sees a public pricing
  page, and clicks "Sign up free". They complete Google OAuth or email/password
  registration. No whitelist check occurs. They land on the free-tier dashboard
  within 60 seconds of starting the flow.
- [ ] AC1.2: The free-tier dashboard shows the Strategy Scanner and Options Chain tabs
  accessible. The scanner enforces a maximum of 10 scans per month (or the configured
  free-tier limit) and 5 watchlist symbols (or the configured free-tier limit).
- [ ] AC1.3: A user who starts registration but abandons after auth (before onboarding
  complete) is returned to the onboarding step when they log in again, not to the
  dashboard.
- [ ] AC1.4: A tester can verify that `user_whitelist` table is not consulted during the
  new sign-up flow by registering an email address that does not exist in the whitelist
  table and confirming the registration succeeds.

### Story 2 — New Visitor Self-Signup (Paid Tier)

**As a** new visitor, **I want** to subscribe to a paid tier and pay with a credit card
during sign-up **so that** I have immediate access to the full feature set my tier
includes.

**Acceptance Criteria:**
- [ ] AC2.1: During onboarding, the user selects a paid tier and is presented with a
  card entry form (Stripe Elements or Checkout). They enter valid test card details.
  The system creates a Stripe subscription and the user reaches the dashboard with the
  correct paid-tier entitlements.
- [ ] AC2.2: If card entry fails (decline), the user sees a specific error message
  ("Your card was declined") and remains on the payment step. They can retry with a
  different card.
- [ ] AC2.3: After successful subscription creation, a Stripe-issued invoice is
  generated. Within 60 seconds of the webhook delivery, the invoice appears in the
  subscriber's Billing settings with status "paid".
- [ ] AC2.4: The subscriber's entitlements visible in the dashboard (watchlist limit,
  scanner limit, unlocked tabs) match the tier selected during onboarding.

### Story 3 — Returning Subscriber Login

**As a** returning subscriber, **I want** to log in and go directly to the dashboard
**so that** I can resume my session without repeating onboarding steps.

**Acceptance Criteria:**
- [ ] AC3.1: A subscriber with `onboarding_completed = true` logs in via Google OAuth and
  lands on the dashboard within 5 seconds. No onboarding screen is shown.
- [ ] AC3.2: The subscriber's watchlist, open positions, and P&L history are present and
  unchanged from their previous session.

### Story 4 — Upgrade Subscription

**As a** paid subscriber on Starter, **I want** to upgrade to Pro immediately **so that**
I can access additional features without waiting for my billing cycle to renew.

**Acceptance Criteria:**
- [ ] AC4.1: The subscriber opens Settings > Subscription, selects "Upgrade to Pro", and
  confirms. Within 5 seconds, the dashboard reflects the Pro entitlements (additional
  watchlist symbols, higher scan limit, Trading Desk tab accessible).
- [ ] AC4.2: A prorated Stripe invoice is generated and visible in Billing settings
  within 60 seconds of the Stripe webhook delivery.
- [ ] AC4.3: The "Next billing" date shown remains the same as before the upgrade (not
  reset to a new cycle).

### Story 5 — Downgrade Subscription

**As a** Pro subscriber, **I want** to downgrade to Starter at the end of my current
billing period **so that** I do not pay for features I no longer use.

**Acceptance Criteria:**
- [ ] AC5.1: The subscriber selects "Downgrade to Starter". A confirmation modal states
  the exact date the downgrade takes effect.
- [ ] AC5.2: The subscriber retains Pro entitlements until the billing period end. On the
  next renewal date, entitlements are reduced to Starter without any manual admin action.
- [ ] AC5.3: A scheduled-change banner is visible on the Subscription settings tab until
  the downgrade takes effect.

### Story 6 — Failed Payment Handling

**As a** subscriber whose payment has failed, **I want** to be clearly informed and given
an easy path to update my card **so that** I can restore access without contacting
support.

**Acceptance Criteria:**
- [ ] AC6.1: When Stripe fires `invoice.payment_failed`, within 60 seconds the
  subscriber's `subscription_status` in the database is set to `past_due`.
- [ ] AC6.2: On next login, the subscriber sees a banner: "Your last payment failed.
  Update your payment method to restore full access." with an "Update card" link that
  opens the Stripe Customer Portal.
- [ ] AC6.3: The subscriber's dashboard features are degraded to free-tier limits while
  status is `past_due`.
- [ ] AC6.4: Once Stripe fires `invoice.payment_succeeded` after a retry, the status
  returns to `active` and full entitlements are restored within 60 seconds of webhook
  delivery.

### Story 7 — Cancel Subscription

**As a** subscriber, **I want** to cancel my subscription and retain access until the
end of the period I have paid for **so that** I am not charged again and do not lose
access mid-cycle.

**Acceptance Criteria:**
- [ ] AC7.1: Settings > Danger Zone presents a "Cancel subscription" action. Before the
  API call fires, the user must complete a deliberate confirmation step (e.g., type
  "CANCEL" or check a checkbox — the exact mechanism is a Gate 2 UI decision).
- [ ] AC7.2: After confirmation, the subscriber sees: "Your subscription cancels on
  [date]. You retain full access until then."
- [ ] AC7.3: The subscriber can click "Reactivate" on the Subscription tab to reverse
  the cancellation before the period end. After reactivation, the scheduled cancellation
  banner disappears.
- [ ] AC7.4: On the cancellation date, the subscriber's entitlements are degraded to
  free-tier limits without any manual admin action.

### Story 8 — Billing Self-Service

**As a** subscriber, **I want** to update my credit card and download invoices without
contacting support **so that** I can manage my account independently.

**Acceptance Criteria:**
- [ ] AC8.1: Settings > Billing shows the current payment method's card brand, last four
  digits, and expiry month/year. No full card number is shown.
- [ ] AC8.2: Clicking "Update card" opens the Stripe Customer Portal in a new tab. The
  subscriber can update their card there. The updated card details are reflected in
  Settings > Billing within 60 seconds of the Stripe webhook delivery.
- [ ] AC8.3: Each row in the invoice list has a "Download PDF" link. Clicking it opens
  the Stripe-hosted invoice PDF in a new tab without requiring any additional login.

### Story 9 — Platform Owner Manages Pricing

**As a** platform Owner, **I want** to change the monthly price of the Pro tier **so that**
the platform's pricing reflects our current positioning.

**Acceptance Criteria:**
- [ ] AC9.1: The Owner opens Admin > Pricing, selects the Pro tier, edits the monthly
  price, and saves. A confirmation step shows "X active subscribers will see this new
  price on their next renewal." The Owner confirms.
- [ ] AC9.2: The corresponding Stripe Price record is updated (or a new Price is created
  and the old one archived — Gate 2 decision). Existing active subscribers are not
  re-billed mid-cycle.
- [ ] AC9.3: The updated price is immediately reflected on the public pricing page of the
  client portal.
- [ ] AC9.4: A Finance or Support user navigates to Admin > Pricing and finds no "Edit"
  controls — the pricing is read-only for those roles.

### Story 10 — Platform Owner Views Revenue Dashboard

**As a** platform Owner or Finance user, **I want** to see current MRR, subscriber
counts by tier, and churn **so that** I can make informed operational decisions.

**Acceptance Criteria:**
- [ ] AC10.1: Admin > Revenue shows: current MRR figure in USD, active subscriber count
  by tier (a breakdown table), new subscribers this calendar month, churned subscribers
  this calendar month.
- [ ] AC10.2: A 12-month MRR trend chart is present. Each data point represents one
  calendar month.
- [ ] AC10.3: The Finance user can click "Export CSV" and download a file containing all
  invoices for a date range they select. The file contains at minimum: date, subscriber
  email, tier, amount, status.
- [ ] AC10.4: A Support user navigates to Admin and finds no Revenue tab or any financial
  figures.

### Story 11 — Support Staff Assists a Subscriber

**As a** Support staff member, **I want** to view a subscriber's account details and
enter a read-only support view of their dashboard **so that** I can diagnose issues
without asking the subscriber to share screenshots.

**Acceptance Criteria:**
- [ ] AC11.1: Support staff opens Admin > Subscribers, searches for a subscriber by email,
  and opens their profile. The profile shows: account details, current tier, subscription
  status, last login date, and paper trading positions count.
- [ ] AC11.2: The Support user clicks "Enter Support View". They are shown the subscriber's
  dashboard with all data intact. A persistent banner reads "Support View — [Staff Name]".
- [ ] AC11.3: While in support view, the "Place Order" button, watchlist edit controls, and
  Settings link are disabled or hidden. Attempting to navigate to Settings redirects back
  to the subscriber's read-only positions page.
- [ ] AC11.4: The support session entry and exit are recorded in the activity log with
  timestamp, Support staff identity, and subscriber identity.
- [ ] AC11.5: A Finance user attempts to navigate to Admin > Subscribers and receives a
  403 response. The Subscribers menu item is not visible in their admin navigation.

### Story 12 — Platform Owner Manages Staff Accounts

**As a** platform Owner, **I want** to invite new support staff by email and assign them
the Support role **so that** multiple team members can assist subscribers without sharing
a single login.

**Acceptance Criteria:**
- [ ] AC12.1: The Owner opens Admin > Staff, clicks "Invite staff", enters an email
  address and selects role "Support". An invitation email is sent by Supabase Auth.
- [ ] AC12.2: The invited staff member receives the email, creates their password, and
  logs in to the admin portal. They see only: Subscribers and FAQ tabs. Revenue and
  Pricing tabs are not visible.
- [ ] AC12.3: The Owner attempts to remove the last remaining Owner account. The system
  returns an error: "Cannot remove the last Owner account." The account is not removed.

### Story 13 — Support Staff Manages FAQ

**As a** Support staff member, **I want** to add and publish FAQ entries **so that**
subscribers can find answers to common questions without contacting support.

**Acceptance Criteria:**
- [ ] AC13.1: Support staff opens Admin > FAQ, clicks "New entry", enters a question and
  markdown answer, and saves as draft. The entry is not visible on the public FAQ page.
- [ ] AC13.2: Support staff publishes the entry. Within 30 seconds, the entry appears on
  the public FAQ page (`optionsdeskpro.<domain>.com/faq` or equivalent) without requiring
  a page deployment.
- [ ] AC13.3: Support staff reorders FAQ entries by drag-and-drop (or equivalent — Gate 2
  decision). The new order is immediately reflected on the public FAQ page.

### Story 14 — Admin Portal Infrastructure Health

**As a** platform Owner, **I want** to see system health at a glance including Market
Data App credit consumption **so that** I can take action before the daily limit causes
data fallback for subscribers.

**Acceptance Criteria:**
- [ ] AC14.1: Admin > Health shows the Market Data App credit usage for the current UTC
  day as a number and percentage of the 100-credit daily limit.
- [ ] AC14.2: When credit usage is >= 80%, the indicator turns amber. When >= 100%, it
  turns red. Below 80%, it is green.
- [ ] AC14.3: The panel shows the count of strategy analysis requests and scanner requests
  in the last 24 hours.
- [ ] AC14.4: The health panel loads without making a live call to api.marketdata.app.
  Data is drawn from an internal counter in the backend.

### Story 15 — Tier-Gated Dashboard Feature Lock

**As a** free-tier subscriber, **I want** to see a clear explanation of which features
require an upgrade and what each tier includes **so that** I can make an informed
decision to upgrade.

**Acceptance Criteria:**
- [ ] AC15.1: A free-tier subscriber sees the Trading Desk, Positions, and Risk Monitor
  tabs replaced by locked placeholders. Each placeholder names the minimum tier required
  and includes an "Upgrade" button that navigates to Settings > Subscription.
- [ ] AC15.2: If a free-tier subscriber exhausts their monthly scan allocation, the
  scanner displays: "You have used all 10 scans for [month]. Resets on [date]. Upgrade
  to Starter for 100 scans/month." (Numbers here are illustrative; actual limits come
  from the configured tier entitlements.)
- [ ] AC15.3: A tester can verify the lock is enforced server-side: if the frontend's
  stored tier value is manually overridden in browser dev tools, API calls to locked
  endpoints still return 403.

---

## 5. Out of Scope

The following are explicitly excluded from this feature and must not be designed,
implemented, or implied in Gate 2 work without a separate spec:

- Real-money brokerage connectivity. OptionsDesk remains a paper-trading platform.
- Annual billing or billing frequency other than monthly.
- Trial periods (e.g., 7-day or 14-day free trials). Flagged in prior document as an
  open question; deferred.
- Multi-currency billing. USD only.
- A public marketing landing page with hero copy, animation, and SEO content. The pricing
  page is in scope; a full marketing site rebrand is not.
- Mobile native apps (iOS/Android).
- Two-factor authentication beyond what Supabase provides by default.
- Twilio phone verification during onboarding. Included in the prior document; deferred
  pending OQ-5 resolution.
- GDPR/CCPA data export tooling (right-to-access). Account deletion cascade is in scope;
  structured data export is not.
- Any change to the strategy engine, options chain logic, greeks computation,
  interpreter, or market context enrichment.
- Any change to paper order placement, position tracking, P&L snapshot, or Reddit buzz
  feed behaviour.
- Any change to the AI narrative generation (Claude API integration).
- Multi-language / internationalisation.
- Admin portal mobile optimisation. Admin portal is desktop-first.

---

## 6. Impacts on Existing Flows

| Existing Flow | Impact |
|---------------|--------|
| Whitelist-gated login (`POST /api/auth/login`) | Whitelist check removed for client portal. The `user_whitelist` table and admin whitelist UI are retired. The admin portal's own staff access control replaces it for admin users. |
| Hardcoded `ADMIN_EMAIL` in `auth_utils.py` | Admin email bypass remains as an Owner-level fallback but staff role is managed via the new `platform_staff` table (name TBD at Gate 2). |
| `user_profiles.subscription_tier` column | Must remain writable for admin overrides (FR-32) and readable for existing entitlement checks, but the authoritative entitlement source moves to a new subscriptions table. The tier_limits.py mapping must be reconciled with the new plan catalog. |
| `tier_limits.py` static dict | Must be superseded by a database-backed plan catalog so prices and limits are editable without code deployment (FR-37, FR-38). The static file becomes a fallback or is deleted. |
| Existing AdminPanel.tsx in the main app | Retired. Admin functions move to the separate admin subdomain portal. The `admin` tab in the main app's tab bar is removed from the client portal. |
| `scan_usage` table | Retained. Monthly scan counter logic in `strategies.py` must be updated to read limits from the entitlement service rather than `tier_limits.py` directly. |
| `user_watchlists` table | Retained. Watchlist limit enforcement in `watchlist.py` must be updated to read from entitlements. |
| Google OAuth only constraint | The `invite_user` endpoint currently rejects non-Gmail addresses. Email/password sign-up (FR-3) removes this constraint for client portal sign-up. |

---

## 7. Edge Cases and Failure Modes

| Scenario | Expected Behaviour |
|----------|--------------------|
| Stripe webhook delivery delayed or retried | Subscription state must be idempotent on webhook replay. Processing the same event twice must not double-insert invoices or double-change subscription status. |
| Subscriber's Stripe subscription enters `past_due` while they are mid-session | On next API call requiring a tier-gated feature, the server returns 403 with a `payment_required` error code. Frontend displays the payment failure banner. |
| Stripe Customer Portal session creation fails | Settings > Billing shows an error toast: "Unable to open billing portal. Please try again or contact support." The subscriber is not left on a broken redirect. |
| Subscriber deletes account while a Stripe subscription is still active | Account deletion must trigger a Stripe subscription cancellation (immediate) before deleting the Supabase auth record. Stripe must not continue billing a deleted customer. |
| New visitor signs up with a Google account that already has a subscriber profile | Supabase deduplicates on email. The existing profile is used. The user is routed to the dashboard (if onboarding is complete) or to the incomplete onboarding step. |
| Support staff enters support view for a subscriber with zero positions | Positions tab shows the empty state ("No open positions"). Support session is still valid. |
| Owner attempts to change price to $0 for a paid tier | The system rejects the action with a validation error: "Paid tiers must have a price greater than $0.00." Free tier price is always $0 and is not editable. |
| Last Owner tries to self-demote or delete their own account | System rejects the action with a clear error message (FR-29). |
| Market Data App returns 429 (quota exceeded) | Existing fallback chain (yfinance → synthetic BS) continues to operate. Admin health panel shows critical (red) status on Market Data App credits. |
| Admin portal subdomain not yet DNS-configured in staging | Client portal continues to function independently. Admin portal shows a DNS error page, not a blank page. (Operational concern for Gate 6.) |
| Subscriber on a downgraded tier has more watchlist symbols than their new tier allows | On next `GET /api/watchlist`, the API returns the stored symbols but flags `over_limit: true`. The watchlist UI shows a warning and blocks adding further symbols until the list is trimmed. The over-limit symbols are not automatically deleted. |

---

## 8. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|-------------|
| Supabase Auth | Google OAuth + new email/password auth; JWT verification; user record storage | No quota concerns at expected scale. Email/password auth must be enabled in the Supabase project settings — currently only Google OAuth is enabled. |
| Supabase Postgres | All user data, subscription state, invoice records, FAQ, staff roles, activity log | Existing project. New tables and RLS policies required. |
| Stripe | Subscription billing, payment collection, proration, Customer Portal, webhooks, PDF invoices | Requires Stripe account creation, product/price setup, webhook endpoint registration. Secret key and webhook secret must never reach the frontend. |
| Market Data App | Strategy analysis (unchanged) | 100 credits/day on free plan. FR-43 and FR-44 require an internal usage counter to avoid additional API calls for health monitoring. |
| yfinance | Fallback market data (unchanged) | No change. |
| Claude API | AI narrative generation (unchanged) | No change. |
| Reddit PRAW | Trading Desk buzz feeds (unchanged) | No change. |
| Railway | Hosting for backend and frontend services | A third Railway service is likely needed for the admin portal frontend. The architect will determine whether the admin portal shares the backend or requires a separate service. |

---

## 9. Subscription Tier Impact

This feature does not change the internal tier names in the current codebase
(free / starter / pro / enterprise). The mapping from tier names to features is moving
from the static `tier_limits.py` to a database-backed plan catalog. Per-tier behaviour
in the SaaS model:

| Tier | Self-Signup | Billing | Dashboard Entitlements |
|------|-------------|---------|----------------------|
| **free** | Yes, no card required | $0/month; Stripe customer created but no subscription item | Strategy Scanner (10 scans/month), Options Chain, max 5 watchlist symbols. Trading Desk, Positions, Risk Monitor tabs locked. |
| **starter** | Yes, card required | Monthly charge via Stripe | Strategy Scanner (100 scans/month), Options Chain, max 15 watchlist symbols. Trading Desk, Positions, Risk Monitor tabs — locked status TBD per OQ-4. |
| **pro** | Yes, card required | Monthly charge via Stripe | Strategy Scanner (unlimited scans), Options Chain, max 50 watchlist symbols, Trading Desk. Positions and Risk Monitor — locked status TBD per OQ-4. |
| **enterprise** | Admin-provisioned or self-signup (OQ-6) | Monthly charge via Stripe or invoiced (OQ-6) | All features, unlimited watchlist, unlimited scans. |

Note: the prior document (`multi-tenanted-saas.md`) proposes a different tier structure
(L1/L2/L3 with purchasable add-ons). Reconciliation of that model with the existing
four tiers is an open question (OQ-4) that must be resolved before Gate 2.

---

## 10. Platform Admin Role Model

Three roles are proposed. The product owner must confirm this model before Gate 2.

| Role | Portal Access | Subscriber Data | Pricing | Revenue | Staff Mgmt | FAQ |
|------|--------------|-----------------|---------|---------|------------|-----|
| **Owner** | Full | Read + Override + Support View | Read + Edit | Read + Export | Read + Edit | Read + Edit |
| **Support** | Restricted | Read + Support View | Read-only | None | None | Read + Edit |
| **Finance** | Restricted | None | Read-only | Read + Export | None | None |

Rationale: separating Finance from Support prevents a single compromised support account
from accessing revenue data. Preventing Finance from seeing subscriber PII limits data
exposure risk. Owner is unrestricted to avoid operational blockage.

---

## 11. Open Questions for the Product Owner

**OQ-1 — Free tier card requirement.**
Should the free tier require a card on file at sign-up, or should signup be card-free?
Card-free reduces friction and increases top-of-funnel conversion. Card-required reduces
abuse and simplifies future upgrade flows.
Recommendation: card-free for free tier.

**OQ-2 — Free tier feature set.**
The current free tier in `tier_limits.py` allows 5 watchlist symbols and 10 scans/month.
Are these the correct limits for the public SaaS free tier, or should they be adjusted
to optimise conversion to paid?

**OQ-3 — Support access impersonation scope.**
Should Support staff be able to see a subscriber's paper positions and P&L in support
view, or only account/subscription metadata? Positions data may include personal
financial context. Recommendation: full read-only dashboard access is more useful for
support but requires explicit product owner sign-off.

**OQ-4 — Tier model: existing four-tier vs. three-tier-plus-add-ons.**
The prior design document (`multi-tenanted-saas.md`) proposes retiring the current four
tiers in favour of three tiers (L1/L2/L3) with purchasable add-ons (Trades Monitoring,
Risk Monitor). The current codebase uses free/starter/pro/enterprise throughout. 
Which model applies to this SaaS launch? If add-ons are in scope, the entitlement
service and billing integration are materially more complex. If the existing four-tier
model is retained with new prices, the scope is smaller.

**OQ-5 — Phone verification.**
The prior document specifies Twilio SMS OTP verification during onboarding. Is this
mandatory, optional, or deferred entirely? It adds a dependency, cost, and friction.
Recommendation: defer to a post-launch iteration; focus onboarding on plan + payment.

**OQ-6 — Enterprise tier provisioning.**
Is the enterprise tier self-service (subscriber picks it on pricing page, pays via Stripe
like other tiers) or sales-led (admin provisions it manually with custom pricing)?
This affects whether the pricing page shows enterprise at all and whether Stripe
Checkout needs to handle it.

**OQ-7 — Domain.**
What is the production domain? Required to finalise subdomain specification
(`admin.<domain>.com` and `optionsdeskpro.<domain>.com`) and CORS configuration.

**OQ-8 — Admin portal authentication isolation.**
Should admin portal staff log in with the same Supabase project as client subscribers, or
a separate Supabase project/organisation? Using the same project simplifies infrastructure
but requires rigorous role separation in the database. A separate project adds operational
overhead but provides hard isolation. Recommendation: same project, separate `platform_staff`
table with role enforcement, documented at Gate 2.

**OQ-9 — Data retention on subscription cancellation.**
When a subscriber cancels (not deletes their account), how long is their paper trading
data (positions, P&L history, orders) retained? Indefinitely (they could resubscribe)?
Or purged after N days of free-tier status?

---

## 12. MVP Boundary Suggestion

The following is a suggested MVP boundary for the product owner to accept, modify, or
reject. This is a recommendation only — the product owner's Gate 1 approval establishes
the authoritative boundary.

**In MVP (must ship together for the SaaS to be viable):**
Stories 1, 2, 3, 4, 5, 6, 7, 8, 9 (partial — price display only, not edit), 15.
Rationale: a viable SaaS requires self-signup, billing lifecycle, and a visible pricing
page. Revenue dashboard and staff management can follow.

**Defer to iteration 2:**
Stories 10 (revenue dashboard export), 11 (support access / impersonation), 12
(staff management), 13 (FAQ management), 14 (infrastructure health panel), 9 (pricing
edit — display in MVP, edit in iteration 2).
Rationale: the platform can launch with a single Owner account managing users directly
in Supabase until a staff team is needed. Revenue visibility via Stripe's own dashboard
is a workable substitute until iteration 2.

---

## 9. Product Owner Annotations

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must / 2=should / 3=nice) | Notes |
|-------|---------------------------------------|-------|
| 1 — Free Tier Self-Signup | | |
| 2 — Paid Tier Self-Signup | | |
| 3 — Returning Subscriber Login | | |
| 4 — Upgrade Subscription | | |
| 5 — Downgrade Subscription | | |
| 6 — Failed Payment Handling | | |
| 7 — Cancel Subscription | | |
| 8 — Billing Self-Service | | |
| 9 — Owner Manages Pricing | | |
| 10 — Revenue Dashboard | | |
| 11 — Support Staff Assists Subscriber | | |
| 12 — Owner Manages Staff Accounts | | |
| 13 — Support Staff Manages FAQ | | |
| 14 — Infrastructure Health Panel | | |
| 15 — Tier-Gated Dashboard Lock | | |

**MVP boundary:** _[Stories confirmed for v1]_

**Deferred to backlog:** _[Stories deferred]_

**Open questions resolved:**
OQ-1: _[answer]_
OQ-2: _[answer]_
OQ-3: _[answer]_
OQ-4: _[answer]_ ← critical path; blocks Gate 2
OQ-5: _[answer]_
OQ-6: _[answer]_
OQ-7: _[answer]_ ← critical path; needed for CORS config
OQ-8: _[answer]_
OQ-9: _[answer]_

**PO gate decision:** ☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

# ADR 0004 — Stripe price change strategy: new Price object, archive old, grandfather existing

**Date:** 12 Jun 2026
**Status:** Accepted
**Feature:** Multi-Tenanted SaaS Conversion

---

## Context

FR-37 requires that an Owner can change the monthly price of a tier from the admin
portal. Stripe does not allow editing the `unit_amount` on an existing Price object
after it has been used on a subscription. The available strategies are:

1. **Create a new Stripe Price, archive the old one, migrate existing subscribers
   immediately**: all active subscriptions are updated via
   `stripe.subscriptions.update(subscription_id, items=[{id: item_id, price: new_price_id}])`.
   This triggers an immediate proration and potentially an immediate charge.

2. **Create a new Stripe Price, archive the old one, grandfather existing subscribers**:
   existing subscribers stay on the old Price ID until they next modify their
   subscription (upgrade, downgrade, cancel/reactivate). New subscribers and renewals
   use the new Price ID.

3. **Create a new Stripe Price, archive the old one, grandfather until renewal**:
   existing subscribers are migrated to the new Price at their next billing cycle
   (`billing_cycle_anchor: now` or a scheduled Stripe subscription schedule).

---

## Decision

Use **option 2: create new Stripe Price, archive old, grandfather existing subscribers
indefinitely until they next make a subscription change**.

---

## Rationale

FR-37 explicitly states: "Price changes must apply only to new subscriptions and
renewals; they must not mid-cycle reprice existing active subscribers."

Option 1 violates this requirement directly.

Option 3 (migrate at renewal) is closer to the spec intent but requires either a
Stripe Subscription Schedule (complex API) or iterating all active subscriptions
and patching them with `billing_cycle_anchor` changes — a risky bulk operation
that could trigger unintended charge events at scale.

Option 2 is the simplest implementation, fully compliant with the spec requirement,
and is the canonical Stripe pattern for SaaS price changes. The risk is long-lived
Price IDs in the database for grandfathered subscribers; this is acceptable and
managed by keeping the `stripe_price_id` column on the `subscriptions` table
(carrying the Price ID the subscriber is on) separate from the `plans` table column
(carrying the current default Price ID for new subscribers).

"Existing subscribers" in this context means subscribers who signed up before the
price change. They retain the old Price ID on their Stripe Subscription Item until:
- They explicitly upgrade or downgrade.
- They cancel and resubscribe.

This is standard SaaS grandfathering behaviour and is commercially correct.

---

## Consequences

- The `plans` table `stripe_price_id` column is updated to the new Price ID when an
  Owner saves a price change.
- The old Price ID is archived via `stripe.prices.modify(old_price_id, active=False)`.
  Existing Stripe subscriptions that reference the old Price ID are unaffected; Stripe
  allows subscriptions to continue on archived prices.
- `POST /api/platform/pricing/{tier}` (Owner only) performs:
  1. Validate: `price_monthly_usd > 0` (free tier price is immutable at $0).
  2. Create new Stripe Price: `stripe.prices.create(product=tier_product_id, unit_amount=cents, currency='usd', recurring={interval:'month'})`.
  3. Archive old Stripe Price: `stripe.prices.modify(old_price_id, active=False)`.
  4. Update `plans` row: `stripe_price_id = new_price_id, price_monthly_usd = new_price`.
  5. Flush the in-process plans cache (see ADR-0003).
  6. Log the change to `platform_audit_log` with before/after values.
- The response includes `affected_subscriber_count` (computed from COUNT on `subscriptions`
  where `tier_key = tier AND status = 'active'`) so the confirmation UI can display
  the impact message required by FR-39 / AC9.1.

---

## Rejected alternatives

**Option 1 (immediate migration)**: Violates FR-37 and would generate surprise charges
for active subscribers.

**Option 3 (migrate at renewal)**: Requires Stripe Subscription Schedules or bulk
subscription patching, which adds implementation complexity without clear spec benefit
over grandfathering.

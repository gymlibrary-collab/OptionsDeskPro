# ADR 0001 — Stripe Checkout vs Stripe Elements for onboarding payment

**Date:** 12 Jun 2026
**Status:** Accepted
**Feature:** Multi-Tenanted SaaS Conversion

---

## Context

During onboarding, a new subscriber choosing a paid tier must supply card details to
create a Stripe subscription. Two integration styles are available:

- **Stripe Checkout** (hosted page redirect): Stripe serves the entire payment page.
  We create a Checkout Session server-side and redirect the browser to
  `checkout.stripe.com`. On completion, Stripe redirects back to a
  `success_url` we supply.

- **Stripe Elements** (embedded): We embed a Stripe-provided card input widget into
  our own React page. We call `stripe.confirmCardSetup` or `stripe.confirmPayment`
  client-side. Card data never touches our backend, but the UI is inside our product
  shell.

A third option — **Stripe Payment Element** (a newer composite widget) — is a variant
of Elements that handles card, wallet, and bank payments through a single embeddable
component. It is API-compatible with Elements and would be the preferred embedded
approach if we choose that path.

---

## Decision

Use **Stripe Checkout** (hosted redirect) for the onboarding payment step.

---

## Rationale

| Criterion | Checkout | Elements |
|-----------|----------|----------|
| PCI scope | SAQ A (minimal) | SAQ A-EP (higher) |
| Implementation complexity | Low — one server call to create session, redirect | Medium — must wire Stripe.js, handle client-side confirm, handle 3DS |
| 3DS / SCA handling | Automatic, handled by Stripe | Must be handled explicitly |
| Styling / branding | Limited (logo + colours configurable) | Full control |
| Conversion optimisation | Stripe's page is tested extensively | Our page is untested |
| Time to launch | 1–2 days | 3–5 days |

For this feature's scope (monthly billing, USD only, no trial), the conversion
benefit of a fully custom-styled card form is low relative to the extra engineering
and compliance surface. Stripe Checkout also handles authentication challenges
(3DS2) transparently, which is mandatory for European cards and increasingly common
elsewhere.

The reduced PCI scope (SAQ A vs SAQ A-EP) is material: with Checkout, card data
never touches our JavaScript, our CDN, or our backend. With Elements, we must ensure
Stripe.js is loaded exclusively from `js.stripe.com` and never proxied — a requirement
that is easy to violate inadvertently in a CI/CD pipeline.

The Stripe Customer Portal (already approved in spec for card updates, FR-20) is also
a hosted Stripe page, so the UX pattern of briefly leaving our domain is already
accepted.

---

## Consequences

- `POST /api/billing/checkout-session` returns a `{ url }` that the frontend
  redirects the browser to.
- After payment, Stripe redirects to `<client_portal>/onboarding/complete?session_id=...`.
  The backend must verify the session via webhook (`checkout.session.completed`) rather
  than the query parameter alone, because the query param can be replayed.
- Onboarding step 3 renders a "Redirecting to secure payment..." interim page rather
  than an embedded card form.
- `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` env vars (or DB-stored price IDs) are
  needed server-side only — no Stripe publishable key is needed on the frontend for
  the Checkout flow (it is only needed if Elements is used).
  Exception: the Stripe publishable key is still needed for the Customer Portal
  session redirect pattern (no key needed there either — portal is purely a redirect).
  Result: no Stripe publishable key required in frontend env vars for MVP.

---

## Rejected alternatives

**Stripe Elements / Payment Element**: Rejected for higher PCI scope and 3DS
complexity that is not justified at launch scale.

**Manual card handling**: Not considered. PCI DSS Level 1 compliance cost is
prohibitive for a paper-trading SaaS.

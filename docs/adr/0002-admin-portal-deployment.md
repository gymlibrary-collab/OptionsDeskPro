# ADR 0002 — Admin portal deployment: separate Railway service vs hostname detection

**Date:** 12 Jun 2026
**Status:** Accepted
**Feature:** Multi-Tenanted SaaS Conversion

---

## Context

The spec requires the platform admin portal to be served at `admin.<domain>.com`,
isolated from the client portal at `optionsdeskpro.<domain>.com`. Three deployment
options were evaluated:

1. **Single frontend build, hostname detection at runtime**: One Railway service
   hosts both portals. At page load, JavaScript reads `window.location.hostname` and
   renders either the client portal tree or the admin portal tree. A `VITE_PORTAL_MODE`
   env var provides an override for local dev and pre-DNS staging.

2. **Two Railway frontend services, same backend, `VITE_PORTAL_MODE` differentiates**:
   Two separate deployments of the same codebase. Each sets `VITE_PORTAL_MODE=client`
   or `VITE_PORTAL_MODE=admin` as a build-time env var. The build output is identical;
   the env var flips which root component renders.

3. **Two separate repositories / codebases**: Admin portal is a wholly separate
   React application. Independent deployments with no shared code.

Additionally, the backend is shared in all three options — admin routes live under
`/api/platform/*` and `/api/billing/*` on the same FastAPI instance. The question
is frontend only.

---

## Decision

Use **option 2: two Railway frontend services, same build, `VITE_PORTAL_MODE` env var**.

---

## Rationale

**Option 1 (single service, hostname detection)** places both applications at the
same Railway URL. Before a custom domain is attached, both portals share
`*.up.railway.app` with no subdomain differentiation unless we add a `?portal=admin`
query override. This works for development but is fragile in staging: developers must
remember to add query params, and automated tests must parameterise URLs. It also
means a single deployment failure takes down both portals simultaneously.

**Option 3 (separate codebases)** is the most isolated but duplicates all shared
components (design tokens, auth utilities, API client typedefs). Keeping two
codebases in sync doubles maintenance burden with no material gain given both portals
share the same backend and Supabase project.

**Option 2** gives the strongest operational isolation (separate Railway service =
separate URL, separate deploy pipeline, independent rollback) while sharing a single
codebase. A `VITE_PORTAL_MODE` env var (`client` | `admin`) is baked in at build
time. The `App.tsx` entry point checks this value (with a runtime hostname fallback for
correctness in production) and mounts either `<ClientApp>` or `<AdminApp>`.

In staging, before DNS is configured:
- Client portal: Railway URL for the client service (e.g. `optionspro-client-production.up.railway.app`)
- Admin portal: Railway URL for the admin service (e.g. `optionspro-admin-production.up.railway.app`)

No `?portal=` query hacks are needed. The correct portal loads from its own URL.

---

## Consequences

- A second Railway service `optionspro-admin` is added to the project.
- Both services use the same GitHub repo. Both run `npm run build` with different
  `VITE_PORTAL_MODE` values set in the Railway environment panel.
- The frontend `App.tsx` entry point is refactored to branch on portal mode.
- CORS: the backend `main.py` `allow_origins` list gains the admin Railway URL
  (and later the `admin.<domain>` custom domain), driven by the `ADMIN_PORTAL_ORIGINS`
  env var (comma-separated list) so the backend code does not need re-deployment when
  the domain is finalised.
- The `AdminApp` root component only mounts if the user is authenticated as platform
  staff (checked via `StaffAuthContext`). Unauthenticated requests see a login page only.

---

## Rejected alternatives

**Option 1 (hostname detection, single service)**: Rejected because it provides no
URL-level isolation in the Railway staging environment (pre-DNS) and single-point-of-failure
deployment.

**Option 3 (separate codebases)**: Rejected due to code duplication and doubled
maintenance overhead.

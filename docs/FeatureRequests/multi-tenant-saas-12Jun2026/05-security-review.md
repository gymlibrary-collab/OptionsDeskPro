# Security Review — Multi-Tenanted SaaS Conversion
**Date:** 12 Jun 2026
**Reviewer:** security-reviewer
**Branch:** claude/modest-davinci-sxz7lv
**Base commit:** e0ffa2a
**Gate decision:** FAIL — 2 Critical, 3 High findings must be resolved before merge.

---

## Invariant Checklist

| Invariant | Status | Notes |
|-----------|--------|-------|
| JWT verification via `sb.auth.get_user()` only | PASS | `auth_utils.py` line 24 — correct |
| `python-jose` not imported anywhere | CONDITIONAL | Package present in `requirements.txt`; not imported in any `.py` file. Package should be removed from `requirements.txt` to eliminate attack surface. |
| `SUPABASE_JWT_SECRET` absent | PASS | Not found anywhere in the codebase |
| `MARKETDATA_API_TOKEN` not in frontend | PASS | Not found in any frontend file |
| `SUPABASE_SERVICE_KEY` not in frontend | PASS | Not found in any frontend file |
| `STRIPE_SECRET_KEY` not in frontend | PASS | Not found in any frontend file |
| `STRIPE_WEBHOOK_SECRET` not in frontend | PASS | Not found in any frontend file |
| All new routes explicitly guarded | PASS with note | See F-004 (deactivated subscriber bypass) |
| No existing RLS policies dropped | PASS | Migration 006 is additive only |
| No Alpaca re-introduction | PASS | Not found |

---

## Findings

### CRITICAL-001 — ADMIN_EMAIL mismatch silently breaks admin bootstrap

**Severity:** Critical
**Files:**
- `backend/services/auth_utils.py` line 10: `ADMIN_EMAIL = "leonardsim.sm@gmail.com"`
- `backend/migrations/006_saas_conversion.sql` lines 156, 270: `'leonard.simgt@gmail.com'`
- `backend/services/staff_auth.py` line 62: bootstrap guard uses `ADMIN_EMAIL` from `auth_utils.py`

**Description:**
The constant `ADMIN_EMAIL` used at runtime for every admin bypass check (`require_admin`, staff bootstrap in `_get_staff_row`, the login gate in `auth_routes.py`) is `leonardsim.sm@gmail.com`. The migration seed that grants the platform-owner `staff_role` to that email address and marks onboarding complete uses `leonard.simgt@gmail.com`. These are two different strings.

If the actual production account uses `leonard.simgt@gmail.com` (which is consistent with all migrations going back to `001_initial_schema.sql`), then `ADMIN_EMAIL` at runtime does not match the account, meaning:
- No admin bypass in `require_admin` — admin loses access to `/api/admin/*` routes.
- Staff bootstrap in `staff_auth.py` lines 62–76 never fires — the owner gets a 403 on the admin portal.
- The login route at `auth_routes.py` line 27 never exempts the admin from maintenance/invite-only checks.

Conversely, if `leonardsim.sm@gmail.com` is the real address, then all migrations seeded the wrong email and the platform-owner row in `platform_staff` may point to a non-existent auth user, leaving the owner locked out of their own portal.

Either way, one of these two email values is wrong and the discrepancy is silent — no startup assertion, no test coverage for the cross-file mismatch.

**Recommendation:** Audit the actual Google account email. Fix the discrepancy so all occurrences — `auth_utils.py`, migrations 001/002/003/006, and the CLAUDE.md ADMIN_EMAIL note in the system prompt — use the same value. Add a startup assertion or unit test that compares the constant against the seeded migration value to prevent future drift.

---

### CRITICAL-002 — Deactivated subscriber bypass: `deactivated_at` is only enforced at login, not on subsequent API calls

**Severity:** Critical
**Files:**
- `backend/routes/auth_routes.py` lines 57–63: `deactivated_at` check
- `backend/services/auth_utils.py`: `verify_token()` — no deactivation check

**Description:**
Account deactivation sets `user_profiles.deactivated_at = now()` but this is only checked during `POST /api/auth/login`. Every other route — including `/api/positions`, `/api/orders`, `/api/watchlist`, `/api/billing/*`, `/api/strategies/*` — uses `verify_token()` which only validates the Supabase JWT. As long as the Supabase Auth session remains valid (up to 1 hour for access tokens), a deactivated subscriber can continue to call all data-plane endpoints, record paper trades, modify their watchlist, and access billing endpoints.

A staff member who deactivates an account via `PATCH /api/platform/subscribers/{user_id}/deactivate` will believe the account is immediately suspended; it is not.

**Recommendation:** Add a deactivation check in `verify_token()` or in a shared middleware. The simplest fix is to add a check inside `verify_token` that queries `user_profiles.deactivated_at` and raises 403 with `X-Error-Code: account_suspended` if non-null. Accept the DB cost (it is the same query already made at login). Alternatively, use Supabase Admin API to revoke the session on deactivation.

---

### HIGH-001 — Stripe webhook signature verification silently passes when `STRIPE_WEBHOOK_SECRET` is unset

**Severity:** High
**File:** `backend/services/stripe_service.py` lines 382–392

**Description:**
`STRIPE_WEBHOOK_SECRET` is read with a default of `""`. If this environment variable is not set in a production deployment, `stripe.Webhook.construct_event(raw_body, sig_header, "")` is called with an empty secret. Testing confirms this raises `SignatureVerificationError` (correct), but the failure depends entirely on `sig_header` being non-empty. A request with no `Stripe-Signature` header would cause an exception caught by the broad `except Exception` block at line 390, which raises `HTTPException(400, "Invalid webhook payload.")` — this is correct behaviour.

However, the `STRIPE_WEBHOOK_SECRET` being empty string is operationally silent. There is no startup warning, no log message, no health-check flag. A misconfigured deployment would silently reject all legitimate webhooks (returning 400) so subscription activations, payment failures, and cancellations would never be processed, without any alert.

Additionally, `_get_stripe()` is called before the secret is validated, meaning the `STRIPE_SECRET_KEY` must be present but the webhook secret does not get the same guard.

**Recommendation:** At startup or inside `handle_webhook_event`, add an explicit guard:
```python
if not webhook_secret:
    logger.error("STRIPE_WEBHOOK_SECRET is not set — webhook endpoint is non-functional")
    raise HTTPException(status_code=500, detail="Webhook endpoint is not configured.")
```
Include `STRIPE_WEBHOOK_SECRET` in the Railway service health check / startup validation script.

---

### HIGH-002 — Subscriber search string interpolated directly into Supabase `.or_()` filter

**Severity:** High
**File:** `backend/routes/platform_routes.py` lines 69, 80

**Description:**
The `search` query parameter from the request is interpolated directly into the Supabase PostgREST filter string:

```python
query = query.or_(f"email.ilike.%{search}%,full_name.ilike.%{search}%")
```

PostgREST filter strings are not the same as parameterised SQL. The `or_()` method passes this string to the PostgREST query builder which parses it as a filter expression. A crafted `search` value containing PostgREST filter syntax (e.g. commas, parentheses, dots, or column names) could alter the filter logic, potentially causing the query to return rows the staff member should not see or causing an application error.

For example, a `search` value of `)` or `email.eq.victim@example.com` could inject additional filter predicates. While this endpoint is staff-only (owner or support), the principle of no string interpolation into query expressions applies regardless of caller privilege level.

**Recommendation:** Sanitise or reject search inputs containing PostgREST special characters (`,()?`). Alternatively, split the search into separate column filters using the typed Supabase filter methods `ilike()` rather than the `or_()` string approach:
```python
# Safer pattern — two separate queries unioned, or use PostgREST's typed API
query = query.ilike("email", f"%{search}%")
```
Note that the Supabase Python client does not have a built-in OR-across-columns typed method; the safest fix is to escape or whitelist the search input to alphanumeric, `@`, `.`, `-`, `_`, and space characters only.

---

### HIGH-003 — `python-jose` present in `requirements.txt` despite being a prohibited dependency

**Severity:** High
**File:** `backend/requirements.txt` line 9

**Description:**
`python-jose[cryptography]>=3.3.0` is listed as a dependency. CLAUDE.md states explicitly: "Do not switch JWT verification back to `python-jose`" and the invariant exists because a previous `python-jose`-based implementation accepted the `none` algorithm, allowing token forgery. Although no `.py` file currently imports `jose`, the package is present in the installed environment.

Having the package installed creates several risks:
1. Any future developer importing it accidentally bypasses the Supabase-verified path.
2. Supply chain: `python-jose` is a transitive attack vector if it contains vulnerabilities.
3. A code review that searches for JWT-related code will find the package in `requirements.txt` and may incorrectly conclude it is in use.

**Recommendation:** Remove `python-jose[cryptography]` from `requirements.txt`. If any other installed package depends on it transitively, that dependency should be audited.

---

### MEDIUM-001 — `plans`, `platform_staff`, `platform_audit_log`, `support_sessions`, `faq_categories`, `faq_articles`, `stripe_webhook_events`, and `platform_settings` tables have no RLS enabled

**Severity:** Medium
**File:** `backend/migrations/006_saas_conversion.sql` lines 38, 122, 145, 184, 201, 230, 251

**Description:**
Eight of ten new tables created in migration 006 do not have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` applied. The migration comments acknowledge this ("No RLS: service role only"), and the backend exclusively queries via `SUPABASE_SERVICE_KEY` which bypasses RLS regardless. However, tables without RLS enabled in Supabase are readable by **any authenticated user** using the anon key and their own JWT directly against the Supabase REST API (`https://<project>.supabase.co/rest/v1/<table>`).

Concretely:
- `plans`: A subscriber using the Supabase JS client directly can read `stripe_price_id` and `stripe_product_id` for all tiers. These are internal Stripe identifiers. While not immediately exploitable, exposing Stripe price IDs to arbitrary subscribers is unnecessary information disclosure.
- `platform_staff`: A subscriber can enumerate all staff email addresses and roles.
- `platform_audit_log`: A subscriber can read all audit records including staff actions against other subscribers.
- `support_sessions`: A subscriber can read all support sessions including `subscriber_id` of other users.
- `faq_articles`: Draft (unpublished) FAQ articles are readable by any subscriber.
- `stripe_webhook_events`: A subscriber can see truncated Stripe event payloads.

None of these tables contain highly sensitive secrets, but the combination of staff email enumeration, audit log exposure, and support session cross-user data visibility constitutes a meaningful data leak for a SaaS platform.

**Recommendation:** For all eight tables, add `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;` with no permissive policies (which defaults to deny-all for non-service-role access). This is the correct posture when "service role only" is the intent. Add a migration 008 to apply this retroactively.

---

### MEDIUM-002 — CSV revenue export uses `window.open` (unauthenticated browser request)

**Severity:** Medium
**File:** `frontend/src/components/admin/RevenuePanel.tsx` lines 46–56

**Description:**
The "Export CSV" button calls `window.open(url, '_blank')` which opens a new browser tab making a standard `GET` request. This request does not include the `Authorization: Bearer <token>` header that the axios `api` client normally attaches. The backend endpoint `GET /api/platform/revenue/export-csv` requires `require_staff(["owner", "finance"])` and therefore expects the JWT in the Authorization header. The `window.open` request will be missing that header and will receive a 401 response, causing the user to see either an empty page or a JSON error response.

This is a functional failure that also reveals information: if CORS is not configured to allow the tab navigation origin, the error response may include internal detail. Additionally, if the endpoint were ever made to accept a token via query parameter as a workaround, that would expose the staff JWT in browser history and server logs.

**Recommendation:** Replace `window.open` with a fetch-based download that includes the Authorization header and uses `URL.createObjectURL` to trigger the download:
```typescript
const resp = await api.get('/platform/revenue/export-csv', {
  params: { from_date: from, to_date: to },
  responseType: 'blob',
})
const url = URL.createObjectURL(new Blob([resp.data]))
const a = document.createElement('a'); a.href = url; a.download = 'revenue_export.csv'; a.click()
URL.revokeObjectURL(url)
```

---

### LOW-001 — `stripe_customer_id` and `stripe_subscription_id` exposed in subscriber detail API response

**Severity:** Low
**Files:**
- `backend/routes/platform_routes.py` lines 210–213
- `frontend/src/api/client.ts` lines 623–624

**Description:**
The `GET /api/platform/subscribers/{user_id}` response includes `stripe_customer_id` and `stripe_subscription_id` in the subscription block. These are exposed to all support and owner staff. The stripe_subscription_id in particular can be used to cancel or modify a subscription if an attacker obtained a Stripe API key. The endpoint is correctly staff-restricted, but the principle of least information disclosure applies — support staff do not need Stripe IDs to perform their duties.

**Recommendation:** Remove `stripe_customer_id` and `stripe_subscription_id` from the subscriber detail response for `support` role callers, returning them only for `owner` role. Or at minimum, document the decision.

---

### LOW-002 — `plans` table `stripe_price_id` readable via anon key without RLS (overlaps MEDIUM-001)

**Severity:** Low (subset of MEDIUM-001, separately called out for traceability)
**File:** `backend/migrations/006_saas_conversion.sql` line 38

**Description:**
The `plans` table comment states "No RLS: read by service role only" but without RLS enabled, any authenticated user can directly query the table via Supabase REST and obtain `stripe_price_id` and `stripe_product_id`. This is a subset of MEDIUM-001 but is noted separately because the checkout session flow derives `stripe_price_id` server-side from this table — having it publicly readable could allow a subscriber to attempt direct Stripe API manipulation if they separately obtained a leaked publishable key scenario.

**Recommendation:** Addressed by MEDIUM-001 fix (enable RLS with no permissive policies on the `plans` table).

---

### INFORMATIONAL-001 — Account deletion does not purge `platform_audit_log` entries for the deleted user

**Severity:** Informational
**File:** `backend/routes/auth_routes.py` lines 168–223

**Description:**
`DELETE /api/auth/account` calls `sb.auth.admin.delete_user(user_id)` which cascade-deletes `user_profiles` and `subscriptions` (via FK `ON DELETE CASCADE`). However, `platform_audit_log.target_user_id` has `REFERENCES auth.users(id)` without `ON DELETE CASCADE` (migration 006 line 169), so audit records referencing the deleted user's ID will retain the UUID but lose referential integrity. This is not a security vulnerability but may cause GDPR right-to-erasure compliance issues if audit log entries contain PII about the deleted user (their `target_user_id` UUID remains, `actor_email` field for their actions is not present in the audit log since it only records staff actions).

**Recommendation:** Verify GDPR obligations. The audit log records staff actions against users — retaining the UUID after user deletion is generally acceptable for audit trail integrity; the UUID alone is not PII. Document this decision.

---

### INFORMATIONAL-002 — `ADMIN_PORTAL_ORIGINS` env var accepted without validation

**Severity:** Informational
**File:** `backend/main.py` lines 29–33

**Description:**
The CORS origin list is extended by splitting `ADMIN_PORTAL_ORIGINS` on commas with only `o.strip()` applied. A misconfigured environment variable like `*` or `https://*.attacker.com` would be accepted as-is into the CORS allow-list. This is an operational risk rather than a code defect.

**Recommendation:** Add a startup assertion that rejects wildcard CORS origins and validates each entry is a valid `https://` URL.

---

## Summary Table

| ID | Severity | Title |
|----|----------|-------|
| CRITICAL-001 | Critical | ADMIN_EMAIL mismatch across runtime constant and all migrations |
| CRITICAL-002 | Critical | Deactivated subscriber bypass — only enforced at login |
| HIGH-001 | High | Empty `STRIPE_WEBHOOK_SECRET` silently disables webhook processing |
| HIGH-002 | High | Search string interpolated into PostgREST filter expression |
| HIGH-003 | High | `python-jose` present in `requirements.txt` (prohibited dependency) |
| MEDIUM-001 | Medium | 8 new tables lack RLS enabled — readable via anon key |
| MEDIUM-002 | Medium | CSV export uses `window.open` — Authorization header not sent |
| LOW-001 | Low | Stripe IDs exposed to support staff in subscriber detail response |
| LOW-002 | Low | `plans.stripe_price_id` readable via anon key (subset of MEDIUM-001) |
| INFO-001 | Informational | Deleted user audit records retain UUID |
| INFO-002 | Informational | `ADMIN_PORTAL_ORIGINS` accepts wildcard values without validation |

---

## Gate Decision: FAIL

Two Critical findings (CRITICAL-001, CRITICAL-002) and three High findings (HIGH-001, HIGH-002, HIGH-003) must be resolved before this branch is eligible for production merge.

**Conditions for PASS:**

1. **CRITICAL-001:** Confirm the correct admin email. Update `auth_utils.py:ADMIN_EMAIL` (or the migrations, depending on which is wrong) so a single email string is used everywhere. Add a test or startup assertion to prevent future drift.

2. **CRITICAL-002:** Add a deactivation check to `verify_token()` or equivalent middleware so deactivated accounts receive 403 on all API endpoints immediately after deactivation, not only at next login.

3. **HIGH-001:** Add a non-empty guard for `STRIPE_WEBHOOK_SECRET` inside `handle_webhook_event` that raises an explicit 500 (not processes without a secret).

4. **HIGH-002:** Sanitise the `search` parameter to whitelist characters before interpolation into the PostgREST `or_()` filter string in `platform_routes.py` list_subscribers.

5. **HIGH-003:** Remove `python-jose[cryptography]` from `requirements.txt`.

**Recommended before merge (not blocking, but should be tracked):**

- MEDIUM-001: Enable RLS on all 8 tables with no permissive policies (add migration 008).
- MEDIUM-002: Fix CSV export to use fetch + Blob download with Authorization header.


---

## Gate 5 Re-verification — 12 Jun 2026

**Re-reviewer:** security-reviewer
**Re-verification date:** 12 Jun 2026
**Scope:** Confirm closure of all 7 findings flagged in the original Gate 5 review (CRITICAL-001, CRITICAL-002, HIGH-001, HIGH-002, HIGH-003, MEDIUM-001, MEDIUM-002). One new operational limitation (multi-worker cache) noted below.

---

### Finding Close-out Table

| Finding ID | Original Severity | Title | Verification Method | Result | Status |
|------------|------------------|-------|---------------------|--------|--------|
| CRITICAL-001 | Critical | ADMIN_EMAIL mismatch | grep backend/ and CLAUDE.md for `leonard.simgt`; read `auth_utils.py` line 11 | Zero matches in backend/. `ADMIN_EMAIL = "leonardsim.sm@gmail.com"` at line 11. CLAUDE.md contains no occurrence of `leonard.simgt`. | CLOSED |
| CRITICAL-002 | Critical | Deactivated subscriber bypass | Read `auth_utils.py` lines 15–89; grep platform_routes.py for `invalidate_deactivation_cache` | `_is_deactivated()` is called inside `verify_token()` at line 77 before the payload is returned. `invalidate_deactivation_cache()` is called at lines 350 and 365 of `platform_routes.py` inside the deactivate and reactivate handlers respectively. | CLOSED |
| HIGH-001 | High | Stripe webhook secret guard absent | Read `stripe_service.py` lines 382–385 | `webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()` followed immediately by `if not webhook_secret: raise HTTPException(status_code=500, detail="Webhook secret not configured")`. Guard is in place before `_get_stripe()` and before `construct_event`. | CLOSED |
| HIGH-002 | High | PostgREST filter injection | Read `platform_routes.py` lines 22–29 and 77–92 | `_SEARCH_SAFE = re.compile(r"[^a-zA-Z0-9@._\- ]")` at line 24. `_sanitise_search()` strips all other characters at line 29. Called at lines 79 and 92 before the `or_()` interpolation. Whitelist is appropriately tight (alphanumeric, `@`, `.`, `_`, `-`, space). | CLOSED |
| HIGH-003 | High | `python-jose` in requirements.txt | Read `backend/requirements.txt` | File contains 10 lines. `python-jose` is absent. Only packages present: fastapi, requests, uvicorn, yfinance, numpy, scipy, pydantic, supabase, anthropic, stripe. | CLOSED |
| MEDIUM-001 | Medium | 8 tables lack RLS | Read `backend/migrations/008_rls_hardening.sql` | Migration file exists. All 8 tables are covered with `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY`: `plans`, `stripe_webhook_events`, `platform_staff`, `platform_audit_log`, `support_sessions`, `faq_categories`, `faq_articles`, `platform_settings`. No permissive policies added — deny-all for anon/authenticated roles by design. | CLOSED |
| MEDIUM-002 | Medium | CSV export uses `window.open` | Read `frontend/src/api/client.ts` lines 734–738; read `frontend/src/components/admin/RevenuePanel.tsx` lines 43–61 | `exportRevenueCsv` in `client.ts` uses `api.get(...)` with `responseType: 'blob'` — the axios `api` instance attaches the `Authorization` header on every request. `RevenuePanel.tsx` awaits `exportRevenueCsv`, constructs a `Blob`, creates an object URL, triggers download via a transient `<a>` element, and calls `URL.revokeObjectURL`. No `window.open` present. | CLOSED |

---

### Spot-check: Multi-worker deactivation cache propagation

**Classification:** Accepted Operational Limitation (not a new finding)

**Observation:** The deactivation enforcement introduced for CRITICAL-002 uses a module-level in-process dict (`_deactivation_cache` in `auth_utils.py`). In a single-process uvicorn deployment the cache is shared across all async workers within that process and behaves correctly: calling `invalidate_deactivation_cache(user_id)` in the deactivate handler causes the next request in the same process to perform a fresh DB lookup.

In a multi-process deployment (e.g., `uvicorn --workers N` with N > 1, or multiple Railway replica instances), each OS process maintains its own independent copy of `_deactivation_cache`. A deactivation event that hits process A will invalidate the cache in process A only. Processes B through N will continue to serve the deactivated user until either the 60-second TTL expires naturally in each process, or those processes happen to handle a request for the same user_id and the TTL has elapsed.

The practical window is bounded by `_DEACTIVATION_TTL = 60.0` seconds (line 20 of `auth_utils.py`). A deactivated subscriber who holds an active session may continue to reach data-plane endpoints for up to 60 seconds per non-invalidated worker.

**Accepted posture:** The current Railway deployment of OptionsDesk runs a single backend service instance with a single uvicorn process (the Railway start command does not pass `--workers`). Under this topology the cache inconsistency window does not exist. The limitation becomes relevant only if the deployment is scaled horizontally.

**Workaround for future scale-out:** Replace the module-level dict with a short-TTL Redis or Supabase-backed flag, or reduce `_DEACTIVATION_TTL` to a value operationally acceptable as a maximum suspension lag (e.g., 5–10 seconds). Alternatively, use the Supabase Admin API to revoke the user's session token on deactivation, which eliminates the need for any out-of-band cache entirely.

**Action required before this limitation becomes a real risk:** Document in the Railway deployment runbook that horizontal scaling of the backend service requires either a shared cache layer or a session revocation strategy before activation. No code change is required for the current single-instance deployment.

---

### Re-verification Gate Decision: PASS

All 7 findings from the original Gate 5 review have been remediated and are confirmed closed:

- CRITICAL-001: Closed. `ADMIN_EMAIL` is `leonardsim.sm@gmail.com` throughout; `leonard.simgt` is absent from all backend files and CLAUDE.md.
- CRITICAL-002: Closed. `verify_token()` calls `_is_deactivated()` on every authenticated request; deactivate/reactivate handlers call `invalidate_deactivation_cache()` to make enforcement immediate within the current single-process deployment.
- HIGH-001: Closed. `handle_webhook_event` raises HTTP 500 before any Stripe call when `STRIPE_WEBHOOK_SECRET` is unset.
- HIGH-002: Closed. `_sanitise_search()` strips PostgREST-unsafe characters via a tight whitelist regex before any interpolation into `or_()`.
- HIGH-003: Closed. `python-jose` is not present in `backend/requirements.txt`.
- MEDIUM-001: Closed. Migration `008_rls_hardening.sql` enables RLS on all 8 flagged tables with deny-all posture for non-service-role access.
- MEDIUM-002: Closed. CSV export uses an authenticated blob fetch via the axios `api` client; `window.open` is not used.

The in-process deactivation cache limitation under multi-worker deployments is noted as an accepted operational constraint for the current single-instance Railway topology. It must be addressed before horizontal scaling is enabled.

No Critical or High findings remain open. The feature is cleared to proceed to Gate 6.

# Gate 5 — Security Review
## Feature: Legal Terms Acknowledgment Gate
**Review date:** 14 Jun 2026
**Reviewer:** Security Reviewer (Gate 5)
**Gate decision: CONDITIONAL PASS**

---

## Executive Summary

The legal acknowledgment gate is architecturally sound in the areas that matter most: JWT verification remains exclusively via `supabase.auth.get_user()`, no secrets are exposed to the frontend, user identity is always taken from the verified token rather than the request body, and the database schema uses immutability triggers and RLS to protect the audit trail. Two medium-severity issues require resolution before release: the `version_id` and `content_hash` fields in `POST /api/legal/acknowledge` are accepted as raw strings with no UUID or hex-format validation, allowing malformed input to reach database queries; and the `SECURITY DEFINER` function `publish_legal_version()` lacks a `SET search_path` guard, which is a hardening gap in a financial-audit context. A further medium finding is that the front-end legal gate is enforced only in client-side React state and can be dismissed without a true server-side block on subsequent API calls. Several low-severity and informational observations are also recorded. No Critical or High findings were identified.

---

## Findings Table

| ID | Severity | Area | Title |
|----|----------|------|-------|
| F-01 | Medium | Input Validation | `version_id` accepted as a plain string — no UUID format validation |
| F-02 | Medium | Input Validation | `content_hash` accepted as a plain string — no hex-format or length validation |
| F-03 | Medium | Authorization | Legal gate is client-side only — no backend enforcement prevents authenticated API access after gate bypass |
| F-04 | Medium | Database Security | `SECURITY DEFINER` function `publish_legal_version()` lacks `SET search_path = public` guard |
| F-05 | Low | Audit Trail / IP | `x-forwarded-for` is taken from the first comma-separated value without Railway-specific header trust configuration |
| F-06 | Low | Authorization / IDOR | Subscriber history endpoint validates `user_id` only against `user_profiles`, not against the requesting staff member's permitted scope |
| F-07 | Low | Fail-Open Risk | `get_pending_legal_acknowledgment` fails open; this is intentional but the surface is wide (login endpoint + every cache expiry) |
| F-08 | Low | Cache | Module-level in-process cache for the active legal version is not safe under horizontal scale; documented assumption is single Railway instance |
| F-09 | Info | JWT Invariants | `verify_token` correctly uses `sb.auth.get_user(token)` — no regression |
| F-10 | Info | Secrets | No `MARKETDATA_API_TOKEN`, `SUPABASE_SERVICE_KEY`, or backend-only keys appear in any frontend file or `VITE_` variable |
| F-11 | Info | XSS | `content_markdown` is rendered with `<pre>` and string interpolation, not `dangerouslySetInnerHTML` — no XSS path |
| F-12 | Info | Immutability | DB triggers correctly block all UPDATE (except `is_active`) and DELETE on both tables |
| F-13 | Info | RLS | RLS enabled on both new tables; no policies grant INSERT/UPDATE/DELETE to authenticated role on `legal_acknowledgments` |
| F-14 | Info | Seed data | Admin email `leonardsim.sm@gmail.com` is referenced in the seed INSERT as a `SELECT id FROM auth.users` subquery — correct; no hardcoded UUID |

---

## Detailed Findings

### F-01 — Medium: `version_id` accepted as a plain string with no UUID format validation

**File:** `/home/user/OptionsDeskPro/backend/routes/legal_routes.py`

`AcknowledgeRequest.version_id` is declared as `str`. No Pydantic `UUID` type or regex validator constrains the input before it is passed to the Supabase `.eq("version_id", version_id)` filter. The Supabase Python client passes this value as a parameter, so PostgreSQL type coercion will reject a non-UUID value at query time (Postgres will raise a `invalid input syntax for type uuid` error, which FastAPI catches and returns as HTTP 500). However, this means that a malformed value causes an internal server error rather than a clean HTTP 422, which leaks the fact that a DB query was attempted, and produces noisy error logs. More importantly, the lack of early validation is a defence-in-depth gap: if the Supabase client ever changed how it passes parameters, a crafted value could affect query behaviour.

**Recommendation:** Change `version_id: str` to `version_id: uuid.UUID` in `AcknowledgeRequest`, then cast to `str` when passing to Supabase. This produces a HTTP 422 on invalid input before any DB interaction.

---

### F-02 — Medium: `content_hash` accepted as a plain string with no format validation

**File:** `/home/user/OptionsDeskPro/backend/routes/legal_routes.py`

`AcknowledgeRequest.content_hash` is declared as `str` with no length or character-set constraint. A SHA-256 hex digest is always exactly 64 lowercase hexadecimal characters. The backend compares this value against `active["content_hash"]` (from the DB) and rejects mismatches, so there is no storage or injection risk from a bad value. However, there is no guard preventing submission of an arbitrarily long string (up to whatever Pydantic's default allows), which creates a minor denial-of-service surface via log volume and unnecessary string comparison work. A format validator would also make the intent explicit and fail fast cleanly.

**Recommendation:** Add a Pydantic field validator: `content_hash: str = Field(pattern=r'^[0-9a-f]{64}$')`. This enforces the SHA-256 hex format before any comparison and returns HTTP 422 on violation.

---

### F-03 — Medium: Legal gate enforcement is client-side only

**Files:** `/home/user/OptionsDeskPro/frontend/src/App.tsx`, `/home/user/OptionsDeskPro/backend/routes/legal_routes.py`

The `showLegalGate` flag in `App.tsx` is derived exclusively from the `pendingLegalAcknowledgment` boolean stored in React state (set from the login response). Once a user is authenticated, they can call any backend API endpoint (options chain, positions, strategy scanner, etc.) without ever acknowledging the legal terms, by:
- Using the bearer token directly against the backend (e.g. with curl), or
- Manipulating `pendingLegalAcknowledgment` in the browser's React DevTools / JavaScript console to `false`, which clears the gate.

The backend has no middleware or per-route guard that checks whether the requesting user has an acknowledgment row before serving business logic. `get_pending_legal_acknowledgment` is called only at login time to populate the login response payload.

The severity is Medium rather than High because: (a) this is a paper-trading platform with no real financial execution; (b) the legal gate is for compliance record-keeping, not access control to sensitive financial data; (c) circumvention requires deliberate technical effort. However, for a legal indemnification gate to be legally meaningful, the server must be able to assert that the user acknowledged the terms before transacting. A sophisticated user who bypasses the gate and later claims they never saw the terms creates a compliance liability.

**Recommendation:** Add a lightweight FastAPI middleware or a dependency (e.g. a `require_legal_acknowledgment` dependency on business-logic routes) that, on a cache miss, checks whether the user has a current acknowledgment row, returning HTTP 451 if not. The 60-second active-version cache already exists in `legal_service.py` and can be reused to make this check cheap. Alternatively, if the product decision is that client-side enforcement is acceptable, document this explicitly in the design and obtain legal sign-off.

---

### F-04 — Medium: `SECURITY DEFINER` function lacks `SET search_path` guard

**File:** `/home/user/OptionsDeskPro/backend/migrations/012_legal_acknowledgments.sql`

The `publish_legal_version()` function is declared `SECURITY DEFINER`, meaning it runs with the privileges of the function owner (typically the `postgres` superuser in Supabase). PostgreSQL's security advisory for `SECURITY DEFINER` functions explicitly recommends setting `search_path` to prevent a malicious schema injection attack: if an attacker can create a schema and place objects with the same names as tables the function references, those objects would be used instead of the intended tables.

The current declaration:
```sql
CREATE OR REPLACE FUNCTION publish_legal_version(...) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
```
has no `SET search_path = public, pg_temp` clause.

In the context of Supabase, the function owner is the database superuser, so exploitation would require a user who can create schemas and execute the function — a Supabase database user with `CREATE` privilege. In the managed Supabase environment the risk is low in practice, but it is a hardening gap in a function that modifies legal audit records and runs with elevated privilege.

**Recommendation:** Add `SET search_path = public` to the function definition:
```sql
CREATE OR REPLACE FUNCTION publish_legal_version(...)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$ ... $$;
```

---

### F-05 — Low: IP address from `x-forwarded-for` is not restricted to a trusted proxy

**File:** `/home/user/OptionsDeskPro/backend/routes/legal_routes.py` (lines 112–117); also `/home/user/OptionsDeskPro/backend/routes/auth_routes.py` (line 99)

The acknowledgment route reads the IP address as:
```python
xff = request.headers.get("x-forwarded-for")
if xff:
    ip_address = xff.split(",")[0].strip()
```

The `x-forwarded-for` header is set by proxies and can be trivially forged by a client if the proxy does not strip or overwrite it. On Railway (the deployment platform), Railway's edge adds the real client IP to `x-forwarded-for`, but if additional proxy hops exist (e.g. Cloudflare in front of Railway), the leftmost value is the value the client supplied, not the real IP.

The audit trail stores `ip_address` as a legal record. If a user can control this value, the legal record is unreliable. This is a low severity because: the acknowledgment row is still correctly tied to the authenticated `user_id`; IP is supplementary evidence only; and exploiting this requires the user to set a custom header.

**Recommendation:** Document the expected proxy topology and, if Railway terminates the connection, take `request.client.host` (the Railway edge IP) as the authoritative IP or use the last value in `x-forwarded-for` rather than the first. If Cloudflare is in use, use `CF-Connecting-IP` or configure trusted proxy IPs.

---

### F-06 — Low: Subscriber history endpoint IDOR surface — any staff member can query any `user_id`

**File:** `/home/user/OptionsDeskPro/backend/routes/platform_legal_routes.py`

`GET /api/platform/legal/subscribers/{user_id}/history` accepts `user_id` as a path parameter and returns that user's full legal acknowledgment history including IP addresses. The only access control is `require_staff(["owner", "support", "finance"])`. There is no check that the requesting staff member has any particular relationship to the subscriber, and no audit log entry is written for history fetches.

This is the same access model used elsewhere in the admin portal (e.g. subscriber profile views), so it is consistent with the existing design. However, the legal history contains IP addresses, which are PII in many jurisdictions (GDPR, CCPA). A compromised support staff account could enumerate all subscriber legal records silently.

**Recommendation:** Add a `platform_audit_log` entry on each history fetch (same `_audit()` pattern already used in the publish endpoint). This at minimum creates a trail if access is abused.

---

### F-07 — Low: Fail-open scope for `get_pending_legal_acknowledgment`

**File:** `/home/user/OptionsDeskPro/backend/services/legal_service.py`

The fail-open design (DB error returns `False`, meaning "no acknowledgment pending") is explicitly documented and intentional, matching the `_is_deactivated()` pattern in `auth_utils.py`. The tradeoff is: if the `legal_document_versions` or `legal_acknowledgments` tables become unavailable (DB timeout, misconfigured permissions), all users will be allowed in without the gate presenting, silently. Because the gate has legal compliance significance, this is worth flagging. The risk is bounded: it can only occur during a DB outage that also does not affect login itself (since login uses the same DB).

**Recommendation:** Consider emitting a high-severity log (e.g. `logger.error` rather than `logger.warning`) when the fail-open path is taken, so an outage that silently disables the gate surfaces immediately in monitoring. No code change is required to unblock release.

---

### F-08 — Low: In-process cache is not safe under horizontal scale

**File:** `/home/user/OptionsDeskPro/backend/services/legal_service.py`

The active-version cache (`_active_version_cache`) is a module-level Python dictionary. Under a single Railway instance this is correct. If the backend is ever scaled horizontally (multiple instances), `invalidate_legal_version_cache()` — called after publishing a new version — only invalidates the cache on the instance that handled the publish request. Other instances will serve stale data for up to 60 seconds.

This is low severity because: (a) the TTL is only 60 seconds; (b) the backend is currently documented as single-instance; (c) the consequence is a subscriber seeing old terms for up to 60 seconds after a publish, not a security bypass (the `content_hash` check on acknowledgment submission would reject a stale hash, triggering a 409 and re-fetch).

**Recommendation:** Document the single-instance assumption in `legal_service.py` as a comment. If horizontal scale is ever introduced, replace the module-level cache with Redis or a Supabase `NOTIFY`/`LISTEN` pattern.

---

### F-09 — Info: JWT verification path unchanged — PASS

`verify_token()` in `/home/user/OptionsDeskPro/backend/services/auth_utils.py` continues to use `sb.auth.get_user(token)`. No reference to `python-jose`, `SUPABASE_JWT_SECRET`, or algorithm negotiation was found in any new file.

---

### F-10 — Info: No secret exposure in frontend — PASS

A grep across all frontend files confirms `MARKETDATA_API_TOKEN`, `SUPABASE_SERVICE_KEY`, and any analogous backend-only secrets are absent from all frontend source files and from `VITE_` environment variable references. The only `VITE_` variables present are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`, and `VITE_PORTAL_MODE`, all of which are appropriate for frontend exposure.

---

### F-11 — Info: No XSS via content_markdown — PASS

`LegalAcknowledgmentGate.tsx` renders `content_markdown` as `{version.content_markdown}` inside a `<pre>` element. React's JSX string interpolation escapes HTML entities. `dangerouslySetInnerHTML` is not used anywhere in the gate component. There is no XSS path from the stored markdown content.

---

### F-12 — Info: Immutability triggers correct — PASS

`trg_legal_document_versions_immutable` guards all mutable columns except `is_active` on UPDATE and blocks all DELETE. `trg_legal_acknowledgments_immutable` blocks all UPDATE and DELETE unconditionally. Both triggers fire `BEFORE UPDATE OR DELETE FOR EACH ROW`. The `SECURITY DEFINER` function `publish_legal_version()` performs only an UPDATE of `is_active` (permitted) and an INSERT (not blocked by any trigger). The triggers cannot be bypassed by the service role because they are database-level triggers that fire regardless of the client's role.

---

### F-13 — Info: RLS configuration correct — PASS

`legal_document_versions` has one policy (`ldv_select`) granting SELECT to authenticated users; no INSERT/UPDATE/DELETE policies exist for non-service-role. `legal_acknowledgments` has one policy (`la_select_own`) restricting SELECT to the owner's own rows; no INSERT/UPDATE/DELETE policies for non-service-role. The service role used by the backend bypasses RLS by design (standard Supabase pattern). Direct Supabase client access with a subscriber's anon/user token cannot write to either table.

---

### F-14 — Info: Seed INSERT uses subquery for admin user_id — PASS

The seed row in the migration resolves the admin user via `(SELECT id FROM auth.users WHERE email = 'leonardsim.sm@gmail.com' LIMIT 1)`. This returns NULL if the admin has not yet registered, which is stored as `published_by = NULL` (the column is nullable). This is safe; no hardcoded UUID is embedded.

---

## Invariant Checklist

| # | Invariant | Status | Notes |
|---|-----------|--------|-------|
| 1 | Authentication bypass — legal gate cannot be bypassed without acknowledgment | Partial | Gate is client-side only (F-03). Backend APIs are accessible with a valid JWT and no acknowledgment row. |
| 2 | Authorization — subscribers cannot call staff-only endpoints | Pass | `require_staff()` checks `platform_staff.is_active` and role; subscriber JWTs are rejected. |
| 3 | Authorization — support staff cannot publish new versions | Pass | Publish requires `require_staff(["owner"])`; support and finance roles are rejected with HTTP 403. |
| 4 | Injection — no raw SQL with user input, no shell commands, no unvalidated external API calls | Pass | All queries use Supabase parameterised client methods. RPC parameters are passed as a dict. No shell calls. |
| 5 | Immutability — DB triggers cannot be bypassed via service role / RPC / Supabase dashboard | Pass | Triggers fire at DB level regardless of role. The RPC only sets `is_active = false` (permitted) and INSERTs (not blocked). |
| 6 | IP address spoofing — x-forwarded-for can be forged | Partial | First value from XFF is used without proxy trust verification (F-05). Low severity given user_id anchors the record. |
| 7 | Race conditions — version mismatch check sufficient | Pass | `version_id` comparison against cache, 409 on mismatch, re-fetch on client, UNIQUE constraint in DB. |
| 8 | Audit trail integrity — subscribers cannot delete or modify acknowledgment rows | Pass | Immutability trigger blocks all UPDATE and DELETE. RLS denies writes via anon/user role (F-12, F-13). |
| 9 | Secret exposure — no service role key, JWT secret, or backend-only tokens in frontend | Pass | Confirmed absent (F-10). |
| 10 | Input validation — version_id validated as UUID, content_hash validated | Fail | Both accepted as plain strings with no format validation (F-01, F-02). |
| 11 | Cache poisoning — 60s cache cannot return wrong version | Pass | Cache is keyed to the single active version row; invalidated synchronously on publish; race window is 60s at most, bounded by TTL. |
| 12 | IDOR — subscriber A cannot fetch subscriber B's legal history | Pass | The subscriber-facing `GET /api/legal/current-version` and `POST /api/legal/acknowledge` use `user_id` from the JWT only. The admin history endpoint is staff-gated (F-06 notes the audit gap but not an IDOR for subscribers). |

---

## Recommendations Summary

| Priority | Finding | Action |
|----------|---------|--------|
| Fix before release | F-01 | Change `version_id: str` to `version_id: uuid.UUID` in `AcknowledgeRequest` |
| Fix before release | F-02 | Add `Field(pattern=r'^[0-9a-f]{64}$')` to `content_hash` in `AcknowledgeRequest` |
| Fix before release | F-04 | Add `SET search_path = public` to `publish_legal_version()` SECURITY DEFINER function |
| Decision required | F-03 | Either add a backend enforcement dependency on business-logic routes, or obtain explicit legal/product sign-off that client-side enforcement is acceptable |
| Recommended | F-05 | Document proxy topology; consider using `request.client.host` or `CF-Connecting-IP` as authoritative IP |
| Recommended | F-06 | Add `_audit()` call on each subscriber legal history fetch |
| No code change | F-07 | Upgrade legal-fail-open log from `logger.warning` to `logger.error` |
| No code change | F-08 | Document single-instance assumption in `legal_service.py` |

---

## Conditions for PASS

This review returns **CONDITIONAL PASS**. The feature may proceed to Gate 6 once the following are resolved:

1. **F-01 and F-02 resolved** — `version_id` typed as UUID and `content_hash` constrained to 64-character hex in `AcknowledgeRequest`.
2. **F-04 resolved** — `SET search_path = public` added to `publish_legal_version()`.
3. **F-03 decision documented** — Product and legal must explicitly accept client-side-only gate enforcement in `03-approvals.md`, or backend enforcement must be added.

F-05 through F-08 may be addressed in a follow-up sprint.

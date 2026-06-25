# Security Review — Legal T&C Acknowledgment Tracking and Subscriber Activity Log

**Date:** 25Jun2026
**Reviewer:** Security Reviewer
**Branch:** claude/modest-davinci-sxz7lv
**Overall Decision:** PASS

---

## 1. Scope

**Files reviewed:**

- `backend/routes/legal_routes.py`
- `backend/routes/activity_routes.py`
- `backend/routes/admin_routes.py`
- `backend/services/activity_logger.py`
- `backend/services/auth_utils.py`
- `backend/migrations/024_extend_action_types.sql`
- `backend/main.py`
- `frontend/src/components/AdminPanel.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/App.tsx`

---

## 2. Authentication & Authorization

### POST /api/legal/acknowledge

Protected by `Depends(verify_token)`. The `user_id` inserted into `legal_acknowledgments` is taken exclusively from the verified JWT payload via `get_user_id(payload)`. The client-supplied `version_id` and `content_hash` are validated against the server-side canonical record — neither is used as the stored value without server-side verification. The `content_hash` stored in the acknowledgment row comes from `active["content_hash"]` (the DB value), not from the request body.

No IDOR risk: the duplicate check and insert both use `user_id` from the JWT, so a subscriber cannot write an acknowledgment on behalf of another user.

### GET /api/legal/current-version

Protected by `Depends(verify_token)`. Unauthenticated callers receive a 401.

### POST /api/activity/log-action

Protected by `Depends(verify_token)`. The `user_id` and `user_email` are sourced from the verified JWT payload, not from the request body. A subscriber cannot log events attributed to another user.

### GET /admin/users (modified)

Protected by the existing `admin_required` dependency, which chains `verify_token` then `require_admin()`. The new `tc_ack_status` and `tc_ack_at` fields are assembled server-side from `legal_acknowledgments` data; no new parameters are accepted from the caller for this path.

### GET /admin/activity-log (modified)

Protected by `admin_required`. The `action_type` query parameter is validated against the server-side `VALID_ACTION_TYPES` set before being used in a Supabase query builder call — no raw SQL interpolation occurs.

---

## 3. Input Validation & Injection

### Action type whitelisting — defence in depth

The action type whitelist is enforced at three independent layers:

1. `CLIENT_CALLABLE_ACTION_TYPES` frozenset in `activity_routes.py` — rejects unknown types at the API boundary with HTTP 422 before any DB interaction.
2. `ACTION_TYPES` frozenset in `activity_logger.py` — `log_action()` silently drops any type not in the set before executing the insert, covering server-originated calls.
3. Database CHECK constraint `user_action_log_action_type_valid` added by migration 024 — rejects any insert at the DB level even if both application layers were bypassed.

The CLIENT_CALLABLE_ACTION_TYPES set (`{"ai_features_enabled"}`) is a strict subset of ACTION_TYPES, so admin-only event types (`tc_acknowledged`, `paper_trade_placed`, etc.) cannot be written by a subscriber through the public endpoint. This is correct.

### SQL injection

All database access uses the Supabase Python client's parameterised query builder (`.eq()`, `.ilike()`, `.gte()`, `.lte()`). No raw SQL string concatenation with user input was found in the changed files. The migration file contains only DDL with no user-controlled values.

### AcknowledgeRequest body validation

`version_id` is typed as `uuid.UUID` by Pydantic — any non-UUID string will be rejected with HTTP 422 before reaching route logic. `content_hash` is constrained by `Field(pattern=r'^[0-9a-f]{64}$')`, enforcing a 64-character lowercase hex string (SHA-256 format). This prevents arbitrary string injection into the hash comparison.

### user_email filter in /admin/activity-log

The `user_email` filter uses `.ilike("user_email", f"%{user_email}%")` which is a parameterised call through the Supabase client. The `%` wildcards are introduced server-side and are not derived from user input in a way that allows SQL injection. No shell commands are constructed from user input anywhere in the changed files.

---

## 4. Data Exposure

### tc_ack_at in GET /admin/users

The acknowledged timestamp is an admin-only field. Non-admin users cannot reach this endpoint (enforced by `admin_required`). The `legal_acknowledgments` table is queried with the service role and only `user_id` and `acknowledged_at` columns are selected — content of the legal document is not exposed.

### ip_address logging

Client IP is extracted from `X-Forwarded-For` (first entry) with a fallback to `request.client.host`. This is consistent with the existing pattern in `activity_logger.extract_ip()`. The IP is stored in the audit log (expected behaviour for a legal acknowledgment record) and exposed only to admin users via `/admin/activity-log`. No IP data is returned to the acknowledging subscriber.

### detail field in activity log

The `detail` JSONB column is written by the server for `tc_acknowledged` events — values come from the verified active version record, not from client input. For `ai_features_enabled` events written via the subscriber endpoint, the `detail` field accepts a free-form `dict | None`. The backend performs no further validation on the detail dict's contents before inserting it. This is assessed as Low risk because: (a) the event type is restricted by whitelist; (b) the detail field is only displayed to admins; (c) the frontend `renderDetail()` function serialises the dict via `JSON.stringify` and renders it as a plain text string — no `innerHTML` or `dangerouslySetInnerHTML` is used, so XSS via a crafted detail payload is not possible given current rendering.

---

## 5. Idempotency & Replay Attacks

### Duplicate acknowledgment prevention

Before inserting into `legal_acknowledgments`, the route queries for an existing row matching `(user_id, version_id)`. If found, it returns `{"already_acknowledged": true}` immediately without creating a second row and without firing an additional `tc_acknowledged` event (the `asyncio.create_task` is only reached after the successful insert path). The table is expected to have a UNIQUE constraint on `(user_id, version_id)` as noted in the route comment, which provides a database-level guarantee even if the application check were bypassed by concurrent requests.

One nuance: the early-return path on duplicate correctly suppresses the activity log event. An attacker replaying an old `POST /api/legal/acknowledge` cannot flood the `user_action_log` because the route returns before reaching the `create_task` call.

### Version race condition guard

The route validates that the submitted `version_id` matches the currently active version. If the admin publishes a new version between the subscriber loading the modal and submitting it, the request is rejected with HTTP 409 and a descriptive message. This prevents acknowledging an outdated version.

---

## 6. JWT & Auth Invariants

All invariants from CLAUDE.md and the invariant checklist are satisfied:

- `auth.get_user(token)` is used in `verify_token()` in `auth_utils.py` — this was not changed by the feature.
- No references to `python-jose`, `SUPABASE_JWT_SECRET`, or `jose` were found anywhere in the backend.
- `MARKETDATA_API_TOKEN` and `SUPABASE_SERVICE_KEY` are absent from all frontend files.
- The only `VITE_` prefixed secret used in frontend code is `VITE_SUPABASE_ANON_KEY`, which is the Supabase publishable (anon) key — correct and expected.

---

## 7. asyncio.create_task Usage

`asyncio.create_task()` is used in two places:

1. In `legal_routes.py` to fire `log_action()` after a successful acknowledgment insert.
2. In `activity_routes.py` to fire `log_action()` after request validation.

The design is intentionally fire-and-forget, documented in the module docstring of `activity_logger.py` and referencing ADR-0009. The `log_action()` coroutine has a blanket `try/except Exception` that logs failures at WARNING level and never raises. Failures in the activity log write do not affect the primary response path (the acknowledgment row insert is fully committed before the task is scheduled).

The risk is that an unhandled exception inside the task could be silently lost if the event loop is torn down before the task completes (e.g., during a rolling deploy). This is an accepted operational trade-off documented by ADR-0009 and is consistent with how this function is used elsewhere in the codebase. It is assessed as Informational, not a security finding.

---

## 8. Database Migration

Migration 024 is idempotent:

- The first `DO` block uses `DROP CONSTRAINT IF EXISTS` for the old constraint name, wrapped in an `EXCEPTION WHEN undefined_object THEN NULL` handler.
- The second `DO` block uses `DROP CONSTRAINT IF EXISTS` for the new constraint name, providing full re-runnability.
- The final `ADD CONSTRAINT` statement adds a complete replacement constraint with an explicit name.

No RLS policies are dropped, weakened, or altered. No table is dropped or truncated. No data is modified. The migration is purely additive DDL on the constraint.

One observation: the migration relies on a consistent naming convention for the old constraint (`user_action_log_action_type_check` — the Postgres default name). If the constraint was created with a different explicit name in some deployments, the first `DROP IF EXISTS` would silently succeed without removing it, and the subsequent `ADD CONSTRAINT` would fail on the live constraint. This is a deployment robustness issue, not a security issue, and is mitigated by the `IF EXISTS` guard preventing a hard error.

---

## 9. Frontend Security

### renderDetail() in AdminPanel.tsx

The `renderDetail` function serialises the `detail` JSONB object using `JSON.stringify` and concatenates the key=value pairs as a plain string, which is then rendered as React text content. React escapes all text content by default. No `dangerouslySetInnerHTML` is used anywhere in the changed components. XSS via a crafted `detail` payload is not possible with this rendering approach.

### Cross-tab navigation (userActionsInitialEmail)

The email value passed to `handleViewActivity` comes from `u.email` in the `users` state array, which was populated from `GET /admin/users` — an admin-authenticated backend response. This value is used only as a pre-fill for the filter input in `UserActionsTab`, which then issues a new backend request with the email as a query parameter. The backend uses `.ilike()` for the filter, and the email is never rendered as HTML. No injection risk is present.

### logAction call in App.tsx

`logAction('ai_features_enabled', { tab: 'ai' })` is called client-side on first AI tab open. The `action_type` string is hardcoded, not user-controlled. The `detail` object contains a single hardcoded key. The call is guarded by `aiTabLoggedRef.current` to prevent duplicate events per session. Failures are silently swallowed via `.catch(() => {})`, which is consistent with the fire-and-forget pattern.

---

## 10. Findings

### Critical (block release)

None.

### High (block release)

None.

### Medium (fix before next release)

None.

### Low / Informational

| ID | Description | Notes |
|----|-------------|-------|
| L01 | `detail` dict from subscriber is stored without content validation | The subscriber can submit arbitrary key/value pairs in the `detail` field for `ai_features_enabled` events. This data is only visible to admins and is rendered safely as text. Risk is low but consider adding a size limit (e.g. max 1 KB) or schema validation for each callable action type to prevent log bloat from malicious callers. |
| L02 | `asyncio.create_task` exceptions silently absorbed | Any exception raised inside `log_action` after the task is scheduled is caught and logged at WARNING. In high-throughput scenarios or during shutdown, tasks may not complete. Documented in ADR-0009 and consistent with existing usage; no action required for this release. |
| L03 | Migration constraint name assumption | Migration 024 assumes the old CHECK constraint is named `user_action_log_action_type_check` (Postgres default). If the constraint was created with an explicit name in any deployment, the first DROP IF EXISTS silently no-ops and the ADD CONSTRAINT may fail on the existing constraint. Recommend verifying constraint names against all environment schemas before deploying. |
| L04 | `X-Forwarded-For` trusts first IP without proxy allowlist | `extract_ip()` takes the first entry from `X-Forwarded-For` unconditionally. A subscriber could forge this header to log a spoofed IP in the audit record. This is a pre-existing pattern used throughout the codebase and is consistent with Railway's proxy architecture. It does not affect authentication or authorisation. |

---

## 11. Invariant Checklist

| Check | Result | Notes |
|-------|--------|-------|
| All new routes use `require_user()` or `require_admin()` | Pass | `POST /api/legal/acknowledge`, `GET /api/legal/current-version`, `POST /api/activity/log-action` all use `Depends(verify_token)`. Admin endpoints continue to use `admin_required`. |
| No python-jose in codebase | Pass | No references found. |
| No `SUPABASE_JWT_SECRET` in codebase | Pass | No references found. |
| JWT verified via `auth.get_user(token)` | Pass | `verify_token()` in `auth_utils.py` is unchanged and continues to use `sb.auth.get_user(token)`. |
| `MARKETDATA_API_TOKEN` absent from frontend | Pass | Not present in any frontend file. |
| `SUPABASE_SERVICE_KEY` absent from frontend | Pass | Not present in any frontend file. |
| No `VITE_` prefixed secret variables for backend secrets | Pass | Only `VITE_SUPABASE_ANON_KEY` (publishable key) is used in frontend. |
| No raw SQL string concatenation with user input | Pass | All queries use Supabase client parameterised methods. |
| No shell commands constructed from user input | Pass | No shell execution in changed files. |
| IDOR: user data scoped to authenticated user ID | Pass | `user_id` in all writes is derived from the JWT, never from the request body. |
| RLS policies not weakened by migration | Pass | Migration 024 only modifies a CHECK constraint on `action_type`. No RLS policies are touched. |
| Numeric inputs validated before calculations | Pass | No numeric calculations introduced by this feature. |

---

## 12. Gate Decision

**Critical findings:** 0
**High findings:** 0

**PASS** — No critical or high findings. Feature may proceed to deployment.

All four informational findings (L01–L04) are acceptable for release. L01 (unbounded detail dict) is recommended as a follow-up hardening item but does not represent an exploitable vulnerability in the current context given admin-only visibility and safe rendering.

---

## 13. Remediation Tracking

| Finding ID | Fixed in commit | Verified by | Date |
|------------|-----------------|-------------|------|
| L01 | — | — | Recommended follow-up |
| L02 | N/A (accepted) | — | — |
| L03 | — | — | Verify pre-deploy |
| L04 | N/A (pre-existing) | — | — |

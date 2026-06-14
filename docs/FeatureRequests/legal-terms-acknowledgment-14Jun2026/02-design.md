# Technical Design — Legal Terms Acknowledgment Gate

**Date:** 14Jun2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

This feature introduces a mandatory Risk Disclosure & Indemnification Agreement gate that every subscriber must pass before reaching the OptionsDesk dashboard. A new `legal_document_versions` table stores each published version of the agreement; a companion `legal_acknowledgments` table records every subscriber acknowledgment as an immutable, append-only audit trail. Immutability is enforced at the database layer via a BEFORE UPDATE OR DELETE trigger, rather than through RLS alone, because the service role bypasses RLS. The active version is cached in-process for 60 seconds on the backend to avoid a database round-trip on every login. For new subscribers the gate is inserted as a step inside `OnboardingFlow.tsx` immediately after plan selection; for existing subscribers a blocking re-acknowledgment modal is shown on next login when a new version has been published. The admin portal gains a new `LegalVersionManager` section accessible to all staff roles for read operations, and restricted to the Owner role for publishing.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/migrations/012_legal_acknowledgments.sql` | New | Full schema: two new tables, indexes, RLS, immutability trigger |
| `backend/routes/legal_routes.py` | New | Subscriber-facing legal endpoints |
| `backend/routes/platform_routes.py` | Modified | Add admin legal endpoints under `/api/platform/legal/` |
| `backend/routes/auth_routes.py` | Modified | Add `pending_legal_acknowledgment` field to login response |
| `backend/services/legal_service.py` | New | Shared logic: active-version cache, pending-check, hash validation |
| `backend/main.py` | Modified | Register the new `legal_router` |
| `frontend/src/api/client.ts` | Modified | New typed API calls for legal endpoints |
| `frontend/src/context/AuthContext.tsx` | Modified | Extend `LoginResponse` with `pending_legal_acknowledgment`; expose flag through context |
| `frontend/src/components/OnboardingFlow.tsx` | Modified | Add `legal_acknowledgment` step to `Step` type and step indicator; render `LegalAcknowledgmentStep` |
| `frontend/src/components/LegalAcknowledgmentStep.tsx` | New | Shared scroll-and-checkbox acknowledgment UI used by both onboarding and the re-acknowledgment modal |
| `frontend/src/components/LegalReacknowledgmentModal.tsx` | New | Full-screen blocking modal for existing subscribers |
| `frontend/src/components/admin/LegalVersionManager.tsx` | New | Admin portal Legal section: version list, publish form, subscriber history, pending count |
| `frontend/src/App.tsx` | Modified | Render `LegalReacknowledgmentModal` when `pending_legal_acknowledgment` is true and subscriber is post-onboarding |

---

## 3. Database Schema Changes

### Migration: `012_legal_acknowledgments.sql`

```sql
-- ============================================================
-- Migration 012 — Legal Terms Acknowledgment Gate
-- ============================================================

-- ── 1. legal_document_versions ──────────────────────────────

CREATE TABLE legal_document_versions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number   text        NOT NULL UNIQUE,          -- e.g. "1.0", "1.1"
    display_name     text        NOT NULL,                 -- e.g. "Risk Disclosure & Indemnification Agreement v1.0"
    effective_date   date        NOT NULL,
    published_at     timestamptz NOT NULL DEFAULT now(),
    published_by     uuid        NOT NULL REFERENCES auth.users(id),
    full_text        text        NOT NULL,
    text_hash        text        NOT NULL,                 -- SHA-256 hex of full_text
    is_active        boolean     NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Only one row may be active at a time.
-- This partial unique index guarantees uniqueness of the true value.
CREATE UNIQUE INDEX legal_document_versions_one_active
    ON legal_document_versions (is_active)
    WHERE is_active = true;

-- Fast lookup of the current active version (used on every login)
CREATE INDEX legal_document_versions_active_idx
    ON legal_document_versions (is_active)
    WHERE is_active = true;

-- ── 2. Immutability trigger on legal_document_versions ──────
-- Protects all columns except is_active from modification after insert.
-- This enforces the spec requirement (FR 3.1.3) that version text and
-- metadata are never changed. See ADR-0007 for rationale.

CREATE OR REPLACE FUNCTION trg_legal_document_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'legal_document_versions rows are immutable and cannot be deleted.';
    END IF;
    -- UPDATE path: allow only is_active to change; everything else is frozen.
    IF NEW.version_number  IS DISTINCT FROM OLD.version_number  THEN
        RAISE EXCEPTION 'legal_document_versions.version_number is immutable after insert.';
    END IF;
    IF NEW.display_name    IS DISTINCT FROM OLD.display_name    THEN
        RAISE EXCEPTION 'legal_document_versions.display_name is immutable after insert.';
    END IF;
    IF NEW.effective_date  IS DISTINCT FROM OLD.effective_date  THEN
        RAISE EXCEPTION 'legal_document_versions.effective_date is immutable after insert.';
    END IF;
    IF NEW.published_at    IS DISTINCT FROM OLD.published_at    THEN
        RAISE EXCEPTION 'legal_document_versions.published_at is immutable after insert.';
    END IF;
    IF NEW.published_by    IS DISTINCT FROM OLD.published_by    THEN
        RAISE EXCEPTION 'legal_document_versions.published_by is immutable after insert.';
    END IF;
    IF NEW.full_text       IS DISTINCT FROM OLD.full_text       THEN
        RAISE EXCEPTION 'legal_document_versions.full_text is immutable after insert.';
    END IF;
    IF NEW.text_hash       IS DISTINCT FROM OLD.text_hash       THEN
        RAISE EXCEPTION 'legal_document_versions.text_hash is immutable after insert.';
    END IF;
    IF NEW.created_at      IS DISTINCT FROM OLD.created_at      THEN
        RAISE EXCEPTION 'legal_document_versions.created_at is immutable after insert.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legal_document_versions_immutable
BEFORE UPDATE OR DELETE ON legal_document_versions
FOR EACH ROW EXECUTE FUNCTION trg_legal_document_versions_immutable();

-- ── 3. legal_acknowledgments ────────────────────────────────

CREATE TABLE legal_acknowledgments (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid        NOT NULL REFERENCES auth.users(id),
    version_number       text        NOT NULL,       -- denormalised; snapshot at time of acknowledgment
    document_text_hash   text        NOT NULL,       -- denormalised SHA-256; snapshot at time of acknowledgment
    acknowledged_at      timestamptz NOT NULL DEFAULT now(),
    ip_address           text,                       -- nullable; null when x-forwarded-for unavailable
    user_agent           text,                       -- nullable
    created_at           timestamptz NOT NULL DEFAULT now()
);

-- Primary access pattern: most recent acknowledgment per user
CREATE INDEX legal_acknowledgments_user_recent_idx
    ON legal_acknowledgments (user_id, acknowledged_at DESC);

-- Support/owner query: lookup all records for a specific version
CREATE INDEX legal_acknowledgments_version_idx
    ON legal_acknowledgments (version_number);

-- ── 4. Immutability trigger on legal_acknowledgments ────────
-- No UPDATE or DELETE is ever permitted. See ADR-0007.

CREATE OR REPLACE FUNCTION trg_legal_acknowledgments_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'legal_acknowledgments rows are immutable and cannot be deleted.';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'legal_acknowledgments rows are immutable and cannot be updated.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legal_acknowledgments_immutable
BEFORE UPDATE OR DELETE ON legal_acknowledgments
FOR EACH ROW EXECUTE FUNCTION trg_legal_acknowledgments_immutable();

-- ── 5. RLS policies ─────────────────────────────────────────
-- The service role bypasses RLS entirely.
-- These policies guard direct Supabase REST API access by non-service-role clients
-- (e.g., a subscriber with an anon key attempting to delete their own record).

ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_acknowledgments   ENABLE ROW LEVEL SECURITY;

-- legal_document_versions: authenticated users may read; no client-side writes.
CREATE POLICY ldv_select ON legal_document_versions
    FOR SELECT TO authenticated USING (true);
-- No INSERT, UPDATE, or DELETE policies are defined for non-service-role clients.
-- All writes go through the FastAPI backend using the service role.

-- legal_acknowledgments: users may read only their own rows.
CREATE POLICY la_select_own ON legal_acknowledgments
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- No UPDATE or DELETE policies are defined.
-- INSERT is only performed by the backend service role.

-- ── 6. Seed: initial version placeholder ────────────────────
-- An explicit seed is NOT included here. The Owner publishes the first
-- version through the admin portal UI after deployment.
-- The backend login path handles the case where no active version exists
-- by returning pending_legal_acknowledgment: false (no gate without a published version).
```

**Tables affected:**

| Table | Change |
|-------|--------|
| `legal_document_versions` | New — stores published agreement versions |
| `legal_acknowledgments` | New — append-only subscriber acknowledgment log |
| `user_profiles` | No new column; `onboarding_step` gains a new valid value `'legal_acknowledgment'` (existing text column, no DDL change) |

**RLS policies added:**

| Table | Policy | Effect |
|-------|--------|--------|
| `legal_document_versions` | `ldv_select` (SELECT, authenticated) | Subscribers can read published versions |
| `legal_acknowledgments` | `la_select_own` (SELECT, authenticated, uid check) | Subscribers can only read their own acknowledgment records |

Immutability is enforced by BEFORE triggers, not RLS, because the service role bypasses RLS. See ADR-0007.

---

## 4. API Contracts

### `GET /api/legal/current-version`

**Auth required:** Yes — valid subscriber JWT (`verify_token`)

**Description:** Returns the current active version of the agreement. Response is served from a 60-second in-process cache (see Section 5). If no version has ever been published, returns 404.

**Response (200):**
```json
{
  "id": "uuid",
  "version_number": "1.0",
  "display_name": "Risk Disclosure & Indemnification Agreement v1.0",
  "effective_date": "2026-06-14",
  "full_text": "...",
  "text_hash": "sha256hex",
  "published_at": "2026-06-14T10:00:00Z"
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | No valid JWT |
| 404 | No active version has been published yet |
| 500 | Database error |

The admin email (`leonardsim.sm@gmail.com`) may call this endpoint; it is not blocked for the admin, but the admin bypass in the login response means the frontend will not show the gate for the admin.

---

### `POST /api/legal/acknowledge`

**Auth required:** Yes — valid subscriber JWT (`verify_token`)

**Description:** Records one acknowledgment row. The backend resolves the currently active version, compares `version_id` from the request body against the active row's `id`, and rejects with 409 if the version has changed since the frontend loaded the form (race condition guard). The authenticated user's ID from the JWT is always used; any `user_id` in the request body is ignored (AC7.1).

**Request body:**
```json
{
  "version_id": "uuid of the version being acknowledged"
}
```

The `version_id` (not `version_number`) is used as the atomic race-condition key because it is an opaque UUID that changes on every new publish, making accidental version mismatches impossible to miss.

**Response (200):**
```json
{
  "ok": true,
  "version_number": "1.0"
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | No valid JWT |
| 409 | `version_id` does not match the current active version's `id` — version was superseded between page load and submission; frontend must prompt subscriber to reload |
| 422 | Missing or malformed `version_id` |
| 500 | Database write failure |

**Implementation notes:**
- `user_id` is taken exclusively from `get_user_id(payload)` — the JWT subject — never from the request body.
- `document_text_hash` written to `legal_acknowledgments` comes from the `legal_document_versions` row fetched server-side, not from the client.
- `ip_address` is extracted from the `X-Forwarded-For` header (first value) or `request.client.host`; stored as null if neither is available.
- `user_agent` is taken from the `User-Agent` request header.
- The `acknowledged_at` timestamp is set server-side to `now()` (UTC); the client does not supply it.
- Duplicate acknowledgments (same user, same version) are accepted and both rows are retained.

---

### `POST /api/auth/login` — response extension

The existing login response shape gains one new field:

```json
{
  "ok": true,
  "role": "user",
  "email": "subscriber@example.com",
  "onboarding_completed": true,
  "onboarding_step": "complete",
  "is_deactivated": false,
  "pending_legal_acknowledgment": false
}
```

**`pending_legal_acknowledgment` logic:**
1. If `email == ADMIN_EMAIL`: always `false`.
2. If no active version exists in `legal_document_versions`: `false` (gate cannot be shown without a published version).
3. Otherwise: query `legal_acknowledgments` for the most recent row where `user_id = <authenticated user>`. If no row exists, or if the row's `version_number` differs from the current active version's `version_number`, return `true`; else `false`.

This derivation uses the cached active version (Section 5); the subscriber lookup is a single indexed query on `(user_id, acknowledged_at DESC) LIMIT 1`.

---

### `GET /api/platform/legal/versions`

**Auth required:** Yes — platform staff JWT (`require_staff()` — any active staff role)

**Description:** Returns all published versions in descending `published_at` order.

**Response (200):**
```json
{
  "versions": [
    {
      "id": "uuid",
      "version_number": "1.1",
      "display_name": "Risk Disclosure & Indemnification Agreement v1.1",
      "effective_date": "2026-07-01",
      "published_at": "2026-06-30T09:00:00Z",
      "published_by": "uuid",
      "text_hash": "sha256hex",
      "is_active": true
    }
  ]
}
```

`full_text` is intentionally omitted from the list response to keep payload size manageable. A future detail endpoint can be added if needed; for the MVP, the publish form and preview are write-only.

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | No valid JWT |
| 403 | Not platform staff |

---

### `POST /api/platform/legal/versions`

**Auth required:** Yes — `require_staff(["owner"])`

**Description:** Publishes a new version. Atomically: (a) inserts the new version row with `is_active = true`, (b) sets the previously active row to `is_active = false` (the partial unique index on `is_active = true` plus transaction ordering makes this safe), (c) writes a `platform_audit_log` entry, (d) invalidates the active-version cache.

**Request body:**
```json
{
  "version_number": "1.1",
  "display_name": "Risk Disclosure & Indemnification Agreement v1.1",
  "effective_date": "2026-07-01",
  "full_text": "Full agreement text..."
}
```

**Validations before insert:**
- `full_text` must not be empty or whitespace-only; reject 422 if so.
- `version_number` must not already exist in `legal_document_versions`; reject 409 if so.
- `effective_date` must be parseable as ISO date; reject 422 if malformed.

**Response (200):**
```json
{
  "ok": true,
  "id": "uuid of the new version",
  "version_number": "1.1",
  "text_hash": "sha256hex computed server-side"
}
```

**Atomic publish sequence (within a single service-role transaction):**
1. Compute `text_hash = hashlib.sha256(full_text.encode()).hexdigest()`.
2. Fetch the current active version ID (for audit log `previous_active_version`).
3. Update current active version: `UPDATE legal_document_versions SET is_active = false WHERE is_active = true`.
4. Insert new version row with `is_active = true`, `published_by = authenticated staff user_id`.
5. Insert `platform_audit_log` row with `action_type = 'legal_version_publish'`, `payload = {version_number, effective_date, text_hash, previous_active_version}`.
6. Call `invalidate_legal_version_cache()` on `legal_service.py`.

Note: Supabase Python client does not expose explicit BEGIN/COMMIT. Steps 3 and 4 are sequenced so that if step 4 raises a unique-constraint violation (duplicate version_number), step 3 will not have been committed. This is safe because the supabase-py client executes each `.execute()` as an independent HTTP round-trip to PostgREST. To make steps 3 and 4 truly atomic, implement them as a single Postgres function call via `sb.rpc("publish_legal_version", {...})` that wraps both UPDATE and INSERT in one transaction. This is the correct approach and is specified in the implementation notes for the backend developer.

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | No valid JWT |
| 403 | Not Owner role |
| 409 | `version_number` already exists |
| 422 | Empty `full_text`, missing required field, or unparseable date |
| 500 | Database error |

**Postgres RPC function required (part of migration 012):**
```sql
CREATE OR REPLACE FUNCTION publish_legal_version(
    p_version_number text,
    p_display_name   text,
    p_effective_date date,
    p_full_text      text,
    p_text_hash      text,
    p_published_by   uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prev_active_id uuid;
    v_new_id         uuid;
BEGIN
    -- Capture previous active version for audit
    SELECT id INTO v_prev_active_id
      FROM legal_document_versions
     WHERE is_active = true
     LIMIT 1;

    -- Deactivate current active version (if any)
    UPDATE legal_document_versions
       SET is_active = false
     WHERE is_active = true;

    -- Insert new active version
    INSERT INTO legal_document_versions
        (version_number, display_name, effective_date, published_at, published_by, full_text, text_hash, is_active)
    VALUES
        (p_version_number, p_display_name, p_effective_date, now(), p_published_by, p_full_text, p_text_hash, true)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;
```

The FastAPI route calls this RPC, then separately writes the audit log row (best-effort, as is the existing `_audit()` pattern in `platform_routes.py`).

---

### `GET /api/platform/legal/subscribers/{user_id}/history`

**Auth required:** Yes — `require_staff(["owner", "support", "finance"])`

**Description:** Returns paginated acknowledgment history for a single subscriber.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number (1-based) |
| `page_size` | int | 50 | Records per page (max 200) |

**Response (200):**
```json
{
  "user_id": "uuid",
  "total": 3,
  "page": 1,
  "page_size": 50,
  "history": [
    {
      "id": "uuid",
      "version_number": "1.1",
      "document_text_hash": "sha256hex",
      "acknowledged_at": "2026-07-01T08:42:11Z",
      "ip_address": "203.0.113.5",
      "user_agent": "Mozilla/5.0 ..."
    }
  ]
}
```

Results are ordered by `acknowledged_at DESC`. If the subscriber has no records, `history` is an empty array and `total` is 0 (not an error).

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | No valid JWT |
| 403 | Not staff or insufficient role |
| 404 | `user_id` not found in `user_profiles` |

---

### `GET /api/platform/legal/pending-count`

**Auth required:** Yes — `require_staff()` (any active staff role)

**Description:** Returns the count of subscribers whose most recent acknowledgment version does not match the current active version, plus subscribers who have no acknowledgment record at all. This is a derived metric; no stored column tracks pending status.

**Implementation:** The query uses a correlated subquery or CTE:
1. Fetch `current_version_number` from the active-version cache.
2. Count `user_profiles` rows that either have no row in `legal_acknowledgments` for their `id`, or whose most recent `version_number` in `legal_acknowledgments` differs from `current_version_number`. Excludes the admin email row and deactivated accounts.

Because this can be a moderately expensive query on large subscriber sets, it is not cached — it is called only on admin portal load of the Legal section landing page, not on the hot login path.

**Response (200):**
```json
{
  "pending_count": 42,
  "current_version_number": "1.1"
}
```

**Response when no version published (200):**
```json
{
  "pending_count": 0,
  "current_version_number": null
}
```

---

## 5. Caching Strategy

| Data | Cache location | Cache key | TTL | Invalidation trigger |
|------|---------------|-----------|-----|----------------------|
| Current active legal version (full row) | In-process module-level dict in `legal_service.py` | `"active_legal_version"` (single entry) | 60 seconds | `POST /api/platform/legal/versions` calls `invalidate_legal_version_cache()` immediately after successful publish |
| Subscriber's latest acknowledgment version | Not cached | — | — | Queried live on each login; single indexed query on `(user_id, acknowledged_at DESC) LIMIT 1` |

**Why 60 seconds:** The active version changes at most a few times per year (Owner publishes a new version). The 60-second TTL means at most a 60-second window where a subscriber would see a pending_legal_acknowledgment: false immediately after a new version is published — an acceptable inconsistency since the gate fires on next page load. The cache is invalidated synchronously on publish, so in practice the staleness window is zero for all requests processed after the publish RPC call completes.

**Why no external cache (Redis):** Consistent with the existing project pattern (ADR-0006). The backend runs as a single Railway instance; an in-process dict is sufficient.

**Fallback if database is unavailable during login:** If the `legal_acknowledgments` lookup fails (DB error), the login response returns `pending_legal_acknowledgment: false` (fail-open). The subscriber reaches the dashboard but will be gated again on their next login once the DB recovers. This matches the existing `_is_deactivated()` fail-open pattern in `auth_utils.py`.

---

## 6. External Dependency Fallback Chain

This feature has no external dependencies beyond Supabase Postgres. There is no market data call, no Claude API call, and no Stripe call.

| Data | Primary | Fallback | Behaviour if primary fails |
|------|---------|----------|---------------------------|
| Active legal version (login path) | In-process cache | Database query | If cache miss and DB error: `pending_legal_acknowledgment: false` (fail-open) |
| Active legal version (acknowledgment path) | In-process cache | Database query | If cache miss and DB error: HTTP 500 returned to subscriber; acknowledgment is not written |
| Acknowledgment insert | Supabase Postgres (service role) | None | HTTP 500 returned; frontend shows retry error; subscriber cannot advance |

---

## 7. Frontend State Management

### New `Step` type in `OnboardingFlow.tsx`

The `Step` type is extended: `'plan_selection' | 'legal_acknowledgment' | 'payment' | 'complete'`

The step ordering for the onboarding progress indicator changes to: `plan_selection → legal_acknowledgment → payment → complete` for paid tiers, and `plan_selection → legal_acknowledgment → complete` for free tier.

**New sequencing logic in `handleTierSelect`:**
- When a tier is selected (free or paid), instead of immediately advancing to `'complete'` or redirecting to Stripe, the handler sets `step = 'legal_acknowledgment'`.
- `onboarding_step` is persisted to the backend at this point by calling `PATCH /api/auth/onboarding-step` (an existing or new simple endpoint that updates `user_profiles.onboarding_step`). If this endpoint does not yet exist, it is added as part of this feature to `auth_routes.py`: `PATCH /api/auth/onboarding-step` with body `{step: 'legal_acknowledgment'}`, auth required.
- After successful acknowledgment, `LegalAcknowledgmentStep` calls back with the selected tier so `OnboardingFlow` can then proceed: free tier → `'complete'`; paid tier → Stripe redirect.
- On page refresh while `onboarding_step = 'legal_acknowledgment'`, the `initialStep` prop passed from `App.tsx` is `'legal_acknowledgment'` and the subscriber resumes at the legal step.

**`onboarding_step` persistence:** The `initialStep` prop already comes from `profile.onboarding_step` in `App.tsx`. The new value `'legal_acknowledgment'` is handled as another valid step alongside `'plan_selection'`, `'payment'`, and `'complete'`.

### Component responsibilities

| Component | State owned | Props received | Loading state | Error state | Empty state |
|-----------|-------------|----------------|---------------|-------------|-------------|
| `LegalAcknowledgmentStep` | `hasScrolledToBottom: bool`, `checkboxChecked: bool`, `submitting: bool`, `error: string \| null` | `version` (full version object), `onAcknowledged: () => void`, `selectedTier?: string` | Spinner on submit button during POST | Inline error message; button remains enabled for retry | N/A |
| `OnboardingFlow` | `step: Step`, `selectedTier: string \| null` | `initialStep`, `onComplete` | Inherits from child components | Inherits from child components | N/A |
| `LegalReacknowledgmentModal` | `version: LegalVersion \| null`, `loading: bool`, `hasScrolledToBottom: bool`, `checkboxChecked: bool`, `submitting: bool`, `error: string \| null` | `onAcknowledged: () => void` | Skeleton/spinner while fetching version from `GET /api/legal/current-version` | Error state with "Unable to load agreement — please refresh" and no bypass option | N/A — no version means modal is not shown |
| `App.tsx` | reads `profile.pending_legal_acknowledgment` from `AuthContext` | — | — | — | — |
| `LegalVersionManager` | `versions: LegalVersion[]`, `publishFormOpen: bool`, `selectedSubscriberId: string \| null`, `history: AcknowledgmentRow[]`, `pendingCount: number` | `staffRole` from `AuthContext` | Spinner per section | Inline error per section | Empty list message |

### Scroll-to-bottom detection

`LegalAcknowledgmentStep` renders the agreement text inside a fixed-height `<div>` with `overflow-y: scroll`. A `scroll` event listener sets `hasScrolledToBottom = true` when `scrollTop + clientHeight >= scrollHeight - 10` (10px threshold for subpixel rendering). Once `hasScrolledToBottom` is true, the checkbox `disabled` attribute is removed. The checkbox's `checked` state controls the button's `disabled` attribute. Both `disabled` attributes are set declaratively (not only via CSS), satisfying AC2.3.

### Re-acknowledgment modal gate

In `App.tsx`, the render logic after `AuthContext` resolves is:
1. If `loading`: show loading spinner.
2. If no `session`: show `LoginPage`.
3. If `profile.is_deactivated`: handled by `AuthContext` (signs out and alerts).
4. If `!profile.onboarding_completed`: show `OnboardingFlow`.
5. **New:** If `profile.pending_legal_acknowledgment` and `user.email !== ADMIN_EMAIL`: show `LegalReacknowledgmentModal` full-screen (before rendering any tabs or nav).
6. Else: render the dashboard.

The modal uses `position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999` with no `onClose` handler, no keyboard escape handler, and no background click dismiss. This satisfies AC3.3.

After the user acknowledges, the modal calls its `onAcknowledged` prop. `App.tsx` handles this by setting a local `legalAcknowledged` state flag to `true` (no full page reload required) so the dashboard renders without waiting for a new login call.

### Hash preview in admin publish form

The `LegalVersionManager` publish form computes the SHA-256 hash of the `full_text` textarea content client-side using the Web Crypto API (`crypto.subtle.digest('SHA-256', encoder.encode(text))`) and displays it as a read-only field beneath the textarea. This allows the Owner to record the hash independently before submitting (AC5.7). The server independently computes the hash server-side (`hashlib.sha256`) and stores that value — the client-supplied hash in the form preview is for informational display only and is not sent in the request body.

---

## 8. Subscription Tier Enforcement

The acknowledgment gate is not a tier feature. It applies equally to all tiers (free, starter, pro, enterprise). There are no tier limits to enforce on these endpoints. The only bypass is for `ADMIN_EMAIL` (`leonardsim.sm@gmail.com`), which is enforced in two places:

1. **Backend login response:** The `pending_legal_acknowledgment` field is always `false` for the admin email.
2. **Frontend gate:** `App.tsx` checks `user.email !== ADMIN_EMAIL` before showing the modal (defence in depth; the backend value is the authoritative gate).

Platform staff who are not subscribers are not subject to the gate; they log in to the admin portal, not the subscriber app.

---

## 9. Onboarding Sequencing — Exact Insertion Point

**Free-tier new subscriber (no Stripe):**

```
plan_selection
  → user selects 'free'
  → [NEW] onboarding_step set to 'legal_acknowledgment' in DB
  → [NEW] LegalAcknowledgmentStep renders
  → user acknowledges → POST /api/legal/acknowledge (200)
  → step advances to 'complete'
  → user clicks "Go to dashboard" → onboarding_completed = true
```

**Paid-tier new subscriber (Stripe redirect):**

```
plan_selection
  → user selects 'starter'/'pro'/'enterprise'
  → [NEW] onboarding_step set to 'legal_acknowledgment' in DB
  → [NEW] LegalAcknowledgmentStep renders (tier stored in component state)
  → user acknowledges → POST /api/legal/acknowledge (200)
  → PricingPage.createCheckoutSession() called with selectedTier
  → browser redirects to Stripe Checkout
  → on return to /onboarding/complete
  → existing useEffect in OnboardingFlow sets step = 'complete'
  → user clicks "Go to dashboard" → onboarding_completed = true
```

**Existing subscriber re-acknowledgment:**

```
POST /api/auth/login → { pending_legal_acknowledgment: true }
  → App.tsx renders LegalReacknowledgmentModal (full-screen blocking)
  → GET /api/legal/current-version fetches and displays agreement
  → user scrolls to bottom, checks checkbox, clicks "I Agree"
  → POST /api/legal/acknowledge (200)
  → modal dismisses, dashboard renders
```

---

## 10. New Routes — Registration

A new `legal_routes.py` file registers a router with the prefix `/api/legal`. It is included in `main.py`:

```python
from routes.legal_routes import router as legal_router
app.include_router(legal_router, prefix="/api")
```

The admin legal endpoints are added directly to `platform_routes.py` under the path `/platform/legal/` to keep all staff-facing routes in one module, consistent with the existing pattern.

---

## 9. New Environment Variables

No new environment variables are required for this feature. All data is stored in Supabase Postgres, accessed via the existing `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

---

## 10. ADR References

- `docs/adr/0007-legal-acknowledgment-immutability.md` — explains why immutability is enforced by a Postgres trigger rather than RLS alone, and why acknowledgment records use denormalised hash snapshots rather than a foreign key to the version table.

---

## 11. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

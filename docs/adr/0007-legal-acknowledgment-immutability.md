# ADR 0007 — Legal Acknowledgment Immutability: Trigger vs RLS, and Denormalised Hash Snapshots

**Date:** 14 Jun 2026
**Status:** Accepted
**Feature:** Legal Terms Acknowledgment Gate

---

## Context

The Legal Terms Acknowledgment Gate must produce acknowledgment records that are credible evidence in a legal dispute. Two specific design decisions arose during architecture that have non-obvious rationale and would likely be re-litigated by future maintainers without a recorded decision:

1. **How to enforce immutability on `legal_acknowledgments` and the immutable columns of `legal_document_versions` when the backend uses the Supabase service role.**

2. **Whether to store the document text hash directly in `legal_acknowledgments` (denormalised) or derive it via a foreign key join to `legal_document_versions` at query time.**

---

## Decision 1 — Immutability via Postgres Trigger, Not RLS

### Options considered

**Option A — RLS policies that deny UPDATE and DELETE.**
Define RLS policies on `legal_acknowledgments` and `legal_document_versions` that allow only INSERT and SELECT, blocking any UPDATE or DELETE.

**Option B — No RLS; application-layer enforcement only.**
Trust that the FastAPI backend never exposes UPDATE or DELETE endpoints for these tables.

**Option C — Postgres BEFORE UPDATE OR DELETE trigger that raises an exception.**
A trigger-level guard that fires before any UPDATE or DELETE, regardless of the caller's identity.

### Decision

**Option C — Postgres trigger.** RLS policies (Option A) are defined as a secondary layer for non-service-role callers, but the primary immutability mechanism is the trigger.

### Rationale

Supabase's service role key bypasses all RLS policies unconditionally. This is a documented and intended behaviour of Supabase: service role = superuser for RLS purposes. Since every backend write uses the service role (this is the established pattern throughout the codebase), RLS alone provides zero protection against an accidental `UPDATE` or `DELETE` issued by backend code.

A BEFORE trigger fires at the Postgres engine level before the statement executes, regardless of the caller's role, the connection's RLS bypass status, or whether the call comes from a PostgREST request, a `psql` session, or a service-role API call. It is the only mechanism that is unconditionally enforced within Postgres itself.

The trigger raises a named exception (`RAISE EXCEPTION`) that propagates as an error to the caller. This means:
- An accidental backend bug that attempts an UPDATE returns a 500 with a clear exception message, not silent success.
- A database administrator running `psql` directly also cannot delete records without first dropping the trigger — an intentional friction that requires a deliberate, auditable act.
- The exception message identifies the specific column that was mutated (for `legal_document_versions`), which aids debugging when future migrations legitimately need to extend these tables.

For `legal_document_versions`, the spec allows one column (`is_active`) to change — when a new version is published, the previously active row's `is_active` is set to false. The trigger therefore permits changes to `is_active` only, and blocks any change to all other columns. This is implemented by comparing `NEW.column IS DISTINCT FROM OLD.column` for each protected column and raising an exception selectively.

### Consequences

- `backend/migrations/012_legal_acknowledgments.sql` defines `trg_legal_acknowledgments_immutable` (blocks all UPDATE and DELETE) and `trg_legal_document_versions_immutable` (blocks DELETE and blocks UPDATE of all columns except `is_active`).
- RLS policies are defined in addition to the triggers, providing a secondary guard for non-service-role callers (e.g., a subscriber with the anon key attempting to delete their own record via the Supabase REST API).
- Future migrations that need to add columns to these tables do not require trigger modification; only changes to existing column values are blocked.
- Any future requirement to delete or update acknowledgment records for legitimate legal reasons (e.g., a data-subject deletion request) must be handled by a database administrator who explicitly drops or disables the trigger, creating an auditable trail of the override.

### Rejected alternatives

**Option A (RLS only):** Rejected because the service role bypasses RLS, which is the only execution context the backend ever uses. RLS provides no protection for service-role writes.

**Option B (application layer only):** Rejected. Application-layer enforcement is insufficient for records intended as legal evidence. A bug, a future developer adding a convenience endpoint, or a direct database connection all bypass application-layer controls. The trigger is the authoritative enforcement mechanism.

---

## Decision 2 — Denormalised Hash Snapshot in `legal_acknowledgments`

### Options considered

**Option A — Store `document_text_hash` directly in `legal_acknowledgments` at write time.**
Each acknowledgment row captures the hash of the document text as it existed at the moment of acknowledgment. The version number is also stored directly.

**Option B — Store only a foreign key (`version_id`) referencing `legal_document_versions`.**
The hash is retrieved by joining to `legal_document_versions` when needed.

### Decision

**Option A — Denormalised hash snapshot.** Both `version_number` and `document_text_hash` are stored directly in `legal_acknowledgments`.

### Rationale

An acknowledgment record is an evidence document. Its purpose is to prove that a specific subscriber agreed to a specific text at a specific time. A foreign key reference (`version_id`) achieves this only if the referenced row is guaranteed immutable — which it is (Decision 1 ensures `full_text` and `text_hash` cannot change on a `legal_document_versions` row). So the foreign key approach is technically sound.

However, denormalisation provides a stronger independence guarantee: the acknowledgment record carries all the information needed to verify the acknowledgment without requiring a second table to exist, be accessible, or have consistent content. If `legal_document_versions` were ever accidentally truncated (which the trigger prevents but does not make physically impossible for a superuser), or if a future architectural change moved document versions to a different store, the acknowledgment record would remain independently verifiable by comparing its stored `document_text_hash` against the hash of the agreement text obtained from any source (a backup, a PDF, an email). This "self-contained evidence" property is preferable for legal records.

The data redundancy cost is negligible: `version_number` is a short text string (e.g., "1.0") and `document_text_hash` is a 64-character hex string. With thousands of acknowledgment rows, the additional storage is inconsequential.

`version_number` is also denormalised (rather than only `version_id`) to make the history view readable without a join and to allow matching against the active version's `version_number` in the `pending_legal_acknowledgment` login check without an additional join.

### Consequences

- `legal_acknowledgments` has no FK to `legal_document_versions`. It is entirely self-contained.
- `version_number` in `legal_acknowledgments` must match the `version_number` in `legal_document_versions` at the time of write; the backend enforces this by reading the active version row server-side and using its `version_number` and `text_hash` values rather than accepting them from the client.
- The `pending_legal_acknowledgment` check is a simple string comparison: `latest_acknowledgment.version_number != active_version.version_number`, with no join required.
- Audit queries can be run against `legal_acknowledgments` alone without joining to `legal_document_versions`.

### Rejected alternatives

**Option B (FK only):** Rejected as providing a weaker independence guarantee for legal records, even though the underlying immutability trigger makes it functionally safe.

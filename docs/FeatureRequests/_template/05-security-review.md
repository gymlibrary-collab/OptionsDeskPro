# Security Review — [Feature Name]

**Date:** [ddMMMyyyy]
**Reviewer:** Security Reviewer
**Overall Decision:** PASS | CONDITIONAL PASS | FAIL

---

## 1. Scope

**Files reviewed:**

- `backend/routes/`
- `backend/services/`
- `backend/migrations/`
- `frontend/src/components/`
- `frontend/src/api/client.ts`

---

## 2. Findings

### Critical (block release)

| ID | File | Line | Description | Recommendation |
|----|------|------|-------------|----------------|
| C01 | | | | |

### High (block release)

| ID | File | Line | Description | Recommendation |
|----|------|------|-------------|----------------|
| H01 | | | | |

### Medium (fix before next release)

| ID | File | Line | Description | Recommendation |
|----|------|------|-------------|----------------|
| M01 | | | | |

### Low / Informational

| ID | Description | Notes |
|----|-------------|-------|
| L01 | | |

---

## 3. Invariant Checklist

| Check | Result | Notes |
|-------|--------|-------|
| All new routes use `require_user()` or `require_admin()` | ☐ Pass ☐ Fail | |
| No python-jose in codebase | ☐ Pass ☐ Fail | |
| No `SUPABASE_JWT_SECRET` in codebase | ☐ Pass ☐ Fail | |
| JWT verified via `auth.get_user(token)` | ☐ Pass ☐ Fail | |
| `MARKETDATA_API_TOKEN` absent from frontend | ☐ Pass ☐ Fail | |
| `SUPABASE_SERVICE_KEY` absent from frontend | ☐ Pass ☐ Fail | |
| No `VITE_` prefixed secret variables for backend secrets | ☐ Pass ☐ Fail | |
| No raw SQL string concatenation with user input | ☐ Pass ☐ Fail | |
| No shell commands constructed from user input | ☐ Pass ☐ Fail | |
| IDOR: user data scoped to authenticated user ID | ☐ Pass ☐ Fail | |
| RLS policies not weakened by migration | ☐ Pass ☐ Fail | |
| Numeric inputs validated before calculations | ☐ Pass ☐ Fail | |

---

## 4. Gate Decision

**Critical findings:** [count]
**High findings:** [count]

☐ **PASS** — No critical or high findings. Feature may proceed to deployment.

☐ **CONDITIONAL PASS** — No critical findings. High findings have accepted mitigations documented below.

☐ **FAIL** — Critical or unmitigated High findings present. Feature must not be deployed until resolved.

**Conditions (if applicable):**

---

## 5. Remediation Tracking

| Finding ID | Fixed in commit | Verified by | Date |
|------------|-----------------|-------------|------|
| | | | |

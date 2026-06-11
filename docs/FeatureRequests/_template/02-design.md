# Technical Design — [Feature Name]

**Date:** [ddMMMyyyy]
**Author:** Solution Architect
**Status:** Draft | Under Review | Approved

---

## 1. Overview

_One paragraph: what is being built, the key technical decisions, and the approach._

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/routes/` | New / Modified | |
| `backend/services/` | New / Modified | |
| `backend/migrations/` | New | |
| `frontend/src/components/` | New / Modified | |
| `frontend/src/api/client.ts` | Modified | |

---

## 3. Database Schema Changes

### Migration: `NNN_<title>.sql`

```sql
-- paste migration SQL here
```

**Tables affected:**

| Table | Change |
|-------|--------|
| | |

**RLS policies added/modified:**

---

## 4. API Contracts

### `[METHOD] /api/[path]`

**Auth required:** Yes (user) / Yes (admin) / No

**Request:**
```json
{
}
```

**Response (200):**
```json
{
}
```

**Error responses:**
| Status | Condition |
|--------|-----------|
| 401 | Not authenticated |
| 403 | Not authorised (admin required) |
| 422 | Validation error |
| 500 | Internal error |

---

## 5. Caching Strategy

| Data | Cache Key | TTL | Fallback |
|------|-----------|-----|----------|
| | | | |

---

## 6. External Dependency Fallback Chain

| Primary | Fallback 1 | Fallback 2 | Behaviour if all fail |
|---------|------------|------------|----------------------|
| | | | |

---

## 7. Frontend State Management

| Component | State owned | Props received | Loading state | Error state | Empty state |
|-----------|------------|----------------|---------------|-------------|-------------|
| | | | | | |

---

## 8. Subscription Tier Enforcement

_Where tier limits are checked and how they are enforced._

---

## 9. New Environment Variables

| Variable | Side | Description | Required |
|----------|------|-------------|----------|
| | Backend / Frontend | | Yes / No |

---

## 10. ADR References

_List any Architecture Decision Records written for this feature._

- `docs/adr/NNNN-<title>.md` — [brief description]

---

## 11. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

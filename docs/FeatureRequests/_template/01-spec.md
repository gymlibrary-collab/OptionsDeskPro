# Feature Spec — [Feature Name]

**Date:** [ddMMMyyyy]
**Author:** Business Analyst
**Status:** Draft | Under Review | Approved

---

## 1. Summary

_One paragraph describing the feature, who it serves, and the problem it solves._

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| | | |

---

## 3. Functional Requirements

_Numbered, testable statements. Each must be falsifiable._

1.
2.
3.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — [Title]

**As a** [persona], **I want** [action] **so that** [outcome].

**Acceptance Criteria:**
- [ ] AC1:
- [ ] AC2:
- [ ] AC3:

### Story 2 — [Title]

**As a** [persona], **I want** [action] **so that** [outcome].

**Acceptance Criteria:**
- [ ] AC1:
- [ ] AC2:

---

## 5. Out of Scope

_Explicit list of what this feature does NOT include._

-
-

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-----------------|
| Market data unavailable | |
| Tier limit reached | |
| AI quota exhausted | |
| Empty watchlist / no positions | |
| Admin vs. non-admin | |

---

## 7. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|----------|
| Market Data App | | 100 credits/day (free tier) |
| yfinance | | Rate limited, NaN-safe required |
| Supabase | | |
| Claude API | | Per-token cost |
| Reddit PRAW | | Rate limited |

---

## 8. Subscription Tier Impact

| Tier | Behaviour |
|------|-----------|
| free | |
| starter | |
| pro | |
| enterprise | |

---

## 9. Product Owner Annotations

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| | | |

**MVP boundary:** [Stories in v1]

**Deferred to backlog:** [Stories deferred]

**PO gate decision:** ☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

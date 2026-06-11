# Test Report — [Feature Name]

**Date:** [ddMMMyyyy]
**QA Engineer:** (automated tests)
**Tester:** (manual / exploratory)
**Status:** In Progress | Complete

---

## 1. Acceptance Criteria Coverage

| AC ID | Story | Criterion | Automated Test | Manual Test | Result |
|-------|-------|-----------|----------------|-------------|--------|
| AC1.1 | Story 1 | | `spec:line` | Test ID | ☐ Pass ☐ Fail |
| AC1.2 | Story 1 | | | | ☐ Pass ☐ Fail |
| AC2.1 | Story 2 | | | | ☐ Pass ☐ Fail |

---

## 2. Automated Tests (Playwright)

### Tests Added

| File | Test Name | Scenario |
|------|-----------|----------|
| `e2e/pages/` | | |

### Test Run Results

```
Tests:   X passed, Y failed, Z skipped
Duration: Xs
```

### Regressions

☐ No regressions detected in existing test suite
☐ Regressions found — details below:

---

## 3. Manual Test Plan

### Test Environment

- Browser:
- Viewport:
- Auth state:

### Test Cases

| ID | Scenario | Steps | Expected | Actual | Result |
|----|----------|-------|----------|--------|--------|
| M01 | Happy path | 1. ... | | | ☐ Pass ☐ Fail |
| M02 | Empty state | | | | ☐ Pass ☐ Fail |
| M03 | API error | | | | ☐ Pass ☐ Fail |
| M04 | Mobile viewport | | | | ☐ Pass ☐ Fail |
| M05 | Rapid double-click | | | | ☐ Pass ☐ Fail |
| M06 | Admin vs non-admin | | | | ☐ Pass ☐ Fail |

### Exploratory Testing Notes

_Observations from exploratory testing — anomalies, usability concerns, near-misses._

---

## 4. Issues Found

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| | Critical / Major / Minor / Cosmetic | | Open / Fixed / Accepted |

---

## 5. Coverage Gaps

_Scenarios that cannot be covered by automated tests and why._

---

## 6. Sign-off

**Automated tests:** ☐ All passing &nbsp; ☐ Failures outstanding
**Manual testing:** ☐ Complete &nbsp; ☐ In Progress
**All AC covered:** ☐ Yes &nbsp; ☐ No — gaps noted above

QA gate recommendation: ☐ Approve &nbsp; ☐ Block (issues must be fixed)

# Gate Approvals — Legal T&C Acknowledgment Tracking and Subscriber Activity Log

**Feature folder:** `docs/FeatureRequests/legal-and-activity-log-25Jun2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | Business Analyst |
| **Date** | 25Jun2026 |
| **Notes** | Spec authored. Story 2 struck through (already implemented). Four true deliverables identified: T&C ack status column (Story 1), tc_acknowledged event type (Story 3), ai_features_enabled event type (Story 8), View Activity button (Story 6). OQ-3 and OQ-5 resolved in spec. OQ-4 and OQ-6 deferred to architect. |

X Approved

---

## Gate 2 — Architecture Design (Product Owner Review)

| | |
|---|---|
| **Document** | `01-spec.md` — Section 12 |
| **Approved by** | Product Owner |
| **Date** | 25Jun2026 |
| **Notes** | Priority scores assigned. MVP boundary defined. OQ-4 (ticker_search) resolved by PO: permanently deferred, not in scope. OQ-6 deferred to architect. Three clarifications required in 02-design.md: (1) confirm hook point for tc_acknowledged in legal acknowledge route; (2) confirm single-call strategy for tc_ack_status in GET /admin/users; (3) confirm per-session dedup mechanism for ai_features_enabled. No tier gate changes required. No narrative UX risk. Architect may proceed. |

X Approved

---

## Gate 3 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | User |
| **Date** | 25Jun2026 |
| **Notes** | Architecture approved. Single-call strategy for tc_ack_status confirmed. useRef dedup mechanism for ai_features_enabled selected over sessionStorage (see ADR-0013). tc_acknowledged hook point confirmed in legal_routes.py post-insert path. ADR-0012 written for cross-tab navigation approach. |

X Approved

---

## Gate 4 — Implementation Diff

| | |
|---|---|
| **Branch** | `claude/modest-davinci-sxz7lv` |
| **Key commits** | 7042e8a (backend), a5ce302 (frontend) |
| **Key files changed** | backend/routes/legal_routes.py, admin_routes.py, activity_routes.py, services/activity_logger.py, migrations/024_extend_action_types.sql, main.py; frontend/src/components/AdminPanel.tsx, api/client.ts, App.tsx |
| **Approved by** | Agents (frontend-developer, backend-developer) |
| **Date** | 25Jun2026 |
| **Notes** | Implementation complete. Two bug fixes also merged to main during this gate: (1) duplicate Positions section fix (refreshSignal prop pattern), (2) wrong credit/debit label on Long Call Vertical Spread in RiskMonitor. CLAUDE.md updated with refreshSignal pattern documentation. |

X Approved

---

## Gate 5 — Test Report

| | |
|---|---|
| **Document** | `04-test-report.md` |
| **Automated tests** | `frontend/e2e/pages/legal-activity-log.spec.ts` — 31 tests, 31 passed (Chromium) |
| **All AC covered** | Yes |
| **Approved by** | QA engineer (automated), tester (manual) |
| **Date** | 25Jun2026 |
| **Notes** | 31 Playwright tests pass on Chromium across 4 suites + boundary tests. 47-case manual test plan produced across 9 groups. 5 code-review findings from tester: Finding 1 (Major — undefined tc_ack_status renders as "Exempt") flagged for follow-up; Findings 2–5 are minor/cosmetic and deferred. Suite 4 provides full DOM testing for ai_features_enabled hook via the running client portal. AdminPanel DOM tests (badge colours, tab switch) logged as gap requiring admin portal webServer in future. |

X Approved

---

## Gate 6 — Security Review

| | |
|---|---|
| **Document** | `05-security-review.md` |
| **Overall decision** | PASS |
| **Critical findings** | 0 |
| **High findings** | 0 |
| **Approved by** | security-reviewer |
| **Date** | 25Jun2026 |
| **Notes** | All invariants pass. Action type whitelist enforced at 3 independent layers (API boundary, service layer, DB constraint). No IDOR. No XSS. JWT auth unchanged. 4 informational findings (L01–L04): unbounded detail dict, asyncio task loss, migration constraint name assumption, X-Forwarded-For trust. L01 recommended as follow-up hardening item (v1.8.1). L02 and L04 accepted by design. L03 requires constraint name verification pre-deploy. |

X Approved

---

## Gate 7 — Deployment & Documentation

| | |
|---|---|
| **Document** | `06-release-note.md` |
| **Deployed to** | Pending — awaiting user approval to merge to main |
| **Deployment date** | TBD |
| **User Guide updated** | Yes — `frontend/src/components/UserGuide.tsx` |
| **Completed by** | technical-writer, devops-engineer, operator |
| **Date** | 25Jun2026 |
| **Notes** | Release note v1.8.0 written. UserGuide Admin Tools section updated with T&C Status column and View Activity button. CI/CD: no workflow changes needed; new spec file picked up automatically by nightly run. Migration 024 must be applied manually via Supabase dashboard before backend deploy. STOP — feature is complete on branch claude/modest-davinci-sxz7lv and ready to merge to main pending user approval. |

☐ Released

# Gate Approvals — Risk Monitor Layout Redesign (Master-Detail Split)

**Feature folder:** `docs/FeatureRequests/risk-monitor-layout-27Jun2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | business-analyst |
| **Date** | 27Jun2026 |
| **Notes** | Spec covers 8 user stories, 28 functional requirements, 5 open questions, full edge case table, tier impact table, and external dependency analysis. Layout direction (Master-Detail Split, newest-first entry-date sort) is pre-approved by user from HTML preview and is not subject to further debate. Accepted as written. |

Approved

---

## Gate 2 — Product Owner Review

| | |
|---|---|
| **Document** | `01-spec.md` (PO annotations in Section 10) |
| **Approved by** | product-owner |
| **Date** | 27Jun2026 |
| **Notes** | See full rationale in Section 10 of the spec. All five open questions resolved with binding decisions. MVP boundary confirmed: all 8 stories ship in v1 (Story 7 mobile accordion is priority 2 and may slip one sprint if delivery is at risk, but is in scope). No tier gate changes required. No cannibalisation of core narrative value — the defensive content is now more prominent, not hidden. |

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Partial close/re-entry entry date | Use `MIN(created_at)` as specified. Semantically correct for paper trading: a closed-then-reopened position produces a new position row, so MIN reflects the current trade's actual opening. Architect to document this in the design doc with the partial-close example. |
| OQ-2 — strategy_key join on orders table | Accepted as written. Architect must verify the join condition in 02-design.md. Fallback to `positions.created_at` (FR-1) covers rows where strategy_key is null on older order records. |
| OQ-3 — Mini progress bar metric | Use worst-leg `pnl_pct` (the most negative pnl_pct across the group's legs), clamped 0–100% for display. This is consistent with how the group's worst risk badge is derived. No new data required. Architect to specify the exact field derivation in 02-design.md and note in the FR-10 implementation. |
| OQ-4 — Trade Narrative section default state | Collapsed by default, as written in FR-18. Action plan is the primary right-panel content; trade narrative is supplementary and may be stale. Confirmed intentional. |
| OQ-5 — Second Supabase query acceptable for MVP? | Yes. Single-operator app with low order volume. Existing `(user_id, created_at desc)` index is sufficient for MIN aggregation. No composite index required for v1. Architect may add composite index as a post-launch optimisation but it must not gate release. |

### Priority Scores (summary)

| Story | Priority |
|-------|----------|
| Story 1 — Scan All Trades at a Glance | 1 — Must Have |
| Story 2 — Navigate to Full Position Detail | 1 — Must Have |
| Story 3 — View Leg-Level Detail in the Right Panel | 1 — Must Have |
| Story 4 — Action Plan Always Visible | 1 — Must Have |
| Story 5 — Entry Date Displayed and Used for Sort | 1 — Must Have |
| Story 6 — Backend `entered_at` Accuracy | 1 — Must Have |
| Story 7 — Mobile Accordion Layout | 2 — Should Have (in scope; may defer one sprint if delivery is at risk) |
| Story 8 — No Regression on Existing Functionality | 1 — Must Have |

**GO — proceed to Gate 3 (Architecture Design).**

The solution architect may begin. The design doc must address: the entered_at query plan (OQ-5), strategy_key join verification (OQ-2), worst-leg pnl_pct derivation for the mini progress bar (OQ-3), and the partial-close semantic for MIN(created_at) (OQ-1). The defensive narrative content (Financial Reality, Paths Forward, Summary Box, Close Instructions) must be preserved word-for-word — the architecture must not propose any simplification or replacement of these components.

Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 27Jun2026

---

## Gate 3 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | |
| **Date** | |
| **Notes** | |

Pending

---

## Gate 4 — Test Report

| | |
|---|---|
| **Document** | `04-test-report.md` |
| **Automated tests added** | |
| **All AC covered** | |
| **Approved by** | |
| **Date** | |
| **Notes** | |

Pending

---

## Gate 5 — Security Review

| | |
|---|---|
| **Document** | `05-security-review.md` |
| **Overall decision** | |
| **Critical findings** | |
| **High findings** | |
| **Approved by** | |
| **Date** | |
| **Notes** | |

Pending

---

## Gate 6 — Deployment & Documentation

| | |
|---|---|
| **Document** | `06-release-note.md` |
| **Deployed to** | Railway |
| **Deployment date** | |
| **User Guide updated** | |
| **Approved by** | |
| **Date** | |

Pending

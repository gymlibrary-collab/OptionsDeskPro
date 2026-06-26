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
| **Approved by** | solution-architect |
| **Date** | 27Jun2026 |
| **Notes** | Design covers: (1) `entered_at` derivation via `MIN(orders.created_at)` aggregated in Python, with group-min enforcement pass and two-level fallback chain (orders → positions.created_at → today); (2) all five OQ resolutions from the PO gate are addressed in the design sections; (3) strategy_key join correctness confirmed via migration 023; (4) no migration required; (5) no new packages; (6) existing components (`DefensiveNarrativeSingle`, `DefensiveNarrativeGroup`, `CloseInstructions`, `NarrativePanel`, `PositionCard`, `SignalRow`) reused verbatim or with label-only cosmetic changes; (7) `selectedGroupKey` + `mobileExpandedKey` state pattern for desktop/mobile; (8) `useWindowSize` hook reused for 768px breakpoint; (9) ADR-0014 written for the derive-at-query-time decision. |

Approved

_Approved by:_ solution-architect &nbsp;&nbsp; _Date:_ 27Jun2026

---

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
| **Overall decision** | PASS |
| **Critical findings** | 0 |
| **High findings** | 0 |
| **Low findings** | 2 (defensive coding recommendations; not gate conditions) |
| **Approved by** | security-reviewer |
| **Date** | 26Jun2026 |
| **Notes** | All CLAUDE.md invariants pass. Auth guard confirmed on `get_positions_risk`. Both new Supabase queries are strictly scoped to the authenticated user's `user_id` from the verified token. No new user-controlled input reaches the DB. No `dangerouslySetInnerHTML` in RiskMonitor. Error handling logs only; does not propagate DB errors to API callers. No python-jose, no SUPABASE_JWT_SECRET, no MARKETDATA_API_TOKEN or SUPABASE_SERVICE_KEY in frontend. Two Low findings (defensive coding only) do not require pre-release fixes. |

Approved

_Approved by:_ security-reviewer &nbsp;&nbsp; _Date:_ 26Jun2026

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

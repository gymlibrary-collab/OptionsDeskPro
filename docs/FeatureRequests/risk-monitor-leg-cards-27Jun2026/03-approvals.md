# Gate Approvals — Risk Monitor Right-Panel Compact Leg Cards

**Feature folder:** `docs/FeatureRequests/risk-monitor-leg-cards-27Jun2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | business-analyst |
| **Date** | 27Jun2026 |
| **Notes** | Spec covers 6 user stories, functional requirements for grid layout and compact card anatomy, per-leg signal options, unchanged-elements list, edge case table, tier impact table, and 4 open questions. Visual design direction (compact leg card grid, approved HTML preview) is pre-approved by user and is not subject to further debate. Accepted as written. |

Approved

---

## Gate 2 — Product Owner Review

| | |
|---|---|
| **Document** | `01-spec.md` (PO annotations in Section 10) |
| **Approved by** | product-owner |
| **Date** | 27Jun2026 |
| **Notes** | See full rationale in Section 10 of the spec. All four open questions resolved with binding decisions. MVP boundary confirmed: all 6 stories ship in v1. No tier gate changes required. No cannibalisation of the core narrative value — the defensive action plan is made more accessible, not hidden. |

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Quantity chip redundancy | KEEP BOTH. The `×N` header chip and the Qty tile both remain in v1. The user explicitly requested the Qty tile and approved the preview containing both. If one is ever dropped post-launch, it is the header chip, not the tile. Architect must not remove either element in v1. |
| OQ-2 — Per-leg signals placement | OPTION C. Signals remain in the group-level `ActionPlanBox` only. No signal rows on the compact card. The approved HTML preview shows no signals on the card; that decision is final. The architect must confirm in `02-design.md` that the action plan already surfaces per-leg urgent signal text at the group level without any new mechanism. |
| OQ-3 — Single-card max-width | CAP AT 360px on the individual card element (not the grid container). Grid container remains full-width. For a 1-leg position, the card aligns left by default grid flow. Architect to document the CSS approach in `02-design.md`. |
| OQ-4 — Chip styling | Deferred to frontend developer. Match the spirit of the approved HTML preview. No pixel-level specification required. Acceptance criteria test content, not styling. |

### Priority Scores (summary)

| Story | Priority |
|-------|----------|
| Story 1 — Four-Leg Iron Condor Scannable at a Glance | 1 — Must Have |
| Story 2 — Compact Card Shows Decision-Relevant Data | 1 — Must Have |
| Story 3 — IV Rank Tile Handles Null Gracefully | 1 — Must Have |
| Story 4 — Per-Leg Signals Reachable | 1 — Must Have |
| Story 5 — Responsive Reflow on Narrower Panels and Mobile | 1 — Must Have |
| Story 6 — Unchanged Elements Remain Intact | 1 — Must Have |

**GO — proceed to Gate 3 (Architecture Design).**

The solution architect may begin. The design doc must address: (1) confirmation that Option C signal placement is satisfied by the existing `ActionPlanBox` content without any new mechanism; (2) card-level `max-width: 360px` CSS approach for OQ-3; (3) retention of both the `×N` header chip and the Qty tile per OQ-1; (4) `LegCard` as a new separately named component, `PositionCard` retained in file; (5) `MiniProgressBar` reuse with `worstLegPnlPct={pos.pnl_pct}` as specified. The defensive narrative content (`DefensiveNarrativeSingle`, `DefensiveNarrativeGroup`, `CloseInstructions`) must be preserved word-for-word — the architecture must not propose any simplification or replacement of these components.

Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 27Jun2026

---

## Gate 3 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | solution-architect |
| **Date** | 27Jun2026 |
| **Notes** | Presentation-only change to `frontend/src/components/RiskMonitor.tsx`. No migration, no new packages, no API change. New `LegCard` component and `riskShort()` helper added; `PositionCard` retained unchanged. Grid: `repeat(auto-fill, minmax(240px, 1fr))`, card `max-width: 360px`. Signal gap at action-plan level documented — raw signal messages not surfaced in v1 right panel; business meaning conveyed via `DefensiveNarrativeSingle`/`DefensiveNarrativeGroup`. Flagged as backlog item. All PO binding decisions (OQ-1 through OQ-4) addressed. |

Awaiting user approval to proceed to Gate 4 (Implementation).

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
| **Low findings** | |
| **Approved by** | |
| **Date** | |
| **Notes** | |

Pending

---

## Gate 6 — Deployment & Documentation

| | |
|---|---|
| **Document** | `06-release-note.md` |
| **User Guide updated** | |
| **Approved by** | |
| **Date** | |
| **Notes** | |

Pending

# Gate Approvals — Scanner Net Order Price Guidance Box

**Feature folder:** `docs/FeatureRequests/scanner-net-order-price-30Jun2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | business-analyst |
| **Date** | 30Jun2026 |
| **Notes** | Spec covers 6 user stories, functional requirements for the net order price guidance box inside `TradeInstructions` in `StrategyDetail.tsx`. Frontend-only scope confirmed: no backend route, no API contract change, no schema change, no tier gate change. Box is additive below the existing grey "Net / Exit when" summary row. Signed convention (debit = negative, credit = positive), DR/CR alternative representation, direction guide, and leg-count gate all specified. Six open questions identified for PO and architect resolution. Codebase findings section anchors the architect to exact line references in `StrategyDetail.tsx`. Accepted as written. |

Approved

---

## Gate 2 — Product Owner Review

| | |
|---|---|
| **Document** | `01-spec.md` (PO annotations in Section 11) |
| **Approved by** | product-owner |
| **Date** | 30Jun2026 |
| **Notes** | See full rationale in Section 11 of the spec. All open questions resolved with binding decisions (see table below). MVP boundary confirmed: all 6 stories ship in v1 — single-file change, tightly coupled stories, known production data condition (zero-mid) makes Story 6 non-deferrable. All stories are Priority 1. No tier gate changes required. No cannibalisation of the core narrative experience — the box is additive and the "How to place this trade" panel content is explicitly preserved by Story 5. Frontend-only change confirmed; no backend modification permitted. |

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Formula overflow on narrow mobile | Desktop (>= 480px): natural line wrap, no truncation, no font shrink. Mobile (< 480px): formula line replaced with condensed result line only (`net = −3.49 (debit)`); large number, DR/CR, and direction guide remain visible in full. No toggle, no configuration. |
| OQ-2 — Zero or missing mid legs | Show the box with an amber caution note. Formula, signed number, DR/CR, per-spread total suppressed. Caution text: "One or more leg mids are unavailable — verify the net price on your broker before placing this order." Amber colour (`#d97706` or nearest `C.*` equivalent). Existing leg rows unchanged. |
| OQ-3 — Label wording | "combo order" retained as specified. No change. |
| OQ-4 — Direction guide detail level | Parenthetical notes included as per user-approved design and FR-7g wording. No change. |
| OQ-5 — Consistency check vs `trade.estimated_credit_or_debit` | Dev-only `console.warn` when divergence exceeds $0.05. Guarded by `import.meta.env.DEV`. No user-facing impact. Threshold $0.05 (tighter than BA recommendation). |
| OQ-6 — Covered Put / Covered Call stock-leg treatment | Both yield `displayLegs.length === 1` after stock-leg filtering — box not shown. Architect must confirm via `strategy_engine.py` inspection and state the result explicitly in `02-design.md`. No per-strategy hardcoding; gate is purely `displayLegs.length >= 2`. |

### Additional Binding Decisions

- Frontend-only: no backend route, API endpoint, TypeScript interface, schema, or tier gate change permitted.
- `displayLegs` reuse: `signedNet` is a derived constant computed inline from the existing `displayLegs` array. No new prop on `TradeInstructions` or `TradeCard`.
- No interactive elements in the box. Mobile condensed layout is a static CSS decision, not a toggle.
- No tier gate introduced. Box visible to all tiers with scanner deep-analysis access.
- `TradePanel.tsx` is out of scope and must not be modified.

### Priority Scores

| Story | Priority |
|-------|----------|
| Story 1 — Box appears only for multi-leg strategies | 1 — Must Have |
| Story 2 — Signed net value and formula are correct | 1 — Must Have |
| Story 3 — Debit/Credit tag and direction guide match the sign | 1 — Must Have |
| Story 4 — DR/CR alternative is shown correctly | 1 — Must Have |
| Story 5 — Existing panel is unchanged | 1 — Must Have |
| Story 6 — Missing or zero leg mid is handled gracefully | 1 — Must Have |

**GO — proceed to Gate 3 (Architecture Design).**

The solution architect may begin. The design doc must address:

1. Confirmation that `covered_put` and `covered_call` both yield `displayLegs.length === 1` after stock-leg filtering — verified via `strategy_engine.py` leg definitions. State result explicitly.
2. The `signedNet` derived constant: type, formula, placement inside `TradeInstructions`, and zero-mid guard that triggers the amber caution path.
3. Two-tier mobile layout (OQ-1): CSS/inline-style approach for hiding formula on < 480px and rendering the condensed result line instead. Large number, DR/CR, and direction guide visible at all widths.
4. Amber caution render path (OQ-2): what is shown, what is suppressed, exact colour value.
5. Dev-only `console.warn` for OQ-5: exact condition, $0.05 threshold, `import.meta.env.DEV` guard.
6. Visual treatment: background colour, left border colour (red/green), font size >= 20px for large number. Cite `C.*` palette or hex values from `StrategyDetail.tsx`.
7. DOM placement: box inserted immediately after the closing `</div>` of the grey summary row wrapper (Section 10 line reference). Architect must cite the line and confirm the insertion point.
8. Confirmation that no element outside `StrategyDetail.tsx` is modified.
9. Confirmation that no new prop is added to `TradeInstructions`, `TradeCard`, or any other component.

Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 30Jun2026

---

## Gate 3 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | solution-architect |
| **Date** | 30Jun2026 |
| **Notes** | Frontend-only, single file (`StrategyDetail.tsx`). OQ-6 confirmed via `strategy_engine.py`: both `covered_call` (lines 1197–1211) and `covered_put` (lines 1451–1465) yield `displayLegs.length === 1` after stock-leg filtering — box correctly suppressed for both by the `>= 2` gate, no per-strategy hardcoding. `DisplayLeg` fields confirmed: `leg.action` (string `"sell"`/`"buy"`), `leg.mid` (number), `leg.qty` (local type extension, not on base `TradeLeg`). Responsive mechanism: `useState` + resize listener inside `TradeInstructions` for `isMobile` (< 480px) — `useWindowSize` not present in this file; no import needed. `NetOrderPriceBox` is a local sub-component in the same file — not a new file. No migration. No new npm package. No backend change. No API contract change. No tier gate. All 10 PO checklist items addressed in design. |

---

## Gate 4 — Test Report

| | |
|---|---|
| **Document** | `04-test-report.md` |
| **Automated** | |
| **Manual plan** | |
| **Approved by** | |
| **Date** | |
| **Notes** | |

---

## Gate 5 — Security Review

| | |
|---|---|
| **Document** | `05-security-review.md` |
| **Approved by** | security-reviewer |
| **Date** | 30Jun2026 |
| **Notes** | Frontend-only, single-file change. All seven checklist items (XSS, data exposure, network/auth/DB paths, listener lifecycle, dev-only logging, NaN/Infinity guard, formula injection) confirmed clean. No Critical, High, Medium, or Low findings — all findings are Informational (confirmed safe). CLAUDE.md invariants unaffected. One non-blocking hardening recommendation recorded (add `Number.isFinite` arm to hasMissingMid guard) — not required for release. Unconditional PASS. |

Approved

_Approved by:_ security-reviewer &nbsp;&nbsp; _Date:_ 30Jun2026

---

## Gate 6 — Deployment & Documentation

| | |
|---|---|
| **Document** | `06-release-note.md` |
| **Approved by** | |
| **Date** | |
| **Notes** | |

---

## Overall Status

**Gates complete: 5 of 6**

- Gate 1 (BA Spec) — approved 30Jun2026
- Gate 2 (Product Owner) — approved with binding OQ decisions 30Jun2026
- Gate 3 (Architecture) — approved 30Jun2026
- Gate 4 (Test) — pending
- Gate 5 (Security) — approved 30Jun2026
- Gate 6 (Release & Documentation) — pending

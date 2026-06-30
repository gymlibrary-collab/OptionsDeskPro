# Gate Approvals — Scanner Category List: Show All Applicable Strategies

**Feature folder:** `docs/FeatureRequests/scanner-category-show-all-30Jun2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | business-analyst |
| **Date** | 30Jun2026 |
| **Notes** | Spec covers 5 user stories and the full functional, edge-case, tier, and dependency analysis for removing the `[:3]` per-category cap in `recommend_by_category`. Backend-only scope confirmed: single line change in `backend/services/strategy_engine.py` line 822. No API contract change, no frontend change, no schema change, no tier gate change. Two open questions identified (OQ-1: enumerate other truncated categories; OQ-2: secondary sort for complexity ties) — both routed to Product Owner. Codebase findings section anchors the architect to exact line references. Accepted as written. |

Approved

---

## Gate 2 — Product Owner Review

| | |
|---|---|
| **Document** | `01-spec.md` (PO annotations in Section 11) |
| **Approved by** | product-owner |
| **Date** | 30Jun2026 |
| **Notes** | See full rationale in Section 11 of the spec. Both open questions resolved with binding decisions (see table below). MVP boundary confirmed: all 5 stories ship in v1 — they are a single-line fix and the stories are not separable (correctness, verification, and non-regression criteria for the same change). All stories are Priority 1. No tier gate change required or permitted — the fix corrects a defect equally for all tiers. No cannibalisation of the narrative experience — the change is confined to strategy list completeness in the category panels, which is upstream of the narrative. Backend-only constraint confirmed; no frontend modification permitted. |

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Enumerate other truncated categories | Informational only. Fix removes the cap universally. Architect must enumerate per-category strategy counts for all three IV environments (LOW, MEDIUM, HIGH) in `02-design.md` so QA has explicit spot-check targets. No additional code change results from this enumeration. |
| OQ-2 — Secondary sort for complexity ties | Retain Python dict insertion order. Current order for Omnidirectional at HIGH IV is: `put_front_ratio`, `call_front_ratio`, `put_broken_wing_butterfly`, `call_broken_wing_butterfly`, `call_broken_heart_butterfly`, `put_broken_heart_butterfly`. No secondary sort added now. A name-alphabetical or PoP-descending sort is a valid future enhancement but is out of scope for this fix. |

### Additional Binding Decisions

- Backend-only: only permitted change is `matches[:3]` → `matches` on line 822 of `backend/services/strategy_engine.py`. No other file may be modified.
- No API contract change. `Record<string, StrategyRecommendation[]>` response shape is unchanged; more items per key is fully backwards-compatible.
- No tier gate introduced or modified.
- `recommend_strategies` (watchlist scan, `top_n=5`) and `get_strategy_count` must not be touched.

### Priority Scores

| Story | Priority |
|-------|----------|
| Story 1 — All applicable strategies appear per category | 1 — Must Have |
| Story 2 — Put Broken Heart Butterfly appears under Omnidirectional | 1 — Must Have |
| Story 3 — Non-viable strategies remain filtered | 1 — Must Have |
| Story 4 — Category list and matrix are consistent | 1 — Must Have |
| Story 5 — No performance regression | 1 — Must Have |

**GO — proceed to Gate 3 (Architecture Design).**

The solution architect must address the following in `02-design.md`:

1. The exact one-line diff: `matches[:3]` → `matches` on line 822 of `backend/services/strategy_engine.py`, with the surrounding context quoted to confirm no other truncation point exists in `recommend_by_category`.
2. Enumeration of per-category strategy counts for all three IV environments (LOW, MEDIUM, HIGH) — for every category where the count exceeds 3 under any IV environment, list the strategy keys. This is the QA spot-check matrix required by OQ-1.
3. Formal confirmation that the net number of `build_trade` invocations is identical before and after the fix, for every IV environment. The spec provides the HIGH-IV proof; the architect must confirm the same logic holds for LOW and MEDIUM (where Omnidirectional returns zero matches, so the previously-suppressed keys are absent from `unique_keys` in both baseline and post-fix — net delta remains zero).
4. Confirmation that `recommend_strategies` (`top_n=5`) and `get_strategy_count` are not modified and are not affected by the change.
5. Confirmation that no frontend file, API contract, database schema, or tier gate is modified.
6. Confirmation that the `StrategyRecommendation[]` array growth for any newly-uncapped category is bounded and proportional (no unbounded loop or recursion introduced).

Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 30Jun2026

---

## Gate 3 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | solution-architect |
| **Date** | 30Jun2026 |
| **Notes** | Single one-line change: `matches[:3]` → `matches` on line 822 of `backend/services/strategy_engine.py`. No migration, no API contract change, no frontend change, no ADR. Design delivers all five PO checklist items: (1) exact diff with surrounding context; (2) full per-category count matrix for all three IV environments — six (category, IV env) pairs were truncated before the fix, with OMNIDIRECTIONAL/HIGH the worst case at 6 qualifying strategies vs. 3 returned; (3) formal proof that net `build_trade` call count is zero for every IV environment — truncated keys migrate from `build_comparison_matrix` fallback to the fan-out, same total; (4) route filter at lines 252–259 (`if rec["key"] in trades_by_key`) is unchanged and continues to exclude non-viable strategies; (5) `recommend_strategies`, `get_strategy_count`, all frontend files, API contract, DB schema, and tier gates are all confirmed unchanged. |

Approved

_Approved by:_ solution-architect &nbsp;&nbsp; _Date:_ 30Jun2026

---

## Gate 4 — Test Report

| | |
|---|---|
| **Document** | `04-test-report.md` |
| **Approved by** | qa-engineer (automated), tester (manual) |
| **Date** | |
| **Notes** | Pending. |

---

## Gate 5 — Security Review

| | |
|---|---|
| **Document** | `05-security-review.md` |
| **Approved by** | security-reviewer |
| **Date** | |
| **Notes** | Pending. |

---

## Gate 6 — Deployment & Documentation

| | |
|---|---|
| **Document** | `06-release-note.md` |
| **Approved by** | technical-writer |
| **Date** | |
| **Notes** | Pending. |

---

## Overall Status

**Gates complete: 3 of 6**

- Gate 1 (BA Spec) — approved 30Jun2026
- Gate 2 (Product Owner) — approved with binding OQ decisions 30Jun2026
- Gate 3 (Architecture) — approved 30Jun2026
- Gate 4 (Test) — pending
- Gate 5 (Security) — pending
- Gate 6 (Release & Documentation) — pending

# Approvals — Interpreter Improvements v2

---

## Gate 1 — BA Spec

- **Status:** APPROVED
- **Date:** 24Jun2026
- **Notes:** The spec is well-constructed. It accurately carries the 32 deferred items from the v1 backlog, verifies the 13 v1 implementations with code-line evidence, and re-prioritises the remaining work into a coherent three-tier structure. The FR-N6 (news_sentiment) blocked item is correctly identified and excluded from scope. No false alarms were added. The edge case table is complete. Accepted as written.

---

## Gate 2 — Product Owner Review

- **Status:** APPROVED WITH SCOPE REVISION
- **Date:** 24Jun2026
- **Scope:** See revised P1 list below (10 items). Four BA-assigned P1 items moved to P2. One BA-assigned P2 item promoted to P1.
- **Notes:** See full rationale below.

---

### PO Priority Review

#### Overall Assessment

The v2 spec is sound. The BA's priority framework ("fills a specific strategy key's generic fallback, or produces malformed output") is the right lens. The core dispute is one of scope discipline: 14 P1 items for a single sprint is too ambitious when each named-branch task (FR-G3, FR-G1) requires writing multiple 3–5 sentence strategy-specific paragraphs per key. Sprint velocity risk is real; an overloaded P1 set causes the most valuable items to compete with the least urgent ones.

The following analysis reduces P1 to 10 items, all of which either produce wrong or misleading output today or represent the highest-frequency generic-fallback gaps. The four items moved to P2 are genuine improvements but are polish rather than correctness fixes.

---

#### Items Retained at P1 (Must Have)

**FR-B5 — SMA Zero-Data Guard (RETAINED P1)**
Produces malformed output: "0.0% below its $0.00 moving average." This is not a missing feature — it is a broken sentence that appears in the rendered UI for any illiquid ticker. Fix is three lines. Cannot be deferred.

**FR-D6 — HV Zero-Data Explicit Notice (RETAINED P1)**
Silent omission misleads the user into thinking the IV vs HV comparison was evaluated and simply not shown. An explicit "data unavailable" notice is the minimum standard for a trustworthy narrative. The fix is a two-line else clause.

**FR-C7 — HV Zero Headline Guard (RETAINED P1)**
A headline reading "45.2% IV vs 0.0% HV" is factually misleading: 0.0% HV does not mean zero historical volatility, it means no data. This affects the first thing the user reads. Fix is a one-line guard in the headline builder. Must ship alongside FR-D6.

**FR-G8 — Undefined-Risk Loss: Short Call vs Short Put Distinction (RETAINED P1)**
Telling a short call holder "the loss can be substantial" when the correct statement is "the loss is theoretically unlimited" is a material accuracy failure on a platform whose core value is education. Telling a short put holder the same thing when their loss is actually finite and quantifiable is a missed teaching moment. This is not cosmetic — it directly shapes how a beginner understands their worst-case exposure. The legs are available to make the distinction. Fix is a branch on short leg option type.

**FR-C2 — Margin Notice for Undefined-Risk Trades (RETAINED P1)**
A beginner placing a short naked put on a $150 stock and discovering $3,000+ of buying power has been consumed is a genuine user harm scenario. The margin notice is basic consumer protection for a paper-trading education platform. It belongs in P1 alongside FR-G8 because both address the same user: someone new to undefined-risk positions.

**FR-C3 — Long-Leg "Defines and Caps" Qualification (RETAINED P1)**
Telling a ratio spread user that the long leg "defines and caps your maximum risk" is factually wrong for an undefined-risk structure. This is in the same category as FR-G8: the narrative contradicts itself when a trade is flagged as undefined-risk but the per-leg text says the risk is capped. The fix is a risk_type check and a one-line text substitution.

**FR-G3 — Defensive Tactic Missing Named Branches (RETAINED P1, SCOPED)**
The BA spec lists 9 missing keys. I am retaining FR-G3 at P1 but scoping it to the five highest-frequency strategies: call_butterfly, put_butterfly, short_naked_call, call_calendar, put_calendar. These are the strategies most likely to be recommended by the scanner that currently produce only "Monitor the position daily" as their entire adjustment guidance. The remaining four missing keys (short_call_vertical, big_lizard, poor_mans_covered_call, and the BWB variants) are moved to P2 as an extension of FR-G3. This is not a priority downgrade for the concept — it is a scope split that makes the sprint deliverable.

**FR-G1 — Named Why-This-Strategy Branches (RETAINED P1, SCOPED)**
Same logic as FR-G3. I retain the five keys the BA specified (call_zebra, put_zebra, call_calendar, put_calendar, collar) at P1. The remaining six keys falling to the generic else (call_ratio_spread, put_ratio_spread, short_combo, long_combo, protective_put, diagonal_spread) remain low-frequency and deferred. The call_zebra and put_zebra are the most important: ZEBRA is a distinctive and frequently misunderstood leveraged directional structure and the generic "structured to perform in a HIGH IV environment" text gives no indication of its leverage character.

**FR-G11 — Earnings Urgency Branching in Market Snapshot (RETAINED P1)**
"Reports earnings in approximately 0 days" is both grammatically broken and an urgency failure. A user reading this at market open on earnings day receives no alert. The 0–3 day "IMMINENT" branch is a safety-relevant output correction. The fix is a simple numeric branch. P1 is correct.

**FR-E3 — pop_estimate Preferred over Catalog pop_range (PROMOTED TO P1 from P2)**
The BA placed this at P2. I am promoting it to P1. The reason: the spec already confirmed that FR-B3 (correcting the "wins more often" claim for low-POP strategies like the call butterfly) was a P1 fix in v1. FR-E3 is its counterpart: when the engine has computed a specific POP estimate from actual leg deltas, showing the catalog's generic range instead is a precision regression. A user sees "60–80% probability of profit" when the engine has computed "63% based on the actual strikes selected." Using the computed figure is strictly more correct and requires replacing one field read with another. This is not a polish item — it is a data integrity fix.

---

#### Items Moved from P1 to P2

**FR-G4 — Normal-Skew Note in IV Context (MOVED TO P2)**
The normal-skew case produces an empty skew section — not wrong output, just missing output. Users in the most common scenario get no skew commentary. This is a real gap but it is additive, not corrective. It does not produce a misleading sentence; it produces silence. The fix is one sentence. It can ship in the same sprint as a P2 item without risk, but it should not gate P1 delivery.

**FR-G6 — Neutral Strategy Headline "Range-Bound" Branch (MOVED TO P2)**
The BA's own finding in the v1 spec classified this as "accurate but potentially confusing." The current "Market is Neutral" headline is not wrong — a neutral strategy in a neutral market is correctly described. The "range-bound setup" framing is better, and I want it in v2, but moving it from P1 to P2 reflects that no user is receiving incorrect output today. This is a clarity improvement, not a correctness fix.

**FR-G9 — Flat Term Structure Note (MOVED TO P2)**
Same logic as FR-G4: flat term structure produces an empty section, not a broken sentence. Additive, not corrective. One sentence to add. P2 is the right slot — ships in the same sprint with lower priority claim on developer time.

**FR-G10 — Covered-Call Below-Average Premium Label (MOVED TO P2)**
"Fair" when the premium is actually below average is imprecise but not actively misleading. The fix is a single ternary change. I want it in this sprint but it should not consume P1 review gates. The error is a missed opportunity, not a factual inversion of the kind that B3 and B2 represented in v1.

**FR-G2 — MODERATE vs WEAK Strength Line Distinction (MOVED TO P2)**
MODERATE and WEAK producing identical text is a completeness gap, not a correctness failure. The current output says "conflicting indicators suggest staying cautious" which is reasonable advice for MODERATE as well as WEAK — it errs on the side of caution. The distinction is educationally valuable but it does not produce wrong output. This fits cleanly in P2.

---

#### P2 Items Confirmed (No Changes)

FR-D4, FR-D5, FR-D7, FR-G7, FR-G12, FR-D8, FR-M1, FR-R3, and the scoped extension of FR-G3 (remaining 4 missing defensive tactic keys) are confirmed at P2. These are all genuine improvements with moderate implementation effort and no correctness urgency.

#### P3 Items Confirmed (No Changes)

FR-E2, FR-E4, FR-D1, FR-M2, FR-M3, FR-N1, FR-N3, FR-N5, FR-N8, FR-N9 are confirmed at P3. These are all additive polish or nuance items. None produce wrong output. All are genuine long-term improvements to the narrative engine.

---

### Tier Gate Review

The narrative engine serves all tiers identically. No tier gate changes are required. This feature does not bypass, extend, or restructure any subscription limit. No conflict with the tier system.

### Non-Cannibalisation Check

All 32 items improve the existing 7-section narrative — none shortcut or bypass it. No "quick recommendation" path, no new data table, no narrative compression. The feature strengthens the core differentiator. Approved on this dimension.

### Duplicate / Overlap Review

FR-G3 (defensive tactic) and FR-G1 (why-this-strategy) are related but serve different narrative sections and different user jobs. They are correctly separate FRs. FR-D6 and FR-C7 are both hv_30 == 0 guards but in different functions; they should be implemented together and tested together, but they remain separate FRs because they touch different code paths.

FR-E3 and FR-B3 (v1) are conceptually related (both concern POP accuracy) but FR-B3 was a text correction and FR-E3 is a data-source preference. They do not overlap.

No consolidation is required.

---

### Approved P1 List for v2 Sprint (10 Items)

| # | FR | Description | Rationale for P1 |
|---|----|-------------|-----------------|
| 1 | FR-B5 | SMA zero-data guard | Malformed output: "$0.00 moving average" |
| 2 | FR-D6 | HV zero-data notice | Silent omission — must be explicit |
| 3 | FR-C7 | HV zero headline guard | Misleading "0.0% HV" in headline |
| 4 | FR-G8 | Short call vs short put loss distinction | Unlimited vs finite loss — material accuracy failure |
| 5 | FR-C2 | Margin notice for undefined-risk trades | Consumer protection — beginner harm scenario |
| 6 | FR-C3 | Long-leg "partially offsets" for undefined-risk | Contradicts risk_type on same trade |
| 7 | FR-G3 | Defensive tactic named branches (5 keys: call_butterfly, put_butterfly, short_naked_call, call_calendar, put_calendar) | High-frequency strategies producing only generic fallback |
| 8 | FR-G1 | Why-this-strategy named branches (5 keys: call_zebra, put_zebra, call_calendar, put_calendar, collar) | High-frequency missing-key gap; ZEBRA is distinctively misdescribed by the generic text |
| 9 | FR-G11 | Earnings urgency branching | "approximately 0 days" is broken output and a safety failure |
| 10 | FR-E3 | pop_estimate preferred over catalog pop_range | Data integrity: computed figure is strictly more accurate than catalog range |

Items deferred from BA's P1 to revised P2: FR-G4, FR-G6, FR-G9, FR-G10, FR-G2.

---

### Go / No-Go Recommendation

**GO — proceed to Gate 2 (Architecture / Solution Design).**

The v2 scope is approved with the P1 revision above. The Solution Architect should design against the 10-item revised P1 list. P2 items (14 items including the 5 demoted from P1 and the scoped FR-G3 extension) may be included in the same sprint if developer capacity allows, but they must not delay P1 delivery.

The architect should note that FR-G3 and FR-G1 together require writing approximately 10 distinct 3–5 sentence strategy-specific paragraphs. This is the largest single content-writing task in the sprint and should be called out explicitly in the implementation estimate.

---

## Gate 3 — Architecture Design

- **Status:** APPROVED
- **Date:** 24Jun2026
- **Author:** Solution Architect
- **Document:** `docs/FeatureRequests/interpreter-improvements-v2-24Jun2026/02-design.md`

**Summary of design decisions:**

All 10 P1 items are implemented entirely within `backend/services/interpreter.py`. No schema migrations, no new API endpoints, no new Python packages, no frontend changes. One backward-compatible function signature change: `_why_this_strategy()` gains `trade: dict | None = None` as an optional keyword argument to support FR-E3 (pop_estimate preference). Both call sites in `generate_narrative()` are updated.

Key risks identified and mitigated:
1. FR-G3/FR-G1 strategy key strings must be verified against the 31-key catalog in `strategy_engine.py` before implementation — a mismatch silently falls to the generic fallback.
2. FR-G3 new tactic entries must use "the stock" noun (not `{symbol}`) because `_defensive_tactic()` receives no symbol parameter.
3. FR-G8 leg inspection uses a conservative default (unlimited-risk framing) for any ambiguous leg structure.

Testing strategy: Playwright route-interception mocking `GET /api/strategies/analyze/{symbol}` with 19 controlled fixtures covering all P1 scenarios and their negative cases (verified existing behaviour is unchanged).

Deployment: Railway backend redeploy of the single modified file. Rollback is a single-file revert.

---

## Gate 4 — QA Test

- **Status:** APPROVED
- **Date:** 25Jun2026
- **Author:** QA Engineer
- **Document:** `docs/FeatureRequests/interpreter-improvements-v2-24Jun2026/04-test-report.md`
- **Test file:** `frontend/e2e/pages/narrative-improvements-v2.spec.ts`

**Summary:**

28 new Playwright E2E tests written covering all 10 P1 FRs across 9 user stories plus a mobile viewport regression test. All 28 pass on `npx playwright test --project=chromium`. The existing v1 suite (24 tests, `narrative-improvements.spec.ts`) also passes with zero regressions.

All acceptance criteria from the approved P1 list (Gate 2 PO-revised scope) have at least one automated test. The one structural correction made during authoring: narrative section text (market_snapshot, iv_context, defensive_tactic, etc.) is rendered inside the strategy card accordion, not in always-visible panels — tests for FR-B5, FR-D6/FR-C7, and FR-G11 correctly call `expandFirstStrategyNarrative` before asserting on narrative text. The test design note in the task brief ("do NOT call expandFirstStrategyNarrative for these") was incorrect; the live UI behaviour requires expansion. This has no impact on coverage — all ACs are still tested.

**Gate 4 decision: GO — proceed to Gate 5 (Security Review).**

---

## Gate 5 — Security Review

- **Status:** APPROVED
- **Date:** 25Jun2026
- **Author:** Security Reviewer
- **Document:** `docs/FeatureRequests/interpreter-improvements-v2-24Jun2026/05-security-review.md`

**Summary:** No Critical or High findings. Three informational (Low) findings documented: L01 (optional type guard on `example_strike`), L02 (optional type guard on `pop_estimate`), L03 (XSS surface analysis — confirmed no vector). All CLAUDE.md invariants confirmed: JWT via `auth.get_user`, no python-jose, no new env vars, no raw SQL, no shell invocation, no IDOR risks. The `generate_narrative()` signature is backward-compatible (optional `trade` kwarg added with default None).

**Gate 5 decision: PASS — proceed to Gate 6 (Release Documentation).**

---

## Gate 6 — Release Documentation

- **Status:** APPROVED
- **Date:** 25Jun2026
- **Author:** Technical Writer
- **Document:** `docs/FeatureRequests/interpreter-improvements-v2-24Jun2026/06-release-note.md`

**Summary:**

Release note covers all 10 P1 narrative engine improvements, smoke test procedures (verify "EARNINGS IMMINENT" header on earnings-within-3-days, verify short naked call shows unlimited-loss framing, verify margin notice appears, verify no "$0.00 SMA" malformed sentences). Deployment: Railway backend redeploy of single modified file (interpreter.py). Rollback: single-commit revert. No database migrations, no new env vars required. Post-deployment monitoring: error rate tracking, no API quota concerns.

Known limitation: `collar` strategy key is dormant (does not exist in current 31-strategy catalog; branch will not execute against current engine).

19 P2/P3 items deferred to v3 (5 PO-moved items + 14 additional backlog items from BA spec).

UserGuide.tsx updated with two sentences:
1. "Why Options Are Priced This Way" section now notes: margin notice for undefined-risk trades (20–25% buying power reserve).
2. "Why This Strategy" section now notes: earnings urgency branching — "EARNINGS IMMINENT" if ≤3 days, "EARNINGS ALERT" if 4–30 days.

**Gate 6 decision: APPROVED — ready for production deployment.**

---

## Gate 5 — Security Review

- **Status:** APPROVED — PASS
- **Date:** 25Jun2026
- **Author:** Security Reviewer
- **Document:** `docs/FeatureRequests/interpreter-improvements-v2-24Jun2026/05-security-review.md`
- **Commit reviewed:** `6043fc7`

**Summary:**

Single-file change to `backend/services/interpreter.py`. No new routes, no migrations, no new dependencies, no frontend changes. All CLAUDE.md invariants hold: `auth.get_user(token)` unchanged in `auth_utils.py`, python-jose absent, `SUPABASE_JWT_SECRET` absent, `MARKETDATA_API_TOKEN` absent, `generate_narrative` public signature unchanged.

Three informational findings only (L01, L02, L03): defensive-coding gaps on server-internal data paths (`example_strike` type guard, `pop_estimate` type guard, `symbol` in f-strings). All three are server-internal, not user-injectable at the interpreter layer. No exploitable attack surface identified.

Zero critical findings. Zero high findings. Zero medium findings.

**Gate 5 decision: GO — proceed to Gate 6 (Release).**

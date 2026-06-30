# Feature Spec — Scanner Category List: Show All Applicable Strategies (Remove Per-Category Cap)

**Date:** 30Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

In the Strategy Scanner's deep-analysis view, the grouped "by category" section renders six
collapsible category panels (Bullish, Bearish, Neutral, Neutral-Bullish, Neutral-Bearish,
Omnidirectional). Each panel shows the strategies whose `iv_environment` includes the current
IV environment and whose `direction` includes the category label. Currently,
`recommend_by_category` in `backend/services/strategy_engine.py` silently caps each category
at three strategies via `matches[:3]` (line 822), sorted by complexity ascending.

This cap causes silent truncation when more than three strategies tie on complexity within a
category. The concrete production symptom: when IV environment is HIGH, all six Omnidirectional
strategies share complexity 3. The `matches[:3]` cap keeps the first three in Python dict
insertion order (`put_front_ratio`, `call_front_ratio`, `put_broken_wing_butterfly`) and drops
the remaining three (`call_broken_wing_butterfly`, `call_broken_heart_butterfly`,
`put_broken_heart_butterfly`) from the category panel entirely. Those three strategies do appear
in the comparison matrix — because `build_comparison_matrix` has no such cap — creating an
unexplained discrepancy between two views of the same data.

The approved fix is to remove the `[:3]` cap from `recommend_by_category` so that every
strategy whose `iv_environment` includes the current IV environment and whose `direction`
includes the category is returned, sorted by complexity ascending. This makes the category
panels consistent with the comparison matrix and ensures the user sees the full applicable
strategy set. The change is a single one-line edit in `backend/services/strategy_engine.py`.
There is no frontend change required and no API contract change.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Active options trader scanning a high-IV ticker | starter / pro / enterprise | See every applicable strategy for the Omnidirectional (or any other) category so they can make an informed selection without noticing silent omissions |
| Options learner using the deep-analysis view | free / starter | Understand the full strategy landscape available in the current IV environment; trust that the category panel is complete and not a curated subset |
| Pro trader cross-referencing the category list against the comparison matrix | pro / enterprise | Have the two views agree so they can use either without second-guessing whether one is hiding results |
| Admin / platform reviewer | admin | Verify that all six Omnidirectional strategies appear in the HIGH-IV category panel, matching the comparison matrix row count |

---

## 3. Functional Requirements

All requirements are confined to `backend/services/strategy_engine.py`, the function
`recommend_by_category`. No frontend file, no API contract in `api/client.ts`, no database
schema, and no subscription tier gate is changed.

1. `recommend_by_category(iv_env)` must return, for each category, ALL strategies whose
   `iv_environment` list includes `iv_env` AND whose `direction` list includes the category
   label — not a capped subset. The `[:3]` slice on line 822 must be removed.

2. Within each category, the returned list must remain sorted by `complexity` ascending (the
   existing sort). For strategies that tie on complexity, the secondary order is Python dict
   insertion order of `STRATEGIES` (stable sort; no additional tie-break is required).

3. When IV environment is HIGH, the Omnidirectional category must contain all six strategies:
   `put_front_ratio`, `call_front_ratio`, `put_broken_wing_butterfly`,
   `call_broken_wing_butterfly`, `call_broken_heart_butterfly`, `put_broken_heart_butterfly` —
   all at complexity 3.

4. The `analyze_symbol` route in `backend/routes/strategies.py` must not be modified. Its
   existing behaviour is already correct with respect to this fix:
   - It derives `unique_keys` from the full `recommendations_by_category` dict (lines 201–205),
     so removing the cap automatically causes more unique keys to be included in the fan-out.
   - `_build_and_narrate` is called once per unique key; trades that are already built are
     cached in `trades_by_key` (line 243), so no key is built twice even if it appears in
     multiple categories.
   - The `result_categories` dict (lines 252–259) filters out strategies whose `build_trade`
     returned `None` (max_profit guard) or raised an exception — this behaviour is unchanged and
     non-viable strategies continue to be excluded from the rendered output.

5. `get_strategy_count` (line 828) is a separate function that counts strategies matching
   `iv_environment` only, without category filtering. It must not be modified.

6. `recommend_strategies` (line ~730, used by the watchlist scan with `top_n=5`) is a separate
   function with its own `top_n` cap that is intentional for the scan flow. It must not be
   modified.

7. `build_comparison_matrix` has no per-category cap and must not be modified.

8. The frontend component `CategorySection` in `StrategyDetail.tsx` (line 745) renders
   `recs.map(rec => <StrategyCard ... />)` with no length limit. It must not be modified.
   The badge showing "{N} strategies" (line 777) will automatically reflect the correct count
   once the backend returns the full list.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — All Applicable Strategies Appear Per Category

**As a** trader using the deep-analysis view, **I want** each category section to show every
strategy applicable to the current IV environment **so that** I am not silently shown a partial
list and miss strategies I could use.

**Acceptance Criteria:**

- [ ] AC1: Open the deep-analysis view for any ticker where the detected IV environment is HIGH
  (e.g. a ticker showing "HIGH IV" in the IV environment badge). Expand the Omnidirectional
  section. Confirm that all six strategies are listed: Put Front-Ratio Spread, Call Front-Ratio
  Spread, Put Broken Wing Butterfly, Call Broken Wing Butterfly, Call Broken Heart Butterfly,
  and Put Broken Heart Butterfly. The "{N} strategies" badge on the Omnidirectional header reads
  "6 strategies". A tester can verify this within 3 minutes by expanding the section and
  counting the strategy cards.
- [ ] AC2: For each of the six Omnidirectional strategies, confirm that a `StrategyCard` is
  rendered — it has a title, a description, and an expandable trade structure. No card shows
  a generic "Not built" error in place of trade data (non-viable strategies are filtered at the
  route level and must not appear as empty error cards).
- [ ] AC3: The order of strategies within the Omnidirectional section is complexity ascending.
  All six strategies have complexity 3 and therefore appear in dict-insertion order:
  Put Front-Ratio, Call Front-Ratio, Put Broken Wing Butterfly, Call Broken Wing Butterfly,
  Call Broken Heart Butterfly, Put Broken Heart Butterfly. A tester verifies by reading the
  card titles top-to-bottom.
- [ ] AC4: Categories other than Omnidirectional that currently show fewer than three strategies
  are unaffected (the cap was irrelevant where fewer than three matched). Categories that
  currently show exactly three strategies are re-verified to confirm they still show the correct
  number (which may now be more than three if additional strategies match, or exactly the same
  if the catalog only had three matching strategies). A tester verifies by expanding at least
  two non-Omnidirectional categories and confirming no strategies have disappeared.

---

### Story 2 — Put Broken Heart Butterfly Appears Under Omnidirectional at IV=HIGH

**As a** trader researching high-IV income strategies, **I want** the Put Broken Heart
Butterfly to appear in the Omnidirectional section when IV is HIGH **so that** I can compare
it against its sibling strategies without having to find it only in the comparison matrix.

**Acceptance Criteria:**

- [ ] AC1: Open the deep-analysis view for a ticker with IV environment = HIGH. Expand the
  Omnidirectional category. A card titled "Put Broken Heart Butterfly" is present. A tester
  verifies by reading the card title.
- [ ] AC2: The same test applied to "Call Broken Heart Butterfly" and "Call Broken Wing
  Butterfly" — both cards are present in the Omnidirectional section under HIGH IV. All three
  previously-missing strategies are now shown.
- [ ] AC3: Expand the Put Broken Heart Butterfly card. It renders a trade structure (legs,
  net debit/credit, expiry, strikes). It is not in an error state. A tester verifies by
  clicking the card to expand it and confirming the "How to place this trade" panel appears.
- [ ] AC4: Open the comparison matrix tab (or the matrix section of the same view) for the
  same ticker under HIGH IV. Confirm that Put Broken Heart Butterfly, Call Broken Heart
  Butterfly, and Call Broken Wing Butterfly appear in the matrix rows. The category list and
  the matrix now agree on which Omnidirectional strategies are present. A tester verifies by
  finding the strategy names in both views within the same deep-analysis session.

---

### Story 3 — Non-Viable Strategies Remain Filtered

**As a** trader, **I want** strategies that cannot be built for the current ticker and strikes
to continue to be excluded from the category panels **so that** I only see strategies with
actual, actionable trade structures.

**Acceptance Criteria:**

- [ ] AC1: Run the deep-analysis for a ticker where one or more of the six Omnidirectional
  strategies returns `None` from `build_trade` (max_profit guard: the route logs
  "Suppressed by max_profit guard" for the affected key). Confirm that the affected strategy
  does NOT appear as a card in the Omnidirectional section. Confirm it does not appear as an
  error card. The section count badge reflects only the viable strategies. A tester verifies
  by checking the backend logs for the suppressed key and confirming the category panel does
  not show a card for that key.
- [ ] AC2: A strategy that raises an exception in `build_trade` for a specific ticker (logged
  as a warning by `_build_and_narrate`) also does not appear in the category panel. The panel
  is not empty — it shows the remaining viable strategies. A tester verifies by checking the
  backend log for the exception and confirming the category panel count is reduced by 1 from
  the expected maximum.
- [ ] AC3: The existing "Not built" fallback in `result_categories` (the line
  `trades_by_key.get(rec["key"], {"error": "Not built"})`) causes a strategy to be excluded
  from the rendered list via the `if rec["key"] in trades_by_key` filter. Confirm this
  filter is not accidentally bypassed by the cap removal. A tester verifies by confirming
  that no strategy card displays "Not built" as its trade data in the rendered UI.

---

### Story 4 — Category List and Comparison Matrix Are Consistent

**As a** pro trader cross-referencing the category list against the comparison matrix,
**I want** both views to show the same set of strategies for the current IV environment
**so that** I can trust either view as a complete picture and use them interchangeably.

**Acceptance Criteria:**

- [ ] AC1: Open the deep-analysis view for a HIGH-IV ticker. Note the strategy names in the
  Omnidirectional category panel. Note the strategy names in the Omnidirectional rows of the
  comparison matrix (filtering by the Omnidirectional direction column or identifying them
  by their presence in both). Confirm that no strategy appears in the matrix but is absent
  from the category panel, and no strategy appears in the category panel but is absent from
  the matrix. Both views must agree. (Non-viable strategies filtered by `build_trade` may
  be absent from both — that is acceptable and consistent.)
- [ ] AC2: Repeat AC1 for a MEDIUM-IV ticker. Confirm the same consistency property holds
  across a different IV environment that may activate different strategy subsets. A tester
  verifies by expanding each category panel and checking names against the matrix rows.
- [ ] AC3: The total count of unique strategy keys in the category list (summing the badge
  counts across all six categories, accounting for any strategy that appears in multiple
  categories) is consistent with the count of strategies the comparison matrix shows for the
  same IV environment. A tester may count manually or use the browser's page-search to find
  strategy name occurrences.

---

### Story 5 — No Performance Regression From Removing the Cap

**As a** user on any tier, **I want** the deep-analysis page to load in a comparable time
after this fix **so that** the user experience is not degraded by the additional strategies
now returned.

**Acceptance Criteria:**

- [ ] AC1: For a HIGH-IV ticker, the deep-analysis response time (from clicking the ticker to
  the category panels being fully rendered) is within 2 seconds of the pre-fix baseline on the
  same network and server conditions. A tester measures using the browser Network tab, comparing
  the time for `GET /api/strategies/analyze/{symbol}` before and after the fix.
- [ ] AC2: Confirm via code inspection (or backend logging) that the three previously-missing
  Omnidirectional strategy keys (`call_broken_wing_butterfly`, `call_broken_heart_butterfly`,
  `put_broken_heart_butterfly`) are already included in `trades_by_key` when they are built for
  the comparison matrix. Since `unique_keys` is derived from `recommendations_by_category`
  before `build_comparison_matrix` is called, and `build_comparison_matrix` reuses
  `trades_by_key` (line 880: `if trades_by_key and key in trades_by_key: trade = trades_by_key[key]`),
  the actual number of new `build_trade` calls after the cap removal is the count of previously-
  uncapped keys that were NOT already in `trades_by_key` from the category fan-out. In the
  baseline (pre-fix), the comparison matrix calls `build_trade` for the three missing
  Omnidirectional keys because they are absent from `trades_by_key`. Post-fix, those keys are
  included in `unique_keys` and built during the category fan-out, so the comparison matrix
  call finds them in `trades_by_key` and skips the duplicate build. The net additional
  `build_trade` calls after the fix is zero for these three keys. A tester may verify by
  adding temporary logging and counting `build_trade` invocations before and after the fix.
- [ ] AC3: The API response payload size increases by approximately three additional strategy
  entries in the `recommendations_by_category.OMNIDIRECTIONAL` array. The increase is bounded
  and proportional to the number of uncapped strategies. Page rendering does not stall or
  noticeably slow for a tester using the app on a standard broadband connection.

---

## 5. Out of Scope

- Any change to `recommend_strategies` (the watchlist scan function, ~line 730). Its `top_n=5`
  cap is intentional for the scan flow and must not be modified.
- Any change to `get_strategy_count` (line 828). That function counts strategies by IV
  environment only, without category, and is not related to the category cap.
- Any change to `build_comparison_matrix`. It has no per-category cap and is already correct.
- Any change to the frontend. `StrategyDetail.tsx` renders `recs.map(...)` with no length
  limit; no frontend file requires modification.
- Any change to the `StrategyRecommendation` TypeScript type in `api/client.ts` (line 326).
  The type is `Record<string, StrategyRecommendation[]>`; returning more items per key is
  fully backwards-compatible.
- Adding a secondary sort key for complexity ties (e.g. by name or PoP). The dict-insertion
  order tie-break is stable and acceptable. A named secondary sort may be added in a future
  iteration but is not in scope here.
- Any change to the 31-strategy catalog entries in `STRATEGIES`. The strategy definitions,
  `iv_environment`, `direction`, and `complexity` fields are unchanged.
- Any subscription tier gate change. The deep-analysis endpoint is accessible to all
  authenticated, whitelisted users on all tiers; no new entitlement check is introduced.
- Any database migration or Supabase schema change.
- Any change to `StrategyScanner.tsx`, `TradePanel.tsx`, `OrderEntry.tsx`, `Positions.tsx`,
  `RiskMonitor.tsx`, `AdminPanel.tsx`, `UserGuide.tsx`, `OptionsChain.tsx`, or any frontend
  component.
- Any change to `interpreter.py`, `market_context.py`, `iv_analysis.py`, or any other
  backend service file.
- Adding a user-visible "Show all / Show top 3" toggle to the category panels. The decision
  is to remove the cap entirely; no toggle is introduced.
- Adding a maximum cap at a higher number (e.g. `[:10]`). The decision is uncapped.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| A category has zero matching strategies (e.g. BEARISH under a LOW-IV environment where no bearish strategy is defined for LOW) | `recommend_by_category` returns an empty list for that category. The `CategorySection` component renders the existing "No strategies available in this category for the current IV environment." message. Unchanged from current behaviour. |
| `build_trade` returns `None` for one or more of the six Omnidirectional strategies on a specific ticker (max_profit guard triggered) | Those strategy keys are absent from `trades_by_key`. The `result_categories` filter (`if rec["key"] in trades_by_key`) excludes them. The category panel shows fewer than six cards. The badge count reflects the viable count. No error card is shown. |
| `build_trade` raises an exception for one or more strategy keys | Exception is caught in `_build_and_narrate`, logged as a warning, and the key is absent from `trades_by_key`. Same exclusion behaviour as above. |
| Two different categories share a strategy key (multi-direction strategies where `direction` contains two category labels) | The strategy appears in both category panels. It is built only once (via `unique_keys` set deduplication) and cached in `trades_by_key`. The cap removal does not affect this; it was already handled correctly by the set. |
| Market data unavailable; synthetic chain used | The `_synthetic` flag is set on the chain and propagated to trades. The category panels render with synthetic trade data, and the existing synthetic warning banner is displayed. No change from current behaviour; the cap removal is orthogonal to the data source. |
| IV environment is LOW or MEDIUM (not HIGH) | Fewer strategies match for OMNIDIRECTIONAL (all six Omnidirectional strategies require `iv_environment: ["HIGH"]`). The Omnidirectional section returns zero strategies for LOW or MEDIUM. This is correct and unchanged by the fix — the fix only removes a cap; it does not change which strategies match. |
| AI quota exhausted (Claude API unavailable) | Narrative generation may fail for some strategies. Strategies still appear in the category panel without a narrative section. This is the existing fallback behaviour and is unaffected by the cap removal. |
| Admin vs. non-admin user | The `analyze_symbol` route applies the same logic to both. Admin status has no effect on strategy filtering. Unchanged. |
| User tier limit hit (monthly scan count exhausted) | The scan endpoint enforces tier limits; the analyze endpoint does not apply scan-count limits (it is a per-symbol deep analysis). The cap removal does not change tier limit enforcement. |

---

## 7. External Dependencies

| Service | Usage in This Feature | Quota / Risk |
|---------|----------------------|--------------|
| yfinance | Not affected. Options chain data is fetched as part of the existing `analyze_symbol` flow; the cap removal does not add new chain fetches. | None. |
| Supabase | Not affected. No new query, no schema change. | None. |
| Claude API | Not affected. Narrative generation is called once per unique strategy key; the set of unique keys may include up to three additional keys post-fix, but those keys' narratives were previously generated for the comparison matrix in the same request. Net new AI calls is zero for the three previously-suppressed Omnidirectional keys. | Negligible. |
| Reddit PRAW | Not used by this feature. | None. |

This feature has negligible external dependency risk. The only change is removal of a slice
operator from a Python list comprehension. All data required is already present in the
`STRATEGIES` dict and the existing options chain fetch.

---

## 8. Subscription Tier Impact

No tier gate is added or changed. The deep-analysis view (`GET /api/strategies/analyze/{symbol}`)
is accessible to all authenticated whitelisted users regardless of tier. The watchlist scan
(`GET /api/strategies/scan`) is not modified. Tier limits on scan counts and symbol counts
are not affected.

| Tier | Behaviour |
|------|-----------|
| free | Deep-analysis accessible; category panels now show uncapped strategy lists. No change to scan-count or symbol-count limits. |
| starter | Deep-analysis accessible; category panels now show uncapped strategy lists. No change to scan-count or symbol-count limits. |
| pro | Deep-analysis accessible; category panels now show uncapped strategy lists. No change to scan-count or symbol-count limits. |
| enterprise | Deep-analysis accessible; category panels now show uncapped strategy lists. No change to scan-count or symbol-count limits. |

---

## 9. Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| OQ-1 | **Secondary sort for complexity ties.** All six Omnidirectional HIGH-IV strategies have complexity 3, so they all tie and fall back to Python dict insertion order. The current dict insertion order is: `put_front_ratio`, `call_front_ratio`, `put_broken_wing_butterfly`, `call_broken_wing_butterfly`, `call_broken_heart_butterfly`, `put_broken_heart_butterfly`. Is this a satisfactory order, or is a secondary sort by strategy name (alphabetical) or by PoP range (descending) preferred for readability? Recommend: retain dict insertion order for now as it groups put/call pairs naturally. A named secondary sort can be added in a follow-up. | Product Owner | If unresolved: developer retains dict insertion order (no change needed). Safe default. |
| OQ-2 | **Other categories beyond Omnidirectional.** The investigation confirms that at HIGH IV, all six Omnidirectional strategies tie at complexity 3, making Omnidirectional the only category where the `[:3]` cap causes visible truncation today. However, it is possible that other IV environments (MEDIUM, LOW) or other categories have more than three strategies at the same complexity level, producing silent truncation that is not yet visible due to lower traffic on those paths. Should the architect verify the full catalog before shipping to enumerate any other truncated cases? Recommend: yes — the architect should run `recommend_by_category` for each IV environment (LOW, MEDIUM, HIGH) against the catalog and report the per-category counts in `02-design.md`. | Architect | If unresolved: fix ships but any other currently-truncated categories are not called out. The fix removes the cap globally, so all truncated cases are corrected regardless; the enumeration is informational only. |

---

## 10. Codebase Findings

The following findings from reading the source code are factual observations to give the
solution architect precise anchoring points. They are not requirements.

### The cap: single location, single line

The `[:3]` slice is on line 822 of `backend/services/strategy_engine.py`, inside the list
comprehension that builds `result[category]`:

```python
for _, key, strat in matches[:3]
```

Changing `matches[:3]` to `matches` is the complete backend change. No other location in
`recommend_by_category` truncates the list.

### Route consumption of `recommendations_by_category` (strategies.py)

`analyze_symbol` calls `recommend_by_category(iv_env)` at line 108 and stores the result in
`recommendations_by_category`. It then derives `unique_keys` via a set comprehension at lines
201–205:

```python
unique_keys = {
    rec["key"]
    for strats in recommendations_by_category.values()
    for rec in strats
}
```

This set is used to fan out `_build_and_narrate` calls at line 238. Post-fix, three additional
keys enter `unique_keys` for the HIGH-IV Omnidirectional case. These keys were previously
built by `build_comparison_matrix` (line 884, the `else` branch that calls `build_trade` when
the key is not in `trades_by_key`). Post-fix, those keys are built during the fan-out and
stored in `trades_by_key` before `build_comparison_matrix` is called; the matrix then finds
them in `trades_by_key` and skips the duplicate call. The net number of `build_trade`
invocations is identical before and after the fix.

### No frontend cap

`CategorySection` in `frontend/src/components/StrategyDetail.tsx` (line 745) renders
`recs.map(rec => <StrategyCard ... />)` at line 789–791. There is no `.slice()` or length
guard on `recs`. The badge at line 777 reads `{recs.length} {recs.length === 1 ? 'strategy' : 'strategies'}`.
Both will naturally reflect the correct count once the backend returns the full list. No
frontend file requires modification.

### `get_strategy_count` is independent

`get_strategy_count` at line 828 counts strategies by `iv_environment` only:
```python
return sum(1 for s in STRATEGIES.values() if iv_env in s["iv_environment"])
```
It has no category filter and no cap. It is not related to this fix.

### `recommend_strategies` (watchlist scan) is independent

`recommend_strategies` at approximately line 730 is a separate function that accepts a `top_n`
parameter (called with `top_n=5` from the scan route). Its cap is intentional and must not
be removed.

---

## 11. Product Owner Annotations

_Filled in by the product-owner agent._

### Open Question Decisions (binding)

| OQ | Decision |
|----|----------|
| OQ-1 — Enumerate other truncated categories | Resolved as informational. The fix removes the cap universally — no additional behaviour change is needed. The architect must enumerate, in `02-design.md`, the per-category strategy counts for each IV environment (LOW, MEDIUM, HIGH) to give QA the spot-check targets. The categories known to have more than three matches today (Omnidirectional at HIGH IV = 6 strategies) must be explicitly listed. Any other categories where the count exceeds three under any IV environment must also be listed so QA can verify them. No code change beyond the single-line cap removal is required as a result of this enumeration. |
| OQ-2 — Secondary sort for complexity ties | Resolved: retain Python dict insertion order. The current insertion order for the six Omnidirectional HIGH-IV strategies (`put_front_ratio`, `call_front_ratio`, `put_broken_wing_butterfly`, `call_broken_wing_butterfly`, `call_broken_heart_butterfly`, `put_broken_heart_butterfly`) groups put/call pairs naturally and is stable across runs (CPython 3.7+ dict ordering guarantee). No secondary sort key is added now. A name-alphabetical or PoP-descending secondary sort is a valid future polish item but is explicitly out of scope for this fix. The user's concern is visibility, not ordering. |

### Priority Scores

| Story | Priority (1=must/2=should/3=nice) | Rationale |
|-------|-----------------------------------|-----------|
| Story 1 — All applicable strategies appear per category | 1 — Must Have | This is the core defect fix. Without it the category panel is silently incomplete. Directly advances trust in the core value loop. |
| Story 2 — Put Broken Heart Butterfly appears under Omnidirectional | 1 — Must Have | Specific, verifiable production symptom of the same defect. QA requires this as a named checkpoint. Cannot be deferred without leaving the known regression unverified. |
| Story 3 — Non-viable strategies remain filtered | 1 — Must Have | Non-negotiable correctness guard. Removing the cap must not cause empty or broken strategy cards to appear. This is the "do no harm" criterion. |
| Story 4 — Category list and matrix are consistent | 1 — Must Have | The inconsistency between the two views is the stated user-facing symptom that motivated this fix. Consistency is the acceptance criterion for the fix being done correctly. |
| Story 5 — No performance regression | 1 — Must Have | The spec demonstrates (Section 10, route consumption analysis) that the net number of `build_trade` calls is unchanged post-fix. QA must verify this analytically (code inspection) and empirically (response time check). A fix that silently doubles AI calls would be unacceptable. |

### MVP Boundary

**All five stories ship in v1.** This is a single-line backend fix. The five stories are not separable: Stories 1 and 2 describe the same code path from different vantage points; Story 3 is a correctness constraint on Story 1; Story 4 is the acceptance criterion that the fix is complete; Story 5 is a must-pass gate before merge. Deferring any story would mean shipping without confidence that the fix is correct, safe, or non-regressive.

**Deferred to backlog:** Secondary sort by strategy name or PoP within a complexity tier (resolved in OQ-2 above). A "Show top N / Show all" toggle (explicitly excluded in Section 5). Any cap at a higher number (explicitly excluded in Section 5).

### Additional Binding Decisions

- Backend-only: the single change permitted is `matches[:3]` → `matches` on line 822 of `backend/services/strategy_engine.py`. No other file — backend or frontend — may be modified as part of this feature.
- No API contract change. The response shape (`Record<string, StrategyRecommendation[]>`) is unchanged; returning more items per key is fully backwards-compatible.
- No tier gate introduced or modified. The deep-analysis endpoint is already accessible to all authenticated whitelisted users on all tiers. The cap removal does not confer any pro-tier capability on free-tier users — it corrects a defect in the data returned to all tiers equally.
- No performance concern. Section 10 of the spec provides a formal proof that the net `build_trade` call count is identical before and after the fix. The architect must reproduce this reasoning in `02-design.md` and confirm it holds for any IV environment, not just HIGH.
- `recommend_strategies` (watchlist scan, `top_n=5`) and `get_strategy_count` must not be touched. Their caps are intentional and serve different flows.

**PO gate decision:** Approved

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 30Jun2026

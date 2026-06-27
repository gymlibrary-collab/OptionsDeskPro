# Feature Spec — Risk Monitor Right-Panel Compact Leg Cards

**Date:** 27Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

The Risk Monitor right panel (`RightPanelDetail` in `frontend/src/components/RiskMonitor.tsx`) currently renders each leg of the selected strategy group as a stacked, full-width `PositionCard`. Each card displays seven large metric tiles (Days Left, Qty, Entry, Current, Collected/Cost, Value, P&L) plus optional IV Rank and Bias tiles. For a 4-leg Iron Condor this produces four tall cards that require significant vertical scrolling before the user reaches the action-plan box — the content that actually drives trade decisions.

This feature replaces the stacked full-width `PositionCard` layout inside `RightPanelDetail` with a **compact leg card grid**: each leg becomes a narrow card in a responsive `auto-fill` grid, so all four legs of an Iron Condor sit side-by-side on a wide panel and reflow to two-up and one-up on narrower panels and mobile. The cards surface the most decision-relevant data per leg (direction, strike, DTE, IV Rank, cost/collected, entry→now price, P&L) in a scannable format. The action-plan box below the grid is visible sooner as a result.

This is a presentation-only change. No backend route, API contract, database schema, `PositionRisk` interface, risk-signal logic, or defensive-narrative content is altered.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| Active paper trader (multi-leg) | starter / pro | Scan all four legs of an Iron Condor at a glance — identify which leg is under pressure — without scrolling past the others to reach the action plan |
| Beginner learner (single-leg) | free / starter | See a compact card for a single covered-call leg and immediately read the entry vs. current price and P&L; reach the defensive narrative quickly |
| Strategy researcher | pro / enterprise | Compare legs across a 3-leg strategy (e.g. broken-wing butterfly) side-by-side to evaluate relative risk levels before deciding which leg to roll |
| Admin | admin | Verify that the new card grid renders correctly for 1-leg, 2-leg, and 4-leg groups at desktop, tablet, and mobile viewport widths |

---

## 3. Functional Requirements

All requirements are frontend-only. No backend or API change is introduced. All fields used by the new card are already present on `PositionRisk`.

### Layout — card grid

1. Within `RightPanelDetail`, the current `flexDirection: 'column'` stack of `PositionCard` components must be replaced by a CSS grid container using `display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`. A `gap` of approximately 10–12px must separate adjacent cards. The grid must occupy the full available width of the right panel.

2. Each leg must render as one compact card in the grid. The cards must be arranged in the same order as today: sorted by `risk_level` within the group (red first, then yellow, then green), matching the existing sort in `RightPanelDetail`.

3. On a right panel wider than approximately 960px (4+ cards fitting), the Iron Condor's four legs must appear in a single row without wrapping. On a panel between approximately 480px and 960px, cards must reflow to two per row. On mobile (viewport width ≤ 768px, the existing `isMobile` breakpoint from `useWindowSize`), cards must stack in a single column.

### Compact leg card anatomy

4. The card must have a **3px solid top border** whose colour is determined by `riskColor(pos.risk_level)` — the same function already used for left borders on `PositionCard` and `RiskListRow`. The card background must be `riskBg(pos.risk_level)` and the card border must be `1px solid riskColor(pos.risk_level) at 0x44 opacity`, matching the existing `PositionCard` border pattern.

5. The card **header row** must display, left-to-right:
   - The symbol (`pos.symbol`) in bold
   - A SELL/BUY pill (`ActionBadge`, reused as-is)
   - A CALL/PUT pill (`TypeBadge`, reused as-is)
   - A quantity chip showing `×N` where N is `Math.abs(pos.quantity)` (e.g. `×2`)
   - A risk-status text (OK / WATCH / HIGH) right-aligned, coloured by `riskColor(pos.risk_level)`, matching the text content of `riskLabel` without the emoji prefix

6. The card **sub-line** below the header must display `$strike · Nd left` in light blue (`#7dd3fc`), where `strike` is `pos.strike` formatted with `fmt(pos.strike, 0)` and `N` is `pos.dte`. Example: `$490 · 18d left`.

7. The card **3-tile mini-metric row** must display exactly three tiles in a horizontal row:
   - **Qty** — `Math.abs(pos.quantity)`, plain colour (`C.text`)
   - **IV Rank** — `fmt(pos.iv_rank, 0)` coloured yellow (`C.yellow`) when `pos.iv_rank > 50` and red (`C.red`) when `pos.iv_rank > 70`, plain (`C.text`) otherwise. The tile must be **omitted entirely** (not rendered) when `pos.iv_rank` is `null` or `undefined`, so the remaining two tiles occupy the available width. When the IV Rank tile is omitted, the Qty and Cost/Collected tiles must still render.
   - **Cost** (for BUY legs, where `entry_action.toLowerCase() === 'buy'`) or **Collected** (for SELL legs, where `entry_action.toLowerCase() === 'sell'`). The value is `pos.avg_cost × Math.abs(pos.quantity) × 100`, formatted as a dollar amount rounded to the nearest dollar (e.g. `$210`). The label switches based on `entry_action`.

8. The card **bottom row** must display:
   - Left side: **ENTRY→NOW** price trace — `$avg_cost → $current_price` (e.g. `$2.10 → $1.30`) in muted colour (`C.muted`) for the labels and `C.text` for the values
   - Right side: **P&L** — `pos.pnl` formatted as `+$X.XX` or `−$X.XX`, coloured green (`C.green`) when `pos.pnl >= 0` and red (`C.red`) when negative

9. The card must have a **progress bar** at the very bottom. The bar must reuse the `MiniProgressBar` component that already exists for the left-panel list rows. It must be called with `worstLegPnlPct={pos.pnl_pct}` and `level={pos.risk_level}`. The bar colour logic (green when `pnl_pct >= 0`, risk colour otherwise) and the width formula (`min(abs(pnl_pct), 100)%`) are inherited from `MiniProgressBar` without change.

### Per-leg signals

10. Red and yellow signals (`pos.signals.filter(s => s.level === 'red' || s.level === 'yellow')`) must be accessible from the compact card. The architect must choose between two options and record the decision in `02-design.md`:
    - **Option A (inline):** Urgent signals render directly below the progress bar on the card, using the existing `SignalRow` component. This keeps the card self-contained but increases its height for positions with multiple signals.
    - **Option B (expandable):** The card has a chevron toggle. Tapping it reveals a signal list below the card within its grid cell. Green signals are accessible only in this expanded state.
    - In either option, green signals must not be shown by default; they must be reachable without navigating away from the right panel.

11. The `PositionCard` component must be retained in the file (not deleted). It continues to be used outside `RightPanelDetail` if any other render path calls it, and its removal would constitute an unintended scope expansion. The new compact card must be implemented as a new, separately named component (e.g. `LegCard`).

### Unchanged elements

12. The group header (`RightPanelHeader`) — strategy name, risk badge, combined P&L, leg count, nearest expiry, IV Rank, entry-date banner — must be unchanged.

13. The entry-date banner inside `RightPanelHeader` ("Trade entered DD Mon YYYY — N days ago") must be unchanged.

14. The `TradeNarrativeSection` collapsible (Trade Narrative accordion) must be unchanged in position, default state (collapsed), and content.

15. The `ActionPlanBox` — `DefensiveNarrativeSingle`, `DefensiveNarrativeGroup`, and `CloseInstructions` — must be unchanged in content, logic, and position (below the leg card grid). It must continue to be always visible without a toggle.

16. The left panel (date rail, `RiskListRow`, selection highlight, `MiniProgressBar`) must be entirely unchanged.

17. No change to `getPositionsRisk()`, `PositionRisk`, `RiskSignal`, or any backend route.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Four-Leg Iron Condor Scannable at a Glance

**As an** active paper trader with an open Iron Condor (4 legs), **I want** all four legs shown side-by-side in compact cards **so that** I can see which leg is under pressure without scrolling before I reach the action plan.

**Acceptance Criteria:**
- [ ] AC1: Open the Risk Monitor with an Iron Condor selected. On a desktop viewport (≥ 1200px wide), all four leg cards appear in a single row. None are hidden or stacked. A human can read symbol, SELL/BUY pill, CALL/PUT pill, strike/DTE sub-line, P&L, and the top-border risk colour on each card without scrolling.
- [ ] AC2: The action-plan box (Financial Reality, Paths Forward, Summary Box) is visible after one scroll gesture (≤ 1 full viewport height below the card grid). On a wide panel where all four cards fit in one row, the action plan must be visible without any scrolling if no signals are expanded.
- [ ] AC3: The highest-risk leg has the reddest top border. All four cards display their `risk_level` top-border colour independently — a green leg and a red leg in the same group show different top border colours.
- [ ] AC4: Clicking a different strategy group in the left panel replaces the leg cards with the new group's legs. The card count matches the leg count of the newly selected group.

---

### Story 2 — Compact Card Shows Decision-Relevant Data

**As a** paper trader reviewing a single leg, **I want** the compact card to tell me the direction, strike, DTE, what I paid or collected, where the price is now, and my P&L **so that** I have the information I need to decide whether to hold, roll, or close without opening a separate detail view.

**Acceptance Criteria:**
- [ ] AC1: For a SELL leg with `avg_cost = 2.10`, `quantity = -1`, `current_price = 1.30`, `strike = 490`, `dte = 18`, the card displays: SELL pill, `$490 · 18d left` sub-line, Collected tile showing `$210`, ENTRY→NOW showing `$2.10 → $1.30`, and P&L coloured green (credit has decayed in our favour).
- [ ] AC2: For a BUY leg with `avg_cost = 1.50`, `quantity = 1`, `current_price = 0.80`, `pnl = -70`, the card displays: BUY pill, Cost tile showing `$150`, P&L showing `−$70.00` in red.
- [ ] AC3: The `×N` quantity chip shows the absolute value of quantity: a position with `quantity = -2` shows `×2`, not `×-2`.
- [ ] AC4: The ENTRY→NOW section shows both prices as formatted dollar amounts with two decimal places (e.g. `$2.10 → $1.30`), not rounded to whole dollars.

---

### Story 3 — IV Rank Tile Handles Null Gracefully

**As a** paper trader on a position where IV Rank could not be computed (e.g. a thinly-traded name with no historical volatility data), **I want** the card to render correctly without the IV Rank tile **so that** the layout does not show a blank tile or crash.

**Acceptance Criteria:**
- [ ] AC1: For a leg with `iv_rank = null`, the 3-tile row renders only the Qty tile and the Cost/Collected tile. No empty tile placeholder is shown. The two remaining tiles expand to fill the available row width.
- [ ] AC2: For a leg with `iv_rank = 35`, the IV Rank tile renders in `C.text` (plain, not coloured). For `iv_rank = 55`, the tile renders in yellow (`#eab308`). For `iv_rank = 75`, the tile renders in red (`#ef4444`).
- [ ] AC3: When `iv_rank` transitions from null to a real value between the 5-minute silent refreshes, the IV Rank tile appears on the next render without a page reload.

---

### Story 4 — Per-Leg Signals Reachable

**As a** paper trader, **I want** to be able to read the risk signals for any individual leg **so that** I understand why it is flagged red or yellow, even in compact card mode.

**Acceptance Criteria:**
- [ ] AC1 (applies to whichever option the architect chooses): For a leg with at least one red or yellow signal, a human can read the full signal message text within 10 seconds of selecting the strategy group, without navigating away from the right panel.
- [ ] AC2: A leg with zero red or yellow signals (all green) does not display any signal text by default. The compact card does not show an empty signal area.
- [ ] AC3: Green signals are accessible for any leg (via an expand action if Option B is chosen, or always visible if Option A is chosen), without requiring a separate navigation action or page reload.
- [ ] AC4: Signal text is word-for-word identical to what the existing `SignalRow` component renders for the same signal objects. No signal text is changed by this feature.

---

### Story 5 — Responsive Reflow on Narrower Panels and Mobile

**As a** paper trader on a tablet or mobile device, **I want** the compact leg cards to reflow gracefully to fewer columns **so that** each card remains readable at smaller widths.

**Acceptance Criteria:**
- [ ] AC1: At a viewport width of 768px or less (`isMobile === true` per `useWindowSize`), all leg cards stack in a single column. Each card occupies the full available panel width. A 4-leg Iron Condor produces four stacked cards that scroll vertically.
- [ ] AC2: At a viewport width between 480px and 768px (tablet range), cards reflow to two per row. Symbol, pills, and sub-line remain readable and do not overflow the card boundary.
- [ ] AC3: At a viewport width below 360px (very small phone), each card still renders without horizontal scrollbar or text overflow. Long strategy names in the header truncate with ellipsis.
- [ ] AC4: On mobile, the action-plan box appears below the last leg card and is reachable by scrolling. It does not require a separate tap to reveal.

---

### Story 6 — Unchanged Elements Remain Intact

**As a** platform operator, **I want** to confirm that every element of the right panel that is not being changed continues to render correctly **so that** the refinement does not introduce a regression.

**Acceptance Criteria:**
- [ ] AC1: The `RightPanelHeader` (strategy name, risk badge, combined P&L, leg count, nearest expiry, IV Rank, entry-date banner) is pixel-identical before and after this change for the same position data.
- [ ] AC2: The `TradeNarrativeSection` is collapsed by default. Clicking "Trade Narrative" expands it. Clicking again collapses it. Content is unchanged.
- [ ] AC3: The `ActionPlanBox` is always visible below the leg card grid without any toggle. For a losing multi-leg group, Financial Reality, Paths Forward, Summary Box, and Close Instructions (for a single leg) all appear. Content is word-for-word unchanged.
- [ ] AC4: The left panel (date rail, list rows, selection highlight, mini progress bar) is visually unchanged. Selecting a row in the left panel still loads the compact card grid in the right panel.
- [ ] AC5: The 5-minute silent refresh still fires. After a refresh, the selected group's compact cards update with new `current_price` and `pnl` values without losing the selection state.

---

## 5. Out of Scope

- Any backend route change, database migration, or change to the `PositionRisk` TypeScript interface.
- Changes to risk-signal calculation logic (`_assess_risk` in `backend/routes/positions.py`).
- Changes to defensive narrative content (Financial Reality, Paths Forward, Summary Box, Close Instructions). Text is moved, not altered.
- The left panel (date rail, `RiskListRow`, selection logic, `MiniProgressBar` on list rows).
- The `RightPanelHeader` component.
- The `TradeNarrativeSection` component.
- The `ActionPlanBox` component and its children.
- The AI Risk Overview section (below the split panel).
- The portfolio summary stat chips in the header strip.
- Any new filter, sort toggle, pin, or search on the right panel.
- Any change to the `PositionCard` component outside of its use in `RightPanelDetail`. If `PositionCard` is currently called from any other render path, it must remain unchanged for that path.
- Deletion of the `PositionCard` component from the file.
- Changes to the Order Entry sidebar, Positions tab, PnL chart, Strategy Scanner, or Options Chain.
- Any new API endpoint or modification to `getPositionsRisk()`.
- Subscription tier gate changes. The `risk_monitor` entitlement gate is unchanged.
- The `ProgressBar` component (used in the existing `PositionCard`). The compact card uses `MiniProgressBar`, not `ProgressBar`.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| Single-leg position (e.g. a naked put) selected | Grid renders one card occupying `minmax(240px, 1fr)` — it does not stretch to full panel width unless `auto-fill` computes only 1 column. The card width is bounded by the grid column definition, not forced to 100%. Architect to confirm preferred single-card width behaviour (cap at ~320px or let it fill). |
| `iv_rank` is null for all legs in a group | All cards omit the IV Rank tile. The 2-tile row (Qty + Cost/Collected) renders without layout shift. |
| `iv_rank` is null for some legs but present for others | Cards with null IV Rank render 2 tiles; cards with a value render 3 tiles. The grid must tolerate cards of slightly different heights without breaking alignment. |
| `entry_action` is null (position predates the `entry_action` field) | Fall back to `pos.quantity > 0 ? 'buy' : 'sell'` — the same fallback used in the existing `PositionCard` and `ActionPlanBox`. The SELL/BUY pill and Cost/Collected label derive from this fallback. |
| Quantity chip vs. Qty tile redundancy | `×N` in the header chip and `Qty` in the 3-tile row both show `Math.abs(pos.quantity)`. This is a deliberate design choice from the approved HTML preview; the architect may note it as a future simplification but must not remove either element in v1 without explicit product sign-off. See Open Questions OQ-1. |
| Leg with `pnl_pct` exactly 0 | `MiniProgressBar` renders a zero-width bar (green colour, 0% width). This matches the existing `MiniProgressBar` behaviour on the left panel. |
| Leg with `pnl_pct > 100` (very deep in-the-money long) | `MiniProgressBar` clamps to 100% width. This is the existing `MiniProgressBar` behaviour (`Math.min(Math.abs(worstLegPnlPct), 100)`). |
| Leg with `pnl_pct < -100` (total loss) | `MiniProgressBar` clamps to 100% width in the risk colour. Matches existing behaviour. |
| No open positions | The split panel does not render (existing "No open positions" empty state). No change to this behaviour. |
| Market data unavailable (yfinance failure) | `current_price` falls back to Black-Scholes or `avg_cost`. The ENTRY→NOW row and P&L display whatever value the API returns. IV Rank tile is omitted if `iv_rank` is null from fallback. No card crash. |
| 4-leg group on very narrow right panel (~300px) | `auto-fill` with `minmax(240px, 1fr)` produces a 1-column layout at ~300px. Cards stack vertically. This is correct behaviour; no minimum-column count is enforced. |
| Mobile accordion — card grid inside the expanded inline section | The accordion expands an inline `RightPanelDetail` block. Inside that block, `isMobile === true` applies, so the leg card grid renders in a single column. This is the correct responsive behaviour for the mobile accordion path. |

---

## 7. External Dependencies

| Service | Usage in This Feature | Quota / Risk |
|---------|----------------------|--------------|
| Supabase | Not affected. No new query, no schema change. | None. |
| yfinance | Not affected. `getPositionsRisk()` is unchanged. | None. |
| Claude API | Not affected. `aiRiskSummary` is unchanged. | None. |
| Reddit PRAW | Not used by Risk Monitor. Not affected. | None. |

This feature has zero external dependency risk. All data required by the compact leg card is already returned by the existing `GET /api/positions/risk` endpoint.

---

## 8. Subscription Tier Impact

No tier gate is changed. The Risk Monitor is already gated on the `risk_monitor` feature entitlement in `EntitlementFeatures`. The compact leg card layout applies equally to all tiers that have access.

| Tier | Behaviour |
|------|-----------|
| free | Risk Monitor not accessible (existing gate unchanged). |
| starter | Risk Monitor accessible. Compact leg card grid replaces stacked `PositionCard` layout in the right panel. |
| pro | Risk Monitor accessible. Same compact leg card grid. |
| enterprise | Risk Monitor accessible. Same compact leg card grid. |

---

## 9. Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| OQ-1 | The `×N` quantity chip in the header row and the `Qty` tile in the 3-tile row both show `Math.abs(pos.quantity)`. The approved HTML preview includes both. Should both remain in v1, or should one be dropped to reduce visual noise? The quantity chip in the header provides quick scanning (you see `×2` before reading the tiles); the Qty tile provides consistency with the 3-tile pattern. | Product | If both stay, no action needed. If one is dropped, the spec and HTML preview must be revised before implementation begins. Decision should be recorded in `02-design.md`. |
| OQ-2 | Per-leg signals: Option A (inline below progress bar) vs. Option B (expandable chevron toggle). Option A keeps the card self-contained and is simpler to implement. Option B keeps the card height consistent but adds an interaction. The approved HTML preview does not include signals in the compact card layout, so neither option introduces a regression — signals are currently visible on the `PositionCard` without a toggle. The architect must pick one option and specify it in `02-design.md`. | Architect | If unresolved, the developer defaults to Option A (inline). This is the lower-complexity path and is acceptable for v1. |
| OQ-3 | Single-card width on wide panels: when only one leg exists (e.g. a covered call), `auto-fill` with `minmax(240px, 1fr)` allows the card to expand to fill the full right panel width (~700px+). This may look oversized. Should a `max-width` be applied to individual cards (e.g. `max-width: 320px`)? Or should the grid container have a `max-width`? The existing `PositionCard` is always full-width, so any cap would be a visible change for single-leg positions. | Architect | If not specified, the developer will let the card fill the column. The architect should make the call and document it. |
| OQ-4 | The approved design says the `×N` chip uses a distinct chip style (different from the SELL/BUY and CALL/PUT pills). Is the chip style defined precisely, or is it a design-time decision for the frontend developer to match the spirit of the HTML preview? The BA spec intentionally defers styling details (colours, border-radius, font sizes) to the architect and developer. Confirm this is acceptable. | Architect / Frontend | Low risk. Styling is not load-bearing for acceptance criteria. |

---

## 10. Product Owner Annotations

_Filled in by the product-owner agent. All open question decisions are binding. No further debate on these points._

---

### Open Question Resolutions (binding)

**OQ-1 — Quantity chip redundancy: KEEP BOTH.**

The user explicitly requested the Qty tile because it was missing, then approved the HTML preview that contains both the `×N` header chip and the Qty tile. Both stay in v1. The `×N` chip serves a fast-scan role (visible before reading the tile row); the Qty tile serves the labelled-metric pattern that makes the card consistent with itself. These are complementary, not redundant in context. If a future usability signal shows users find the duplication confusing, the `×N` header chip is the one to drop — the Qty tile must survive because it was the explicit request. The architect must not remove either element in v1.

**OQ-2 — Per-leg signals placement: OPTION C — signals remain in the group-level action plan only.**

The approved HTML preview shows no signal rows on the compact card. That preview is not up for debate. The action plan (`ActionPlanBox`) surfaces urgent signals at the group level via `DefensiveNarrativeSingle` and `DefensiveNarrativeGroup`; per-leg signal text is already woven into the defensive narrative content. Option C satisfies Story 4 AC1 (urgent signals readable within 10 seconds of selecting the group, via the action plan which is always visible) and AC4 (signal text is unchanged). Option A would increase card height and defeat the visual compactness that is the point of this feature. Option B adds an interaction mechanism that the user never asked for. Option C is the decision. The spec requirement in FR-10 that gives the architect a choice between A and B is superseded by this PO decision: the architect must implement C, and must confirm in `02-design.md` that the action plan already surfaces per-leg urgent signal text at the group level.

**OQ-3 — Single-card max-width on wide panels: CAP AT 360px.**

A lone card stretching to fill a 700px+ right panel looks structurally broken and signals to the user that something is missing. Cap individual card max-width at 360px. The grid container itself remains full-width. For a 1-leg position the card aligns left within the grid (standard grid flow, no centering needed). This is a visible change from the current `PositionCard` (which is always full-width), but the current `PositionCard` is being replaced in this render path; there is no regression concern. The architect must document the CSS approach (card-level `max-width: 360px`, not a grid-container `max-width`) in `02-design.md`.

**OQ-4 — Chip styling: DEFERRED TO FRONTEND.**

Chip styling is not load-bearing for any acceptance criterion. Acceptance criteria test content, not pixels. The frontend developer must match the spirit of the approved HTML preview. No further product specification is needed.

---

### Priority Scores

| Story | Priority | Rationale |
|-------|----------|-----------|
| Story 1 — Four-Leg Iron Condor Scannable at a Glance | 1 — Must Have | This is the entire purpose of the feature. Without this, the feature does not exist. AC2 (action plan visible sooner) directly advances the core value loop by making the defensive narrative more accessible. |
| Story 2 — Compact Card Shows Decision-Relevant Data | 1 — Must Have | A compact card that does not surface the decision-relevant data (direction, strike, DTE, cost/collected, entry vs. now, P&L) fails the feature's stated purpose. These fields are already available on `PositionRisk`; not showing them is never acceptable. |
| Story 3 — IV Rank Tile Handles Null Gracefully | 1 — Must Have | Null IV rank will occur in production on thinly-traded names. A card that crashes or renders a broken layout on real data is not shippable. This is a correctness requirement, not a polish story. |
| Story 4 — Per-Leg Signals Reachable | 1 — Must Have | Risk signals are the mechanism by which the app tells the user a position is in trouble. If urgent signals become invisible or inaccessible when this feature ships, the risk-monitoring value proposition is degraded. Story 4 enforces that signals remain accessible. The PO decision on OQ-2 (Option C) simplifies implementation: no new component, signals stay in the action plan. |
| Story 5 — Responsive Reflow on Narrower Panels and Mobile | 1 — Must Have | The existing breakpoint system (`isMobile` from `useWindowSize`) is already in production and the mobile accordion path is established from the prior risk-monitor-layout feature. A grid that breaks at mobile widths is a regression, not a nice-to-have. Auto-fill CSS handles most of this without custom code; the implementation cost is low and the failure cost is high. |
| Story 6 — Unchanged Elements Remain Intact | 1 — Must Have | This is a regression guard for every element outside the leg card grid. The defensive narrative, action plan, group header, and left panel are the features users already have. Shipping something that breaks them is not acceptable under any circumstance. |

---

### MVP Boundary

**All 6 stories ship in v1.** There is nothing to defer. Every story is either the primary feature (Stories 1–2), a correctness requirement (Story 3), a value-preservation requirement (Story 4), a platform-integrity requirement (Story 5), or a regression guard (Story 6). None are "nice to have" additions.

**Deferred to backlog:** None from this spec. Post-launch candidates (not blocking this release):
- Dropping the `×N` header chip if user research shows it reads as noise alongside the Qty tile (OQ-1 future action).
- A visual indicator on the compact card pointing the user toward the action plan (e.g. a subtle "see action plan below" cue) — not needed because the action plan is always visible, but may be worth exploring if usability testing shows users miss it.

---

### Tier Gate Confirmation

No tier gate changes. The `risk_monitor` entitlement already controls access. Starter, pro, and enterprise users see the new compact card grid identically. Free users do not have access to the Risk Monitor and are unaffected. This feature neither creates a new paywall nor allows free-tier users to receive pro-tier value. Confirmed.

---

### Cannibalisation Check

This change makes the `ActionPlanBox` (which contains the defensive narrative) more accessible by reducing the vertical scroll required to reach it. It does not replace, bypass, or abbreviate the narrative. The 7-section narrative (`TradeNarrativeSection`) remains collapsed by default and unchanged in content. The compact card shows metrics only, not narrative. No cannibalisation of the core differentiator.

---

### PO Gate Decision

GO — proceed to Gate 3 (Architecture Design).

The solution architect may begin. The design doc must address: (1) confirmation that Option C signal placement is satisfied by the existing `ActionPlanBox` content without any new mechanism; (2) card-level `max-width: 360px` CSS approach for OQ-3; (3) retention of both the `×N` header chip and the Qty tile per OQ-1; (4) `LegCard` as a new separately named component, `PositionCard` retained in file; (5) `MiniProgressBar` reuse with `worstLegPnlPct={pos.pnl_pct}` as specified.

_Approved by:_ product-owner &nbsp;&nbsp; _Date:_ 27Jun2026

# Feature Spec — Strategy Methodology Page

**Date:** 20Jun2026
**Author:** Business Analyst
**Status:** Draft

---

## 1. Summary

Users of the Strategy Scanner tab see scan results showing "8 strategies available" and "3 condition matches" but have no in-app explanation of what those numbers mean or how the system arrived at them. This creates a trust gap: users accept or reject strategy recommendations without understanding the logic behind them, which is a material problem for an educational paper-trading platform whose stated purpose is to teach options trading.

This feature adds a dedicated **Strategy Methodology** page that explains, in plain English, the four inputs that drive strategy selection (IV Environment, Directional Bias, Earnings Awareness, and Options Flow), how those inputs gate and rank the 31-strategy catalog, and what the columns in the scan results table actually mean. A contextual link placed in the Strategy Scanner tab ("Learn how strategies are selected →") provides a direct entry point from the moment a user is confronted with results they may not understand.

No backend changes are required. All content is static educational text rendered in a new React component.

---

## 2. User Personas

| Persona | Tier | Job-to-be-done |
|---------|------|----------------|
| New options learner | free / starter | Understand why the scanner returned a specific set of strategies for a ticker so they can trust the recommendation and learn from it |
| Intermediate self-directed trader | starter / pro | Verify that the system's logic aligns with how they already think about IV environment and bias, before acting on a paper trade |
| Curious explorer | any authenticated tier | Browse how the 31-strategy catalog is organised and filtered without having to run a scan first |
| Admin | enterprise (admin role) | Confirm the methodology page accurately reflects the current engine behaviour when reviewing user-facing content |

---

## 3. Functional Requirements

1. A new React component (`StrategyMethodologyPage`) must render a scrollable, structured educational page covering all four strategy-selection inputs and the two-gate filtering logic.

2. The page must be accessible to every authenticated user regardless of subscription tier. No tier gate, no feature flag, no lock icon.

3. The page must be reachable via a dedicated tab key (`methodology`) added to the tab type union in `App.tsx`. The tab must appear in the Options Desk tab bar, visible to all authenticated users, with label "Methodology" (desktop) and "How" (mobile short label).

4. The Strategy Scanner tab (`StrategyScanner.tsx`) must display a "Learn how strategies are selected →" link that, when clicked, switches the active tab to `methodology`. The link must be visible at all times within the Scanner tab — not only after a scan has completed.

5. The link described in FR4 must be placed in the header row of the watchlist editor card, so it is the first thing a user reads when they open the Scanner tab, before they trigger a scan.

6. The Methodology page must explain Input 1 (IV Environment) with the following content, testable by inspection:
   - That the system downloads one year of daily closing prices.
   - That it computes a 30-day rolling Historical Volatility (HV), annualised.
   - That it records the 52-week high and low of that HV series.
   - The IV Rank formula: `(current HV − 52wk low) / (52wk high − 52wk low) × 100`.
   - The three classification thresholds: IVR > 50 = HIGH, IVR < 30 = LOW, 30–50 = MEDIUM.
   - The practical meaning of each classification for a trader choosing between selling and buying premium.
   - A note that the system uses HV as a proxy because yfinance does not store historical implied volatility.

7. The Methodology page must explain Input 2 (Directional Bias) with the following content, testable by inspection:
   - That the system uses three months of daily price history.
   - The two technical indicators used: SMA-20/SMA-50 crossover and RSI(14).
   - The SMA signal rules: price > SMA20 > SMA50 → BULLISH; price < SMA20 < SMA50 → BEARISH; otherwise NEUTRAL.
   - The RSI signal rules: RSI > 60 → BULLISH; RSI < 40 → BEARISH; 40–60 → NEUTRAL.
   - How the two signals are combined into the five output states: BULLISH (STRONG), BEARISH (STRONG), NEUTRAL_BULLISH (MODERATE), NEUTRAL_BEARISH (MODERATE), NEUTRAL (MODERATE).
   - The combination rule: both agree on the same non-neutral direction → that direction at STRONG; one signal is directional and the other is neutral → NEUTRAL_BULLISH or NEUTRAL_BEARISH at MODERATE; signals contradict → NEUTRAL at MODERATE.

8. The Methodology page must explain Input 3 (Earnings Awareness) with the following content, testable by inspection:
   - That the system pulls the next earnings date from the yfinance calendar.
   - The definition of "earnings within the DTE window".
   - The two expiry-adjustment rules: premium sellers have expiry moved to the last available date BEFORE earnings (to avoid IV crush); premium buyers have expiry moved to the first date AFTER earnings (to capture the post-earnings move).
   - That earnings awareness adjusts the expiry of selected contracts, not the strategy list itself.

9. The Methodology page must explain Input 4 (Options Flow) with the following content, testable by inspection:
   - That flow is derived from the loaded options chain, not from an external flow feed.
   - The put/call ratio (PCR) thresholds: PCR < 0.6 = strongly bullish; 0.6–0.85 = bullish; 0.85–1.1 = neutral; 1.1–1.5 = bearish; > 1.5 = strongly bearish.
   - The definition of an "unusual contract": volume > open interest AND volume > 500.
   - That options flow feeds the AI narrative but does not filter or rank strategies.

10. The Methodology page must explain the two-gate strategy selection process with the following content, testable by inspection:
    - Gate 1 (hard filter): each of the 31 strategies carries an `iv_environment` tag; only strategies whose tag includes the current IV class pass through and are counted.
    - Gate 2 (soft match): all IV-passing strategies are shown, but a `direction_condition_match` flag is set based on the bias; "condition matches" in the scan results table reflects how many IV-passing strategies also match the current directional bias.
    - That earnings adjusts the expiry for each trade leg, not the strategy count.
    - That options flow does not affect which strategies appear, only the narrative text.
    - What the "Strategies Available" and "Condition Matches" columns in the scan results table mean in terms of these two gates.

11. The Methodology page must display the 31-strategy catalog grouped by the four direction categories (Bullish, Bearish, Neutral/Income, Omnidirectional), listing each strategy's name and its IV environment tag(s). The grouping and IV tags must match the current `strategy_engine.py` catalog.

12. All content on the Methodology page must be static. The page must render without making any API calls and must not require a market data fetch, a ticker symbol, or a user-specific data load.

13. The page must render correctly at all three responsive breakpoints supported by the app: desktop (>= 1024px), tablet (768–1023px), and mobile (< 768px).

14. On mobile, section headings must remain readable without horizontal scrolling; the strike-selection formula in FR6 and the PCR threshold table in FR9 must wrap gracefully or scroll horizontally within their container rather than overflow the viewport.

---

## 4. User Stories & Acceptance Criteria

### Story 1 — Methodology Tab Navigation

**As a** new options learner on any tier, **I want** a dedicated tab in the app where I can read how the strategy engine works **so that** I can understand the recommendations before I decide to paper-trade one.

**Acceptance Criteria:**
- [ ] AC1.1: A "Methodology" tab (desktop label) / "How" tab (mobile label) is visible in the Options Desk tab bar for every authenticated user on every subscription tier.
- [ ] AC1.2: Clicking the tab renders the `StrategyMethodologyPage` component in the main content area without triggering any API calls (verify with browser DevTools Network tab — no outbound requests on tab load).
- [ ] AC1.3: The Methodology tab is not locked (no padlock icon, no `LockedTabPlaceholder`, no upgrade prompt).
- [ ] AC1.4: Refreshing the browser with the Methodology tab active does not cause an error; the tab renders its content as expected.

### Story 2 — Contextual Link from the Scanner Tab

**As an** intermediate self-directed trader who just ran a scan and sees "8 strategies, 3 condition matches," **I want** a link right on the Scanner page that takes me to the methodology explanation **so that** I do not have to hunt for context in a separate guide.

**Acceptance Criteria:**
- [ ] AC2.1: The text "Learn how strategies are selected →" (exact string) appears in the Strategy Scanner tab header area, visible without scrolling, on desktop at 1280px viewport width.
- [ ] AC2.2: The link is visible before a scan has been run (i.e., on initial load of the Scanner tab with no results showing).
- [ ] AC2.3: Clicking the link navigates the user to the Methodology tab (the active tab changes to `methodology` and the Methodology page content is rendered).
- [ ] AC2.4: The link is visible on mobile (< 768px) without requiring horizontal scroll.
- [ ] AC2.5: The link is styled distinctly from body text — it must use the app accent colour (`#7c6af7`) or an underline, so it is recognisable as a clickable element.

### Story 3 — IV Environment Explanation

**As a** new options learner, **I want** the Methodology page to explain how IV Environment is calculated and what HIGH/MEDIUM/LOW means **so that** I understand why the system is recommending premium-selling or premium-buying strategies.

**Acceptance Criteria:**
- [ ] AC3.1: The page contains a section titled "Input 1 — IV Environment" (or equivalent heading).
- [ ] AC3.2: The section states the IVR formula using the words "52-week high," "52-week low," and "Historical Volatility" or their abbreviations.
- [ ] AC3.3: The section states all three classification thresholds (IVR > 50 = HIGH, IVR < 30 = LOW, 30–50 = MEDIUM) in a visually distinct format (table, labelled pills, or definition list — not buried in prose).
- [ ] AC3.4: The section includes a note that HV is used as a proxy for IV history because yfinance does not store historical implied volatility data.
- [ ] AC3.5: The section explains the practical trading implication of each class (e.g., HIGH IV → consider selling premium; LOW IV → consider buying premium).

### Story 4 — Directional Bias Explanation

**As a** new options learner, **I want** the Methodology page to explain how the five bias outputs are produced from SMA and RSI signals **so that** I understand what NEUTRAL_BULLISH means when I see it in my scan results.

**Acceptance Criteria:**
- [ ] AC4.1: The page contains a section titled "Input 2 — Directional Bias" (or equivalent heading).
- [ ] AC4.2: The section states both indicators used (SMA-20/SMA-50 and RSI-14) and the look-back period (3 months of daily data).
- [ ] AC4.3: The section lists the SMA signal rules and RSI signal rules in a format that a tester can verify against the actual thresholds (e.g., a table or definition list with exact numbers).
- [ ] AC4.4: The section explains the five output states and describes the combination logic (both agree → STRONG; one directional, one neutral → MODERATE; contradictory → NEUTRAL MODERATE).
- [ ] AC4.5: All five output states visible in the scan results table (BULLISH, BEARISH, NEUTRAL, NEUTRAL_BULLISH, NEUTRAL_BEARISH) are named and explained.

### Story 5 — Earnings Awareness Explanation

**As an** intermediate trader, **I want** the Methodology page to explain the earnings expiry-adjustment logic **so that** I understand why the system picked a specific expiry for my recommended trade when earnings are approaching.

**Acceptance Criteria:**
- [ ] AC5.1: The page contains a section titled "Input 3 — Earnings Awareness" (or equivalent heading).
- [ ] AC5.2: The section states that earnings data is pulled from yfinance and describes the "within the DTE window" trigger condition.
- [ ] AC5.3: The section states both expiry-adjustment rules: the premium-seller rule (move expiry to last date BEFORE earnings) and the premium-buyer rule (move expiry to first date AFTER earnings).
- [ ] AC5.4: The section explicitly states that earnings awareness affects expiry selection, not which strategies appear in the list.

### Story 6 — Options Flow Explanation

**As an** intermediate trader, **I want** the Methodology page to explain how options flow is measured and where it appears in the app **so that** I know whether flow data is filtering my results or just informing the narrative text.

**Acceptance Criteria:**
- [ ] AC6.1: The page contains a section titled "Input 4 — Options Flow" (or equivalent heading).
- [ ] AC6.2: The section states all five PCR threshold bands and their flow bias labels in a visually distinct format (table or definition list with exact numbers).
- [ ] AC6.3: The section defines an "unusual contract" (volume > open interest AND volume > 500).
- [ ] AC6.4: The section explicitly states that options flow does not filter or rank strategies and only appears in the AI narrative.

### Story 7 — Two-Gate Selection Logic Explanation

**As a** new options learner, **I want** the Methodology page to explain what "8 strategies available / 3 condition matches" means in concrete terms **so that** I can interpret my scan results without confusion.

**Acceptance Criteria:**
- [ ] AC7.1: The page contains a section explaining the two-gate selection process.
- [ ] AC7.2: The section defines Gate 1 (IV hard filter) and explicitly uses the term "hard filter" or equivalent, explaining that only IV-matched strategies are counted in "Strategies Available."
- [ ] AC7.3: The section defines Gate 2 (direction soft match) and explains that "Condition Matches" counts how many IV-passing strategies also match the current directional bias.
- [ ] AC7.4: The section states that earnings and options flow do not change the strategy count shown in scan results.
- [ ] AC7.5: A human tester can read this section in under 2 minutes and correctly answer: "If a symbol has IV Env = HIGH and Bias = BULLISH, which strategies would appear and which would get a condition match?" without additional research.

### Story 8 — Strategy Catalog Reference

**As a** curious explorer, **I want** to see the full 31-strategy catalog on the Methodology page, grouped by direction category and annotated with IV environment tags **so that** I can browse what strategies exist before running a scan.

**Acceptance Criteria:**
- [ ] AC8.1: The page includes a strategy catalog section listing all 31 strategies.
- [ ] AC8.2: Strategies are grouped into four direction categories: Bullish, Bearish, Neutral/Income, and Omnidirectional.
- [ ] AC8.3: Each strategy entry shows its name and its IV environment tag(s) (HIGH, MEDIUM, LOW, or combinations).
- [ ] AC8.4: The catalog section is visually separated from the explanatory sections (e.g., different heading level, different background, or a horizontal rule).
- [ ] AC8.5: A tester can count the entries and confirm the total equals 31.

---

## 5. Out of Scope

- No backend API endpoints will be created or modified for this feature. All content is static.
- No changes to the strategy engine, IV analysis, or market context services.
- Interactive calculators or live IV rank lookups on the Methodology page are not included. Content is read-only.
- Exporting or printing the Methodology page as a PDF is not included.
- Localisation or multi-language support is not included.
- The Methodology page will not be linked from the User Guide tab (`guide`). Cross-referencing between tabs is out of scope for this iteration.
- The Methodology page will not render a "try it now" CTA that triggers a scan. Navigation to the Scanner tab from the Methodology page is not included.
- Changes to the `UserGuide.tsx` component are not included. The User Guide is a separate piece of content.
- Displaying real-time IV rank or live strategy counts on the Methodology page is not included.
- Admin-only content or role-gated sections within the Methodology page are not included.

---

## 6. Edge Cases & Failure Modes

| Scenario | Expected Behaviour |
|----------|-------------------|
| Market data unavailable | No impact. The Methodology page makes zero API calls and renders its static content regardless of market data availability. |
| Tier limit reached (scan limit exhausted) | No impact. The Methodology tab and its link from the Scanner are not affected by scan quotas. The link remains visible even when the scan button is disabled. |
| AI quota exhausted / AI features disabled | No impact. The Methodology page contains no AI-generated content and is not gated by the `ai_features_enabled` config flag. |
| Empty watchlist / no positions | No impact. The page does not depend on watchlist state or portfolio data. |
| Admin user | Admin users see the Methodology tab and its content identically to non-admin users. No additional admin sections are shown. |
| User accesses the Scanner tab and immediately clicks the link before the watchlist sync resolves | The link navigates to the Methodology tab immediately. No dependency on watchlist load state. |
| Mobile viewport (< 768px) with a long formula or PCR table | The formula block and PCR table must wrap or scroll horizontally within a constrained inner container. They must not cause the page body to overflow horizontally. |
| Strategy catalog count discrepancy (engine adds or removes a strategy) | This is a manual maintenance risk. The catalog displayed on the Methodology page must be kept in sync with `strategy_engine.py` by the developer implementing the feature. The architect must document a note to that effect in the design document. |

---

## 7. External Dependencies

| Service | Usage | Quota / Risk |
|---------|-------|-------------|
| Market Data App | Not used by this feature | None |
| yfinance | Not used by this feature | None |
| Supabase | Auth only — user must be authenticated to view the tab; no DB reads/writes from the Methodology page | None beyond existing auth flow |
| Claude API | Not used by this feature | None |
| Reddit PRAW | Not used by this feature | None |

The only runtime dependency is the Supabase authentication gate that already guards all tabs. If the user is not authenticated, they see the login page and the Methodology tab is never rendered.

---

## 8. Subscription Tier Impact

| Tier | Behaviour |
|------|----------|
| free | Full access to the Methodology tab and the link in the Scanner. No restrictions. |
| starter | Full access. No restrictions. |
| pro | Full access. No restrictions. |
| enterprise | Full access. No restrictions. |

This feature has no revenue implications. It is a trust-building educational component that benefits all tiers equally. There are no per-tier quotas, feature flags, or locked states to implement.

---

## 9. Impacted Existing Components

The following existing components require modification. No new backend routes are created.

| Component | File | Change Required |
|-----------|------|-----------------|
| `App.tsx` | `frontend/src/App.tsx` | Add `'methodology'` to the `Tab` type union. Add a new entry to the `tabs` array with `key: 'methodology'`, `label: 'Methodology'`, `short: 'How'`, no `locked` flag. Add a render block for `activeTab === 'methodology'` in the tab content area. Accept and forward a `onNavigate` prop or a tab-switch callback to allow `StrategyScanner` to change the active tab to `'methodology'`. |
| `StrategyScanner.tsx` | `frontend/src/components/StrategyScanner.tsx` | Add the "Learn how strategies are selected →" link to the watchlist editor card header row. The link must call the tab-switch callback received as a prop (or a callback passed down from `App.tsx`) with the value `'methodology'`. |

The following existing components are read for reference but require no changes:

| Component | File | Reason Referenced |
|-----------|------|-------------------|
| `UserGuide.tsx` | `frontend/src/components/UserGuide.tsx` | Design pattern reference for `Section`, `P`, `Note`, `Term`, and `Sub` styled sub-components used in educational content pages. The Methodology page should use the same visual language. |
| `StrategyDetail.tsx` | `frontend/src/components/StrategyDetail.tsx` | Reference for how IV environment badges and bias badges are currently rendered, so the Methodology page can reuse the same colour semantics. |

---

## 10. Product Owner Annotations

_Filled in by the product-owner agent._

**Priority scores:**

| Story | Priority (1=must/2=should/3=nice) | Notes |
|-------|-----------------------------------|-------|
| Story 1 — Methodology Tab Navigation | | |
| Story 2 — Contextual Link from Scanner | | |
| Story 3 — IV Environment Explanation | | |
| Story 4 — Directional Bias Explanation | | |
| Story 5 — Earnings Awareness Explanation | | |
| Story 6 — Options Flow Explanation | | |
| Story 7 — Two-Gate Selection Logic | | |
| Story 8 — Strategy Catalog Reference | | |

**MVP boundary:** [Stories in v1]

**Deferred to backlog:** [Stories deferred]

**PO gate decision:** ☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

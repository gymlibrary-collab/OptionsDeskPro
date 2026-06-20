# Test Report — Strategy Methodology Page & Catalog

**Feature:** strategy-methodology-page-20Jun2026
**Date:** 20Jun2026
**Gate:** 4 — Test

---

## Part A — Automated Playwright Tests

**File:** `frontend/e2e/pages/strategy-methodology.spec.ts`
**Author:** qa-engineer agent
**Run status:** EXECUTED — 25 passed, 0 failed, 0 skipped (chromium, 20Jun2026)

### Test suites

| Suite | Tests | Coverage |
|---|---|---|
| 1 — Tab navigation | 5 | Desktop tab click, mobile "How" label at 375×812, no lock icon (text assertion), no upgrade prompt rendered, methodology heading visible after click |
| 2 — Content presence | 13 | IV Environment heading, Directional Bias heading, IVR formula text, SMA mention, RSI mention, Earnings Awareness heading, Scoring text, Options Flow text, catalog table ≥ 31 tbody rows (P&L Family column used as anchor), HIGH/MEDIUM/LOW badges, SMA Signal `<th>` in combination table, +2 and +3 scoring values, pipeline overview text |
| 3 — Scanner → Methodology link | 4 | Link visible before scan, clicking link shows methodology heading, link visible with empty watchlist, link is a `<button>` element (role assertion) |
| 4 — Back-navigation | 3 | Scanner tab shows Scan Watchlist button after returning from methodology, methodology heading hidden (display:none) after leaving, content persists after round-trip through Options Chain tab |
| **Total** | **25** | |

### Actual test run output (chromium)

```
Running 25 tests using 1 worker

25 passed (37.3s)
```

No tests skipped. No tests failed.

### Regression check

Pre-existing suite (chromium, all spec files, before this feature): 330 passed, 47 failed.
Post-addition (chromium, all spec files): 355 passed, 47 failed.
The 47 pre-existing failures are unchanged and confined to unrelated spec files
(`legal-acknowledgment`, `login`, `login-email`, `pricing`, `security`, `engine-accuracy`,
`data-accuracy`, `ai-features`, `strategy-comparison-matrix`, `ui-regression`).
Zero regressions introduced.

### Selector notes

- `getByText(/IVR/)` — strict-mode multi-match resolved by `.first()` (5 IVR occurrences on page)
- `getByRole('columnheader', ...)` does not match `<th>` elements in this component (inline styles, no explicit `scope`); resolved by `locator('th', { hasText: /^SMA Signal$/i })`
- Catalog row count: anchored to `table` containing `th` with text "P&L Family" (unique to the catalog table) to avoid counting rows from the 2-column and 4-column tables on the same page
- `.or()` combinator with strict mode removed from Suite 4; replaced with `getByRole('button', { name: /scan watchlist/i })` which is the unambiguous primary CTA

---

## Part B — Manual Test Plan

**Author:** tester agent
**44 test cases** across 5 sections

### Section 1 — Happy-path flows (MT-01 to MT-08)

| ID | Scenario | Expected |
|---|---|---|
| MT-01 | Desktop tab click navigates to methodology page | Heading and subtitle render; tab highlighted |
| MT-02 | All 7 sections render when scrolled | 7 numbered section cards visible |
| MT-03 | No API calls on methodology tab load | Zero `/api/*` requests in Network tab |
| MT-04 | "Learn how strategies are selected →" link in scanner header | Visible at 1280px without scrolling, accent colour + underline |
| MT-05 | Scanner link navigates to methodology tab | Active tab switches, methodology content renders |
| MT-06 | Mobile (375px) — "How" short label in tab bar | Tab reads "How", tappable without horizontal scroll |
| MT-07 | Mobile (375px) — page scrollable, 7 sections present | Vertical scroll reaches all sections, no overflow |
| MT-08 | Mobile (375px) — scanner link visible without horizontal scroll | Button within viewport width |

### Section 2 — Content accuracy checks (MT-09 to MT-26)

| ID | Scenario | Predicted Result |
|---|---|---|
| MT-09 | IVR formula matches spec §2.1 | PASS |
| MT-10 | IVR thresholds stated correctly (>50 HIGH, 30-50 MEDIUM, <30 LOW) | PASS |
| MT-11 | Each IV level has practical trading implication | PASS |
| MT-12 | HV proxy note present | PASS |
| MT-13 | Directional Bias — indicators + 3-month look-back stated | PASS |
| MT-14 | SMA signal rules match spec §3 | PASS |
| MT-15 | RSI tilt rules match spec §3 | PASS |
| MT-16 | Combination rules table — all 7 rows present | PASS |
| MT-17 | Scoring breakdown matches spec §4.2 (+2/+3/+1/−0.1c) | PASS |
| MT-18 | Worked example shows iron_condor scoring 4.8 | PASS |
| MT-19 | Bias compatibility table — 5 rows present | PASS |
| MT-20 | Catalog contains exactly 31 rows | PASS |
| MT-21 | Catalog direction tags correct across all categories | PASS |
| MT-22 | PCR thresholds and unusual contract definition present | **FAIL — Finding 1** |
| MT-23 | Flow section states flow does not affect rank | PASS |
| MT-24 | Two-gate explanation / "Strategies Available" / "Condition Matches" | **FAIL — Finding 2** |
| MT-25 | Earnings trigger condition ("within DTE window") stated | **FAIL — Finding 12** |
| MT-26 | Catalog grouped by 4 named direction categories | **FAIL — Finding 7** |

### Section 3 — Edge cases and regression (MT-27 to MT-35)

| ID | Scenario | Expected |
|---|---|---|
| MT-27 | Methodology tab accessible while scan in-progress | Renders immediately; scan continues in background |
| MT-28 | Methodology tab accessible with empty watchlist | Renders normally; no dependency on watchlist data |
| MT-29 | Rapid tab switching (scanner ↔ methodology ↔ chain) | No blank screens, no JS errors |
| MT-30 | Trade panel (sidebar) absent on methodology tab | Full-width layout; no right sidebar |
| MT-31 | Navigate away and return — content re-renders | Page renders from top; all 7 sections present |
| MT-32 | Double-tap on scanner link | Tab changes once; no duplicate events |
| MT-33 | Methodology tab with no positions recorded | Renders normally |
| MT-34 | Return from another browser tab after 30s | Methodology content still visible |
| MT-35 | Browser refresh on methodology tab | App reloads; content correct when tab re-selected |

### Section 4 — Accessibility and visual quality (MT-36 to MT-44)

| ID | Scenario | Expected |
|---|---|---|
| MT-36 | Page scrollable — content exceeds viewport height | Vertical scrollbar present |
| MT-37 | Catalog table horizontally scrollable at 375px | Table scrolls within container; page body does not overflow |
| MT-38 | Combination rules table horizontally scrollable at 375px | Same as MT-37 |
| MT-39 | Formula blocks overflow-x at 375px | Formula block scrolls; page body contained |
| MT-40 | Direction badge colours readable and distinct | 6 colours visually distinct; NEUTRAL_BULLISH vs BULLISH distinguishable |
| MT-41 | Scanner link visible without scrolling on desktop | In card header row, within initial viewport |
| MT-42 | No padlock / lock icon / upgrade prompt on methodology tab | Visible to all tiers; no LockedTabPlaceholder |
| MT-43 | Admin user sees identical content to non-admin | No admin-only sections |
| MT-44 | Link button keyboard accessible | Tab focus → Enter navigates to methodology |

### Section 5 — Cross-browser notes

| Browser | Priority tests | Risk |
|---|---|---|
| Chrome 120+ | All 44 | Baseline |
| Firefox | MT-03, MT-07, MT-37, MT-39 | Low — overflow behaviour well-supported |
| Safari macOS/iOS | MT-37, MT-39, MT-38 (overflow-x), MT-06/08 (nowrap) | **High** — Safari flex + overflow-x known quirks |
| Chrome Android | MT-06, MT-07, MT-08, MT-32, MT-37 | Medium — double-tap native touch |

### Items Playwright cannot cover (require staging / manual)

1. Double-tap race condition on scanner link (MT-32) — iOS touch event coalescing
2. Network assertion for zero API calls (MT-03) — needs `request` event assertion in test; verify in QA spec
3. Badge colour distinguishability (MT-40) — visual/axe-core
4. Safari overflow-x rendering (MT-37, MT-38, MT-39) — WebKit driver not fully representative
5. Scan-in-progress interleave (MT-27) — requires real backend latency
6. Formula symbol semantic accuracy (MT-09 to MT-19) — HTML entity rendering requires human review

---

## Tester Findings (pre-execution analysis)

| # | Finding | Severity | Affects |
|---|---|---|---|
| 1 | PCR thresholds (< 0.6 bullish … > 1.5 strongly bearish) and "unusual contract" definition absent from Flow section | **MAJOR** | MT-22, AC6.2, AC6.3 |
| 2 | Two-gate explanation ("Gate 1 hard filter" / "Gate 2 soft match") and "Strategies Available" / "Condition Matches" glossary absent | **MAJOR** | MT-24, AC7.1–AC7.4 |
| 7 | Strategy catalog is a flat table; no group headers for Bullish / Bearish / Neutral / Omnidirectional categories | **MAJOR** | MT-26, AC8.2 |
| 12 | Earnings section describes adjustment action but omits trigger condition ("within 45-day DTE window") | **MAJOR** | MT-25, AC5.2 |
| 3 | Section headings use "Input 1:" / "Input 2:" format; Earnings and Flow sections drop "Input N" prefix per spec | MINOR | AC5.1, AC6.1 |
| 10 | "Learn how strategies are selected →" is a `<button>` not `<a>`; screen readers announce it as "button" | MINOR | AC2.5, a11y |
| 11 | No `aria-label` on scanner link button; arrow character "→" may be vocalised by screen readers | MINOR | a11y |
| 4 | IVR formula correctly shows HV proxy version with explanatory note | NOTE (not defect) | — |
| 5 | Worked example (iron_condor = 4.8) matches spec §8 exactly | PASS | MT-18 |
| 6 | Catalog row count: 31 rows confirmed | PASS | MT-20 |
| 8 | Sidebar suppression coded correctly in App.tsx `showSidebar` | PASS | MT-30 |
| 9 | "Learn how strategies are selected →" exact string present in StrategyScanner.tsx | PASS | MT-04, MT-41 |

---

## Gate 4 Decision

**Decision: CONDITIONAL PASS**

Automated suite executed — 25 tests, 25 passed, 0 failed on chromium. Manual analysis identified 4 major content gaps against BA spec ACs. These do not block the core selection engine or DB changes (which are Gate 3 complete), but the methodology page content needs a follow-up implementation pass before Gate 5.

**Required before Gate 5:**
1. Add PCR threshold bands and "unusual contract" definition to the Flow section (Finding 1)
2. Add two-gate explanation with "Strategies Available" / "Condition Matches" glossary (Finding 2)
3. Add earnings trigger condition ("within 45-day DTE window") to Earnings section (Finding 12)
4. Group catalog into 4 named direction category sections with headers (Finding 7)

Minor findings (3, 10, 11) deferred to a future accessibility pass.

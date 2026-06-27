# Release Note — Risk Monitor Right-Panel Compact Leg Cards

**Version:** v1.10.0

**Release date:** 27Jun2026

**Deployment:** Frontend-only on Railway. No backend deploy, no migration, no environment variable changes.

---

## What Changed

The Risk Monitor's right panel now displays each position leg as a **compact card in a responsive grid**, replacing the previous stacked full-width card layout.

### Visual Changes

- **Old layout:** Four legs of an Iron Condor stacked vertically, each card occupying the full panel width with seven large metric tiles. Required significant scrolling to reach the action plan.
- **New layout:** All four legs sit side-by-side in compact cards on a wide desktop (≥960px), reflow to 2 columns on tablets, and stack single-column on mobile. The action plan becomes visible sooner.

### What Each Leg Card Shows

Each card displays a **3px risk-coloured top bar** and contains:

- **Header row:** Symbol (bold), SELL/BUY pill, CALL/PUT pill, ×N quantity chip (e.g. ×2), risk status (OK/WATCH/HIGH) right-aligned in risk colour.
- **Sub-line:** Strike and days to expiration in light blue (e.g. "$490 · 18d left").
- **3-tile metric row:** 
  - Qty (absolute value)
  - IV Rank (omitted entirely if null; shows yellow when >50%, red when >70%)
  - Cost (for BUY legs) or Collected (for SELL legs) — rounded to nearest dollar
- **Bottom row:** ENTRY→NOW prices ($2.10 → $1.30) on the left, P&L in green or red on the right.
- **Progress bar:** Shows P&L as a percentage, coloured by risk level.

### What Does NOT Change

- Group header (strategy name, risk badge, combined P&L, leg count, nearest expiry, IV Rank, entry-date banner) — unchanged.
- Entry-date banner inside the header — unchanged.
- Trade Narrative accordion (collapsed by default) — unchanged.
- Action plan (Financial Reality, Paths Forward, Summary Box, Close Instructions) — always visible, unchanged.
- Left panel (date rail, position list, selection) — unchanged.
- Backend API, database schema, all other tabs — unchanged.

---

## Tier Availability

Available to **Starter, Pro, and Enterprise** tiers. The `risk_monitor` entitlement gate is unchanged. Free-tier users do not have access.

---

## Deployment Steps

1. Merge the feature branch to main.
2. Run `npm run build` in the `frontend` directory.
3. Deploy the built `dist/` folder to Railway's frontend service.
4. No backend redeploy required. No database migration required. No environment variable changes required.

**Rollback:** Code revert only. No state cleanup needed.

---

## Known Limitations

### Signal Gap (F-7 — Known limitation, logged for follow-up)

Per-leg raw signal message text is no longer shown on the right panel. Risk is communicated through the group-level action plan in plain English (Financial Reality, Paths Forward).

**Impact:** For a net-profitable multi-leg group that contains one leg with a red or yellow risk signal, the action plan may not explicitly explain *why* that single leg is flagged. The leg's risk-coloured top bar and HIGH/WATCH status still visually flag it.

**Example:** An Iron Condor with three green legs and one red short call. The action plan may show "Overall profitable, monitor near expiry" (group-level logic) without breaking down the red leg's specific problem. The red top bar tells you which leg is risky; the group plan tells you the aggregate recommendation.

**Mitigation:** The defensive narrative focuses on group-level decision-making, which is correct for multi-leg positions where one leg's risk is part of the overall P&L picture. For detailed per-leg signal context, users can cross-reference the left-panel risk badge with the leg's card-top colour.

**Status:** Logged as a product backlog item for v1.11. No impact on v1.10 release or user safety.

### Minor Cosmetic Items (Non-blockers)

- P&L uses an ASCII hyphen minus (−) not the Unicode minus sign; negative P&L displays as "-$70.00".
- A P&L that rounds to exactly -$0.00 displays in red colour (indicating loss).
- Very long strategy names in the header may wrap to multiple lines.
- Large P&L values on minimum-width cards (240px) may wrap across lines for readability.

None of these affect usability or decision-making.

---

## Browser and Device Support

Tested and working on:
- **Desktop:** Chrome, Firefox, Safari, Edge (≥960px panel width, 4-column layout)
- **Tablet:** iPad landscape/portrait (480–960px panel width, 1–2 column layout)
- **Mobile:** iOS Safari, Chrome on Android (≤480px panel width, single-column accordion)

---

## What the User Should Do

**No action required.** The Risk Monitor opens exactly as before. Click a position in the left panel; the right panel displays the new compact leg-card layout. All existing workflows remain unchanged.

---

## Testing Performed

- **Automated:** 64 E2E tests across 9 test suites (Playwright, Chromium)
  - All 6 acceptance criteria stories covered
  - Tile omission when IV Rank is null verified
  - Responsive reflow at 3 breakpoints verified
  - Unchanged elements regression guard passed
- **Manual:** 61-case exploratory plan
  - Desktop, tablet, mobile layouts
  - Multi-leg and single-leg groups
  - Null/undefined IV Rank handling
  - Group switching and 5-minute silent refresh
  - Action plan always visible without toggle

---

## Performance Impact

None. This is a presentation-only CSS grid change. No new API calls, no new queries, no backend logic change. The 5-minute silent refresh interval is unchanged.

---

## Accessibility Notes

- All text is readable at standard font sizes.
- Risk colours (red/yellow/green) are used for visual scannability but not as the only indicator — text labels (OK/WATCH/HIGH) and the card's top border provide redundant information.
- The grid reflows automatically at mobile breakpoints; no pinch-zoom workaround required.

---

## Questions or Issues

If you encounter any unexpected behaviour:
1. Verify you are on Starter tier or higher (Risk Monitor is tier-gated).
2. Try a full page refresh (`Ctrl+R` or `Cmd+R`).
3. Check the browser console for JavaScript errors (F12 → Console tab).
4. Contact support with: your email, the symbol you were viewing, and a screenshot.

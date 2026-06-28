# Release Note — Risk Monitor Sort Header ("Trades · N" bar + sort dropdown)

**Version:** v1.12.0  
**Release Date:** 28 Jun 2026  
**Author:** Technical Writer  
**Status:** Ready to merge to main

---

## What's New

### "Trades · N" Header Bar with Sort Dropdown

The Risk Monitor left panel now displays a header bar reading **"Trades · N"** (where N is your number of open strategy groups) with a sort dropdown on the right. You can now instantly see how many strategies are being tracked and reorder the list without manual scanning.

**Three sort modes are available:**

1. **Newest first** (default) — groups sorted by entry date, newest at the top. Date separator blocks ("25 Jun 2026") divide groups by entry date. This is the same layout as before the update — no change to your current workflow.

2. **Risk first** — flat ranked list with the highest-risk (red) groups at the top, then yellow, then green. Removes date separators and instead shows a small "Entered DD Mon" chip on each row (e.g. "Entered 25 Jun") so you retain date context while triaging by risk. Tiebreak: groups with the most negative P&L within the same risk tier appear first.

3. **Worst P&L first** — flat ranked list ordered by your biggest losers first (most negative combined P&L at the top). Removes date separators; each row shows "Entered DD Mon" for reference. Profitable groups appear at the bottom regardless of risk badge colour.

The sort choice applies to both desktop (left-panel list) and mobile (accordion rows). The selected trade remains selected when you change the sort mode — the right panel detail does not change.

---

## What Does NOT Change

- **Per-leg cards, group badge/bar, action plan, narrative** — all unchanged.
- **Backend** — no API changes, no new endpoint.
- **Summary stat chips** — Portfolio P&L, Positions count, High Risk count remain visible above the header bar.
- **All other tabs** — Options Chain, Strategy Scanner, Positions, Orders, etc. are unaffected.
- **The count "N"** — always equals the number of strategy groups, not individual legs or symbols.

---

## How the Sort Works

- **Default on load:** Newest first. Your most recent trades appear at the top, grouped by entry date.
- **Session-only:** The sort choice resets to Newest first when you navigate away from the Risk Monitor tab and return. Sort preference is not saved across sessions in v1.
- **Mobile:** Same sort options and behaviour as desktop. On a mobile viewport, the header bar and dropdown appear above the accordion list (non-sticky, scrolls with your trades).

---

## Accessibility

The sort dropdown is a native `<select>` element with a visible focus ring and keyboard navigation support. Screen readers announce "Sort trades" when the dropdown is focused.

---

## Known Limitation (Minor)

**Hard browser refresh in Risk/Worst P&L sort:** If you hard-refresh your browser while using Risk first or Worst P&L first sort, and the previously selected trade no longer exists (e.g. you closed it), the right panel falls back to the newest-entered trade rather than the top of the current sort. This is cosmetic only and will be polished in a future update. Workaround: select the trade you want to view after the refresh completes.

---

## Deployment

**Frontend-only redeploy on Railway.** No backend code, no database migration, no new environment variables.

**Steps:**
1. Merge this branch to main.
2. Push to Railway frontend service.
3. Restart the frontend service.

**Expected downtime:** < 1 minute during restart.

---

## Rollback

If a critical issue is discovered post-release:

```bash
git revert <commit-hash>
git push origin main
# Restart Railway frontend service
```

The feature is confined to a single component (`RiskMonitor.tsx`). No data or state migrations required.

---

## Testing Completed

- 36 new automated E2E tests (Playwright): all pass. 117 total risk-monitor tests: all pass. Zero regressions.
- 58-case manual exploratory test plan completed (accessibility, mobile, selection preservation, edge cases).
- Security review passed (no critical or high findings; frontend-only, no auth or data access changes).

---

## Tier Availability

Available to all tiers that have access to the Risk Monitor: **Starter, Pro, Enterprise.** Free tier does not have Risk Monitor access.

---

## Questions?

- **"Where is my sort choice saved?"** — Session-only in v1. Refresh the page or switch tabs to reset to Newest first.
- **"Why are the date chips not shown in Newest first mode?"** — The date separator blocks ("25 Jun 2026") already show the date; the chips would be redundant.
- **"Can I sort by strategy name or number of legs?"** — Not in v1. The three options (Newest, Risk, P&L) are the core use cases. Additional sorts may be added based on user feedback.

---

**Released by:** technical-writer  
**Date:** 28 Jun 2026  
**Approved for main:** Pending user approval  


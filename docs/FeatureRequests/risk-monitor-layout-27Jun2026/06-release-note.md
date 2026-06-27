# Release Note — Risk Monitor Layout Redesign (v1.9.0)

**Date:** 27Jun2026
**Feature:** Master-Detail Split layout for Risk Monitor tab
**Tiers:** Starter, Pro, Enterprise
**Version:** v1.9.0

---

## What's New

The **Risk Monitor** tab has been redesigned to make it easier to scan and manage multiple open positions.

### Desktop Layout (viewport width > 768px)

The Risk Monitor now uses a **Master-Detail Split** layout:

- **Left panel (270px wide):** A compact, scrollable list of all open strategy groups, sorted newest-first by entry date. Each row displays the strategy name, the date it was entered ("Entered DD Mon"), risk level badge (colour-coded 3px left border), days to expiry, net P&L, and a mini progress bar showing the group's loss/profit. Date separators divide the list by entry date (e.g. "25 Jun 2026").

- **Right panel:** Click any row in the left panel to view the full position detail on the right. The right panel displays the strategy name, risk badge, net P&L, leg count, nearest expiry, IV Rank, and an entry-date banner showing how many days ago the trade was entered. Below the header are individual leg cards (one per position leg in the group), each showing symbol, BUY/SELL and CALL/PUT badges, strike, expiry, entry date, risk badge, and metrics (DTE, Qty, Entry price, Current price, P&L, IV Rank, Collected/Cost). The action plan always appears below the leg cards — no toggle required. For losing trades, you see the Financial Reality, Paths Forward, Summary Box, and close instructions. For profitable trades, you see the strategy context narrative. A "Trade Narrative" section (if the position has one) can be expanded to view the scanner narrative.

- **Portfolio summary strip:** Above the split panel, the portfolio P&L, total positions count, and risk-level counts remain unchanged.

- **First row auto-selected:** When the Risk Monitor loads, the most recently entered trade (top row) is automatically selected and displayed in the right panel.

### Mobile Layout (viewport width ≤ 768px)

On mobile devices, the split layout collapses to a single-column accordion:

- Each strategy group row appears as a tappable row in a vertical list.
- Tapping a row expands an inline detail section directly below it, showing all the same content as the right panel (header, leg cards, action plan). Only one row can be expanded at a time.
- All the compact row elements remain visible (strategy name, entry-date chip, risk badge, DTE, P&L, mini progress bar).

### Backend: `entered_at` Field Added

The `GET /api/positions/risk` API endpoint now includes an `entered_at` field on every response item. This is the calendar date the position was first opened, returned as an ISO date string (e.g. `"2026-06-25"`). The backend derives this by finding the earliest order date for each `(symbol, expiry, strike, option_type, strategy_key)` tuple, falling back to the position's creation date if no matching order is found. For strategy groups (positions sharing the same `strategy_key`), all legs in the group share the same `entered_at` value — the earliest entry date across all legs in that group.

### What Does NOT Change

- Risk signal logic (red/yellow/green thresholds, DTE buckets, P&L rules, IV environment alerts, directional bias alerts) — unchanged.
- Defensive narrative content (Financial Reality, Paths Forward, Summary Box, Close Instructions) — word-for-word identical, now displayed always-visible instead of hidden behind a toggle.
- AI Risk Overview button and its functionality — unchanged; remains below the split panel.
- Options Chain, Strategy Scanner, Positions, and Orders tabs — unchanged.
- Watchlist, portfolio P&L chart, and tier entitlements — unchanged.

---

## User Impact

### Benefit

With 10+ open positions, the new left-panel list lets you scan all your trades in one view without scrolling through a long page. You can immediately identify which positions are newest, which are highest risk, and which are closest to closure — then click any row to see the full detail and action plan on the right. On mobile, the accordion layout keeps all positions accessible in a vertical scroll.

### Action Required

**None.** The new layout is automatic. If you prefer the old layout (tiles stacked vertically), clear your browser cache and refresh — if you need the previous version, contact support.

### Known Limitations

- **Timezone cosmetic discrepancy (LOW-002):** The "N days ago" calculation uses your local time zone. A trade entered on the calendar date "25 Jun 2026" might show "0 days ago" on the evening of 25 Jun local time but "1 day ago" after midnight UTC (especially for users in UTC+10 and later). This is a display artifact only and does not affect sorting or data accuracy — the entry date is always the calendar date, not a time-of-day boundary.

- **String-slicing assumption (LOW-001):** The backend's `entered_at` extraction uses Supabase's ISO 8601 `created_at` format (YYYY-MM-DD...). If Supabase changes this format in a future version, dates could display incorrectly (defensive guards are in place, so no crash occurs). This is a low-risk implementation detail noted here for transparency.

- **Mobile touch target sizes:** On narrow mobile viewports (320–375px), the entry-date chip and mini progress bar may appear tight within the row. Tapping remains reliable, but the visual spacing is compact.

---

## Deployment Steps

1. **Redeploy backend** on Railway:
   - Push the updated `backend/routes/positions.py` (adds `entered_at` query logic to `get_positions_risk`).
   - No database migration is required — `entered_at` is derived at query time, not stored.

2. **Redeploy frontend** on Railway:
   - Push the updated `frontend/src/components/RiskMonitor.tsx` (new split layout, `selectedGroupKey` state, mobile accordion).
   - Push the updated `frontend/src/api/client.ts` (extends `PositionRisk` interface with `entered_at: string`).

3. **Verify:**
   - Navigate to the Risk Monitor tab (requires Starter tier or higher).
   - Confirm the left-panel list renders with the most recently entered trade at the top.
   - Click a row — confirm the right panel loads its detail within 100ms.
   - On mobile or at 768px viewport width, confirm the accordion layout appears instead of the split view.

---

## Rollback Procedure

Because this feature introduces no database migrations and no breaking API changes (only adds a new field to an existing response), rollback is a code revert only:

1. Git reset `backend/routes/positions.py` and `frontend/src/` to the previous commit.
2. Redeploy both services to Railway.
3. The `entered_at` field will no longer be included in the API response, and the frontend will render the old single-column tile layout.

No data loss. No migration rollback needed.

---

## Testing Recommendations

Before deploying to production:

- **Visuals:** Open the Risk Monitor with 5+ strategy groups spanning 2+ entry dates. Confirm the left-panel list is visible, date separators appear correctly, and rows have the correct risk-level border colours.
- **Interaction:** Click each row in the left panel. Confirm the right panel updates immediately (within 100ms) and the clicked row is highlighted with a distinct background.
- **Entry dates:** Inspect the raw API response (`GET /api/positions/risk` in DevTools Network tab). Confirm every item has an `entered_at` field in `YYYY-MM-DD` format. Cross-reference the date against the Orders table to verify accuracy.
- **Mobile:** Resize to 375px viewport width (or test on a device). Confirm the split layout is replaced by the accordion layout, and tapping rows expands/collapses inline detail.
- **Regression:** Verify the Strategy Scanner, Options Chain, Positions, Orders, and Orders tabs all load without errors.

---

## Support Notes

- **Users asking about the layout change:** Explain that the new split layout lets them see all open positions at a glance (left panel) and click any position to read its full detail and action plan on the right. On mobile, it becomes an expandable accordion.
- **Users reporting missing data:** Verify that `entered_at` is present in the API response and formatted correctly. If a position shows "Entered --" in the chip, the backend fallback chain did not populate the field — escalate to engineering.
- **Users on older tiers:** The Risk Monitor tab is gated to Starter tier and higher; Free-tier users will not see this tab.

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| v1.9.0 | 27Jun2026 | Master-Detail Split layout; `entered_at` field added to `/api/positions/risk`; mobile accordion layout; always-visible action plan |
| v1.8.5 | prior | Previous Risk Monitor (single-column tile layout) |

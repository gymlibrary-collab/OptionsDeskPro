# Release Note — Strategy Methodology Page

**Feature:** strategy-methodology-page-20Jun2026  
**Release date:** 20 June 2026  
**Availability:** All authenticated users (all tiers)

---

## Summary

A new **Methodology** tab now explains exactly how OptionsDesk selects strategies. Users can see the IV environment formula, directional bias rules, the two-gate filtering logic, the 31-strategy catalog, earnings adjustments, and options flow context — all in one place. A link in the Strategy Scanner header ("Learn how strategies are selected →") provides a direct entry point when users encounter scan results they want to understand.

---

## What's New

- **Methodology tab** in the main dashboard tab bar
  - Desktop label: "Methodology"  
  - Mobile short label: "How"
  - No tier gate; visible to all authenticated users

- **Seven sections on the Methodology page**
  1. How selection works (pipeline overview, two-gate explanation)
  2. Input 1: IV Environment (IVR formula, HIGH/MEDIUM/LOW thresholds)
  3. Input 2: Directional Bias (SMA20/50 + RSI14 rules, combination table)
  4. Scoring algorithm (+2 for IV match, +3 for exact direction, +1 for partial, −0.1×complexity tiebreaker, bias compatibility matrix)
  5. The 31-Strategy Catalog (all 31 strategies grouped by direction, with IV environment, DTE, POP, P&L family)
  6. Earnings Awareness (45-day DTE trigger, pre/post-earnings expiry selection)
  7. Options Flow & Sentiment (Reddit sentiment, Put/Call Ratio thresholds, unusual contract definition)

- **Contextual link in Strategy Scanner header**
  - Text: "Learn how strategies are selected →"
  - Colour: accent purple, underlined
  - Visible at all times (before and after scans)
  - Placed in the watchlist editor card header row

- **Database addition**
  - New `strategy_catalog` table (migration 016) as source of truth for all 31 strategy attributes
  - Columns: slug, name, category, direction, iv_environment, dte_min/max, pop_low/high, family, complexity
  - Governance rule: any change to strategy metadata requires a migration first, then an update to `strategy_engine.py`

---

## Deployment Steps

1. **Run migration 016** (adds strategy_catalog table with all 31 strategies pre-populated)
   ```bash
   cd backend
   psql $DATABASE_URL < migrations/016_strategy_catalog.sql
   ```

2. **Deploy backend**
   - No new API endpoints; no env vars to add
   - Backend now mirrors strategy_catalog in `strategy_engine.py`

3. **Deploy frontend**
   - New `StrategyMethodologyPage.tsx` component
   - New `methodology` tab key in `App.tsx`
   - New contextual link in `StrategyScanner.tsx` header

No environment variable changes required.

---

## Rollback Procedure

1. **Rollback frontend** to prior version (hides Methodology tab and scanner link)
2. **Rollback backend** to prior version (strategy engine unaffected; migration is optional to keep)
3. **Optional: drop migration 016**
   ```bash
   drop table if exists strategy_catalog cascade;
   ```

Rollback takes effect immediately; no data loss.

---

## Known Deferred Items

**Accessibility findings** — minor, deferred to future pass:
- Finding 3: Section headings "Input 1:" / "Input 2:" format differs from Earnings/Flow sections (style inconsistency)
- Finding 10: Scanner link button lacks `aria-label` (screen readers announce as "button" + "→")
- Finding 11: No semantic text wrapper on "Learn how strategies are selected →" link

All three are style / a11y refinements only and do not affect functionality.

---

## Tier Availability

- **Free tier:** Methodology tab accessible
- **Starter tier:** Methodology tab accessible
- **Pro tier:** Methodology tab accessible
- **Enterprise tier:** Methodology tab accessible

No tier gate. Same content for all users.

---

## Operational Readiness (Gate 6 — Operator)

**Assessment: GO**

| Check | Result |
|---|---|
| Migration 016 contains no DROP TABLE / TRUNCATE / DROP COLUMN | ✅ PASS |
| Migration uses `CREATE TABLE IF NOT EXISTS` + upsert — safe to re-run | ✅ PASS |
| `recommend_by_category()` present with unchanged signature | ✅ PASS |
| `build_trade()` present with unchanged signature; all 31 keys have branches | ✅ PASS |
| Methodology tab uses `display: none` isolation (consistent with other tabs) | ✅ PASS |
| `showSidebar` correctly excludes `'methodology'` | ✅ PASS |
| No new API routes registered in `main.py` | ✅ PASS |
| No new external service dependencies | ✅ PASS |
| `onMethodologyClick` prop optional-chained — no crash if prop absent | ✅ PASS |
| Rollback path defined; no DB data recovery required | ✅ PASS |

# Release Note — v1.13.1 (Scanner Category Cap Removal)

**Date:** 30Jun2026  
**Version:** v1.13.1  
**Release Type:** Patch (follow-on to v1.13.0 net-order-price release)

---

## What's Fixed

The Strategy Scanner's grouped "by category" view now shows **all** applicable strategies in each directional category, not just the first three.

Previously, the list was silently capped at 3 per category. When more than three strategies tied on complexity within a category, the excess were dropped from the category panel — but they still appeared in the comparison matrix, creating an unexplained discrepancy between two views of the same data.

**Example:** In a HIGH IV environment, all six Omnidirectional strategies share complexity 3:
- Put Front-Ratio Spread ✓
- Call Front-Ratio Spread ✓
- Put Broken Wing Butterfly ✓
- **Call Broken Wing Butterfly** ← now visible
- **Call Broken Heart Butterfly** ← now visible
- **Put Broken Heart Butterfly** ← now visible

The cap also truncated these categories (all at HIGH IV unless noted):
- Bullish (HIGH): Call Butterfly, Big Lizard now appear
- Bullish (LOW): Call Calendar, Call Butterfly now appear
- Bearish (HIGH): Put Butterfly, Reverse Big Lizard now appear
- Bearish (LOW): Put Calendar, Put Butterfly now appear
- Neutral (HIGH): Dynamic Width Iron Condor, Iron Fly now appear

The two views are now consistent. Category panel and comparison matrix show the same set of strategies for each IV environment.

---

## What Does Not Change

- **Comparison matrix** — already uncapped; remains unchanged
- **Watchlist scan results** — still show their top 5 strategies per symbol; unchanged
- **Non-viable strategies** — still filtered out; broken trades still do not render
- **Strategy ordering** — still sorted by complexity ascending
- **Backend response shape** — no API contract change
- **Frontend component** — renders whatever the backend returns; no code changes
- **Database schema** — no migration required
- **Subscription tier gates** — no tier change; deep analysis is accessible to all authenticated users on all tiers

---

## Deployment

**Backend-only redeploy on Railway.** No migration, no environment variable change.

- Backend service restart required
- Frontend requires no changes (already backward-compatible)

**Rollback:** Git revert to previous commit; redeploy.

---

## Testing & Validation

39 new backend unit tests (pytest) confirm:
- Omnidirectional/HIGH = 6 strategies (was 3)
- Bullish/HIGH = 5 strategies (was 3)
- Bearish/HIGH = 5 strategies (was 3)
- Neutral/HIGH = 5 strategies (was 3)
- Bullish/LOW = 5 strategies (was 3)
- Bearish/LOW = 5 strategies (was 3)
- All other categories unchanged
- Complexity-ascending sort order preserved
- All strategies qualify for their IV environment and category

435 pre-existing strategy-engine tests still pass.

---

## Notes for Support & Users

- Users may notice **more** strategies in the "by category" panels when they run a deep analysis in the Scanner
- This is not a new feature or a bug — it is a correction of a data completeness issue
- No action required by users; watchlists, saved trades, and preferences are unaffected
- No change to available tiers or feature gates

---

## Tier Availability

**All tiers** (Free, Starter, Pro, Enterprise): Strategy Scanner deep-analysis accessible to all authenticated users. Cap removal applies equally to all tiers.

---

## Known Limitations

None introduced by this fix. Existing limitations (synthetic chain fallback, IV boundary sensitivity, max_profit guards) remain unchanged.

# Test Report — Scanner Category List: Show All Applicable Strategies

**Feature:** `scanner-category-show-all-30Jun2026`
**Change:** `recommend_by_category` `matches[:3]` → `matches` (remove per-category cap). Backend-only.

---

## Automated — backend pytest

**File:** `backend/tests/test_recommend_by_category.py` (39 tests) — runs in `.github/workflows/backend-tests.yml`.

```
cd backend && python -m pytest tests/test_recommend_by_category.py -q
39 passed in 0.06s
```
435 pre-existing strategy-engine/catalog tests still pass.

There is **no Playwright/qa-engineer spec** for this feature: it is a backend-only change with no frontend modification (`CategorySection` renders whatever the backend returns, with no length guard). The pure-function `recommend_by_category` is fully and deterministically covered by pytest, which is the appropriate automated layer.

### Coverage — the six previously-truncated cells
| Cell | Was | Now | Newly surfaced |
|------|-----|-----|----------------|
| OMNIDIRECTIONAL / HIGH | 3 | 6 | call_broken_wing_butterfly, call_broken_heart_butterfly, **put_broken_heart_butterfly** |
| BULLISH / HIGH | 3 | 5 | call_butterfly, big_lizard |
| BEARISH / HIGH | 3 | 5 | put_butterfly, reverse_big_lizard |
| NEUTRAL / HIGH | 3 | 5 | dynamic_width_iron_condor, iron_fly |
| BULLISH / LOW | 3 | 5 | call_calendar, call_butterfly |
| BEARISH / LOW | 3 | 5 | put_calendar, put_butterfly |

Plus invariants: untruncated cells unchanged (3 or 0); complexity-ascending order preserved; every returned strategy qualifies for its iv_env and category; all six category keys always present.

---

## Manual exploratory plan (tester) — 30+ cases, 10 areas

Read-only role; summary:

1. **Omnidirectional / HIGH (primary defect)** — section shows 6; Put Broken Heart Butterfly present and expandable with a valid trade; call broken variants present; network response `OMNIDIRECTIONAL` array == 6.
2. **Other truncated cells** — BULLISH/HIGH=5, BEARISH/HIGH=5, NEUTRAL/HIGH=5, BULLISH/LOW=5, BEARISH/LOW=5; the specific added strategies present.
3. **Untruncated cells unchanged** — NEUTRAL_BULLISH/HIGH=3, NEUTRAL_BEARISH/HIGH=3, BULLISH/MEDIUM=3, OMNIDIRECTIONAL under LOW/MEDIUM=0.
4. **Category list ↔ comparison matrix consistency** — same strategies present per category in both views.
5. **Non-viable filtering (do-no-harm)** — strategies whose build_trade returns None / errors still never render; badge counts reflect only viable; no "Not built" string in DOM.
6. **Performance** — response time comparable (net build_trade calls unchanged); payload grows only in the six affected cells.
7. **Watchlist scan regression** — recommend_strategies (top_n=5) unchanged; scan rows still ≤5.
8. **Functional regression** — matrix sort/filter, order entry from a newly-visible card, narrative section.
9. **Edge cases** — exactly-3 cells, synthetic chain, rapid double-click, cross-tab, empty watchlist / direct symbol entry.
10. **Mobile** — badge/cards readable at 390px, touch targets, double-tap no duplication.

### Scenarios automated tests can't cover
Real IV-environment classification (live yfinance), max_profit-guard suppression on live strikes, synthetic-chain fallback, response-time baselines, real mobile layout/touch, cross-tab bfcache.

### Fragility notes (all pre-existing, not introduced)
No per-category loading skeleton; IV-env boundary sensitivity (69.9% vs 70%); `CategorySection` open state resets on tab switch; matrix `CATEGORY_ORDER` differs from `recommend_by_category` order (cosmetic).

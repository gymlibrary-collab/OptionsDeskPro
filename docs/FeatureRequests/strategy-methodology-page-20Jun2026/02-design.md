# Architecture Design — Strategy Methodology Page & Catalog

**Date:** 20Jun2026
**Author:** Solution Architect
**Status:** Approved for Implementation

---

## 1. Scope

This design covers two complementary deliverables that the BA spec described as one feature:

| Deliverable | What it does |
|---|---|
| **A. Strategy Catalog (backend)** | DB table + code alignment to the portable spec. Source of truth for all 31 selection-tier attributes. |
| **B. Methodology Page (frontend)** | New React tab explaining IV Environment, Directional Bias, Earnings Awareness, and Options Flow in plain English. |

The BA spec said "no backend changes required"; this design supersedes that scoping decision because aligning the catalog to the portable spec is a prerequisite for a credible methodology page.

---

## 2. Source of truth

All selection-tier attributes for the 31 strategies are governed by:

```
docs/strategy-selection-spec.md          ← portable, canonical specification
backend/migrations/016_strategy_catalog.sql ← DB as authority
backend/services/strategy_engine.py      ← code mirrors DB
```

**Governance rule:** any change to `direction`, `iv_environment`, `complexity`, `dte_target`, or `pop_range` for any strategy requires a DB migration that touches `strategy_catalog` **before** the code change lands.

---

## 3. Database changes

### Table: `strategy_catalog`

```sql
create table strategy_catalog (
    slug           text        primary key,
    name           text        not null,
    category       text        not null,
    direction      text[]      not null,
    iv_environment text[]      not null,
    dte_min        int,
    dte_max        int,
    pop_low        int,
    pop_high       int,
    family         text        not null,
    complexity     int         not null check (complexity between 1 and 3),
    is_active      boolean     not null default true,
    spec_notes     text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
```

**31 rows** inserted by migration 016. Rows for 9 retired slugs (long_call, long_put, collar, long_strangle, long_straddle, call_diagonal, put_diagonal, call_ratio_spread, put_ratio_spread) are marked `is_active = false` for historical reference.

---

## 4. Backend changes — strategy_engine.py

### 4.1 Strategy catalog alignment

| Change | Detail |
|---|---|
| **Remove** | long_call, long_put, collar, long_strangle, long_straddle, call_diagonal (6 non-spec strategies) |
| **Rename** | put_ratio_spread → put_front_ratio; call_ratio_spread → call_front_ratio; put_diagonal → poor_mans_covered_put |
| **Add** | call_zebra, covered_put, put_zebra, poor_mans_covered_put, call_broken_heart_butterfly, put_broken_heart_butterfly, dynamic_width_iron_condor (6+1=7 new strategies, net +1 after rename) |
| **Fix direction** | put_front_ratio and call_front_ratio: `NEUTRAL_BULLISH`/`NEUTRAL_BEARISH` → `OMNIDIRECTIONAL` |
| **Fix iv_environment** | poor_mans_covered_put: `[LOW, MEDIUM]` → `[LOW]` |

Result: exactly 31 active strategies matching the spec catalog in `docs/strategy-selection-spec.md`.

### 4.2 New function: `score_and_rank`

Implements §4 of the portable spec:

```
score = 0
+2  if iv_env in strategy.iv_environment
+3  if bias in strategy.direction          (exact match)
+1  if any compatible_bias in strategy.direction   (adjacent match)
-0.1 * complexity                          (tiebreak)

Drop strategies matching neither axis.
Sort descending. Return top 5.
```

The bias compatibility map (from spec §4.1):
```
BULLISH         → [BULLISH]
BEARISH         → [BEARISH]
NEUTRAL         → [NEUTRAL]
NEUTRAL_BULLISH → [NEUTRAL_BULLISH, BULLISH, NEUTRAL]
NEUTRAL_BEARISH → [NEUTRAL_BEARISH, BEARISH, NEUTRAL]
OMNIDIRECTIONAL → [OMNIDIRECTIONAL, NEUTRAL]
```

### 4.3 build_trade additions

Leg builders added for: `covered_put`, `call_zebra`, `put_zebra`, `poor_mans_covered_put`, `dynamic_width_iron_condor`, `call_broken_heart_butterfly`, `put_broken_heart_butterfly`.

SELLER_STRATEGIES set updated to include all credit-collecting strategies from the new catalog.

---

## 5. Frontend changes — Methodology page

### 5.1 New component: `StrategyMethodologyPage.tsx`

Location: `frontend/src/components/StrategyMethodologyPage.tsx`

Renders a scrollable educational page with four labelled sections:

| Section | Content |
|---|---|
| **IV Environment** | IVR formula, HV proxy, HIGH/MEDIUM/LOW thresholds, practical meaning |
| **Directional Bias** | SMA20/50 crossover + RSI(14), combine rules, 5 output states |
| **Earnings Awareness** | Seller / buyer expiry adjustment logic, IV crush explanation |
| **Options Flow** | What options flow data signals and how it modifies recommendations |

Plus a **Strategy Catalog** section showing the 31 strategies in a table with direction, IV env, DTE, POP, and family columns — sourced directly from the spec.

No backend API call required. All content is static.

### 5.2 App.tsx changes

- Add `"methodology"` to the `TabType` union.
- Add tab entry: label `"Methodology"` (desktop), `"How"` (mobile), icon `BookOpen`.
- Tab renders `<StrategyMethodologyPage />`.
- No auth-level gating — visible to all authenticated users.

### 5.3 StrategyScanner.tsx change

Add a "Learn how strategies are selected →" link in the watchlist editor card header. On click: sets active tab to `"methodology"`. Rendered at all times (not gated on scan completion).

---

## 6. API contracts

No new API endpoints. The methodology page is fully static.

The existing `/api/strategies/analyze/{symbol}` endpoint will benefit from the `score_and_rank` function being available for future use, but the endpoint itself is unchanged in this release.

---

## 7. Caching

No new caching requirements. `strategy_catalog` table data is read-only at runtime (migrations only); no cache invalidation needed.

---

## 8. Security considerations

- No new user-facing inputs, no new API surface.
- `strategy_catalog` table: read-only by application service role; write only via migrations (admin context).
- Static methodology page: no user data rendered.

---

## 9. Divergences from BA spec

| BA spec claim | Actual design | Reason |
|---|---|---|
| "No backend changes required" | Migration 016 + engine rewrite | Catalog alignment is a prerequisite for a credible methodology page |
| 4 inputs: IV, Bias, Earnings, Flow | Spec confirms only IV + Bias drive **selection**; Earnings and Flow are enrichment only | Spec §5 is explicit: DTE, POP, P&L are post-selection outputs |

---

## 10. Files changed

```
docs/strategy-selection-spec.md                              ← new (canonical portable spec)
backend/migrations/016_strategy_catalog.sql                  ← new (DB migration)
backend/services/strategy_engine.py                          ← modified (31-strategy alignment, score_and_rank)
frontend/src/components/StrategyMethodologyPage.tsx          ← new
frontend/src/App.tsx                                         ← modified (tab added)
frontend/src/components/StrategyScanner.tsx                  ← modified (learn link added)
docs/FeatureRequests/strategy-methodology-page-20Jun2026/    ← gate documents
```

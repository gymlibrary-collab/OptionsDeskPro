# Technical Design — Position Lifecycle & Risk Monitor Improvements

**Date:** 18Jul2026
**Author:** Solution Architect
**Status:** Draft

---

## 1. Overview

This feature bundle addresses five improvements across two surfaces: the auto-settlement of expired option positions (FR-1), three targeted UI enhancements to the Risk Monitor (FR-2, FR-3, FR-4), and an editable closing price on the manual close modal (FR-5).

The centrepiece is the auto-settlement engine (FR-1). When any of three read endpoints (`GET /api/positions`, `GET /api/portfolio`, `GET /api/positions/risk`) is hit, a new settlement service scans the user's positions for those whose `expiry < today`, computes a settlement price via yfinance historical data → intrinsic value → $0 fallback, atomically deletes each expired position row, adjusts portfolio cash, and inserts an `auto_settled` order record with full P&L metadata. Idempotency is guaranteed by the atomic `DELETE ... WHERE id = ?` pattern: if two concurrent requests race, only one DELETE will find the row; the other proceeds without double-settling. A new `GET /api/positions/closed` endpoint returns the last 90 days of closed trades for the collapsible Closed Positions accordion on the Positions tab. FR-2/3/4 are pure frontend changes to `RiskMonitor.tsx` — no new data fetching, only prop threading and CSS. FR-5 adds a controlled input and price state to `Positions.tsx`'s close modal; no backend schema change is needed as `orders.price` already stores any `numeric(10,4)` value.

The architectural decision on lazy-vs-scheduled settlement is recorded in ADR-0015. No new Python packages are required. No new environment variables are needed.

---

## 2. Changed Files

| File | Change Type | Notes |
|------|-------------|-------|
| `backend/migrations/025_position_lifecycle.sql` | New | Adds `leg_role`, `settlement_metadata` to `orders`; extends `user_action_log` action type CHECK |
| `backend/services/settlement.py` | New | Auto-settle engine: `auto_settle_expired()`, `_get_settlement_price()`, `_get_historical_close()` |
| `backend/routes/positions.py` | Modified | Calls `auto_settle_expired()` at start of three endpoints; adds `GET /api/positions/closed` |
| `backend/services/user_portfolio.py` | Modified | `record_trade()` persists `leg_role` and captures `settlement_metadata` for close legs |
| `frontend/src/api/client.ts` | Modified | Adds `ClosedPosition` interface and `getClosedPositions()` |
| `frontend/src/components/Positions.tsx` | Modified | Close modal: `closePrice` state, editable input, reactive proceeds; adds `ClosedPositions` accordion |
| `frontend/src/components/RiskMonitor.tsx` | Modified | `RiskListRow` + `RightPanelHeader`: ticker chip and spot price; `LegCard`: nowrap fix |
| `docs/adr/0015-lazy-auto-settlement-on-read.md` | New | Records settlement trigger strategy decision |

---

## 3. Database Schema Changes

### Migration: `025_position_lifecycle.sql`

```sql
-- Migration 025: Position lifecycle & Risk Monitor improvements
-- 1. Adds leg_role to orders to distinguish open vs close legs
-- 2. Adds settlement_metadata JSONB for P&L data on closed orders
-- 3. Extends user_action_log action_type CHECK to include position_auto_settled
-- Safe to run multiple times (idempotent via IF NOT EXISTS / DO blocks).

-- ── Orders table extensions ──────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS leg_role text,
  ADD COLUMN IF NOT EXISTS settlement_metadata JSONB;

-- leg_role values: 'open' | 'close' | NULL (legacy rows)
-- settlement_metadata shape for auto_settled orders:
--   { "source": "market"|"intrinsic"|"worthless",
--     "entry_avg_cost": <numeric>,
--     "entry_action": "buy"|"sell",
--     "entry_quantity": <signed integer>,
--     "realised_pnl": <numeric> }
-- settlement_metadata shape for manual close orders:
--   { "source": null,
--     "entry_avg_cost": <numeric>,
--     "entry_action": "buy"|"sell" }

-- ── user_action_log CHECK constraint extension ───────────────────────────────

DO $$
BEGIN
  ALTER TABLE public.user_action_log
    DROP CONSTRAINT IF EXISTS user_action_log_action_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.user_action_log
    DROP CONSTRAINT IF EXISTS user_action_log_action_type_valid;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.user_action_log
  ADD CONSTRAINT user_action_log_action_type_valid
  CHECK (action_type IN (
    'login',
    'logout',
    'ticker_search',
    'strategy_scan',
    'options_chain_view',
    'paper_trade_placed',
    'watchlist_update',
    'ai_query',
    'tc_acknowledged',
    'ai_features_enabled',
    'position_auto_settled'
  ));
```

**Tables affected:**

| Table | Change |
|-------|--------|
| `orders` | +`leg_role text` (nullable), +`settlement_metadata JSONB` (nullable) |
| `user_action_log` | Extended `action_type` CHECK constraint (add `position_auto_settled`) |

**RLS policies added/modified:** None. Existing `orders` RLS policy (`users_own_orders`) covers the new columns automatically. `user_action_log` is service-role-only (no user-facing RLS).

---

## 4. API Contracts

### Modified behavior: existing endpoints

`GET /api/positions`, `GET /api/portfolio`, and `GET /api/positions/risk` each call `await settlement.auto_settle_expired(user_id, user_email)` as the first operation. The call is `async` and awaited before any existing logic runs. The response shape of these three endpoints is **unchanged**; auto-settlement is a side-effect only.

---

### `GET /api/positions/closed`

**Auth required:** Yes (user token via `verify_token`)

**Request:** None (no query parameters)

**Response (200):** Array of `ClosedPositionRow`. Empty array `[]` when no closed positions exist in the last 90 days.

```json
[
  {
    "symbol": "INTC",
    "strategy_name": "Long Call Vertical Spread",
    "expiry": "2026-06-20",
    "strike": 30.0,
    "option_type": "call",
    "settlement_price": 1.25,
    "entry_avg_cost": 0.75,
    "quantity": 2,
    "entry_action": "buy",
    "realised_pnl": 100.00,
    "realised_pnl_pct": 66.67,
    "settlement_source": "intrinsic",
    "closed_at": "2026-06-20T16:30:00Z",
    "is_auto_settled": true
  },
  {
    "symbol": "AAPL",
    "strategy_name": "Close: Short Put",
    "expiry": "2026-07-18",
    "strike": 190.0,
    "option_type": "put",
    "settlement_price": 2.10,
    "entry_avg_cost": 3.50,
    "quantity": 1,
    "entry_action": "sell",
    "realised_pnl": 140.00,
    "realised_pnl_pct": 40.00,
    "settlement_source": null,
    "closed_at": "2026-07-15T14:22:00Z",
    "is_auto_settled": false
  }
]
```

**Field notes:**
- `settlement_source`: `"market"` | `"intrinsic"` | `"worthless"` for auto-settled orders; `null` for manual closes.
- `realised_pnl` / `realised_pnl_pct`: `null` if `entry_avg_cost` could not be determined (legacy close orders without `settlement_metadata`).
- `quantity`: always the absolute close quantity (positive integer).
- `entry_action`: `"buy"` for long positions, `"sell"` for short positions.

**Query logic:** Selects from `orders` where `user_id = current_user` AND (`status = 'auto_settled'` OR `leg_role = 'close'`) AND `created_at >= today − 90 days`, ordered by `created_at DESC`, limit 500. This excludes legacy close orders (pre-migration 025) which have `leg_role IS NULL`.

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | Not authenticated |
| 403 | Legal gate not satisfied |
| 500 | Internal DB error |

---

## 5. Caching Strategy

| Data | Cache Key | TTL | Fallback |
|------|-----------|-----|----------|
| Underlying historical close for settlement | None — not cached | N/A | Historical data is immutable; a fetch miss falls through to $0 worthless |
| Existing yfinance quote cache (`quote:{symbol}`) | Unchanged | 120s | Stooq → `_empty_quote` |
| Existing yfinance chain cache (`chain:{symbol}:{expiry}`) | Unchanged | 120s | Synthetic BS chain |

**Rationale for no settlement cache:** Settlement of a specific position is a once-per-lifetime event (the position row is deleted atomically before the history fetch). There is no repeated read of the same settlement price by the same user, so a TTL cache provides no benefit. The underlying's historical close for an expired option is immutable past data; yfinance returns it reliably without throttling on individual historical requests.

---

## 6. External Dependency Fallback Chain

**Auto-settlement price (FR-1):**

| Tier | Source | Condition | Settlement Source badge |
|------|--------|-----------|------------------------|
| 1 | yfinance: `Ticker(occ_symbol).history(period="5d")` — last-traded price of the expired contract | OCC contract symbol reconstructed from `symbol + YYMMDD + C/P + strike*1000`; returns data | `"market"` |
| 2 | yfinance: `Ticker(symbol).history(start=expiry-3d, end=expiry+2d)` — underlying close on or before expiry date; intrinsic = `max(spot−strike,0)` for calls, `max(strike−spot,0)` for puts | Tier 1 returned no data | `"intrinsic"` (ITM) or `"worthless"` (OTM, intrinsic=0) |
| 3 | $0.00 (expired worthless) | Underlying history also unavailable | `"worthless"` |

**Important note:** yfinance typically drops expired option contract data within hours of expiry. Tier 1 will rarely succeed in practice. Tier 2 (underlying history) is the robust path and is designed to be the primary real settlement mechanism. Tier 3 is the final safe default.

**`_safe_float()` invariant:** All yfinance Close prices are read via `_safe_float()` imported from `market_data.py`, consistent with the CLAUDE.md requirement that yfinance numeric values never be cast directly to `float()` or `int()`.

---

## 7. Service Design — Settlement Engine (`backend/services/settlement.py`)

This file must never call `get_supabase()` at module level (CLAUDE.md invariant). Every `get_supabase()` call is inside a function body.

### `async def auto_settle_expired(user_id: str, user_email: str = "") -> None`

1. Call `get_supabase()` inside the function. Query `positions` where `user_id = ?` AND `expiry < today`. If empty, return immediately.
2. For each expired position row:
   a. **Atomic claim:** Execute `DELETE FROM positions WHERE id = ? AND user_id = ?`. Check `result.data`. If `result.data` is falsy (empty list), another concurrent request already settled this row — skip to next.
   b. **Compute settlement price:** Call `_get_settlement_price(pos)` → `(price: float, source: str)`.
   c. **Cash adjustment:** `cash_delta = settlement_price × |qty| × 100`. For long positions (`quantity > 0`): add `cash_delta` to portfolio cash (proceeds received). For short positions (`quantity < 0`): subtract `cash_delta` from portfolio cash (obligation paid). Net effect: a short expiring worthless (settlement_price=0) has zero cash impact, correctly leaving the collected premium already in cash.
   d. **Update portfolio cash** via `portfolios` table (single `UPDATE` per settled position, fetching current cash first).
   e. **Insert order:** `status='auto_settled'`, `action='sell'` for longs / `action='buy'` for shorts, `price=settlement_price`, `leg_role='auto_settled'`, `settlement_metadata={source, entry_avg_cost, entry_action, entry_quantity, realised_pnl}`. Preserves `strategy_key`, `strategy_name`, `profit_target_pct` from the position row.
   f. **Log to `user_action_log`** if `user_email` is non-empty: `action_type='position_auto_settled'`, `detail={symbol, expiry, strike, option_type, settlement_price, source, realised_pnl}`.

**Concurrency guarantee:** Steps (a) through (f) are not wrapped in an explicit DB transaction (the Supabase Python client does not expose `BEGIN/COMMIT`). However, idempotency is guaranteed by the `DELETE ... WHERE id = ?` atomic claim in step (a). If two concurrent requests both enter step (a) for the same position row, Postgres serialises the two DELETEs at the row level: exactly one will delete the row (returning data), the other will find no row (returning empty data). The second caller skips all subsequent steps. The partial state between (a) and (f) for the successful caller cannot be re-entered because the position row is gone after (a). A server crash between (a) and (e) leaves an orphaned cash adjustment without an order record, but this is acceptable for a paper-trading tool. See ADR-0015 for the full analysis.

### `def _get_settlement_price(pos: dict) -> tuple[float, str]`

Implements the three-tier fallback described in Section 6. The OCC contract symbol for Tier 1 is computed as:
```
{SYMBOL}{YY}{MM}{DD}{C|P}{int(strike*1000):08d}
```
e.g., INTC260620C00030000 for INTC $30 call expiring 2026-06-20.

All yfinance calls are wrapped in `threading.Thread` with a 5-second timeout (consistent with `_yfinance_chain` in `market_data.py`).

### `def _get_historical_close(symbol: str, expiry_date: date) -> Optional[float]`

Fetches `yf.Ticker(symbol).history(start=expiry_date - 3 days, end=expiry_date + 2 days)` using the _safe_float() helper on the `Close` column. Finds the last row whose index date is on or before `expiry_date` (handles rare cases where the expiry date itself was not a trading day). Returns `None` if no data is available.

---

## 8. `user_portfolio.py` — `record_trade()` changes

Two changes are required:

**A. Persist `leg_role` on all new order rows.** The `leg.role` attribute is already present on the incoming leg model. Add `"leg_role": getattr(leg, 'role', None)` to the `orders` insert dict. This begins populating `leg_role` for all future trades. Existing rows (pre-migration 025) remain `NULL`.

**B. Capture `settlement_metadata` for close legs.** Immediately before calling `_update_position()` (which may delete the position row), check if `leg.role == 'close'`. If so, query `positions` for the matching row (by `user_id`, `symbol`, `expiry`, `strike`, `option_type`, strategy group) to capture `avg_cost` and `entry_action`. Store this as `settlement_metadata = {"source": None, "entry_avg_cost": ..., "entry_action": ...}` on the order. If the position is not found (e.g., partial close reducing qty rather than fully closing), still record what is available. The extra SELECT per close leg is acceptable — close is an infrequent user action, not a hot read path.

---

## 9. Frontend State Management

### `Positions.tsx` — Close Modal (FR-5)

| Component | State owned | Props received | Loading state | Error state | Empty state |
|-----------|-------------|----------------|---------------|-------------|-------------|
| `Positions` (existing) | `closePrice: number`, `closePriceError: string \| null` added alongside existing `closingPos`, `closeQty` | — | `closeLoading` (unchanged) | Inline under price input | N/A |

**State additions:**
- `closePrice: number` — initialised to `closingPos.current_price` when `setClosingPos(pos)` is called.
- `closePriceError: string | null` — set to `"Price must be ≥ 0"` when `closePrice < 0`, otherwise `null`.

**Modal changes:**
- Replace the static "Close price (current)" display row with a controlled `<input type="number" min="0" step="0.01">` labelled "Closing price (per contract)".
- "Est. proceeds / cost" computation becomes `closePrice * closeQty * 100` (reactive).
- The Confirm Close button is `disabled` when `closePriceError !== null`.
- `handleConfirmClose` uses `closePrice` instead of `closingPos.current_price` in the `recordTrade` legs array.
- Reset `closePrice` to `closingPos.current_price` whenever `closingPos` changes (via `useEffect([closingPos])`).

### `Positions.tsx` — Closed Positions Accordion (FR-1)

| Component | State owned | Props received | Loading state | Error state | Empty state |
|-----------|-------------|----------------|---------------|-------------|-------------|
| `ClosedPositions` (new, inside `Positions.tsx`) | `open: boolean` (accordion toggle) | `positions: ClosedPosition[]` | N/A (parent owns load) | N/A (hidden if empty) | Not rendered when `positions.length === 0` |
| `Positions` (existing) | `closedPositions: ClosedPosition[]`, `closedLoading: boolean` added | — | Shows skeleton or suppresses accordion | Suppresses accordion silently | Accordion not rendered |

The `load()` callback (in `Positions`) adds a call to `getClosedPositions()` via `Promise.allSettled`. On success, sets `closedPositions`. On failure, sets `closedPositions` to `[]` (accordion hidden).

The `ClosedPositions` component renders:
- An accordion header button: "Closed Positions (N)" where N is the count. Defaults collapsed.
- When expanded: a scrollable table with columns: Symbol, Strategy, Expiry, Settlement Price, Entry Price, P&L $, P&L %, Source badge.
- Settlement source badge: chip with label "Market" (blue), "Intrinsic" (amber), or "Expired Worthless" (muted), coloured to distinguish at a glance. Manual closes have no badge.
- Rows with `realised_pnl_pct >= 0` get green P&L colouring; negative gets red.

### `RiskMonitor.tsx` — FR-2, FR-3, FR-4

| Component | Change | State/Props affected |
|-----------|--------|---------------------|
| `RiskListRow` | Add `stockPrices: Record<string, number>` prop | Read `stockPrices[group.positions[0]?.symbol]` for spot display |
| `RightPanelHeader` | Add `stockPrices: Record<string, number>` prop | Read spot price for group's first position symbol |
| `LegCard` | CSS-only: `whiteSpace: 'nowrap'` on ENTRY→NOW span; `flexWrap: 'wrap'` + `flexShrink: 0` on the outer div | No new props |
| `RiskMonitor` (main) | Thread `stockPrices` to `RiskListRow` at all four render sites (desktop SortBar list, desktop date-grouped list, mobile SortBar list, mobile date-grouped list) | No new state |

**FR-2 — Spot price display:**
In `RiskListRow`, below the DTE/P&L meta row, add:
```jsx
{stockPrices[symbol] != null && (
  <span style={{ fontSize: '10px', color: C.muted }}>
    {symbol} ${fmt(stockPrices[symbol])}
  </span>
)}
```
In `RightPanelHeader`, inline after the strategy name and risk badge row:
```jsx
{spotPrice != null && (
  <span style={{ fontSize: '12px', color: C.muted }}>
    {symbol} ${fmt(spotPrice)}
  </span>
)}
```
Omitted entirely when spot price is unavailable (AC2-3). `RiskMonitor`'s existing `stockPrices: Record<string, number>` state is the data source.

**FR-3 — ENTRY→NOW nowrap:**
In `LegCard`, the bottom-row div currently has `display: flex; justifyContent: space-between`. Change to add `flexWrap: 'wrap'`. Add `whiteSpace: 'nowrap' as const; flexShrink: 0` to the ENTRY→NOW outer `<span>`. The P&L `<span>` stays as-is; at narrow widths it will wrap to a second line.

**FR-4 — Ticker chip in trade headers:**
Both `RiskListRow` and `RightPanelHeader` receive the `StrategyGroup` object which contains `group.positions[0].symbol`. The ticker is only shown as a chip when `group.label !== group.positions[0]?.symbol` (prevents duplication for single-leg trades whose label already is the symbol — AC4-3).

```jsx
const ticker = group.positions[0]?.symbol
const showTicker = ticker && group.label !== ticker
// Render after the strategy label:
{showTicker && (
  <span style={{
    fontSize: '10px', fontWeight: 700, color: C.accent,
    background: `${C.accent}18`, border: `1px solid ${C.accent}33`,
    borderRadius: '4px', padding: '1px 5px', flexShrink: 0,
  }}>
    {ticker}
  </span>
)}
```

Both the desktop `RiskListRow` (left panel) and `RightPanelHeader` (detail panel) receive this treatment. Mobile accordion uses `RiskListRow` and `RightPanelDetail` → `RightPanelHeader`, so both layouts are covered by the same component changes (AC4-4).

---

## 10. `client.ts` Additions

```typescript
export interface ClosedPosition {
  symbol: string
  strategy_name: string | null
  expiry: string
  strike: number
  option_type: string
  settlement_price: number
  entry_avg_cost: number | null
  quantity: number
  entry_action: string
  realised_pnl: number | null
  realised_pnl_pct: number | null
  settlement_source: 'market' | 'intrinsic' | 'worthless' | null
  closed_at: string
  is_auto_settled: boolean
}

export const getClosedPositions = (): Promise<ClosedPosition[]> =>
  api.get<ClosedPosition[]>('/positions/closed', { timeout: 30000 }).then(r => r.data)
```

---

## 11. Subscription Tier Enforcement

No new tier gates are introduced. Auto-settle (FR-1) runs for all tier users because the `positions` feature is available to all tiers. The Closed Positions accordion is part of the Positions tab which is already gate-checked upstream in `App.tsx` via entitlements. The three Risk Monitor changes (FR-2/3/4) are inside `RiskMonitor.tsx` which is already conditionally rendered based on the `risk_monitor` entitlement.

The three trigger endpoints (`GET /api/positions`, `GET /api/portfolio`, `GET /api/positions/risk`) and the new `GET /api/positions/closed` all sit behind `Depends(legal_gate_dep)` on the `positions.py` router, which is consistent with the existing auth gate.

---

## 12. Edge Cases

| Scenario | Handling |
|----------|---------|
| Two concurrent requests hit `/api/positions` at the same millisecond for the same user | Atomic `DELETE WHERE id = ?` at the Postgres row level — exactly one request deletes the row; the other finds `result.data == []` and skips. No double-settle. |
| Position expired on a Saturday or Sunday (e.g., user manually entered a weekend date) | `_get_historical_close()` uses a ±3-day window and takes the last row whose date ≤ expiry_date. This will return Friday's close as the nearest prior trading day. |
| User has been offline for 6 weeks; 15 positions expired | `auto_settle_expired()` processes all 15 in a single loop. Each calls `_get_historical_close()` synchronously. Worst-case latency: 15 × ~1s = ~15s. This is within the existing 45s timeout on `GET /api/positions`. For `/api/portfolio` (also 45s timeout per client.ts) and `/api/positions/risk` (60s timeout), also within budget. |
| yfinance throttles during a batch settlement | `_get_historical_close()` returns `None` on exception → falls to $0 worthless. Cash impact: long position loses premium (already deducted at open), short position retains premium (already credited). |
| Position `avg_cost = 0` (edge case from legacy data) | `realised_pnl_pct` returns `null` to avoid division by zero. The `realised_pnl` (dollar amount) is still computed correctly. |
| `strategy_name` is "Manual" (not linked to a strategy) | Works identically. settlement_metadata preserves `strategy_name` as "Manual". No strategy target calculations involved in settlement. |
| Manual close leg: position not found before `_update_position` | `settlement_metadata` stored as `null`. The closed position appears in `/positions/closed` with `realised_pnl: null` and `realised_pnl_pct: null`. |
| User enters $0.00 as closing price (FR-5) | Valid — treated as closing at zero (e.g., expiring worthless long). `closePrice = 0` passes validation (not negative). `recordTrade` receives `price: 0`, which `user_portfolio.py` replaces with `0.01` (the existing `price <= 0 → 0.01` guard). A `$0.01` floor is preserved. |
| Spot price unavailable in `stockPrices` for a Risk Monitor group (FR-2) | The spot price elements are simply not rendered (conditional on `stockPrices[symbol] != null`). No error state. |

---

## 13. New Environment Variables

None. No new Python packages are required. yfinance is already in `backend/requirements.txt`.

---

## 14. ADR References

- `docs/adr/0015-lazy-auto-settlement-on-read.md` — Records the decision to trigger auto-settlement lazily on endpoint read rather than via a scheduled job, and analyses the concurrency idempotency approach.

---

## 15. Architect Gate Decision

☐ Approved ☐ Changes Requested

_Approved by:_ &nbsp;&nbsp; _Date:_

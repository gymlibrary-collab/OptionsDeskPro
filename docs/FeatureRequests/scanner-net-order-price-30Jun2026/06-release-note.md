# Release Note — Scanner Net Order Price Guidance Box

**Version:** v1.13.0
**Date:** 30 Jun 2026
**Release Type:** Frontend enhancement (no backend change)

---

## What's New

When you expand a **multi-leg strategy card** in the Strategy Scanner's deep-analysis flow, a new **Net Order Price box** now appears directly below the "How to place this trade" panel's existing grey summary row.

The box displays the exact signed net price you need to key into your broker as a single **combo order** — the price real brokers (ThinkorSwim, Tastytrade, IBKR, Webull) require for multi-leg trades. You no longer compute `2 × $14.80 − $28.26 − $4.83 = −$3.49` by hand before placing the order.

### What the box shows

For a **debit strategy** (you pay to enter):
- **Large signed number:** `−3.49` (the negative sign matters).
- **Debit tag:** coloured red.
- **Per-spread total:** `−$349` (the amount per contract, 100 shares).
- **Broker toggle alternative:** `DR 3.49` for brokers using a separate Debit/Credit toggle instead of signs.
- **Direction guide:** "Key the negative number. Better fill = less negative (pay less, lower max loss). Worse fill = more negative."

For a **credit strategy** (you collect premium to enter):
- **Large signed number:** `+2.15` (the positive sign matters).
- **Credit tag:** coloured green.
- **Per-spread total:** `+$215`.
- **Broker toggle alternative:** `CR 2.15`.
- **Direction guide:** "Key the positive number. Better fill = more positive (collect more). Worse fill = less positive."

On **desktop (viewport ≥480px)**, the box shows the full arithmetic formula from the visible leg mids:
```
net = (2 × $14.80) − $28.26 − $4.83 = −$3.49
```

On **mobile (<480px)**, the formula is condensed to a single line:
```
net = −3.49 (debit)
```

The large signed number, debit/credit tag, per-spread total, DR/CR alternative, and direction guide remain fully visible on all screen sizes.

### Which strategies show the box

- **Multi-leg strategies show the box:** Iron Condor, Bull Call / Put Spread, Call / Put Butterfly, Broken Wing Butterfly, Strangle, Straddle, Calendar Spread, Ratio Spread, ZEBRA (back-ratio), and all other strategies with two or more option legs.
- **Single-leg strategies do NOT show the box:** Short Naked Put, Short Naked Call, Covered Call, Covered Put. No extra whitespace or visual artifact appears.

### If leg mids are unavailable

When one or more legs has a zero or missing mid price (rare, typically on very illiquid tickers or synthetic Black-Scholes data fallback), the box displays an **amber caution note** instead:

```
One or more leg mids are unavailable — verify the net price on your broker before placing this order.
```

The formula, signed number, per-spread total, and direction guide are suppressed until live quotes are available. This prevents you from keying in a misleading number based on stale or synthetic data.

---

## What Does NOT Change

- **Existing numbered legs table** — each leg row (BUY/SELL badge, option type, quantity, strike, expiry, Greeks, Pay/Collect) is unchanged.
- **Grey "Net / Exit when" summary row** — the existing net debit/credit and exit guidance text are unaffected.
- **Breakeven display** — still shown when applicable.
- **"Record Trade" sidebar** — the order-entry panel remains unchanged.
- **Strategy narrative** — the 7-section AI narrative is untouched.
- **Any tier restrictions** — the box is visible to all tiers that have access to the Strategy Scanner deep-analysis view (free / starter / pro / enterprise).

---

## Why This Matters

**For active traders:** When you scan 20 symbols and need to act fast, reading the net price directly from the card without calculator context-switching saves time.

**For learners:** The box teaches you the broker convention (signed numbers vs DR/CR toggles) so the transition from paper trading to a real broker is smooth. The direction guide ("less negative is better") translates the number into a clear execution instruction.

**For beginners:** Trying to compute a 4-leg Iron Condor's net in your head risks a keying error. The exact formula — displayed or condensed — shows the arithmetic so you trust the number.

---

## Deployment

**Frontend-only redeploy:** Railway frontend service to v1.13.0. No backend changes, no database migration, no API endpoint change.

**Rollback:** If a critical issue is discovered, revert `frontend/src/components/StrategyDetail.tsx` to the prior commit and redeploy.

---

## Testing Summary

**Automated E2E:** 35 new Playwright tests, 35 passed, 0 failed.
- Multi-leg strategies render the box with correct signed net, formula, DR/CR, and direction guide.
- Single-leg strategies show no box.
- Zero-mid guard shows amber caution.
- Mobile responsive layout condensed formula for viewports < 480px.
- Existing panel regression guard: no leg rows, Net/Exit summary, or narrative changes.

**Manual exploratory:** 58 test cases across 11 areas (gate logic, arithmetic, Debit/Credit tag and direction guide, DR/CR alternative, mobile, zero-mid amber caution, consistency vs existing "Net:" line, regression, edge cases, auth/entry paths). All pass.

**Known limitations:** Calendar-spread trades show a single expiry date label across both legs (pre-existing, out of scope). Resize event listener has no debounce (negligible performance impact).

---

## Getting Started

No user action required. The box appears automatically when you expand any multi-leg strategy in the Scanner's deep-analysis flow. Read the net price and direction guide, key the signed number into your broker's order ticket, and execute.

For single-leg strategies (Short Naked Put, etc.), the panel looks exactly as it did before — no change.

---

## Questions?

Refer to the **User Guide → Strategy Scanner** section for a walkthrough of the "How to place this trade" panel and the Net Order Price box.

# Security Review — Interpreter v1 Narrative Improvements

**Date:** 24Jun2026
**Reviewer:** Security Reviewer Agent
**Branch:** claude/modest-davinci-sxz7lv
**Feature folder:** `docs/FeatureRequests/interpreter-improvements-24Jun2026/`

---

## Scope

Files reviewed in this sprint:

1. `backend/services/interpreter.py` — 13 functional improvements to the rule-based narrative generator covering: DTE guard for calendar reminder (FR-B1), bearish debit headline framing (FR-B2), POP conditional framing (FR-B3), markdown removal (FR-B4/R2), broker approval level branching (FR-C6), earnings_note surfacing (FR-E1), IV environment label (FR-G5), debit GTC profit_target_pct (FR-B6), POP backtesting language correction (FR-C5), DTE-aware loss monitor (FR-C1), conditions-match note (FR-N4), condition_explanation surfacing (FR-N2), plus the LEG step format change to `LEG {i}: {verb}...` (FR-R1).
2. `frontend/src/components/StrategyNarrative.tsx` — checklist step label rendering: bold `label: body` format extraction via `colonIdx`.
3. `frontend/src/components/StrategyDetail.tsx` — minor UI additions (GreeksPanel, IVSourcePill, ConditionIndicator, ComparisonMatrix); no auth or secret-handling changes.
4. `frontend/e2e/pages/narrative-improvements.spec.ts` — Playwright test file (24 tests, not shipped to production).

No new API endpoints, no database schema changes, no new external service calls, and no new environment variables were introduced by this sprint.

---

## Findings

### Critical

None.

### High

None.

### Medium

None.

### Low

**L-1: `earnings_note` content originates from the strategy engine, not directly from user input, but passes through with no length cap**

`interpreter.py` line 544 injects `trade.get("earnings_note")` directly into the narrative text:

```python
if earnings_note:
    sections.append(f"EARNINGS-AWARE EXPIRY: {earnings_note}")
```

`earnings_note` is constructed in `strategy_engine.py` by internal logic (not from user-supplied text), so this is not a direct injection vector. However, if the field were ever populated from an untrusted source (e.g. a future route change merging external data into the trade dict without sanitisation), the string would propagate directly into the narrative without truncation or escaping. The risk is low in the current architecture but warrants a note for future maintainers.

**Recommended action:** Add a defensive truncation or note in a code comment that `earnings_note` must originate from `strategy_engine.py` only, not from user input or external API responses.

**Risk level: Low** — the field is currently populated by internal server-side logic only. No user can control its content in the current request/response flow.

---

**L-2: `symbol` parameter is embedded in narrative strings without sanitisation**

Throughout `interpreter.py`, the ticker symbol (e.g. `"AAPL"`) is embedded directly into f-strings that form the narrative output:

```python
f"{symbol} is trading at ${price:.2f}, sitting {abs(gap_20):.1f}% above its 20-day moving average"
```

The `symbol` value originates from a route path parameter and is passed through to the strategy engine and then to `generate_narrative`. If a symbol containing shell-metacharacters or HTML were passed, it would appear verbatim in the narrative text. However:

- The frontend renders all narrative strings via the `Paragraphs` component (`<p>` elements with `whiteSpace: pre-wrap`), which outputs the value as a React text node — not as `innerHTML`. XSS is not possible through this rendering path.
- The symbol is already used in external API calls (yfinance) before reaching the interpreter, so any injection into external services would occur upstream of this code. The interpreter itself does not make external calls.
- No SQL concatenation occurs.

**Recommended action:** Confirm that the route layer validates symbol to match a safe pattern (e.g. `/^[A-Z0-9.^-]{1,10}$/`). This was not introduced by this sprint and is out of scope, but the interpreter's verbatim embedding makes it worth flagging.

**Risk level: Low** — narrative is rendered as React text nodes, not HTML. No XSS path exists in the current frontend rendering architecture.

---

### Informational

**I-1: `StrategyNarrative.tsx` renders all narrative sections as React text nodes**

All narrative text is passed to either the `Paragraphs` component (which creates `<p>` elements with text content) or rendered as `{narrative.headline}` directly inside a `<div>`. No `dangerouslySetInnerHTML`, no `innerHTML` assignment, and no markdown parser is present. The narrative output from `interpreter.py` is correctly treated as plain text throughout the frontend. XSS via narrative content is not possible in the current implementation.

**I-2: Checklist copy-to-clipboard uses `navigator.clipboard.writeText`**

`StrategyNarrative.tsx` line 148 uses `navigator.clipboard.writeText(text)` where `text` is assembled by mapping the `execution_checklist` array to numbered strings. This is a standard, safe Web API. No HTML is written to the clipboard; only plain text is copied.

**I-3: No new unauthenticated endpoints introduced**

The changes are entirely within `interpreter.py` (a pure-Python service function with no HTTP interface of its own) and frontend rendering components. The existing route `GET /api/strategies/analyze/{symbol}` which calls `generate_narrative` continues to enforce auth via `sb.auth.get_user(credentials.credentials)` in `strategies.py` (line 147). No new routes were added.

**I-4: The E2E test file mocks all API calls and never contacts real services**

`narrative-improvements.spec.ts` stubs every backend route via `page.route(...)`. It does not transmit real credentials, tokens, or secrets. The auth bypass fixture in `frontend/e2e/fixtures/auth.ts` is used consistently. No real OAuth flows occur during CI.

**I-5: `condition_explanation` is sourced from the strategy catalog hardcoded in `strategy_engine.py`**

FR-N2 surfaces `strategy.get("condition_explanation", "")` from the strategy dict. This field is populated from the 31-strategy catalog defined in `strategy_engine.py`, not from user input or any external API. Its content is developer-authored text only. No injection risk.

**I-6: `designed_for_iv` and `designed_for_direction` comparison uses controlled set membership**

FR-N4 implements a conditions-match check using `_DIR_MAP`, a hardcoded dict mapping string values to sets of valid bias strings. The comparison `bias in _DIR_MAP.get(designed_for_dir, set())` is safe — no dynamic evaluation, no deserialization, no user-controlled input reaches this branch.

**I-7: Box-drawing character `chr(9472)` in confirmation summary**

`_confirmation_summary` uses `chr(9472) * 40` as a decorative separator. This is a Unicode codepoint rendered as text. No security implication; noted as the cosmetic defect FR-R3 (deferred to backlog).

---

## Invariant Checklist

- [x] **JWT verification intact (no python-jose):** `python-jose` is absent from `requirements.txt` and from all source files. `auth_utils.py` uses `sb.auth.get_user(token)` exclusively. No change to this mechanism in the sprint.
- [x] **No Alpaca integration:** No `alpaca-py`, `alpaca_broker.py`, or Alpaca API references appear anywhere in the changed files or the broader backend.
- [x] **No MARKETDATA_API_TOKEN:** The token does not appear in any backend file or frontend file. yfinance remains the sole market data source.
- [x] **No secrets in narrative output:** `interpreter.py` constructs narrative from market data, computed values, and catalog text only. No environment variables, API keys, or internal infrastructure details are interpolated into the output strings.
- [x] **XSS: frontend renders narrative as text, not HTML:** All narrative sections in `StrategyNarrative.tsx` are rendered via React text nodes (`<p>` children, `{narrative.headline}` in a `<div>`). No `dangerouslySetInnerHTML`. No markdown parser. Confirmed no `innerHTML` or `__html` usage in the file.
- [x] **No new unauthenticated endpoints:** No new routes introduced. The `analyze/{symbol}` endpoint continues to validate the bearer token via `sb.auth.get_user`. The endpoint accepts unauthenticated requests (returns public analysis without entitlements) but this is pre-existing behaviour, not introduced by this sprint.
- [x] **No SQL or shell injection vectors:** `interpreter.py` makes no database calls and no shell calls. All string assembly is f-string formatting with typed numeric and string values from the strategy engine output.
- [x] **No new external service calls:** The interpreter is a pure computation function. It calls no external APIs, makes no HTTP requests, and has no I/O side effects.
- [x] **`SUPABASE_JWT_SECRET` absent:** Confirmed absent from all files including the changed files. Not added by this sprint.
- [x] **No new `VITE_` prefixed secrets:** No new frontend environment variables introduced. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` remain the only `VITE_` variables.

---

## Summary Assessment

This sprint is a pure text-generation improvement. The interpreter is a stateless Python function that takes typed dicts from the strategy engine and returns a dict of narrative strings. It performs no I/O, no database access, no authentication logic, and no external API calls. The frontend renders the output exclusively as React text nodes with no HTML interpretation path.

The two Low findings (L-1, L-2) are informational in nature and document architectural considerations for future maintainers rather than active vulnerabilities. Neither represents an exploitable flaw in the current implementation.

No Critical, High, or Medium findings were identified.

---

## Gate Decision

**PASS** — No Critical or High findings. The feature is clear to proceed to Gate 6 (Release).

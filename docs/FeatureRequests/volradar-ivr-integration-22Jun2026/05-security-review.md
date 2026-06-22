# Security Review — Volradar IVR Integration

**Date:** 22Jun2026
**Reviewer:** Security Reviewer
**Commits audited:** a77b23e..b134a84 (12 commits)
**Overall Decision:** FAIL

---

## 1. Scope

**Files reviewed:**

- `backend/routes/auth_routes.py`
- `backend/routes/admin_routes.py`
- `backend/services/iv_analysis.py`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/components/admin/HealthPanel.tsx`
- `frontend/src/components/AdminPanel.tsx`
- `frontend/src/api/client.ts`

---

## 2. Findings

### Critical (block release)

None.

### High (block release)

| ID | File | Line | Description | Recommendation |
|----|------|------|-------------|----------------|
| H01 | `backend/routes/admin_routes.py` | 559–583 | **SSRF via unvalidated `symbol` parameter in debug endpoint.** `symbol` is accepted as a free-form string query parameter (default `"AAPL"`), uppercased, and then substituted directly into the volradar API URL as a query param: `params={"ticker": SYM}`. Although the target host is hardcoded to `_VOLRADAR_API_URL` (volradar.com), the `symbol` value is also echoed into the `api_url` string used for logging: `api_url = f"{_VOLRADAR_API_URL}?ticker={SYM}"` and returned verbatim to the caller inside `steps[].url`. More critically, there is no allowlist or format enforcement on `symbol`. A ticker value such as `"AAPL%00"`, `"/../"`, or a very long string is passed to `curl_cffi` as a query param and to `_fetch_volradar_ivr_uncached` which also passes it unsanitised into `params={"ticker": symbol.upper()}`. While curl_cffi does not allow changing the target host through a query param, a malformed symbol can cause the backend to make a request that leaks the server's outbound IP to an attacker-controlled DNS resolver if volradar.com ever resolves the encoded ticker as a sub-path (depends on curl_cffi URL normalisation). The immediate risk is reflected-content injection: `raw_snippet: body[:500]` returns the first 500 bytes of whatever HTTP response body the target returns, which could be attacker-influenced if a crafted ticker triggers a redirect to a server the attacker controls. Enforce a strict allowlist regex on `symbol` (e.g. `^[A-Z]{1,10}$`) before passing it to any external call or including it in logged/returned URLs. | Add input validation: `if not re.match(r'^[A-Z]{1,10}$', SYM): raise HTTPException(422, "Invalid symbol")` immediately after `SYM = symbol.upper()`. |
| H02 | `backend/routes/auth_routes.py` | 348–351 | **Tokens passed in URL fragment expose access and refresh tokens to browser history, Referer headers, and intermediary logs.** After the OAuth callback, both `session.access_token` and `session.refresh_token` are percent-encoded and appended to the redirect URL as a fragment: `f"{target_origin}/#sb_access_token={at}&sb_refresh_token={rt}"`. URL fragments are not sent to servers in HTTP requests, but they ARE recorded in the browser's navigation history (accessible to any script on the same origin), visible in Referrer-Policy–noncompliant redirects on older browsers, readable by browser extensions, and logged by proxies or WAFs that capture the full URL. The refresh token in particular is long-lived (Supabase default: 60 days); leaking it via this channel creates a persistent session-hijacking risk. The frontend immediately hands both tokens to `supabase.auth.setSession()` and `window.history.replaceState` removes the fragment, which is a partial mitigation — but the token lives in the URL for the entire duration of the page load, including any third-party script that executes synchronously before `replaceState` runs. The httpOnly cookie path (`_set_auth_cookies`) is already set in the same response; for same-domain deployments the cookie path alone is sufficient and the fragment should be dropped. For cross-domain deployments, a back-channel token handoff (e.g. short-lived one-time code stored server-side, exchanged by the frontend for the token pair) is the appropriate pattern. | Remove tokens from the URL fragment. For same-domain deployments rely solely on the httpOnly cookies. For cross-domain, implement a short-lived (≤30 s) one-time-code endpoint: callback stores tokens server-side keyed by a random nonce, redirects to `frontend/?code=<nonce>`, frontend exchanges the nonce for tokens via a POST. |

### Medium (fix before next release)

| ID | File | Line | Description | Recommendation |
|----|------|------|-------------|----------------|
| M01 | `backend/routes/auth_routes.py` | 215 | **`portal` query parameter is not validated against an allowlist.** The `portal` param is accepted as a free-form `str` on a public endpoint (`/api/auth/google` has no auth guard). Any value is accepted; only `"admin"` triggers the cookie branch, so open redirect is not directly possible here (the redirect goes to the Supabase OAuth URL, not the portal value). However, an arbitrary `portal` value is silently accepted and ignored, creating a misleading security model. If future code ever interpolates `portal` into a redirect URL (a common maintenance error), the open redirect surface is already in place. Validate: `if portal not in ("client", "admin"): portal = "client"`. | Clamp to allowlist at the top of the handler. |
| M02 | `backend/routes/admin_routes.py` | 569–583 | **`raw_snippet` in debug response returns up to 500 bytes of unfiltered external HTTP response body.** The response from volradar.com (step 2 of the debug probe) is partially returned to the admin caller as `raw_snippet: body[:500]`. If the external server is compromised or replaced (supply-chain / DNS hijack), this field could contain malicious HTML/JS which would be rendered in the admin UI. The `HealthPanel.tsx` frontend currently renders result fields without `dangerouslySetInnerHTML`, so XSS via React is low risk, but the raw bytes could still contain log-injection payloads. The field should either be removed from the response or its value sanitised before inclusion. | Remove `raw_snippet` from the response, or at minimum strip it to printable ASCII with a regex before returning. |
| M03 | `backend/services/iv_analysis.py` | 27 | **Unbounded in-process cache `_VOLRADAR_CACHE` is a module-level dict with no size limit.** An attacker or malfunctioning caller can exhaust heap memory by querying arbitrarily many distinct symbol strings (each up to the FastAPI query param length limit, ~8 KB), causing each unique string to be inserted as a new cache key with a TTL up to 3600 seconds. There is no LRU eviction, no maximum entry count, and no size cap on the key string itself. Combined with the lack of symbol format validation (H01), this is a potential denial-of-service vector. | Cap the cache at a fixed size (e.g. 500 entries) using `functools.lru_cache` or a simple FIFO eviction on insertion. Apply the format allowlist from H01 before inserting into the cache. |
| M04 | `backend/routes/auth_routes.py` | 338–351 | **`auth_portal` cookie value is read from the request and used to select the redirect target without verifying it matches a server-side allowlist.** The callback reads `portal_cookie = request.cookies.get("auth_portal", "client")` and acts on it. The cookie is set httpOnly by the server and has a 10-minute TTL, which significantly limits exploitability. However, if a subdomain or same-site page can set or overwrite cookies (a cookie-injection scenario), an attacker could set `auth_portal=admin` to divert a victim's post-auth redirect to `_ADMIN_FRONTEND_ORIGIN`. The token fragment (H02) would then be delivered to the admin portal's localStorage. The cookie is set httpOnly, so it cannot be set by JavaScript on the same origin; the risk only materialises if there is a subdomain cookie-injection path. Nonetheless, defensive practice is to validate the cookie value against the same two-value allowlist. | After reading `portal_cookie`, clamp it: `portal_cookie = "admin" if portal_cookie == "admin" else "client"`. This is already implicitly done by the `if portal_cookie == "admin"` check, so this is a defence-in-depth annotation / documentation issue rather than a code change, unless `_ADMIN_FRONTEND_ORIGIN` itself could be attacker-influenced. |

### Low / Informational

| ID | Description | Notes |
|----|-------------|-------|
| L01 | **`curl_cffi` impersonates Chrome 120 UA to bypass Cloudflare bot detection on volradar.com.** This constitutes scraping a third-party site by misrepresenting the client identity. The legality and ToS-compliance depends on volradar.com's terms of service. This is a legal/commercial risk rather than a technical security finding, but it is noted because it means the application could be blocked or sued if volradar.com objects. | Obtain an official API agreement with volradar.com or switch to a licensed data provider. |
| L02 | **`VITE_PORTAL_MODE` is a build-time public env var that controls which portal the frontend claims to be (`client` or `admin`).** Its value is embedded in the JS bundle. An attacker can build a `VITE_PORTAL_MODE=admin` bundle and host it at an arbitrary URL; this does not grant admin access (the backend enforces `require_admin()` on all admin routes) but it does mean the frontend will send `portal=admin` to `/api/auth/google`, which (if `_ADMIN_FRONTEND_ORIGIN` is configured) redirects post-auth tokens to the admin frontend. This is only exploitable by an admin-level user, so it is informational. | No code change required; document that `_ADMIN_FRONTEND_ORIGIN` should only be configured to a trusted domain. |
| L03 | **The `auth_portal` cookie uses `samesite="lax"` rather than `samesite="strict"`.** `Lax` permits the cookie to be sent on top-level cross-site navigations (exactly the OAuth redirect flow, by design). The PKCE `pkce_code_verifier` cookie also uses `lax`. This is the correct setting for this flow; it is noted for completeness. | No change required. |
| L04 | **Debug endpoint `/api/admin/debug/ivr-fetch` makes two synchronous outbound HTTP calls inside a FastAPI sync route handler (`def`, not `async def`).** With uvicorn's default thread pool this will block one thread per request for up to `_VOLRADAR_TIMEOUT` (10 s) × 2 = 20 s, plus the time for `_fetch_volradar_ivr_uncached` which makes two more calls. An admin can inadvertently cause significant thread pool exhaustion by rapidly invoking the endpoint. | Convert to an `async` route using `asyncio.to_thread` or `loop.run_in_executor` for the blocking curl_cffi calls. Low urgency since the endpoint is admin-only. |
| L05 | **JWT invariant check — PASS.** No `python-jose` import found in any changed file. `SUPABASE_JWT_SECRET` is absent. Token verification continues to use `sb.auth.get_user(token)` via `verify_token` in `auth_utils.py`. Invariant is intact. | No action required. |
| L06 | **Secret exposure check — PASS.** `MARKETDATA_API_TOKEN`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_JWT_SECRET` do not appear in any frontend file or `VITE_` environment variable. `VITE_PORTAL_MODE` is a routing hint, not a secret. | No action required. |

---

## 3. Invariant Checklist

| Check | Result | Notes |
|-------|--------|-------|
| All new routes use `require_user()` or `require_admin()` | Pass | `/api/admin/debug/ivr-fetch` uses `admin_required` (wraps `require_admin`). `/api/auth/google` and `/api/auth/callback` are intentionally unauthenticated (OAuth flow entry points). |
| No python-jose in codebase | Pass | Not present in any changed file. |
| No `SUPABASE_JWT_SECRET` in codebase | Pass | Absent. |
| JWT verified via `auth.get_user(token)` | Pass | `verify_token` in `auth_utils.py` is unchanged and is the sole verification path. |
| `MARKETDATA_API_TOKEN` absent from frontend | Pass | Not present. |
| `SUPABASE_SERVICE_KEY` absent from frontend | Pass | Not present. |
| No `VITE_` prefixed secret variables for backend secrets | Pass | `VITE_PORTAL_MODE` is a non-secret routing hint. `VITE_BACKEND_URL` and `VITE_SUPABASE_ANON_KEY` are existing publishable values. |
| No raw SQL string concatenation with user input | Pass | No direct SQL in changed files; all DB access through Supabase client with parameterised calls. |
| No shell commands constructed from user input | Pass | No `subprocess`, `os.system`, or shell invocations. curl_cffi makes HTTP calls only to hardcoded URLs. |
| IDOR: user data scoped to authenticated user ID | Pass | Debug endpoint is admin-gated; no per-user data is exposed. |
| RLS policies not weakened by migration | Pass | No migrations in this changeset. |
| Numeric inputs validated before calculations | Pass | `_to_decimal` defensively wraps float conversion. IVR values from volradar are treated as untrusted floats; no arithmetic overflow risk. |

---

## 4. Gate Decision

**Critical findings:** 0
**High findings:** 2 (H01 — SSRF/injection via unvalidated symbol; H02 — tokens in URL fragment)

[x] **FAIL** — Two High findings present. Feature must not be deployed until H01 and H02 are resolved.

**Conditions for re-promotion to CONDITIONAL PASS or PASS:**

1. H01: Add `re.match(r'^[A-Z]{1,10}$', SYM)` guard at the top of `debug_ivr_fetch` before any use of `SYM` in external calls or response fields. Also apply an equivalent guard in `_fetch_volradar_ivr` / `_fetch_volradar_ivr_uncached` for the production path.
2. H02: Remove `sb_access_token` and `sb_refresh_token` from the URL fragment in the OAuth callback redirect. For same-domain deployments, the httpOnly cookies already set by `_set_auth_cookies` are sufficient. For cross-domain deployments, implement a short-lived server-side one-time code exchange.
3. M01–M03 are recommended to be addressed in the same patch. M03 (unbounded cache) is particularly important if H01 is fixed, because the cache key will still accept any ticker until M03's cap is in place.

---

## 5. Remediation Tracking

| Finding ID | Fixed in commit | Verified by | Date |
|------------|-----------------|-------------|------|
| H01 | — | — | — |
| H02 | — | — | — |
| M01 | — | — | — |
| M02 | — | — | — |
| M03 | — | — | — |
| M04 | — | — | — |

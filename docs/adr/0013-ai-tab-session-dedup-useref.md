# ADR-0013 — Per-Session Deduplication of `ai_features_enabled` Event: `useRef` vs `sessionStorage`

**Date:** 25Jun2026
**Status:** Accepted
**Feature:** Legal T&C Acknowledgment Tracking and Subscriber Activity Log (legal-and-activity-log-25Jun2026)

---

## Context

Story 8 requires an `ai_features_enabled` event to fire once per session when the subscriber first opens the AI Features tab. "Once per session" means: if the subscriber opens the AI tab, navigates away, and comes back in the same login session, no second event is fired. If they log out and log back in, a new event fires on the next AI tab open.

The dedup must be client-side — no server-side dedup was specified, and the activity log is append-only (ADR-0009).

Two mechanisms were considered: `useRef<boolean>` and `sessionStorage`.

---

## Decision: `useRef<boolean>` in the `Dashboard` component

A `useRef<boolean>` named `aiTabLoggedRef` is declared in the `Dashboard` component in `App.tsx`. It is initialised to `false`. When `activeTab === 'ai'` and `aiTabLoggedRef.current === false`, the event is fired and the ref is set to `true`. It is never reset to `false` within the same `Dashboard` mount.

The `Dashboard` component unmounts on logout (the `AuthProvider` clears the `user` state, causing `App.tsx` to render the `LoginPage` instead of `Dashboard`). On the next login, `Dashboard` re-mounts and `aiTabLoggedRef` is initialised to `false` again.

---

## Alternatives Considered

**Option A — `sessionStorage` with a per-session key.**

Store a flag like `sessionStorage.setItem('ai_tab_logged_' + sessionId, '1')` after the first AI tab open. Read the key before firing to deduplicate.

Rejected because:
1. `sessionStorage` survives component unmount/remount within the same browser tab and browser session (it is cleared only when the tab or window is closed). This means that if the user logs out and immediately logs back in without closing the tab, `sessionStorage` would still hold the flag from the previous session — no new event would fire on the next AI tab open. This is incorrect behaviour given the spec's intent ("once per login session").
2. Constructing a reliable "per-session key" requires a session identifier. The Supabase session has an `access_token` which could serve as a key, but tokens are long strings and using them as storage keys adds complexity. A simpler alternative would be a UUID generated at login time and stored in context, but this is additional state purely to support the dedup mechanism.
3. `sessionStorage` would correctly survive a full page refresh within the same tab — but the spec's intent for "session" is "from login to logout", not "from page load to page close". A page refresh causes a full React remount, which means `useRef` would also reset on refresh. Both mechanisms behave identically on page refresh. The `sessionStorage` approach does not offer any material advantage here.

**Option B — Server-side dedup (read `user_action_log` before writing).**

Before inserting the `ai_features_enabled` row, check if a row with the same `user_id`, `action_type`, and `created_at >= today midnight UTC` already exists.

Rejected because:
1. The activity log is explicitly append-only (ADR-0009). No read-before-write logic exists in `log_action()`, and adding it would change the function's semantics for this one action type only.
2. It would double the Supabase round-trips per firing attempt (one SELECT + one INSERT instead of one INSERT).
3. It creates a race condition if the user opens the AI tab twice in rapid succession — both requests might read "no existing row" before either has inserted.
4. The spec is explicit: "Do not introduce server-side dedup — keep the log append-only."

**Option C — `useState<boolean>` instead of `useRef<boolean>`.**

Using `useState` would cause a re-render when the flag is set to `true`, which is unnecessary (the flag is write-once and never read in JSX). `useRef` is semantically correct for a mutable value that does not drive rendering.

---

## Consequences

- The `ai_features_enabled` event fires at most once per `Dashboard` component mount, which corresponds to at most once per login session.
- A full page refresh resets the ref, meaning a subscriber who logs in, opens the AI tab (event fires), and then refreshes the page without logging out would generate a second `ai_features_enabled` event on next AI tab open. This is an acceptable edge case: page refreshes are rare in this SPA, and the spec says "once per session" without defining page refresh as a session boundary. The event is telemetry, not billing or compliance data — minor over-counting is acceptable.
- No new browser storage APIs are used. No dependencies on `sessionStorage` availability (which could theoretically be restricted in privacy-hardened browsers).
- The dedup logic is co-located with the `activeTab` state in `Dashboard`, making it easy for future maintainers to find.

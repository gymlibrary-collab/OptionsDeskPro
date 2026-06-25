# ADR-0012 — "View Activity" Cross-Tab Navigation: Internal React State vs URL Routing

**Date:** 25Jun2026
**Status:** Accepted
**Feature:** Legal T&C Acknowledgment Tracking and Subscriber Activity Log (legal-and-activity-log-25Jun2026)

---

## Context

The admin Users tab needs a "View Activity" button per subscriber row. Clicking it must switch the AdminPanel to the User Actions tab and pre-populate the email filter with the subscriber's email, then auto-execute the search. The spec (OQ-6) explicitly deferred the implementation approach to the architect, noting that URL-based routing would allow bookmarking but that internal state would be simpler.

The current AdminPanel uses a `useState<AdminTab>` to track which tab is active. There is no URL-based routing within the admin panel — the entire app is a single-page application with no React Router installed; navigation between tabs is driven entirely by `setActiveTab(...)` calls.

---

## Decision: Internal React State

Tab selection and cross-tab filter pre-population are implemented as React state within `AdminPanel`:

- `activeTab` — existing `useState<AdminTab>`, no change.
- `userActionsInitialEmail` — new `useState<string>`, lifted into `AdminPanel`.
- `userActionsInitialActionType` — new `useState<string>`, lifted into `AdminPanel`.
- `handleViewActivity(email: string, actionType?: string)` — callback that sets both state values and calls `setActiveTab('user_actions')`.
- `UserActionsTab` receives `initialEmail`, `initialActionType`, and `onEmailConsumed` props. A `useEffect` watching `initialEmail` sets the filter state and calls `onEmailConsumed` to reset the parent.

---

## Alternatives Considered

**Option A — URL query parameters (e.g. `?admin_tab=user_actions&email=x@example.com`).**

Would allow the admin to bookmark a filtered view and share the URL with a second admin. Would survive page refresh.

Rejected because:
1. The application has no React Router or equivalent routing library installed. Adding URL-based tab state would require either installing `react-router-dom` (a new dependency, touching `main.tsx`, `App.tsx`, and every component that reads tab state) or manually parsing `window.location.search` and synchronising it with `useState` — both approaches involve substantially more code than the internal-state solution for a feature used by one operator.
2. The admin panel URL is already admin-authenticated — sharing it with a second admin would expose the email as a plain-text query parameter in browser history, referrer headers, and server logs. For a small single-operator platform, this is not a meaningful security risk, but it is additional surface area for no operational benefit.
3. The spec's PO annotation explicitly states a preference for internal state ("My preference is internal React state (simpler, no routing changes)") and says the decision will not be blocked regardless. The PO assessment of simplicity is correct.
4. The "View Activity" workflow is ephemeral: the admin wants to see one subscriber's events, investigate, and move on. There is no demonstrated need to bookmark or share filtered views.

**Option B — React Context shared between Users tab and UserActionsTab.**

A context provider wrapping `AdminPanel` could hold the current filter state, allowing `UserActionsTab` to read it directly without prop-threading.

Rejected because:
1. The prop-threading depth is exactly one level: `AdminPanel` → `UserActionsTab`. This is the threshold below which a context is unnecessary complexity.
2. Context would make the data flow less traceable to future maintainers: the filter values would flow through a provider rather than appearing explicitly in the `UserActionsTab` JSX.
3. `UserActionsTab` is a self-contained component with its own local filter state (`useState<ActivityFilters>`). Making it read from a context would split its filter state across two locations (the context for the initial value and the local state for user edits), requiring a merge strategy that is more complex than a `useEffect` that sets local state from a prop.

---

## Consequences

- No new dependencies added.
- No URL changes; the admin cannot bookmark a pre-filtered view. Accepted limitation for v1.
- If a second admin is added in future, they cannot receive a link to a pre-filtered subscriber view. This can be addressed in a future feature by adding React Router and replacing the `activeTab` state with URL-driven navigation. The current internal-state approach does not preclude that migration — it is a mechanical refactor.
- The `onEmailConsumed` callback pattern ensures that clicking "View Activity" for the same user twice in a row fires the filter correctly (the state goes `email` → `''` → `email`). Without the reset, a second click for the same user would not re-trigger the `useEffect` because the `initialEmail` value would not have changed.

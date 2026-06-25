# Release Note — Legal T&C Acknowledgment Tracking and Subscriber Activity Log

**Date:** 25 Jun 2026  
**Version:** v1.8.0  
**Branch:** `claude/modest-davinci-sxz7lv`  
**Audience:** Platform admins

---

## What's New

### T&C Acknowledgment Status Visibility
The Admin Panel **Users** tab now shows a **T&C Status** column for each subscriber. The column displays one of four states:
- **Acknowledged** (green, with date) — subscriber has accepted the current T&C version.
- **Pending** (orange) — subscriber has not yet accepted the current version.
- **No version published** (grey) — no active T&C version exists in the platform.
- **Exempt** (grey) — admin account (bypasses the T&C gate).

This gives you immediate visibility into who has completed the legal gate and who is still blocked.

### Clickable T&C Status Badges
Clicking the **Acknowledged** or **Pending** badge navigates directly to the **User Actions** tab, pre-filtered to that subscriber's email and the `tc_acknowledged` action type. This lets you jump straight to their legal acknowledgment record without manually typing their email.

### View Activity Button
Each non-admin subscriber row in the Users table now has a **View Activity** button. Clicking it switches to the User Actions tab and pre-fills the email filter with that subscriber's address, showing all their logged activity (all action types). Useful for investigating a subscriber's platform usage at a glance.

### Two New Activity Log Action Types
The User Actions tab's action-type filter dropdown now includes two new options:
- **`tc_acknowledged`** — fired when a subscriber clicks "I Agree" on the T&C modal. The event records which T&C version number and content hash they acknowledged.
- **`ai_features_enabled`** — fired once per login session when a subscriber opens the AI Features tab for the first time. Use this to track AI feature adoption by subscriber tier.

Both action types are fully filterable in the User Actions tab.

---

## Why This Matters

**Compliance auditability:** Each legal acknowledgment is now a timestamped, searchable event in the admin activity log. You have a complete audit trail of when each subscriber accepted the terms, with the specific version they acknowledged recorded in the event detail.

**Admin workflow efficiency:** Instead of running a manual SQL query or scrolling through user profiles, you can see acknowledgment status at a glance and drill into activity with a single click. For solo operators, this saves minutes per day across dozens of subscribers.

**Adoption tracking:** The `ai_features_enabled` event lets you see which tiers are engaging with AI features and how quickly they adopt them post-onboarding.

---

## Tier Availability

This feature applies to **all tiers** uniformly:
- Free, Starter, Pro, and Enterprise subscribers are all subject to the T&C gate and are logged identically.
- Admin visibility (Users table columns, Activity log filters) is **admin-only** — subscribers cannot see any of these new features.

---

## What Does NOT Change

- The T&C modal itself remains unchanged. Subscribers see the same "I Agree" flow they already do.
- The legal gate logic is unchanged. Subscribers are still blocked from all features until they acknowledge the current version.
- The activity log retention window stays at **30 days**. Events older than 30 days are automatically purged daily via the existing GitHub Actions workflow.
- No subscriber-facing UI additions (beyond the existing modal).

---

## Deployment Steps

Deploy in this order. Step 2 (backend) and Step 3 (frontend) can run in parallel after Step 1 completes.

**Step 1: Apply Migration 024 (database)**

```bash
supabase migration up 024_extend_action_types.sql
```

Migration 024 extends the `user_action_log.action_type` CHECK constraint to include `tc_acknowledged` and `ai_features_enabled`. The migration is **idempotent** — it can be re-run safely if needed. See "Rollback Posture" below for caveats.

**Step 2: Deploy Backend**

Push the backend code. The new routes and services are guarded: if migration 024 has not yet been applied, writes to `tc_acknowledged` or `ai_features_enabled` event types will fail at the database constraint, log a WARNING, and not crash the acknowledgment flow (acknowledgments in `legal_acknowledgments` still succeed; the activity log write is fire-and-forget).

**Step 3: Deploy Frontend**

Push the frontend code. The new columns, buttons, and filter options in the admin panel become live.

---

## Rollback Posture

**Migration 024 cannot be cleanly reversed.** The migration drops the old inline CHECK constraint and adds a new named constraint with the expanded value list. There is no automatic "undo" that reverts the constraint to its original form.

If you need to roll back the feature in production:

1. Roll back the backend to the previous version (the service will stop firing `tc_acknowledged` and `ai_features_enabled` events, but will not crash).
2. Roll back the frontend (the admin panel will no longer display the new columns or buttons).
3. **Do not** attempt to reverse migration 024 by hand. The `user_action_log` table will continue to accept the two new action types at the database level, but the application will not fire them. This is acceptable — the table remains in a valid state with a slightly broader constraint than necessary.

If you must remove the capability entirely, coordinate with the database team to alter the constraint back manually (drop the `user_action_log_action_type_valid` constraint and add back the original inline constraint). This is a rare operation and should only be done in consultation with the ops team.

---

## Known Limitations

### Mobile Touch Target Sizes
On narrow viewports (375px and below), the **T&C Status badge** and **View Activity button** have touch targets smaller than the Apple HIG 44px minimum. Tested at 375px width; tapping may require precise aim on some devices. Recommend testing on actual mobile devices before wide rollout. This is flagged for design review in a follow-up; acceptable for this release.

### Undefined `tc_ack_status` Renders as "Exempt"
If the backend returns a malformed response omitting the `tc_ack_status` field, the T&C Status column will display "Exempt" for that row. This is a false positive — "Exempt" is the highest-trust status, so a missing field incorrectly implies the user is an admin. This is a rare edge case (requires a backend code change or response serialization bug) and was flagged as Finding 1 in testing. The UI should render "—" or "Unknown" instead; fix deferred to v1.8.1.

---

## User Guide Update

The in-app User Guide (accessible via the Help tab) has been updated with a new section under **Admin Tools**:

> **T&C Status and Activity Tracking** — The Users table shows each subscriber's legal acknowledgment status and links directly to their activity log. Click the T&C Status badge to jump to their acknowledgment record, or click View Activity to see all their platform usage. Use these shortcuts to investigate subscriber compliance and behaviour without manual database queries.

---

## Testing Checklist

- [ ] Admin signs in and opens Users tab. At least one subscriber row shows "Acknowledged" in green with a date.
- [ ] Clicking the green badge switches to User Actions tab with email and `tc_acknowledged` filter pre-populated.
- [ ] A pending subscriber's badge shows orange with no date.
- [ ] Admin row shows "Exempt" (non-clickable).
- [ ] View Activity button is present for all non-admin rows and navigates to User Actions with email pre-filled.
- [ ] Action-type filter dropdown includes `tc_acknowledged` and `ai_features_enabled`.
- [ ] Subscriber acknowledges T&C. New `tc_acknowledged` row appears in User Actions within ~1 second.
- [ ] Subscriber opens AI Features tab (first time in session). New `ai_features_enabled` row appears in User Actions.
- [ ] Switching away from AI Features tab and back does not create a duplicate `ai_features_enabled` event.
- [ ] Logout and re-login fires a new `ai_features_enabled` event on next AI tab open.
- [ ] No active T&C version exists. All non-admin rows show "No version published" (grey, non-clickable).

---

## Migration Details

**File:** `backend/migrations/024_extend_action_types.sql`

The migration contains two operations:

1. Drop the old inline CHECK constraint created by migration 015 (using the Postgres default name `user_action_log_action_type_check`). Wrapped in an exception handler so re-runs do not fail.

2. Add a new, explicitly-named constraint `user_action_log_action_type_valid` that includes all 10 action types: `login`, `logout`, `ticker_search`, `strategy_scan`, `options_chain_view`, `paper_trade_placed`, `watchlist_update`, `ai_query`, `tc_acknowledged`, `ai_features_enabled`.

The migration is safe for re-running (idempotent). There are no data migrations or RLS policy changes.

---

## Code Review Notes

All code changes have passed security review (zero critical or high findings). Key implementation points:

- `GET /admin/users` now returns `tc_ack_status` and `tc_ack_at` fields for each subscriber. These are computed from a single query to `legal_acknowledgments` for the active version — not one query per subscriber.
- `POST /api/legal/acknowledge` (unchanged externally) now fires a `tc_acknowledged` activity log event after a successful acknowledgment, using `asyncio.create_task` (fire-and-forget pattern).
- New endpoint `POST /api/activity/log-action` allows subscribers to log whitelisted action types (currently only `ai_features_enabled`). The whitelist prevents subscribers from forging other event types.
- Frontend state management uses `useRef` for session-scoped dedup of the `ai_features_enabled` event, not `sessionStorage`. The ref is reset on logout/login because the Dashboard component unmounts.

---

## Questions?

- **Compliance/auditability:** Every legal acknowledgment is logged to `user_action_log` with timestamp, user email, version number, and content hash. The activity log is admin-only and immutable (insert-only, no deletes).
- **Activity log retention:** 30 days. Automated purge runs daily at 3:00 AM UTC via GitHub Actions. No changes to the existing schedule.
- **Subscriber impact:** Completely transparent. Subscribers see no new UI except the existing T&C modal (unchanged). Activity logging happens silently in the background.
- **Performance:** Two extra database queries on `GET /admin/users` (for active version ID and acknowledgments). Negligible cost for the typical admin panel load frequency (manual, infrequent).

---

**Shipped by:** Technical Writer  
**Date:** 25 Jun 2026  
**Status:** Ready for deployment

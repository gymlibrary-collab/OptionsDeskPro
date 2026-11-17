# Release Note — Subscriber Password Login (with audit fixes)

**Release date:** 17Nov2026
**Version / PR:** branch `claude/modest-davinci-sxz7lv` merged to `main`
**Author:** session lead

This release also carries the calculation, efficiency and UI fixes from the
app audit, which were held on the same branch.

---

## What changed

**Password login for subscribers**
- Sign up with email and a password entered twice; the address must be
  confirmed from an emailed link before first sign-in.
- Sign in with email and password. Google sign-in remains available.
- "Forgot password?" sends a reset link; the reset page takes the new password
  twice.
- Settings → Change Password now asks for the current password.
- Passwords must be at least 12 characters.
- Admin and staff accounts stay Google-only.
- Sign-in, sign-up, reset requests and password changes are rate limited.

**Calculation fixes**
- Covered call / covered put maximum profit now includes the stock's gain to
  the short strike (it showed only the option premium), and the breakeven is
  filled in.
- A trade that flips a position from long to short (or the reverse) now takes
  the new trade's price as its cost basis.

**Interface fixes**
- Removed instructions that pointed to an "Order Entry" panel that does not
  exist.
- Risk Monitor keeps its selection when it refreshes.
- The P&L chart shows a message when there is no history; a failed quote looks
  different from a loading one.
- The strike column stays visible when the options chain is scrolled sideways.
- Dates are shown in one format ("25 Jun 2026").

**Behind the scenes**
- Login checks and order placement no longer block other users' requests.
- Repeated market-data lookups for strategy analysis are cached.

---

## Why it changed

Subscribers without a Google account can now join and sign in; the audit fixes
correct wrong figures and dead-end instructions and reduce server load.

---

## Who it affects

| Tier | Available | Notes |
|------|-----------|-------|
| free | Yes | |
| starter | Yes | |
| pro | Yes | |
| enterprise | Yes | |

---

## Action required by users

- Subscribers changing a password in Settings must enter their current one.
- A Google-only subscriber who wants a password uses "Forgot password?".
- New passwords need 12 characters; existing shorter passwords still work.

---

## Known limitations

- **Emails are not delivered to real subscribers until custom SMTP is
  configured in Supabase.** Until then sign-up and "Forgot password?" show
  their confirmation message but only addresses belonging to members of the
  Supabase organisation receive anything.
- **The emailed links do not work until the two Supabase email templates are
  edited** (see deployment step 1).
- The manual test plan (`04-manual-test-plan.md`) has not been run. Release
  blockers that can only be checked live: reset link works end to end (D-07),
  a Google-only subscriber stays on one account after adding a password (E),
  pre-registration takeover is prevented (E-06), rate limiting keys on the real
  visitor address (G-04 to G-06), two users never see each other's data (G-03).
- Browser tests were run on Chromium only; Firefox and mobile Safari were not
  available in the build environment.
- Positions that were already flipped before this release keep their wrong
  cost basis until closed or edited.
- Rate limits are held in memory: they reset when the backend restarts and
  assume a single backend instance.
- Sign-in still tells a staff address to use Google, so staff addresses can be
  told apart there (rate limited).

---

## Deployment steps

1. Supabase dashboard (owner):
   - Authentication → Providers → Email: "Confirm email" ON.
   - Authentication → Email Templates: set the "Confirm signup" and "Reset
     password" links as given in `02-design.md` (deployment Step 2).
   - Authentication → URL Configuration: Site URL = live frontend address;
     add it to Redirect URLs.
   - Authentication → SMTP settings: configure custom SMTP (deferred by owner).
2. No database migration. No new environment variables.
3. Merge to `main`; Railway deploys backend and frontend.
4. Smoke test: sign in with Google as a subscriber and as admin; open
   Positions and Risk Monitor; log out. Then run the manual test plan.

---

## Rollback procedure

Revert the merge commit on `main` and push; Railway redeploys the previous
build. There is no schema change to undo. Accounts created through sign-up
remain in Supabase Auth and are harmless without the feature.

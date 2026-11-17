# Manual Test Plan — Subscriber Password Login

Run this by hand against the real Supabase project after deploying branch
`claude/modest-davinci-sxz7lv`. Automated tests use a mocked Supabase, so these
are the only checks that real emails arrive and real links work.

Tests marked **Blocker** must pass before release.

---

## A. Before you start

### A.1 Supabase dashboard changes (required)

1. **Authentication → Providers → Email**: "Confirm email" is ON.
2. **Authentication → Email Templates**: change the link in two templates.
   - "Confirm signup" link:
     `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=email`
   - "Reset password" link:
     `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`

   The default templates use `{{ .ConfirmationURL }}`, which the app cannot
   process. Nothing below works until this is done.
3. **Authentication → URL Configuration**: "Site URL" is the live frontend
   address (e.g. `https://optionscompass.up.railway.app`), and "Redirect URLs"
   includes `https://optionscompass.up.railway.app/**`.

### A.2 Accounts you need

| Label | What it is |
|---|---|
| SUBSCRIBER_A | A fresh email never used in this project, with an inbox you can open |
| GOOGLE_ACCOUNT | An existing Google-only subscriber with some positions, whose inbox you can open |
| STAFF_EMAIL | An address with an active row in `platform_staff` |
| ADMIN | The admin Google account |

### A.3 Email sending

Custom SMTP must be configured first (Authentication → SMTP settings). Without
it, Supabase's built-in sender only delivers to addresses that belong to members
of your Supabase organisation, so SUBSCRIBER_A would never receive an email.

Sending is rate-limited (30 per hour by default once custom SMTP is saved;
adjust under Authentication → Rate Limits). If a form shows its success message
but no email arrives within 5 minutes, check the rate limit and your email
service's delivery log.

### A.4 Invite-only mode

Check Admin Panel → Platform Settings. If invite-only is ON, a new sign-up is
refused at first login unless the email is in the whitelist. To test the full
sign-up path with invite-only on, add SUBSCRIBER_A to the whitelist first.

---

## B. New subscriber sign-up

Start signed out, on the login page, "Create Account" selected.

| ID | Steps | Expected | If it fails | Blocker |
|---|---|---|---|---|
| B-01 | Leave everything blank, click "Create Account →" | Red box: "Email and password are required." | Empty-field check is broken | Yes |
| B-02 | Enter SUBSCRIBER_A, `password1` and `password2` in the two password fields, submit | Red box: "Passwords do not match." | Confirmation check is broken | Yes |
| B-03 | Enter SUBSCRIBER_A, `elevenchars` (11 characters) in both fields, submit | Red box: "Password must be at least 12 characters." | Length check is broken | Yes |
| B-04 | Enter SUBSCRIBER_A, `TestPassword01` in both fields, submit | Green box starting "Check your email to verify your address before signing in." You are not logged in | Sign-up call failed | Yes |
| B-05 | Without clicking the email link, switch to "Sign In" and sign in with SUBSCRIBER_A / `TestPassword01` | Red box: "Invalid email or password." | Supabase is not enforcing email verification | Yes |
| B-06 | Open the verification email, click the link | App opens, the `token_hash` disappears from the address bar, and you land logged in (or, with invite-only ON and no whitelist entry, a red access-denied banner) | Templates not edited (A.1), or the link exchange is failing | Yes |
| B-07 | Sign out. Sign up again with SUBSCRIBER_A | Same green box as B-04; Supabase still lists one user for that email | The app reveals which emails are registered | No |

## C. Sign in with password

| ID | Steps | Expected | If it fails | Blocker |
|---|---|---|---|---|
| C-01 | Sign in with SUBSCRIBER_A and a wrong password | "Invalid email or password." | Error mapping is broken | Yes |
| C-02 | Sign in with `nobody@example.invalid` and any password | Same message as C-01 | The app reveals which emails are registered | No |
| C-03 | Sign in with SUBSCRIBER_A / `TestPassword01` | Dashboard loads | Password login is broken | Yes |
| C-04 | Sign out, click "Continue with Google" with a Google subscriber | Dashboard loads | Google sign-in has regressed | Yes |

## D. Forgot password

| ID | Steps | Expected | If it fails | Blocker |
|---|---|---|---|---|
| D-01 | On Sign In, click "Forgot password?" | Title "Reset your password", email field only, "Send reset link" button, "Back to sign in" link | Forgot step not wired | Yes |
| D-02 | Leave email blank, click "Send reset link" | "Please enter your email address." | Empty-field check is broken | Yes |
| D-03 | Enter SUBSCRIBER_A, submit | Green box: "If an account exists for that address, a reset link has been sent. Check your inbox." | Reset request failed | Yes |
| D-04 | Repeat with `nobody@example.invalid` | Identical green box, no email | The app reveals which emails are registered | No |
| D-05 | Open the reset email, click the link | App shows "Set new password" with two password fields | Templates not edited (A.1), or routing/link exchange is failing | Yes |
| D-06 | Enter `elevenchars` twice, submit; then `newpassword1` / `newpassword2`, submit | "Password must be at least 12 characters."; then "Passwords do not match." | Reset-form validation is broken | Yes |
| D-07 | Enter `NewPassword99!` twice, submit. Then try signing in with the old password, then the new one | Login page with green banner "Password updated. Please sign in."; old password refused; new password works | Password was not updated, or you were left logged in on the reset link | Yes |
| D-08 | Click the same reset link in the email again | "Link expired" with a "Request a new reset link" link | Used links are not being rejected | Yes |
| D-09 | Click "Request a new reset link" | Forgot-password form opens | Dead end after an expired link | No |

## E. Google-only subscriber adds a password (highest risk)

Before starting: in Supabase → Authentication → Users, find GOOGLE_ACCOUNT, note
its UID and the total number of users.

| ID | Steps | Expected | If it fails | Blocker |
|---|---|---|---|---|
| E-01 | Forgot password → enter GOOGLE_ACCOUNT → submit | Same green box as D-03 | Reset is rejecting Google accounts | Yes |
| E-02 | Click the emailed link, set `GooglePlus99!` | Login page with "Password updated. Please sign in." | Reset does not work for Google-only accounts | Yes |
| E-03 | Sign in with GOOGLE_ACCOUNT / `GooglePlus99!` | Dashboard shows the same positions, watchlist and tier as before | The password landed on a different account | Yes |
| E-04 | Sign out, "Continue with Google" with the same account | Same dashboard and data | Adding a password broke Google sign-in | Yes |
| E-05 | Supabase → Authentication → Users → GOOGLE_ACCOUNT | Total user count unchanged; one user for that email with the same UID; providers show both `google` and `email` | A duplicate account was created — stop and do not release | Yes |

### E-06 — Someone else signed up with a subscriber's email first (Blocker)

Needs a Google account (GOOGLE_NEW) that has never used the app.

1. Signed out, use "Create Account" with GOOGLE_NEW's email and the password
   `AttackerPass1`. Do **not** click the verification email.
2. Click "Continue with Google" and sign in as GOOGLE_NEW.
3. Sign out. Try to sign in with GOOGLE_NEW's email and `AttackerPass1`.

Expected: step 2 lands in the app normally; step 3 shows "Invalid email or
password." In Supabase → Authentication → Users there is one user for that
email, with provider `google` only.
If step 3 signs in: a stranger can plant a password on an email before its owner
arrives and then log in as them — stop and do not release.

## F. Admin and staff stay Google-only

Sign-in refuses a staff or admin email with "Password login is not available for
this account. Use Google sign-in." Sign-up and forgot-password deliberately show
the same neutral message as for anyone else, so outsiders cannot tell which
addresses are staff — the check there is that **no email arrives**.

| ID | Steps | Expected | If it fails | Blocker |
|---|---|---|---|---|
| F-01 | Sign in with the admin email and any password | Refusal message | Admin guard on login missing | Yes |
| F-02 | Create Account with the admin email and a 12+ character password | The normal green "Check your email…" box; **no email arrives**; in Supabase the admin user still shows provider `google` only | Admin guard on sign-up missing | Yes |
| F-03 | Forgot password with the admin email, then with STAFF_EMAIL | The normal green "If an account exists…" box each time; **no reset email arrives** at either address | Admin/staff guard on reset missing | Yes |
| F-04 | Sign in with STAFF_EMAIL and any password | Refusal message | Staff lookup is failing | Yes |
| F-05 | "Continue with Google" as ADMIN | Admin dashboard loads | Admin Google login has regressed | Yes |
| F-06 | Open the admin portal login | Google button only: no password fields, no "Create Account", no "Forgot password?" | Admin portal picked up the subscriber form | Yes |

## G. Regression — login, refresh, logout

The backend's Supabase client handling changed in this release, so each of
these needs one real pass.

| ID | Steps | Expected | If it fails | Blocker |
|---|---|---|---|---|
| G-01 | Google subscriber: sign in, check watchlist and positions load, log out | Works; after logout no data is visible | OAuth callback or logout has regressed | Yes |
| G-02 | Sign in as SUBSCRIBER_A. In browser DevTools → Application → Cookies delete only `sb_access_token` (leave `sb_refresh_token`), then open the Positions tab | You stay logged in and a new `sb_access_token` appears | Token refresh is broken | Yes |
| G-03 | Sign in as two different users in two different browsers; use both for a few minutes | Each sees only their own data | Sessions are leaking between users — stop and do not release | Yes |
| G-04 | Enter a wrong password for SUBSCRIBER_A 11 times in a row | From the 11th attempt: "Too many attempts. Please wait a few minutes and try again." | Rate limiting is not active | Yes |
| G-05 | Immediately after G-04, on a phone using mobile data (a different network), sign in as SUBSCRIBER_A with the correct password | Sign-in works | The limiter is treating all visitors as one address — it would lock everyone out; stop and do not release | Yes |
| G-06 | After G-04 has locked you out, run this from a terminal on the same network (replace the URL with your backend address): `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://YOUR-BACKEND/api/auth/email-login -H "Content-Type: application/json" -H "X-Real-IP: 203.0.113.77" -d '{"email":"x@example.com","password":"wrongpassword1"}'` | `429` | If it prints `401`, a visitor can dodge the limit by sending a made-up address header — the limiter gives no protection; tell the developer | Yes |

## H. Changing a password while signed in (Settings)

| ID | Steps | Expected | If it fails | Blocker |
|---|---|---|---|---|
| H-01 | Signed in as SUBSCRIBER_A with a password: Settings → Account → Change Password. Leave "Current password" blank, fill the new password twice, submit | "Enter your current password." | Current-password check missing in the form | Yes |
| H-02 | Same form, wrong current password | "Current password is incorrect…" and the old password still works | A signed-in session alone can replace the password | Yes |
| H-03 | Same form, correct current password | "Password updated successfully."; sign out and sign in with the new password | Password change is broken | Yes |
| H-04 | Signed in with Google on an account that has no password: try the same form with anything as current password | "Current password is incorrect…" with the hint to use "Forgot password?" | A Google session alone can add a password | Yes |

---

## Known rough edges (not fixed)

- The sign-up confirmation mentions "Forgot password?" for existing and Google
  accounts to every new sign-up. This is deliberate: the message must be
  identical whether or not the email already exists.
- Refreshing the page immediately after clicking an emailed link can show
  "Invalid reset link", because the one-time token is removed from the address
  bar as soon as it is read. Request a new link.

# OptionsDesk Setup

## Supabase Configuration

### Step 1: Run the database migration
1. Open your Supabase project → SQL Editor → New Query
2. Copy and paste the contents of `backend/migrations/001_initial_schema.sql`
3. Click Run

### Step 2: Enable Google Auth
1. Supabase → Authentication → Providers → Google
2. Enter your Google OAuth Client ID and Secret
3. Add callback URL to Google Console: `https://[your-project-ref].supabase.co/auth/v1/callback`

### Step 3: Get your JWT Secret
1. Supabase → Settings → API → JWT Settings → copy "JWT Secret"
2. Add to Railway backend Variables: `SUPABASE_JWT_SECRET=<paste here>`

### Step 4: Railway environment variables

Backend service — all required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_JWT_SECRET`  ← ADD THIS (see Step 3)

Frontend service — all required:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## How It Works

### Authentication Flow
1. User clicks "Sign in with Google" on the login page
2. Supabase handles the OAuth redirect and issues a JWT
3. Frontend calls `POST /api/auth/login` with the JWT in the `Authorization` header
4. Backend verifies the JWT, checks the whitelist, upserts the user profile, creates a portfolio, and logs activity
5. All subsequent API calls include the JWT — orders and positions are scoped to the authenticated user

### Whitelist
- Only whitelisted emails (or the admin) can sign in
- Admin (`leonard.simgt@gmail.com`) is always allowed
- Admin can add/remove emails from the whitelist via the Admin panel

### Admin Panel
- Visible only to `leonard.simgt@gmail.com`
- Shows Users, Whitelist management, Activity Log (today's logins), and Leaderboard

### P&L Tracking
- Every time the Positions tab is opened, a snapshot of the portfolio value is saved
- The P&L chart on the Positions tab shows portfolio value history over the last 90 days

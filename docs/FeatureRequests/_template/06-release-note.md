# Release Note — [Feature Name]

**Release date:** [ddMMMyyyy]
**Version / PR:** [branch or PR link]
**Author:** Technical Writer + DevOps Engineer

---

## What changed

_Specific, named changes visible to users. No implementation details._

-
-

---

## Why it changed

_User benefit in one sentence per change._

---

## Who it affects

| Tier | Available | Notes |
|------|-----------|-------|
| free | Yes / No | |
| starter | Yes / No | |
| pro | Yes / No | |
| enterprise | Yes / No | |

---

## Action required by users

_Leave blank if no action required. Otherwise describe exactly what the user must do._

---

## Known limitations

_Any caveats, edge cases, or planned future improvements._

---

## Deployment steps

1. Apply migration `backend/migrations/NNN_<title>.sql` in Supabase SQL editor (if applicable)
2. Set new environment variables in Railway (if applicable):
   - `VARIABLE_NAME` — description
3. Deploy backend service on Railway
4. Deploy frontend service on Railway
5. Verify with `GET /api/health` → `{"status": "ok"}`
6. Smoke test: [describe the 2-3 manual steps to verify the feature is live]

---

## Rollback procedure

1. Revert to previous Railway deployment (backend: _previous deploy ID_, frontend: _previous deploy ID_)
2. Reverse migration (if applicable):
   ```sql
   -- paste rollback SQL here
   ```
3. Verify rollback: [describe check]

---

## Post-deployment monitoring

_What to watch in the first 24 hours. Any quota or performance concerns._

- Market Data App quota: check for unexpected credit burn
- Error rate: watch Railway logs for 5xx on new endpoints
- Fallback activation: confirm primary data source is responding

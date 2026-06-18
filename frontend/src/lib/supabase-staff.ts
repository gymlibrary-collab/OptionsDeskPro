// Real supabase-js client for the staff/admin portal.
// The main client portal uses the backend-proxy auth model (see supabase.ts stub).
// The staff portal authenticates directly with Supabase and uses Bearer tokens
// for its own /api/staff/* routes — it is not part of the cookie-auth refactor.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for the staff portal.')
}

export const supabaseStaff = createClient(supabaseUrl, supabaseAnonKey)

import { createClient } from '@supabase/supabase-js'

/**
 * Anonymous Supabase client for public data queries.
 *
 * Does NOT use cookies() from next/headers, which means pages using
 * this client can be ISR-cached (Incremental Static Regeneration).
 *
 * Use ONLY for reading public data (published listings, active markets, etc.)
 * For auth-dependent queries, use createClient() from server.ts.
 */
export const anonSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

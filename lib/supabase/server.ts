import { createClient } from "@supabase/supabase-js";
import type { Database } from "../db/types";

// Server-only Supabase client.
//
// Uses the SERVICE-ROLE key, which bypasses Row-Level Security. This is safe
// and intentional:
//   - The key has no NEXT_PUBLIC_ prefix, so it is never bundled into the
//     browser — it exists only in server processes.
//   - The app is single-user with no Supabase Auth session, so there is no
//     auth.uid() to scope RLS by; every row is owned by OWNER_ID.
//   - RLS is ENABLED on every public table (migration 0032). With RLS on and
//     no permissive anon policy, the public anon key — which IS shipped to the
//     browser via NEXT_PUBLIC_SUPABASE_ANON_KEY — can no longer read or write
//     any data. All data access must go through this server client.
//
// When real multi-user auth lands, swap this back to an anon/SSR client that
// carries the user's session, and the existing owner_id = auth.uid() policies
// take over enforcement.

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function getSupabaseServer() {
  if (!isSupabaseConfigured()) return null;

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

// SERVER ONLY. Uses SUPABASE_SECRET_KEY, which bypasses RLS.
// Import this only from server code (Server Functions, Route Handlers). Never from
// a Client Component or anything the browser loads. `server-only` makes the build
// fail if that happens.
import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

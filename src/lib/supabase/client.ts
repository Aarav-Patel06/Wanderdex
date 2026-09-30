import { createBrowserClient } from "@supabase/ssr";

// Browser client: publishable key only, reads/writes the user's own data under RLS.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

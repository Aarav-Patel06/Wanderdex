import { cache } from "react";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// The logged-in user's profile row, read once per request under their session (RLS) and shared
// by the app layout and the pages that need it. src/proxy.ts already redirects logged-out users;
// this re-checks at the data layer.
export const currentProfile = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, created_at")
    .eq("user_id", data.claims.sub)
    .maybeSingle<{ username: string; created_at: string }>();

  return { username: profile?.username ?? "", joined: profile?.created_at ?? null };
});

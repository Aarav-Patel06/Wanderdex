import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  // src/proxy.ts already redirects logged-out users; this re-checks at the data layer.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", data.claims.sub)
    .maybeSingle();

  return <AppShell username={profile?.username ?? ""}>{children}</AppShell>;
}

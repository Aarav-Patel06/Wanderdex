import type { Metadata } from "next";

import { ProfileView } from "@/components/profile/profile-view";
import { readAllPages } from "@/lib/paging";
import { currentProfile } from "@/lib/profile";
import { type StatsVisit, profileStats } from "@/lib/stats/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile · Wanderdex" };

// Profile (SPEC §14.6): computed on the server from the user's own rows.
export default async function ProfilePage() {
  const [{ username, joined }, rows] = await Promise.all([currentProfile(), loadVisits()]);
  return <ProfileView username={username} joined={joined} stats={profileStats(rows)} />;
}

// Every one of the user's visits with its place, a page at a time, under their session (RLS
// returns only their own, SPEC §9).
async function loadVisits() {
  const supabase = await createClient();
  return readAllPages((from, to) =>
    supabase
      .from("visits")
      .select(
        "id, place_id, category, visited_at, visited_precision, timezone, created_at, places!inner(name, city, country, country_code)",
      )
      // A stable order, so pages don't overlap.
      .order("id")
      .range(from, to)
      // Untyped client: it can't tell that `places` is many-to-one (one object, not an array).
      .overrideTypes<StatsVisit[], { merge: false }>(),
  );
}

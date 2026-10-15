import { readAllPages } from "@/lib/paging";
import type { StatsVisit } from "@/lib/stats/profile";
import { createClient } from "@/lib/supabase/server";

// Every one of the user's visits with its place, a page at a time, under their session (RLS
// returns only their own, SPEC §9): what the profile's stats are computed from (SPEC §14.6), on
// the profile and for the passport secret (SPEC §15.1).
export async function loadStatsVisits() {
  const supabase = await createClient();
  return readAllPages((from, to) =>
    supabase
      .from("visits")
      .select(
        "id, place_id, category, visited_at, visited_precision, timezone, created_at, rating, places!inner(name, city, country, country_code)",
      )
      // A stable order, so pages don't overlap.
      .order("id")
      .range(from, to)
      // Untyped client: it can't tell that `places` is many-to-one (one object, not an array).
      .overrideTypes<StatsVisit[], { merge: false }>(),
  );
}

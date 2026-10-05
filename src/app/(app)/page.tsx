import type { Metadata } from "next";

import { AddFlow } from "@/components/add/add-flow";
import { Overworld } from "@/components/map/overworld";
import { placesFromVisits, type VisitRow } from "@/lib/map/places";
import { readAllPages } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overworld · Wanderdex" };

export default async function OverworldPage() {
  const supabase = await createClient();
  // The user's session applies, so RLS returns only their own visits (SPEC §9). Every one of
  // them, a page at a time, for the pins and the visited-country fill.
  const rows = await readAllPages((from, to) =>
    supabase
      .from("visits")
      .select("category, place:places(id, name, city, country, country_code, lat, lng)")
      .order("created_at", { ascending: false })
      // A stable order for visits logged at the same instant, so pages don't overlap.
      .order("id")
      .range(from, to)
      // Untyped client: it can't tell that `place` is many-to-one (one object, not an array).
      .overrideTypes<VisitRow[], { merge: false }>(),
  );

  return (
    <Overworld initialPlaces={placesFromVisits(rows)}>
      <AddFlow />
    </Overworld>
  );
}

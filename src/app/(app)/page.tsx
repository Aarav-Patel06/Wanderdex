import type { Metadata } from "next";

import { AddFlow } from "@/components/add/add-flow";
import { Overworld } from "@/components/map/overworld";
import { placesFromVisits, type VisitRow } from "@/lib/map/places";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overworld · Wanderdex" };

export default async function OverworldPage() {
  const supabase = await createClient();
  // The user's session applies, so RLS returns only their own visits (SPEC §9).
  const { data, error } = await supabase
    .from("visits")
    .select("category, place:places(id, name, city, country, lat, lng)")
    .order("created_at", { ascending: false })
    // Untyped client: it can't tell that `place` is many-to-one (one object, not an array).
    .overrideTypes<VisitRow[], { merge: false }>();
  if (error) throw error;

  return (
    <Overworld initialPlaces={placesFromVisits(data)}>
      <AddFlow />
    </Overworld>
  );
}

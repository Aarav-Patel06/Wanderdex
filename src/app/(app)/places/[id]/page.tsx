import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { type PlaceVisit, PlaceDetail } from "@/components/places/place-detail";
import type { Category } from "@/lib/categories";
import { formatVisited, localValue, type Precision, timezoneAt } from "@/lib/dates";
import { googleMapsUrl } from "@/lib/google/maps-url";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/visits";

export const metadata: Metadata = { title: "Place · Wanderdex" };

type PlaceRow = {
  id: string;
  google_place_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
};

type VisitRow = {
  id: string;
  category: Category;
  visited_at: string;
  visited_precision: Precision;
  timezone: string;
  rating: number | null;
  note: string | null;
  created_at: string;
};

// Place detail (SPEC §14.4): the place and the user's visits there, newest first. The user's
// session applies, so RLS returns the place only if they can read it and only their own visits
// (SPEC §9). No such place, one they can't read, or no visits of theirs there → not-found.tsx.
// ?visit=<id> (from My Visits) scrolls to that visit and highlights it.
export default async function PlacePage({ params, searchParams }: PageProps<"/places/[id]">) {
  const [{ id }, { visit }] = await Promise.all([params, searchParams]);
  if (!idSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [placeResult, visitsResult] = await Promise.all([
    supabase
      .from("places")
      .select("id, google_place_id, name, address, city, country, lat, lng")
      .eq("id", id)
      .maybeSingle<PlaceRow>(),
    supabase
      .from("visits")
      .select("id, category, visited_at, visited_precision, timezone, rating, note, created_at")
      .eq("place_id", id)
      .order("visited_at", { ascending: false })
      // The same order as My Visits for visits at the same instant.
      .order("id")
      .overrideTypes<VisitRow[], { merge: false }>(),
  ]);
  if (placeResult.error) throw placeResult.error;
  if (visitsResult.error) throw visitsResult.error;
  const place = placeResult.data;
  const rows = visitsResult.data;
  if (!place || !rows.length) notFound();

  // The user's category here: their most recently logged visit's, the same rule as the pin
  // (DECISIONS 2026-09-30). Postgres returns created_at in one format, so strings compare.
  const latest = rows.reduce((a, b) => (b.created_at > a.created_at ? b : a));
  const visits: PlaceVisit[] = rows.map((row) => ({
    id: row.id,
    date: formatVisited(row.visited_at, row.visited_precision, row.timezone),
    visited: { value: localValue(row.visited_at, row.visited_precision, row.timezone), precision: row.visited_precision },
    timezone: row.timezone,
    rating: row.rating,
    note: row.note,
  }));

  return (
    <PlaceDetail
      place={{
        id: place.id,
        name: place.name,
        category: latest.category,
        address: place.address,
        city: place.city,
        country: place.country,
        // From the coordinates, as /api/visits does for every visit here.
        timezone: timezoneAt(place.lat, place.lng),
        mapsUrl: googleMapsUrl(place),
      }}
      visits={visits}
      highlight={typeof visit === "string" ? visit : null}
    />
  );
}

"use server";

import { z } from "zod";

import type { Category } from "@/lib/categories";
import { formatVisited, type Precision } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { type VisitFilters, visitFiltersSchema } from "@/lib/visit-filters";
import { filterVisits, visitTimeZones } from "@/lib/visit-query";

const PAGE_SIZE = 30;

export type VisitListItem = {
  id: string;
  placeId: string;
  name: string;
  where: string;
  category: Category;
  date: string;
  rating: number | null;
};

type Row = {
  id: string;
  category: Category;
  visited_at: string;
  visited_precision: Precision;
  timezone: string;
  rating: number | null;
  places: { id: string; name: string; city: string | null; country: string | null };
};

// One page of My Visits (SPEC §14.3), most recent visit first, matching the filters. The user's
// session applies, so RLS returns only their own visits. Dates are formatted here, in each
// visit's zone, to keep the tz tooling out of the browser. `next` is the offset of the
// following page, or null.
export async function loadVisits(
  filters: VisitFilters,
  offset: number,
): Promise<{ items: VisitListItem[]; next: number | null }> {
  const parsed = visitFiltersSchema.parse(filters);
  const start = z.number().int().min(0).parse(offset);
  const supabase = await createClient();
  const zones = parsed.from || parsed.to ? await visitTimeZones(supabase) : [];
  const query = supabase
    .from("visits")
    // !inner: the place filters apply to the visits, and a visit whose place the user can't
    // read is left out.
    .select("id, category, visited_at, visited_precision, timezone, rating, places!inner(id, name, city, country)");
  const { data, error } = await filterVisits(query, parsed, zones)
    .order("visited_at", { ascending: false })
    // A stable order for visits at the same instant, so pages don't overlap.
    .order("id")
    // One row more than a page tells whether there's another page.
    .range(start, start + PAGE_SIZE)
    // Untyped client: it can't tell that `places` is many-to-one (one object, not an array).
    .overrideTypes<Row[], { merge: false }>();
  if (error) throw error;

  const items = data.slice(0, PAGE_SIZE).map(({ id, category, visited_at, visited_precision, timezone, rating, places }) => ({
    id,
    placeId: places.id,
    name: places.name,
    where: [places.city, places.country].filter(Boolean).join(", "),
    category,
    date: formatVisited(visited_at, visited_precision, timezone),
    rating,
  }));
  return { items, next: data.length > PAGE_SIZE ? start + PAGE_SIZE : null };
}

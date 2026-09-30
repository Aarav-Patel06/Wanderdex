"use server";

import { z } from "zod";

import type { Category } from "@/lib/categories";
import { formatVisited, type Precision } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 30;

export type VisitListItem = {
  id: string;
  placeId: string;
  name: string;
  where: string;
  category: Category;
  date: string;
};

type Row = {
  id: string;
  category: Category;
  visited_at: string;
  visited_precision: Precision;
  timezone: string;
  place: { id: string; name: string; city: string | null; country: string | null } | null;
};

// One page of My Visits (SPEC §14.3), most recent visit first. The user's session applies, so
// RLS returns only their own visits. Dates are formatted here, in each visit's zone, to keep the
// tz tooling out of the browser. `next` is the offset of the following page, or null.
export async function loadVisits(offset: number): Promise<{ items: VisitListItem[]; next: number | null }> {
  const start = z.number().int().min(0).parse(offset);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visits")
    .select("id, category, visited_at, visited_precision, timezone, place:places(id, name, city, country)")
    .order("visited_at", { ascending: false })
    // A stable order for visits at the same instant, so pages don't overlap.
    .order("id")
    // One row more than a page tells whether there's another page.
    .range(start, start + PAGE_SIZE)
    // Untyped client: it can't tell that `place` is many-to-one (one object, not an array).
    .overrideTypes<Row[], { merge: false }>();
  if (error) throw error;

  const items = data.slice(0, PAGE_SIZE).flatMap(({ id, category, visited_at, visited_precision, timezone, place }) =>
    place
      ? [
          {
            id,
            placeId: place.id,
            name: place.name,
            where: [place.city, place.country].filter(Boolean).join(", "),
            category,
            date: formatVisited(visited_at, visited_precision, timezone),
          },
        ]
      : [],
  );
  return { items, next: data.length > PAGE_SIZE ? start + PAGE_SIZE : null };
}

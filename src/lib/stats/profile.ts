import { CATEGORIES, type Category } from "@/lib/categories";
import type { Precision } from "@/lib/dates";
import { continentFor } from "@/lib/stats/continents";
import { countryFor } from "@/lib/stats/countries";

// One of the user's visits with its place, as the profile reads them (SPEC §14.6). Postgres
// returns timestamps in one format, so they compare as strings.
export type StatsVisit = {
  id: string;
  place_id: string;
  category: Category;
  visited_at: string;
  visited_precision: Precision;
  timezone: string;
  created_at: string;
  places: { name: string; city: string | null; country: string | null; country_code: string | null };
};

export type StatsPlace = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  // The user's category for it: their most recently logged visit's, as the pin's (SPEC §8).
  category: Category;
};

export type ProfileStats = {
  places: number;
  countries: number;
  continents: number;
  visits: number;
  // The earliest visit, at its precision in its zone; null with no visits.
  first: { place: StatsPlace; visitedAt: string; precision: Precision; timezone: string } | null;
  // Places per category, most first (ties in the fixed category order), only categories with pins.
  categories: { category: Category; count: number }[];
  // The top 5 places by visit count, among those with at least 2 (ties: most recent visit first).
  revisited: { place: StatsPlace; visits: number }[];
};

export const REVISITED_MAX = 5;

export function profileStats(rows: StatsVisit[]): ProfileStats {
  const places = new Map<string, { place: StatsPlace; logged: string; visits: number; latest: string }>();
  const countries = new Set<string>();
  const continents = new Set<string>();
  let first: StatsVisit | null = null;

  for (const row of rows) {
    const known = places.get(row.place_id);
    if (!known) {
      places.set(row.place_id, {
        place: {
          id: row.place_id,
          name: row.places.name,
          city: row.places.city,
          country: row.places.country,
          category: row.category,
        },
        logged: row.created_at,
        visits: 1,
        latest: row.visited_at,
      });
    } else {
      known.visits += 1;
      if (row.visited_at > known.latest) known.latest = row.visited_at;
      if (row.created_at > known.logged) {
        known.logged = row.created_at;
        known.place.category = row.category;
      }
    }

    const country = countryFor(row.places.country_code);
    if (country) countries.add(country);
    const continent = continentFor(row.places.country_code);
    if (continent) continents.add(continent);

    if (
      !first ||
      row.visited_at < first.visited_at ||
      (row.visited_at === first.visited_at && row.created_at < first.created_at)
    ) {
      first = row;
    }
  }

  const counts = new Map<Category, number>();
  for (const { place } of places.values()) counts.set(place.category, (counts.get(place.category) ?? 0) + 1);

  return {
    places: places.size,
    countries: countries.size,
    continents: continents.size,
    visits: rows.length,
    first: first && {
      place: places.get(first.place_id)!.place,
      visitedAt: first.visited_at,
      precision: first.visited_precision,
      timezone: first.timezone,
    },
    categories: CATEGORIES.filter((category) => counts.has(category))
      .map((category) => ({ category, count: counts.get(category)! }))
      // A stable sort keeps the category order among equal counts.
      .sort((a, b) => b.count - a.count),
    revisited: [...places.values()]
      .filter(({ visits }) => visits >= 2)
      .sort((a, b) => b.visits - a.visits || (b.latest > a.latest ? 1 : b.latest < a.latest ? -1 : 0))
      .slice(0, REVISITED_MAX)
      .map(({ place, visits }) => ({ place, visits })),
  };
}

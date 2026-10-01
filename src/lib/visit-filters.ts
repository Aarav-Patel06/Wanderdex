import { z } from "zod";

import { CATEGORIES, type Category } from "@/lib/categories";

// My Visits' filters (SPEC §14.3), as the URL query keeps them, so reload and Back keep them
// too. Browser-safe: the server turns them into a query in lib/visit-query.

export type VisitFilters = {
  // None = all categories.
  categories: Category[];
  country: string | null;
  city: string | null;
  // Calendar days, "YYYY-MM-DD", inclusive. Either end can be open.
  from: string | null;
  to: string | null;
};

export const NO_FILTERS: VisitFilters = { categories: [], country: null, city: null, from: null, to: null };

// A real calendar day, like lib/dates' isLocalValue (which the browser can't import).
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, date] = value.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, date));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === date;
  });

// Cities and countries are matched exactly as stored, so they aren't trimmed. 200 is the
// saved places' limit (lib/visits).
const placeName = z.string().min(1).max(200);

// What loadVisits takes from the browser.
export const visitFiltersSchema = z.object({
  categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length),
  country: placeName.nullable(),
  city: placeName.nullable(),
  from: day.nullable(),
  to: day.nullable(),
});

// ?category=food,cafe&country=Japan&city=Tokyo&from=2025-03-01&to=2025-03-31. Anything that
// isn't valid is left out, as if it weren't there.
export function filtersFromSearchParams(params: Record<string, string | string[] | undefined>): VisitFilters {
  const get = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? null;
  };
  const valid = (schema: z.ZodType, value: string | null) => (schema.safeParse(value).success ? value : null);
  const picked = get("category")?.split(",") ?? [];
  return {
    categories: CATEGORIES.filter((category) => picked.includes(category)),
    country: valid(placeName, get("country")),
    city: valid(placeName, get("city")),
    from: valid(day, get("from")),
    to: valid(day, get("to")),
  };
}

// The query string for a set of filters ("" for none), categories in their fixed order.
export function filtersSearch(filters: VisitFilters) {
  const params = new URLSearchParams();
  const categories = CATEGORIES.filter((category) => filters.categories.includes(category));
  if (categories.length) params.set("category", categories.join(","));
  for (const key of ["country", "city", "from", "to"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function hasFilters(filters: VisitFilters) {
  return filtersSearch(filters) !== "";
}

// The chips (SPEC §14.3): "All" plus the 10 categories, multi-select. `next` is the toggle
// group's new value, "all" included when it's on. Turning "All" on clears the categories;
// turning it off (or the last category) leaves none, which is All again.
export function categoriesFromChips(current: Category[], next: string[]): Category[] {
  if (current.length && next.includes("all")) return [];
  return CATEGORIES.filter((category) => next.includes(category));
}

// The city and country dropdowns, from the user's own places.
export type FilterOptions = {
  countries: string[];
  cities: { city: string; country: string | null }[];
};

const byName = (a: string, b: string) => a.localeCompare(b);

export function filterOptions(places: { city: string | null; country: string | null }[]): FilterOptions {
  const countries = new Set<string>();
  const cities = new Map<string, { city: string; country: string | null }>();
  for (const { city, country } of places) {
    if (country) countries.add(country);
    if (city) cities.set(JSON.stringify([city, country]), { city, country });
  }
  return {
    countries: [...countries].sort(byName),
    cities: [...cities.values()].sort((a, b) => byName(a.city, b.city)),
  };
}

// The city dropdown: once a country is chosen, only that country's cities.
export function citiesIn(options: FilterOptions, country: string | null) {
  const names = options.cities.filter((city) => !country || city.country === country).map(({ city }) => city);
  return [...new Set(names)];
}

// Choosing a country keeps the chosen city only if it's one of that country's.
export function withCountry(filters: VisitFilters, country: string | null, options: FilterOptions): VisitFilters {
  const keepCity = filters.city !== null && citiesIn(options, country).includes(filters.city);
  return { ...filters, country, city: keepCity ? filters.city : null };
}

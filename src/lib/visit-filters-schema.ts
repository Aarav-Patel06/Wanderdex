import { z } from "zod";

import { CATEGORIES } from "@/lib/categories";
import type { VisitFilters } from "@/lib/visit-filters";

// Reading My Visits' filters from untrusted input, on the server: the URL query (the page) and
// what loadVisits gets from the browser. Kept apart from lib/visit-filters, which the filter bar
// uses in the browser, so zod (about 90 KB gzipped) stays out of the page's scripts.

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

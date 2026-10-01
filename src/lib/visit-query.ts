import type { SupabaseClient } from "@supabase/supabase-js";

import { startOfLocalDay } from "@/lib/dates";
import type { VisitFilters } from "@/lib/visit-filters";

// My Visits' filters (SPEC §14.3) as a query on visits, with places embedded as
// `places!inner(...)` so the city and country filters apply to the visits.

// The date range matches by precision, in each visit's own zone: a date-only or exact-time
// visit by its local day, a month-only visit if any day of its month is in the range. Every
// visit is stored on its local day (month-only on the 1st, SPEC §8), so for that day d:
//   date only, exact time:  from ≤ d ≤ to
//   month only:             the 1st of from's month ≤ d ≤ to
// (its month ends on or after `from` and starts on or before `to`). The database only has the
// UTC instant, so for each of the user's zones these become bounds on visited_at, and zones
// with the same bounds share them.
export type DateBounds = {
  zones: string[];
  // ISO instants: visited_at ≥ from (date only, exact time), ≥ monthFrom (month only), < before.
  from: string | null;
  monthFrom: string | null;
  before: string | null;
};

export function dateBounds({ from, to }: Pick<VisitFilters, "from" | "to">, zones: string[]): DateBounds[] {
  if (!from && !to) return [];
  const groups = new Map<string, DateBounds>();
  for (const zone of [...new Set(zones)].sort()) {
    const bounds = {
      from: from && startOfLocalDay(from, zone).toISOString(),
      monthFrom: from && startOfLocalDay(`${from.slice(0, 7)}-01`, zone).toISOString(),
      before: to && startOfLocalDay(dayAfter(to), zone).toISOString(),
    };
    const key = JSON.stringify(bounds);
    const group = groups.get(key);
    if (group) group.zones.push(zone);
    else groups.set(key, { zones: [zone], ...bounds });
  }
  return [...groups.values()];
}

function dayAfter(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

// The bounds as one PostgREST `or` filter: a visit matches the group of its zone. Values are
// double-quoted, since instants contain the reserved "." and ":".
export function dateRangeFilter(groups: DateBounds[]) {
  const quote = (value: string) => `"${value}"`;
  return groups
    .map(({ zones, from, monthFrom, before }) => {
      const parts = [`timezone.in.(${zones.map(quote).join(",")})`];
      if (before) parts.push(`visited_at.lt.${quote(before)}`);
      if (from && monthFrom) {
        parts.push(
          from === monthFrom
            ? `visited_at.gte.${quote(from)}`
            : `or(visited_at.gte.${quote(from)},and(visited_precision.eq.month,visited_at.gte.${quote(monthFrom)}))`,
        );
      }
      return `and(${parts.join(",")})`;
    })
    .join(",");
}

// The query builder methods the filters use (the Supabase builder has them).
type Filterable<Q> = {
  in(column: string, values: readonly string[]): Q;
  eq(column: string, value: string): Q;
  or(filters: string): Q;
};

// `zones` are the user's visits' time zones (visitTimeZones), needed only with a date range.
// With none the user has no visits, so there's nothing to match anyway.
export function filterVisits<Q extends Filterable<Q>>(query: Q, filters: VisitFilters, zones: string[]): Q {
  let filtered = query;
  if (filters.categories.length) filtered = filtered.in("category", filters.categories);
  if (filters.country) filtered = filtered.eq("places.country", filters.country);
  if (filters.city) filtered = filtered.eq("places.city", filters.city);
  const groups = dateBounds(filters, zones);
  if (groups.length) filtered = filtered.or(dateRangeFilter(groups));
  return filtered;
}

// The distinct time zones of the user's visits. The user's session client, so RLS limits it to
// their own visits (SPEC §9).
export async function visitTimeZones(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("visits")
    .select("timezone")
    .overrideTypes<{ timezone: string }[], { merge: false }>();
  if (error) throw error;
  return [...new Set(data.map(({ timezone }) => timezone))];
}

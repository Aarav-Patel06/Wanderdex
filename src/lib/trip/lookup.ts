import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";

import type { Category } from "@/lib/categories";
import { isLocalValue, type Precision, timezoneAt } from "@/lib/dates";
import { type CallGate, type Candidate, nearbySearchWithRetry, PlacesError } from "@/lib/google/places";
import type { LatLng } from "@/lib/links/parse";
import { byDistance, readNearbyCache, writeNearbyCache } from "@/lib/nearby-cache";
import { readAllPages } from "@/lib/paging";
import { type SignedPlace, signingSecret, signPlace } from "@/lib/place-signature";
import { googleCallGate, importLookupsLeft, logImportLookup, RateLimitError } from "@/lib/rate-limit";
import { IMPORT_MAX_STOPS } from "@/lib/rate-limits";
import {
  GRID_CELL_M,
  IMPORT_LOOKUP_CONCURRENCY,
  LOCAL_MATCH_RADIUS_M,
  MAX_YOUR_PLACES,
  SHARE_RADIUS_M,
  YOUR_PLACES_RADIUS_M,
} from "@/lib/trip/config";
import { gridIndex } from "@/lib/trip/grid";
import { readAll } from "@/lib/trip/read";

// Trip Photos lookups (SPEC §11.8 step 5, §17), behind /api/resolve/import. Server only. Each stop
// is answered by the first layer that can, cheapest first: the user's own places (local match),
// another stop's lookup (shared), the shared lookup cache, then Google, unless the import
// allowance or the monthly cap has run out. Every stop is counted in exactly one layer.

// POST /api/resolve/import: the import's id (SPEC §11.8 step 8) and its stops in time order (stop
// n is stops[n - 1]), each its centroid and its local date. Strict, so nothing else from the
// photos can ride along.
export const importBodySchema = z.strictObject({
  import_id: z.uuid(),
  stops: z
    .array(
      z.strictObject({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        date: z.string().refine((value) => isLocalValue(value, "date")),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_STOPS),
});

export type ImportBody = z.infer<typeof importBodySchema>;

// One of the user's visits with its place, as the route reads them under the user's session
// (RLS: only their own visits, SPEC §9).
export type VisitPlaceRow = {
  category: Category;
  visited_at: string;
  visited_precision: Precision;
  timezone: string;
  place: {
    id: string;
    google_place_id: string | null;
    name: string;
    city: string | null;
    country: string | null;
    lat: number;
    lng: number;
  } | null;
};

export async function readVisitPlaces(supabase: SupabaseClient) {
  return readAllPages((from, to) =>
    supabase
      .from("visits")
      .select("category, visited_at, visited_precision, timezone, place:places(id, google_place_id, name, city, country, lat, lng)")
      // Newest first, so a place takes the category of the user's latest visit there.
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .overrideTypes<VisitPlaceRow[], { merge: false }>(),
  );
}

// One of the user's places near a stop ("Your places"): the user's category for it, its zone
// (from its coordinates, as the save works it out), its distance, and whether the user already has
// a visit there on the stop's local date. Saved by its id.
export type YourPlace = {
  id: string;
  name: string;
  category: Category;
  city: string | null;
  country: string | null;
  timezone: string;
  metres: number;
  logged: boolean;
};

// A signed Google candidate (signed as for any lookup, SPEC §11.6 step 1), and whether it's a
// place where the user already has a visit on the stop's local date.
export type ImportCandidate = SignedPlace & { logged: boolean };

// For each stop: local, when one of the user's places is within LOCAL_MATCH_RADIUS_M (yours[0],
// preselected; nothing was looked up); its "Your places" (within YOUR_PLACES_RADIUS_M, nearest
// first); and its Google candidates (cached or fresh, nearest first, leaving out the user's own
// places, which are already in yours).
export type ImportStop = { local: boolean; yours: YourPlace[]; candidates: ImportCandidate[] };

// How the stops were answered (each counted once; they add up to `stops`), and the Google calls
// made (a 150 m retry counts twice). Also the import_log row (SPEC §8).
export type ImportCounts = {
  stops: number;
  local_matches: number;
  shared: number;
  cache_hits: number;
  google_lookups: number;
  google_calls: number;
  unmatched_limit: number;
};

export type ImportResult = { stops: ImportStop[]; counts: ImportCounts };

type KnownPlace = NonNullable<VisitPlaceRow["place"]> & {
  category: Category;
  // The local dates ("YYYY-MM-DD") of the user's date-only and exact-time visits here, and the
  // months ("YYYY-MM") of their month-only ones, each in its visit's zone.
  days: Set<string>;
  months: Set<string>;
};

// The user's places, from their visits.
export function knownPlaces(rows: VisitPlaceRow[]): KnownPlace[] {
  const byId = new Map<string, KnownPlace>();
  for (const { category, visited_at, visited_precision, timezone, place } of rows) {
    if (!place) continue;
    let known = byId.get(place.id);
    if (!known) {
      known = { ...place, category, days: new Set(), months: new Set() };
      byId.set(place.id, known);
    }
    if (visited_precision === "month") known.months.add(formatInTimeZone(visited_at, timezone, "yyyy-MM"));
    else known.days.add(formatInTimeZone(visited_at, timezone, "yyyy-MM-dd"));
  }
  return [...byId.values()];
}

// "Already logged" (SPEC §11.8 step 6): the user has a visit at the place on the local date, by
// precision as in My Visits' date filter (§14.3): a date-only or exact-time visit on that day, or
// a month-only visit in that month.
export function loggedOn(place: Pick<KnownPlace, "days" | "months">, date: string) {
  return place.days.has(date) || place.months.has(date.slice(0, 7));
}

// What a lookup for a group of stops came to: answered by the cache or Google, or left unmatched
// because the allowance or a cap ran out.
type Outcome = { layer: "cache" | "google" | "limit"; candidates: Candidate[] };

export async function resolveImport(
  body: ImportBody,
  rows: VisitPlaceRow[],
  { admin, userId, now = new Date() }: { admin: SupabaseClient; userId: string; now?: Date },
): Promise<ImportResult> {
  // Before any work: without the secret there are no signed results to return.
  const secret = signingSecret();
  const { stops } = body;
  const places = knownPlaces(rows);
  const placesByGoogleId = new Map(places.flatMap((place) => (place.google_place_id ? [[place.google_place_id, place]] : [])));

  // Local match: the user's places near each stop, from the grid.
  const placeGrid = gridIndex(places, GRID_CELL_M, stops);
  const near = stops.map((stop) => placeGrid.near(stop, YOUR_PLACES_RADIUS_M).slice(0, MAX_YOUR_PLACES));
  const local = near.map((found) => found.length > 0 && found[0].metres <= LOCAL_MATCH_RADIUS_M);

  // Shared result: in time order, each remaining stop not yet in a group leads one, with the other
  // remaining stops within SHARE_RADIUS_M of it. The leader's point is looked up for them all.
  const remaining = stops.flatMap((stop, index) => (local[index] ? [] : [{ ...stop, index }]));
  const stopGrid = gridIndex(remaining, GRID_CELL_M);
  const groupOf = new Array<number>(stops.length).fill(-1);
  const leaders: number[] = [];
  for (const { index } of remaining) {
    if (groupOf[index] !== -1) continue;
    for (const { item } of stopGrid.near(stops[index], SHARE_RADIUS_M)) {
      if (groupOf[item.index] === -1) groupOf[item.index] = leaders.length;
    }
    leaders.push(index);
  }

  // Cache, then Google while the allowance (counted here, so lookups running at once can't
  // overshoot it) and the monthly cap last. A cap, or Google's own 429 (its daily quota), stops
  // every later lookup from going to Google; cache hits still answer.
  const gate = googleCallGate(admin, userId);
  let googleCalls = 0;
  const countingGate: CallGate = async (sku) => {
    await gate(sku);
    googleCalls++;
  };
  let allowance = await importLookupsLeft(admin, userId, now);
  let stopped = false;
  const lookup = async (point: LatLng): Promise<Outcome> => {
    const cached = await readNearbyCache(admin, point, now);
    if (cached) return { layer: "cache", candidates: cached };
    if (stopped || allowance === 0) return { layer: "limit", candidates: [] };
    allowance--;
    await logImportLookup(admin, userId);
    try {
      const found = await nearbySearchWithRetry(countingGate, point);
      await writeNearbyCache(admin, point, found, now);
      return { layer: "google", candidates: found };
    } catch (error) {
      if (error instanceof RateLimitError || (error instanceof PlacesError && error.status === 429)) {
        stopped = true;
        return { layer: "limit", candidates: [] };
      }
      if (!(error instanceof PlacesError)) throw error;
      // An outage or a timeout: this lookup went to Google and found nothing; the others go on.
      console.error("import lookup failed:", error.message);
      return { layer: "google", candidates: [] };
    }
  };
  const outcomes = await readAll(leaders, (index) => lookup(stops[index]), IMPORT_LOOKUP_CONCURRENCY, () => {});

  const counts: ImportCounts = {
    stops: stops.length,
    local_matches: 0,
    shared: 0,
    cache_hits: 0,
    google_lookups: 0,
    google_calls: googleCalls,
    unmatched_limit: 0,
  };
  const results = stops.map((stop, index): ImportStop => {
    const yours = near[index].map(({ item, metres }) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      city: item.city,
      country: item.country,
      timezone: timezoneAt(item.lat, item.lng),
      metres,
      logged: loggedOn(item, stop.date),
    }));
    if (local[index]) {
      counts.local_matches++;
      return { local: true, yours, candidates: [] };
    }
    const group = groupOf[index];
    const outcome = outcomes[group];
    // A stop sharing a lookup that ran out of allowance is unmatched by the limit too.
    if (outcome.layer === "limit") counts.unmatched_limit++;
    else if (leaders[group] !== index) counts.shared++;
    else if (outcome.layer === "cache") counts.cache_hits++;
    else counts.google_lookups++;

    const yourIds = new Set(yours.map((place) => place.id));
    const candidates = byDistance(stop, outcome.candidates).flatMap((candidate) => {
      const known = placesByGoogleId.get(candidate.google_place_id);
      if (known && yourIds.has(known.id)) return [];
      const signed = signPlace({ ...candidate, timezone: timezoneAt(candidate.lat, candidate.lng) }, secret);
      return [{ ...signed, logged: known ? loggedOn(known, stop.date) : false }];
    });
    return { local: false, yours, candidates };
  });

  // Counts only, no locations (SPEC §8). One row per import: a repeated lookup for the same import
  // keeps the first. Only for measuring, so a failed write doesn't fail the lookup.
  const { error } = await admin
    .from("import_log")
    .upsert({ import_id: body.import_id, user_id: userId, ...counts }, { onConflict: "import_id", ignoreDuplicates: true });
  if (error) console.error("import_log write failed:", error);

  return { stops: results, counts };
}

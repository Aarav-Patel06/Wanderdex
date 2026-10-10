import type { SupabaseClient } from "@supabase/supabase-js";

import { type CallGate, type Candidate, nearbySearchWithRetry } from "@/lib/google/places";
import type { LatLng } from "@/lib/links/parse";
import { NEARBY_CACHE_EMPTY_TTL_MS, NEARBY_CACHE_STEP_DEG, NEARBY_CACHE_TTL_MS } from "@/lib/trip/config";
import { metres } from "@/lib/trip/group";

// The shared Nearby Search cache (SPEC §17), in front of every Nearby Search: Trip Photos, Upload
// Photo, a dropped pin's city and country, and a coordinates-only link. nearby_cache is
// service_role only, so these take the admin client. It holds Google's results only: no
// signatures (candidates are signed fresh for each answer) and no user id. The cache never fails a
// lookup: a failed read is a miss, and a failed write is only logged.

// Nearby Search at a point: its results, nearest first.
export type NearbyLookup = (point: LatLng) => Promise<Candidate[]>;

// The point's cell: latitude and longitude rounded to NEARBY_CACHE_STEP_DEG, as "lat,lng". 180 and
// -180 are the same meridian, so they're the same cell.
export function cacheCell({ lat, lng }: LatLng) {
  const round = (value: number) => Math.round(value / NEARBY_CACHE_STEP_DEG) * NEARBY_CACHE_STEP_DEG;
  let cellLng = round(lng);
  if (cellLng > 180 - NEARBY_CACHE_STEP_DEG / 2) cellLng -= 360;
  // toFixed: no floating-point tails (0.6000000000000001), and -0 is "0.0000".
  return `${round(lat).toFixed(4)},${cellLng.toFixed(4)}`;
}

// The cached result for the point's cell, nearest the point first, if it's young enough: a result
// for NEARBY_CACHE_TTL_MS, an empty one (nothing within 150 m) for NEARBY_CACHE_EMPTY_TTL_MS.
// null: no row, an expired one (the next write replaces it), or a failed read.
export async function readNearbyCache(admin: SupabaseClient, point: LatLng, now = new Date()) {
  const { data, error } = await admin
    .from("nearby_cache")
    .select("candidates, fetched_at")
    .eq("cell", cacheCell(point))
    .maybeSingle<{ candidates: Candidate[]; fetched_at: string }>();
  if (error) {
    console.error("nearby cache read failed:", error);
    return null;
  }
  if (!data || !Array.isArray(data.candidates)) return null;
  const ttl = data.candidates.length ? NEARBY_CACHE_TTL_MS : NEARBY_CACHE_EMPTY_TTL_MS;
  if (now.getTime() - Date.parse(data.fetched_at) >= ttl) return null;
  return byDistance(point, data.candidates);
}

// Stores Google's result for the point's cell (replacing any older row there), and deletes every
// row past NEARBY_CACHE_TTL_MS, so the table never needs a cleanup job.
export async function writeNearbyCache(admin: SupabaseClient, point: LatLng, candidates: Candidate[], now = new Date()) {
  const [write, sweep] = await Promise.all([
    admin
      .from("nearby_cache")
      .upsert({ cell: cacheCell(point), candidates, fetched_at: now.toISOString() }, { onConflict: "cell" }),
    admin
      .from("nearby_cache")
      .delete()
      .lt("fetched_at", new Date(now.getTime() - NEARBY_CACHE_TTL_MS).toISOString()),
  ]);
  if (write.error) console.error("nearby cache write failed:", write.error);
  if (sweep.error) console.error("nearby cache sweep failed:", sweep.error);
}

// Nearby Search through the cache: a hit answers with no Google call (so it's neither logged nor
// stopped by the monthly cap, `gate`); a miss calls Google (50 m, then 150 m) and caches the result.
// allowGoogle runs on a miss, before Google: false skips the call and answers with nothing,
// caching nothing (an import out of its allowance, SPEC §17).
export function cachedNearby(
  admin: SupabaseClient,
  gate: CallGate,
  allowGoogle: () => Promise<boolean> = async () => true,
): NearbyLookup {
  return async (point) => {
    const cached = await readNearbyCache(admin, point);
    if (cached) return cached;
    if (!(await allowGoogle())) return [];
    const found = await nearbySearchWithRetry(gate, point);
    await writeNearbyCache(admin, point, found);
    return found;
  };
}

// Candidates nearest the point first: a cached or shared result was ranked for another point in
// its cell or group.
export function byDistance(point: LatLng, candidates: Candidate[]) {
  return candidates
    .map((candidate) => ({ candidate, m: metres(point, candidate) }))
    .sort((a, b) => a.m - b.m)
    .map(({ candidate }) => candidate);
}

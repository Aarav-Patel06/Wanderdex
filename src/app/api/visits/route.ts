import type { SupabaseClient } from "@supabase/supabase-js";

import { errorResponse, readBody, session } from "@/lib/api";
import type { Category } from "@/lib/categories";
import { timezoneAt, visitedAtUtc } from "@/lib/dates";
import { placeArea } from "@/lib/manual-place";
import { cachedNearby, type NearbyLookup } from "@/lib/nearby-cache";
import { type PlaceFields, signingSecret, verifyPlace } from "@/lib/place-signature";
import { googleCallGate, limitLookup, RateLimitError, takeImportLookup } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  alignCategory,
  findImportVisit,
  findReadablePlace,
  isFirstInCountry,
  isReturnVisit,
  type ManualPlace,
  newVisitSchema,
  PLACE_COLUMNS,
  type SavedVisit,
  VISIT_COLUMNS,
} from "@/lib/visits";

// Saves a visit (SPEC §11.6 steps 1–5), from the confirmation card after a lookup (a signed
// candidate), for a place that already exists (by id), or at a dropped pin (a new manual place,
// SPEC §11.4), and says whether it's a return visit and whether it's the user's first in its
// country, for the client's toasts. A Trip Photos stop (`trip`, SPEC §11.8 step 8) is saved at most
// once: a repeated save answers with the visit already saved.
export async function POST(request: Request) {
  const { supabase, userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, newVisitSchema);
  if (!body) return errorResponse("invalid_input");
  const trip = "trip" in body ? body.trip : undefined;

  try {
    // Before writing anything: a stop that's already saved (a timeout, a lost response, a double
    // tap) answers with its visit, so a retry never makes a second visit or manual place.
    if (trip) {
      const existing = await findImportVisit(supabase, userId, trip);
      if (existing) return Response.json(await savedVisit(supabase, userId, existing));
    }

    let place: SavedVisit["place"];
    let source: { source: "link" | "text" | "photo" | "manual"; source_input: string | null };
    // A manual place made by this request, removed again if the stop turns out to be saved already.
    let madePlaceId: string | null = null;
    if ("manual_place" in body) {
      const admin = createAdminClient();
      const gate = googleCallGate(admin, userId);
      let nearby: NearbyLookup;
      if (trip) {
        // An import's pin: Google only while the import allowance lasts, else the country shapes
        // (SPEC §17). Not held to the lookup limits.
        nearby = cachedNearby(admin, gate, () => takeImportLookup(admin, userId));
      } else {
        // It calls Nearby Search, so it counts as a lookup (SPEC §17).
        await limitLookup(admin, userId, "nearby");
        nearby = cachedNearby(admin, gate);
      }
      place = await createManualPlace(admin, body.manual_place, body.category, userId, nearby);
      madePlaceId = place.id;
      source = { source: trip ? "photo" : "manual", source_input: null };
    } else if ("place_id" in body) {
      // Nothing about the place is written, so no signature: it only has to exist and be
      // readable by this user under RLS (Google places, or their own manual ones, SPEC §9).
      const found = await findReadablePlace(supabase, body.place_id);
      if (!found) return errorResponse("not_found");
      place = found;
      source = { source: trip ? "photo" : "manual", source_input: null };
    } else {
      // Only a place /api/resolve/* signed. Without the secret this throws, so nothing is saved.
      const verified = verifyPlace(body.place, signingSecret());
      if (!verified) return errorResponse("place_unverified");
      place = await findOrCreatePlace(verified);
      source = { source: body.source, source_input: body.source_input };
    }
    // One category per user per place (SPEC §8): the user's earlier visits here take the one
    // chosen now. Before the insert, so a failed update saves nothing and a retry can't
    // duplicate the visit.
    await alignCategory(supabase, { userId, placeId: place.id, category: body.category });
    // From the stored place's coordinates, so every visit to a place uses the same zone.
    const timezone = timezoneAt(place.lat, place.lng);
    // The user's own client, so RLS checks that the visit is theirs (SPEC §9).
    const { data: visit, error } = await supabase
      .from("visits")
      .insert({
        user_id: userId,
        place_id: place.id,
        category: body.category,
        visited_at: visitedAtUtc(body.visited.value, body.visited.precision, timezone).toISOString(),
        visited_precision: body.visited.precision,
        timezone,
        rating: body.rating,
        note: body.note,
        ...source,
        ...(trip && { import_id: trip.import_id, import_stop: trip.stop }),
      })
      .select(VISIT_COLUMNS)
      .single<SavedVisit["visit"]>();
    if (error) {
      // Two saves of one stop at once both got past the check above: the unique index
      // (visits_import_stop_idx) let only one insert through. Answer with that one's visit.
      const existing = trip && error.code === "23505" ? await findImportVisit(supabase, userId, trip) : null;
      if (!existing) throw error;
      if (madePlaceId) await deletePlace(madePlaceId);
      return Response.json(await savedVisit(supabase, userId, existing));
    }
    return Response.json(await savedVisit(supabase, userId, visit, place));
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse("rate_limited");
    console.error("visits save failed:", error);
    return errorResponse("upstream_error");
  }
}

// The response for a saved visit: its place (read again under RLS for one saved earlier) and the
// toasts' flags. The visit is already saved, so a failed check only changes the toasts: a failed
// return check shows "New place discovered!", a failed country check skips the country toast.
async function savedVisit(
  supabase: SupabaseClient,
  userId: string,
  visit: SavedVisit["visit"],
  known?: SavedVisit["place"],
): Promise<SavedVisit> {
  const place = known ?? (await findReadablePlace(supabase, visit.place_id));
  if (!place) throw new Error(`Saved visit ${visit.id} has no readable place`);
  const [returnCheck, countryCheck] = await Promise.allSettled([
    isReturnVisit(supabase, { userId, placeId: place.id, visitId: visit.id }),
    isFirstInCountry(supabase, { userId, visitId: visit.id, countryCode: place.country_code }),
  ]);
  const return_visit = settledFlag(returnCheck, "return-visit");
  const first_in_country = settledFlag(countryCheck, "first-in-country");
  return { place, visit, return_visit, first_in_country };
}

function settledFlag(result: PromiseSettledResult<boolean>, check: string) {
  if (result.status === "fulfilled") return result.value;
  console.error(`${check} check failed:`, result.reason);
  return false;
}

// A dropped pin's place (SPEC §11.4), private to the user who made it (created_by, RLS §9). The
// browser can't write places, so this uses the secret key. Its category is the one the user chose;
// it has no Google ID, type, or address. Every save makes a new row: a return visit to it goes by
// its id. If the visit insert then fails, the row stays, unused and visible to no one else.
async function createManualPlace(
  admin: SupabaseClient,
  { name, lat, lng }: ManualPlace,
  category: Category,
  userId: string,
  nearby: NearbyLookup,
): Promise<SavedVisit["place"]> {
  const area = await placeArea({ lat, lng }, nearby);
  const { data, error } = await admin
    .from("places")
    .insert({
      google_place_id: null,
      name,
      category,
      google_primary_type: null,
      address: null,
      ...area,
      lat,
      lng,
      timezone: timezoneAt(lat, lng),
      created_by: userId,
    })
    .select(PLACE_COLUMNS)
    .single<SavedVisit["place"]>();
  if (error) throw error;
  return data;
}

// A manual place this request made for a stop that another save of the same stop got to first.
// Nothing refers to it yet. If deleting fails, it stays, unused and private (as above).
async function deletePlace(placeId: string) {
  const { error } = await createAdminClient().from("places").delete().eq("id", placeId);
  if (error) console.error("removing a duplicate manual place failed:", error);
}

// places is shared and the browser can't write it, so this uses the secret key. A new Google
// place is inserted; an existing row is reused as it is, never overwritten.
async function findOrCreatePlace(place: PlaceFields): Promise<SavedVisit["place"]> {
  const admin = createAdminClient();
  // types only picks the category; places has no column for it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { types, ...row } = place;
  const { data: inserted, error } = await admin
    .from("places")
    .upsert(row, { onConflict: "google_place_id", ignoreDuplicates: true })
    .select(PLACE_COLUMNS)
    .overrideTypes<SavedVisit["place"][], { merge: false }>();
  if (error) throw error;
  // ignoreDuplicates (on conflict do nothing) returns no row when the place already exists.
  if (inserted.length) return inserted[0];

  const { data: existing, error: selectError } = await admin
    .from("places")
    .select(PLACE_COLUMNS)
    .eq("google_place_id", place.google_place_id)
    .single<SavedVisit["place"]>();
  if (selectError) throw selectError;
  return existing;
}

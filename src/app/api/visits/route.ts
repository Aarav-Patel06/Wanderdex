import { errorResponse, readBody, session } from "@/lib/api";
import { timezoneAt, visitedAtUtc } from "@/lib/dates";
import { type PlaceFields, signingSecret, verifyPlace } from "@/lib/place-signature";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findReadablePlace,
  isFirstInCountry,
  isReturnVisit,
  newVisitSchema,
  PLACE_COLUMNS,
  type SavedVisit,
  VISIT_COLUMNS,
} from "@/lib/visits";

// Saves a visit (SPEC §11.6 steps 1–5), from the confirmation card after a lookup (a signed
// candidate) or for a place that already exists (by id), and says whether it's a return visit
// and whether it's the user's first in its country, for the client's toasts.
export async function POST(request: Request) {
  const { supabase, userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, newVisitSchema);
  if (!body) return errorResponse("invalid_input");

  try {
    let place: SavedVisit["place"];
    let source: { source: "link" | "text" | "manual"; source_input: string | null };
    if ("place_id" in body) {
      // Nothing about the place is written, so no signature: it only has to exist and be
      // readable by this user under RLS (Google places, or their own manual ones, SPEC §9).
      const found = await findReadablePlace(supabase, body.place_id);
      if (!found) return errorResponse("not_found");
      place = found;
      source = { source: "manual", source_input: null };
    } else {
      // Only a place /api/resolve/* signed. Without the secret this throws, so nothing is saved.
      const verified = verifyPlace(body.place, signingSecret());
      if (!verified) return errorResponse("place_unverified");
      place = await findOrCreatePlace(verified);
      source = { source: body.source, source_input: body.source_input };
    }
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
      })
      .select(VISIT_COLUMNS)
      .single<SavedVisit["visit"]>();
    if (error) throw error;
    // The visit is already saved, so a failed check only changes the toasts: a failed return
    // check shows "New place discovered!", a failed country check skips the country toast.
    const [returnCheck, countryCheck] = await Promise.allSettled([
      isReturnVisit(supabase, { userId, placeId: place.id, visitId: visit.id }),
      isFirstInCountry(supabase, { userId, visitId: visit.id, countryCode: place.country_code }),
    ]);
    const return_visit = settledFlag(returnCheck, "return-visit");
    const first_in_country = settledFlag(countryCheck, "first-in-country");
    return Response.json({ place, visit, return_visit, first_in_country } satisfies SavedVisit);
  } catch (error) {
    console.error("visits save failed:", error);
    return errorResponse("upstream_error");
  }
}

function settledFlag(result: PromiseSettledResult<boolean>, check: string) {
  if (result.status === "fulfilled") return result.value;
  console.error(`${check} check failed:`, result.reason);
  return false;
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

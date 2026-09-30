import { errorResponse, readBody } from "@/lib/api";
import { timezoneAt, visitedAtUtc } from "@/lib/dates";
import { type PlaceFields, signingSecret, verifyPlace } from "@/lib/place-signature";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { newVisitSchema, PLACE_COLUMNS, type SavedVisit, VISIT_COLUMNS } from "@/lib/visits";

// Saves a visit from the confirmation card (SPEC §11.6 steps 1–4). The first-visit-in-country
// check belongs to the toasts (Phase 2).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, newVisitSchema);
  if (!body) return errorResponse("invalid_input");

  try {
    // Only a place /api/resolve/* signed. Without the secret this throws, so nothing is saved.
    const verified = verifyPlace(body.place, signingSecret());
    if (!verified) return errorResponse("place_unverified");
    const place = await findOrCreatePlace(verified);
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
        source: body.source,
        source_input: body.source_input,
      })
      .select(VISIT_COLUMNS)
      .single<SavedVisit["visit"]>();
    if (error) throw error;
    return Response.json({ place, visit } satisfies SavedVisit);
  } catch (error) {
    console.error("visits save failed:", error);
    return errorResponse("upstream_error");
  }
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

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CATEGORIES, type Category } from "@/lib/categories";
import { isLocalValue, PRECISIONS } from "@/lib/dates";

// Optional rating and note (SPEC §11.5). A note is trimmed, and an empty one is no note. The
// limits match the visits table's checks (SPEC §8); a JS length counts an emoji as 2, so 2000
// here is never more than char_length's 2000.
export const NOTE_MAX = 2000;
export const ratingSchema = z.number().int().min(1).max(10).nullable();
export const noteSchema = z
  .string()
  .trim()
  .max(NOTE_MAX)
  .nullable()
  .transform((note) => note || null);

// The user's choices for a visit (SPEC §11.5): local time in the place's zone at its precision,
// rating, and note. A new visit and an edit share them.
const visitedSchema = z
  .object({ value: z.string(), precision: z.enum(PRECISIONS) })
  .refine(({ value, precision }) => isLocalValue(value, precision));

const visitChoices = {
  visited: visitedSchema,
  rating: ratingSchema,
  note: noteSchema,
};

// POST /api/visits (SPEC §11.6) takes one of two shapes, the user's choices plus their category
// (pre-filled, editable) either way:
// - `place`: the candidate picked on the confirmation card, exactly as /api/resolve/* signed it;
//   the route checks the signature before using any of it, so its strings aren't trimmed here
//   (that would break the signature). Saved as the lookup's source, with its input.
// - `place_id`: a place that already exists (place detail's "Add another visit", and later the
//   manual places of §11.4). Nothing about the place is written, so there's nothing to sign: the
//   route only checks that the user can read it under RLS (Google places, or their own manual
//   ones, SPEC §9). Saved with source "manual" and no source input.
// The user's choices only affect their own visit row.
export const newVisitSchema = z.union([
  z.object({
    place: z.object({
      google_place_id: z.string().min(1).max(300),
      name: z.string().min(1).max(300),
      google_primary_type: z.string().max(100).nullable(),
      types: z.array(z.string().max(100)).max(100),
      category: z.enum(CATEGORIES),
      address: z.string().max(500).nullable(),
      city: z.string().max(200).nullable(),
      country: z.string().max(200).nullable(),
      country_code: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .nullable(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      timezone: z.string().min(1).max(100),
      expires: z.number().int(),
      signature: z.string().regex(/^[0-9a-f]{64}$/),
    }),
    category: z.enum(CATEGORIES),
    ...visitChoices,
    source: z.enum(["link", "text"]),
    source_input: z.string().trim().min(1).max(2048),
  }),
  z.object({
    place_id: z.uuid(),
    category: z.enum(CATEGORIES),
    ...visitChoices,
  }),
]);

export type NewVisit = z.infer<typeof newVisitSchema>;

// PATCH /api/visits/[id]: everything on the edit dialog (SPEC §14.4). The category is per place
// (below), not per visit.
export const visitEditSchema = z.object(visitChoices);

export type VisitEdit = z.infer<typeof visitEditSchema>;

// PATCH /api/places/[id]/category: the user's category for every one of their visits there (SPEC §8).
export const categoryChangeSchema = z.object({ category: z.enum(CATEGORIES) });

// The [id] in /api/visits/[id] and /api/places/[id]/category, and /places/[id].
export const idSchema = z.uuid();

// What /api/visits returns: the place row (new or reused), the visit it inserted, and, for the
// toasts (SPEC §11.6), whether the user already had a visit at this place and whether this is
// their first visit in the place's country.
export const PLACE_COLUMNS = "id, name, city, country, country_code, lat, lng";
export const VISIT_COLUMNS = "id, place_id, category, visited_at, visited_precision, timezone";

export type SavedVisit = {
  place: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
    country_code: string | null;
    lat: number;
    lng: number;
  };
  visit: {
    id: string;
    place_id: string;
    category: Category;
    visited_at: string;
    visited_precision: (typeof PRECISIONS)[number];
    timezone: string;
  };
  return_visit: boolean;
  first_in_country: boolean;
};

// A place by id, if this user can read it (RLS: a Google place, or their own manual place), as
// /api/visits returns it; null when there's no such place or it's someone else's manual place.
export async function findReadablePlace(supabase: SupabaseClient, placeId: string) {
  const { data, error } = await supabase
    .from("places")
    .select(PLACE_COLUMNS)
    .eq("id", placeId)
    .maybeSingle<SavedVisit["place"]>();
  if (error) throw error;
  return data;
}

// How many visits the user has at a place, leaving out `except` (a visit just saved).
export async function visitsAt(
  supabase: SupabaseClient,
  { userId, placeId, except }: { userId: string; placeId: string; except?: string },
) {
  let query = supabase
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("place_id", placeId);
  if (except) query = query.neq("id", except);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

// One category per user per place (SPEC §8): moves the user's visits at a place that are in
// another category to `category`, the same as the place page's category edit. A save calls it
// before inserting, so a new visit in a new category recategorizes the earlier ones. Under the
// user's own client, so RLS limits it to their visits (SPEC §9); user_id is filtered too.
export async function alignCategory(
  supabase: SupabaseClient,
  { userId, placeId, category }: { userId: string; placeId: string; category: Category },
) {
  const { error } = await supabase
    .from("visits")
    .update({ category })
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .neq("category", category);
  if (error) throw error;
}

// True when the user already had a visit at this place before the one just saved, from any
// path (a link to a place they've logged, or "Add another visit"): "Return visit!" instead of
// "New place discovered!" (SPEC §11.6 step 6).
export async function isReturnVisit(
  supabase: SupabaseClient,
  { userId, placeId, visitId }: { userId: string; placeId: string; visitId: string },
) {
  return (await visitsAt(supabase, { userId, placeId, except: visitId })) > 0;
}

// SPEC §11.6 step 5: true when the user has no other visit in this country, not counting
// the one just inserted. A place with no country code never counts. Under the user's own
// client, so RLS limits it to their visits (SPEC §9); user_id is filtered too.
export async function isFirstInCountry(
  supabase: SupabaseClient,
  { userId, visitId, countryCode }: { userId: string; visitId: string; countryCode: string | null },
) {
  if (!countryCode) return false;
  const { count, error } = await supabase
    .from("visits")
    .select("id, places!inner(country_code)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("places.country_code", countryCode)
    .neq("id", visitId);
  if (error) throw error;
  return count === 0;
}

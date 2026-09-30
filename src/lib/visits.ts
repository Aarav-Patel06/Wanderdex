import { z } from "zod";

import { CATEGORIES, type Category } from "@/lib/categories";
import { isLocalValue, PRECISIONS } from "@/lib/dates";

// POST /api/visits (SPEC §11.6). `place` is the candidate picked on the confirmation card, exactly
// as /api/resolve/* signed it; the route checks the signature before using any of it, so its
// strings aren't trimmed here (that would break the signature). Only `category` (the user's
// pick) and `visited` (local time in the place's zone, at its precision) come from the user.
// Phase 2's manual places (§11.4: google_place_id null, private to their creator) aren't from a
// lookup, so they'll come in a separate, unsigned field and skip the signature check.
export const newVisitSchema = z.object({
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
  visited: z
    .object({ value: z.string(), precision: z.enum(PRECISIONS) })
    .refine(({ value, precision }) => isLocalValue(value, precision)),
  source: z.enum(["link", "text"]),
  source_input: z.string().trim().min(1).max(2048),
});

export type NewVisit = z.infer<typeof newVisitSchema>;

// What /api/visits returns: the place row (new or reused) and the visit it inserted.
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
};

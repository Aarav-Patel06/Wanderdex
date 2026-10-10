import type { Category } from "@/lib/categories";
import { localValue, type Precision } from "@/lib/dates";
import type { ExportRow } from "@/lib/export-file";

// Export data (SPEC §14.6): the user's visits with their places, as /api/export reads them under
// the user's session (RLS) and shapes them for the files (lib/export-file).

export const EXPORT_SELECT =
  "visited_at, visited_precision, timezone, category, rating, note, source, source_input, created_at, places!inner(name, address, city, country, country_code, lat, lng, google_place_id)";

export type ExportVisit = {
  visited_at: string;
  visited_precision: Precision;
  timezone: string;
  category: Category;
  rating: number | null;
  note: string | null;
  source: string;
  source_input: string | null;
  created_at: string;
  places: {
    name: string;
    address: string | null;
    city: string | null;
    country: string | null;
    country_code: string | null;
    lat: number;
    lng: number;
    google_place_id: string | null;
  };
};

// A visit as one export row: the user's category for it, its date both as the UTC instant and as
// the local value at its precision in its zone ("2025-03-12T14:30", "2025-03-12", "2025-03", as
// the app stores and edits them, SPEC §8), and the timestamps in ISO form.
export function exportRow(visit: ExportVisit): ExportRow {
  const { places: place } = visit;
  return {
    name: place.name,
    category: visit.category,
    address: place.address,
    city: place.city,
    country: place.country,
    country_code: place.country_code,
    lat: place.lat,
    lng: place.lng,
    visited_at_utc: new Date(visit.visited_at).toISOString(),
    visited_local: localValue(visit.visited_at, visit.visited_precision, visit.timezone),
    precision: visit.visited_precision,
    timezone: visit.timezone,
    rating: visit.rating,
    note: visit.note,
    source: visit.source,
    source_input: visit.source_input,
    google_place_id: place.google_place_id,
    created_at: new Date(visit.created_at).toISOString(),
  };
}

import { type CountryShape, countryAt, loadCountryShapes } from "@/lib/countries";
import { type Candidate, nearbySearchWithRetry, PlacesError } from "@/lib/google/places";
import type { LatLng } from "@/lib/links/parse";

// City and country for a dropped pin (SPEC §11.4), worked out on the server from its coordinates.

export type PlaceArea = Pick<Candidate, "city" | "country" | "country_code">;

// Nearby Search at the pin (50 m, then 150 m, nearest first), using the first result's address:
// the same city and country rules as any lookup (SPEC §12.1, Tokyo included). With no result,
// the country comes from the Natural Earth shapes and the city stays empty. A Google error
// (quota, outage) also falls back to the shapes, so saving a pin never depends on Google.
export async function placeArea(
  point: LatLng,
  shapes: () => Promise<CountryShape[]> = loadCountryShapes,
): Promise<PlaceArea> {
  let nearest: Candidate | undefined;
  try {
    [nearest] = await nearbySearchWithRetry(point);
  } catch (error) {
    if (!(error instanceof PlacesError)) throw error;
    console.error("manual place: Nearby Search failed, using the country shapes:", error.message);
  }
  if (nearest) return { city: nearest.city, country: nearest.country, country_code: nearest.country_code };

  const code = countryAt(await shapes(), point);
  return { city: null, country: code && countryName(code), country_code: code };
}

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

// The shapes only carry the code. The English name, as Google spells most of them ("Japan",
// "United States").
export function countryName(code: string) {
  return REGION_NAMES.of(code) ?? null;
}

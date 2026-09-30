import { type Category, categoryFromGoogle } from "@/lib/categories";
import type { LatLng } from "@/lib/links/parse";

// Google Places API (New), SPEC §12.1. Server only: uses GOOGLE_PLACES_API_KEY.

const BASE = "https://places.googleapis.com/v1/places";

// Every field here bills at the Pro SKU for both Text and Nearby Search (DECISIONS.md).
// Never add ratings, reviews, photos, phone, website, hours, or price: those are Enterprise.
export const FIELD_MASK =
  "places.id,places.displayName,places.primaryType,places.types,places.location,places.formattedAddress,places.addressComponents";

const MAX_RESULTS = 3;
const BIAS_RADIUS_M = 500;
const NEARBY_RADII_M = [50, 150];
const TIMEOUT_MS = 8000;
// English names and addresses where Google has them. A request parameter, not a field: no SKU change.
const LANGUAGE_CODE = "en";

export type Candidate = {
  google_place_id: string;
  name: string;
  google_primary_type: string | null;
  types: string[];
  category: Category;
  address: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  lat: number;
  lng: number;
};

// status is Google's HTTP status, or null for a network error or timeout.
export class PlacesError extends Error {
  constructor(readonly status: number | null) {
    super(`Places API request failed${status ? ` (${status})` : ""}`);
  }
}

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  primaryType?: string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
};

export function textSearch(query: string, bias?: LatLng | null) {
  return search("searchText", {
    textQuery: query,
    pageSize: MAX_RESULTS,
    languageCode: LANGUAGE_CODE,
    ...(bias && { locationBias: { circle: circle(bias, BIAS_RADIUS_M) } }),
  });
}

export function nearbySearch(point: LatLng, radius: number) {
  return search("searchNearby", {
    locationRestriction: { circle: circle(point, radius) },
    rankPreference: "DISTANCE",
    maxResultCount: MAX_RESULTS,
    languageCode: LANGUAGE_CODE,
  });
}

// 50 m, then once more at 150 m if nothing was found (SPEC §11.2 step 4).
export async function nearbySearchWithRetry(point: LatLng) {
  let places: Candidate[] = [];
  for (const radius of NEARBY_RADII_M) {
    places = await nearbySearch(point, radius);
    if (places.length) break;
  }
  return places;
}

function circle({ lat, lng }: LatLng, radius: number) {
  return { center: { latitude: lat, longitude: lng }, radius };
}

async function search(method: "searchText" | "searchNearby", body: object) {
  let res: Response;
  try {
    res = await fetch(`${BASE}:${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY ?? "",
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PlacesError(null);
  }
  if (!res.ok) {
    console.error(`Places ${method} ${res.status}:`, await res.text().catch(() => ""));
    throw new PlacesError(res.status);
  }

  let data: { places?: GooglePlace[] };
  try {
    data = await res.json();
  } catch {
    throw new PlacesError(res.status);
  }
  return (data.places ?? []).flatMap((place) => {
    const candidate = toCandidate(place);
    return candidate ? [candidate] : [];
  });
}

export function toCandidate(place: GooglePlace): Candidate | null {
  const name = place.displayName?.text?.trim();
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!place.id || !name || typeof lat !== "number" || typeof lng !== "number") return null;

  const components = place.addressComponents ?? [];
  const country = findComponent(components, "country");
  const types = place.types ?? [];
  return {
    google_place_id: place.id,
    name,
    google_primary_type: place.primaryType ?? null,
    types,
    category: categoryFromGoogle(place.primaryType, types),
    address: place.formattedAddress ?? null,
    city: cityOf(components, country?.shortText),
    country: country?.longText ?? null,
    country_code: country?.shortText?.toUpperCase() ?? null,
    lat,
    lng,
  };
}

// Google gives Tokyo's wards (Shibuya, Minato…) as the locality, which would split Tokyo into many cities.
const TOKYO = ["Tokyo", "東京都"];

// locality → postal_town → administrative_area_level_2 → administrative_area_level_1,
// except anywhere in Tokyo (JP, administrative_area_level_1 Tokyo) is "Tokyo".
function cityOf(components: AddressComponent[], countryCode: string | undefined) {
  const region = findComponent(components, "administrative_area_level_1")?.longText;
  if (countryCode?.toUpperCase() === "JP" && region && TOKYO.includes(region)) return "Tokyo";
  for (const type of ["locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1"]) {
    const text = findComponent(components, type)?.longText;
    if (text) return text;
  }
  return null;
}

function findComponent(components: AddressComponent[], type: string) {
  return components.find((c) => c.types?.includes(type));
}

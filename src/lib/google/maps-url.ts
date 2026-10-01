// "Open in Google Maps" (SPEC §12.2): Google's Maps URLs format, free and with no API call. A
// Google place goes by name plus its place ID; a manual place (no ID) by its coordinates.
export function googleMapsUrl(place: { name: string; google_place_id: string | null; lat: number; lng: number }) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  if (place.google_place_id) {
    url.searchParams.set("query", place.name);
    url.searchParams.set("query_place_id", place.google_place_id);
  } else {
    url.searchParams.set("query", `${place.lat},${place.lng}`);
  }
  return url.href;
}

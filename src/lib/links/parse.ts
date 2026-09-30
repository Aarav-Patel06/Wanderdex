import { mapsProvider } from "@/lib/links/validate";

export type LatLng = { lat: number; lng: number };

// At least one of the two is set.
export type ParsedLink = { name: string | null; location: LatLng | null };

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const AT_COORDS = new RegExp(String.raw`/@${NUM},${NUM}(?:[,/]|$)`);
const DATA_COORDS = new RegExp(String.raw`!3d${NUM}!4d${NUM}`);
const TEXT_COORDS = new RegExp(String.raw`^${NUM}\s*,\s*${NUM}$`);

// Parses an expanded Maps URL (SPEC §11.1 step 3). Google doesn't document its URL
// format, so this returns null for anything it doesn't recognize.
export function parseMapsLink(url: URL): ParsedLink | null {
  const provider = mapsProvider(url);
  if (provider === "google") return parseGoogle(url);
  if (provider === "apple") return parseApple(url);
  return null;
}

// /maps/place/<name>/@<lat>,<lng>,<zoom>z/data=...!3d<lat>!4d<lng>...
// /maps/search/<query>/@<lat>,<lng>...
// ?q=<text or lat,lng> or ?query=...
function parseGoogle(url: URL): ParsedLink | null {
  const segments = url.pathname.split("/");
  const maps = segments.indexOf("maps");
  const kind = segments[maps + 1];
  const segment = segments[maps + 2];

  const placeOrSearch = maps !== -1 && (kind === "place" || kind === "search");

  let text: string | null = null;
  if (placeOrSearch && segment && !segment.startsWith("@")) text = decodePathSegment(segment);
  text ||= param(url, "q") ?? param(url, "query");

  // !3d/!4d is the place itself. @ is only the map's center, so it counts only as a
  // rough location for a place or search (a bare /maps/@... view isn't a place).
  const rough = placeOrSearch ? match(url.pathname, AT_COORDS) : null;
  return combine(text, match(url.pathname, DATA_COORDS), rough);
}

// ?q=<name>&ll=<lat>,<lng>, ?address=..., newer ?name=...&coordinate=<lat>,<lng>
function parseApple(url: URL): ParsedLink | null {
  const text = param(url, "name") ?? param(url, "q") ?? param(url, "address");
  const location = coordsFromText(param(url, "coordinate")) ?? coordsFromText(param(url, "ll"));
  return combine(text, location, null);
}

// Text that is itself a coordinate ("48.85,2.29", or a dropped pin's 48°51'29.6"N...)
// is a location, not a name to search for.
function combine(text: string | null, exact: LatLng | null, rough: LatLng | null): ParsedLink | null {
  const textCoords = coordsFromText(text);
  const name = textCoords || text?.includes("°") ? null : text;
  const location = exact ?? textCoords ?? rough;
  return name || location ? { name, location } : null;
}

function param(url: URL, key: string) {
  return url.searchParams.get(key)?.trim() || null;
}

// "+" is a space in Google's paths; a real "+" arrives as %2B.
function decodePathSegment(segment: string) {
  const spaced = segment.replace(/\+/g, " ");
  let decoded: string;
  try {
    decoded = decodeURIComponent(spaced);
  } catch {
    decoded = spaced;
  }
  return decoded.replace(/\s+/g, " ").trim() || null;
}

function coordsFromText(text: string | null) {
  return text ? match(text, TEXT_COORDS) : null;
}

function match(text: string, pattern: RegExp): LatLng | null {
  const m = text.match(pattern);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

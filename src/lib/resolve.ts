import { z } from "zod";

import { type ParsedText, parseText } from "@/lib/ai/parse";
import { timezoneAt, todayIn } from "@/lib/dates";
import { type CallGate, type Candidate, nearbySearchWithRetry, PlacesError, textSearch } from "@/lib/google/places";
import { isApplePlacePage, readApplePlace } from "@/lib/links/apple";
import { ExpandError, expandLink } from "@/lib/links/expand";
import { type LatLng, parseMapsLink } from "@/lib/links/parse";
import { readMapsLink } from "@/lib/links/validate";
import { type SignedPlace, signingSecret, signPlace } from "@/lib/place-signature";
import { RateLimitError } from "@/lib/rate-limit";

// The lookup pipeline behind /api/resolve/link, /api/resolve/text, and /api/resolve/nearby
// (SPEC §11.1, §11.3, §11.2). Every Google call goes through `gate`, the monthly cap (SPEC §17).

// Stable error codes; the UI maps each one to its §11.7 copy.
export const ERROR_STATUS = {
  unauthorized: 401,
  invalid_input: 400,
  not_maps_link: 400,
  link_unparseable: 422,
  no_results: 404,
  rate_limited: 429,
  upstream_error: 502,
  // /api/visits: the place's signature is missing, wrong, or expired.
  place_unverified: 403,
  // /api/visits and /api/places: no such place or visit, or not this user's (RLS).
  not_found: 404,
} as const;

export type ResolveErrorCode = keyof typeof ERROR_STATUS;

// parsedName: the name read from a link, if any, so the UI can carry it into Type Location.
export class ResolveError extends Error {
  constructor(
    readonly code: ResolveErrorCode,
    readonly parsedName: string | null = null,
  ) {
    super(`Resolve failed: ${code}`);
  }
}

export type Visited = ParsedText["visited"];

// Each candidate carries its IANA zone, so the confirmation card can show and pre-fill the
// place's local time (SPEC §8) without the tz lookup table in the browser. It's signed, so
// /api/visits can trust it (lib/place-signature).
export type ResolvedCandidate = SignedPlace;

export type ResolveResult = {
  candidates: ResolvedCandidate[];
  visited: Visited;
  source_input: string;
};

export type LinkResult = ResolveResult & { name: string | null };

// POST /api/resolve/nearby (Upload Photo, SPEC §11.2 step 4): a photo's GPS coordinates and
// nothing else. Strict, so nothing else from the photo can ride along.
export const nearbyBodySchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// No date and no source input: the photo's date is read in the browser and goes only on the
// saved visit, and a photo visit has no source input (SPEC §8).
export type NearbyResult = { candidates: ResolvedCandidate[] };

export async function resolveLink(input: string, gate: CallGate): Promise<LinkResult> {
  // Before any upstream call: without the secret there are no signed results to return.
  const secret = signingSecret();
  const url = readMapsLink(input);
  if (!url) throw new ResolveError("not_maps_link");

  let final: URL;
  try {
    final = await expandLink(url);
  } catch (error) {
    const network = error instanceof ExpandError && error.reason === "network";
    throw new ResolveError(network ? "upstream_error" : "link_unparseable");
  }

  let parsed = parseMapsLink(final);
  if (!parsed && isApplePlacePage(final)) {
    try {
      parsed = await readApplePlace(final);
    } catch {
      throw new ResolveError("upstream_error");
    }
  }
  if (!parsed) throw new ResolveError("link_unparseable");
  const { name, location } = parsed;

  // A name searches by text (biased toward the coordinates); coordinates alone search nearby.
  const candidates = await findPlaces(
    () => (name ? textSearch(gate, name, location) : nearbySearchWithRetry(gate, location!)),
    name,
    secret,
  );
  return { candidates, visited: null, source_input: url.href, name };
}

export async function resolveText(
  text: string,
  timeZone: string,
  gate: CallGate,
  now = new Date(),
): Promise<ResolveResult> {
  const secret = signingSecret();
  const parsed = await parseText({ text, today: todayIn(timeZone, now), timeZone });

  // Without the AI, search the raw text and let the date default to now (§11.3 step 4).
  const query = parsed ? [parsed.query, parsed.location_hint].filter(Boolean).join(" ") : text;
  const candidates = await findPlaces(() => textSearch(gate, query), null, secret);
  return { candidates, visited: parsed?.visited ?? null, source_input: text };
}

// Nearby Search at 50 m, then once more at 150 m, nearest first, up to 3 (SPEC §11.2 step 4).
export async function resolveNearby(point: LatLng, gate: CallGate): Promise<NearbyResult> {
  const secret = signingSecret();
  return { candidates: await findPlaces(() => nearbySearchWithRetry(gate, point), null, secret) };
}

async function findPlaces(search: () => Promise<Candidate[]>, name: string | null, secret: string) {
  let candidates: Candidate[];
  try {
    candidates = await search();
  } catch (error) {
    if (error instanceof RateLimitError) throw new ResolveError("rate_limited", name);
    if (!(error instanceof PlacesError)) throw error;
    throw new ResolveError(error.status === 429 ? "rate_limited" : "upstream_error", name);
  }
  if (!candidates.length) throw new ResolveError("no_results", name);
  return candidates.map((candidate) =>
    signPlace({ ...candidate, timezone: timezoneAt(candidate.lat, candidate.lng) }, secret),
  );
}

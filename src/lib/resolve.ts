import { type ParsedText, parseText } from "@/lib/ai/parse";
import { todayIn } from "@/lib/dates";
import { type Candidate, nearbySearchWithRetry, PlacesError, textSearch } from "@/lib/google/places";
import { isApplePlacePage, readApplePlace } from "@/lib/links/apple";
import { ExpandError, expandLink } from "@/lib/links/expand";
import { parseMapsLink } from "@/lib/links/parse";
import { readMapsLink } from "@/lib/links/validate";

// The lookup pipeline behind /api/resolve/link and /api/resolve/text (SPEC §11.1, §11.3).

// Stable error codes; the UI maps each one to its §11.7 copy.
export const ERROR_STATUS = {
  unauthorized: 401,
  invalid_input: 400,
  not_maps_link: 400,
  link_unparseable: 422,
  no_results: 404,
  rate_limited: 429,
  upstream_error: 502,
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

export type ResolveResult = {
  candidates: Candidate[];
  visited: Visited;
  source_input: string;
};

export type LinkResult = ResolveResult & { name: string | null };

export async function resolveLink(input: string): Promise<LinkResult> {
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
    () => (name ? textSearch(name, location) : nearbySearchWithRetry(location!)),
    name,
  );
  return { candidates, visited: null, source_input: url.href, name };
}

export async function resolveText(text: string, timeZone: string, now = new Date()): Promise<ResolveResult> {
  const parsed = await parseText({ text, today: todayIn(timeZone, now), timeZone });

  // Without the AI, search the raw text and let the date default to now (§11.3 step 4).
  const query = parsed ? [parsed.query, parsed.location_hint].filter(Boolean).join(" ") : text;
  const candidates = await findPlaces(() => textSearch(query), null);
  return { candidates, visited: parsed?.visited ?? null, source_input: text };
}

async function findPlaces(search: () => Promise<Candidate[]>, name: string | null) {
  let candidates: Candidate[];
  try {
    candidates = await search();
  } catch (error) {
    if (!(error instanceof PlacesError)) throw error;
    throw new ResolveError(error.status === 429 ? "rate_limited" : "upstream_error", name);
  }
  if (!candidates.length) throw new ResolveError("no_results", name);
  return candidates;
}

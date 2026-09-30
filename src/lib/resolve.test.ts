import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPLE_PLACE_PAGES, APPLE_SHORT_LINKS, CREPE_STATION, GOOGLE_SHORT_LINKS } from "@/lib/links/fixtures";
import { verifyPlace } from "@/lib/place-signature";
import { ResolveError, resolveLink, resolveText } from "@/lib/resolve";

const PLACE = {
  id: "ChIJ-joes",
  displayName: { text: "Joe's on Newbury" },
  primaryType: "american_restaurant",
  types: ["american_restaurant", "restaurant", "food"],
  location: { latitude: 42.350511, longitude: -71.07966 },
  formattedAddress: "279 Newbury St, Boston, MA 02116, USA",
  addressComponents: [
    { longText: "Boston", shortText: "Boston", types: ["locality"] },
    { longText: "United States", shortText: "US", types: ["country"] },
  ],
};

type Route = (url: string, body: Record<string, unknown> | null) => Response | Promise<Response>;

// Fake fetch that answers by URL. Unmatched URLs fail the test.
function mockFetch(routes: Record<string, Route | Route[]>) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = input.toString();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!key) throw new Error(`Unexpected fetch: ${url}`);
    const route = routes[key];
    const handler = Array.isArray(route) ? route.shift()! : route;
    return handler(url, body);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const places =
  (...list: object[]) =>
  () =>
    Response.json({ places: list });

const TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";
const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
const GEMINI = "https://generativelanguage.googleapis.com/";

function bodiesFor(fetchMock: ReturnType<typeof mockFetch>, prefix: string) {
  return fetchMock.mock.calls
    .filter(([input]) => input.toString().startsWith(prefix))
    .map(([, init]) => JSON.parse(init?.body as string));
}

async function resolveError(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ResolveError);
  const { code, parsedName } = error as ResolveError;
  return { code, parsedName };
}

const SECRET = "test-secret";

beforeEach(() => {
  vi.stubEnv("RESOLVE_SIGNING_SECRET", SECRET);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveLink", () => {
  const SHORT = "https://maps.app.goo.gl/T1mQoo55x2b14Ztr9";

  it("expands, parses, and searches by name biased to !3d/!4d", async () => {
    const fetchMock = mockFetch({
      [SHORT]: () => new Response(null, { status: 302, headers: { location: GOOGLE_SHORT_LINKS[SHORT] } }),
      [TEXT_SEARCH]: places(PLACE),
    });

    const result = await resolveLink(`Joe’s on Newbury\n${SHORT}`);
    expect(result).toMatchObject({
      name: "Joe’s on Newbury",
      visited: null,
      source_input: SHORT,
      candidates: [
        { google_place_id: "ChIJ-joes", category: "food", city: "Boston", country_code: "US", timezone: "America/New_York" },
      ],
    });
    expect(bodiesFor(fetchMock, TEXT_SEARCH)[0]).toMatchObject({
      textQuery: "Joe’s on Newbury",
      locationBias: { circle: { center: { latitude: 42.350511, longitude: -71.07966 }, radius: 500 } },
    });
    expect(verifyPlace(result.candidates[0], SECRET)).toMatchObject({ google_place_id: "ChIJ-joes" });
  });

  it("fails closed without the signing secret, before any fetch", async () => {
    vi.stubEnv("RESOLVE_SIGNING_SECRET", "");
    const fetchMock = mockFetch({});
    await expect(resolveLink(CREPE_STATION)).rejects.toThrow("RESOLVE_SIGNING_SECRET is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses a long link without fetching it", async () => {
    const fetchMock = mockFetch({ [TEXT_SEARCH]: places(PLACE) });
    const result = await resolveLink(CREPE_STATION);
    expect(result.name).toBe("Crêpe Station");
    expect(result.source_input).toBe(new URL(CREPE_STATION).href);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodiesFor(fetchMock, TEXT_SEARCH)[0].locationBias.circle.center).toEqual({
      latitude: 48.8694204,
      longitude: 2.2890529,
    });
  });

  it("uses Nearby Search at 50 m, then 150 m, for coordinates only", async () => {
    const fetchMock = mockFetch({ [NEARBY]: [places(), places(PLACE)] });
    const result = await resolveLink("https://maps.google.com/?q=42.350511,-71.07966");
    expect(result.name).toBeNull();
    expect(result.candidates).toHaveLength(1);
    expect(bodiesFor(fetchMock, NEARBY).map((b) => b.locationRestriction.circle.radius)).toEqual([50, 150]);
  });

  it("rejects a non-Maps link without fetching", async () => {
    const fetchMock = mockFetch({});
    expect(await resolveError(resolveLink("https://example.com/place"))).toEqual({
      code: "not_maps_link",
      parsedName: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("Apple place-id links", () => {
    const [short, final] = Object.entries(APPLE_SHORT_LINKS)[1];
    const expand = () => new Response(null, { status: 301, headers: { location: final } });

    it("reads the place page, then searches by name biased to its coordinates", async () => {
      const fetchMock = mockFetch({
        [short]: expand,
        [final]: () => new Response(APPLE_PLACE_PAGES[final]),
        [TEXT_SEARCH]: places(PLACE),
      });
      const result = await resolveLink(short);
      expect(result).toMatchObject({ name: "Sushi By M", source_input: short, visited: null });
      expect(bodiesFor(fetchMock, TEXT_SEARCH)[0]).toEqual({
        textQuery: "Sushi By M",
        pageSize: 3,
        languageCode: "en",
        locationBias: { circle: { center: { latitude: 40.7266083, longitude: -73.9888537 }, radius: 500 } },
      });
      expect(fetchMock.mock.calls.map(([input]) => input.toString())).toEqual([short, final, TEXT_SEARCH]);
    });

    it("can't read a page without the tags", async () => {
      mockFetch({ [short]: expand, [final]: () => new Response("<html><title>Apple Maps</title></html>") });
      expect(await resolveError(resolveLink(short))).toEqual({ code: "link_unparseable", parsedName: null });
    });

    it("reports a page fetch failure as upstream_error", async () => {
      mockFetch({ [short]: expand, [final]: () => Promise.reject(new DOMException("t", "TimeoutError")) });
      expect((await resolveError(resolveLink(short))).code).toBe("upstream_error");
    });
  });

  it("can't read a link that redirects off the allowlist", async () => {
    mockFetch({ [SHORT]: () => new Response(null, { status: 302, headers: { location: "https://example.com/" } }) });
    expect((await resolveError(resolveLink(SHORT))).code).toBe("link_unparseable");
  });

  it("reports a network failure while expanding as upstream_error", async () => {
    mockFetch({
      [SHORT]: () => {
        throw new TypeError("fetch failed");
      },
    });
    expect((await resolveError(resolveLink(SHORT))).code).toBe("upstream_error");
  });

  it("returns no_results with the parsed name", async () => {
    mockFetch({ [TEXT_SEARCH]: places() });
    expect(await resolveError(resolveLink(CREPE_STATION))).toEqual({
      code: "no_results",
      parsedName: "Crêpe Station",
    });
  });

  it.each([
    [429, "rate_limited"],
    [500, "upstream_error"],
    [403, "upstream_error"],
  ])("maps a Places %i to %s, keeping the name", async (status, code) => {
    mockFetch({ [TEXT_SEARCH]: () => new Response("{}", { status }) });
    expect(await resolveError(resolveLink(CREPE_STATION))).toEqual({ code, parsedName: "Crêpe Station" });
  });
});

describe("resolveText", () => {
  const NOW = new Date("2026-09-30T02:00:00Z"); // still Sep 29 in New York

  function geminiReply(output: object) {
    return () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] });
  }

  it("searches the parsed query plus location hint and returns the parsed date", async () => {
    const fetchMock = mockFetch({
      [GEMINI]: geminiReply({ query: "Ichiran", location_hint: "Shibuya", visited: { value: "2026-03", precision: "month" } }),
      [TEXT_SEARCH]: places(PLACE),
    });

    const text = "ramen at ichiran in shibuya last march";
    const result = await resolveText(text, "America/New_York", NOW);
    expect(result).toMatchObject({
      visited: { value: "2026-03", precision: "month" },
      source_input: text,
      candidates: [{ google_place_id: "ChIJ-joes" }],
    });
    expect(bodiesFor(fetchMock, TEXT_SEARCH)[0]).toEqual({ textQuery: "Ichiran Shibuya", pageSize: 3, languageCode: "en" });
    expect(bodiesFor(fetchMock, GEMINI)[0].contents[0].parts[0].text).toContain("Today's date: 2026-09-29");
    expect(verifyPlace(result.candidates[0], SECRET)).not.toBeNull();
  });

  it("fails closed without the signing secret, before any fetch", async () => {
    vi.stubEnv("RESOLVE_SIGNING_SECRET", "");
    const fetchMock = mockFetch({});
    await expect(resolveText("the louvre", "Europe/Paris", NOW)).rejects.toThrow("RESOLVE_SIGNING_SECRET is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches the query alone when there's no hint", async () => {
    const fetchMock = mockFetch({
      [GEMINI]: geminiReply({ query: "the louvre", location_hint: null, visited: { value: null, precision: null } }),
      [TEXT_SEARCH]: places(PLACE),
    });
    expect((await resolveText("the louvre", "Europe/Paris", NOW)).visited).toBeNull();
    expect(bodiesFor(fetchMock, TEXT_SEARCH)[0].textQuery).toBe("the louvre");
  });

  it.each([
    ["a 429", () => new Response("{}", { status: 429 })],
    ["a timeout", () => Promise.reject(new DOMException("t", "TimeoutError"))],
  ])("falls back to the raw text on %s", async (_, gemini) => {
    const fetchMock = mockFetch({ [GEMINI]: gemini, [TEXT_SEARCH]: places(PLACE) });
    const result = await resolveText("ramen at ichiran", "America/New_York", NOW);
    expect(result.visited).toBeNull();
    expect(bodiesFor(fetchMock, TEXT_SEARCH)[0].textQuery).toBe("ramen at ichiran");
  });

  it("returns no_results", async () => {
    mockFetch({ [GEMINI]: () => new Response("{}", { status: 500 }), [TEXT_SEARCH]: places() });
    expect(await resolveError(resolveText("zzzz", "UTC", NOW))).toEqual({ code: "no_results", parsedName: null });
  });
});

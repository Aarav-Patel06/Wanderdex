import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FIELD_MASK,
  nearbySearch,
  nearbySearchWithRetry,
  PlacesError,
  textSearch,
  toCandidate,
} from "@/lib/google/places";

// Shaped like a real Places API (New) response with the §12.1 field mask.
const CREPE_STATION = {
  id: "ChIJR1L1HsVv5kcRGFJMXEYNkdQ",
  displayName: { text: "Crêpe Station", languageCode: "fr" },
  primaryType: "creperie",
  types: ["creperie", "french_restaurant", "restaurant", "food", "point_of_interest", "establishment"],
  location: { latitude: 48.8694204, longitude: 2.2890529 },
  formattedAddress: "14 Rue de Presbourg, 75116 Paris, France",
  addressComponents: [
    { longText: "14", shortText: "14", types: ["street_number"] },
    { longText: "Rue de Presbourg", shortText: "Rue de Presbourg", types: ["route"] },
    { longText: "Paris", shortText: "Paris", types: ["locality", "political"] },
    { longText: "Département de Paris", shortText: "Département de Paris", types: ["administrative_area_level_2", "political"] },
    { longText: "Île-de-France", shortText: "IDF", types: ["administrative_area_level_1", "political"] },
    { longText: "France", shortText: "fr", types: ["country", "political"] },
    { longText: "75116", shortText: "75116", types: ["postal_code"] },
  ],
};

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  responses.forEach((res) => fetchMock.mockResolvedValueOnce(res));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const places = (...list: object[]) => Response.json({ places: list });

function sent(fetchMock: ReturnType<typeof mockFetch>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, headers: init?.headers as Record<string, string>, body: JSON.parse(init?.body as string) };
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("textSearch", () => {
  it("sends the §12.1 request with the exact field mask", async () => {
    const fetchMock = mockFetch(places(CREPE_STATION));
    await textSearch("Crêpe Station", { lat: 48.8694204, lng: 2.2890529 });

    const { url, headers, body } = sent(fetchMock);
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toBe(
      "places.id,places.displayName,places.primaryType,places.types,places.location,places.formattedAddress,places.addressComponents",
    );
    expect(headers["X-Goog-FieldMask"]).toBe(FIELD_MASK);
    expect(body).toEqual({
      textQuery: "Crêpe Station",
      pageSize: 3,
      locationBias: { circle: { center: { latitude: 48.8694204, longitude: 2.2890529 }, radius: 500 } },
    });
  });

  it("leaves out the bias without coordinates", async () => {
    const fetchMock = mockFetch(places());
    await textSearch("ramen in shibuya");
    expect(sent(fetchMock).body).toEqual({ textQuery: "ramen in shibuya", pageSize: 3 });
  });

  it("normalizes results into candidates", async () => {
    mockFetch(places(CREPE_STATION));
    expect(await textSearch("Crêpe Station")).toEqual([
      {
        google_place_id: "ChIJR1L1HsVv5kcRGFJMXEYNkdQ",
        name: "Crêpe Station",
        google_primary_type: "creperie",
        types: CREPE_STATION.types,
        category: "food",
        address: "14 Rue de Presbourg, 75116 Paris, France",
        city: "Paris",
        country: "France",
        country_code: "FR",
        lat: 48.8694204,
        lng: 2.2890529,
      },
    ]);
  });

  it("returns [] when Google sends no places", async () => {
    mockFetch(Response.json({}));
    expect(await textSearch("zzzz")).toEqual([]);
  });

  it("throws PlacesError with Google's status", async () => {
    mockFetch(Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(textSearch("x")).rejects.toMatchObject({ status: 429 });
  });

  it("throws PlacesError(null) on a network error or timeout", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new DOMException("t", "TimeoutError")));
    const error = await textSearch("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlacesError);
    expect((error as PlacesError).status).toBeNull();
  });
});

describe("nearbySearch", () => {
  it("sends the §12.1 request", async () => {
    const fetchMock = mockFetch(places(CREPE_STATION));
    await nearbySearch({ lat: 1.5, lng: -2.5 }, 50);

    const { url, headers, body } = sent(fetchMock);
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(headers["X-Goog-FieldMask"]).toBe(FIELD_MASK);
    expect(body).toEqual({
      locationRestriction: { circle: { center: { latitude: 1.5, longitude: -2.5 }, radius: 50 } },
      rankPreference: "DISTANCE",
      maxResultCount: 3,
    });
  });
});

describe("nearbySearchWithRetry", () => {
  it("stops at 50 m when it finds something", async () => {
    const fetchMock = mockFetch(places(CREPE_STATION));
    expect(await nearbySearchWithRetry({ lat: 1, lng: 2 })).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once at 150 m", async () => {
    const fetchMock = mockFetch(places(), places(CREPE_STATION));
    expect(await nearbySearchWithRetry({ lat: 1, lng: 2 })).toHaveLength(1);
    expect(sent(fetchMock, 1).body.locationRestriction.circle.radius).toBe(150);
  });

  it("gives up after 150 m", async () => {
    const fetchMock = mockFetch(places(), places());
    expect(await nearbySearchWithRetry({ lat: 1, lng: 2 })).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("toCandidate: city and country", () => {
  const withComponents = (addressComponents: object[]) => toCandidate({ ...CREPE_STATION, addressComponents });
  const component = (type: string, longText: string) => ({ longText, shortText: longText, types: [type, "political"] });

  it("prefers locality", () => {
    expect(withComponents(CREPE_STATION.addressComponents)?.city).toBe("Paris");
  });

  it("falls back to postal_town", () => {
    const c = [component("postal_town", "Bath"), component("administrative_area_level_2", "Somerset")];
    expect(withComponents(c)?.city).toBe("Bath");
  });

  it("falls back to administrative_area_level_2", () => {
    const c = [component("administrative_area_level_1", "California"), component("administrative_area_level_2", "Mariposa County")];
    expect(withComponents(c)?.city).toBe("Mariposa County");
  });

  it("falls back to administrative_area_level_1", () => {
    expect(withComponents([component("administrative_area_level_1", "Madhya Pradesh")])?.city).toBe("Madhya Pradesh");
  });

  it("leaves city and country empty when missing", () => {
    expect(withComponents([])).toMatchObject({ city: null, country: null, country_code: null });
    expect(toCandidate({ ...CREPE_STATION, addressComponents: undefined })).toMatchObject({ city: null });
  });

  it("uppercases the country code", () => {
    expect(withComponents([{ longText: "India", shortText: "in", types: ["country"] }])).toMatchObject({
      country: "India",
      country_code: "IN",
    });
  });

  it("handles missing optional fields", () => {
    expect(
      toCandidate({ id: "x", displayName: { text: "X" }, location: { latitude: 1, longitude: 2 } }),
    ).toMatchObject({ google_primary_type: null, types: [], category: "other", address: null });
  });

  it.each([
    ["no id", { ...CREPE_STATION, id: undefined }],
    ["no name", { ...CREPE_STATION, displayName: { text: " " } }],
    ["no location", { ...CREPE_STATION, location: undefined }],
  ])("skips a place with %s", (_, place) => {
    expect(toCandidate(place)).toBeNull();
  });
});

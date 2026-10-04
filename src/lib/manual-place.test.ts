import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadCountryShapes } from "@/lib/countries";
import type { CallGate } from "@/lib/google/places";
import { countryName, placeArea } from "@/lib/manual-place";
import { RateLimitError } from "@/lib/rate-limit";

// No monthly cap here (lib/rate-limit has its own tests).
const noCap: CallGate = async () => {};

const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";

function mockNearby(...answers: (() => Response | Promise<Response>)[]) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (input.toString() !== NEARBY) throw new Error(`Unexpected fetch: ${input}`);
    return answers.shift()!();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const places = (...list: object[]) => () => Response.json({ places: list });

const place = (addressComponents: object[]) => ({
  id: "ChIJ-x",
  displayName: { text: "Somewhere" },
  types: ["point_of_interest"],
  location: { latitude: 0, longitude: 0 },
  addressComponents,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("placeArea", () => {
  it("uses the nearest result's address", async () => {
    mockNearby(
      places(
        place([
          { longText: "Milan", shortText: "Milan", types: ["locality"] },
          { longText: "Italy", shortText: "IT", types: ["country"] },
        ]),
      ),
    );
    expect(await placeArea({ lat: 45.4642, lng: 9.19 }, noCap)).toEqual({ city: "Milan", country: "Italy", country_code: "IT" });
  });

  it("follows the city rules, Tokyo included", async () => {
    mockNearby(
      places(
        place([
          { longText: "Shibuya", shortText: "Shibuya", types: ["locality"] },
          { longText: "Tokyo", shortText: "Tokyo", types: ["administrative_area_level_1"] },
          { longText: "Japan", shortText: "JP", types: ["country"] },
        ]),
      ),
    );
    expect((await placeArea({ lat: 35.6595, lng: 139.7005 }, noCap)).city).toBe("Tokyo");
  });

  it("retries at 150 m before giving up on Google", async () => {
    const fetchMock = mockNearby(
      places(),
      places(place([{ longText: "Iceland", shortText: "IS", types: ["country"] }])),
    );
    expect(await placeArea({ lat: 64.5, lng: -17.5 }, noCap)).toEqual({ city: null, country: "Iceland", country_code: "IS" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("with no results, takes the country from the shapes and leaves the city empty", async () => {
    mockNearby(places(), places());
    expect(await placeArea({ lat: 64.5, lng: -17.5 }, noCap, loadCountryShapes)).toEqual({
      city: null,
      country: "Iceland",
      country_code: "IS",
    });
  });

  it("has neither out at sea", async () => {
    mockNearby(places(), places());
    expect(await placeArea({ lat: 30, lng: -40 }, noCap, loadCountryShapes)).toEqual({
      city: null,
      country: null,
      country_code: null,
    });
  });

  it("falls back to the shapes when Google fails, without reading them otherwise", async () => {
    mockNearby(() => new Response("{}", { status: 429 }));
    expect(await placeArea({ lat: -29.31, lng: 27.48 }, noCap, loadCountryShapes)).toEqual({
      city: null,
      country: "Lesotho",
      country_code: "LS",
    });

    const shapes = vi.fn(loadCountryShapes);
    mockNearby(places(place([{ longText: "Italy", shortText: "IT", types: ["country"] }])));
    await placeArea({ lat: 45.4642, lng: 9.19 }, noCap, shapes);
    expect(shapes).not.toHaveBeenCalled();
  });

  it("falls back to the shapes at the monthly cap, without calling Google", async () => {
    const fetchMock = mockNearby();
    const capped: CallGate = async () => {
      throw new RateLimitError();
    };
    expect(await placeArea({ lat: 45.4642, lng: 9.19 }, capped, loadCountryShapes)).toEqual({
      city: null,
      country: "Italy",
      country_code: "IT",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("countryName", () => {
  it("names a code in English", () => {
    expect(countryName("JP")).toBe("Japan");
    expect(countryName("US")).toBe("United States");
    expect(countryName("LS")).toBe("Lesotho");
  });
});

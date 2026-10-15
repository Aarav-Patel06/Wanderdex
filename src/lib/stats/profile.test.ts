import { describe, expect, it } from "vitest";

import type { Category } from "@/lib/categories";
import { type StatsVisit, profileStats } from "@/lib/stats/profile";

let next = 0;

// A visit at a place; `at` and `logged` are days into 2025 (visited_at and created_at).
function visit(
  place: string,
  code: string | null,
  {
    at = 1,
    logged = at,
    category = "food",
    rating = null,
    city = `City ${place}`,
  }: { at?: number; logged?: number; category?: Category; rating?: number | null; city?: string | null } = {},
): StatsVisit {
  next += 1;
  return {
    id: `v${next}`,
    place_id: place,
    category,
    visited_at: day(at),
    visited_precision: "date",
    timezone: "UTC",
    created_at: day(logged),
    rating,
    places: { name: `Place ${place}`, city, country: code && `Country ${code}`, country_code: code },
  };
}

function day(n: number) {
  return new Date(Date.UTC(2025, 0, n, 12)).toISOString().replace(".000Z", "+00:00");
}

describe("profileStats", () => {
  it("gives zeros and no first visit without visits", () => {
    expect(profileStats([])).toEqual({
      places: 0,
      cities: 0,
      countries: 0,
      countryFirsts: [],
      continents: [],
      visits: 0,
      first: null,
      topRated: null,
      categories: [],
      revisited: [],
    });
  });

  it("counts distinct places and every visit", () => {
    const stats = profileStats([visit("a", "JP"), visit("a", "JP"), visit("b", "JP")]);
    expect(stats.places).toBe(2);
    expect(stats.visits).toBe(3);
  });

  it("counts territories toward their sovereign, and continents where they lie", () => {
    const stats = profileStats([visit("a", "FR"), visit("b", "GF"), visit("c", "RE"), visit("d", "HK")]);
    expect(stats.countries).toBe(2); // FR, CN
    expect(stats.continents).toEqual(["Africa", "Asia", "Europe", "South America"]);
  });

  it("counts disputed places as themselves", () => {
    const stats = profileStats([visit("a", "TW"), visit("b", "CN"), visit("c", "XK"), visit("d", "RS")]);
    expect(stats.countries).toBe(4);
  });

  it("counts Antarctica's continent but no country, and nothing for a missing code", () => {
    const stats = profileStats([visit("a", "AQ"), visit("b", null)]);
    expect(stats.countries).toBe(0);
    expect(stats.continents).toEqual(["Antarctica"]);
    expect(stats.places).toBe(2);
  });

  it("counts a transcontinental country once, on its geoscheme continent", () => {
    const stats = profileStats([visit("a", "RU"), visit("b", "TR")]);
    expect(stats.countries).toBe(2);
    expect(stats.continents).toEqual(["Asia", "Europe"]);
  });

  it("finds the earliest visit, by visited date then by when it was logged", () => {
    const rows = [visit("a", "JP", { at: 5 }), visit("b", "JP", { at: 2, logged: 9 }), visit("c", "JP", { at: 2, logged: 3 })];
    const { first } = profileStats(rows);
    expect(first?.place.id).toBe("c");
    expect(first?.place.name).toBe("Place c");
    expect(first?.visitedAt).toBe(day(2));
    expect(first?.precision).toBe("date");
    expect(first?.timezone).toBe("UTC");
  });

  it("counts each place once per category, under its most recently logged visit's", () => {
    const stats = profileStats([
      visit("a", "JP", { logged: 1, category: "food" }),
      visit("a", "JP", { logged: 4, category: "cafe" }),
      visit("a", "JP", { logged: 2, category: "bar" }),
      visit("b", "JP", { category: "cafe" }),
      visit("c", "JP", { category: "museum" }),
      visit("d", "JP", { category: "bar" }),
    ]);
    expect(stats.categories).toEqual([
      { category: "cafe", count: 2 },
      // Ties keep the fixed order: Bar before Museum.
      { category: "bar", count: 1 },
      { category: "museum", count: 1 },
    ]);
  });

  it("lists the top 5 places with at least 2 visits, most first, ties by most recent visit", () => {
    const rows = [
      ...[1, 2, 3].map((at) => visit("a", "JP", { at })),
      ...[1, 9].map((at) => visit("b", "JP", { at })),
      ...[1, 5].map((at) => visit("c", "JP", { at })),
      ...[1, 7].map((at) => visit("d", "JP", { at })),
      ...[1, 6].map((at) => visit("e", "JP", { at })),
      ...[1, 2].map((at) => visit("f", "JP", { at })),
      visit("g", "JP"),
    ];
    const { revisited } = profileStats(rows);
    expect(revisited.map(({ place, visits }) => [place.id, visits])).toEqual([
      ["a", 3],
      ["b", 2],
      ["d", 2],
      ["e", 2],
      ["c", 2],
    ]);
  });

  it("lists no revisited places when every place has one visit", () => {
    expect(profileStats([visit("a", "JP"), visit("b", "JP")]).revisited).toEqual([]);
  });

  it("counts distinct cities by name within a country, skipping places without one", () => {
    const rows = [
      visit("a", "JP", { city: "Tokyo" }),
      visit("b", "JP", { city: "Tokyo" }),
      visit("c", "US", { city: "Portland" }),
      visit("d", "AU", { city: "Portland" }),
      visit("e", "FR", { city: null }),
    ];
    expect(profileStats(rows).cities).toBe(3);
  });

  it("finds the highest rated visit's place, ties by the most recent visit", () => {
    const rows = [
      visit("a", "JP", { at: 1, rating: 9 }),
      visit("b", "JP", { at: 2, rating: 10 }),
      visit("c", "JP", { at: 5, rating: 10, category: "cafe" }),
      visit("d", "JP", { at: 9 }),
    ];
    expect(profileStats(rows).topRated).toEqual({
      place: { id: "c", name: "Place c", city: "City c", country: "Country JP", category: "cafe" },
      rating: 10,
    });
    expect(profileStats([visit("a", "JP")]).topRated).toBeNull();
  });

  it("lists each country's first visit in time order, territories under their sovereign", () => {
    const rows = [
      visit("a", "FR", { at: 9 }),
      visit("b", "JP", { at: 4, logged: 6 }),
      visit("c", "JP", { at: 4, logged: 5 }),
      visit("d", "GF", { at: 2 }), // French Guiana counts toward France
      visit("e", "AQ", { at: 1 }), // Antarctica counts toward no country
    ];
    expect(profileStats(rows).countryFirsts).toEqual([
      { code: "FR", visitedAt: day(2), precision: "date", timezone: "UTC" },
      { code: "JP", visitedAt: day(4), precision: "date", timezone: "UTC" },
    ]);
  });
});

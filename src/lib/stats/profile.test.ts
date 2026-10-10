import { describe, expect, it } from "vitest";

import type { Category } from "@/lib/categories";
import { type StatsVisit, profileStats } from "@/lib/stats/profile";

let next = 0;

// A visit at a place; `at` and `logged` are days into 2025 (visited_at and created_at).
function visit(
  place: string,
  code: string | null,
  { at = 1, logged = at, category = "food" }: { at?: number; logged?: number; category?: Category } = {},
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
    places: { name: `Place ${place}`, city: `City ${place}`, country: code && `Country ${code}`, country_code: code },
  };
}

function day(n: number) {
  return new Date(Date.UTC(2025, 0, n, 12)).toISOString().replace(".000Z", "+00:00");
}

describe("profileStats", () => {
  it("gives zeros and no first visit without visits", () => {
    expect(profileStats([])).toEqual({
      places: 0,
      countries: 0,
      continents: 0,
      visits: 0,
      first: null,
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
    expect(stats.continents).toBe(4); // Europe, South America, Africa, Asia
  });

  it("counts disputed places as themselves", () => {
    const stats = profileStats([visit("a", "TW"), visit("b", "CN"), visit("c", "XK"), visit("d", "RS")]);
    expect(stats.countries).toBe(4);
  });

  it("counts Antarctica's continent but no country, and nothing for a missing code", () => {
    const stats = profileStats([visit("a", "AQ"), visit("b", null)]);
    expect(stats.countries).toBe(0);
    expect(stats.continents).toBe(1);
    expect(stats.places).toBe(2);
  });

  it("counts a transcontinental country once, on its geoscheme continent", () => {
    const stats = profileStats([visit("a", "RU"), visit("b", "TR")]);
    expect(stats.countries).toBe(2);
    expect(stats.continents).toBe(2); // Europe, Asia
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
});

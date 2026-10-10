import { describe, expect, it } from "vitest";

import { metres } from "@/lib/trip/group";
import { gridIndex } from "@/lib/trip/grid";

// The grid must find exactly what comparing every pair finds (SPEC §19).

// mulberry32, seeded, so failures repeat.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = { lat: number; lng: number; id: number };

// Points scattered within `spreadM` of a centre, so many pairs sit near the radius.
function cloud(seed: number, count: number, centre: { lat: number; lng: number }, spreadM: number): P[] {
  const rand = random(seed);
  const metresPerDegLat = 111_195;
  return Array.from({ length: count }, (_, id) => {
    const lat = Math.max(-90, Math.min(90, centre.lat + ((rand() * 2 - 1) * spreadM) / metresPerDegLat));
    const cos = Math.max(1e-6, Math.cos((lat * Math.PI) / 180));
    const lng = ((centre.lng + ((rand() * 2 - 1) * spreadM) / (metresPerDegLat * cos) + 540) % 360) - 180;
    return { lat, lng, id };
  });
}

function bruteForce(items: P[], point: { lat: number; lng: number }, within: number) {
  return items
    .map((item) => ({ item, metres: metres(point, item) }))
    .filter(({ metres: m }) => m <= within)
    .sort((a, b) => a.metres - b.metres)
    .map(({ item }) => item.id);
}

function expectSameAsBruteForce(items: P[], queries: P[], cellM: number, within: number) {
  const grid = gridIndex(items, cellM, queries);
  for (const query of queries) {
    const found = grid.near(query, within);
    expect(found.map(({ item }) => item.id)).toEqual(bruteForce(items, query, within));
    for (const { item, metres: m } of found) expect(m).toBeCloseTo(metres(query, item), 6);
  }
}

describe("gridIndex", () => {
  it.each([
    ["Tokyo", { lat: 35.68, lng: 139.77 }],
    ["the equator", { lat: 0, lng: 10 }],
    ["Reykjavik", { lat: 64.15, lng: -21.94 }],
    ["Svalbard", { lat: 78.22, lng: 15.65 }],
    ["near the north pole", { lat: 89.995, lng: 0 }],
    ["near the south pole", { lat: -89.99, lng: 45 }],
    ["across the antimeridian", { lat: -17.7, lng: 180 }],
  ])("finds the same places within 150 m and 50 m as every pair, in %s", (_, centre) => {
    const items = cloud(1, 400, centre, 600);
    const queries = cloud(2, 200, centre, 600);
    expectSameAsBruteForce(items, queries, 150, 150);
    expectSameAsBruteForce(items, queries, 150, 50);
  });

  it("finds pairs across cell edges, just inside the radius, and not just outside", () => {
    // Pairs straddling many row and column edges, 149.9 m and 150.1 m apart, north-south and
    // east-west, at several latitudes.
    for (const lat of [0, 35, 60, 80, 89.9]) {
      const metresPerDegLat = 111_195;
      for (let i = 0; i < 50; i++) {
        const base = { lat: lat + i * 0.000731, lng: 12 + i * 0.000917 };
        const cos = Math.cos((base.lat * Math.PI) / 180);
        const items: P[] = [
          { lat: base.lat + 149.9 / metresPerDegLat, lng: base.lng, id: 1 },
          { lat: base.lat - 150.1 / metresPerDegLat, lng: base.lng, id: 2 },
          { lat: base.lat, lng: base.lng + 149.9 / (metresPerDegLat * cos), id: 3 },
          { lat: base.lat, lng: base.lng - 150.1 / (metresPerDegLat * cos), id: 4 },
        ];
        expectSameAsBruteForce(items, [{ ...base, id: 0 }], 150, 150);
      }
    }
  });

  it("finds points on both sides of the antimeridian", () => {
    const items: P[] = [{ lat: 10, lng: -179.9995, id: 1 }];
    const near = gridIndex(items, 150, [{ lat: 10, lng: 179.9995 }]).near({ lat: 10, lng: 179.9995 });
    expect(near.map(({ item }) => item.id)).toEqual([1]);
    expect(near[0].metres).toBeLessThan(150);
  });

  it("answers nearest first, and nothing when empty", () => {
    const items: P[] = [
      { lat: 35.0009, lng: 139, id: 1 },
      { lat: 35.0001, lng: 139, id: 2 },
      { lat: 35.0004, lng: 139, id: 3 },
    ];
    expect(gridIndex(items, 150).near({ lat: 35, lng: 139 }).map(({ item }) => item.id)).toEqual([2, 3, 1]);
    expect(gridIndex([], 150).near({ lat: 35, lng: 139 })).toEqual([]);
  });

  it("checks only the point's own cell and its 8 neighbours", () => {
    // 2,000 places spread over 20 km: a query sees only a handful of them.
    // Each item counts the reads of its latitude, which a distance check makes.
    let reads = 0;
    const items = cloud(3, 2000, { lat: 48.85, lng: 2.35 }, 10_000).map((item) => ({
      get lat() {
        reads++;
        return item.lat;
      },
      lng: item.lng,
      id: item.id,
    }));
    const grid = gridIndex(items, 150);
    reads = 0;
    grid.near({ lat: 48.85, lng: 2.35 });
    // About 1 place per 9 cells here; every pair would be 2,000 checks.
    expect(reads).toBeLessThan(50);
  });
});

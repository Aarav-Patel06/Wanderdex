import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Candidate } from "@/lib/google/places";
import { cacheCell, cachedNearby, readNearbyCache, writeNearbyCache } from "@/lib/nearby-cache";
import { googleCallGate } from "@/lib/rate-limit";
import { NEARBY_CACHE_EMPTY_TTL_MS, NEARBY_CACHE_TTL_MS } from "@/lib/trip/config";
import { fakeSupabase } from "@/test/fake-supabase";

const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-07T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const candidate = (id: string, lat: number, lng: number): Candidate => ({
  google_place_id: id,
  name: id,
  google_primary_type: "cafe",
  types: ["cafe"],
  category: "cafe",
  address: null,
  city: "Tokyo",
  country: "Japan",
  country_code: "JP",
  lat,
  lng,
});

// Google's answers, one per call, each a list of places at these points.
function mockNearby(...answers: { id: string; lat: number; lng: number }[][]) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (input.toString() !== NEARBY) throw new Error(`Unexpected fetch: ${input}`);
    const places = answers.shift();
    if (!places) throw new Error("Too many Nearby Search calls");
    return Response.json({
      places: places.map(({ id, lat, lng }) => ({ id, displayName: { text: id }, location: { latitude: lat, longitude: lng } })),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cacheCell", () => {
  it("rounds latitude and longitude to the 0.0002° step, as 'lat,lng'", () => {
    expect(cacheCell({ lat: 35.65951, lng: 139.70049 })).toBe("35.6596,139.7004");
    expect(cacheCell({ lat: 35.65959, lng: 139.70041 })).toBe("35.6596,139.7004");
    expect(cacheCell({ lat: 35.65971, lng: 139.70049 })).toBe("35.6598,139.7004");
    expect(cacheCell({ lat: -33.85681, lng: 151.21529 })).toBe("-33.8568,151.2152");
  });

  it("writes no floating-point tails and no negative zero", () => {
    expect(cacheCell({ lat: 0.6, lng: 0.00004 })).toBe("0.6000,0.0000");
    expect(cacheCell({ lat: -0.00004, lng: -0.00004 })).toBe("0.0000,0.0000");
  });

  it("treats 180 and -180 as one meridian", () => {
    expect(cacheCell({ lat: -17.7, lng: 179.99995 })).toBe(cacheCell({ lat: -17.7, lng: -179.99995 }));
    expect(cacheCell({ lat: -17.7, lng: 180 })).toBe("-17.7000,-180.0000");
  });

  it("puts points about 20 m apart in at most neighbouring cells", () => {
    // 0.0002° of latitude is 22 m.
    const [lat] = cacheCell({ lat: 35.6595, lng: 139.7 }).split(",").map(Number);
    const [next] = cacheCell({ lat: 35.6597, lng: 139.7 }).split(",").map(Number);
    expect(Math.round((next - lat) * 1e4)).toBe(2);
  });
});

describe("readNearbyCache / writeNearbyCache", () => {
  const point = { lat: 35.6595, lng: 139.7005 };

  it("misses on an empty cache, then hits what was written", async () => {
    const { client, tables } = fakeSupabase();
    expect(await readNearbyCache(client, point, NOW)).toBeNull();
    await writeNearbyCache(client, point, [candidate("a", 35.6595, 139.7006)], NOW);
    expect(tables.nearby_cache).toEqual([
      expect.objectContaining({ cell: cacheCell(point), fetched_at: NOW.toISOString(), candidates: [expect.objectContaining({ google_place_id: "a" })] }),
    ]);
    expect(await readNearbyCache(client, point, NOW)).toEqual([candidate("a", 35.6595, 139.7006)]);
  });

  it("answers another point in the same cell, re-sorted by distance to that point", async () => {
    const { client } = fakeSupabase();
    // Both points are in the cell 35.6596,139.7004. Ranked for the first: east, then west.
    await writeNearbyCache(client, { lat: 35.65965, lng: 139.70045 }, [candidate("east", 35.6596, 139.7008), candidate("west", 35.6596, 139.7)], NOW);
    const hit = await readNearbyCache(client, { lat: 35.65955, lng: 139.70035 }, NOW);
    expect(hit?.map((c) => c.google_place_id)).toEqual(["west", "east"]);
  });

  it("answers for 30 days, and then not", async () => {
    const { client } = fakeSupabase({
      nearby_cache: [{ cell: cacheCell(point), candidates: [candidate("a", 35.6595, 139.7005)], fetched_at: ago(NEARBY_CACHE_TTL_MS - 1) }],
    });
    expect(await readNearbyCache(client, point, NOW)).toHaveLength(1);
    expect(await readNearbyCache(client, point, new Date(NOW.getTime() + 1))).toBeNull();
    expect(NEARBY_CACHE_TTL_MS).toBe(30 * DAY);
  });

  it("answers an empty result for 7 days only", async () => {
    const { client, tables } = fakeSupabase({
      nearby_cache: [{ cell: cacheCell(point), candidates: [], fetched_at: ago(NEARBY_CACHE_EMPTY_TTL_MS - 1) }],
    });
    expect(await readNearbyCache(client, point, NOW)).toEqual([]);
    tables.nearby_cache[0].fetched_at = ago(NEARBY_CACHE_EMPTY_TTL_MS);
    expect(await readNearbyCache(client, point, NOW)).toBeNull();
    expect(NEARBY_CACHE_EMPTY_TTL_MS).toBe(7 * DAY);
  });

  it("replaces the cell's row, and deletes rows past 30 days on each write", async () => {
    const { client, tables } = fakeSupabase({
      nearby_cache: [
        { cell: cacheCell(point), candidates: [], fetched_at: ago(8 * DAY) },
        { cell: "1.0000,1.0000", candidates: [candidate("old", 1, 1)], fetched_at: ago(31 * DAY) },
        { cell: "2.0000,2.0000", candidates: [], fetched_at: ago(29 * DAY) },
      ],
    });
    await writeNearbyCache(client, point, [candidate("a", 35.6595, 139.7005)], NOW);
    expect(tables.nearby_cache.map((row) => row.cell).sort()).toEqual(["2.0000,2.0000", cacheCell(point)].sort());
    expect(tables.nearby_cache.find((row) => row.cell === cacheCell(point))).toMatchObject({ fetched_at: NOW.toISOString() });
  });

  it("treats a failed read as a miss, and a failed write as nothing", async () => {
    const failing = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error("down") }) }) }),
        upsert: async () => ({ error: new Error("down") }),
        delete: () => ({ lt: async () => ({ error: new Error("down") }) }),
      }),
    };
    expect(await readNearbyCache(failing as never, point, NOW)).toBeNull();
    await expect(writeNearbyCache(failing as never, point, [], NOW)).resolves.toBeUndefined();
  });
});

describe("cachedNearby", () => {
  // In the cell 35.6596,139.7004, as is 35.65955,139.70035 below.
  const point = { lat: 35.65965, lng: 139.70045 };

  it("calls Google on a miss (a retry is two calls) and caches the result; a hit makes no call", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { client, tables } = fakeSupabase();
    const fetchMock = mockNearby([], [{ id: "a", lat: 35.6596, lng: 139.7005 }]);
    const nearby = cachedNearby(client, googleCallGate(client, "user-1"));
    expect((await nearby(point)).map((c) => c.google_place_id)).toEqual(["a"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tables.google_call_log).toHaveLength(2);

    expect((await nearby({ lat: 35.65955, lng: 139.70035 })).map((c) => c.google_place_id)).toEqual(["a"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tables.google_call_log).toHaveLength(2);
  });

  it("caches an empty result too", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { client } = fakeSupabase();
    const fetchMock = mockNearby([], []);
    const nearby = cachedNearby(client, googleCallGate(client, "user-1"));
    expect(await nearby(point)).toEqual([]);
    expect(await nearby(point)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers a hit even at the monthly cap", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { client } = fakeSupabase({
      nearby_cache: [{ cell: cacheCell(point), candidates: [candidate("a", 35.6595, 139.7005)], fetched_at: ago(DAY) }],
      google_call_log: Array.from({ length: 4500 }, () => ({ sku: "nearby_search", created_at: NOW.toISOString() })),
    });
    const fetchMock = mockNearby();
    expect(await cachedNearby(client, googleCallGate(client, "user-1"))(point)).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips Google and caches nothing when allowGoogle says no", async () => {
    const { client, tables } = fakeSupabase();
    const fetchMock = mockNearby();
    expect(await cachedNearby(client, googleCallGate(client, "user-1"), async () => false)(point)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tables.nearby_cache).toEqual([]);
  });
});

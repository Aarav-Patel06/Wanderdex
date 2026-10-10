import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cacheCell } from "@/lib/nearby-cache";
import { verifyPlace } from "@/lib/place-signature";
import { IMPORT_LOOKUPS_PER_DAY, IMPORT_MAX_STOPS } from "@/lib/rate-limits";
import { metres } from "@/lib/trip/group";
import type { ImportResult } from "@/lib/trip/lookup";
import { fakeSupabase, rowsAt } from "@/test/fake-supabase";

import { POST } from "./route";

// The real handler. The session is stubbed (it needs Next's request cookies), and both the
// session client and the admin client are one in-memory database. Google is a fake world of
// places: Nearby Search answers with those within the circle, nearest first, up to 3.
const state = vi.hoisted(() => ({ userId: "user-1" as string | null, db: null as unknown as ReturnType<typeof fakeSupabase> }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  session: async () => ({ supabase: state.db.client, userId: state.userId }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));

const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
const SECRET = "test-secret";
const IMPORT_ID = "0b6f3c1e-8d2a-4f6b-9c3d-2e1f0a9b8c7d";
const DATE = "2025-04-02";

// Points by metres north and east of Shibuya Crossing.
const BASE = { lat: 35.6595, lng: 139.7005 };
const at = (north: number, east: number) => ({
  lat: BASE.lat + north / 111_195,
  lng: BASE.lng + east / (111_195 * Math.cos((BASE.lat * Math.PI) / 180)),
});

type WorldPlace = { id: string; lat: number; lng: number };
const googlePlace = ({ id, lat, lng }: WorldPlace) => ({
  id,
  displayName: { text: `Place ${id}` },
  primaryType: "cafe",
  types: ["cafe"],
  location: { latitude: lat, longitude: lng },
  addressComponents: [
    { longText: "Tokyo", shortText: "Tokyo", types: ["administrative_area_level_1"] },
    { longText: "Japan", shortText: "JP", types: ["country"] },
  ],
});

// Each call: `status` overrides the answer (e.g. 500), by call number from 1.
function mockGoogle(world: WorldPlace[], status: Record<number, number> = {}) {
  let calls = 0;
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    if (input.toString() !== NEARBY) throw new Error(`Unexpected fetch: ${input}`);
    calls++;
    if (status[calls]) return new Response("{}", { status: status[calls] });
    const { center, radius } = JSON.parse(init?.body as string).locationRestriction.circle;
    const point = { lat: center.latitude, lng: center.longitude };
    const places = world
      .filter((place) => metres(point, place) <= radius)
      .sort((a, b) => metres(point, a) - metres(point, b))
      .slice(0, 3)
      .map(googlePlace);
    return Response.json({ places });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// One of the user's places with a visit there, at a precision, on a local date in Tokyo.
function yourPlace(id: string, point: { lat: number; lng: number }, visit: { value: string; precision: "datetime" | "date" | "month" }, googleId: string | null = null) {
  const visitedAt = {
    datetime: `${visit.value}:00+09:00`,
    date: `${visit.value}T12:00:00+09:00`,
    month: `${visit.value}-01T12:00:00+09:00`,
  }[visit.precision];
  state.db.tables.places.push({ id, google_place_id: googleId, name: `Yours ${id}`, city: "Tokyo", country: "Japan", ...point });
  state.db.tables.visits.push({
    id: `visit-${id}-${state.db.tables.visits.length}`,
    user_id: "user-1",
    place_id: id,
    category: "food",
    visited_at: new Date(visitedAt).toISOString(),
    visited_precision: visit.precision,
    timezone: "Asia/Tokyo",
    created_at: new Date().toISOString(),
  });
}

const stop = (point: { lat: number; lng: number }, date = DATE) => ({ ...point, date });

async function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/resolve/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

async function lookup(stops: ReturnType<typeof stop>[], importId = IMPORT_ID): Promise<ImportResult> {
  const res = await post({ import_id: importId, stops });
  expect(res.status).toBe(200);
  return res.json();
}

const sum = ({ local_matches, shared, cache_hits, google_lookups, unmatched_limit }: ImportResult["counts"]) =>
  local_matches + shared + cache_hits + google_lookups + unmatched_limit;

beforeEach(() => {
  state.userId = "user-1";
  state.db = fakeSupabase({ places: [], visits: [], nearby_cache: [] });
  vi.stubEnv("RESOLVE_SIGNING_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/resolve/import: input", () => {
  it("needs a session, and calls nothing without one", async () => {
    state.userId = null;
    const fetchMock = mockGoogle([]);
    const res = await post({ import_id: IMPORT_ID, stops: [stop(BASE)] });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", ""],
    ["no stops", { import_id: IMPORT_ID, stops: [] }],
    ["more than 150 stops", { import_id: IMPORT_ID, stops: Array.from({ length: IMPORT_MAX_STOPS + 1 }, () => stop(BASE)) }],
    ["a bad import id", { import_id: "abc", stops: [stop(BASE)] }],
    ["a bad date", { import_id: IMPORT_ID, stops: [{ ...BASE, date: "2025-02-30" }] }],
    ["a time with the date", { import_id: IMPORT_ID, stops: [{ ...BASE, date: "2025-04-02T10:00" }] }],
    ["anything else on a stop", { import_id: IMPORT_ID, stops: [{ ...BASE, date: DATE, photos: 12 }] }],
    ["anything else on the body", { import_id: IMPORT_ID, stops: [stop(BASE)], thumbnails: [] }],
    ["a latitude past 90", { import_id: IMPORT_ID, stops: [{ lat: 91, lng: 0, date: DATE }] }],
  ])("rejects %s without calling Google", async (_, body) => {
    const fetchMock = mockGoogle([]);
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts 150 stops", async () => {
    mockGoogle([]);
    const stops = Array.from({ length: IMPORT_MAX_STOPS }, (_, i) => stop(at(i * 200, 0)));
    expect((await lookup(stops)).stops).toHaveLength(IMPORT_MAX_STOPS);
  });

  it("fails closed without the signing secret, before calling Google", async () => {
    vi.stubEnv("RESOLVE_SIGNING_SECRET", "");
    const fetchMock = mockGoogle([{ id: "a", ...BASE }]);
    expect((await post({ import_id: IMPORT_ID, stops: [stop(BASE)] })).status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/resolve/import: layers", () => {
  it("answers from the user's own place within 50 m with no lookup, nearest preselected", async () => {
    yourPlace("near", at(30, 0), { value: "2025-03-01", precision: "date" });
    yourPlace("nearer", at(10, 0), { value: "2025-03-01", precision: "date" });
    const fetchMock = mockGoogle([{ id: "g", ...BASE }]);
    const { stops, counts } = await lookup([stop(BASE)]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stops[0]).toMatchObject({ local: true, candidates: [] });
    expect(stops[0].yours.map((place) => place.id)).toEqual(["nearer", "near"]);
    expect(stops[0].yours[0]).toMatchObject({ category: "food", timezone: "Asia/Tokyo", logged: false });
    expect(counts).toMatchObject({ stops: 1, local_matches: 1, google_lookups: 0, google_calls: 0 });
  });

  it("still looks up a stop whose nearest place of the user's is 50–150 m away, and lists it as one of theirs", async () => {
    yourPlace("far", at(120, 0), { value: "2025-03-01", precision: "date" });
    mockGoogle([{ id: "g", ...at(5, 0) }]);
    const { stops, counts } = await lookup([stop(BASE)]);
    expect(stops[0].local).toBe(false);
    expect(stops[0].yours.map((place) => place.id)).toEqual(["far"]);
    expect(stops[0].candidates.map((c) => c.google_place_id)).toEqual(["g"]);
    expect(counts).toMatchObject({ local_matches: 0, google_lookups: 1, google_calls: 1 });
  });

  it("ignores the user's places past 150 m, and shows at most 3", async () => {
    for (const [id, north] of [["a", 20], ["b", 40], ["c", 60], ["d", 80], ["e", 160]] as const) {
      yourPlace(id, at(north, 0), { value: "2025-03-01", precision: "date" });
    }
    mockGoogle([]);
    const { stops } = await lookup([stop(BASE)]);
    expect(stops[0].yours.map((place) => place.id)).toEqual(["a", "b", "c"]);
  });

  it("shares one lookup between stops within 50 m of each other, sorted for each stop", async () => {
    const fetchMock = mockGoogle([{ id: "west", ...at(0, -30) }, { id: "east", ...at(0, 25) }]);
    const { stops, counts } = await lookup([stop(at(0, -20)), stop(at(0, 20)), stop(at(500, 0))]);
    expect(fetchMock).toHaveBeenCalledTimes(3); // the pair's lookup, then the far stop's 50 m and 150 m
    expect(stops[0].candidates.map((c) => c.google_place_id)).toEqual(["west", "east"]);
    expect(stops[1].candidates.map((c) => c.google_place_id)).toEqual(["east", "west"]);
    expect(counts).toMatchObject({ stops: 3, shared: 1, google_lookups: 2, google_calls: 3 });
  });

  it("answers from the shared cache with no Google call, and fills it on a miss", async () => {
    const fetchMock = mockGoogle([{ id: "g", ...at(5, 0) }]);
    const first = await lookup([stop(BASE)]);
    expect(first.counts).toMatchObject({ google_lookups: 1, cache_hits: 0, google_calls: 1 });
    expect(state.db.tables.nearby_cache).toEqual([expect.objectContaining({ cell: cacheCell(BASE) })]);

    const again = await lookup([stop(BASE)], "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again.counts).toMatchObject({ google_lookups: 0, cache_hits: 1, google_calls: 0 });
    expect(again.stops[0].candidates.map((c) => c.google_place_id)).toEqual(["g"]);
    expect(verifyPlace(again.stops[0].candidates[0], SECRET)).not.toBeNull();
  });

  it("counts a 150 m retry as two Google calls and one lookup", async () => {
    mockGoogle([{ id: "g", ...at(100, 0) }]);
    const { counts } = await lookup([stop(BASE)]);
    expect(counts).toMatchObject({ google_lookups: 1, google_calls: 2 });
    expect(state.db.tables.google_call_log).toHaveLength(2);
  });

  it("counts every stop in exactly one layer", async () => {
    yourPlace("mine", at(1000, 0), { value: "2025-03-01", precision: "date" });
    state.db.tables.nearby_cache.push({ cell: cacheCell(at(2000, 0)), candidates: [], fetched_at: new Date().toISOString() });
    mockGoogle([{ id: "g", ...at(3000, 0) }]);
    const stops = [
      stop(at(1000, 10)), // local
      stop(at(2000, 0)), // cache
      stop(at(3000, 0)), // Google
      stop(at(3000, 30)), // shared
      stop(at(4000, 0)), // Google, nothing (a retry)
    ];
    const { counts } = await lookup(stops);
    expect(counts).toEqual({
      stops: 5,
      local_matches: 1,
      shared: 1,
      cache_hits: 1,
      google_lookups: 2,
      google_calls: 3,
      unmatched_limit: 0,
    });
    expect(sum(counts)).toBe(counts.stops);
  });

  it("leaves out the user's own places from Google's candidates (they're in yours)", async () => {
    yourPlace("mine", at(80, 0), { value: "2025-03-01", precision: "date" }, "g-mine");
    mockGoogle([{ id: "g-mine", ...at(80, 0) }, { id: "g-other", ...at(10, 0) }]);
    const { stops } = await lookup([stop(BASE)]);
    expect(stops[0].yours.map((place) => place.id)).toEqual(["mine"]);
    expect(stops[0].candidates.map((c) => c.google_place_id)).toEqual(["g-other"]);
  });

  it("signs the candidates with their time zone", async () => {
    mockGoogle([{ id: "g", ...at(5, 0) }]);
    const { stops } = await lookup([stop(BASE)]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { logged, ...candidate } = stops[0].candidates[0];
    expect(candidate).toMatchObject({ timezone: "Asia/Tokyo", country_code: "JP", city: "Tokyo" });
    expect(verifyPlace(candidate, SECRET)).not.toBeNull();
  });

  it("goes on after one lookup fails at Google", async () => {
    mockGoogle([{ id: "a", ...at(0, 0) }, { id: "b", ...at(1000, 0) }], { 1: 500 });
    const { stops, counts } = await lookup([stop(at(0, 0)), stop(at(1000, 0))]);
    expect(stops[0].candidates).toEqual([]);
    expect(stops[1].candidates.map((c) => c.google_place_id)).toEqual(["b"]);
    expect(counts).toMatchObject({ google_lookups: 2, unmatched_limit: 0 });
  });

  it("stores the counts as one import_log row, with no locations, keeping the first for a repeat", async () => {
    mockGoogle([{ id: "g", ...at(5, 0) }]);
    const { counts } = await lookup([stop(BASE)]);
    await lookup([stop(BASE)]);
    expect(state.db.tables.import_log).toHaveLength(1);
    const row = state.db.tables.import_log[0];
    expect(row).toMatchObject({ import_id: IMPORT_ID, user_id: "user-1", ...counts });
    expect(Object.keys(row).sort()).toEqual(
      ["cache_hits", "created_at", "google_calls", "google_lookups", "id", "import_id", "local_matches", "shared", "stops", "unmatched_limit", "user_id"].sort(),
    );
  });
});

describe("POST /api/resolve/import: the import allowance and the caps", () => {
  const farApart = (n: number) => Array.from({ length: n }, (_, i) => stop(at(i * 1000, 0)));

  it("logs each lookup sent to Google as kind import (not a retry, local match, or cache hit)", async () => {
    yourPlace("mine", at(5000, 0), { value: "2025-03-01", precision: "date" });
    state.db.tables.nearby_cache.push({ cell: cacheCell(at(6000, 0)), candidates: [], fetched_at: new Date().toISOString() });
    mockGoogle([]);
    await lookup([stop(at(0, 0)), stop(at(1000, 0)), stop(at(5000, 0)), stop(at(6000, 0))]);
    expect(state.db.tables.resolve_log).toEqual([
      expect.objectContaining({ user_id: "user-1", kind: "import" }),
      expect.objectContaining({ user_id: "user-1", kind: "import" }),
    ]);
    expect(state.db.tables.google_call_log).toHaveLength(4);
  });

  it("stops sending lookups to Google when the allowance runs out; the rest are unmatched, cache hits still answer", async () => {
    state.db.tables.resolve_log = rowsAt(IMPORT_LOOKUPS_PER_DAY - 2, new Date(), 60, { user_id: "user-1", kind: "import" });
    state.db.tables.nearby_cache.push({
      cell: cacheCell(at(9000, 0)),
      candidates: [{ google_place_id: "cached", name: "Cached", google_primary_type: null, types: [], category: "other", address: null, city: null, country: null, country_code: null, ...at(9000, 0) }],
      fetched_at: new Date().toISOString(),
    });
    const fetchMock = mockGoogle([]);
    const { stops, counts } = await lookup([...farApart(5), stop(at(9000, 0))]);
    expect(counts).toMatchObject({ stops: 6, google_lookups: 2, cache_hits: 1, unmatched_limit: 3 });
    expect(sum(counts)).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(stops[5].candidates.map((c) => c.google_place_id)).toEqual(["cached"]);
    expect(state.db.tables.resolve_log.filter((row) => row.kind === "import")).toHaveLength(IMPORT_LOOKUPS_PER_DAY);
  });

  it("counts the stops sharing an unmatched lookup as unmatched too, and keeps their own places", async () => {
    state.db.tables.resolve_log = rowsAt(IMPORT_LOOKUPS_PER_DAY, new Date(), 60, { user_id: "user-1", kind: "import" });
    yourPlace("mine", at(100, 0), { value: "2025-03-01", precision: "date" });
    const fetchMock = mockGoogle([]);
    const { stops, counts } = await lookup([stop(at(0, 0)), stop(at(0, 30))]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(counts).toMatchObject({ shared: 0, unmatched_limit: 2 });
    expect(stops[0].yours.map((place) => place.id)).toEqual(["mine"]);
  });

  it("only counts the last 24 hours of import rows, and not the other lookup kinds", async () => {
    state.db.tables.resolve_log = [
      ...rowsAt(IMPORT_LOOKUPS_PER_DAY, new Date(), 25 * 60, { user_id: "user-1", kind: "import" }),
      ...rowsAt(300, new Date(), 5, { user_id: "user-1", kind: "nearby" }),
      ...rowsAt(IMPORT_LOOKUPS_PER_DAY, new Date(), 5, { user_id: "someone-else", kind: "import" }),
    ];
    mockGoogle([]);
    const { counts } = await lookup(farApart(3));
    expect(counts).toMatchObject({ google_lookups: 3, unmatched_limit: 0 });
  });

  it("stops at the monthly Nearby Search cap, without calling Google", async () => {
    state.db.tables.google_call_log = rowsAt(4500, new Date(), 0, { sku: "nearby_search", user_id: "someone" });
    const fetchMock = mockGoogle([]);
    const { counts } = await lookup(farApart(3));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(counts).toMatchObject({ google_lookups: 0, google_calls: 0, unmatched_limit: 3 });
  });

  it("stops sending lookups after Google's own 429 (its daily quota)", async () => {
    const fetchMock = mockGoogle([], { 1: 429 });
    const { counts } = await lookup(farApart(8));
    // The lookups already on their way finish; none start after.
    expect(counts.unmatched_limit).toBeGreaterThanOrEqual(8 - 5);
    expect(fetchMock.mock.calls.length).toBeLessThan(8 * 2);
    expect(sum(counts)).toBe(8);
  });
});

describe("POST /api/resolve/import: Already logged", () => {
  it.each([
    ["an exact-time visit that local day", { value: "2025-04-02T23:30", precision: "datetime" as const }, true],
    // 08:30 in Tokyo is the day before in UTC; matched in the visit's own zone.
    ["an exact-time visit early that local day", { value: "2025-04-02T08:30", precision: "datetime" as const }, true],
    ["a date-only visit that day", { value: "2025-04-02", precision: "date" as const }, true],
    ["a month-only visit that month", { value: "2025-04", precision: "month" as const }, true],
    ["a visit the day before", { value: "2025-04-01", precision: "date" as const }, false],
    ["a month-only visit the month before", { value: "2025-03", precision: "month" as const }, false],
  ])("marks a place with %s: %s", async (_, visit, logged) => {
    yourPlace("mine", at(10, 0), visit);
    mockGoogle([]);
    const { stops } = await lookup([stop(BASE)]);
    expect(stops[0].yours[0].logged).toBe(logged);
  });

  it("marks a Google candidate that's one of the user's places, by the stop's own date", async () => {
    // The user's place is 120 m from the first stop, which leads the shared lookup (so it's in that
    // stop's yours), but 165 m from the second, which gets it as a Google candidate instead.
    yourPlace("mine", at(-120, 0), { value: "2025-04-02", precision: "date" }, "g-mine");
    mockGoogle([{ id: "g-mine", ...at(-120, 0) }]);
    const { stops } = await lookup([stop(at(0, 0)), stop(at(45, 0))]);
    expect(stops[0].yours).toEqual([expect.objectContaining({ id: "mine", logged: true })]);
    expect(stops[0].candidates).toEqual([]);
    expect(stops[1].yours).toEqual([]);
    expect(stops[1].candidates).toEqual([expect.objectContaining({ google_place_id: "g-mine", logged: true })]);
  });
});

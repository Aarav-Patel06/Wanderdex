import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signPlace } from "@/lib/place-signature";
import { IMPORT_LOOKUPS_PER_DAY, LOOKUPS_PER_HOUR } from "@/lib/rate-limits";
import { fakeSupabase, rowsAt } from "@/test/fake-supabase";

import { POST } from "./route";

// The real handler. The session is stubbed (it needs Next's request cookies), and both the
// session client and the admin client are one in-memory database.
const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof fakeSupabase> }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  session: async () => ({ supabase: state.db.client, userId: "user-1" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));

const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";

// Google's answers, one per Nearby Search call; anything else fails the test.
function mockNearby(...answers: object[][]) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (input.toString() !== NEARBY) throw new Error(`Unexpected fetch: ${input}`);
    const places = answers.shift();
    if (!places) throw new Error("Too many Nearby Search calls");
    return Response.json({ places });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const MILAN = {
  id: "ChIJ-x",
  displayName: { text: "Somewhere" },
  location: { latitude: 45.4642, longitude: 9.19 },
  addressComponents: [
    { longText: "Milan", shortText: "Milan", types: ["locality"] },
    { longText: "Italy", shortText: "IT", types: ["country"] },
  ],
};

const CHOICES = {
  category: "other",
  visited: { value: "2026-10-04T12:00", precision: "datetime" },
  rating: null,
  note: null,
};

function post(body: object) {
  return POST(
    new Request("http://localhost/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const pin = { manual_place: { name: "Secret garden", lat: 45.4642, lng: 9.19 }, ...CHOICES };

beforeEach(() => {
  // The partial unique index visits_import_stop_idx (SPEC §8).
  state.db = fakeSupabase({}, { unique: { visits: [["user_id", "import_id", "import_stop"]] } });
  vi.stubEnv("RESOLVE_SIGNING_SECRET", "test-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/visits: manual places and the rate limits", () => {
  it("counts a dropped pin as a nearby lookup, and each Nearby call (a retry is two)", async () => {
    mockNearby([], [MILAN]);
    const res = await post(pin);
    expect(res.status).toBe(200);
    expect((await res.json()).place).toMatchObject({ name: "Secret garden", city: "Milan", country_code: "IT" });
    const { resolve_log, google_call_log } = state.db.tables;
    expect(resolve_log).toEqual([expect.objectContaining({ user_id: "user-1", kind: "nearby" })]);
    expect(google_call_log.map((row) => row.sku)).toEqual(["nearby_search", "nearby_search"]);
  });

  it("answers 429 rate_limited over the per-user limit, before Google or any write", async () => {
    state.db.tables.resolve_log = rowsAt(LOOKUPS_PER_HOUR, new Date(), 5, { user_id: "user-1", kind: "text" });
    const fetchMock = mockNearby();
    const res = await post(pin);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.db.tables.places ?? []).toEqual([]);
    expect(state.db.tables.visits ?? []).toEqual([]);
  });

  it("still saves a pin at the monthly Nearby Search cap, skipping Google for the country shapes", async () => {
    state.db.tables.google_call_log = rowsAt(4500, new Date(), 0, { sku: "nearby_search", user_id: "someone" });
    const fetchMock = mockNearby();
    const res = await post(pin);
    expect(res.status).toBe(200);
    expect((await res.json()).place).toMatchObject({ name: "Secret garden", city: null, country: "Italy", country_code: "IT" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.db.tables.google_call_log).toHaveLength(4500);
    // Still a lookup for the per-user limit.
    expect(state.db.tables.resolve_log).toHaveLength(1);
  });

  it("doesn't count a save by place id, which makes no Google call", async () => {
    const placeId = "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b";
    state.db.tables.places = [{ id: placeId, name: "Blue Bottle", city: "Tokyo", country: "Japan", country_code: "JP", lat: 35.6, lng: 139.7 }];
    const fetchMock = mockNearby();
    expect((await post({ place_id: placeId, ...CHOICES })).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.db.tables.resolve_log ?? []).toEqual([]);
  });
});

describe("POST /api/visits: the shared lookup cache", () => {
  it("answers a second pin at the same spot from the cache, with no Google call", async () => {
    const fetchMock = mockNearby([MILAN]);
    expect((await post(pin)).status).toBe(200);
    expect((await post({ ...pin, manual_place: { ...pin.manual_place, name: "Another" } })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.db.tables.google_call_log).toHaveLength(1);
    // Still two lookups for the per-user limit, hit or miss.
    expect(state.db.tables.resolve_log).toHaveLength(2);
  });
});

describe("POST /api/visits: Trip Photos stops", () => {
  const IMPORT_ID = "0b6f3c1e-8d2a-4f6b-9c3d-2e1f0a9b8c7d";
  const trip = (stop: number) => ({ trip: { import_id: IMPORT_ID, stop } });
  const PLACE_ID = "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b";
  const known = () => {
    state.db.tables.places = [{ id: PLACE_ID, name: "Blue Bottle", city: "Tokyo", country: "Japan", country_code: "JP", lat: 35.6, lng: 139.7 }];
  };

  it("saves with source photo, the import id, and the stop number", async () => {
    known();
    const res = await post({ place_id: PLACE_ID, ...CHOICES, ...trip(3) });
    expect(res.status).toBe(200);
    expect(state.db.tables.visits).toEqual([
      expect.objectContaining({ place_id: PLACE_ID, source: "photo", source_input: null, import_id: IMPORT_ID, import_stop: 3 }),
    ]);
  });

  it("answers a repeated save of a stop with the same visit, and saves nothing more", async () => {
    known();
    const first = await (await post({ place_id: PLACE_ID, ...CHOICES, ...trip(1) })).json();
    const again = await (await post({ place_id: PLACE_ID, ...CHOICES, category: "cafe", ...trip(1) })).json();
    expect(again.visit).toEqual(first.visit);
    expect(again.place).toEqual(first.place);
    expect(state.db.tables.visits).toHaveLength(1);
    // Nothing written: the retry's category didn't move the visit.
    expect(state.db.tables.visits[0].category).toBe("other");
  });

  it("makes one visit and one manual place for a retried pin, with no second Google call", async () => {
    const fetchMock = mockNearby([MILAN]);
    const body = { ...pin, ...trip(2) };
    const first = await (await post(body)).json();
    const again = await (await post(body)).json();
    expect(again.visit.id).toBe(first.visit.id);
    expect(state.db.tables.visits).toHaveLength(1);
    expect(state.db.tables.places).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes one visit and one manual place when two saves of a stop race", async () => {
    mockNearby([MILAN]);
    const body = { ...pin, ...trip(4) };
    const [a, b] = await Promise.all([post(body), post(body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const [first, second] = [await a.json(), await b.json()];
    expect(second.visit.id).toBe(first.visit.id);
    expect(state.db.tables.visits).toHaveLength(1);
    expect(state.db.tables.places).toHaveLength(1);
  });

  it("saves different stops of one import, and the same stop number of another import, as separate visits", async () => {
    known();
    await post({ place_id: PLACE_ID, ...CHOICES, ...trip(1) });
    await post({ place_id: PLACE_ID, ...CHOICES, ...trip(2) });
    await post({ place_id: PLACE_ID, ...CHOICES, trip: { import_id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", stop: 1 } });
    expect(state.db.tables.visits).toHaveLength(3);
  });

  it("keeps one category per place: the last stop saved there sets it", async () => {
    known();
    await post({ place_id: PLACE_ID, ...CHOICES, category: "cafe", ...trip(1) });
    await post({ place_id: PLACE_ID, ...CHOICES, category: "food", ...trip(2) });
    expect(state.db.tables.visits.map((visit) => visit.category)).toEqual(["food", "food"]);
  });

  it("saves a signed candidate from the import lookup", async () => {
    const place = signPlace(
      {
        google_place_id: "ChIJ-cafe",
        name: "Cafe",
        google_primary_type: "cafe",
        types: ["cafe"],
        category: "cafe",
        address: null,
        city: "Tokyo",
        country: "Japan",
        country_code: "JP",
        lat: 35.6,
        lng: 139.7,
        timezone: "Asia/Tokyo",
      },
      "test-secret",
    );
    const body = { place, ...CHOICES, source: "photo", source_input: null, ...trip(5) };
    const first = await (await post(body)).json();
    const again = await (await post(body)).json();
    expect(again.visit.id).toBe(first.visit.id);
    expect(state.db.tables.places).toHaveLength(1);
    expect(state.db.tables.visits).toEqual([expect.objectContaining({ source: "photo", import_stop: 5 })]);
  });

  it("counts an imported pin as an import lookup, not against the lookup limits", async () => {
    state.db.tables.resolve_log = rowsAt(LOOKUPS_PER_HOUR, new Date(), 5, { user_id: "user-1", kind: "nearby" });
    mockNearby([MILAN]);
    const res = await post({ ...pin, ...trip(1) });
    expect(res.status).toBe(200);
    expect(state.db.tables.visits).toEqual([expect.objectContaining({ source: "photo" })]);
    expect(state.db.tables.resolve_log.filter((row) => row.kind === "import")).toEqual([
      expect.objectContaining({ user_id: "user-1", kind: "import" }),
    ]);
  });

  it("uses the country shapes for an imported pin once the import allowance is used up", async () => {
    state.db.tables.resolve_log = rowsAt(IMPORT_LOOKUPS_PER_DAY, new Date(), 5, { user_id: "user-1", kind: "import" });
    const fetchMock = mockNearby();
    const res = await post({ ...pin, ...trip(1) });
    expect(res.status).toBe(200);
    expect((await res.json()).place).toMatchObject({ city: null, country: "Italy", country_code: "IT" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.db.tables.resolve_log).toHaveLength(IMPORT_LOOKUPS_PER_DAY);
  });

  it.each([
    ["a stop of 0", { import_id: "0b6f3c1e-8d2a-4f6b-9c3d-2e1f0a9b8c7d", stop: 0 }],
    ["a stop past 150", { import_id: "0b6f3c1e-8d2a-4f6b-9c3d-2e1f0a9b8c7d", stop: 151 }],
    ["a bad import id", { import_id: "abc", stop: 1 }],
  ])("rejects %s", async (_, tripStop) => {
    known();
    expect((await post({ place_id: PLACE_ID, ...CHOICES, trip: tripStop })).status).toBe(400);
  });
});

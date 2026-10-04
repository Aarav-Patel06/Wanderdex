import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOOKUPS_PER_HOUR } from "@/lib/rate-limits";
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
  state.db = fakeSupabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyPlace } from "@/lib/place-signature";
import { LOOKUPS_PER_HOUR } from "@/lib/rate-limits";
import { fakeSupabase, rowsAt } from "@/test/fake-supabase";

import { POST } from "./route";

// The real handler, with the session check stubbed (it needs Next's request cookies) and the
// admin client swapped for an in-memory one holding the rate-limit logs.
const state = vi.hoisted(() => ({ userId: "user-1" as string | null, db: null as unknown as ReturnType<typeof fakeSupabase> }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  session: async () => ({ supabase: null, userId: state.userId }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));

const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
const SECRET = "test-secret";

const PLACE = {
  id: "ChIJ-shibuya",
  displayName: { text: "Shibuya Scramble Crossing" },
  primaryType: "tourist_attraction",
  types: ["tourist_attraction"],
  location: { latitude: 35.6595, longitude: 139.7005 },
  formattedAddress: "2 Chome-2-1 Dogenzaka, Shibuya, Tokyo 150-0043, Japan",
  addressComponents: [
    { longText: "Shibuya", shortText: "Shibuya", types: ["locality"] },
    { longText: "Tokyo", shortText: "Tokyo", types: ["administrative_area_level_1"] },
    { longText: "Japan", shortText: "JP", types: ["country"] },
  ],
};

// Google's answers, one per call; anything else fails the test.
function mockPlaces(...answers: (() => Response)[]) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (input.toString() !== NEARBY) throw new Error(`Unexpected fetch: ${input}`);
    const answer = answers.shift();
    if (!answer) throw new Error("Too many Nearby Search calls");
    return answer();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const places = (...list: object[]) => () => Response.json({ places: list });

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/resolve/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  state.userId = "user-1";
  state.db = fakeSupabase();
  vi.stubEnv("RESOLVE_SIGNING_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/resolve/nearby", () => {
  it("needs a session, and calls nothing without one", async () => {
    state.userId = null;
    const fetchMock = mockPlaces();
    const res = await post({ lat: 35.6595, lng: 139.7005 });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", ""],
    ["not JSON", "lat=1&lng=2"],
    ["an empty object", {}],
    ["a missing lng", { lat: 35.6 }],
    ["strings", { lat: "35.6", lng: "139.7" }],
    ["null", { lat: null, lng: 139.7 }],
    ["a latitude past 90", { lat: 90.0001, lng: 0 }],
    ["a longitude past -180", { lat: 0, lng: -180.0001 }],
    ["anything besides the coordinates", { lat: 35.6, lng: 139.7, image: "data:image/jpeg;base64,/9j/" }],
    ["a date", { lat: 35.6, lng: 139.7, taken: "2025:03:12 15:45:30" }],
    ["an array", [35.6, 139.7]],
  ])("rejects %s without calling Google", async (_, body) => {
    const fetchMock = mockPlaces();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the edges of the range", async () => {
    mockPlaces(places(PLACE), places(PLACE), places(PLACE), places(PLACE));
    for (const body of [{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }, { lat: 0, lng: 0 }, { lat: 0.5, lng: -0.5 }]) {
      expect((await post(body)).status).toBe(200);
    }
  });

  it("searches 50 m by distance, up to 3, and returns signed candidates", async () => {
    const fetchMock = mockPlaces(places(PLACE));
    const res = await post({ lat: 35.6595, lng: 139.7005 });
    expect(res.status).toBe(200);
    const { candidates, ...rest } = await res.json();
    expect(rest).toEqual({});
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      google_place_id: "ChIJ-shibuya",
      category: "landmark",
      city: "Tokyo",
      country_code: "JP",
      timezone: "Asia/Tokyo",
    });
    expect(verifyPlace(candidates[0], SECRET)).not.toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      locationRestriction: { circle: { center: { latitude: 35.6595, longitude: 139.7005 }, radius: 50 } },
      rankPreference: "DISTANCE",
      maxResultCount: 3,
      languageCode: "en",
    });
  });

  it("retries once at 150 m, then answers no_results", async () => {
    const fetchMock = mockPlaces(places(), places());
    const res = await post({ lat: 64.5, lng: -17.5 });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_results" });
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init?.body as string).locationRestriction.circle.radius)).toEqual([
      50, 150,
    ]);
  });

  it("finds a place on the retry", async () => {
    mockPlaces(places(), places(PLACE));
    expect((await (await post({ lat: 35.6595, lng: 139.7005 })).json()).candidates).toHaveLength(1);
  });

  it.each([
    [429, 429, "rate_limited"],
    [500, 502, "upstream_error"],
  ])("maps a Google %i to %i %s", async (google, status, error) => {
    mockPlaces(() => new Response("{}", { status: google }));
    const res = await post({ lat: 35.6595, lng: 139.7005 });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("logs the lookup, and each Google call (a retry is two)", async () => {
    mockPlaces(places(), places(PLACE));
    expect((await post({ lat: 35.6595, lng: 139.7005 })).status).toBe(200);
    expect(state.db.tables.resolve_log).toEqual([expect.objectContaining({ user_id: "user-1", kind: "nearby" })]);
    expect(state.db.tables.google_call_log).toEqual([
      expect.objectContaining({ sku: "nearby_search", user_id: "user-1" }),
      expect.objectContaining({ sku: "nearby_search", user_id: "user-1" }),
    ]);
  });

  it("answers 429 rate_limited over the per-user limit, without calling Google", async () => {
    state.db.tables.resolve_log = rowsAt(LOOKUPS_PER_HOUR, new Date(), 5, { user_id: "user-1", kind: "link" });
    const fetchMock = mockPlaces();
    const res = await post({ lat: 35.6595, lng: 139.7005 });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.db.tables.resolve_log).toHaveLength(LOOKUPS_PER_HOUR);
  });

  it("answers 429 rate_limited at the monthly Nearby Search cap, without calling Google", async () => {
    state.db.tables.google_call_log = rowsAt(4500, new Date(), 0, { sku: "nearby_search", user_id: "someone" });
    const fetchMock = mockPlaces();
    const res = await post({ lat: 35.6595, lng: 139.7005 });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed without the signing secret, before calling Google", async () => {
    vi.stubEnv("RESOLVE_SIGNING_SECRET", "");
    const fetchMock = mockPlaces();
    const res = await post({ lat: 35.6595, lng: 139.7005 });
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

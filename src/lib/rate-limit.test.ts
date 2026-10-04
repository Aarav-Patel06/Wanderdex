import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nearbySearchWithRetry, textSearch } from "@/lib/google/places";
import { placeArea } from "@/lib/manual-place";
import { googleCallGate, limitLookup, monthStartUtc, RateLimitError } from "@/lib/rate-limit";
import { GOOGLE_CALLS_PER_MONTH, LOOKUPS_PER_DAY, LOOKUPS_PER_HOUR } from "@/lib/rate-limits";
import { fakeSupabase, rowsAt } from "@/test/fake-supabase";

const NOW = new Date("2026-10-15T12:00:00Z");
const USER = "user-1";

const TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";
const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";

// Google's answers, one per call, by URL; anything else fails the test.
function mockGoogle(...answers: object[][]) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (![TEXT_SEARCH, NEARBY].includes(input.toString())) throw new Error(`Unexpected fetch: ${input}`);
    const places = answers.shift();
    if (!places) throw new Error("Too many Google calls");
    return Response.json({ places });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const PLACE = {
  id: "ChIJ-x",
  displayName: { text: "Somewhere" },
  location: { latitude: 45.46, longitude: 9.19 },
  addressComponents: [
    { longText: "Milan", shortText: "Milan", types: ["locality"] },
    { longText: "Italy", shortText: "IT", types: ["country"] },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the limits", () => {
  it("are SPEC §17's", () => {
    expect([LOOKUPS_PER_HOUR, LOOKUPS_PER_DAY]).toEqual([60, 300]);
    expect(GOOGLE_CALLS_PER_MONTH).toEqual({ text_search: 4500, nearby_search: 4500 });
  });
});

describe("limitLookup (per user)", () => {
  const lookups = (count: number, minutesAgo: number, userId = USER) =>
    rowsAt(count, NOW, minutesAgo, { user_id: userId, kind: "link" });

  it("logs a lookup with its kind", async () => {
    const { client, tables } = fakeSupabase();
    await limitLookup(client, USER, "nearby");
    expect(tables.resolve_log).toEqual([expect.objectContaining({ user_id: USER, kind: "nearby" })]);
  });

  it("allows the 60th lookup in an hour and refuses the 61st", async () => {
    const { client, tables } = fakeSupabase({ resolve_log: lookups(59, 10) });
    await limitLookup(client, USER, "text");
    await expect(limitLookup(client, USER, "text")).rejects.toBeInstanceOf(RateLimitError);
    // The refused one isn't logged.
    expect(tables.resolve_log).toHaveLength(60);
  });

  it("only counts the last hour for the hourly limit", async () => {
    // 60 a little over an hour ago, and 59 within it.
    const { client } = fakeSupabase({ resolve_log: [...lookups(60, 61), ...lookups(59, 59)] });
    await expect(limitLookup(client, USER, "link")).resolves.toBeUndefined();
  });

  it("allows the 300th lookup in 24 hours and refuses the 301st", async () => {
    // None in the last hour, so only the daily limit applies.
    const { client } = fakeSupabase({ resolve_log: [...lookups(250, 23 * 60), ...lookups(49, 120)] });
    await limitLookup(client, USER, "link");
    await expect(limitLookup(client, USER, "link")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("only counts the last 24 hours for the daily limit", async () => {
    const { client } = fakeSupabase({ resolve_log: [...lookups(300, 24 * 60 + 1), ...lookups(10, 60 * 12)] });
    await expect(limitLookup(client, USER, "link")).resolves.toBeUndefined();
  });

  it("counts each user separately", async () => {
    const { client } = fakeSupabase({ resolve_log: lookups(300, 5, "someone-else") });
    await expect(limitLookup(client, USER, "link")).resolves.toBeUndefined();
  });

  it("throws a database error", async () => {
    const failing = { from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ error: new Error("down") }) }) }) }) };
    await expect(limitLookup(failing as never, USER, "link")).rejects.toThrow("down");
  });
});

describe("monthStartUtc", () => {
  it("is midnight UTC on the 1st", () => {
    expect(monthStartUtc(NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    // Still September in UTC, though it's October in Tokyo.
    expect(monthStartUtc(new Date("2026-09-30T23:30:00Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("googleCallGate (monthly cap per SKU)", () => {
  const calls = (count: number, sku: string, createdAt: Date) =>
    rowsAt(count, createdAt, 0, { sku, user_id: "anyone" });

  it("logs each call with its SKU and user", async () => {
    const { client, tables } = fakeSupabase();
    await googleCallGate(client, USER)("text_search");
    expect(tables.google_call_log).toEqual([expect.objectContaining({ sku: "text_search", user_id: USER })]);
  });

  it("allows the 4,500th call this month and refuses the 4,501st", async () => {
    const { client, tables } = fakeSupabase({ google_call_log: calls(4499, "text_search", NOW) });
    const gate = googleCallGate(client, USER);
    await gate("text_search");
    await expect(gate("text_search")).rejects.toBeInstanceOf(RateLimitError);
    expect(tables.google_call_log).toHaveLength(4500);
  });

  it("counts each SKU separately", async () => {
    const { client } = fakeSupabase({ google_call_log: calls(4500, "text_search", NOW) });
    const gate = googleCallGate(client, USER);
    await expect(gate("text_search")).rejects.toBeInstanceOf(RateLimitError);
    await expect(gate("nearby_search")).resolves.toBeUndefined();
  });

  it("starts again each calendar month (UTC)", async () => {
    const { client } = fakeSupabase({ google_call_log: calls(4500, "nearby_search", new Date("2026-09-30T23:59:59Z")) });
    await expect(googleCallGate(client, USER)("nearby_search")).resolves.toBeUndefined();
  });

  it("stops the Google call when the cap is reached", async () => {
    const { client } = fakeSupabase({ google_call_log: calls(4500, "text_search", NOW) });
    const fetchMock = mockGoogle();
    await expect(textSearch(googleCallGate(client, USER), "ramen")).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts a Nearby retry at 150 m as two calls", async () => {
    const { client, tables } = fakeSupabase();
    mockGoogle([], [PLACE]);
    await nearbySearchWithRetry(googleCallGate(client, USER), { lat: 45.46, lng: 9.19 });
    expect(tables.google_call_log.map((row) => row.sku)).toEqual(["nearby_search", "nearby_search"]);
  });

  it("stops a retry that would go over the cap", async () => {
    const { client } = fakeSupabase({ google_call_log: calls(4499, "nearby_search", NOW) });
    const fetchMock = mockGoogle([], [PLACE]);
    await expect(nearbySearchWithRetry(googleCallGate(client, USER), { lat: 1, lng: 2 })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts a manual place's Nearby calls; at the cap it skips Google and uses the country shapes", async () => {
    const { client, tables } = fakeSupabase();
    const fetchMock = mockGoogle([], [PLACE]);
    expect(await placeArea({ lat: 45.46, lng: 9.19 }, googleCallGate(client, USER))).toMatchObject({ city: "Milan" });
    expect(tables.google_call_log).toHaveLength(2);

    tables.google_call_log.push(...calls(4498, "nearby_search", NOW));
    expect(await placeArea({ lat: 45.46, lng: 9.19 }, googleCallGate(client, USER))).toEqual({
      city: null,
      country: "Italy",
      country_code: "IT",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tables.google_call_log).toHaveLength(4500);
  });
});

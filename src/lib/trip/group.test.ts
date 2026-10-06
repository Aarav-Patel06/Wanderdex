import tzLookup from "@photostructure/tz-lookup";
import { describe, expect, it } from "vitest";

import { IMPORT_MAX_STOPS } from "@/lib/rate-limits";
import { JOIN_GAP_MS, MAX_PHOTOS } from "@/lib/trip/config";
import { centroidOf, metres, planTrip, randomUuid, skippedLine, type TripPlan } from "@/lib/trip/group";
import type { PhotoRead } from "@/lib/trip/read";

// A point `north` and `east` metres from a base point.
const M_PER_DEG = 111_195;
const near = (base: { lat: number; lng: number }, north: number, east = 0) => ({
  lat: base.lat + north / M_PER_DEG,
  lng: base.lng + east / (M_PER_DEG * Math.cos((base.lat * Math.PI) / 180)),
});
const ok = (location: { lat: number; lng: number }, iso: string): PhotoRead => ({
  status: "ok",
  location,
  instant: Date.parse(iso),
});

const SHIBUYA = { lat: 35.6595, lng: 139.7005 };
const ASAKUSA = { lat: 35.7148, lng: 139.7967 };
const TIMES_SQUARE = { lat: 40.758, lng: -73.9855 };

function stopsOf(plan: TripPlan) {
  if (plan.kind !== "stops") throw new Error(`expected stops, got ${plan.kind}`);
  return plan.stops;
}

describe("planTrip: joining photos into stops", () => {
  it("joins photos within 150 m of the stop's centroid, and starts a new stop past it", () => {
    const together = stopsOf(
      planTrip([ok(SHIBUYA, "2025-03-12T01:00:00Z"), ok(near(SHIBUYA, 140), "2025-03-12T01:10:00Z")], tzLookup),
    );
    expect(together).toHaveLength(1);
    expect(together[0].photos).toEqual([0, 1]);

    const apart = stopsOf(
      planTrip([ok(SHIBUYA, "2025-03-12T01:00:00Z"), ok(near(SHIBUYA, 160), "2025-03-12T01:10:00Z")], tzLookup),
    );
    expect(apart.map((stop) => stop.photos)).toEqual([[0], [1]]);
  });

  it("measures from the centroid, which moves as photos join", () => {
    // 0, 100, 190 m: the third is 140 m from the centroid (50 m) and joins; the fourth, at 300 m,
    // is about 203 m from the new centroid (96.7 m) and starts a stop, though it's only 110 m from
    // the photo before it.
    const reads = [0, 100, 190, 300].map((m, i) => ok(near(SHIBUYA, m), `2025-03-12T01:0${i}:00Z`));
    const stops = stopsOf(planTrip(reads, tzLookup));
    expect(stops.map((stop) => stop.photos)).toEqual([[0, 1, 2], [3]]);
    expect(metres(stops[0], near(SHIBUYA, 290 / 3))).toBeLessThan(0.5);
  });

  it("joins photos up to 2 hours after the previous one, and splits after that", () => {
    // Around midnight in Tokyo, so the same-day merge can't put them back together.
    const at = (iso: string) => ok(SHIBUYA, iso);
    // 23:00 and 00:59 JST, 1 h 59 min apart: one stop, dated the first photo's day.
    const joined = stopsOf(planTrip([at("2025-03-12T14:00:00Z"), at("2025-03-12T15:59:00Z")], tzLookup));
    expect(joined).toHaveLength(1);
    expect(joined[0].localDate).toBe("2025-03-12");
    // Exactly 2 hours still joins.
    const exactly = new Date(Date.parse("2025-03-12T14:30:00Z") + JOIN_GAP_MS).toISOString();
    expect(stopsOf(planTrip([at("2025-03-12T14:30:00Z"), at(exactly)], tzLookup))).toHaveLength(1);
    // 23:00 and 01:01 JST, 2 h 1 min apart, on different local days: two stops.
    const split = stopsOf(planTrip([at("2025-03-12T14:00:00Z"), at("2025-03-12T16:01:00Z")], tzLookup));
    expect(split.map((stop) => stop.localDate)).toEqual(["2025-03-12", "2025-03-13"]);
  });

  it("takes the first photo's time, the centroid, and the zone there", () => {
    const [stop] = stopsOf(
      planTrip([ok(near(SHIBUYA, -50), "2025-03-12T01:00:00Z"), ok(near(SHIBUYA, 50), "2025-03-12T01:30:00Z")], tzLookup),
    );
    expect(stop.instant).toBe(Date.parse("2025-03-12T01:00:00Z"));
    expect(metres(stop, SHIBUYA)).toBeLessThan(0.5);
    expect(stop.timezone).toBe("Asia/Tokyo");
    expect(stop.localDate).toBe("2025-03-12");
  });
});

describe("planTrip: merging stops at the same spot on the same day", () => {
  it("merges a spot revisited later the same day, keeping its first photo's time", () => {
    // The hotel at 08:00, Asakusa at 12:00, the hotel again at 20:00 (JST).
    const reads = [
      ok(SHIBUYA, "2025-03-11T23:00:00Z"),
      ok(ASAKUSA, "2025-03-12T03:00:00Z"),
      ok(near(SHIBUYA, 30), "2025-03-12T11:00:00Z"),
    ];
    const stops = stopsOf(planTrip(reads, tzLookup));
    expect(stops.map((stop) => stop.photos)).toEqual([[0, 2], [1]]);
    expect(stops[0].instant).toBe(Date.parse("2025-03-11T23:00:00Z"));
    expect(stops.map((stop) => stop.number)).toEqual([1, 2]);
    // The centroid is recomputed from both visits' photos.
    expect(metres(stops[0], near(SHIBUYA, 15))).toBeLessThan(0.5);
  });

  it("doesn't merge the same spot on different days", () => {
    const reads = [ok(SHIBUYA, "2025-03-12T11:00:00Z"), ok(SHIBUYA, "2025-03-12T23:00:00Z")];
    expect(stopsOf(planTrip(reads, tzLookup)).map((stop) => stop.localDate)).toEqual(["2025-03-12", "2025-03-13"]);
  });

  it("doesn't merge spots more than 150 m apart", () => {
    const reads = [ok(SHIBUYA, "2025-03-12T01:00:00Z"), ok(ASAKUSA, "2025-03-12T02:00:00Z"), ok(near(SHIBUYA, 200), "2025-03-12T05:00:00Z")];
    expect(stopsOf(planTrip(reads, tzLookup))).toHaveLength(3);
  });

  it("uses the local day in the zone at the stop, not the UTC day", () => {
    // Tokyo, UTC+9: Shibuya at 23:30 JST (Mar 12), Asakusa at 00:30, Shibuya again at 02:00 (Mar
    // 13). The two Shibuya stops are on the same UTC day (14:30Z and 17:00Z, Mar 12) but on
    // different days in Tokyo, so they stay apart.
    const tokyo = [ok(SHIBUYA, "2025-03-12T14:30:00Z"), ok(ASAKUSA, "2025-03-12T15:30:00Z"), ok(SHIBUYA, "2025-03-12T17:00:00Z")];
    const tokyoStops = stopsOf(planTrip(tokyo, tzLookup));
    expect(tokyoStops.map((stop) => [stop.photos, stop.localDate])).toEqual([
      [[0], "2025-03-12"],
      [[1], "2025-03-13"],
      [[2], "2025-03-13"],
    ]);

    // New York, UTC−4 (EDT): 19:00 and 23:30 on Mar 11 are on different UTC days (Mar 11 23:00Z,
    // Mar 12 03:30Z) but the same day there, so they merge.
    const newYork = [
      ok(TIMES_SQUARE, "2025-03-11T23:00:00Z"),
      ok(near(TIMES_SQUARE, 2000), "2025-03-12T00:00:00Z"),
      ok(TIMES_SQUARE, "2025-03-12T03:30:00Z"),
    ];
    const newYorkStops = stopsOf(planTrip(newYork, tzLookup));
    expect(newYorkStops.map((stop) => stop.photos)).toEqual([[0, 2], [1]]);
    expect(newYorkStops[0]).toMatchObject({ timezone: "America/New_York", localDate: "2025-03-11" });
  });
});

describe("planTrip: order, skipped photos, and limits", () => {
  it("orders stops and their photos by time, whatever order they were picked in", () => {
    const reads = [
      ok(ASAKUSA, "2025-03-12T05:00:00Z"),
      ok(SHIBUYA, "2025-03-12T01:30:00Z"),
      ok(ASAKUSA, "2025-03-12T04:00:00Z"),
      ok(SHIBUYA, "2025-03-12T01:00:00Z"),
    ];
    const stops = stopsOf(planTrip(reads, tzLookup));
    expect(stops.map((stop) => [stop.number, stop.photos])).toEqual([
      [1, [3, 1]],
      [2, [2, 0]],
    ]);
  });

  it("keeps the pick order for photos taken at the same instant", () => {
    const reads = [ok(SHIBUYA, "2025-03-12T01:00:00Z"), ok(SHIBUYA, "2025-03-12T01:00:00Z"), ok(SHIBUYA, "2025-03-12T01:00:00Z")];
    expect(stopsOf(planTrip(reads, tzLookup))[0].photos).toEqual([0, 1, 2]);
  });

  it("skips photos with GPS but no date, and counts them with the ones without a location", () => {
    const reads: PhotoRead[] = [
      ok(SHIBUYA, "2025-03-12T01:00:00Z"),
      { status: "no_date", location: near(SHIBUYA, 10) },
      { status: "no_location" },
      { status: "unreadable" },
      ok(near(SHIBUYA, 20), "2025-03-12T01:05:00Z"),
    ];
    const plan = planTrip(reads, tzLookup);
    expect(stopsOf(plan).map((stop) => stop.photos)).toEqual([[0, 4]]);
    expect(plan.kind === "stops" && plan.skipped).toEqual({ noLocationOrDate: 2, unreadable: 1 });
  });

  it("has nothing to group when no photo has both a location and a date", () => {
    const reads: PhotoRead[] = [{ status: "no_date", location: SHIBUYA }, { status: "no_location" }, { status: "unreadable" }];
    expect(planTrip(reads, tzLookup)).toEqual({ kind: "no_usable", skipped: { noLocationOrDate: 2, unreadable: 1 } });
    expect(planTrip([], tzLookup)).toEqual({ kind: "no_usable", skipped: { noLocationOrDate: 0, unreadable: 0 } });
  });

  it("refuses more than 500 photos", () => {
    const reads = (count: number) => Array.from({ length: count }, (_, i) => ok(SHIBUYA, new Date(Date.UTC(2025, 2, 12, 1, 0, i)).toISOString()));
    expect(MAX_PHOTOS).toBe(500);
    expect(planTrip(reads(500), tzLookup).kind).toBe("stops");
    expect(planTrip(reads(501), tzLookup)).toEqual({ kind: "too_many_photos" });
  });

  it("refuses more than 150 stops", () => {
    // Spots 1 km apart, 10 minutes apart: every photo is its own stop.
    const reads = (count: number) =>
      Array.from({ length: count }, (_, i) => ok(near(SHIBUYA, 0, i * 1000), new Date(Date.UTC(2025, 2, 12, 0, i * 10)).toISOString()));
    expect(IMPORT_MAX_STOPS).toBe(150);
    expect(stopsOf(planTrip(reads(150), tzLookup))).toHaveLength(150);
    expect(planTrip(reads(151), tzLookup)).toEqual({ kind: "too_many_stops", stops: 151, skipped: { noLocationOrDate: 0, unreadable: 0 } });
  });
});

describe("centroidOf and metres", () => {
  it("averages across the antimeridian", () => {
    const { lat, lng } = centroidOf([
      { lat: -17, lng: 179.999 },
      { lat: -17, lng: -179.999 },
    ]);
    expect(lat).toBeCloseTo(-17, 9);
    expect(Math.abs(lng)).toBeCloseTo(180, 6);
  });

  it("measures great-circle distances", () => {
    expect(metres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
    expect(metres(SHIBUYA, near(SHIBUYA, 0, 150))).toBeCloseTo(150, 0);
  });
});

describe("skippedLine", () => {
  it("says what was skipped, only the parts that apply", () => {
    expect(skippedLine({ noLocationOrDate: 12, unreadable: 3 })).toBe("Skipped 15 photos: 12 without a location or date, 3 unreadable.");
    expect(skippedLine({ noLocationOrDate: 0, unreadable: 2 })).toBe("Skipped 2 photos: 2 unreadable.");
    expect(skippedLine({ noLocationOrDate: 1, unreadable: 0 })).toBe("Skipped 1 photo: 1 without a location or date.");
    expect(skippedLine({ noLocationOrDate: 0, unreadable: 0 })).toBeNull();
  });
});

describe("randomUuid", () => {
  it("makes v4 UUIDs", () => {
    const ids = new Set(Array.from({ length: 100 }, randomUuid));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

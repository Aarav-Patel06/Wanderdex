import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { type Precision, visitedAtUtc } from "@/lib/dates";
import { NO_FILTERS, type VisitFilters } from "@/lib/visit-filters";
import { dateBounds, dateRangeFilter, filterVisits, visitTimeZones } from "@/lib/visit-query";

type Range = Pick<VisitFilters, "from" | "to">;
type Visit = { value: string; precision: Precision; timezone: string };

// What the database does with the bounds: the visit's zone picks its group, then visited_at,
// stored by the save rules (SPEC §8), is compared with them.
function matches(visit: Visit, range: Range, zones = [visit.timezone]) {
  const at = visitedAtUtc(visit.value, visit.precision, visit.timezone);
  const group = dateBounds(range, zones).find(({ zones }) => zones.includes(visit.timezone));
  if (!group) return false;
  const lower = visit.precision === "month" ? group.monthFrom : group.from;
  return (!lower || at >= new Date(lower)) && (!group.before || at < new Date(group.before));
}

const day = (value: string, timezone = "Europe/London"): Visit => ({ value, precision: "date", timezone });
const month = (value: string, timezone = "Europe/London"): Visit => ({ value, precision: "month", timezone });
const at = (value: string, timezone: string): Visit => ({ value, precision: "datetime", timezone });

describe("date range matching, by precision", () => {
  describe("date only", () => {
    it("matches when its day is in the range, ends included", () => {
      const range = { from: "2025-03-10", to: "2025-03-12" };
      expect(matches(day("2025-03-10"), range)).toBe(true);
      expect(matches(day("2025-03-12"), range)).toBe(true);
      expect(matches(day("2025-03-09"), range)).toBe(false);
      expect(matches(day("2025-03-13"), range)).toBe(false);
    });

    it("matches a one-day range on that day", () => {
      expect(matches(day("2025-03-12"), { from: "2025-03-12", to: "2025-03-12" })).toBe(true);
      expect(matches(day("2025-03-13"), { from: "2025-03-12", to: "2025-03-12" })).toBe(false);
    });

    it("uses its own zone's day, at the extreme offsets", () => {
      // Stored at 12:00 local: 22:00 UTC the day before in Kiritimati (+14), and 23:00 UTC the
      // same day in Pago Pago (-11).
      const range = { from: "2025-03-12", to: "2025-03-12" };
      expect(matches(day("2025-03-12", "Pacific/Kiritimati"), range)).toBe(true);
      expect(matches(day("2025-03-12", "Pacific/Pago_Pago"), range)).toBe(true);
      expect(matches(day("2025-03-13", "Pacific/Kiritimati"), range)).toBe(false);
      expect(matches(day("2025-03-11", "Pacific/Pago_Pago"), range)).toBe(false);
    });
  });

  describe("exact time", () => {
    it("matches by its local date, from 00:00 to 23:59", () => {
      const range = { from: "2025-03-12", to: "2025-03-12" };
      expect(matches(at("2025-03-12T00:00", "Asia/Tokyo"), range)).toBe(true);
      expect(matches(at("2025-03-12T23:59", "Asia/Tokyo"), range)).toBe(true);
      expect(matches(at("2025-03-11T23:59", "Asia/Tokyo"), range)).toBe(false);
      expect(matches(at("2025-03-13T00:00", "Asia/Tokyo"), range)).toBe(false);
    });

    it("uses the local date where it differs from the UTC date", () => {
      // 00:30 in Tokyo is 15:30 UTC the day before; 23:30 in Los Angeles is 06:30 UTC the day after.
      expect(matches(at("2025-03-01T00:30", "Asia/Tokyo"), { from: "2025-03-01", to: null })).toBe(true);
      expect(matches(at("2025-03-01T00:30", "Asia/Tokyo"), { from: null, to: "2025-02-28" })).toBe(false);
      expect(matches(at("2025-02-28T23:30", "America/Los_Angeles"), { from: null, to: "2025-02-28" })).toBe(true);
      expect(matches(at("2025-02-28T23:30", "America/Los_Angeles"), { from: "2025-03-01", to: null })).toBe(false);
    });

    it("handles a DST change on the edge of the range", () => {
      // New York springs forward at 02:00 on Mar 9 and falls back at 02:00 on Nov 2.
      expect(matches(at("2025-03-09T00:00", "America/New_York"), { from: "2025-03-09", to: null })).toBe(true);
      expect(matches(at("2025-03-09T23:59", "America/New_York"), { from: null, to: "2025-03-09" })).toBe(true);
      expect(matches(at("2025-03-10T00:00", "America/New_York"), { from: null, to: "2025-03-09" })).toBe(false);
      expect(matches(at("2025-11-02T23:59", "America/New_York"), { from: null, to: "2025-11-02" })).toBe(true);
    });

    it("handles a day with no midnight (Santiago jumps from 00:00 to 01:00)", () => {
      const range = { from: "2025-09-07", to: null };
      expect(matches(at("2025-09-07T01:00", "America/Santiago"), range)).toBe(true);
      expect(matches(at("2025-09-06T23:59", "America/Santiago"), range)).toBe(false);
      expect(matches(at("2025-09-06T23:59", "America/Santiago"), { from: null, to: "2025-09-06" })).toBe(true);
    });
  });

  describe("month only", () => {
    const march = month("2025-03");

    it("matches when any day of its month is in the range", () => {
      expect(matches(march, { from: "2025-03-15", to: "2025-03-20" })).toBe(true);
      expect(matches(march, { from: "2025-02-20", to: "2025-03-01" })).toBe(true);
      expect(matches(march, { from: "2025-03-31", to: "2025-04-05" })).toBe(true);
      expect(matches(march, { from: "2025-01-01", to: "2025-12-31" })).toBe(true);
    });

    it("doesn't match a range wholly before or after its month", () => {
      expect(matches(march, { from: "2025-04-01", to: "2025-04-30" })).toBe(false);
      expect(matches(march, { from: "2025-02-01", to: "2025-02-28" })).toBe(false);
    });

    it("matches open ranges that reach its month", () => {
      expect(matches(march, { from: "2025-03-31", to: null })).toBe(true);
      expect(matches(march, { from: null, to: "2025-03-01" })).toBe(true);
      expect(matches(march, { from: "2025-04-01", to: null })).toBe(false);
      expect(matches(march, { from: null, to: "2025-02-28" })).toBe(false);
    });

    it("uses its own zone's month, at the extreme offsets", () => {
      // Stored on the 1st at 12:00 local: Feb 28 22:00 UTC in Kiritimati.
      expect(matches(month("2025-03", "Pacific/Kiritimati"), { from: null, to: "2025-03-01" })).toBe(true);
      expect(matches(month("2025-03", "Pacific/Kiritimati"), { from: null, to: "2025-02-28" })).toBe(false);
      expect(matches(month("2025-02", "Pacific/Pago_Pago"), { from: "2025-02-28", to: null })).toBe(true);
      expect(matches(month("2025-02", "Pacific/Pago_Pago"), { from: "2025-03-01", to: null })).toBe(false);
    });

    it("doesn't widen the range for date-only or exact-time visits in the same month", () => {
      const range = { from: "2025-03-15", to: "2025-03-20" };
      expect(matches(day("2025-03-02"), range)).toBe(false);
      expect(matches(at("2025-03-14T23:59", "Europe/London"), range)).toBe(false);
    });
  });
});

describe("dateBounds", () => {
  it("has no bounds with neither end", () => {
    expect(dateBounds({ from: null, to: null }, ["Asia/Tokyo"])).toEqual([]);
  });

  it("gives each zone its local midnights, open ends as null", () => {
    expect(dateBounds({ from: "2025-03-12", to: null }, ["Asia/Tokyo"])).toEqual([
      {
        zones: ["Asia/Tokyo"],
        from: "2025-03-11T15:00:00.000Z",
        monthFrom: "2025-02-28T15:00:00.000Z",
        before: null,
      },
    ]);
    expect(dateBounds({ from: null, to: "2025-03-12" }, ["Asia/Tokyo"])).toEqual([
      { zones: ["Asia/Tokyo"], from: null, monthFrom: null, before: "2025-03-12T15:00:00.000Z" },
    ]);
  });

  it("groups zones with the same bounds, once each", () => {
    const groups = dateBounds({ from: "2025-07-01", to: "2025-07-31" }, [
      "Europe/Paris",
      "Asia/Tokyo",
      "Europe/Berlin",
      "Europe/Paris",
    ]);
    expect(groups.map(({ zones }) => zones)).toEqual([["Asia/Tokyo"], ["Europe/Berlin", "Europe/Paris"]]);
  });

  it("splits zones that share an offset on one end but not the other", () => {
    // London and Lisbon agree all year; Accra (no DST) matches them in winter only.
    const groups = dateBounds({ from: "2025-01-15", to: "2025-07-15" }, ["Africa/Accra", "Europe/Lisbon", "Europe/London"]);
    expect(groups.map(({ zones }) => zones)).toEqual([["Africa/Accra"], ["Europe/Lisbon", "Europe/London"]]);
  });
});

describe("dateRangeFilter", () => {
  it("gives month-only visits their own lower bound, the 1st of from's month", () => {
    const groups = dateBounds({ from: "2025-03-12", to: "2025-03-20" }, ["Asia/Tokyo"]);
    expect(dateRangeFilter(groups)).toBe(
      'and(timezone.in.("Asia/Tokyo"),visited_at.lt."2025-03-20T15:00:00.000Z",' +
        'or(visited_at.gte."2025-03-11T15:00:00.000Z",' +
        'and(visited_precision.eq.month,visited_at.gte."2025-02-28T15:00:00.000Z")))',
    );
  });

  it("needs one lower bound when from is the 1st", () => {
    const groups = dateBounds({ from: "2025-03-01", to: null }, ["UTC"]);
    expect(dateRangeFilter(groups)).toBe('and(timezone.in.("UTC"),visited_at.gte."2025-03-01T00:00:00.000Z")');
  });

  it("has one group per set of bounds, zones quoted", () => {
    const groups = dateBounds({ from: null, to: "2025-07-31" }, ["Europe/Paris", "Europe/Berlin", "Etc/GMT+5"]);
    expect(dateRangeFilter(groups)).toBe(
      'and(timezone.in.("Etc/GMT+5"),visited_at.lt."2025-08-01T05:00:00.000Z"),' +
        'and(timezone.in.("Europe/Berlin","Europe/Paris"),visited_at.lt."2025-07-31T22:00:00.000Z")',
    );
  });
});

// A stand-in for the Supabase query builder: records each call.
function recorder() {
  const calls: unknown[][] = [];
  const builder = {
    in: (...args: unknown[]) => (calls.push(["in", ...args]), builder),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
    or: (...args: unknown[]) => (calls.push(["or", ...args]), builder),
  };
  return { builder, calls };
}

describe("filterVisits", () => {
  it("adds nothing without filters", () => {
    const { builder, calls } = recorder();
    expect(filterVisits(builder, NO_FILTERS, ["Asia/Tokyo"])).toBe(builder);
    expect(calls).toEqual([]);
  });

  it("filters by the chosen categories, and the embedded place's country and city", () => {
    const { builder, calls } = recorder();
    filterVisits(builder, { ...NO_FILTERS, categories: ["food", "cafe"], country: "Japan", city: "Tokyo" }, []);
    expect(calls).toEqual([
      ["in", "category", ["food", "cafe"]],
      ["eq", "places.country", "Japan"],
      ["eq", "places.city", "Tokyo"],
    ]);
  });

  it("adds the date range as one or filter over the user's zones", () => {
    const { builder, calls } = recorder();
    const range = { from: "2025-03-01", to: "2025-03-31" };
    filterVisits(builder, { ...NO_FILTERS, ...range }, ["UTC"]);
    expect(calls).toEqual([["or", dateRangeFilter(dateBounds(range, ["UTC"]))]]);
  });

  it("skips the date range when the user has no visits (no zones)", () => {
    const { builder, calls } = recorder();
    filterVisits(builder, { ...NO_FILTERS, from: "2025-03-01" }, []);
    expect(calls).toEqual([]);
  });
});

describe("visitTimeZones", () => {
  function fakeClient(result: { data: unknown; error: unknown }) {
    const calls: unknown[][] = [];
    const builder = {
      from: (...args: unknown[]) => (calls.push(["from", ...args]), builder),
      select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
      overrideTypes: () => builder,
      then: (resolve: (value: typeof result) => unknown) => resolve(result),
    };
    return { client: builder as unknown as SupabaseClient, calls };
  }

  it("reads the visits' zones, each once", async () => {
    const rows = [{ timezone: "Asia/Tokyo" }, { timezone: "UTC" }, { timezone: "Asia/Tokyo" }];
    const { client, calls } = fakeClient({ data: rows, error: null });
    expect(await visitTimeZones(client)).toEqual(["Asia/Tokyo", "UTC"]);
    expect(calls).toEqual([
      ["from", "visits"],
      ["select", "timezone"],
    ]);
  });

  it("throws on a query error", async () => {
    const { client } = fakeClient({ data: null, error: new Error("boom") });
    await expect(visitTimeZones(client)).rejects.toThrow("boom");
  });
});

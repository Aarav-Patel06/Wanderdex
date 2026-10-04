import { describe, expect, it } from "vitest";

import {
  formatVisited,
  formatVisitedParts,
  isLocalValue,
  isTimeZone,
  localToUtc,
  localValue,
  startOfLocalDay,
  timezoneAt,
  todayIn,
  visitedAtUtc,
} from "@/lib/dates";

const iso = (d: Date | null) => d?.toISOString();

describe("timezoneAt", () => {
  it.each([
    ["Paris", 48.8694204, 2.2890529, "Europe/Paris"],
    ["Boston", 42.350511, -71.07966, "America/New_York"],
    ["Bengaluru airport", 13.198909, 77.7068926, "Asia/Kolkata"],
    ["Madrid", 40.4258461, -3.7205887, "Europe/Madrid"],
    ["Yosemite", 37.73431, -119.6376, "America/Los_Angeles"],
    ["Auckland", -36.8485, 174.7633, "Pacific/Auckland"],
  ])("%s → %s", (_, lat, lng, zone) => {
    expect(timezoneAt(lat, lng)).toBe(zone);
  });
});

describe("isTimeZone", () => {
  it.each(["America/New_York", "Asia/Kolkata", "UTC"])("accepts %s", (tz) => expect(isTimeZone(tz)).toBe(true));
  it.each(["Mars/Olympus", "", "EST5EDT/Nope"])("rejects %s", (tz) => expect(isTimeZone(tz)).toBe(false));
});

describe("isLocalValue", () => {
  it.each([
    ["2025-03-12T15:45", "datetime"],
    ["2024-02-29T00:00", "datetime"],
    ["2025-03-12", "date"],
    ["2025-03", "month"],
  ] as const)("accepts %s as %s", (value, precision) => {
    expect(isLocalValue(value, precision)).toBe(true);
  });

  it.each([
    ["2025-03-12", "datetime"],
    ["2025-03-12T15:45", "date"],
    ["2025-03-12", "month"],
    ["2025-02-30", "date"],
    ["2025-02-29", "date"],
    ["2025-13", "month"],
    ["2025-00", "month"],
    ["2025-03-12T24:00", "datetime"],
    ["2025-03-12T15:60", "datetime"],
    ["2025-3-12", "date"],
    ["March 2025", "month"],
  ] as const)("rejects %s as %s", (value, precision) => {
    expect(isLocalValue(value, precision)).toBe(false);
  });
});

describe("localToUtc", () => {
  it.each([
    ["Paris in winter (UTC+1)", "2025-03-12T15:45", "Europe/Paris", "2025-03-12T14:45:00.000Z"],
    ["Paris in summer (UTC+2)", "2025-07-01T12:00", "Europe/Paris", "2025-07-01T10:00:00.000Z"],
    ["New York after DST starts", "2025-03-12T15:45", "America/New_York", "2025-03-12T19:45:00.000Z"],
    ["Kathmandu (UTC+5:45)", "2025-03-12T12:00", "Asia/Kathmandu", "2025-03-12T06:15:00.000Z"],
    ["with seconds", "2025-03-12T15:45:30", "UTC", "2025-03-12T15:45:30.000Z"],
  ])("%s", (_, local, zone, expected) => {
    expect(iso(localToUtc(local, zone))).toBe(expected);
  });
});

describe("visitedAtUtc (storage rules)", () => {
  it("stores datetime as given", () => {
    expect(iso(visitedAtUtc("2025-03-12T15:45", "datetime", "America/New_York"))).toBe("2025-03-12T19:45:00.000Z");
  });

  it("stores date precision at 12:00 local", () => {
    expect(iso(visitedAtUtc("2025-03-12", "date", "America/New_York"))).toBe("2025-03-12T16:00:00.000Z");
  });

  it("stores month precision on the 1st at 12:00 local", () => {
    expect(iso(visitedAtUtc("2025-03", "month", "Asia/Kolkata"))).toBe("2025-03-01T06:30:00.000Z");
  });

  it("can land on the previous UTC day far east of UTC", () => {
    expect(iso(visitedAtUtc("2025-03-12", "date", "Pacific/Auckland"))).toBe("2025-03-11T23:00:00.000Z");
  });

  it("rejects a value that doesn't match its precision", () => {
    expect(() => visitedAtUtc("2025-03-12", "month", "UTC")).toThrow(RangeError);
    expect(() => visitedAtUtc("2025-02-30", "date", "UTC")).toThrow(RangeError);
  });
});

describe("formatVisited", () => {
  it("formats each precision in the place's zone", () => {
    const at = visitedAtUtc("2025-03-12T15:45", "datetime", "America/New_York");
    expect(formatVisited(at, "datetime", "America/New_York")).toBe("Mar 12, 2025, 3:45 PM");
    expect(formatVisited(at, "date", "America/New_York")).toBe("Mar 12, 2025");
    expect(formatVisited(at, "month", "America/New_York")).toBe("Mar 2025");
  });

  it("round-trips stored month and date values, even across the UTC date line", () => {
    const month = visitedAtUtc("2025-03", "month", "Pacific/Auckland");
    expect(month.toISOString().startsWith("2025-02-28")).toBe(true);
    expect(formatVisited(month, "month", "Pacific/Auckland")).toBe("Mar 2025");

    const date = visitedAtUtc("2025-03-12", "date", "Pacific/Auckland");
    expect(formatVisited(date, "date", "Pacific/Auckland")).toBe("Mar 12, 2025");
  });

  it("accepts the timestamp string Postgres returns", () => {
    expect(formatVisited("2025-03-12T19:45:00+00:00", "datetime", "America/New_York")).toBe("Mar 12, 2025, 3:45 PM");
  });

  it("formats midnight and noon", () => {
    expect(formatVisited("2025-03-12T00:05:00Z", "datetime", "UTC")).toBe("Mar 12, 2025, 12:05 AM");
    expect(formatVisited("2025-03-12T12:00:00Z", "datetime", "UTC")).toBe("Mar 12, 2025, 12:00 PM");
  });
});

describe("formatVisitedParts", () => {
  it("splits an exact time from its date, in the place's zone", () => {
    expect(formatVisitedParts("2025-03-12T19:45:00+00:00", "datetime", "America/New_York")).toEqual({
      date: "Mar 12, 2025",
      time: "3:45 PM",
    });
    // 00:30 UTC on the 13th is still the 12th in New York.
    expect(formatVisitedParts("2025-03-13T00:30:00Z", "datetime", "America/New_York")).toEqual({
      date: "Mar 12, 2025",
      time: "8:30 PM",
    });
  });

  it("has no time for date and month precision", () => {
    const at = visitedAtUtc("2025-03-12", "date", "Pacific/Auckland");
    expect(formatVisitedParts(at, "date", "Pacific/Auckland")).toEqual({ date: "Mar 12, 2025", time: null });
    expect(formatVisitedParts(at, "month", "Pacific/Auckland")).toEqual({ date: "Mar 2025", time: null });
  });
});

describe("localValue", () => {
  it("gives back the value each precision was stored from, in the visit's zone", () => {
    for (const [value, precision] of [
      ["2025-03-12T15:45", "datetime"],
      ["2025-03-12", "date"],
      ["2025-03", "month"],
    ] as const) {
      const stored = visitedAtUtc(value, precision, "Pacific/Auckland").toISOString();
      expect(localValue(stored, precision, "Pacific/Auckland")).toBe(value);
    }
  });

  it("accepts the timestamp string Postgres returns", () => {
    expect(localValue("2025-03-12T19:45:00+00:00", "datetime", "America/New_York")).toBe("2025-03-12T15:45");
  });
});

describe("startOfLocalDay", () => {
  it("is local midnight on an ordinary day", () => {
    expect(iso(startOfLocalDay("2025-03-12", "Asia/Tokyo"))).toBe("2025-03-11T15:00:00.000Z");
    expect(iso(startOfLocalDay("2025-03-12", "America/New_York"))).toBe("2025-03-12T04:00:00.000Z");
    expect(iso(startOfLocalDay("2025-03-12", "UTC"))).toBe("2025-03-12T00:00:00.000Z");
  });

  it("handles the extreme offsets, +14 and -12", () => {
    expect(iso(startOfLocalDay("2025-03-01", "Pacific/Kiritimati"))).toBe("2025-02-28T10:00:00.000Z");
    expect(iso(startOfLocalDay("2025-03-01", "Etc/GMT+12"))).toBe("2025-03-01T12:00:00.000Z");
  });

  it("is midnight on a DST day that changes the clock later (New York springs forward at 2:00)", () => {
    expect(iso(startOfLocalDay("2025-03-09", "America/New_York"))).toBe("2025-03-09T05:00:00.000Z");
    expect(iso(startOfLocalDay("2025-11-02", "America/New_York"))).toBe("2025-11-02T04:00:00.000Z");
  });

  it("starts when the clock jumps on a day with no midnight (Santiago: 00:00 -04 → 01:00 -03)", () => {
    const start = startOfLocalDay("2025-09-07", "America/Santiago");
    expect(iso(start)).toBe("2025-09-07T04:00:00.000Z");
    expect(formatVisited(start, "datetime", "America/Santiago")).toBe("Sep 7, 2025, 1:00 AM");
    expect(formatVisited(new Date(start.getTime() - 60_000), "datetime", "America/Santiago")).toBe(
      "Sep 6, 2025, 11:59 PM",
    );
  });

  it("takes the first of two midnights when the clock goes back to 00:00 (Havana)", () => {
    // 01:00 -04 → 00:00 -05, so 00:00–00:59 happens twice; the day starts at the first.
    expect(iso(startOfLocalDay("2025-11-02", "America/Havana"))).toBe("2025-11-02T04:00:00.000Z");
  });

  it("starts the next day for a day a zone skipped entirely (Samoa, 2011-12-30)", () => {
    expect(iso(startOfLocalDay("2011-12-30", "Pacific/Apia"))).toBe(iso(startOfLocalDay("2011-12-31", "Pacific/Apia")));
    expect(iso(startOfLocalDay("2011-12-31", "Pacific/Apia"))).toBe("2011-12-30T10:00:00.000Z");
  });
});

describe("todayIn", () => {
  it("uses the zone's calendar date", () => {
    const now = new Date("2026-09-30T02:00:00Z");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-09-29");
    expect(todayIn("Asia/Tokyo", now)).toBe("2026-09-30");
  });
});

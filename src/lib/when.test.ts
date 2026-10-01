import { describe, expect, it } from "vitest";

import { formatDay, initialWhen, isComplete, whenValue, withDay, withMonth, withPrecision, withTime } from "@/lib/when";

// 2026-09-30 15:45 UTC
const NOW = new Date(Date.UTC(2026, 8, 30, 15, 45));

describe("initialWhen", () => {
  it("defaults to now in the place's zone", () => {
    expect(initialWhen(null, "Asia/Tokyo", NOW)).toEqual({ day: "2026-10-01", time: "00:45", precision: "datetime" });
    expect(initialWhen(null, "America/New_York", NOW)).toEqual({
      day: "2026-09-30",
      time: "11:45",
      precision: "datetime",
    });
  });

  it("keeps a parsed date's precision", () => {
    expect(initialWhen({ value: "2025-03-12T19:30", precision: "datetime" }, "UTC")).toEqual({
      day: "2025-03-12",
      time: "19:30",
      precision: "datetime",
    });
    expect(initialWhen({ value: "2025-03-12", precision: "date" }, "UTC")).toEqual({
      day: "2025-03-12",
      time: "",
      precision: "date",
    });
    expect(initialWhen({ value: "2025-03", precision: "month" }, "UTC")).toEqual({
      day: "2025-03-01",
      time: "",
      precision: "month",
    });
  });
});

describe("whenValue", () => {
  it("round-trips each precision", () => {
    for (const visited of [
      { value: "2025-03-12T19:30", precision: "datetime" },
      { value: "2025-03-12", precision: "date" },
      { value: "2025-03", precision: "month" },
    ] as const) {
      expect(whenValue(initialWhen(visited, "UTC"))).toBe(visited.value);
    }
  });
});

describe("changing the date or time", () => {
  const month = initialWhen({ value: "2025-03", precision: "month" }, "UTC");
  const date = initialWhen({ value: "2025-03-12", precision: "date" }, "UTC");
  const exact = initialWhen({ value: "2025-03-12T19:30", precision: "datetime" }, "UTC");

  it("keeps the chosen precision", () => {
    expect(whenValue(withDay(date, "2025-03-14"))).toBe("2025-03-14");
    expect(whenValue(withMonth(month, "2024-11"))).toBe("2024-11");
    expect(whenValue(withDay(exact, "2025-03-13"))).toBe("2025-03-13T19:30");
    expect(whenValue(withTime(exact, "08:15"))).toBe("2025-03-12T08:15");
  });

  it("puts a picked month on the 1st", () => {
    expect(withMonth(date, "2024-11")).toEqual({ day: "2024-11-01", time: "", precision: "date" });
  });
});

describe("withPrecision", () => {
  const exact = initialWhen({ value: "2025-03-12T19:30", precision: "datetime" }, "UTC");

  it("hides the unknown parts", () => {
    expect(whenValue(withPrecision(exact, "date"))).toBe("2025-03-12");
    expect(whenValue(withPrecision(exact, "month"))).toBe("2025-03");
  });

  it("brings a hidden time back", () => {
    expect(whenValue(withPrecision(withPrecision(exact, "month"), "datetime"))).toBe("2025-03-12T19:30");
  });

  it("starts exact time at 12:00 when no time was known", () => {
    const month = initialWhen({ value: "2025-03", precision: "month" }, "UTC");
    expect(withPrecision(month, "datetime")).toEqual({ day: "2025-03-01", time: "12:00", precision: "datetime" });
  });
});

describe("formatDay", () => {
  it("shows the date to its precision", () => {
    expect(formatDay(initialWhen({ value: "2025-03", precision: "month" }, "UTC"))).toBe("Mar 2025");
    expect(formatDay(initialWhen({ value: "2025-03-12", precision: "date" }, "UTC"))).toBe("Mar 12, 2025");
  });
});

describe("isComplete", () => {
  it("needs a time only for exact time", () => {
    const exact = initialWhen({ value: "2025-03-12T19:30", precision: "datetime" }, "UTC");
    expect(isComplete(exact)).toBe(true);
    expect(isComplete(withTime(exact, ""))).toBe(false);
    expect(isComplete(withPrecision(withTime(exact, ""), "date"))).toBe(true);
    expect(isComplete(initialWhen({ value: "2025-03", precision: "month" }, "UTC"))).toBe(true);
  });
});

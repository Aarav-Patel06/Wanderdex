import { describe, expect, it } from "vitest";

import { passportData } from "@/lib/stats/passport";
import { type ProfileStats, profileStats } from "@/lib/stats/profile";

const EMPTY: ProfileStats = profileStats([]);

describe("passportData", () => {
  it("prints the profile's countries and continents out of 195 and 7, and its places as pins", () => {
    const data = passportData({ ...EMPTY, countries: 12, continents: 3, places: 42 });
    expect(data).toMatchObject({ countries: "12/195", continents: "3/7", pins: 42 });
  });

  it("gives the first pin's name and its date at its precision, in its zone", () => {
    const place = { id: "p1", name: "Senso-ji", city: "Tokyo", country: "Japan", category: "landmark" as const };
    const at = { place, timezone: "Asia/Tokyo", visitedAt: "2025-03-12T05:30:00+00:00" };
    expect(passportData({ ...EMPTY, first: { ...at, precision: "datetime" } }).firstPin).toEqual({
      name: "Senso-ji",
      date: "Mar 12, 2025, 2:30 PM",
    });
    expect(passportData({ ...EMPTY, first: { ...at, precision: "month" } }).firstPin?.date).toBe("Mar 2025");
  });

  it("has no first pin without visits", () => {
    expect(passportData(EMPTY)).toEqual({ countries: "0/195", continents: "0/7", pins: 0, firstPin: null });
  });
});

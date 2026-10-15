import { describe, expect, it } from "vitest";

import { checkDigit, ENTRY_STAMPS_MAX, MRZ_LENGTH, mrzLines, passportData } from "@/lib/stats/passport";
import { type ProfileStats, profileStats } from "@/lib/stats/profile";

const EMPTY: ProfileStats = profileStats([]);
const OWNER = { userId: "3f9a2c1b-77d0-4e5f-9a1b-2c3d4e5f6a7b", username: "aarav_p", joined: "2026-10-11T03:00:00+00:00" };

describe("passportData", () => {
  it("prints the owner: username, a traveler number from the id, and the join month in UTC", () => {
    expect(passportData(EMPTY, OWNER)).toMatchObject({ name: "aarav_p", travelerNo: "3F9A2C1B", issued: "OCT 2026" });
    // Late on Sep 30 in New York is already October in UTC.
    expect(passportData(EMPTY, { ...OWNER, joined: "2026-09-30T23:30:00-04:00" }).issued).toBe("OCT 2026");
    expect(passportData(EMPTY, { ...OWNER, joined: null }).issued).toBe("--");
  });

  it("gives the profile's countries out of 195, its places as pins, and all 7 continents in order", () => {
    const data = passportData(
      { ...EMPTY, countries: 12, continents: ["Asia", "Europe"], places: 42, visits: 50, cities: 9 },
      OWNER,
    );
    expect(data).toMatchObject({ countries: { visited: 12, total: 195 }, pins: 42, visits: 50, cities: 9 });
    expect(data.continents.map(({ code }) => code)).toEqual(["AF", "AN", "AS", "EU", "NA", "OC", "SA"]);
    expect(data.continents.filter(({ visited }) => visited).map(({ name }) => name)).toEqual(["Asia", "Europe"]);
  });

  it("gives the first pin's place, where it is, and its date at its precision, in its zone", () => {
    const place = { id: "p1", name: "Senso-ji", city: "Tokyo", country: "Japan", category: "landmark" as const };
    const at = { place, timezone: "Asia/Tokyo", visitedAt: "2025-03-12T05:30:00+00:00" };
    expect(passportData({ ...EMPTY, first: { ...at, precision: "datetime" } }, OWNER).firstPin).toEqual({
      id: "p1",
      name: "Senso-ji",
      category: "landmark",
      where: "Tokyo, Japan",
      date: "Mar 12, 2025, 2:30 PM",
    });
    const noCity = { ...at, place: { ...place, city: null }, precision: "month" as const };
    expect(passportData({ ...EMPTY, first: noCity }, OWNER).firstPin).toMatchObject({ where: "Japan", date: "Mar 2025" });
  });

  it("gives the category with the most pins, and the highest rated place with its rating", () => {
    const place = { id: "p2", name: "Taj Mahal", city: "Agra", country: "India", category: "landmark" as const };
    const data = passportData(
      { ...EMPTY, categories: [{ category: "park_nature", count: 3 }, { category: "food", count: 1 }], topRated: { place, rating: 10 } },
      OWNER,
    );
    expect(data.favorite).toEqual({ category: "park_nature", label: "Park & Nature" });
    expect(data.topRated).toEqual({ id: "p2", name: "Taj Mahal", category: "landmark", rating: 10 });
  });

  it("stamps the first countries visited, in order, each dated at its precision in its zone", () => {
    const at = (code: string, visitedAt: string, precision: "datetime" | "date" | "month", timezone = "UTC") => ({
      code,
      visitedAt,
      precision,
      timezone,
    });
    const countryFirsts = [
      // 23:30 UTC on Mar 11 is already Mar 12 in Tokyo.
      at("JP", "2025-03-11T23:30:00+00:00", "datetime", "Asia/Tokyo"),
      at("FR", "2025-05-01T12:00:00+00:00", "month"),
      ...["US", "IT", "ES", "GB", "DE"].map((code, i) => at(code, `2025-06-0${i + 1}T12:00:00+00:00`, "date")),
    ];
    const { entries } = passportData({ ...EMPTY, countryFirsts }, OWNER);
    expect(entries).toHaveLength(ENTRY_STAMPS_MAX);
    expect(entries.slice(0, 3)).toEqual([
      { code: "JP", date: "12 MAR 2025" },
      { code: "FR", date: "MAY 2025" },
      { code: "US", date: "01 JUN 2025" },
    ]);
    expect(entries.at(-1)?.code).toBe("GB");
  });

  it("has no first pin, favorite, or highest rated place without visits", () => {
    const data = passportData(EMPTY, OWNER);
    expect(data).toMatchObject({
      countries: { visited: 0, total: 195 },
      pins: 0,
      visits: 0,
      cities: 0,
      favorite: null,
      topRated: null,
      firstPin: null,
      entries: [],
      issuer: "WDX",
    });
    expect(data.continents.some(({ visited }) => visited)).toBe(false);
  });
});

describe("mrzLines", () => {
  it("is the TD3 zone: P<, the issuer and the name, then the number, nationality, and dates with check digits", () => {
    const [line1, line2] = mrzLines("aarav_p", "3F9A2C1B", "2026-10-11T03:00:00+00:00");
    expect(line1).toBe(`P<WDXAARAV<<P${"<".repeat(31)}`);
    // 3F9A2C1B< → 3; 261011 → 7; composite over the number, birth date, and the rest → 2.
    expect(line2).toBe(`3F9A2C1B<3WDX2610117<${"<".repeat(22)}2`);
    expect(line2).toHaveLength(MRZ_LENGTH);
  });

  it("separates the name's first part with << and the rest with <, and fits 44 characters", () => {
    expect(mrzLines("traveler_2026_abcdef", "3F9A2C1B", null)[0]).toBe(`P<WDXTRAVELER<<2026<ABCDEF${"<".repeat(18)}`);
    expect(mrzLines("aarav", "3F9A2C1B", null)[0]).toBe(`P<WDXAARAV${"<".repeat(34)}`);
    expect(mrzLines("", "3F9A2C1B", null)[0]).toBe(`P<WDX${"<".repeat(39)}`);
  });

  it("leaves the date and its check digit empty without a join date", () => {
    expect(mrzLines("aarav", "3F9A2C1B", null)[1].slice(13, 20)).toBe("<<<<<<<");
  });
});

describe("checkDigit", () => {
  it("matches ICAO 9303's specimen passport", () => {
    expect(checkDigit("L898902C3")).toBe("6");
    expect(checkDigit("740812")).toBe("2");
    expect(checkDigit("120415")).toBe("9");
    expect(checkDigit("ZE184226B<<<<<")).toBe("1");
    expect(checkDigit("L898902C36" + "7408122" + "1204159ZE184226B<<<<<1")).toBe("0");
  });
});

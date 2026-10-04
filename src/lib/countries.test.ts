import { describe, expect, it } from "vitest";

import { countryAt, inPolygon, loadCountryShapes } from "@/lib/countries";

describe("inPolygon", () => {
  // A 10×10 square with a 2×2 hole in the middle.
  const square = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ] as [number, number][][];

  it("is inside the outer ring and outside the hole", () => {
    expect(inPolygon([1, 1], square)).toBe(true);
    expect(inPolygon([9.99, 5], square)).toBe(true);
    expect(inPolygon([5, 5], square)).toBe(false);
    expect(inPolygon([11, 5], square)).toBe(false);
    expect(inPolygon([-0.01, 5], square)).toBe(false);
  });
});

// Against the real file (public/geo/countries.geojson: Natural Earth 1:50m, simplified to about
// 5 km). Border points are a few km from the line; closer than that the simplification decides.
describe("countryAt", async () => {
  const shapes = await loadCountryShapes();
  const at = (lat: number, lng: number) => countryAt(shapes, { lat, lng });

  it("finds countries on either side of a land border", () => {
    expect(at(47.5596, 7.5886)).toBe("CH"); // Basel
    expect(at(47.594, 7.62)).toBe("DE"); // Weil am Rhein, across the Rhine
    expect(at(47.59, 7.56)).toBe("FR"); // Saint-Louis
    expect(at(46.2044, 6.1432)).toBe("CH"); // Geneva
    expect(at(46.193, 6.234)).toBe("FR"); // Annemasse
    expect(at(32.5149, -117.0382)).toBe("MX"); // Tijuana
    expect(at(32.5565, -117.04)).toBe("US"); // San Ysidro
    expect(at(42.3314, -83.0458)).toBe("US"); // Detroit
    expect(at(42.3149, -83.0364)).toBe("CA"); // Windsor, across the river
    expect(at(1.4927, 103.7414)).toBe("MY"); // Johor Bahru
    expect(at(1.3521, 103.8198)).toBe("SG"); // Singapore
  });

  it("finds a country inside another one (a hole in its shape)", () => {
    expect(at(-29.31, 27.48)).toBe("LS"); // Maseru, Lesotho
    expect(at(-29.19, 27.46)).toBe("ZA"); // Ladybrand, just across the border
    expect(at(43.9356, 12.4473)).toBe("SM"); // San Marino
    expect(at(44.06, 12.57)).toBe("IT"); // Rimini
    expect(at(54.71, 20.51)).toBe("RU"); // Kaliningrad, an exclave
  });

  it("finds islands", () => {
    expect(at(21.3069, -157.8583)).toBe("US"); // Honolulu
    expect(at(35.8989, 14.5146)).toBe("MT"); // Valletta
    expect(at(39.5696, 2.6502)).toBe("ES"); // Palma de Mallorca
    expect(at(-42.8821, 147.3272)).toBe("AU"); // Hobart, Tasmania
    expect(at(55.1, 14.9)).toBe("DK"); // Bornholm
    expect(at(4.1755, 73.5093)).toBe("MV"); // Malé
    expect(at(78.22, 15.65)).toBe("NO"); // Svalbard
    expect(at(64.18, -51.72)).toBe("GL"); // Nuuk
  });

  it("finds Fiji on both sides of the antimeridian", () => {
    expect(at(-18.1248, 178.4501)).toBe("FJ"); // Suva
    expect(at(-16.85, -179.95)).toBe("FJ"); // Taveuni
  });

  it("counts a point just off the coast (the shapes reach about 8 km out to sea)", () => {
    expect(at(41.35, 2.2)).toBe("ES"); // about 3 km off Barcelona's beach
  });

  it("is null on the open sea", () => {
    expect(at(30, -40)).toBeNull(); // mid-Atlantic
    expect(at(0, -150)).toBeNull(); // mid-Pacific
  });
});

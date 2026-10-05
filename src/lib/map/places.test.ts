import { describe, expect, it } from "vitest";

import {
  addVisit,
  clusterLabel,
  clusterZoomAt,
  countryCodes,
  leftClearOf,
  type MapPlace,
  mapZoomFor,
  pinSizeAt,
  placesFromVisits,
  selectedPinSize,
} from "@/lib/map/places";

const ICHIRAN = { id: "a", name: "Ichiran Shibuya", city: "Tokyo", country: "Japan", country_code: "JP", lat: 35.66, lng: 139.7 };
const TATE = { id: "b", name: "Tate Modern", city: "London", country: "United Kingdom", country_code: "GB", lat: 51.51, lng: -0.1 };

describe("placesFromVisits", () => {
  it("makes one pin per place, counting its visits", () => {
    expect(
      placesFromVisits([
        { category: "food", place: ICHIRAN },
        { category: "museum", place: TATE },
        { category: "food", place: ICHIRAN },
      ]),
    ).toEqual([
      { ...ICHIRAN, category: "food", visits: 2 },
      { ...TATE, category: "museum", visits: 1 },
    ]);
  });

  it("uses the category of the newest visit (the first row)", () => {
    const [place] = placesFromVisits([
      { category: "bar", place: ICHIRAN },
      { category: "food", place: ICHIRAN },
    ]);
    expect(place.category).toBe("bar");
  });

  it("skips rows whose place isn't readable", () => {
    expect(placesFromVisits([{ category: "food", place: null }])).toEqual([]);
  });
});

describe("addVisit", () => {
  const places: MapPlace[] = [{ ...ICHIRAN, category: "food", visits: 2 }];

  it("adds a new place with one visit", () => {
    expect(addVisit(places, { ...TATE, category: "museum" })).toEqual([
      ...places,
      { ...TATE, category: "museum", visits: 1 },
    ]);
  });

  it("counts another visit to a known place and takes its category", () => {
    expect(addVisit(places, { ...ICHIRAN, category: "bar" })).toEqual([
      { ...ICHIRAN, category: "bar", visits: 3 },
    ]);
  });
});

describe("countryCodes", () => {
  it("lists each country once, skipping places without a code", () => {
    const pin = (id: string, country_code: string | null): MapPlace => ({
      ...ICHIRAN,
      id,
      country_code,
      category: "food",
      visits: 1,
    });
    expect(countryCodes([pin("a", "JP"), pin("b", "GB"), pin("c", "JP"), pin("d", null)])).toEqual(["GB", "JP"]);
    expect(countryCodes([])).toEqual([]);
  });
});

describe("pin sizes", () => {
  it.each([
    [0, 32, 64],
    [9.99, 32, 64],
    [10, 64, 96],
    [14.99, 64, 96],
    [15, 96, 128],
    [20, 96, 128],
  ])("zoom %f → %ipx, selected %ipx", (zoom, size, selected) => {
    expect(pinSizeAt(zoom)).toBe(size);
    expect(selectedPinSize(pinSizeAt(zoom))).toBe(selected);
  });
});

describe("cluster zoom", () => {
  it.each([
    [3.5, 3],
    [9.99, 9],
    [10, 9],
    [10.5, 9],
    [11, 10],
    [15.2, 14],
  ])("map zoom %f → cluster zoom %i", (zoom, clusterZoom) => {
    expect(clusterZoomAt(zoom)).toBe(clusterZoom);
  });

  it.each([
    [3, 3],
    [9, 9],
    [10, 11],
    [14, 15],
  ])("cluster zoom %i shows from map zoom %i", (clusterZoom, zoom) => {
    expect(mapZoomFor(clusterZoom)).toBe(zoom);
    expect(clusterZoomAt(zoom)).toBeGreaterThanOrEqual(clusterZoom);
    expect(clusterZoomAt(zoom - 0.01)).toBeLessThan(clusterZoom);
  });
});

describe("clusterLabel", () => {
  it.each([
    [2, "2"],
    [99, "99"],
    [100, "99+"],
    [1234, "99+"],
  ])("%i → %s", (count, label) => {
    expect(clusterLabel(count)).toBe(label);
  });
});

describe("leftClearOf", () => {
  // A 375px phone's control column: the avatar, then the zoom and legend buttons.
  const controls = [
    { left: 315, top: 16, right: 359, bottom: 60 },
    { left: 311, top: 76, right: 359, bottom: 120 },
    { left: 311, top: 136, right: 359, bottom: 180 },
  ];

  it("leaves a popup that's already clear where it is", () => {
    expect(leftClearOf({ left: 20, top: 30, right: 270, bottom: 200 }, controls, 26)).toBe(0);
  });

  it("moves an overlapping popup left of the controls, gap included", () => {
    expect(leftClearOf({ left: 60, top: 30, right: 316, bottom: 200 }, controls, 26)).toBe(311 - 26 - 316);
  });

  it("counts a popup inside the gap as overlapping", () => {
    expect(leftClearOf({ left: 30, top: 100, right: 290, bottom: 160 }, controls, 26)).toBe(-5);
  });

  it("ignores controls above or below the popup's rows", () => {
    expect(leftClearOf({ left: 100, top: 220, right: 356, bottom: 400 }, controls, 26)).toBe(0);
    // Only the avatar shares its rows.
    expect(leftClearOf({ left: 60, top: 0, right: 300, bottom: 40 }, controls, 26)).toBe(315 - 26 - 300);
  });
});

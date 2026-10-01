import { describe, expect, it } from "vitest";

import {
  addVisit,
  clusterLabel,
  clusterZoomAt,
  type MapPlace,
  mapZoomFor,
  pinSizeAt,
  placesFromVisits,
  selectedPinSize,
} from "@/lib/map/places";

const ICHIRAN = { id: "a", name: "Ichiran Shibuya", city: "Tokyo", country: "Japan", lat: 35.66, lng: 139.7 };
const TATE = { id: "b", name: "Tate Modern", city: "London", country: "United Kingdom", lat: 51.51, lng: -0.1 };

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

import { describe, expect, it } from "vitest";

import { addVisit, clusterLabel, type MapPlace, placesFromVisits } from "@/lib/map/places";

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

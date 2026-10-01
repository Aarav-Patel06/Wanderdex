import { describe, expect, it } from "vitest";

import { saveToasts } from "@/lib/save-toasts";
import type { SavedVisit } from "@/lib/visits";

const saved: SavedVisit = {
  place: { id: "p1", name: "Ichiran", city: "Tokyo", country: "Japan", country_code: "JP", lat: 35.66, lng: 139.7 },
  visit: {
    id: "v1",
    place_id: "p1",
    category: "food",
    visited_at: "2025-03-12T03:00:00+00:00",
    visited_precision: "date",
    timezone: "Asia/Tokyo",
  },
  return_visit: false,
  first_in_country: false,
};

const titles = (result: SavedVisit) => saveToasts(result).map(({ title }) => title);

describe("saveToasts", () => {
  it("announces a new place", () => {
    expect(saveToasts(saved)).toEqual([
      { title: "New place discovered!", description: "Ichiran added to your Wanderdex.", variant: "success" },
    ]);
  });

  it("announces a return visit instead of a new place", () => {
    expect(saveToasts({ ...saved, return_visit: true })).toEqual([
      { title: "Return visit!", description: "Another visit to Ichiran logged.", variant: "success" },
    ]);
  });

  it("fires the first-country toast first, so it shows below the other one", () => {
    expect(saveToasts({ ...saved, first_in_country: true })).toEqual([
      { title: "First visit to a new country!", description: "You visited Japan for the first time!", variant: "visited" },
      { title: "New place discovered!", description: "Ichiran added to your Wanderdex.", variant: "success" },
    ]);
  });

  it("names the country by its code when the name is missing", () => {
    const place = { ...saved.place, country: null };
    expect(saveToasts({ ...saved, place, first_in_country: true })[0].description).toBe(
      "You visited JP for the first time!",
    );
  });

  it("leaves the first-country toast to its own flag", () => {
    expect(titles({ ...saved, return_visit: true, first_in_country: true })).toEqual([
      "First visit to a new country!",
      "Return visit!",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { googleMapsUrl } from "@/lib/google/maps-url";

describe("googleMapsUrl", () => {
  it("opens a Google place by name and place ID", () => {
    const url = googleMapsUrl({ name: "Café de Flore & Co", google_place_id: "ChIJ123", lat: 48.85, lng: 2.33 });
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Caf%C3%A9+de+Flore+%26+Co&query_place_id=ChIJ123",
    );
    expect(new URL(url).searchParams.get("query")).toBe("Café de Flore & Co");
  });

  it("opens a manual place by its coordinates", () => {
    expect(googleMapsUrl({ name: "Secret spot", google_place_id: null, lat: 35.6595, lng: -139.7005 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=35.6595%2C-139.7005",
    );
  });
});

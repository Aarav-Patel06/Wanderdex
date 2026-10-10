import { describe, expect, it } from "vitest";

import { type ExportVisit, exportRow } from "@/lib/export";
import { EXPORT_COLUMNS } from "@/lib/export-file";

const PLACE: ExportVisit["places"] = {
  name: "Senso-ji",
  address: "2 Chome-3-1 Asakusa, Taito City, Tokyo",
  city: "Tokyo",
  country: "Japan",
  country_code: "JP",
  lat: 35.7148,
  lng: 139.7967,
  google_place_id: "ChIJ8T1GpMGOGGARDYGSgpooDWw",
};

const VISIT: ExportVisit = {
  // 14:30 in Tokyo, as Postgres returns timestamps.
  visited_at: "2025-03-12T05:30:00+00:00",
  visited_precision: "datetime",
  timezone: "Asia/Tokyo",
  category: "landmark",
  rating: 9,
  note: "Early, before the crowds",
  source: "text",
  source_input: "senso-ji last march",
  created_at: "2025-03-13T01:02:03.456+00:00",
  places: PLACE,
};

describe("exportRow", () => {
  it("has every column, in order", () => {
    expect(Object.keys(exportRow(VISIT))).toEqual([...EXPORT_COLUMNS]);
  });

  it("is the visit with its place, the date in UTC and local at its precision", () => {
    expect(exportRow(VISIT)).toEqual({
      name: "Senso-ji",
      category: "landmark",
      address: "2 Chome-3-1 Asakusa, Taito City, Tokyo",
      city: "Tokyo",
      country: "Japan",
      country_code: "JP",
      lat: 35.7148,
      lng: 139.7967,
      visited_at_utc: "2025-03-12T05:30:00.000Z",
      visited_local: "2025-03-12T14:30",
      precision: "datetime",
      timezone: "Asia/Tokyo",
      rating: 9,
      note: "Early, before the crowds",
      source: "text",
      source_input: "senso-ji last march",
      google_place_id: "ChIJ8T1GpMGOGGARDYGSgpooDWw",
      created_at: "2025-03-13T01:02:03.456Z",
    });
  });

  it("gives the local date only to its precision, in the visit's zone", () => {
    // Date and month precision are stored at 12:00 local (SPEC §8): 03:00 UTC is noon in Tokyo.
    expect(exportRow({ ...VISIT, visited_at: "2025-03-12T03:00:00+00:00", visited_precision: "date" }).visited_local).toBe(
      "2025-03-12",
    );
    expect(exportRow({ ...VISIT, visited_at: "2025-03-01T03:00:00+00:00", visited_precision: "month" }).visited_local).toBe(
      "2025-03",
    );
    // Late on the 11th in Los Angeles is already the 12th in UTC.
    const la = exportRow({ ...VISIT, visited_at: "2025-03-12T06:00:00+00:00", timezone: "America/Los_Angeles" });
    expect(la.visited_local).toBe("2025-03-11T23:00");
    expect(la.visited_at_utc).toBe("2025-03-12T06:00:00.000Z");
  });

  it("keeps a dropped pin's missing parts as null", () => {
    const pin = exportRow({
      ...VISIT,
      rating: null,
      note: null,
      source: "manual",
      source_input: null,
      places: { ...PLACE, name: "My spot", address: null, city: null, google_place_id: null },
    });
    expect(pin).toMatchObject({ name: "My spot", address: null, city: null, google_place_id: null, rating: null, note: null, source_input: null });
  });
});

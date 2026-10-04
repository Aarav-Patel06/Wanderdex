import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  alignCategory,
  categoryChangeSchema,
  findReadablePlace,
  idSchema,
  isFirstInCountry,
  isReturnVisit,
  newVisitSchema,
  noteSchema,
  ratingSchema,
  visitEditSchema,
  visitsAt,
} from "@/lib/visits";

const PLACE_ID = "0b5c3f6e-8f1a-4c2d-9e7b-1a2b3c4d5e6f";

describe("ratingSchema", () => {
  it("takes a whole number from 1 to 10, or null", () => {
    for (const rating of [1, 5, 10, null]) expect(ratingSchema.parse(rating)).toBe(rating);
  });

  it("rejects anything else", () => {
    for (const rating of [0, 11, -1, 7.5, "7", undefined, Number.NaN]) {
      expect(ratingSchema.safeParse(rating).success).toBe(false);
    }
  });
});

describe("noteSchema", () => {
  it("trims the note", () => {
    expect(noteSchema.parse("  Great ramen.\n")).toBe("Great ramen.");
  });

  it("turns an empty or blank note into null", () => {
    expect(noteSchema.parse("")).toBeNull();
    expect(noteSchema.parse("   \n\t ")).toBeNull();
    expect(noteSchema.parse(null)).toBeNull();
  });

  it("allows 2000 characters after trimming, not 2001", () => {
    expect(noteSchema.parse(` ${"a".repeat(2000)} `)).toHaveLength(2000);
    expect(noteSchema.safeParse("a".repeat(2001)).success).toBe(false);
  });

  it("rejects a missing note or a non-string", () => {
    expect(noteSchema.safeParse(undefined).success).toBe(false);
    expect(noteSchema.safeParse(42).success).toBe(false);
  });
});

describe("newVisitSchema", () => {
  const visit = {
    place: {
      google_place_id: "ChIJ123",
      name: "Ichiran",
      google_primary_type: "ramen_restaurant",
      types: ["ramen_restaurant", "restaurant"],
      category: "food",
      address: null,
      city: "Tokyo",
      country: "Japan",
      country_code: "JP",
      lat: 35.66,
      lng: 139.7,
      timezone: "Asia/Tokyo",
      expires: 1,
      signature: "a".repeat(64),
    },
    category: "food",
    visited: { value: "2025-03", precision: "month" },
    rating: 9,
    note: "  Late-night bowl. ",
    source: "text",
    source_input: "ichiran shibuya",
  };

  it("passes the rating and the trimmed note through", () => {
    const parsed = newVisitSchema.parse(visit);
    expect(parsed.rating).toBe(9);
    expect(parsed.note).toBe("Late-night bowl.");
  });

  it("accepts no rating and no note as null", () => {
    const parsed = newVisitSchema.parse({ ...visit, rating: null, note: " " });
    expect(parsed.rating).toBeNull();
    expect(parsed.note).toBeNull();
  });

  it("rejects an out-of-range rating or an oversized note", () => {
    expect(newVisitSchema.safeParse({ ...visit, rating: 0 }).success).toBe(false);
    expect(newVisitSchema.safeParse({ ...visit, note: "a".repeat(2001) }).success).toBe(false);
  });

  it("requires the lookup's source with a signed place", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { source, ...withoutSource } = visit;
    expect(newVisitSchema.safeParse(withoutSource).success).toBe(false);
  });

  describe("an existing place, by id", () => {
    const existing = {
      place_id: PLACE_ID,
      category: "cafe",
      visited: { value: "2025-03-12", precision: "date" },
      rating: null,
      note: "",
    };

    it("takes the place id and the user's choices, with no place fields or signature", () => {
      const parsed = newVisitSchema.parse(existing);
      expect(parsed).toEqual({ ...existing, note: null });
      expect("place" in parsed).toBe(false);
    });

    it("rejects an id that isn't a UUID", () => {
      for (const place_id of ["", "abc", 42, null]) {
        expect(newVisitSchema.safeParse({ ...existing, place_id }).success).toBe(false);
      }
    });

    it("validates the choices the same way", () => {
      expect(newVisitSchema.safeParse({ ...existing, rating: 11 }).success).toBe(false);
      expect(newVisitSchema.safeParse({ ...existing, category: "spa" }).success).toBe(false);
      const badDay = { ...existing, visited: { value: "2025-02-30", precision: "date" } };
      expect(newVisitSchema.safeParse(badDay).success).toBe(false);
    });

    it("rejects a body with neither a place nor a place id", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { place_id, ...neither } = existing;
      expect(newVisitSchema.safeParse(neither).success).toBe(false);
    });
  });

  describe("from a photo", () => {
    const photo = { ...visit, visited: { value: "2025-03-12T15:45", precision: "datetime" }, source: "photo", source_input: null };

    it("takes a signed place with source photo and no source input", () => {
      const parsed = newVisitSchema.parse(photo);
      expect(parsed).toMatchObject({ source: "photo", source_input: null });
    });

    it("never takes a source input, so no photo data can be stored with it", () => {
      expect(newVisitSchema.safeParse({ ...photo, source_input: "data:image/jpeg;base64,/9j/4AAQ" }).success).toBe(false);
      expect(newVisitSchema.safeParse({ ...photo, source_input: "" }).success).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { source_input, ...withoutInput } = photo;
      expect(newVisitSchema.safeParse(withoutInput).success).toBe(false);
    });

    it("still needs the signed place", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { signature, ...unsigned } = photo.place;
      expect(newVisitSchema.safeParse({ ...photo, place: unsigned }).success).toBe(false);
    });
  });

  describe("a dropped pin (manual place)", () => {
    const manual = {
      manual_place: { name: "  Grandma's house ", lat: 45.4642, lng: 9.19 },
      category: "other",
      visited: { value: "2025-08-15", precision: "date" },
      rating: 10,
      note: "",
    };

    it("takes a trimmed name and the pin's coordinates, and nothing else about the place", () => {
      const parsed = newVisitSchema.parse(manual);
      expect(parsed).toEqual({
        ...manual,
        manual_place: { name: "Grandma's house", lat: 45.4642, lng: 9.19 },
        note: null,
      });
    });

    it("drops place fields the browser makes up (the server works them out)", () => {
      const parsed = newVisitSchema.parse({
        ...manual,
        manual_place: { ...manual.manual_place, city: "Paris", country_code: "FR", created_by: PLACE_ID },
      });
      expect("manual_place" in parsed && parsed.manual_place).toEqual({ name: "Grandma's house", lat: 45.4642, lng: 9.19 });
    });

    it("requires a name of 1 to 100 characters after trimming", () => {
      const named = (name: unknown) => newVisitSchema.safeParse({ ...manual, manual_place: { ...manual.manual_place, name } });
      expect(named("a".repeat(100)).success).toBe(true);
      expect(named(` ${"a".repeat(100)} `).success).toBe(true);
      expect(named("a".repeat(101)).success).toBe(false);
      expect(named("").success).toBe(false);
      expect(named("   ").success).toBe(false);
      expect(named(null).success).toBe(false);
      expect(named(42).success).toBe(false);
    });

    it("requires coordinates in range", () => {
      const at = (lat: unknown, lng: unknown) =>
        newVisitSchema.safeParse({ ...manual, manual_place: { name: "Spot", lat, lng } }).success;
      expect(at(90, 180)).toBe(true);
      expect(at(-90, -180)).toBe(true);
      expect(at(90.1, 0)).toBe(false);
      expect(at(0, -180.1)).toBe(false);
      expect(at("45", "9")).toBe(false);
      expect(at(null, 9)).toBe(false);
      expect(at(Number.POSITIVE_INFINITY, 9)).toBe(false);
    });

    it("validates the category and the choices like any visit", () => {
      expect(newVisitSchema.safeParse({ ...manual, category: "spa" }).success).toBe(false);
      expect(newVisitSchema.safeParse({ ...manual, rating: 0 }).success).toBe(false);
      expect(newVisitSchema.safeParse({ ...manual, note: "a".repeat(2001) }).success).toBe(false);
      expect(newVisitSchema.safeParse({ ...manual, visited: { value: "2025-13", precision: "month" } }).success).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { category, ...noCategory } = manual;
      expect(newVisitSchema.safeParse(noCategory).success).toBe(false);
    });
  });
});

describe("visitEditSchema", () => {
  const edit = { visited: { value: "2025-03-12T19:30", precision: "datetime" }, rating: 7, note: " Good. " };

  it("takes the date at its precision, the rating, and the trimmed note", () => {
    expect(visitEditSchema.parse(edit)).toEqual({ ...edit, note: "Good." });
    expect(visitEditSchema.parse({ ...edit, rating: null, note: null })).toMatchObject({ rating: null, note: null });
  });

  it("rejects a value that doesn't match its precision, or a missing field", () => {
    const wrongFormat = { ...edit, visited: { value: "2025-03", precision: "date" } };
    const wrongPrecision = { ...edit, visited: { value: "2025-03-12", precision: "hour" } };
    expect(visitEditSchema.safeParse(wrongFormat).success).toBe(false);
    expect(visitEditSchema.safeParse(wrongPrecision).success).toBe(false);
    for (const key of ["visited", "rating", "note"] as const) {
      const partial: Record<string, unknown> = { ...edit };
      delete partial[key];
      expect(visitEditSchema.safeParse(partial).success).toBe(false);
    }
  });

  it("drops a category: it's changed per place, not per visit", () => {
    expect(visitEditSchema.parse({ ...edit, category: "bar" })).not.toHaveProperty("category");
  });
});

describe("categoryChangeSchema", () => {
  it("takes one of the 10 categories", () => {
    expect(categoryChangeSchema.parse({ category: "park_nature" })).toEqual({ category: "park_nature" });
    for (const category of ["Park & Nature", "spa", "", null]) {
      expect(categoryChangeSchema.safeParse({ category }).success).toBe(false);
    }
  });
});

describe("idSchema", () => {
  it("takes a UUID and nothing else", () => {
    expect(idSchema.safeParse(PLACE_ID).success).toBe(true);
    for (const id of ["", "123", `${PLACE_ID}x`, "1; drop table visits"]) {
      expect(idSchema.safeParse(id).success).toBe(false);
    }
  });
});

// A stand-in for the Supabase query builder: records each call and resolves to `result`.
function fakeClient(result: { count?: number | null; data?: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const builder = {
    from: (...args: unknown[]) => (calls.push(["from", ...args]), builder),
    select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
    update: (...args: unknown[]) => (calls.push(["update", ...args]), builder),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
    neq: (...args: unknown[]) => (calls.push(["neq", ...args]), builder),
    maybeSingle: () => (calls.push(["maybeSingle"]), builder),
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return { client: builder as unknown as SupabaseClient, calls };
}

describe("isFirstInCountry", () => {
  const visit = { userId: "user-1", visitId: "visit-9", countryCode: "JP" };

  it("is true when the user has no other visit in the country", async () => {
    const { client, calls } = fakeClient({ count: 0, error: null });
    expect(await isFirstInCountry(client, visit)).toBe(true);
    // The user's visits whose place is in the country, minus the one just saved.
    expect(calls).toEqual([
      ["from", "visits"],
      ["select", "id, places!inner(country_code)", { count: "exact", head: true }],
      ["eq", "user_id", "user-1"],
      ["eq", "places.country_code", "JP"],
      ["neq", "id", "visit-9"],
    ]);
  });

  it("is false when another visit is in the country", async () => {
    const { client } = fakeClient({ count: 2, error: null });
    expect(await isFirstInCountry(client, visit)).toBe(false);
  });

  it("skips a place with no country code without querying", async () => {
    const { client, calls } = fakeClient({ count: 0, error: null });
    expect(await isFirstInCountry(client, { ...visit, countryCode: null })).toBe(false);
    expect(calls).toEqual([]);
  });

  it("throws on a query error", async () => {
    const { client } = fakeClient({ count: null, error: new Error("boom") });
    await expect(isFirstInCountry(client, visit)).rejects.toThrow("boom");
  });
});

describe("findReadablePlace (saving to an existing place)", () => {
  const row = { id: PLACE_ID, name: "Blue Bottle", city: "Tokyo", country: "Japan", country_code: "JP", lat: 35.6, lng: 139.7 };

  it("reads the place by id with the given (session) client", async () => {
    const { client, calls } = fakeClient({ data: row, error: null });
    expect(await findReadablePlace(client, PLACE_ID)).toEqual(row);
    expect(calls).toEqual([
      ["from", "places"],
      ["select", "id, name, city, country, country_code, lat, lng"],
      ["eq", "id", PLACE_ID],
      ["maybeSingle"],
    ]);
  });

  it("is null when RLS hides it or it doesn't exist", async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await findReadablePlace(client, PLACE_ID)).toBeNull();
  });

  it("throws on a query error", async () => {
    const { client } = fakeClient({ data: null, error: new Error("boom") });
    await expect(findReadablePlace(client, PLACE_ID)).rejects.toThrow("boom");
  });
});

describe("visitsAt", () => {
  it("counts the user's visits at the place", async () => {
    const { client, calls } = fakeClient({ count: 3, error: null });
    expect(await visitsAt(client, { userId: "user-1", placeId: PLACE_ID })).toBe(3);
    expect(calls).toEqual([
      ["from", "visits"],
      ["select", "id", { count: "exact", head: true }],
      ["eq", "user_id", "user-1"],
      ["eq", "place_id", PLACE_ID],
    ]);
  });

  it("reads a missing count as 0", async () => {
    const { client } = fakeClient({ count: null, error: null });
    expect(await visitsAt(client, { userId: "user-1", placeId: PLACE_ID })).toBe(0);
  });
});

describe("isReturnVisit", () => {
  const visit = { userId: "user-1", placeId: PLACE_ID, visitId: "visit-9" };

  it("is true when the user has another visit at the place", async () => {
    const { client, calls } = fakeClient({ count: 1, error: null });
    expect(await isReturnVisit(client, visit)).toBe(true);
    // The user's visits at the place, minus the one just saved.
    expect(calls).toEqual([
      ["from", "visits"],
      ["select", "id", { count: "exact", head: true }],
      ["eq", "user_id", "user-1"],
      ["eq", "place_id", PLACE_ID],
      ["neq", "id", "visit-9"],
    ]);
  });

  it("is false for the first visit at the place", async () => {
    const { client } = fakeClient({ count: 0, error: null });
    expect(await isReturnVisit(client, visit)).toBe(false);
  });

  it("throws on a query error", async () => {
    const { client } = fakeClient({ count: null, error: new Error("boom") });
    await expect(isReturnVisit(client, visit)).rejects.toThrow("boom");
  });
});

describe("alignCategory (one category per user per place)", () => {
  const save = { userId: "user-1", placeId: PLACE_ID, category: "bar" as const };

  it("moves the user's visits at the place that are in another category to the chosen one", async () => {
    const { client, calls } = fakeClient({ error: null });
    await alignCategory(client, save);
    // Only this user's visits at this place, and only the ones that differ.
    expect(calls).toEqual([
      ["from", "visits"],
      ["update", { category: "bar" }],
      ["eq", "user_id", "user-1"],
      ["eq", "place_id", PLACE_ID],
      ["neq", "category", "bar"],
    ]);
  });

  it("throws on a query error, so the save stops before inserting", async () => {
    const { client } = fakeClient({ error: new Error("boom") });
    await expect(alignCategory(client, save)).rejects.toThrow("boom");
  });
});

import { describe, expect, it } from "vitest";

import type { TripStop } from "@/lib/trip/group";
import type { ImportCandidate, ImportCounts, ImportStop, YourPlace } from "@/lib/trip/lookup";
import {
  importToast,
  initialChoice,
  isAlreadyLogged,
  isSaveable,
  lookupsLine,
  outOfLookupsLine,
  visitBody,
  withMatch,
} from "@/lib/trip/review";
import type { SavedVisit } from "@/lib/visits";

const IMPORT_ID = "0b6f3c1e-8d2a-4f6b-9c3d-2e1f0a9b8c7d";

const yours = (id: string, logged = false): YourPlace => ({
  id,
  name: `Yours ${id}`,
  category: "food",
  city: "Tokyo",
  country: "Japan",
  timezone: "Asia/Tokyo",
  metres: 10,
  logged,
});

const candidate = (id: string, logged = false): ImportCandidate => ({
  google_place_id: id,
  name: `Candidate ${id}`,
  google_primary_type: "museum",
  types: ["museum"],
  category: "museum",
  address: null,
  city: "Tokyo",
  country: "Japan",
  country_code: "JP",
  lat: 35.66,
  lng: 139.7,
  timezone: "Asia/Tokyo",
  expires: 1,
  signature: "ab".repeat(32),
  logged,
});

// 2025-04-02 06:45 UTC is 15:45 in Tokyo.
const STOP: TripStop = {
  number: 7,
  photos: [3, 4],
  lat: 35.6595,
  lng: 139.7005,
  instant: Date.UTC(2025, 3, 2, 6, 45, 30),
  timezone: "Asia/Tokyo",
  localDate: "2025-04-02",
};

describe("initialChoice", () => {
  it("preselects the user's place for a local match, in their category", () => {
    const lookup: ImportStop = { local: true, yours: [yours("a"), yours("b")], candidates: [] };
    expect(initialChoice(lookup)).toMatchObject({ include: true, match: { kind: "yours", index: 0 }, category: "food" });
  });

  it("else preselects the first candidate, in its auto category, even with the user's places further away", () => {
    const lookup: ImportStop = { local: false, yours: [yours("far")], candidates: [candidate("g")] };
    expect(initialChoice(lookup)).toMatchObject({ include: true, match: { kind: "candidate", index: 0 }, category: "museum" });
  });

  it("preselects nothing without a candidate, still checked, at Other", () => {
    const lookup: ImportStop = { local: false, yours: [yours("far")], candidates: [] };
    expect(initialChoice(lookup)).toMatchObject({ include: true, match: null, category: "other", status: "unsaved" });
  });

  it("starts an Already logged match unchecked", () => {
    expect(initialChoice({ local: true, yours: [yours("a", true)], candidates: [] }).include).toBe(false);
    expect(initialChoice({ local: false, yours: [], candidates: [candidate("g", true)] }).include).toBe(false);
  });
});

describe("Already logged", () => {
  const lookup: ImportStop = { local: false, yours: [yours("a", true)], candidates: [candidate("g", false), candidate("h", true)] };

  it("follows the chosen match", () => {
    expect(isAlreadyLogged(lookup, { kind: "yours", index: 0 })).toBe(true);
    expect(isAlreadyLogged(lookup, { kind: "candidate", index: 0 })).toBe(false);
    expect(isAlreadyLogged(lookup, { kind: "candidate", index: 1 })).toBe(true);
    expect(isAlreadyLogged(lookup, { kind: "pin" })).toBe(false);
    expect(isAlreadyLogged(lookup, null)).toBe(false);
  });

  it("only presets the checkbox: switching the match doesn't change it", () => {
    const choice = initialChoice(lookup);
    expect(choice.include).toBe(true);
    const switched = withMatch(lookup, choice, { kind: "yours", index: 0 });
    expect(switched.include).toBe(true);
    expect(switched.category).toBe("food");
    expect(withMatch(lookup, switched, { kind: "pin" }).category).toBe("other");
  });
});

describe("isSaveable", () => {
  const base = initialChoice({ local: false, yours: [], candidates: [candidate("g")] });

  it("counts checked, unsaved stops with a match or a named pin", () => {
    expect(isSaveable(base)).toBe(true);
    expect(isSaveable({ ...base, include: false })).toBe(false);
    expect(isSaveable({ ...base, status: "saved" })).toBe(false);
    expect(isSaveable({ ...base, status: "failed" })).toBe(true);
    expect(isSaveable({ ...base, match: null })).toBe(false);
    expect(isSaveable({ ...base, match: { kind: "pin" }, name: "  " })).toBe(false);
    expect(isSaveable({ ...base, match: { kind: "pin" }, name: "Grandma's" })).toBe(true);
  });
});

describe("visitBody", () => {
  const lookup: ImportStop = { local: false, yours: [yours("6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b")], candidates: [candidate("g", true)] };
  const choice = { ...initialChoice(lookup), rating: 8, note: "Great" };

  it("saves a candidate as signed, without the logged flag, at the stop's time in the place's zone", () => {
    const body = visitBody(IMPORT_ID, STOP, lookup, choice);
    expect(body).toEqual({
      place: expect.not.objectContaining({ logged: expect.anything() }),
      category: "museum",
      visited: { value: "2025-04-02T15:45", precision: "datetime" },
      rating: 8,
      note: "Great",
      source: "photo",
      source_input: null,
      trip: { import_id: IMPORT_ID, stop: 7 },
    });
    expect("place" in body && body.place.signature).toBe("ab".repeat(32));
  });

  it("saves one of the user's places by id", () => {
    const body = visitBody(IMPORT_ID, STOP, lookup, withMatch(lookup, choice, { kind: "yours", index: 0 }));
    expect(body).toMatchObject({ place_id: "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b", category: "food", trip: { import_id: IMPORT_ID, stop: 7 } });
  });

  it("saves a pin as a named manual place at the stop's location", () => {
    const pin = { ...withMatch(lookup, choice, { kind: "pin" }), name: "  Secret garden " };
    expect(visitBody(IMPORT_ID, STOP, lookup, pin)).toMatchObject({
      manual_place: { name: "Secret garden", lat: 35.6595, lng: 139.7005 },
      category: "other",
      visited: { value: "2025-04-02T15:45", precision: "datetime" },
    });
  });
});

describe("the review's lines", () => {
  const counts = (change: Partial<ImportCounts>): ImportCounts => ({
    stops: 0,
    local_matches: 0,
    shared: 0,
    cache_hits: 0,
    google_lookups: 0,
    google_calls: 0,
    unmatched_limit: 0,
    ...change,
  });

  it("shows the lookups made and avoided", () => {
    expect(lookupsLine(counts({ google_lookups: 12, local_matches: 60, shared: 18, cache_hits: 7 }))).toBe(
      "Place lookups: 12 sent to Google, 85 avoided (60 your places, 18 shared, 7 cached)",
    );
    expect(lookupsLine(counts({ google_lookups: 3 }))).toBe("Place lookups: 3 sent to Google, 0 avoided");
  });

  it("says when lookups ran out", () => {
    expect(outOfLookupsLine(counts({}))).toBeNull();
    expect(outOfLookupsLine(counts({ unmatched_limit: 4 }))).toBe(
      "Out of place lookups for now. 4 stops have no match: pick one of your places or drop a pin.",
    );
    expect(outOfLookupsLine(counts({ unmatched_limit: 1 }))).toBe(
      "Out of place lookups for now. 1 stop has no match: pick one of your places or drop a pin.",
    );
  });
});

describe("importToast", () => {
  const saved = (first_in_country: boolean) => ({ first_in_country }) as SavedVisit;

  it("counts saved visits and new countries", () => {
    expect(importToast([saved(true), saved(false), saved(true)])).toEqual({
      title: "Trip imported!",
      description: "3 places logged, 2 new countries",
      variant: "success",
    });
    expect(importToast([saved(true)]).description).toBe("1 place logged, 1 new country");
    expect(importToast([saved(false), saved(false)]).description).toBe("2 places logged, 0 new countries");
  });
});

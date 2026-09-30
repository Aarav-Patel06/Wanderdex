import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type PlaceFields,
  SIGNATURE_TTL_MS,
  signingSecret,
  signPlace,
  verifyPlace,
} from "@/lib/place-signature";

const SECRET = "test-secret";
const NOW = Date.parse("2026-09-30T12:00:00Z");

const PLACE: PlaceFields = {
  google_place_id: "ChIJ-joes",
  name: "Joe's on Newbury",
  google_primary_type: "american_restaurant",
  types: ["american_restaurant", "restaurant", "food"],
  category: "food",
  address: "279 Newbury St, Boston, MA 02116, USA",
  city: "Boston",
  country: "United States",
  country_code: "US",
  lat: 42.350511,
  lng: -71.07966,
  timezone: "America/New_York",
};

// One changed value per signed field.
const TAMPERED: { [K in keyof PlaceFields]: PlaceFields[K] } = {
  google_place_id: "ChIJ-other",
  name: "Joe's on Newbury!",
  google_primary_type: null,
  types: ["restaurant", "american_restaurant", "food"],
  category: "bar",
  address: null,
  city: "Cambridge",
  country: "Canada",
  country_code: "CA",
  lat: 42.350512,
  lng: -71.07965,
  timezone: "America/Chicago",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("place signatures", () => {
  it("accepts a valid signature, including after a JSON round trip", () => {
    const signed = signPlace(PLACE, SECRET, NOW);
    expect(signed.expires).toBe(NOW + SIGNATURE_TTL_MS);
    expect(verifyPlace(signed, SECRET, NOW)).toEqual(PLACE);
    expect(verifyPlace(JSON.parse(JSON.stringify(signed)), SECRET, NOW + SIGNATURE_TTL_MS - 1)).toEqual(PLACE);
  });

  it.each(Object.keys(TAMPERED) as (keyof PlaceFields)[])("rejects a changed %s", (field) => {
    const signed = signPlace(PLACE, SECRET, NOW);
    expect(verifyPlace({ ...signed, [field]: TAMPERED[field] }, SECRET, NOW)).toBeNull();
  });

  it("rejects a value moved into the next field", () => {
    const signed = signPlace({ ...PLACE, city: "Boston", country: null }, SECRET, NOW);
    expect(verifyPlace({ ...signed, city: null, country: "Boston" }, SECRET, NOW)).toBeNull();
  });

  it("rejects a changed expiry or signature, or another secret", () => {
    const signed = signPlace(PLACE, SECRET, NOW);
    expect(verifyPlace({ ...signed, expires: signed.expires + 1 }, SECRET, NOW)).toBeNull();
    const flipped = (signed.signature[0] === "0" ? "1" : "0") + signed.signature.slice(1);
    expect(verifyPlace({ ...signed, signature: flipped }, SECRET, NOW)).toBeNull();
    expect(verifyPlace({ ...signed, signature: signed.signature.slice(2) }, SECRET, NOW)).toBeNull();
    expect(verifyPlace(signed, "other-secret", NOW)).toBeNull();
  });

  it("rejects an expired signature", () => {
    const signed = signPlace(PLACE, SECRET, NOW);
    expect(verifyPlace(signed, SECRET, NOW + SIGNATURE_TTL_MS)).toBeNull();
    expect(verifyPlace(signed, SECRET, NOW + 2 * SIGNATURE_TTL_MS)).toBeNull();
  });

  it("fails closed without a secret", () => {
    vi.stubEnv("RESOLVE_SIGNING_SECRET", "");
    expect(() => signingSecret()).toThrow("RESOLVE_SIGNING_SECRET is not set");
    expect(() => signPlace(PLACE, "", NOW)).toThrow();
    const signed = signPlace(PLACE, SECRET, NOW);
    expect(() => verifyPlace(signed, "", NOW)).toThrow();

    vi.stubEnv("RESOLVE_SIGNING_SECRET", SECRET);
    expect(signingSecret()).toBe(SECRET);
  });
});

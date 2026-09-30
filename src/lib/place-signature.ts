import { createHmac, timingSafeEqual } from "node:crypto";

import type { Candidate } from "@/lib/google/places";

// Signed lookup results. /api/resolve/* signs each candidate it returns, and /api/visits saves a
// Google place only with a valid, unexpired signature, so the browser can't invent the shared
// `places` row for a Google place ID. Server only: uses RESOLVE_SIGNING_SECRET.

// Every place field the save uses.
export type PlaceFields = Candidate & { timezone: string };

export type PlaceSignature = {
  expires: number; // ms since the epoch
  signature: string; // HMAC-SHA256, hex
};

export type SignedPlace = PlaceFields & PlaceSignature;

export const SIGNATURE_TTL_MS = 24 * 60 * 60 * 1000;

// The secret, or an error: lookups and saves fail closed, never unsigned.
export function signingSecret() {
  const secret = process.env.RESOLVE_SIGNING_SECRET;
  if (!secret) throw new Error("RESOLVE_SIGNING_SECRET is not set");
  return secret;
}

// A fixed-order array, so every field is in the signature and none can shift into another.
function canonical(place: PlaceFields, expires: number) {
  return JSON.stringify([
    "wanderdex:place:v1",
    place.google_place_id,
    place.name,
    place.google_primary_type,
    place.types,
    place.category,
    place.address,
    place.city,
    place.country,
    place.country_code,
    place.lat,
    place.lng,
    place.timezone,
    expires,
  ]);
}

function hmac(secret: string, place: PlaceFields, expires: number) {
  if (!secret) throw new Error("RESOLVE_SIGNING_SECRET is not set");
  return createHmac("sha256", secret).update(canonical(place, expires)).digest();
}

export function signPlace(place: PlaceFields, secret: string, now = Date.now()): SignedPlace {
  const expires = now + SIGNATURE_TTL_MS;
  return { ...place, expires, signature: hmac(secret, place, expires).toString("hex") };
}

// The place fields if the signature matches and hasn't expired, otherwise null.
export function verifyPlace(signed: SignedPlace, secret: string, now = Date.now()): PlaceFields | null {
  const { expires, signature, ...place } = signed;
  const expected = hmac(secret, place, expires);
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return now < expires ? place : null;
}

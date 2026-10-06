import { formatInTimeZone } from "date-fns-tz";

import { IMPORT_MAX_STOPS } from "@/lib/rate-limits";
import { JOIN_GAP_MS, JOIN_RADIUS_M, MAX_PHOTOS, MERGE_RADIUS_M } from "@/lib/trip/config";
import { type PhotoRead, readSummary, type ZoneAt } from "@/lib/trip/read";

// Grouping a trip's photos into stops (SPEC §11.8 steps 3–4). Runs in the reading worker, in the
// browser, on what reading found: only coordinates and instants.

// A stop: its photos (indices into the picked files, in time order), its location (their
// centroid), and its time (its first photo's), with the zone at its location and its local date
// there ("YYYY-MM-DD"). number counts from 1 in time order (the import's stop number, §11.8 step 8).
export type TripStop = {
  number: number;
  photos: number[];
  lat: number;
  lng: number;
  instant: number;
  timezone: string;
  localDate: string;
};

// What was skipped (SPEC §11.8 step 3): photos without a location or a usable date, and
// unreadable ones.
export type Skipped = { noLocationOrDate: number; unreadable: number };

export type TripPlan =
  | { kind: "stops"; stops: TripStop[]; skipped: Skipped }
  | { kind: "no_usable"; skipped: Skipped }
  | { kind: "too_many_stops"; stops: number; skipped: Skipped }
  | { kind: "too_many_photos" };

type Photo = { index: number; lat: number; lng: number; instant: number };
type Draft = { photos: Photo[]; lat: number; lng: number; timezone: string; localDate: string };

export function planTrip(reads: PhotoRead[], zoneAt: ZoneAt): TripPlan {
  // The page checks this before reading anything; this guards the grouping too.
  if (reads.length > MAX_PHOTOS) return { kind: "too_many_photos" };
  const summary = readSummary(reads);
  const skipped = { noLocationOrDate: summary.noLocation + summary.noDate, unreadable: summary.unreadable };
  const photos: Photo[] = [];
  reads.forEach((read, index) => {
    if (read.status === "ok") photos.push({ index, ...read.location, instant: read.instant });
  });
  if (photos.length === 0) return { kind: "no_usable", skipped };

  const stops = mergeSameSpot(joinInTime(photos, zoneAt), zoneAt);
  if (stops.length > IMPORT_MAX_STOPS) return { kind: "too_many_stops", stops: stops.length, skipped };
  return {
    kind: "stops",
    skipped,
    stops: stops.map((stop, i) => ({
      number: i + 1,
      photos: stop.photos.map((photo) => photo.index),
      lat: stop.lat,
      lng: stop.lng,
      instant: stop.photos[0].instant,
      timezone: stop.timezone,
      localDate: stop.localDate,
    })),
  };
}

// In time order (ties keep the order picked), a photo joins the current stop if it's within
// JOIN_RADIUS_M of the stop's centroid and within JOIN_GAP_MS of the previous photo.
function joinInTime(photos: Photo[], zoneAt: ZoneAt): Draft[] {
  const sorted = [...photos].sort((a, b) => a.instant - b.instant || a.index - b.index);
  const stops: Photo[][] = [];
  let current: Photo[] = [];
  let centroid = { lat: 0, lng: 0 };
  for (const photo of sorted) {
    const previous = current.at(-1);
    if (previous && photo.instant - previous.instant <= JOIN_GAP_MS && metres(centroid, photo) <= JOIN_RADIUS_M) {
      current.push(photo);
    } else {
      current = [photo];
      stops.push(current);
    }
    centroid = centroidOf(current);
  }
  return stops.map((stop) => draft(stop, zoneAt));
}

// Then stops at the same spot (centroids within MERGE_RADIUS_M) on the same local day become one,
// with the centroid recomputed. Repeated until nothing merges, since a merged centroid moves.
// The result is in time order (by each stop's first photo).
function mergeSameSpot(stops: Draft[], zoneAt: ZoneAt): Draft[] {
  let merged = stops;
  for (let changed = true; changed; ) {
    changed = false;
    const next: Draft[] = [];
    for (const stop of merged) {
      const into = next.findIndex((other) => other.localDate === stop.localDate && metres(other, stop) <= MERGE_RADIUS_M);
      if (into === -1) {
        next.push(stop);
      } else {
        next[into] = draft([...next[into].photos, ...stop.photos], zoneAt);
        changed = true;
      }
    }
    merged = next;
  }
  return merged.sort((a, b) => a.photos[0].instant - b.photos[0].instant || a.photos[0].index - b.photos[0].index);
}

// A stop from its photos: in time order, its centroid, the zone there, and its first photo's
// local date in that zone.
function draft(photos: Photo[], zoneAt: ZoneAt): Draft {
  const sorted = [...photos].sort((a, b) => a.instant - b.instant || a.index - b.index);
  const { lat, lng } = centroidOf(sorted);
  const timezone = zoneAt(lat, lng);
  return { photos: sorted, lat, lng, timezone, localDate: formatInTimeZone(sorted[0].instant, timezone, "yyyy-MM-dd") };
}

// The mean of the points. Longitudes are averaged as offsets from the first point's, so points
// on both sides of the antimeridian (179.999, -179.999) average to it, not to 0.
export function centroidOf(points: { lat: number; lng: number }[]) {
  const base = points[0].lng;
  let lat = 0;
  let offset = 0;
  for (const point of points) {
    lat += point.lat;
    offset += ((point.lng - base + 540) % 360) - 180;
  }
  const lng = ((base + offset / points.length + 540) % 360) - 180;
  return { lat: lat / points.length, lng };
}

// Great-circle distance in metres (haversine).
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// "Skipped 15 photos: 12 without a location or date, 3 unreadable." (SPEC §11.7), only the parts
// that apply; null when nothing was skipped.
export function skippedLine({ noLocationOrDate, unreadable }: Skipped) {
  const total = noLocationOrDate + unreadable;
  if (total === 0) return null;
  const parts = [
    noLocationOrDate > 0 && `${noLocationOrDate} without a location or date`,
    unreadable > 0 && `${unreadable} unreadable`,
  ].filter(Boolean);
  return `Skipped ${total} ${total === 1 ? "photo" : "photos"}: ${parts.join(", ")}.`;
}

// A random UUID (v4) for the import (SPEC §11.8 step 8). crypto.randomUUID exists only in secure
// contexts, and the dev server on a phone (http://<LAN IP>) isn't one; getRandomValues works in both.
export function randomUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

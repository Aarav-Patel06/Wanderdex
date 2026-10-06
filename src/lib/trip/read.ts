import { fromZonedTime } from "date-fns-tz";

import type { LatLng } from "@/lib/links/parse";
import { isPhotoFile, type PhotoInfo, readPhoto } from "@/lib/photo";

// Reading a trip's photos (SPEC §11.8 steps 2–3). Runs in the reading Web Worker (read-worker.ts),
// in the browser only: the files never leave the device. What comes back is only, per file, its
// coordinates and instant, or why it can't be used.

// One file, in the order it was picked:
// - ok: GPS and a usable date, as the instant (ms since the epoch);
// - no_date: GPS but no usable date (it can't be placed in time, so it's skipped);
// - no_location: readable, but no GPS (0,0 counts as none);
// - unreadable: not a photo type we read, or exifr can't parse it.
export type PhotoRead =
  | { status: "ok"; location: LatLng; instant: number }
  | { status: "no_date"; location: LatLng }
  | { status: "no_location" }
  | { status: "unreadable" };

// The IANA zone at a point (the tz lookup, which the worker loads).
export type ZoneAt = (lat: number, lng: number) => string;

// A photo's instant (SPEC §11.8 step 4): with OffsetTimeOriginal, that instant; otherwise its
// time read in the time zone at its coordinates.
export function photoRead(info: PhotoInfo | null, zoneAt: ZoneAt): PhotoRead {
  if (!info) return { status: "unreadable" };
  const { location, taken } = info;
  if (!location) return { status: "no_location" };
  if (!taken) return { status: "no_date", location };
  const instant = taken.offset
    ? Date.parse(`${taken.local}${taken.offset}`)
    : fromZonedTime(taken.local, zoneAt(location.lat, location.lng)).getTime();
  return Number.isFinite(instant) ? { status: "ok", location, instant } : { status: "no_date", location };
}

// One picked file, with Upload Photo's rules (lib/photo). Never throws: a file that can't be
// read (a type we don't read, a damaged file, one removed since it was picked) is unreadable.
export async function readTripPhoto(file: File, zoneAt: ZoneAt): Promise<PhotoRead> {
  if (!isPhotoFile(file)) return { status: "unreadable" };
  try {
    return photoRead(await readPhoto(file), zoneAt);
  } catch {
    return { status: "unreadable" };
  }
}

// read() over every item, at most `concurrency` at a time, results in the items' order.
// onDone(n) after each one finishes.
export async function readAll<T, R>(
  items: T[],
  read: (item: T) => Promise<R>,
  concurrency: number,
  onDone: (done: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  async function lane() {
    while (next < items.length) {
      const index = next++;
      results[index] = await read(items[index]);
      onDone(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

// What the reading found (SPEC §11.8 step 3). selected = withLocation + noLocation + unreadable;
// noDate is the part of withLocation that has no usable date.
export type ReadSummary = {
  selected: number;
  withLocation: number;
  noDate: number;
  noLocation: number;
  unreadable: number;
};

export function readSummary(reads: PhotoRead[]): ReadSummary {
  const count = (status: PhotoRead["status"]) => reads.filter((read) => read.status === status).length;
  const noDate = count("no_date");
  return {
    selected: reads.length,
    withLocation: count("ok") + noDate,
    noDate,
    noLocation: count("no_location"),
    unreadable: count("unreadable"),
  };
}

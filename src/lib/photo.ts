import { formatInTimeZone } from "date-fns-tz";

import type { LatLng } from "@/lib/links/parse";
import type { Visited } from "@/lib/resolve";

// Upload Photo (SPEC §11.2). Runs in the browser only: the photo is read here and never leaves
// the device. Only its coordinates (to /api/resolve/nearby) and its date (on the saved visit) do.

// When the photo was taken: the camera's wall-clock time ("YYYY-MM-DDTHH:mm:ss", from
// DateTimeOriginal) and, if the camera wrote one, its UTC offset ("+09:00", OffsetTimeOriginal).
export type PhotoTaken = { local: string; offset: string | null };

export type PhotoInfo = { location: LatLng | null; taken: PhotoTaken | null };

// JPEG, PNG, HEIC, and WebP (SPEC §11.2 step 1). Some systems give HEIC files no type, so a file
// with no type (or a generic one) goes by its extension.
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];
const PHOTO_EXTENSION = /\.(jpe?g|png|hei[cf]|webp)$/i;

export function isPhotoFile({ name, type }: { name: string; type: string }) {
  if (PHOTO_TYPES.includes(type)) return true;
  return (type === "" || type === "application/octet-stream") && PHOTO_EXTENSION.test(name);
}

// Only these tags are read. reviveValues: false keeps the dates as the raw EXIF strings (exifr
// would otherwise turn them into Dates in the browser's zone). exifr adds `latitude` and
// `longitude` in decimal degrees from the GPS tags either way.
const EXIF_OPTIONS = {
  pick: ["DateTimeOriginal", "OffsetTimeOriginal", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef"],
  reviveValues: false,
};

// The photo's location and date, or null when it can't be read as a photo (exifr doesn't know
// the format, or the file is damaged). exifr is loaded only now, when a photo is picked.
export async function readPhoto(file: Blob): Promise<PhotoInfo | null> {
  const { default: exifr } = await import("exifr");
  let bytes: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
  if (isWebp(bytes)) {
    bytes = webpExif(bytes);
    if (!bytes) return { location: null, taken: null };
  }
  try {
    return photoInfo(await exifr.parse(bytes, EXIF_OPTIONS));
  } catch {
    return null;
  }
}

// exifr's output → what the add flow uses. Coordinates must be numbers in range; 0,0 is what some
// cameras write without a fix, so it counts as no location.
export function photoInfo(raw: Record<string, unknown> | undefined): PhotoInfo {
  const { latitude: lat, longitude: lng } = raw ?? {};
  const location =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
      ? { lat, lng }
      : null;
  return { location, taken: photoTaken(raw?.DateTimeOriginal, raw?.OffsetTimeOriginal) };
}

// "YYYY:MM:DD HH:MM:SS" → PhotoTaken, or null for a missing or invalid date (cameras with an
// unset clock write "0000:00:00 00:00:00"). An offset that isn't "±HH:MM" is ignored.
function photoTaken(dateTime: unknown, offset: unknown): PhotoTaken | null {
  const m = typeof dateTime === "string" && dateTime.trim().match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const valid =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute &&
    d.getUTCSeconds() === second;
  if (!valid) return null;
  const trimmed = typeof offset === "string" ? offset.trim() : "";
  return {
    local: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`,
    offset: /^[+-]\d{2}:\d{2}$/.test(trimmed) ? trimmed : null,
  };
}

// The photo's date for the confirmation card (SPEC §11.2 step 5): exact time, as wall-clock time
// in the place's zone. With an offset the instant is known, so it's shown in the place's zone;
// without one, the camera's time is taken as the place's local time. No date → null (now).
export function photoVisited(taken: PhotoTaken | null, timeZone: string): Visited {
  if (!taken) return null;
  const value = taken.offset
    ? formatInTimeZone(new Date(`${taken.local}${taken.offset}`), timeZone, "yyyy-MM-dd'T'HH:mm")
    : taken.local.slice(0, 16);
  return { value, precision: "datetime" };
}

// "Mar 12, 2025, 3:45 PM": the camera's own time, as written.
export function formatTaken(taken: PhotoTaken) {
  return formatInTimeZone(new Date(`${taken.local}Z`), "UTC", "MMM d, yyyy, h:mm a");
}

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

function isWebp(bytes: Uint8Array) {
  return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
}

// exifr doesn't read WebP. Its EXIF lives in a RIFF "EXIF" chunk as plain TIFF bytes (some
// writers put "Exif\0\0" in front), which exifr does read. null when there's no such chunk.
function webpExif(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    if (ascii(bytes, at, 4) === "EXIF") {
      const data = bytes.subarray(at + 8, at + 8 + size);
      return ascii(data, 0, 6) === "Exif\0\0" ? data.subarray(6) : data;
    }
    at += 8 + size + (size % 2); // chunks are padded to an even size
  }
  return null;
}

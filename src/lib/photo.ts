import { formatInTimeZone } from "date-fns-tz";

import type { LatLng } from "@/lib/links/parse";
import type { Visited } from "@/lib/resolve";

// Upload Photo (SPEC §11.2). Runs in the browser only: the photo is read here and never leaves
// the device. Only its coordinates (to /api/resolve/nearby) and its date (on the saved visit) do.

// When the photo was taken: the camera's wall-clock time ("YYYY-MM-DDTHH:mm:ss", from
// DateTimeOriginal) and, if the camera wrote one, its UTC offset ("+09:00", OffsetTimeOriginal).
export type PhotoTaken = { local: string; offset: string | null };

export type PhotoInfo = { location: LatLng | null; taken: PhotoTaken | null };

// JPEG, PNG, HEIC, WebP, and the TIFF-based RAW formats exifr reads (SPEC §11.2 step 1): DNG
// (iPhone ProRAW), Canon CR2, Nikon NEF, Sony ARW, Pentax PEF, Olympus ORF, Panasonic RW2. Some
// systems give HEIC files no type, and RAW files get no type or a vendor one (image/x-adobe-dng,
// image/x-canon-cr2, ...), so a file with no type, a generic one, or an image/x- one goes by its
// extension. Types are compared in lower case: Windows reports a DNG as "image/DNG".
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "image/dng"];
const PHOTO_EXTENSION = /\.(jpe?g|png|hei[cf]|webp|dng|cr2|nef|arw|pef|orf|rw2)$/i;

export function isPhotoFile({ name, type: rawType }: { name: string; type: string }) {
  const type = rawType.toLowerCase();
  if (PHOTO_TYPES.includes(type)) return true;
  const untyped = type === "" || type === "application/octet-stream" || type.startsWith("image/x-");
  return untyped && PHOTO_EXTENSION.test(name);
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
// Only the metadata part of the file is read (an iPhone ProRAW DNG is 25–75 MB): exifr reads a
// File by chunks (64 KB first, then only where the metadata points), and PNG and WebP are walked
// chunk header by chunk header to their EXIF chunk.
export async function readPhoto(file: Blob): Promise<PhotoInfo | null> {
  const exifr = await loadExifr();
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const container = isPng(head) ? "png" : isWebp(head) ? "webp" : null;
    if (!container) return photoInfo(await exifr.parse(file, EXIF_OPTIONS));
    const exif = await exifChunk(file, container);
    return exif ? photoInfo(await exifr.parse(exif, EXIF_OPTIONS)) : { location: null, taken: null };
  } catch {
    return null;
  }
}

// The photo's embedded EXIF thumbnail (a small JPEG that most cameras and phones write into a JPEG's
// EXIF), read by chunks like readPhoto, or null: none, or a format exifr can't take one from
// (HEIC, PNG, WebP, and DNG, whose preview isn't stored as an EXIF thumbnail).
export async function readThumbnail(file: Blob): Promise<Uint8Array | null> {
  const exifr = await loadExifr();
  try {
    const thumbnail = await exifr.thumbnail(file);
    // A copy, so it has a buffer of its own (the worker transfers it to the page).
    return thumbnail?.length ? new Uint8Array(thumbnail) : null;
  } catch {
    return null;
  }
}

let exifrModule: Promise<typeof import("exifr").default> | null = null;

// exifr, with the GPS fix below; loaded once (again after a failed load, e.g. offline).
export function loadExifr() {
  exifrModule ??= import("exifr").then(
    ({ default: exifr }) => {
      fixTiffGps(exifr.segmentParsers);
      return exifr;
    },
    (error) => {
      exifrModule = null;
      throw error;
    },
  );
  return exifrModule;
}

// exifr reads TIFF-based files (DNG, camera RAW) by chunks, and loads the part of the file under
// IFD0 and the Exif block before parsing them, but not the part under the GPS block, which it then
// misses without an error when it lies past what's been read (a Nikon NEF's sits about 160 KB in,
// past the first 64 KB). This subclass of its TIFF parser loads that part first, the same way.
type TiffParser = {
  ifd0?: unknown;
  gpsOffset?: number;
  file: { tiff?: boolean; ensureChunk: (offset: number, length: number) => Promise<void> };
  options: { chunkSize: number };
  parseIfd0Block(): Promise<unknown>;
  parseGpsBlock(): Promise<unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a mixin's base needs any[] args
type TiffParserClass = new (...args: any[]) => TiffParser;

function fixTiffGps(segmentParsers: Map<string, TiffParserClass>) {
  const Base = segmentParsers.get("tiff");
  if (!Base) return;
  segmentParsers.set(
    "tiff",
    class extends Base {
      async parseGpsBlock() {
        if (!this.ifd0) await this.parseIfd0Block();
        if (this.gpsOffset !== undefined && this.file.tiff) {
          await this.file.ensureChunk(this.gpsOffset, this.options.chunkSize);
        }
        return super.parseGpsBlock();
      }
    },
  );
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

const isPng = (head: Uint8Array) => ascii(head, 0, 8) === "\x89PNG\r\n\x1a\n";
const isWebp = (head: Uint8Array) => ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP";

// Chunk headers are read through 64 KB windows of the file, so files with small chunks take few
// reads and big chunks (the image data) are skipped without being read.
const WINDOW = 65536;

// The EXIF chunk's TIFF bytes (some writers put "Exif\0\0" in front), which exifr reads, or null
// when there's none. exifr doesn't read WebP, and in PNG it only finds an eXIf chunk inside what
// it has read, so one after the image data would be missed.
// - PNG: an 8-byte signature, then chunks of [length, big-endian][type][data][CRC], up to IEND.
// - WebP: "RIFF" [size] "WEBP", then chunks of [type][length, little-endian][data], each padded
//   to an even size.
async function exifChunk(file: Blob, container: "png" | "webp"): Promise<Uint8Array | null> {
  const png = container === "png";
  let window = { start: 0, bytes: new Uint8Array(0) };
  for (let at = png ? 8 : 12; at + 8 <= file.size; ) {
    if (at + 8 > window.start + window.bytes.length) {
      window = { start: at, bytes: new Uint8Array(await file.slice(at, at + WINDOW).arrayBuffer()) };
    }
    const header = new DataView(window.bytes.buffer, at - window.start, 8);
    const type = ascii(window.bytes, at - window.start + (png ? 4 : 0), 4);
    const size = png ? header.getUint32(0) : header.getUint32(4, true);
    if (type === (png ? "eXIf" : "EXIF")) {
      const data = new Uint8Array(await file.slice(at + 8, at + 8 + size).arrayBuffer());
      return ascii(data, 0, 6) === "Exif\0\0" ? data.subarray(6) : data;
    }
    if (type === "IEND") return null;
    at += 8 + size + (png ? 4 : size % 2);
  }
  return null;
}

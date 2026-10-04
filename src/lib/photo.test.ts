import { describe, expect, it } from "vitest";

import { formatTaken, isPhotoFile, photoInfo, photoVisited, readPhoto } from "@/lib/photo";

// Real EXIF bytes, so exifr itself runs: a little-endian TIFF with an Exif IFD (DateTimeOriginal,
// OffsetTimeOriginal) and a GPS IFD, wrapped as a JPEG APP1 segment, a PNG eXIf chunk, or a WebP
// EXIF chunk. No image data: exifr only reads the metadata.
const ASCII = 2;
const LONG = 4;
const RATIONAL = 5;

type Entry = [tag: number, type: number, value: string | number | [number, number][]];
type Dms = [number, number][];

function tiff({
  dateTime,
  offset,
  gps,
}: {
  dateTime?: string;
  offset?: string;
  gps?: { latRef: string; lat: Dms; lngRef: string; lng: Dms };
}) {
  const exif: Entry[] = [];
  if (dateTime) exif.push([0x9003, ASCII, `${dateTime}\0`]);
  if (offset) exif.push([0x9011, ASCII, `${offset}\0`]);
  const gpsEntries: Entry[] = gps
    ? [
        [1, ASCII, `${gps.latRef}\0`],
        [2, RATIONAL, gps.lat],
        [3, ASCII, `${gps.lngRef}\0`],
        [4, RATIONAL, gps.lng],
      ]
    : [];
  const ifdSize = (count: number) => 2 + count * 12 + 4;
  const pointers = Number(exif.length > 0) + Number(gpsEntries.length > 0);
  const ifd0At = 8;
  const exifAt = ifd0At + ifdSize(pointers);
  const gpsAt = exifAt + (exif.length ? ifdSize(exif.length) : 0);
  let dataAt = gpsAt + (gpsEntries.length ? ifdSize(gpsEntries.length) : 0);

  const bytes = new Uint8Array(dataAt + 256);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifd0At, true);

  function writeIfd(at: number, entries: Entry[]) {
    view.setUint16(at, entries.length, true);
    entries.forEach(([tag, type, value], i) => {
      const entry = at + 2 + i * 12;
      view.setUint16(entry, tag, true);
      view.setUint16(entry + 2, type, true);
      if (typeof value === "number") {
        view.setUint32(entry + 4, 1, true);
        view.setUint32(entry + 8, value, true);
      } else if (typeof value === "string") {
        view.setUint32(entry + 4, value.length, true);
        const target = value.length <= 4 ? entry + 8 : dataAt;
        bytes.set(Buffer.from(value, "latin1"), target);
        if (value.length > 4) {
          view.setUint32(entry + 8, dataAt, true);
          dataAt += value.length + (value.length % 2);
        }
      } else {
        view.setUint32(entry + 4, value.length, true);
        view.setUint32(entry + 8, dataAt, true);
        for (const [numerator, denominator] of value) {
          view.setUint32(dataAt, numerator, true);
          view.setUint32(dataAt + 4, denominator, true);
          dataAt += 8;
        }
      }
    });
    view.setUint32(at + 2 + entries.length * 12, 0, true);
  }

  const ifd0: Entry[] = [];
  if (exif.length) ifd0.push([0x8769, LONG, exifAt]);
  if (gpsEntries.length) ifd0.push([0x8825, LONG, gpsAt]);
  writeIfd(ifd0At, ifd0);
  if (exif.length) writeIfd(exifAt, exif);
  if (gpsEntries.length) writeIfd(gpsAt, gpsEntries);
  return bytes.slice(0, dataAt);
}

const concat = (...parts: (Uint8Array | number[] | string)[]) =>
  new Uint8Array(parts.flatMap((part) => [...(typeof part === "string" ? Buffer.from(part, "latin1") : part)]));

const u16be = (n: number) => [n >> 8, n & 255];
const u32be = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];

function jpeg(exif?: Uint8Array) {
  const app1 = exif ? concat([0xff, 0xe1], u16be(2 + 6 + exif.length), "Exif\0\0", exif) : [];
  return new Blob([concat([0xff, 0xd8], app1, [0xff, 0xd9])]);
}

function png(exif: Uint8Array) {
  const chunk = (type: string, data: Uint8Array | number[]) => concat(u32be(data.length), type, data, [0, 0, 0, 0]);
  const ihdr = concat(u32be(1), u32be(1), [8, 2, 0, 0, 0]);
  return new Blob([concat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], chunk("IHDR", ihdr), chunk("eXIf", exif), chunk("IEND", []))]);
}

function webp(exif: Uint8Array | null, exifHeader = false) {
  const chunk = (type: string, data: Uint8Array) => concat(type, u32le(data.length), data, data.length % 2 ? [0] : []);
  const vp8x = chunk("VP8X", new Uint8Array(10));
  const body = concat("WEBP", vp8x, exif ? chunk("EXIF", exifHeader ? concat("Exif\0\0", exif) : exif) : []);
  return new Blob([concat("RIFF", u32le(body.length), body)]);
}

// Shibuya crossing: 35°39'29.58" N, 139°42'0.6" E.
const TOKYO_GPS = {
  latRef: "N",
  lat: [[35, 1], [39, 1], [2958, 100]] as Dms,
  lngRef: "E",
  lng: [[139, 1], [42, 1], [60, 100]] as Dms,
};
const TOKYO = { lat: 35 + 39 / 60 + 29.58 / 3600, lng: 139 + 42 / 60 + 0.6 / 3600 };

describe("readPhoto", () => {
  it("reads GPS, the date, and its offset", async () => {
    const info = await readPhoto(jpeg(tiff({ dateTime: "2025:03:12 15:45:30", offset: "+09:00", gps: TOKYO_GPS })));
    expect(info?.location?.lat).toBeCloseTo(TOKYO.lat, 9);
    expect(info?.location?.lng).toBeCloseTo(TOKYO.lng, 9);
    expect(info?.taken).toEqual({ local: "2025-03-12T15:45:30", offset: "+09:00" });
  });

  it("reads GPS and a date without an offset", async () => {
    const info = await readPhoto(jpeg(tiff({ dateTime: "2025:03:12 15:45:30", gps: TOKYO_GPS })));
    expect(info?.location).not.toBeNull();
    expect(info?.taken).toEqual({ local: "2025-03-12T15:45:30", offset: null });
  });

  it("gives south and west coordinates negative signs", async () => {
    // Rio de Janeiro: 22°54'0" S, 43°10'0" W.
    const info = await readPhoto(
      jpeg(tiff({ gps: { latRef: "S", lat: [[22, 1], [54, 1], [0, 1]], lngRef: "W", lng: [[43, 1], [10, 1], [0, 1]] } })),
    );
    expect(info?.location?.lat).toBeCloseTo(-22.9, 9);
    expect(info?.location?.lng).toBeCloseTo(-(43 + 10 / 60), 9);
    expect(info?.taken).toBeNull();
  });

  it("has no location when there's no GPS, and keeps the date", async () => {
    expect(await readPhoto(jpeg(tiff({ dateTime: "2025:03:12 15:45:30", offset: "-04:00" })))).toEqual({
      location: null,
      taken: { local: "2025-03-12T15:45:30", offset: "-04:00" },
    });
  });

  it("has neither for a photo without any EXIF", async () => {
    expect(await readPhoto(jpeg())).toEqual({ location: null, taken: null });
  });

  it("reads a PNG's eXIf chunk", async () => {
    const info = await readPhoto(png(tiff({ dateTime: "2024:07:01 09:05:00", gps: TOKYO_GPS })));
    expect(info?.location?.lat).toBeCloseTo(TOKYO.lat, 9);
    expect(info?.taken).toEqual({ local: "2024-07-01T09:05:00", offset: null });
  });

  it("reads a WebP's EXIF chunk, with or without an Exif header", async () => {
    for (const header of [false, true]) {
      const info = await readPhoto(webp(tiff({ dateTime: "2024:07:01 09:05:00", offset: "+02:00", gps: TOKYO_GPS }), header));
      expect(info?.location?.lng).toBeCloseTo(TOKYO.lng, 9);
      expect(info?.taken).toEqual({ local: "2024-07-01T09:05:00", offset: "+02:00" });
    }
  });

  it("has neither for a WebP without an EXIF chunk", async () => {
    expect(await readPhoto(webp(null))).toEqual({ location: null, taken: null });
  });

  it("returns null for a file that isn't an image exifr knows", async () => {
    expect(await readPhoto(new Blob(["GIF89a not really"]))).toBeNull();
    expect(await readPhoto(new Blob(["hello, world"]))).toBeNull();
  });
});

describe("photoInfo", () => {
  it("treats 0,0 (no fix) and out-of-range coordinates as no location", () => {
    expect(photoInfo({ latitude: 0, longitude: 0 }).location).toBeNull();
    expect(photoInfo({ latitude: 91, longitude: 10 }).location).toBeNull();
    expect(photoInfo({ latitude: 10, longitude: Number.NaN }).location).toBeNull();
    expect(photoInfo({ latitude: 0, longitude: 10 }).location).toEqual({ lat: 0, lng: 10 });
    expect(photoInfo(undefined)).toEqual({ location: null, taken: null });
  });

  it("drops an unset or impossible date, and an offset in another format", () => {
    expect(photoInfo({ DateTimeOriginal: "0000:00:00 00:00:00" }).taken).toBeNull();
    expect(photoInfo({ DateTimeOriginal: "2025:02:30 10:00:00" }).taken).toBeNull();
    expect(photoInfo({ DateTimeOriginal: "2025-03-12T10:00:00" }).taken).toBeNull();
    expect(photoInfo({ DateTimeOriginal: "2025:03:12 15:45:61" }).taken).toBeNull();
    expect(photoInfo({ DateTimeOriginal: "" }).taken).toBeNull();
    expect(photoInfo({ DateTimeOriginal: " 2025:03:12 10:00:00 ", OffsetTimeOriginal: "+0900" }).taken).toEqual({
      local: "2025-03-12T10:00:00",
      offset: null,
    });
  });
});

describe("photoVisited", () => {
  it("uses the offset: the instant, as wall-clock time in the place's zone", () => {
    // Camera still on Paris summer time (+02:00) in Tokyo: 08:15 in Paris is 15:15 in Tokyo.
    expect(photoVisited({ local: "2025-07-12T08:15:30", offset: "+02:00" }, "Asia/Tokyo")).toEqual({
      value: "2025-07-12T15:15",
      precision: "datetime",
    });
    // Nepal's quarter-hour offset.
    expect(photoVisited({ local: "2025-03-12T15:45:30", offset: "+05:45" }, "UTC")?.value).toBe("2025-03-12T10:00");
    // Across midnight and the date line.
    expect(photoVisited({ local: "2025-03-12T22:30:00", offset: "-04:00" }, "Pacific/Auckland")).toEqual({
      value: "2025-03-13T15:30",
      precision: "datetime",
    });
  });

  it("without an offset, takes the camera's time as the place's local time", () => {
    for (const zone of ["Asia/Tokyo", "America/New_York", "UTC"]) {
      expect(photoVisited({ local: "2025-03-12T15:45:59", offset: null }, zone)).toEqual({
        value: "2025-03-12T15:45",
        precision: "datetime",
      });
    }
  });

  it("is null (now) without a date", () => {
    expect(photoVisited(null, "Asia/Tokyo")).toBeNull();
  });
});

describe("formatTaken", () => {
  it("shows the camera's time as written", () => {
    expect(formatTaken({ local: "2025-03-12T15:45:30", offset: "+09:00" })).toBe("Mar 12, 2025, 3:45 PM");
  });
});

describe("isPhotoFile", () => {
  it("accepts JPEG, PNG, HEIC, and WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]) {
      expect(isPhotoFile({ name: "photo", type })).toBe(true);
    }
  });

  it("goes by the extension when the type is missing or generic", () => {
    expect(isPhotoFile({ name: "IMG_0001.HEIC", type: "" })).toBe(true);
    expect(isPhotoFile({ name: "IMG_0001.jpeg", type: "application/octet-stream" })).toBe(true);
    expect(isPhotoFile({ name: "notes.txt", type: "" })).toBe(false);
  });

  it("rejects anything else", () => {
    expect(isPhotoFile({ name: "cat.gif", type: "image/gif" })).toBe(false);
    expect(isPhotoFile({ name: "scan.pdf", type: "application/pdf" })).toBe(false);
    expect(isPhotoFile({ name: "clip.mov", type: "video/quicktime" })).toBe(false);
    // The extension only counts without a real type.
    expect(isPhotoFile({ name: "fake.jpg", type: "text/plain" })).toBe(false);
  });
});

// Real EXIF bytes for tests, so exifr itself runs: a little-endian TIFF with an Exif IFD
// (DateTimeOriginal, OffsetTimeOriginal) and a GPS IFD, wrapped as a JPEG APP1 segment, a PNG eXIf
// chunk, or a WebP EXIF chunk. No image data: exifr only reads the metadata. `orientation` adds
// IFD0's Orientation tag; `thumbnail` adds an IFD1 holding those bytes as the embedded JPEG
// thumbnail.
const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

type Entry = [tag: number, type: number, value: string | number | [number, number][]];
export type Dms = [number, number][];

export function tiff({
  dateTime,
  offset,
  gps,
  orientation,
  thumbnail,
}: {
  dateTime?: string;
  offset?: string;
  gps?: { latRef: string; lat: Dms; lngRef: string; lng: Dms };
  orientation?: number;
  thumbnail?: Uint8Array;
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
  const pointers = Number(orientation !== undefined) + Number(exif.length > 0) + Number(gpsEntries.length > 0);
  const ifd0At = 8;
  const exifAt = ifd0At + ifdSize(pointers);
  const gpsAt = exifAt + (exif.length ? ifdSize(exif.length) : 0);
  let dataAt = gpsAt + (gpsEntries.length ? ifdSize(gpsEntries.length) : 0);

  const bytes = new Uint8Array(dataAt + 256 + 64 + (thumbnail?.length ?? 0));
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
  // A SHORT fits in the entry's value field, little-endian, like the LONGs.
  if (orientation !== undefined) ifd0.push([0x0112, SHORT, orientation]);
  if (exif.length) ifd0.push([0x8769, LONG, exifAt]);
  if (gpsEntries.length) ifd0.push([0x8825, LONG, gpsAt]);
  writeIfd(ifd0At, ifd0);
  if (exif.length) writeIfd(exifAt, exif);
  if (gpsEntries.length) writeIfd(gpsAt, gpsEntries);
  if (thumbnail) {
    const ifd1At = dataAt + (dataAt % 2);
    const thumbAt = ifd1At + ifdSize(3);
    dataAt = thumbAt;
    writeIfd(ifd1At, [
      [0x0103, LONG, 6], // Compression: JPEG
      [0x0201, LONG, thumbAt], // JPEGInterchangeFormat
      [0x0202, LONG, thumbnail.length], // JPEGInterchangeFormatLength
    ]);
    view.setUint32(ifd0At + 2 + ifd0.length * 12, ifd1At, true);
    bytes.set(thumbnail, thumbAt);
    dataAt += thumbnail.length;
  }
  return bytes.slice(0, dataAt);
}

const concat = (...parts: (Uint8Array | number[] | string)[]) =>
  new Uint8Array(parts.flatMap((part) => [...(typeof part === "string" ? Buffer.from(part, "latin1") : part)]));

const u16be = (n: number) => [n >> 8, n & 255];
const u32be = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];

export function jpeg(exif?: Uint8Array) {
  const app1 = exif ? concat([0xff, 0xe1], u16be(2 + 6 + exif.length), "Exif\0\0", exif) : [];
  return new Blob([concat([0xff, 0xd8], app1, [0xff, 0xd9])]);
}

// imageData: the sizes of image-data chunks (IDAT, or WebP's VP8) to put before the EXIF chunk, as
// encoders that write metadata last do.
export function png(exif: Uint8Array, { imageData = [] as number[] } = {}) {
  const chunk = (type: string, data: Uint8Array<ArrayBuffer>) => [concat(u32be(data.length), type), data, new Uint8Array(4)];
  const ihdr = concat(u32be(1), u32be(1), [8, 2, 0, 0, 0]);
  return new Blob([
    concat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunk("IHDR", ihdr),
    ...imageData.flatMap((size) => chunk("IDAT", new Uint8Array(size))),
    ...chunk("eXIf", new Uint8Array(exif)),
    ...chunk("IEND", new Uint8Array(0)),
  ]);
}

export function webp(exif: Uint8Array | null, exifHeader = false, { imageData = [] as number[] } = {}) {
  const chunk = (type: string, data: Uint8Array<ArrayBuffer>) => [concat(type, u32le(data.length)), data, new Uint8Array(data.length % 2)];
  const parts = [
    ...chunk("VP8X", new Uint8Array(10)),
    ...imageData.flatMap((size) => chunk("VP8 ", new Uint8Array(size))),
    ...(exif ? chunk("EXIF", exifHeader ? concat("Exif\0\0", exif) : new Uint8Array(exif)) : []),
  ];
  const size = 4 + parts.reduce((sum, part) => sum + part.length, 0);
  return new Blob([concat("RIFF", u32le(size), "WEBP"), ...parts]);
}

// A TIFF-based RAW (DNG, CR2, NEF, ...): the metadata at the start, then `size` bytes in all, the
// rest standing in for the image data.
export function raw(tiffBytes: Uint8Array, size: number) {
  return new Blob([new Uint8Array(tiffBytes), new Uint8Array(size - tiffBytes.length)]);
}

// A little-endian TIFF whose GPS block sits at `gpsAt`, far past its IFD0 and Exif block (a Nikon
// NEF's is about 160 KB in), with a date in the Exif block and Tokyo in the GPS block.
export function farGpsTiff(gpsAt: number, size: number) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
  };
  bytes.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  entry(10, 0x8769, LONG, 1, 100);
  entry(22, 0x8825, LONG, 1, gpsAt);
  view.setUint16(100, 1, true);
  entry(102, 0x9003, ASCII, 20, 200);
  bytes.set(Buffer.from("2025:03:12 15:45:30\0", "latin1"), 200);
  const data = gpsAt + 2 + 4 * 12 + 4;
  view.setUint16(gpsAt, 4, true);
  entry(gpsAt + 2, 1, ASCII, 2, 0x4e); // "N"
  entry(gpsAt + 14, 2, RATIONAL, 3, data);
  entry(gpsAt + 26, 3, ASCII, 2, 0x45); // "E"
  entry(gpsAt + 38, 4, RATIONAL, 3, data + 24);
  [...TOKYO_GPS.lat, ...TOKYO_GPS.lng].flat().forEach((n, i) => view.setUint32(data + i * 4, n, true));
  return new Blob([bytes]);
}

// A Blob that counts what's read from it: bytes through slice(), and whole-file reads.
export class CountingBlob extends Blob {
  sliced = 0;
  wholeReads = 0;

  slice(start = 0, end = this.size, contentType?: string) {
    this.sliced += Math.max(0, Math.min(end, this.size) - start);
    return super.slice(start, end, contentType);
  }

  arrayBuffer() {
    this.wholeReads++;
    return super.arrayBuffer();
  }
}

// Shibuya crossing: 35°39'29.58" N, 139°42'0.6" E.
export const TOKYO_GPS = {
  latRef: "N",
  lat: [[35, 1], [39, 1], [2958, 100]] as Dms,
  lngRef: "E",
  lng: [[139, 1], [42, 1], [60, 100]] as Dms,
};
export const TOKYO = { lat: 35 + 39 / 60 + 29.58 / 3600, lng: 139 + 42 / 60 + 0.6 / 3600 };

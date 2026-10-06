import "@/test/file-reader";

import { describe, expect, it } from "vitest";

import { formatTaken, isPhotoFile, photoInfo, photoVisited, readPhoto, readThumbnail } from "@/lib/photo";
import { CountingBlob, farGpsTiff, jpeg, png, raw, tiff, TOKYO, TOKYO_GPS, webp } from "@/test/exif";

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
    expect(isPhotoFile({ name: "fake.dng", type: "text/plain" })).toBe(false);
  });

  it("accepts DNG (iPhone ProRAW) by type, in any case, and by extension", () => {
    // Windows reports "image/DNG"; others "image/dng", "image/x-adobe-dng", or nothing.
    for (const type of ["image/DNG", "image/dng", "image/x-adobe-dng", "", "application/octet-stream"]) {
      expect(isPhotoFile({ name: "IMG_0001.DNG", type })).toBe(true);
    }
    expect(isPhotoFile({ name: "IMG_0001.JPG", type: "IMAGE/JPEG" })).toBe(true);
  });

  it("accepts the TIFF-based camera RAW formats by extension, with no type or a vendor one", () => {
    for (const [name, type] of [
      ["5G4A9394.CR2", "image/x-canon-cr2"],
      ["DSC_0001.NEF", "image/x-nikon-nef"],
      ["DSC00001.ARW", ""],
      ["IMGP8550.PEF", "image/x-pentax-pef"],
      ["P1000475.RW2", "application/octet-stream"],
      ["sc000877.orf", "image/x-olympus-orf"],
    ]) {
      expect(isPhotoFile({ name, type })).toBe(true);
    }
  });

  it("rejects RAW formats exifr can't read (they aren't TIFF-based)", () => {
    expect(isPhotoFile({ name: "IMG_6310.CR3", type: "" })).toBe(false);
    expect(isPhotoFile({ name: "DSCF0001.RAF", type: "image/x-fuji-raf" })).toBe(false);
  });
});

describe("RAW photos", () => {
  const dngTiff = tiff({ dateTime: "2025:03:12 15:45:30", offset: "+09:00", gps: TOKYO_GPS });

  it("reads a DNG's GPS and date, reading only its start (a ProRAW file is 25–75 MB)", async () => {
    const file = new CountingBlob([raw(dngTiff, 30_000_000)]);
    const info = await readPhoto(file);
    expect(info?.location?.lat).toBeCloseTo(TOKYO.lat, 9);
    expect(info?.location?.lng).toBeCloseTo(TOKYO.lng, 9);
    expect(info?.taken).toEqual({ local: "2025-03-12T15:45:30", offset: "+09:00" });
    expect(file.wholeReads).toBe(0);
    expect(file.sliced).toBeLessThanOrEqual(160 * 1024);
  });

  it("finds a GPS block that lies past the first chunk (exifr alone misses it)", async () => {
    for (const gpsAt of [70_028, 161_086, 2_000_000]) {
      const file = new CountingBlob([farGpsTiff(gpsAt, 3_000_000)]);
      const info = await readPhoto(file);
      expect(info?.location?.lat).toBeCloseTo(35 + 39 / 60 + 29.58 / 3600, 9);
      expect(info?.taken?.local).toBe("2025-03-12T15:45:30");
      expect(file.sliced).toBeLessThan(300 * 1024);
    }
  });
});

describe("partial reads", () => {
  const exif = tiff({ dateTime: "2025:03:12 15:45:30", gps: TOKYO_GPS });

  it("reads only a large JPEG's first chunk", async () => {
    const file = new CountingBlob([jpeg(exif), new Uint8Array(20_000_000)]);
    expect((await readPhoto(file))?.location?.lat).toBeCloseTo(TOKYO.lat, 9);
    expect(file.wholeReads).toBe(0);
    expect(file.sliced).toBeLessThanOrEqual(65_536 + 12);
  });

  it("skips a PNG's or WebP's image data to reach an EXIF chunk after it", async () => {
    for (const file of [
      new CountingBlob([png(exif, { imageData: [8_000_000] })]),
      new CountingBlob([webp(exif, false, { imageData: [8_000_000] })]),
    ]) {
      expect((await readPhoto(file))?.location?.lat).toBeCloseTo(TOKYO.lat, 9);
      expect(file.wholeReads).toBe(0);
      expect(file.sliced).toBeLessThan(200 * 1024);
    }
  });

  it("walks many small chunks without reading the whole file at once", async () => {
    const file = new CountingBlob([png(exif, { imageData: Array(300).fill(8192) })]);
    expect((await readPhoto(file))?.location?.lat).toBeCloseTo(TOKYO.lat, 9);
    expect(file.wholeReads).toBe(0);
  });

  it("gives up on a PNG whose eXIf chunk is empty", async () => {
    const file = new CountingBlob([png(new Uint8Array(0), { imageData: [100_000] })]);
    expect(await readPhoto(file)).toBeNull();
  });
});

describe("readThumbnail", () => {
  // Stand-in JPEG bytes: exifr hands back whatever the EXIF thumbnail tags point at.
  const thumb = new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5, 6, 7, 8, 0xff, 0xd9]);

  it("returns a JPEG's embedded EXIF thumbnail, reading only its first chunk", async () => {
    const file = new CountingBlob([jpeg(tiff({ dateTime: "2025:03:12 15:45:30", thumbnail: thumb })), new Uint8Array(10_000_000)]);
    expect(await readThumbnail(file)).toEqual(thumb);
    expect(file.wholeReads).toBe(0);
    expect(file.sliced).toBeLessThanOrEqual(65_536);
  });

  it("is null without one: no thumbnail, a DNG, a PNG, or not a photo", async () => {
    expect(await readThumbnail(jpeg(tiff({ dateTime: "2025:03:12 15:45:30" })))).toBeNull();
    expect(await readThumbnail(jpeg())).toBeNull();
    expect(await readThumbnail(raw(tiff({ gps: TOKYO_GPS }), 1_000_000))).toBeNull();
    expect(await readThumbnail(png(tiff({ gps: TOKYO_GPS })))).toBeNull();
    expect(await readThumbnail(new Blob(["hello"]))).toBeNull();
  });
});

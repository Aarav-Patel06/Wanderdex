import "@/test/file-reader";

import tzLookup from "@photostructure/tz-lookup";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST_BATCH } from "@/lib/trip/config";
import type { TripPlan } from "@/lib/trip/group";
import { collectFiles, handleReadRequest, type ReadMessage } from "@/lib/trip/pipeline";
import { type PhotoRead, photoRead, readAll, readSummary, readTripPhoto } from "@/lib/trip/read";
import { type ReadWorker, readTripPhotos } from "@/lib/trip/read-client";
import { CountingBlob, jpeg, raw, tiff, TOKYO, TOKYO_GPS } from "@/test/exif";

const photo = (blob: Blob, name = "IMG_0001.JPG", type = "image/jpeg") => new File([blob], name, { type });
const NEW_YORK = { lat: 40.758, lng: -73.9855 };

describe("photoRead", () => {
  const zoneAt = vi.fn(tzLookup);

  it("uses the offset's instant when the camera wrote one", () => {
    const read = photoRead({ location: TOKYO, taken: { local: "2025-03-12T15:45:30", offset: "+02:00" } }, zoneAt);
    expect(read).toEqual({ status: "ok", location: TOKYO, instant: Date.parse("2025-03-12T13:45:30Z") });
  });

  it("without an offset, reads the time in the zone at the photo's coordinates", () => {
    zoneAt.mockClear();
    expect(photoRead({ location: TOKYO, taken: { local: "2025-03-12T15:45:30", offset: null } }, zoneAt)).toEqual({
      status: "ok",
      location: TOKYO,
      instant: Date.parse("2025-03-12T06:45:30Z"),
    });
    expect(zoneAt).toHaveBeenCalledWith(TOKYO.lat, TOKYO.lng);
    // New York on summer time (UTC−4), then on standard time (UTC−5).
    const summer = photoRead({ location: NEW_YORK, taken: { local: "2025-07-04T21:00:00", offset: null } }, zoneAt);
    const winter = photoRead({ location: NEW_YORK, taken: { local: "2025-01-04T21:00:00", offset: null } }, zoneAt);
    expect(summer).toMatchObject({ instant: Date.parse("2025-07-05T01:00:00Z") });
    expect(winter).toMatchObject({ instant: Date.parse("2025-01-05T02:00:00Z") });
  });

  it("sorts out photos it can't use", () => {
    expect(photoRead(null, zoneAt)).toEqual({ status: "unreadable" });
    expect(photoRead({ location: null, taken: { local: "2025-03-12T15:45:30", offset: null } }, zoneAt)).toEqual({
      status: "no_location",
    });
    expect(photoRead({ location: null, taken: null }, zoneAt)).toEqual({ status: "no_location" });
    expect(photoRead({ location: TOKYO, taken: null }, zoneAt)).toEqual({ status: "no_date", location: TOKYO });
  });
});

describe("readTripPhoto", () => {
  it("reads a photo's GPS and date with Upload Photo's rules", async () => {
    const file = photo(jpeg(tiff({ dateTime: "2025:03:12 15:45:30", offset: "+09:00", gps: TOKYO_GPS })));
    const read = await readTripPhoto(file, tzLookup);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.location.lat).toBeCloseTo(TOKYO.lat, 9);
    expect(read.instant).toBe(Date.parse("2025-03-12T06:45:30Z"));
  });

  it("counts other file types and files exifr can't parse as unreadable", async () => {
    expect(await readTripPhoto(photo(new Blob(["GIF89a"]), "cat.gif", "image/gif"), tzLookup)).toEqual({
      status: "unreadable",
    });
    expect(await readTripPhoto(photo(new Blob(["not a jpeg"])), tzLookup)).toEqual({ status: "unreadable" });
  });

  it("is never thrown out of: a file that can't be read is unreadable", async () => {
    const broken = photo(new Blob([]));
    broken.slice = () => ({ arrayBuffer: () => Promise.reject(new Error("NotReadableError")) }) as Blob;
    expect(await readTripPhoto(broken, tzLookup)).toEqual({ status: "unreadable" });
  });

  it("reads an iPhone ProRAW DNG, as Windows types it, from its first chunks only", async () => {
    const bytes = new CountingBlob([raw(tiff({ dateTime: "2025:03:12 15:45:30", offset: "+09:00", gps: TOKYO_GPS }), 40_000_000)]);
    const file = new File([bytes], "IMG_0001.DNG", { type: "image/DNG" });
    // The File wraps the counted bytes; count through its own slice.
    let sliced = 0;
    const slice = file.slice.bind(file);
    file.slice = (start = 0, end = file.size) => ((sliced += Math.min(end, file.size) - start), slice(start, end));
    file.arrayBuffer = () => Promise.reject(new Error("read the whole file"));
    expect(await readTripPhoto(file, tzLookup)).toMatchObject({ status: "ok", instant: Date.parse("2025-03-12T06:45:30Z") });
    expect(sliced).toBeLessThanOrEqual(160 * 1024);
  });
});

describe("readAll", () => {
  it("keeps the items' order, reads at most `concurrency` at once, and reports each one done", async () => {
    let active = 0;
    let most = 0;
    const progress: number[] = [];
    const delays = [30, 5, 20, 1, 10, 15, 2];
    const results = await readAll(
      delays,
      async (ms) => {
        most = Math.max(most, ++active);
        await new Promise((resolve) => setTimeout(resolve, ms));
        active--;
        return ms * 2;
      },
      3,
      (done) => progress.push(done),
    );
    expect(results).toEqual(delays.map((ms) => ms * 2));
    expect(most).toBe(3);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("handles fewer items than lanes, and none", async () => {
    expect(await readAll([1], async (n) => n, 4, () => {})).toEqual([1]);
    expect(await readAll([], async (n) => n, 4, () => {})).toEqual([]);
  });
});

describe("handleReadRequest", () => {
  const thumb = new Uint8Array([0xff, 0xd8, 9, 9, 0xff, 0xd9]);
  const files = [
    photo(jpeg(tiff({ dateTime: "2025:03:12 16:00:00", gps: TOKYO_GPS }))),
    photo(jpeg(tiff({ dateTime: "2025:03:12 16:00:00" }))),
    photo(new Blob(["hello"]), "notes.txt", "text/plain"),
    photo(jpeg(tiff({ gps: TOKYO_GPS }))),
    // Earlier, at the same spot: the stop's first photo, so its thumbnail is the stop's.
    photo(jpeg(tiff({ dateTime: "2025:03:12 15:45:30", gps: TOKYO_GPS, thumbnail: thumb }))),
  ];

  async function run(concurrency: number) {
    const posted: ReadMessage[] = [];
    await handleReadRequest(files, (message) => posted.push(message), tzLookup, concurrency);
    return posted;
  }

  it("posts progress after each photo, then the stops and each stop's thumbnail", async () => {
    const posted = await run(2);
    expect(posted.slice(0, 5)).toEqual([1, 2, 3, 4, 5].map((done) => ({ type: "progress", done, total: 5 })));
    expect(posted).toHaveLength(6);
    const last = posted.at(-1);
    if (last?.type !== "done") throw new Error("no result");
    expect(last.plan).toMatchObject({ kind: "stops", skipped: { noLocationOrDate: 2, unreadable: 1 } });
    if (last.plan.kind !== "stops") return;
    expect(last.plan.stops).toHaveLength(1);
    expect(last.plan.stops[0]).toMatchObject({
      number: 1,
      photos: [4, 0],
      instant: Date.parse("2025-03-12T06:45:30Z"),
      timezone: "Asia/Tokyo",
      localDate: "2025-03-12",
    });
    expect(last.thumbnails).toEqual([{ bytes: thumb, orientation: 1 }]);
  });

  it("sends back only coordinates, times, counts, and thumbnails, never file data", async () => {
    const done = (await run(4)).at(-1);
    if (done?.type !== "done" || done.plan.kind !== "stops") throw new Error("no stops");
    const values = done.plan.stops.flatMap((stop) => Object.values(stop));
    expect(values.some((value) => value instanceof Blob || ArrayBuffer.isView(value))).toBe(false);
    expect(Object.keys(done.plan.stops[0]).sort()).toEqual(["instant", "lat", "lng", "localDate", "number", "photos", "timezone"]);
  });

  it("reports why there are no stops, with no thumbnails", async () => {
    const posted: ReadMessage[] = [];
    await handleReadRequest(files.slice(1, 4), (message) => posted.push(message), tzLookup, 2);
    expect(posted.at(-1)).toEqual({
      type: "done",
      plan: { kind: "no_usable", skipped: { noLocationOrDate: 2, unreadable: 1 } },
      thumbnails: [],
    });
  });
});

describe("collectFiles", () => {
  it("calls back once, with every file in the order sent, when the last batch arrives", () => {
    const files = Array.from({ length: 5 }, (_, i) => photo(new Blob([String(i)]), `${i}.jpg`));
    const onAll = vi.fn();
    const collect = collectFiles(onAll);
    collect({ files: files.slice(0, 2), total: 5 });
    collect({ files: files.slice(2, 4), total: 5 });
    expect(onAll).not.toHaveBeenCalled();
    collect({ files: files.slice(4), total: 5 });
    expect(onAll).toHaveBeenCalledExactlyOnceWith(files);
  });

  it("handles an empty pick", () => {
    const onAll = vi.fn();
    collectFiles(onAll)({ files: [], total: 0 });
    expect(onAll).toHaveBeenCalledWith([]);
  });
});

describe("readSummary", () => {
  it("counts each kind; with location includes the photos without a date", () => {
    const reads: PhotoRead[] = [
      { status: "ok", location: TOKYO, instant: 1 },
      { status: "ok", location: TOKYO, instant: 2 },
      { status: "no_date", location: TOKYO },
      { status: "no_location" },
      { status: "no_location" },
      { status: "no_location" },
      { status: "unreadable" },
    ];
    expect(readSummary(reads)).toEqual({ selected: 7, withLocation: 3, noDate: 1, noLocation: 3, unreadable: 1 });
    expect(readSummary([])).toEqual({ selected: 0, withLocation: 0, noDate: 0, noLocation: 0, unreadable: 0 });
  });
});

// A stand-in for the Worker: the test plays the worker's side by calling `send` and `fail`.
function fakeWorker() {
  const worker: ReadWorker & { sent: unknown[]; terminated: boolean } = {
    sent: [],
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage(request) {
      this.sent.push(request);
    },
    terminate() {
      this.terminated = true;
    },
  };
  return {
    worker,
    send: (data: ReadMessage) => worker.onmessage?.({ data } as MessageEvent<ReadMessage>),
    fail: (message: string) => worker.onerror?.({ message } as ErrorEvent),
  };
}

describe("readTripPhotos", () => {
  const files = [photo(new Blob(["a"])), photo(new Blob(["b"]))];
  afterEach(() => vi.useRealTimers());
  // Runs exactly one pending task (timer), then what it set off.
  async function nextTask() {
    vi.advanceTimersToNextTimer();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  it("hands the files to the worker, passes on its progress, and resolves with its results", async () => {
    const { worker, send } = fakeWorker();
    const progress: [number, number][] = [];
    const reading = readTripPhotos(files, (done, total) => progress.push([done, total]), () => worker);
    await vi.waitFor(() => expect(worker.sent).toEqual([{ files, total: 2 }]));
    send({ type: "progress", done: 1, total: 2 });
    send({ type: "progress", done: 2, total: 2 });
    expect(worker.terminated).toBe(false);
    const plan: TripPlan = { kind: "no_usable", skipped: { noLocationOrDate: 1, unreadable: 1 } };
    send({ type: "done", plan, thumbnails: [] });
    await expect(reading.result).resolves.toEqual({ plan, thumbnails: [] });
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(worker.terminated).toBe(true);
  });

  it("rejects, and stops the worker, when the photo reader didn't load", async () => {
    const { worker, send } = fakeWorker();
    const reading = readTripPhotos(files, () => {}, () => worker);
    send({ type: "error" });
    await expect(reading.result).rejects.toThrow("photo reader");
    expect(worker.terminated).toBe(true);
  });

  it("rejects, and stops the worker, when the worker itself fails", async () => {
    const { worker, fail } = fakeWorker();
    const reading = readTripPhotos(files, () => {}, () => worker);
    fail("Failed to fetch the worker script");
    await expect(reading.result).rejects.toThrow("Failed to fetch the worker script");
    expect(worker.terminated).toBe(true);
  });

  it("cancel stops the worker", () => {
    const { worker } = fakeWorker();
    readTripPhotos(files, () => {}, () => worker).cancel();
    expect(worker.terminated).toBe(true);
  });

  it("sends the files in batches, one per task, so the page is never held for long", async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: POST_BATCH * 2 + 3 }, (_, i) => photo(new Blob([String(i)]), `${i}.jpg`));
    const { worker } = fakeWorker();
    readTripPhotos(many, () => {}, () => worker);
    // Each batch, the first too, waits for a task of its own.
    expect(worker.sent).toHaveLength(0);
    await nextTask();
    expect(worker.sent).toEqual([{ files: many.slice(0, POST_BATCH), total: many.length }]);
    await nextTask();
    expect(worker.sent).toHaveLength(2);
    await nextTask();
    expect(worker.sent).toEqual([
      { files: many.slice(0, POST_BATCH), total: many.length },
      { files: many.slice(POST_BATCH, POST_BATCH * 2), total: many.length },
      { files: many.slice(POST_BATCH * 2), total: many.length },
    ]);
  });

  it("stops sending batches once cancelled", async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: POST_BATCH * 3 }, (_, i) => photo(new Blob([String(i)]), `${i}.jpg`));
    const { worker } = fakeWorker();
    const reading = readTripPhotos(many, () => {}, () => worker);
    await nextTask();
    reading.cancel();
    await vi.runAllTimersAsync();
    expect(worker.sent).toHaveLength(1);
  });

  it("works end to end with the worker's own handler", async () => {
    const { worker, send } = fakeWorker();
    worker.postMessage = collectFiles((all) => void handleReadRequest(all, send, tzLookup, 2));
    const reading = readTripPhotos(
      [photo(jpeg(tiff({ dateTime: "2025:03:12 15:45:30", offset: "+09:00", gps: TOKYO_GPS }))), photo(jpeg())],
      () => {},
      () => worker,
    );
    const { plan, thumbnails } = await reading.result;
    expect(plan).toMatchObject({ kind: "stops", skipped: { noLocationOrDate: 1, unreadable: 0 } });
    expect(plan.kind === "stops" && plan.stops.map((stop) => stop.photos)).toEqual([[0]]);
    expect(thumbnails).toEqual([null]);
  });
});

import { describe, expect, it } from "vitest";

import { type ThumbnailJob, thumbnailer, type ThumbnailWorker } from "@/lib/trip/thumbnails";

// A stand-in worker that keeps the jobs it's sent; answer() replies to one.
function fakeWorkers() {
  const started: (ThumbnailWorker & { jobs: ThumbnailJob[]; terminated: boolean })[] = [];
  const create = () => {
    const worker = {
      jobs: [] as ThumbnailJob[],
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage(job: ThumbnailJob) {
        this.jobs.push(job);
      },
      terminate() {
        this.terminated = true;
      },
    } satisfies ThumbnailWorker & { jobs: ThumbnailJob[]; terminated: boolean };
    started.push(worker);
    return worker;
  };
  const answer = (job: ThumbnailJob, thumbnail: Blob | null, worker = started.at(-1)!) =>
    worker.onmessage?.({ data: { id: job.id, thumbnail } } as MessageEvent);
  return { started, create, answer };
}

const photo = (name: string) => new File([name], name, { type: "image/heic" });
const settled = async <T,>(promise: Promise<T>) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve("pending")))]);

describe("thumbnailer", () => {
  it("starts no worker until a thumbnail is asked for", () => {
    const { started, create } = fakeWorkers();
    thumbnailer(create, 2);
    expect(started).toHaveLength(0);
  });

  it("sends at most `concurrency` photos to one worker at a time, in the order asked", async () => {
    const { started, create, answer } = fakeWorkers();
    const thumbnails = thumbnailer(create, 2);
    const requests = ["a", "b", "c", "d"].map((name) => thumbnails.request(photo(name)));
    expect(started).toHaveLength(1);
    const [worker] = started;
    expect(worker.jobs.map((job) => job.file.name)).toEqual(["a", "b"]);

    const made = new Blob(["jpeg"], { type: "image/jpeg" });
    answer(worker.jobs[1], made);
    expect(await requests[1].result).toBe(made);
    expect(worker.jobs.map((job) => job.file.name)).toEqual(["a", "b", "c"]);
    // null: the browser couldn't decode it.
    answer(worker.jobs[0], null);
    expect(await requests[0].result).toBeNull();
    expect(worker.jobs.map((job) => job.file.name)).toEqual(["a", "b", "c", "d"]);
  });

  it("drops a request still waiting when it's cancelled, but lets one being decoded finish", async () => {
    const { started, create, answer } = fakeWorkers();
    const thumbnails = thumbnailer(create, 1);
    const first = thumbnails.request(photo("a"));
    const second = thumbnails.request(photo("b"));
    const third = thumbnails.request(photo("c"));
    expect(second.cancel()).toBe(true);
    expect(first.cancel()).toBe(false);
    const [worker] = started;
    answer(worker.jobs[0], null);
    expect(await first.result).toBeNull();
    expect(worker.jobs.map((job) => job.file.name)).toEqual(["a", "c"]);
    expect(await settled(second.result)).toBe("pending");
    expect(third.cancel()).toBe(false);
  });

  it("stops its worker and drops every request on stop, and starts a new worker after", () => {
    const { started, create } = fakeWorkers();
    const thumbnails = thumbnailer(create, 1);
    thumbnails.request(photo("a"));
    thumbnails.request(photo("b"));
    thumbnails.stop();
    expect(started[0].terminated).toBe(true);
    thumbnails.request(photo("c"));
    expect(started).toHaveLength(2);
    expect(started[1].jobs.map((job) => job.file.name)).toEqual(["c"]);
  });

  it("answers null for everything asked of a worker that fails", async () => {
    const { started, create } = fakeWorkers();
    const thumbnails = thumbnailer(create, 1);
    const requests = [thumbnails.request(photo("a")), thumbnails.request(photo("b"))];
    started[0].onerror?.(new Event("error"));
    expect(await Promise.all(requests.map((request) => request.result))).toEqual([null, null]);
    expect(started[0].terminated).toBe(true);
  });
});

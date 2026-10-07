import { THUMBNAIL_CONCURRENCY } from "@/lib/trip/config";

// Review thumbnails made from the photo itself (SPEC §11.8 step 7), for stops whose first photo
// has no EXIF thumbnail (phone HEICs, PNGs, WebPs, JPEGs without one). The review asks for one
// only while its card is near the viewport; the thumbnail worker (thumbnail-worker.ts) decodes
// them, a few at a time, off the page's thread. Everything stays in the browser: the file goes to
// the worker and a small JPEG comes back, for an object URL.

// The protocol: the page sends one photo per job; the worker answers each with its thumbnail, or
// null when the browser can't decode the photo (DNG, or HEIC outside Safari).
export type ThumbnailJob = { id: number; file: File };
export type ThumbnailDone = { id: number; thumbnail: Blob | null };

// The parts of a Worker used here, so tests can stand in for one.
export type ThumbnailWorker = {
  postMessage: (job: ThumbnailJob) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<ThumbnailDone>) => void) | null;
  onerror: ((event: Event) => void) | null;
};

export type ThumbnailRequest = {
  // The thumbnail, or null. Never settles if the request is dropped or the thumbnailer stopped.
  result: Promise<Blob | null>;
  // Drops the request if it's still waiting (true); one already decoding finishes (false).
  cancel: () => boolean;
};

export type Thumbnailer = {
  request: (file: File) => ThumbnailRequest;
  // Stops the worker and drops every request. A later request starts a new worker.
  stop: () => void;
};

const startWorker = () =>
  new Worker(new URL("./thumbnail-worker.ts", import.meta.url), { type: "module" }) as unknown as ThumbnailWorker;

// Requests wait in order, and at most `concurrency` go to the worker at once. The worker starts
// with the first request, so a review whose stops all have EXIF thumbnails never loads it.
export function thumbnailer(
  createWorker: () => ThumbnailWorker = startWorker,
  concurrency = THUMBNAIL_CONCURRENCY,
): Thumbnailer {
  type Pending = ThumbnailJob & { resolve: (thumbnail: Blob | null) => void };
  let worker: ThumbnailWorker | null = null;
  let waiting: Pending[] = [];
  let running = new Map<number, Pending>();
  let nextId = 0;

  function finish(id: number, thumbnail: Blob | null) {
    running.get(id)?.resolve(thumbnail);
    running.delete(id);
    next();
  }

  function next() {
    while (running.size < concurrency && waiting.length > 0) {
      const job = waiting.shift()!;
      running.set(job.id, job);
      if (!worker) {
        const started = createWorker();
        started.onmessage = ({ data }) => finish(data.id, data.thumbnail);
        // The worker didn't load (offline) or failed: everything asked of it gets the sprite.
        started.onerror = () => {
          started.terminate();
          worker = null;
          const failed = [...running.values(), ...waiting];
          running = new Map();
          waiting = [];
          for (const each of failed) each.resolve(null);
        };
        worker = started;
      }
      worker.postMessage({ id: job.id, file: job.file });
    }
  }

  return {
    request(file) {
      let resolve!: (thumbnail: Blob | null) => void;
      const result = new Promise<Blob | null>((settle) => (resolve = settle));
      const job = { id: nextId++, file, resolve };
      waiting.push(job);
      next();
      return {
        result,
        cancel: () => {
          const at = waiting.indexOf(job);
          if (at >= 0) waiting.splice(at, 1);
          return at >= 0;
        },
      };
    },
    stop() {
      worker?.terminate();
      worker = null;
      waiting = [];
      running = new Map();
    },
  };
}

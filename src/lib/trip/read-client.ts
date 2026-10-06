import { POST_BATCH } from "@/lib/trip/config";
import type { TripPlan } from "@/lib/trip/group";
import type { ReadBatch, ReadMessage } from "@/lib/trip/pipeline";

// The page's side of the reading worker (SPEC §11.8 step 2). The worker (and the photo reader and
// tz lookup it loads) downloads only when photos are picked.

// The parts of a Worker used here, so tests can stand in for one.
export type ReadWorker = {
  postMessage: (batch: ReadBatch) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<ReadMessage>) => void) | null;
  onerror: ((event: Event) => void) | null;
};

export type TripRead = { plan: TripPlan; thumbnails: (Uint8Array | null)[] };

export type TripReading = {
  // The plan (stops, or why there are none) and each stop's thumbnail. Rejects if the worker fails.
  result: Promise<TripRead>;
  // Stops the worker. The result then never settles: the caller has moved on.
  cancel: () => void;
};

const startWorker = () =>
  new Worker(new URL("./read-worker.ts", import.meta.url), { type: "module" }) as unknown as ReadWorker;

export function readTripPhotos(
  files: File[],
  onProgress: (done: number, total: number) => void,
  createWorker: () => ReadWorker = startWorker,
): TripReading {
  const worker = createWorker();
  const result = new Promise<TripRead>((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") return onProgress(data.done, data.total);
      worker.terminate();
      if (data.type === "done") resolve({ plan: data.plan, thumbnails: data.thumbnails });
      else reject(new Error("The photo reader didn't load"));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`The reading worker failed: ${(event as ErrorEvent).message ?? "unknown error"}`));
    };
  });
  // The files go over in batches, one per task, so registering them for the worker never holds
  // the page for long (POST_BATCH). The first waits for a task too: the pick that handed us the
  // files is itself a long task for the browser (building a FileList of hundreds of files).
  let cancelled = false;
  void (async () => {
    for (let at = 0; at === 0 || at < files.length; at += POST_BATCH) {
      await new Promise((resolve) => setTimeout(resolve));
      if (cancelled) return;
      worker.postMessage({ files: files.slice(at, at + POST_BATCH), total: files.length });
    }
  })();
  return {
    result,
    cancel: () => {
      cancelled = true;
      worker.terminate();
    },
  };
}

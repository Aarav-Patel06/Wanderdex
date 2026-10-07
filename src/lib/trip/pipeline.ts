import { loadExifr, readThumbnail, type Thumbnail } from "@/lib/photo";
import { planTrip, type TripPlan } from "@/lib/trip/group";
import { readAll, readTripPhoto, type ZoneAt } from "@/lib/trip/read";

// The reading worker's work (SPEC §11.8 steps 2–4, 7), in the browser: read every photo, group
// them into stops, and take each stop's thumbnail from its first photo.

// The protocol. The page sends the picked files in batches (POST_BATCH), each with the total; once
// the worker has them all it reads them, answering with progress after each photo, then the plan
// and one EXIF thumbnail (JPEG bytes and the photo's orientation, or null) per stop. Only
// coordinates, instants, and thumbnails come back, never the files. An error means the photo reader's code didn't load.
export type ReadBatch = { files: File[]; total: number };
export type ReadMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; plan: TripPlan; thumbnails: (Thumbnail | null)[] }
  | { type: "error" };

// Collects the batches, in the order sent, and calls onAll once with every file.
export function collectFiles(onAll: (files: File[]) => void) {
  const files: File[] = [];
  return ({ files: batch, total }: ReadBatch) => {
    files.push(...batch);
    if (files.length === total) onAll(files);
  };
}

// post: the worker's postMessage; `transfer` lists buffers handed over rather than copied.
export async function handleReadRequest(
  files: File[],
  post: (message: ReadMessage, transfer?: Transferable[]) => void,
  zoneAt: ZoneAt,
  concurrency: number,
) {
  try {
    // Load exifr once up front, so a failed load (offline) is an error, not 500 unreadable photos.
    await loadExifr();
  } catch (error) {
    console.error("Loading the photo reader failed:", error);
    return post({ type: "error" });
  }
  const total = files.length;
  const reads = await readAll(files, (file) => readTripPhoto(file, zoneAt), concurrency, (done) =>
    post({ type: "progress", done, total }),
  );
  const plan = planTrip(reads, zoneAt);
  const thumbnails =
    plan.kind === "stops"
      ? await readAll(plan.stops, (stop) => readThumbnail(files[stop.photos[0]]), concurrency, () => {})
      : [];
  post({ type: "done", plan, thumbnails }, thumbnails.flatMap((thumbnail) => (thumbnail ? [thumbnail.bytes.buffer] : [])));
}

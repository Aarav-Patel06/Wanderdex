// Trip Photos (SPEC §11.8): its photo limit, reading concurrency, and (later) grouping, matching,
// grid, and cache values, all in one place. The per-user import limits are in lib/rate-limits.

// Until lookups and saving (Phase 4.2) are built, the mode shows only in development builds
// (`next dev`). Next inlines NODE_ENV, so in production builds the flag is false and the mode
// never shows (its code is still bundled: Turbopack doesn't fold an imported constant).
export const TRIP_PHOTOS_ENABLED = process.env.NODE_ENV === "development";

// At most this many photos per import; picking more reads nothing (SPEC §11.8 step 1).
export const MAX_PHOTOS = 500;

// How many photos the reading worker reads at once (SPEC §11.8 step 2).
export const READ_CONCURRENCY = 4;

// How many files go to the worker per message, one message per task. The first time a File is
// posted, the browser registers it for the worker synchronously (about 0.3 ms each, measured), so
// 500 in one message would hold the page for about 170 ms.
export const POST_BATCH = 25;

// Grouping photos into stops (SPEC §11.8 step 4). In time order, a photo joins the current stop
// when it's within JOIN_RADIUS_M of the stop's centroid and JOIN_GAP_MS of the previous photo;
// then stops whose centroids are within MERGE_RADIUS_M on the same local day become one.
export const JOIN_RADIUS_M = 150;
export const JOIN_GAP_MS = 2 * 60 * 60 * 1000;
export const MERGE_RADIUS_M = 150;

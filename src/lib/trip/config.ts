// Trip Photos (SPEC §11.8): its photo limit, reading concurrency, and grouping, matching, grid,
// and cache values, all in one place. The per-user import limits are in lib/rate-limits.

// Until the owner has tested Phase 4.2 and turns it on, the mode shows only in development builds
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

// Review thumbnails made from the photo itself, for stops whose first photo has no EXIF thumbnail
// (SPEC §11.8 step 7): THUMBNAIL_SIZE px square (64 CSS px at 3× device pixels), at most
// THUMBNAIL_CONCURRENCY decoding at once. Decoding holds the whole photo's pixels while it runs
// (48 MB for 12 MP), so only a few at a time.
export const THUMBNAIL_SIZE = 192;
export const THUMBNAIL_CONCURRENCY = 2;

// Place lookups for an import's stops (SPEC §11.8 step 5). "Your places" are the user's places
// within YOUR_PLACES_RADIUS_M of a stop (the nearest MAX_YOUR_PLACES); one within
// LOCAL_MATCH_RADIUS_M answers the stop with no lookup. The other stops within SHARE_RADIUS_M of
// each other share one lookup. The grid index finds all of these (lib/trip/grid): its cells are at
// least GRID_CELL_M on a side, so a point's neighbours within that are in its own cell or the 8
// around it. At most IMPORT_LOOKUP_CONCURRENCY lookups run at once.
export const YOUR_PLACES_RADIUS_M = 150;
export const LOCAL_MATCH_RADIUS_M = 50;
export const SHARE_RADIUS_M = 50;
export const MAX_YOUR_PLACES = 3;
export const GRID_CELL_M = 150;
export const IMPORT_LOOKUP_CONCURRENCY = 5;

// The shared Nearby Search cache (SPEC §17, lib/nearby-cache): a cell is the point's latitude and
// longitude rounded to NEARBY_CACHE_STEP_DEG (0.0002° is 22 m of latitude, and 18 m of longitude
// in Tokyo; cell keys keep 4 decimals). A result answers for NEARBY_CACHE_TTL_MS, an empty one
// (nothing within 150 m) only for NEARBY_CACHE_EMPTY_TTL_MS, since a place may open there.
export const NEARBY_CACHE_STEP_DEG = 0.0002;
export const NEARBY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const NEARBY_CACHE_EMPTY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

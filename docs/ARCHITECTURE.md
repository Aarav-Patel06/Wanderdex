# Trip Photos: architecture

How a Trip Photos import works (SPEC §11.8), from the photo picker to saved visits, and what each part costs. The rules live in `docs/SPEC.md` (§11.8, §17); the choices behind them and the full measurement notes are in `docs/DECISIONS.md`. This page explains how the parts fit together, with the latest measured numbers.

```
picker / drop ──► reading worker ──► grouping ──► POST /api/resolve/import ──► review ──► saves, one per stop
 (≤ 500 files)     (in the browser:    (stops,       (layered lookups,           (matches,    POST /api/visits
                    partial reads,      in the        grid index, cache,          Already      with import id
                    4 at a time)        worker)       allowance)                  logged)      + stop number)
```

Photos never leave the browser. The server gets each stop's centroid and local date for the lookups, and each saved visit's time. Review thumbnails are object URLs of local data.

## 1. Reading, in a Web Worker

`src/lib/trip/read-client.ts` starts `read-worker.ts` (`new Worker(new URL(…, import.meta.url))`, so the worker and exifr download only once photos are picked). The page posts the picked `File`s in batches of 25 (`POST_BATCH`), one message per task. The first time a browser posts a File, it registers it for the worker synchronously, about 0.33 ms per file, so 500 files in one message would hold the page for about 170 ms. The worker reads 4 photos at a time (`READ_CONCURRENCY`) and reports progress after each.

**Partial reads** (`src/lib/photo.ts`) never load a whole file:
- JPEG, HEIC, and the TIFF-based RAW files (DNG/ProRAW, CR2, NEF, ARW, PEF, ORF, RW2) go to exifr's chunked reader. It reads the first 64 KB, then only where the metadata points. For TIFF-based files the reader also loads the part of the file under the GPS block, which exifr alone skips (so GPS past the first chunk would come back missing).
- PNG and WebP are walked chunk header by chunk header, through 64 KB windows, to their EXIF chunk.

Measured on 200 files totalling 2.28 GB (60 × 29 MB ProRAW DNG, 100 iPhone HEICs, 40 Android JPEGs), headless Edge, three runs each:

| | Read time | Worker peak memory | Browser private bytes |
|---|---|---|---|
| Before (whole files) | 1.6–1.8 s | 469–528 MB | 750–1,077 MB |
| After (partial reads) | 0.71–0.80 s | 79–88 MB | 428–582 MB |

The files were in the OS cache both times, so a phone reading from flash should gain more time than this.

**Responsiveness** (SPEC §20: no app-owned main-thread task over 100 ms while reading photos). We traced 16 runs: a synthetic 500-photo trip and 500 real photos (5.7 GB), at 1× and 4× CPU, picked and dropped. While reading, the longest task was 17–25 ms at 1× and 25–77 ms at 4×. Two tasks run longer, and the owner measured and accepted both:
- At the pick, the browser builds its file list in one task of 143–192 ms at 1× and 247–446 ms at 4×. That's the browser's own work, before any app code runs; our share of it is 0–2 ms.
- Opening the review is a single task of 41–66 ms at 1× and 206–392 ms at 4×, mostly the dialog mounting.

## 2. Grouping into stops (in the worker)

`src/lib/trip/group.ts` sorts the photos by instant. A photo joins the current stop if it's within 150 m of the stop's centroid and within 2 hours of the previous photo. Then stops at the same spot (centroids within 150 m) on the same local day merge, repeating until nothing more merges. Each stop's centroid averages longitudes correctly across the antimeridian. Only the stops, the skipped counts, and each stop's EXIF thumbnail go back to the page; the thumbnails are transferred, not copied.

For a stop whose first photo has no EXIF thumbnail, the review makes one in a second worker (`thumbnail-worker.ts`, `createImageBitmap` + `OffscreenCanvas`, 192 px). It does this only for cards near the viewport, 2 at a time. With 500 photos in 150 stops, each first photo a full-size image, browser memory peaked at 1,027–1,029 MB while scrolling and making thumbnails (about 200–230 MB more than a run with small first photos). It settled at about 680 MB, the same as that control run.

Grouping time (`pnpm bench:import`, synthetic trip): **0.61 ms** median for 300 photos (41 stops), **0.78 ms** for 500 (68 stops).

## 3. Lookups: one request, layered by cost

`POST /api/resolve/import` (`src/app/api/resolve/import/route.ts` → `src/lib/trip/lookup.ts`) takes `{ import_id, stops: [{ lat, lng, date }] }`, at most 150 stops, validated strictly with zod. Each stop is answered by the first layer that can, cheapest first, and counted in exactly that layer:

1. **Your places (local match).** The user's places are read under their session (RLS) and put in a **grid index** (`src/lib/trip/grid.ts`). If one of them is within 50 m of the stop, it's preselected and nothing is looked up. Places within 150 m (the nearest 3) show as "Your places" on every stop.
2. **Shared result.** Of the remaining stops, in time order, each stop not yet in a group leads one, with every other remaining stop within 50 m of it. The group makes one lookup at the leader's point, and each member gets those results re-sorted by distance to its own point.
3. **Cache hit.** The shared `nearby_cache` (below) is checked at the leader's point.
4. **Google.** Otherwise one Nearby Search (50 m, then a retry at 150 m), and the result is cached. Lookups run 5 at a time (`IMPORT_LOOKUP_CONCURRENCY`).
5. **Unmatched by a limit.** If the user's import allowance (300 Google lookups per 24 hours, logged in `resolve_log` as kind `import`) or the monthly Nearby cap has run out, the remaining groups get no candidates; so does any group after Google itself answers 429. Cache hits still answer.

**The grid index.** Rows are `d / R` radians of latitude tall: two points d apart differ in latitude by at most that. Columns are at least `2·asin(sin(d/2R) / cos φ)` of longitude wide, with φ the highest latitude among the points. That's the most two points d apart can differ in longitude, so cells widen toward the poles. 360° is split into whole columns that wrap at the antimeridian. Any two points within 150 m are therefore in the same cell or neighbouring ones, so a query checks 9 cells instead of every point. Unit tests compare it with checking every pair, at the equator, at 64°, 78°, and 89.995°, near the south pole, and across the antimeridian. They also test pairs 149.9 m and 150.1 m apart straddling cell edges.

**Already logged.** For every "your place" and candidate, the response says whether the user already has a visit there on the stop's local date. A date-only or exact-time visit matches on its local day, a month-only visit anywhere in its month (the same rule as My Visits' date filter). Those stops start unchecked in the review.

**Signed candidates.** Every candidate, cached or fresh, is signed (HMAC, 24 h expiry) and carries its time zone, so `/api/visits` saves only places the server found. The cache holds no signatures.

**Measuring.** The response returns the counts, and the review shows them under its title ("Place lookups: 12 sent to Google, 85 avoided (60 your places, 18 shared, 7 cached)"). They're also stored as one `import_log` row per import: counts only, no locations. The counts are `stops`, `local_matches`, `shared`, `cache_hits`, `google_lookups`, `google_calls` (a 150 m retry counts twice), and `unmatched_limit`. The five layer counts add up to `stops`.

## 4. The shared lookup cache

`src/lib/nearby-cache.ts`, in front of **every** Nearby Search: Trip Photos, Upload Photo, a dropped pin's city and country, and a coordinates-only link.

- **Key:** the point rounded to 0.0002° (about 22 m of latitude, 18 m of longitude in Tokyo), as `"lat,lng"`. 180 and −180 are one cell.
- **Answers:** a result younger than **30 days**, or an empty result (nothing within 150 m) younger than **7 days**, since a place may open there. Results are re-sorted by distance to the actual point and signed fresh.
- **Writes:** a miss upserts its cell, and every write also deletes rows older than 30 days, so there's no cleanup job.
- **Never in the way:** a failed read counts as a miss, and a failed write is only logged.
- **Costs nothing:** a hit makes no Google call, so it isn't logged in `google_call_log`, isn't stopped by the monthly cap, and doesn't use the import allowance. The per-user limits on `/api/resolve/*` still count the request.

## 5. Review and idempotent save

The review (`src/components/import/trip-review.tsx`, logic in `src/lib/trip/review.ts`) preselects each stop's match: the nearest of the user's places within 50 m, else the first candidate. The match can be switched to any of the stop's "Your places" or candidates, or to "Drop a pin", which makes a new named place at the stop's centroid. "Already logged" follows the chosen match, but only presets the checkbox.

"Save N visits" saves the checked stops **one at a time**, in time order, through the ordinary `/api/visits`. Each save sends the import's id (a UUID made when grouping finishes) and the stop's number:

- **Before writing anything,** the server looks for the user's visit with that import id and stop. If it finds one, it answers with that visit as saved. So a timeout, a lost response, or a double tap never makes a second visit or a second manual place.
- **When two saves of one stop race** past that check, the partial unique index `visits_import_stop_idx` on `(user_id, import_id, import_stop)` lets only one insert through. The other request removes the manual place it just made, if any, and answers with the winner's visit.
- **Per stop:** a failed stop stays checked and shows "Couldn't save this stop. Try again."; saved stops leave the review and stay saved. The one-category-per-place rule applies, so the last stop saved at a place sets its category.
- **Pins:** an import's manual-place save counts toward the import allowance instead of the per-user lookup limits. Out of allowance, it uses the country shapes for the country, and Google isn't called.

Afterwards one toast replaces the per-visit ones ("Trip imported!" / "N places logged, M new countries"), and the map fits the new pins.

## 6. The benchmark

`pnpm bench:import` (`scripts/bench-import.ts`, on Vitest, outside `pnpm test`) puts a seeded synthetic trip through the real grouping and the real lookup pipeline. The trip is a week in Tokyo, 300 photos, 41 places. Google is a mocked `fetch` that knows the trip's places plus two neighbours each, and Supabase is the route tests' in-memory fake. Latest run (2026-10-07):

| 300 photos → 41 stops | Sent to Google | Google calls | Avoided | Your places | Shared | Cached |
|---|---|---|---|---|---|---|
| No layers (one lookup per stop) | 41 | 41+ | 0 | | | |
| Empty cache | 25 | 25 | 16 | 0 | 16 | 0 |
| Warm cache (the same trip again) | 0 | 0 | 41 | 0 | 16 | 25 |
| Re-import after saving it | 0 | 0 | 41 | 41 | 0 | 0 |

On the empty cache, the shared layer alone saves 39% of the lookups (the hotel and revisited spots on different days are separate stops at the same spot). A warm cache makes no Google call. A re-import answers every stop from the user's own places, and all 41 come up "Already logged", so they start unchecked. No 150 m retries happened, since every synthetic stop is within about 20 m of a place.

import type { LatLng } from "@/lib/links/parse";
import { EARTH_RADIUS_M, metres } from "@/lib/trip/group";

// A spatial grid index (SPEC §11.8 step 5), so a stop is compared only with the points in its own
// cell and the 8 around it, never with every point. Used on the server for the user's places near
// each stop (local matches, "Your places") and for the stops near each other (shared lookups).
//
// Cells are rows of latitude and columns of longitude, sized so that any two points within
// `cellM` of each other are in the same or neighbouring cells:
// - rows are cellM / R radians tall, since two points d apart differ in latitude by at most d / R;
// - columns are at least 2·asin(sin(d / 2R) / cos φ) wide, the most two points d apart can differ
//   in longitude when neither is above latitude φ, with φ the highest latitude among the points
//   indexed and asked about (so cells are wider toward the poles, and near a pole there's one
//   column). 360° is split into whole columns, so the last isn't narrower, and the columns wrap
//   around the antimeridian.
// Built for one set of points, plus the points it'll be asked about (for their latitudes).
export function gridIndex<T extends LatLng>(items: T[], cellM: number, queries: LatLng[] = []) {
  // A hair larger than exact, so floating-point rounding can't put two points cellM apart two
  // rows or columns apart.
  const d = (cellM / EARTH_RADIUS_M) * (1 + 1e-9);
  const latStep = degrees(d);
  const maxLat = Math.min(90, Math.max(0, ...items.map((p) => Math.abs(p.lat)), ...queries.map((p) => Math.abs(p.lat))));
  const spread = Math.sin(d / 2) / Math.cos(radians(maxLat));
  const columns = spread >= 1 ? 1 : Math.max(1, Math.floor(360 / degrees(2 * Math.asin(spread))));
  const lngStep = 360 / columns;

  const row = (lat: number) => Math.floor((lat + 90) / latStep);
  const column = (lng: number) => ((Math.floor((lng + 180) / lngStep) % columns) + columns) % columns;
  const key = (r: number, c: number) => `${r}:${c}`;

  const cells = new Map<string, T[]>();
  for (const item of items) {
    const k = key(row(item.lat), column(item.lng));
    const cell = cells.get(k);
    if (cell) cell.push(item);
    else cells.set(k, [item]);
  }

  return {
    // The items within `within` metres of the point (at most cellM), nearest first.
    near(point: LatLng, within = cellM) {
      const r = row(point.lat);
      const c = column(point.lng);
      const found: { item: T; metres: number }[] = [];
      for (const dr of [-1, 0, 1]) {
        // With fewer than 3 columns, a neighbouring column can be the point's own.
        for (const cc of new Set([c - 1, c, c + 1].map((x) => ((x % columns) + columns) % columns))) {
          for (const item of cells.get(key(r + dr, cc)) ?? []) {
            const m = metres(point, item);
            if (m <= within) found.push({ item, metres: m });
          }
        }
      }
      return found.sort((a, b) => a.metres - b.metres);
    },
  };
}

const radians = (deg: number) => (deg * Math.PI) / 180;
const degrees = (rad: number) => (rad * 180) / Math.PI;

import type { Category } from "@/lib/categories";

// One pin per place (SPEC §13.4), in the category of the user's own visits.
export type MapPlace = {
  id: string;
  name: string;
  category: Category;
  city: string | null;
  country: string | null;
  country_code: string | null;
  lat: number;
  lng: number;
  visits: number;
};

// What the save flow knows after saving one visit.
export type NewPin = Omit<MapPlace, "visits">;

// A visits row with its place embedded, as the Overworld page selects it.
export type VisitRow = {
  category: Category;
  place: Omit<MapPlace, "category" | "visits"> | null;
};

// Rows come newest first (by created_at), so a place takes the category of the user's
// most recently logged visit there, the same one addVisit gives it.
export function placesFromVisits(rows: VisitRow[]): MapPlace[] {
  const byId = new Map<string, MapPlace>();
  for (const { category, place } of rows) {
    if (!place) continue;
    const known = byId.get(place.id);
    if (known) known.visits += 1;
    else byId.set(place.id, { ...place, category, visits: 1 });
  }
  return [...byId.values()];
}

// A newly saved visit: a new place gets its first pin; a known place counts one more
// visit and takes the new visit's category.
export function addVisit(places: MapPlace[], pin: NewPin): MapPlace[] {
  const known = places.find((place) => place.id === pin.id);
  if (!known) return [...places, { ...pin, visits: 1 }];
  return places.map((place) => (place === known ? { ...pin, visits: known.visits + 1 } : place));
}

// The user's distinct countries, for the visited-country fill (SPEC §13.3). Places without a
// country code don't count.
export function countryCodes(places: MapPlace[]): string[] {
  return [...new Set(places.flatMap((place) => (place.country_code ? [place.country_code] : [])))].sort();
}

export function clusterLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

// Pins' and clusters' size in CSS px by zoom (SPEC §13.4), whole multiples of the 32px
// sprites. The selected pin is one step (32px) up.
export function pinSizeAt(zoom: number) {
  return zoom >= 15 ? 96 : zoom >= 10 ? 64 : 32;
}

export function selectedPinSize(size: number) {
  return size + 32;
}

// supercluster clusters at whole zooms, merging points within its radius in CSS px at the zoom
// it's asked for, so asking for one zoom lower merges within twice that on screen. From zoom
// 10, where pins and clusters are 64px or more, it's asked one lower, for twice the radius
// (SPEC §13.4).
export function clusterZoomAt(zoom: number) {
  const whole = Math.floor(zoom);
  return zoom >= 10 ? whole - 1 : whole;
}

// The map zoom that shows supercluster's zoom `clusterZoom`: where a cluster that expands at
// that zoom shows apart.
export function mapZoomFor(clusterZoom: number) {
  let zoom = clusterZoom;
  while (clusterZoomAt(zoom) < clusterZoom) zoom += 1;
  return zoom;
}

type Box = { left: number; top: number; right: number; bottom: number };

// How far left (0 or less) the open pin popup has to move so that it overlaps none of the map
// controls (SPEC §13.4), with `gap` px between: the controls are a column on the map's right, so
// moving left clears every control that shares the popup's rows, and the others don't matter.
export function leftClearOf(popup: Box, controls: Box[], gap: number) {
  const inRows = controls.filter((c) => c.top - gap < popup.bottom && c.bottom + gap > popup.top);
  return Math.min(0, ...inRows.map((c) => c.left - gap - popup.right));
}

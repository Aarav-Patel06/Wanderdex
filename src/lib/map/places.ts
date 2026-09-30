import type { Category } from "@/lib/categories";

// One pin per place (SPEC §13.4), in the category of the user's own visits.
export type MapPlace = {
  id: string;
  name: string;
  category: Category;
  city: string | null;
  country: string | null;
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

export function clusterLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

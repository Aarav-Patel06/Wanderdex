import { readFile } from "node:fs/promises";
import path from "node:path";

import type { LatLng } from "@/lib/links/parse";

// Which country a point is in, from the Natural Earth shapes the map's visited-country fill uses
// (public/geo/countries.geojson, SPEC §13.3). For a dropped pin that Nearby Search found nothing
// around (SPEC §11.4). Server only: reads the file from disk.

type Position = [lng: number, lat: number];
type Polygon = Position[][]; // outer ring, then holes

type Geometry = { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: Polygon[] };
type CountriesGeoJson = { features: { properties: { ISO_A2_EH?: string }; geometry: Geometry | null }[] };

export type CountryShape = {
  code: string; // ISO 3166-1 alpha-2, uppercase
  polygons: Polygon[];
  bbox: [west: number, south: number, east: number, north: number];
};

// The file's countries with a real code (ISO_A2_EH is "-99" for a few disputed areas).
export function countryShapes(geojson: CountriesGeoJson): CountryShape[] {
  return geojson.features.flatMap(({ properties, geometry }) => {
    const code = properties.ISO_A2_EH;
    if (!geometry || !code || !/^[A-Z]{2}$/.test(code)) return [];
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    const points = polygons.flatMap((polygon) => polygon[0]);
    const lngs = points.map(([lng]) => lng);
    const lats = points.map(([, lat]) => lat);
    return [
      {
        code,
        polygons,
        bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as CountryShape["bbox"],
      },
    ];
  });
}

// The first country whose shape contains the point, or null (the open sea). The shapes are grown
// about 8 km out to sea along the coasts (SPEC §13.3), so a coastal point still counts; where two
// coasts are closer than that, the point can be inside both, and the first in the file wins.
export function countryAt(shapes: CountryShape[], { lat, lng }: LatLng): string | null {
  for (const { code, polygons, bbox } of shapes) {
    const [west, south, east, north] = bbox;
    if (lng < west || lng > east || lat < south || lat > north) continue;
    if (polygons.some((polygon) => inPolygon([lng, lat], polygon))) return code;
  }
  return null;
}

// Even-odd ray casting over every ring, so a point in a hole (Lesotho inside South Africa) is out.
export function inPolygon([x, y]: Position, polygon: Polygon) {
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

let shapes: Promise<CountryShape[]> | undefined;

// Read and parsed once per server instance. next.config.ts traces the file into /api/visits.
export function loadCountryShapes() {
  shapes ??= readFile(path.join(process.cwd(), "public", "geo", "countries.geojson"), "utf8")
    .then((text) => countryShapes(JSON.parse(text)))
    .catch((error: unknown) => {
      shapes = undefined; // try again next time
      throw error;
    });
  return shapes;
}

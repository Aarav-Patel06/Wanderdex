import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

// OpenFreeMap's Positron, the plainest of its styles (SPEC §12.4). Recolored by pixelStyle.
export const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export type MapToken =
  | "--map-land"
  | "--map-ocean"
  | "--map-border"
  | "--surface"
  | "--surface-dark"
  | "--visited"
  | "--text";

// The hybrid map (SPEC §13.1): pixelated at world zoom, smooth once zoomed in.
export type MapMode = "pixel" | "smooth";

// The only Positron layers kept, each with its palette token (SPEC §13.2). Everything else
// is dropped: labels, road shields, POI icons, landcover, parks, railways, and state borders.
// With an allowlist, a new or renamed upstream layer disappears instead of sneaking a label
// back in.
const LAYER_TOKENS: Record<string, MapToken> = {
  background: "--map-land",
  water: "--map-ocean",
  waterway: "--map-ocean",
  // Flat 2D footprints with a thin outline (SPEC §13.2): Positron draws them above water and
  // below every road, so streets stay readable on top of them.
  building: "--map-border",
  boundary_2: "--map-border",
  boundary_disputed: "--map-border",
  highway_path: "--surface-dark",
  highway_minor: "--surface-dark",
  highway_major_inner: "--surface",
  highway_motorway_inner: "--surface",
  highway_motorway_bridge_inner: "--surface",
  tunnel_motorway_inner: "--surface",
};

// Drawn only in smooth mode. At world zoom, rivers would be as thick as the borders, and
// disputed borders are dashed, which can't be drawn crisply (dashed lines use a shader with
// its own soft dash edges, and their dashes scale with the line width).
const SMOOTH_ONLY = new Set(["waterway", "boundary_disputed"]);

// Pixel mode: roads are this many map pixels wide. MapLibre fades each line edge over one
// map pixel, so a 1-pixel line is all fade (a translucent smear); two keep a solid core.
// (With motorways starting at zoom 6, no road is drawn below the smooth threshold today.)
const PIXEL_ROAD_WIDTH = 2;

// Pixel mode: country borders (boundary_2) are crisp 1-map-pixel lines. MapLibre's line shader fades each
// edge over `line-blur` plus one map pixel. A line-blur of -(1 - CRISP) map pixels cancels
// almost all of that fade, leaving a hard edge, and a line CRISP map pixels wide plus the
// half-pixel of fade MapLibre adds on each side comes to just over 1 map pixel in all.
// The style spec doesn't allow a negative line-blur, so these values are set with validation
// off (map-view.tsx). Checked on MapLibre 5.24 (pinned at 5.x). AFTER ANY MAPLIBRE UPGRADE,
// check the world-view borders; if they're gone or soft, fall back to plain 1-map-pixel
// lines: line-width = mapPx, line-blur = 0.
const CRISP = 0.02;

// Smooth mode: line widths in CSS pixels, growing with zoom. Roads and borders use Positron's
// own curves (motorways start a little wider at zoom 6); Positron gives rivers no width
// (1px at every zoom), so they get a gentle curve of their own.
const MOTORWAY_WIDTH = ["interpolate", ["exponential", 1.4], ["zoom"], 6, 1.5, 20, 30];
const BORDER_WIDTH = ["interpolate", ["linear"], ["zoom"], 3, 1, 5, 1.2, 12, 3];
// Buildings from street zoom only, far above the smooth threshold, so they're never pixelated.
const BUILDINGS_FROM = 15;
// Building outlines, a little wider as the buildings grow...
const BUILDING_OUTLINE_WIDTH = ["interpolate", ["linear"], ["zoom"], BUILDINGS_FROM, 1, 18, 2];
// ...and a little lighter than `text`: about #463E35 over the `map-border` fill.
const BUILDING_OUTLINE_OPACITY = 0.6;
const SMOOTH_WIDTHS: Record<string, unknown> = {
  waterway: ["interpolate", ["exponential", 1.3], ["zoom"], 6, 1, 20, 12],
  boundary_2: BORDER_WIDTH,
  boundary_disputed: BORDER_WIDTH,
  highway_path: ["interpolate", ["exponential", 1.2], ["zoom"], 13, 1, 20, 10],
  highway_minor: ["interpolate", ["exponential", 1.55], ["zoom"], 13, 1.8, 20, 20],
  highway_major_inner: ["interpolate", ["exponential", 1.3], ["zoom"], 10, 2, 20, 20],
  highway_motorway_inner: MOTORWAY_WIDTH,
  highway_motorway_bridge_inner: MOTORWAY_WIDTH,
  tunnel_motorway_inner: MOTORWAY_WIDTH,
  building_outline: BUILDING_OUTLINE_WIDTH,
};

const MIN_ZOOMS: Record<string, number> = { building: BUILDINGS_FROM };

// A thin outline around each footprint (SPEC §13.2), so touching buildings don't merge into one
// shape. A copy of the tiles' building layer (`fill`, already recolored) as a line, so it shares
// its source and zoom range, and draws right above it, still below every road. `text` at 60%:
// the one map color that isn't an exact token (owner-approved), since no token sits between
// `text` and the `map-border` fill, and `text` at full strength was too heavy.
function buildingOutline(fill: LayerSpecification & { type: "fill" }, color: (token: MapToken) => string) {
  return {
    ...fill,
    id: "building_outline",
    type: "line",
    paint: {
      "line-color": color("--text"),
      "line-opacity": BUILDING_OUTLINE_OPACITY,
      ...smoothPaint({ id: "building_outline", type: "line" }),
    },
  } satisfies LayerSpecification;
}

// The visited-country fill (SPEC §13.3): Natural Earth shapes (public/geo/countries.geojson),
// loaded into the empty source once the map has drawn, filtered to the user's countries.
export const VISITED_LAYER = "visited";
export const COUNTRIES_SOURCE = "countries";
export const COUNTRIES_URL = "/geo/countries.geojson";

export function visitedFilter(countryCodes: string[]): ExpressionSpecification {
  return ["in", ["get", "ISO_A2_EH"], ["literal", countryCodes]];
}

// Hysteresis for the zoom switches: half a zoom level, so a zoom resting near a threshold
// can't flip back and forth.
const HYSTERESIS = 0.5;

// Smooth from `smoothAt`, pixelated again only below `smoothAt - 0.5`.
export function modeAt(zoom: number, smoothAt: number, current?: MapMode): MapMode {
  if (current === "smooth") return zoom < smoothAt - HYSTERESIS ? "pixel" : "smooth";
  return zoom >= smoothAt ? "smooth" : "pixel";
}

// Pixel mode's block size in CSS pixels: 3, but 2 below zoom 2, where the whole world is only
// a few hundred pixels wide and 3-pixel blocks swallow small countries. Back to 3 only above
// zoom 2.5. (Smooth mode doesn't use it.)
const SMALL_BLOCK_BELOW = 2;

export function blockAt(zoom: number, current?: number): number {
  if (current === 2) return zoom > SMALL_BLOCK_BELOW + HYSTERESIS ? 3 : 2;
  return zoom < SMALL_BLOCK_BELOW ? 2 : 3;
}

// The lowest zoom, at which the world is exactly as wide as the map: MapLibre's world is
// 512 × 2^zoom CSS pixels wide. Clamped to MapLibre's own limits (-2 to 22).
export function minZoomFor(width: number) {
  return Math.min(22, Math.max(-2, Math.log2(width / 512)));
}

type PaintLayer = { id: string; type: string };

// The paint values that differ between modes, for one layer. Both modes set the same
// properties, so switching either way overwrites all of them.
function smoothPaint(layer: PaintLayer): Record<string, unknown> {
  if (layer.type === "fill") return { "fill-antialias": true };
  if (layer.type !== "line") return {};
  return {
    "line-width": SMOOTH_WIDTHS[layer.id] ?? 1,
    ...(layer.id === "boundary_2" && { "line-blur": 0 }),
  };
}

// `mapPx` is the size of one map pixel in CSS pixels (1 / the pixel-mode pixelRatio).
function pixelPaint(layer: PaintLayer, mapPx: number): Record<string, unknown> {
  // Hard polygon edges: a soft edge turns into a blurry block once pixelated. Seas and lakes
  // are fills, so they stay.
  if (layer.type === "fill") return { "fill-antialias": false };
  if (layer.type !== "line") return {};
  if (layer.id === "boundary_2") return { "line-width": CRISP * mapPx, "line-blur": -(1 - CRISP) * mapPx };
  // A 0-width line draws nothing.
  if (SMOOTH_ONLY.has(layer.id)) return { "line-width": 0 };
  return { "line-width": PIXEL_ROAD_WIDTH * mapPx };
}

// [layer id, paint property, value] for every mode-dependent paint value in `style`, for
// switching modes in place with setPaintProperty.
export function modePaints(style: StyleSpecification, mode: MapMode, mapPx: number): [string, string, unknown][] {
  return style.layers.flatMap((layer) =>
    Object.entries(mode === "pixel" ? pixelPaint(layer, mapPx) : smoothPaint(layer)).map(
      ([name, value]): [string, string, unknown] => [layer.id, name, value],
    ),
  );
}

// `color` turns a token into its CSS value (read from the page at runtime, so the hex
// values live only in globals.css). Opacity is dropped so every color is exactly a token
// (except the building outlines' own, see buildingOutline).
// The paint values are smooth mode's, which pass style validation; the map applies pixel
// mode's with modePaints once the style has loaded.
export function pixelStyle(base: StyleSpecification, color: (token: MapToken) => string): StyleSpecification {
  const layers = base.layers.flatMap((layer): LayerSpecification[] => {
    const token = LAYER_TOKENS[layer.id];
    if (!token || (layer.type !== "background" && layer.type !== "fill" && layer.type !== "line")) return [];
    // Positron's own building outline (fill-outline-color) is dropped: it's a 1-device-pixel
    // hairline, a third of a CSS pixel on a phone. buildingOutline draws a real one.
    const paint = Object.entries(layer.paint ?? {}).filter(
      ([name]) => !name.endsWith("-opacity") && name !== "fill-outline-color",
    );
    const kept = {
      ...layer,
      ...(MIN_ZOOMS[layer.id] !== undefined && { minzoom: MIN_ZOOMS[layer.id] }),
      paint: { ...Object.fromEntries(paint), [`${layer.type}-color`]: color(token), ...smoothPaint(layer) },
    } as LayerSpecification;
    if (kept.type === "fill" && kept.id === "building") return [kept, buildingOutline(kept, color)];
    // Above the land, below the water: the tiles' seas and lakes cover any spill past the coast,
    // so the coastline is always the tiles' own. The borders stay on top. Shown only in pixel
    // mode (the map switches its visibility), so it starts hidden, like smooth mode.
    if (layer.id !== "background") return [kept];
    const visited: LayerSpecification = {
      id: VISITED_LAYER,
      type: "fill",
      source: COUNTRIES_SOURCE,
      filter: visitedFilter([]),
      layout: { visibility: "none" },
      paint: { "fill-color": color("--visited"), ...smoothPaint({ id: VISITED_LAYER, type: "fill" }) },
    };
    return [kept, visited];
  });

  // No text or icon layers are left, so glyphs and the sprite go too (SPEC §13.2),
  // along with sources nothing draws (Positron's shaded-relief raster).
  const used = new Set(layers.map((layer) => ("source" in layer ? layer.source : null)));
  const sources = {
    ...Object.fromEntries(Object.entries(base.sources).filter(([id]) => used.has(id))),
    [COUNTRIES_SOURCE]: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  } satisfies StyleSpecification["sources"];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { glyphs, sprite, ...rest } = base;
  // No transitions, so a mode switch snaps instead of easing the line widths over 300 ms.
  return { ...rest, sources, layers, transition: { duration: 0, delay: 0 } };
}

// The pixel-mode pixelRatio for map pixels of about `block` CSS pixels, rounded so each map
// pixel covers a whole number of device pixels (9 for block 3 on an iPhone at DPR 3, 4 at
// Windows 125%). Otherwise the pixelated upscale mixes blocks of different widths, which
// reads as blur.
export function mapPixelRatio(devicePixelRatio: number, block: number) {
  return devicePixelRatio / Math.max(1, Math.round(block * devicePixelRatio));
}

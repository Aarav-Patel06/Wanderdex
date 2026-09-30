import type { FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

// OpenFreeMap's Positron, the plainest of its styles (SPEC §12.4). Recolored by pixelStyle.
export const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export type MapToken = "--map-land" | "--map-ocean" | "--map-border" | "--surface" | "--surface-dark";

// "major" keeps only the bigger roads at city zoom, so the pixelated map reads as chunky shapes
// instead of noise. "all" keeps Positron's road layers as they are.
export type RoadDetail = "major" | "all";

// The only Positron layers kept, each with its palette token (SPEC §13.2). Everything else
// is dropped: labels, road shields, POI icons, landcover, parks, buildings, railways, and
// state borders. With an allowlist, a new or renamed upstream layer disappears instead of
// sneaking a label back in.
const LAYER_TOKENS: Record<string, MapToken> = {
  background: "--map-land",
  water: "--map-ocean",
  waterway: "--map-ocean",
  boundary_2: "--map-border",
  boundary_disputed: "--map-border",
  highway_path: "--surface-dark",
  highway_minor: "--surface-dark",
  highway_major_inner: "--surface",
  highway_motorway_inner: "--surface",
  highway_motorway_bridge_inner: "--surface",
  tunnel_motorway_inner: "--surface",
};

// Every line (roads, rivers, borders) is this many map pixels wide. MapLibre can't turn off
// line antialiasing: it fades each edge over one map pixel, so a 1-pixel line is all fade
// (a translucent smear). Two keeps at least one solid pixel across.
const LINE_WIDTH = 2;

// Road changes for "major": motorways from zoom 6, trunk and primary roads from 11 (both as
// upstream), secondary from 13, tertiary from 14, plain streets from 16. Service roads,
// tracks, and paths never show. `null` drops the layer.
const MAJOR_ROADS: Record<string, { minzoom?: number; filter?: FilterSpecification } | null> = {
  highway_major_inner: {
    filter: [
      "match",
      ["get", "class"],
      ["trunk", "primary"],
      true,
      "secondary",
      [">=", ["zoom"], 13],
      "tertiary",
      [">=", ["zoom"], 14],
      false,
    ],
  },
  highway_minor: { minzoom: 16, filter: ["==", ["get", "class"], "minor"] },
  highway_path: null,
};

// `color` turns a token into its CSS value (read from the page at runtime, so the hex
// values live only in globals.css). Opacity is dropped so every color is exactly a token.
// `mapPx` is the size of one map pixel in CSS pixels (1 / the map's pixelRatio); line widths
// are whole numbers of it.
export function pixelStyle(
  base: StyleSpecification,
  color: (token: MapToken) => string,
  { mapPx, roads }: { mapPx: number; roads: RoadDetail },
): StyleSpecification {
  const layers = base.layers.flatMap((layer): LayerSpecification[] => {
    const token = LAYER_TOKENS[layer.id];
    if (!token || (layer.type !== "background" && layer.type !== "fill" && layer.type !== "line")) return [];
    const change = roads === "major" && layer.id in MAJOR_ROADS ? MAJOR_ROADS[layer.id] : {};
    if (!change) return [];

    const paint: Record<string, unknown> = Object.fromEntries(
      Object.entries(layer.paint ?? {}).filter(([name]) => !name.endsWith("-opacity")),
    );
    paint[`${layer.type}-color`] = color(token);
    // Hard polygon edges: a soft edge turns into a blurry block once pixelated.
    if (layer.type === "fill") paint["fill-antialias"] = false;
    if (layer.type === "line") paint["line-width"] = LINE_WIDTH * mapPx;

    const filter = "filter" in layer && layer.filter;
    return [
      {
        ...layer,
        ...(change.minzoom !== undefined && { minzoom: change.minzoom }),
        ...(change.filter && { filter: filter ? ["all", filter, change.filter] : change.filter }),
        paint,
      } as LayerSpecification,
    ];
  });

  // No text or icon layers are left, so glyphs and the sprite go too (SPEC §13.2),
  // along with sources nothing draws (Positron's shaded-relief raster).
  const used = new Set(layers.map((layer) => ("source" in layer ? layer.source : null)));
  const sources = Object.fromEntries(Object.entries(base.sources).filter(([id]) => used.has(id)));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { glyphs, sprite, ...rest } = base;
  return { ...rest, sources, layers };
}

// The map's pixelRatio for map pixels of about `block` CSS pixels, rounded so each map pixel
// covers a whole number of device pixels (6 on an iPhone at DPR 3, 3 at Windows 125% or 150%).
// Otherwise the pixelated upscale mixes blocks of different widths (2 and 3 device pixels
// for a fixed 0.5 at 125%), which reads as blur.
export function mapPixelRatio(devicePixelRatio: number, block: number) {
  return devicePixelRatio / Math.max(1, Math.round(block * devicePixelRatio));
}

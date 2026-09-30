import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

// OpenFreeMap's Positron, the plainest of its styles (SPEC §12.4). Recolored by pixelStyle.
export const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export type MapToken = "--map-land" | "--map-ocean" | "--map-border" | "--surface" | "--surface-dark";

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

// `color` turns a token into its CSS value (read from the page at runtime, so the hex
// values live only in globals.css). Opacity is dropped so every color is exactly a token.
export function pixelStyle(base: StyleSpecification, color: (token: MapToken) => string): StyleSpecification {
  const layers = base.layers.flatMap((layer): LayerSpecification[] => {
    const token = LAYER_TOKENS[layer.id];
    if (!token || (layer.type !== "background" && layer.type !== "fill" && layer.type !== "line")) return [];
    const paint = Object.entries(layer.paint ?? {}).filter(([name]) => !name.endsWith("-opacity"));
    return [
      {
        ...layer,
        paint: Object.fromEntries([...paint, [`${layer.type}-color`, color(token)]]),
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

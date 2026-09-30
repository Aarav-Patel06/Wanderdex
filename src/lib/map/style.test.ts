import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { pixelStyle } from "@/lib/map/style";

// A trimmed copy of OpenFreeMap Positron's shape.
const POSITRON = {
  version: 8,
  sources: {
    ne2_shaded: { type: "raster", tiles: ["https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png"] },
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  layers: [
    { id: "background", type: "background", paint: { "background-color": "rgb(242,243,240)" } },
    { id: "park", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": "green" } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "grey" } },
    { id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", paint: { "fill-color": "grey" } },
    {
      id: "highway_major_inner",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: { "line-color": "#fff", "line-width": 2 },
    },
    { id: "highway_minor", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "#eee" } },
    { id: "railway", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "#ddd" } },
    {
      id: "boundary_2",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      paint: { "line-color": "grey", "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 4, 1] },
    },
    { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": "{name}" } },
  ],
} as StyleSpecification;

const style = pixelStyle(POSITRON, (token) => `var(${token})`);

describe("pixelStyle", () => {
  it("keeps only the allowlisted layers", () => {
    expect(style.layers.map((layer) => layer.id)).toEqual([
      "background",
      "water",
      "highway_major_inner",
      "highway_minor",
      "boundary_2",
    ]);
  });

  it("recolors each kept layer with its palette token", () => {
    const colors = style.layers.map((layer) => {
      const paint = (layer.paint ?? {}) as Record<string, unknown>;
      return paint[`${layer.type}-color`];
    });
    expect(colors).toEqual([
      "var(--map-land)",
      "var(--map-ocean)",
      "var(--surface)",
      "var(--surface-dark)",
      "var(--map-border)",
    ]);
  });

  it("drops opacity and keeps other paint properties", () => {
    const [, , major, , border] = style.layers;
    expect(major.paint).toEqual({ "line-color": "var(--surface)", "line-width": 2 });
    expect(border.paint).toEqual({ "line-color": "var(--map-border)" });
  });

  it("drops glyphs, the sprite, and unused sources", () => {
    expect(style).not.toHaveProperty("glyphs");
    expect(style).not.toHaveProperty("sprite");
    expect(Object.keys(style.sources)).toEqual(["openmaptiles"]);
  });
});

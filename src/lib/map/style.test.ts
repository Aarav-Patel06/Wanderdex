import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { mapPixelRatio, pixelStyle } from "@/lib/map/style";

const LINES = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const MINOR = ["all", LINES, ["match", ["get", "class"], ["minor", "service", "track"], true, false]];

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
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-antialias": true, "fill-color": "grey" },
    },
    { id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", paint: { "fill-color": "grey" } },
    {
      id: "highway_path",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["all", LINES, ["==", ["get", "class"], "path"]],
      paint: { "line-color": "#eee" },
    },
    {
      id: "highway_minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 8,
      filter: MINOR,
      paint: { "line-color": "#eee", "line-opacity": 0.9, "line-width": 1.8 },
    },
    {
      id: "highway_major_inner",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 11,
      filter: LINES,
      layout: { "line-cap": "round" },
      paint: { "line-color": "#fff", "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 10, 2, 20, 20] },
    },
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

const color = (token: string) => `var(${token})`;
const all = pixelStyle(POSITRON, color, { mapPx: 2.5, roads: "all" });
const major = pixelStyle(POSITRON, color, { mapPx: 2.5, roads: "major" });
const layer = (style: StyleSpecification, id: string) => style.layers.find((layer) => layer.id === id);

describe("pixelStyle", () => {
  it("keeps only the allowlisted layers", () => {
    expect(all.layers.map((layer) => layer.id)).toEqual([
      "background",
      "water",
      "highway_path",
      "highway_minor",
      "highway_major_inner",
      "boundary_2",
    ]);
  });

  it("recolors each kept layer with its palette token", () => {
    const colors = all.layers.map((layer) => {
      const paint = (layer.paint ?? {}) as Record<string, unknown>;
      return paint[`${layer.type}-color`];
    });
    expect(colors).toEqual([
      "var(--map-land)",
      "var(--map-ocean)",
      "var(--surface-dark)",
      "var(--surface-dark)",
      "var(--surface)",
      "var(--map-border)",
    ]);
  });

  it("drops opacity and makes every line 2 map pixels wide", () => {
    expect(layer(all, "highway_minor")?.paint).toEqual({ "line-color": "var(--surface-dark)", "line-width": 5 });
    expect(layer(all, "highway_major_inner")?.paint).toEqual({ "line-color": "var(--surface)", "line-width": 5 });
    expect(layer(all, "boundary_2")?.paint).toEqual({ "line-color": "var(--map-border)", "line-width": 5 });
  });

  it("turns off fill antialiasing", () => {
    expect(layer(all, "water")?.paint).toEqual({ "fill-antialias": false, "fill-color": "var(--map-ocean)" });
  });

  it("keeps other layer properties", () => {
    expect(layer(all, "highway_major_inner")).toMatchObject({ minzoom: 11, filter: LINES, layout: { "line-cap": "round" } });
  });

  it("keeps Positron's roads with roads=all", () => {
    expect(layer(all, "highway_minor")).toMatchObject({ minzoom: 8, filter: MINOR });
  });

  it("keeps only the bigger roads at city zoom with roads=major", () => {
    expect(major.layers.map((layer) => layer.id)).not.toContain("highway_path");
    expect(layer(major, "highway_minor")).toMatchObject({
      minzoom: 16,
      filter: ["all", MINOR, ["==", ["get", "class"], "minor"]],
    });
    expect(layer(major, "highway_major_inner")).toMatchObject({
      minzoom: 11,
      filter: [
        "all",
        LINES,
        [
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
      ],
    });
  });

  it("drops glyphs, the sprite, and unused sources", () => {
    expect(all).not.toHaveProperty("glyphs");
    expect(all).not.toHaveProperty("sprite");
    expect(Object.keys(all.sources)).toEqual(["openmaptiles"]);
  });
});

describe("mapPixelRatio", () => {
  it("makes each map pixel a whole number of device pixels", () => {
    expect(mapPixelRatio(3, 2)).toBe(0.5); // iPhone: 6 device pixels
    expect(mapPixelRatio(2, 2)).toBe(0.5); // 4
    expect(mapPixelRatio(1, 2)).toBe(0.5); // 2
    expect(mapPixelRatio(1.5, 2)).toBe(0.5); // 3
    expect(mapPixelRatio(1.25, 2)).toBe(1.25 / 3); // 2.5 rounds to 3
    expect(mapPixelRatio(1.25, 3)).toBe(1.25 / 4); // 3.75 rounds to 4
    expect(mapPixelRatio(3, 4)).toBe(0.25); // 12
  });

  it("never goes above the device pixel ratio", () => {
    expect(mapPixelRatio(1, 0.25)).toBe(1);
  });
});

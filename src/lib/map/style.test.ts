import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { blockAt, mapPixelRatio, minZoomFor, modeAt, modePaints, pixelStyle } from "@/lib/map/style";

const LINES = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];

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
    { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "grey" } },
    {
      id: "highway_minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 8,
      filter: LINES,
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
    {
      id: "boundary_disputed",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      paint: { "line-color": "grey", "line-dasharray": [1, 2] },
    },
    { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": "{name}" } },
  ],
} as StyleSpecification;

const style = pixelStyle(POSITRON, (token) => `var(${token})`);
const layer = (id: string) => style.layers.find((layer) => layer.id === id);
const paintOf = (mode: "pixel" | "smooth", mapPx: number) =>
  Object.fromEntries(modePaints(style, mode, mapPx).map(([id, name, value]) => [`${id} ${name}`, value]));

describe("pixelStyle", () => {
  it("keeps only the allowlisted layers", () => {
    expect(style.layers.map((layer) => layer.id)).toEqual([
      "background",
      "water",
      "waterway",
      "highway_minor",
      "highway_major_inner",
      "boundary_2",
      "boundary_disputed",
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
      "var(--map-ocean)",
      "var(--surface-dark)",
      "var(--surface)",
      "var(--map-border)",
      "var(--map-border)",
    ]);
  });

  it("drops opacity and starts with smooth mode's paint values", () => {
    expect(layer("highway_major_inner")?.paint).toEqual({
      "line-color": "var(--surface)",
      "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 10, 2, 20, 20],
    });
    expect(layer("boundary_2")?.paint).toEqual({
      "line-color": "var(--map-border)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 5, 1.2, 12, 3],
      "line-blur": 0,
    });
    expect(layer("water")?.paint).toEqual({ "fill-antialias": true, "fill-color": "var(--map-ocean)" });
  });

  it("keeps other layer properties and Positron's road filters", () => {
    expect(layer("highway_major_inner")).toMatchObject({ minzoom: 11, filter: LINES, layout: { "line-cap": "round" } });
    expect(layer("highway_minor")).toMatchObject({ minzoom: 8, filter: LINES });
  });

  it("has no transitions, so a mode switch snaps", () => {
    expect(style.transition).toEqual({ duration: 0, delay: 0 });
  });

  it("drops glyphs, the sprite, and unused sources", () => {
    expect(style).not.toHaveProperty("glyphs");
    expect(style).not.toHaveProperty("sprite");
    expect(Object.keys(style.sources)).toEqual(["openmaptiles"]);
  });
});

describe("modePaints", () => {
  it("in pixel mode: hard fill edges, 2-map-pixel roads, crisp 1-map-pixel borders, no rivers or disputed borders", () => {
    const pixel = paintOf("pixel", 3);
    expect(pixel).toEqual({
      "water fill-antialias": false,
      "waterway line-width": 0,
      "highway_minor line-width": 6,
      "highway_major_inner line-width": 6,
      "boundary_2 line-width": expect.closeTo(0.06),
      "boundary_2 line-blur": expect.closeTo(-2.94),
      "boundary_disputed line-width": 0,
    });
    // MapLibre fades over line-blur + 1 map pixel: almost nothing is left.
    expect((pixel["boundary_2 line-blur"] as number) + 3).toBeCloseTo(0.06);
  });

  it("keeps disputed borders dashed in smooth mode", () => {
    expect(layer("boundary_disputed")?.paint).toMatchObject({ "line-dasharray": [1, 2] });
    expect(paintOf("smooth", 3)).not.toHaveProperty(["boundary_disputed line-dasharray"]);
  });

  it("in smooth mode: matches the style as built", () => {
    for (const [id, name, value] of modePaints(style, "smooth", 3)) {
      expect((layer(id)?.paint as Record<string, unknown>)[name]).toEqual(value);
    }
  });

  it("sets the same properties in both modes, so a switch either way overwrites all of them", () => {
    expect(Object.keys(paintOf("smooth", 3))).toEqual(Object.keys(paintOf("pixel", 3)));
  });
});

describe("modeAt", () => {
  it("starts smooth at or above the threshold", () => {
    expect(modeAt(4.99, 5)).toBe("pixel");
    expect(modeAt(5, 5)).toBe("smooth");
  });

  it("goes smooth at the threshold, and back to pixel only half a zoom below it", () => {
    expect(modeAt(5, 5, "pixel")).toBe("smooth");
    expect(modeAt(4.9, 5, "pixel")).toBe("pixel");
    expect(modeAt(4.5, 5, "smooth")).toBe("smooth");
    expect(modeAt(4.49, 5, "smooth")).toBe("pixel");
  });
});

describe("blockAt", () => {
  it("starts at 2 below zoom 2 and 3 from there", () => {
    expect(blockAt(-0.4)).toBe(2);
    expect(blockAt(1.99)).toBe(2);
    expect(blockAt(2)).toBe(3);
  });

  it("goes to 2 below zoom 2, and back to 3 only above 2.5", () => {
    expect(blockAt(2.2, 3)).toBe(3);
    expect(blockAt(1.9, 3)).toBe(2);
    expect(blockAt(2.2, 2)).toBe(2);
    expect(blockAt(2.5, 2)).toBe(2);
    expect(blockAt(2.51, 2)).toBe(3);
  });
});

describe("minZoomFor", () => {
  it("is the zoom at which the 512 × 2^zoom world is as wide as the map", () => {
    expect(minZoomFor(512)).toBe(0);
    expect(minZoomFor(1024)).toBe(1);
    expect(minZoomFor(393)).toBeCloseTo(-0.382, 3); // phone
    expect(minZoomFor(1632)).toBeCloseTo(1.672, 3); // 1920px desktop minus the sidebar
  });

  it("stays within MapLibre's zoom range", () => {
    expect(minZoomFor(0)).toBe(-2);
    expect(minZoomFor(100)).toBe(-2);
  });
});

describe("mapPixelRatio", () => {
  it("makes each map pixel a whole number of device pixels", () => {
    expect(mapPixelRatio(3, 3)).toBe(1 / 3); // iPhone: 9 device pixels
    expect(mapPixelRatio(2, 3)).toBe(1 / 3); // 6
    expect(mapPixelRatio(1, 3)).toBe(1 / 3); // 3
    expect(mapPixelRatio(1.25, 3)).toBe(1.25 / 4); // 3.75 rounds to 4
    expect(mapPixelRatio(1.5, 3)).toBe(1.5 / 5); // 4.5 rounds to 5
    expect(mapPixelRatio(3, 2)).toBe(0.5); // block 2 on an iPhone: 6 device pixels
    expect(mapPixelRatio(1.25, 2)).toBe(1.25 / 3); // 2.5 rounds to 3
  });

  it("never goes above the device pixel ratio", () => {
    expect(mapPixelRatio(1, 0.25)).toBe(1);
  });
});

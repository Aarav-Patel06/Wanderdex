"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Image from "next/image";
import Link from "next/link";
import {
  LngLatBounds,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  Marker,
  type Offset,
  Popup,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Minus } from "pixelarticons/react/Minus";
import { Plus } from "pixelarticons/react/Plus";
import Supercluster from "supercluster";

import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { type Category, CATEGORY_LABELS, categorySprite } from "@/lib/categories";
import { clusterLabel, type MapPlace, type NewPin } from "@/lib/map/places";
import {
  BASE_STYLE_URL,
  blockAt,
  type MapMode,
  mapPixelRatio,
  type MapToken,
  minZoomFor,
  modeAt,
  modePaints,
  pixelStyle,
} from "@/lib/map/style";

import "./map.css";

// The hybrid map (SPEC §13.1). Below SMOOTH_AT it's pixelated, one map pixel being about
// blockAt(zoom) CSS pixels (rounded to whole device pixels by mapPixelRatio). From SMOOTH_AT
// it's smooth: full device pixel ratio, no pixelation. Picked on a real phone.
const SMOOTH_AT = 5;

const START_MAX_ZOOM = 12;
const FIT_PADDING = 64;
// The whole world, minus the stretched polar rows. The minimum zoom (minZoomFor) can keep the
// start view from zooming out far enough to fit all of it; then it's centered on these bounds.
const WORLD_BOUNDS: LngLatBoundsLike = [
  [-180, -60],
  [180, 75],
];
const CLUSTER_RADIUS_PX = 40;
// Pans to a new pin at least this close, so it shows as a pin rather than inside a cluster.
const FOCUS_ZOOM = 12;

// The selected pin is 64px tall and anchored at its bottom tip. The card sits above it
// (bottom anchors, 72px up clears the pin plus the card's 4px shadow), or below the tip when
// there's no room above. POPUP_PADDING rules out the side anchors.
const POPUP_OFFSET: Offset = {
  center: [0, -32],
  top: [0, 8],
  "top-left": [0, 8],
  "top-right": [0, 8],
  bottom: [0, -72],
  "bottom-left": [0, -72],
  "bottom-right": [0, -72],
  left: [36, -32],
  right: [-36, -32],
};
// MapLibre's auto-anchor puts the card beside the pin ("left"/"right", centered on it) when the
// pin is near a side edge, which on a phone is most of the screen, and the card then covers the
// pin's edge. An endless bottom padding makes "doesn't fit below" always true, so the card goes
// above the pin unless it doesn't fit there either (then below). Only the corners and top/bottom remain.
const POPUP_PADDING = { bottom: Infinity };

type PinProps = { id: string; name: string; category: Category };

const pinKey = (id: string | null) => `p:${id}`;

// `focus` is the pin to pan to; a new object each time a visit is saved.
export function MapView({ places, focus }: { places: MapPlace[]; focus: NewPin | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef(selectedId);
  const markers = useRef(new Map<string, Marker>());
  const [popupNode] = useState(() => document.createElement("div"));
  // Only the places at first render decide the start view (SPEC §13.1).
  const [startBounds] = useState(() => startBoundsOf(places));

  const index = useMemo(() => {
    const index = new Supercluster<PinProps>({ radius: CLUSTER_RADIUS_PX });
    index.load(
      places.map((place) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [place.lng, place.lat] },
        properties: { id: place.id, name: place.name, category: place.category },
      })),
    );
    return index;
  }, [places]);

  const selected = places.find((place) => place.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | undefined;
    let dprQuery: MediaQueryList | undefined;
    let onDprChange: (() => void) | undefined;
    fetch(BASE_STYLE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`style request failed (${res.status})`);
        return res.json();
      })
      .then((base) => {
        if (cancelled || !containerRef.current) return;
        // The style comes after the start view is known, since the start zoom picks the mode.
        const map = new MapLibreMap({
          container: containerRef.current,
          bounds: startBounds,
          fitBoundsOptions: { padding: FIT_PADDING, maxZoom: START_MAX_ZOOM },
          // Set before the start view is fitted, so the fit can't zoom out past it.
          minZoom: minZoomFor(containerRef.current.clientWidth),
          attributionControl: { compact: false },
          // There's no compass button, so there'd be no way back from a rotated or tilted map.
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        created = map;
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();

        // Stop zooming out once the world is as wide as the map: further out, the pixels swallow
        // countries. MapLibre fires resize for container size changes, orientation changes
        // included. setMinZoom zooms back in if the map is now below the new minimum.
        map.on("resize", () => {
          const minZoom = minZoomFor(map.getContainer().clientWidth);
          if (map.getMinZoom() !== minZoom) map.setMinZoom(minZoom);
        });

        let mode: MapMode = modeAt(map.getZoom(), SMOOTH_AT);
        let block = blockAt(map.getZoom());
        // Both depend on the device pixel ratio, which changes when the window moves to another
        // monitor or the page is zoomed. Pixel mode's line widths are measured in map pixels.
        const mapPx = () => 1 / mapPixelRatio(devicePixelRatio, block);
        const pixelRatio = () => (mode === "pixel" ? mapPixelRatio(devicePixelRatio, block) : devicePixelRatio);
        const css = getComputedStyle(document.documentElement);
        const style = pixelStyle(base, (token: MapToken) => css.getPropertyValue(token).trim());
        map.setPixelRatio(pixelRatio());
        map.getContainer().toggleAttribute("data-pixelated", mode === "pixel");
        map.setStyle(style);

        // Switches modes, and pixel mode's block size, in place: MapLibre's pixel ratio plus a
        // few paint values, never a remount or a style reload. Runs when a movement ends (after
        // a pinch's inertia too),
        // so never mid-gesture, and snaps (the style has no transitions). Both setters skip
        // unchanged values, so running it on every moveend is cheap, and the moveend that
        // setPixelRatio fires itself finds nothing left to do. Validation is off because pixel
        // mode's crisp borders use a negative line-blur, which the style spec doesn't allow
        // (see CRISP in style.ts); the values are fixed and unit tested.
        const sync = () => {
          mode = modeAt(map.getZoom(), SMOOTH_AT, mode);
          block = blockAt(map.getZoom(), block);
          map.getContainer().toggleAttribute("data-pixelated", mode === "pixel");
          for (const [id, name, value] of modePaints(style, mode, mapPx())) {
            map.setPaintProperty(id, name, value, { validate: false });
          }
          if (map.getPixelRatio() !== pixelRatio()) map.setPixelRatio(pixelRatio());
        };

        // MapLibre doesn't watch the device pixel ratio itself. The query matches only the
        // current ratio, so it fires once on any change and is then replaced.
        const onDpr = () => {
          sync();
          watchDpr();
        };
        const watchDpr = () => {
          dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
          dprQuery.addEventListener("change", onDpr, { once: true });
        };
        onDprChange = onDpr;

        // setPaintProperty needs the style parsed. The style starts with smooth mode's values, so
        // this also applies pixel mode's, before any layer is drawn.
        map.once("style.load", () => {
          sync();
          map.on("moveend", sync);
          watchDpr();
        });
        setMap(map);
      })
      .catch((error) => console.error("Overworld map failed to load:", error));
    return () => {
      cancelled = true;
      if (onDprChange) dprQuery?.removeEventListener("change", onDprChange);
      created?.remove();
    };
  }, [startBounds]);

  // HTML markers only, never symbol layers: the canvas is pixelated, markers stay crisp (SPEC §13.4).
  // Recomputed on moveend, which zooming fires too, and only for what's in view.
  useEffect(() => {
    if (!map) return;
    const shown = markers.current;

    function render(map: MapLibreMap) {
      const b = map.getBounds();
      const items = index.getClusters(
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        Math.floor(map.getZoom()),
      );
      const next = new Map<string, Marker>();
      for (const item of items) {
        const [lng, lat] = item.geometry.coordinates;
        const props = item.properties;
        const key = "cluster" in props ? `c:${props.cluster_id}` : pinKey(props.id);
        let marker = shown.get(key);
        if (!marker) {
          const element =
            "cluster" in props
              ? pinButton(`${props.point_count} places`, "/sprites/pin_group.png", clusterLabel(props.point_count), () =>
                  map.easeTo({ center: [lng, lat], zoom: index.getClusterExpansionZoom(props.cluster_id) }),
                )
              : pinButton(props.name, categorySprite(props.category), null, () => setSelectedId(props.id));
          marker = new Marker({ element, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
        }
        next.set(key, marker);
      }
      for (const [key, marker] of shown) if (!next.has(key)) marker.remove();
      shown.clear();
      next.forEach((marker, key) => shown.set(key, marker));
      markSelected(shown, selectedRef.current);
      // Close the popup once its pin is folded into a cluster or out of view.
      if (selectedRef.current && !shown.has(pinKey(selectedRef.current))) setSelectedId(null);
    }

    const onMoveEnd = () => render(map);
    render(map);
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      shown.forEach((marker) => marker.remove());
      shown.clear();
    };
  }, [map, index]);

  useEffect(() => {
    selectedRef.current = selectedId;
    markSelected(markers.current, selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!map || !selected) return;
    const popup = new Popup({
      closeButton: false,
      offset: POPUP_OFFSET,
      padding: POPUP_PADDING,
      maxWidth: "none",
      className: "pin-popup",
    })
      .setLngLat([selected.lng, selected.lat])
      .setDOMContent(popupNode)
      .addTo(map);
    // Tapping the map closes it (closeOnClick).
    const onClose = () => setSelectedId(null);
    popup.on("close", onClose);
    return () => {
      popup.off("close", onClose);
      popup.remove();
    };
  }, [map, selected, popupNode]);

  useEffect(() => {
    if (!map || !focus) return;
    // Open its popup once the flight ends, if it shows as its own pin (not inside a cluster).
    const select = () => {
      if (markers.current.has(pinKey(focus.id))) setSelectedId(focus.id);
    };
    map.once("moveend", select);
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM) });
    return () => {
      map.off("moveend", select);
    };
  }, [map, focus]);

  return (
    <div className="absolute inset-0">
      {/* data-pixelated is set on it by the mode switch. */}
      <div ref={containerRef} className="size-full" />

      {/* Mobile: below the avatar menu button (top-right, 44px + shadow). Desktop: top-right. */}
      <div className="absolute top-[calc(4.75rem+env(safe-area-inset-top))] right-[calc(1.25rem+env(safe-area-inset-right))] flex flex-col gap-4 md:top-[calc(1rem+env(safe-area-inset-top))]">
        <Button variant="secondary" size="icon" aria-label="Zoom in" onClick={() => map?.zoomIn()} className="mx-0">
          <Plus aria-hidden="true" className="size-6" />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Zoom out" onClick={() => map?.zoomOut()} className="mx-0">
          <Minus aria-hidden="true" className="size-6" />
        </Button>
      </div>

      {selected && createPortal(<PinCard place={selected} />, popupNode)}
    </div>
  );
}

function startBoundsOf(places: MapPlace[]): LngLatBoundsLike {
  if (!places.length) return WORLD_BOUNDS;
  const bounds = new LngLatBounds();
  for (const place of places) bounds.extend([place.lng, place.lat]);
  return bounds;
}

// A 44px tap target (SPEC §16.5) with the 32px sprite at its bottom, so the marker's
// bottom anchor is the pin's tip. The selected pin grows to 64px.
function pinButton(label: string, sprite: string, badge: string | null, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.className =
    "group flex size-11 cursor-pointer items-end justify-center data-selected:z-10 data-selected:size-16";
  button.addEventListener("click", (event) => {
    // Keep the map from seeing this tap, which would close the popup it opens.
    event.stopPropagation();
    onClick();
  });

  const frame = document.createElement("span");
  frame.className = "relative";
  const img = document.createElement("img");
  img.src = sprite;
  img.alt = "";
  img.draggable = false;
  img.className = "pixelated block size-8 group-data-selected:size-16";
  frame.append(img);

  // Cluster count badge on the sprite's top-right corner: cream pixel text on the text color.
  if (badge) {
    const count = document.createElement("span");
    count.className = "absolute -top-1 -right-3 bg-text px-1 py-0.5 font-display text-tab text-background";
    count.textContent = badge;
    frame.append(count);
  }

  button.append(frame);
  return button;
}

function markSelected(markers: Map<string, Marker>, selectedId: string | null) {
  markers.forEach((marker, key) =>
    marker.getElement().toggleAttribute("data-selected", key === pinKey(selectedId)),
  );
}

function PinCard({ place }: { place: MapPlace }) {
  const where = [place.city, place.country].filter(Boolean).join(", ");
  return (
    <Card className="w-64 font-body">
      <CardHeader>
        <CardTitle className="break-words">{place.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="flex items-center gap-2">
          <Image
            src={categorySprite(place.category)}
            alt=""
            width={32}
            height={32}
            unoptimized
            className="pixelated"
          />
          {CATEGORY_LABELS[place.category]}
        </p>
        {where && <p>{where}</p>}
        <p>{place.visits === 1 ? "1 visit" : `${place.visits} visits`}</p>
        <Button asChild className="mt-2 self-start">
          <Link href={`/places/${place.id}`}>View</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

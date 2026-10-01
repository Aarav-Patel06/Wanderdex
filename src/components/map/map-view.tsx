"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Image from "next/image";
import Link from "next/link";
import {
  LngLatBounds,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  Marker,
  type Offset,
  type PaddingOptions,
  Popup,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { InfoBox } from "pixelarticons/react/InfoBox";
import { Minus } from "pixelarticons/react/Minus";
import { Plus } from "pixelarticons/react/Plus";
import Supercluster from "supercluster";

import { Loading } from "@/components/loading";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { CATEGORIES, type Category, CATEGORY_LABELS, categorySprite } from "@/lib/categories";
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
import { cn } from "@/lib/utils";

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

// Single pins double in size from this zoom up (SPEC §13.4; the sizes are in map.css).
const NEAR_ZOOM = 14;

// The popup card's pixel tail (map.css) reaches 18px past the card; 8px more leaves room for
// its 4px shadow plus a gap before the pin. At a corner anchor, the card shifts so the pin is
// TAIL_INSET px in from that corner, under the tail.
const TAIL_REACH = 26;
const TAIL_INSET = 30;

// The selected pin is anchored at its bottom tip and is pinHeight tall (64px, or 96px when
// near). The card sits above it (bottom anchors), or below the tip when there's no room above.
// popupPadding rules out the side anchors.
function popupOffset(pinHeight: number): Offset {
  const above = -(pinHeight + TAIL_REACH);
  return {
    center: [0, -pinHeight / 2],
    top: [0, TAIL_REACH],
    "top-left": [-TAIL_INSET, TAIL_REACH],
    "top-right": [TAIL_INSET, TAIL_REACH],
    bottom: [0, above],
    "bottom-left": [-TAIL_INSET, above],
    "bottom-right": [TAIL_INSET, above],
    left: [pinHeight / 2 + 4, -pinHeight / 2],
    right: [-(pinHeight / 2 + 4), -pinHeight / 2],
  };
}

// MapLibre's auto-anchor puts the card beside the pin ("left"/"right", centered on it) when the
// pin is near a side edge, which on a phone is most of the screen, and the card then covers the
// pin's edge. An endless bottom padding makes "doesn't fit below" always true, so the card goes
// above the pin unless it doesn't fit there either (then below). Only the corners and top/bottom
// remain. The side padding keeps the card out from under the desktop sidebar and panels.
const popupPadding = ({ left, right }: PaddingOptions) => ({ bottom: Infinity, left, right });

// How far the panels floating over the map reach into it (SPEC §13.1): the desktop sidebar on
// the left (SPEC §14.1), and the confirmation panel on the right (data-map-cover, see
// useMapCover). A hidden panel (display: none, e.g. the sidebar on mobile) has an all-zero rect
// and counts as 0.
type Padding = { top: number; right: number; bottom: number; left: number };

function cameraPadding(container: HTMLElement): Padding {
  const box = container.getBoundingClientRect();
  const reach = (selector: string, inset: (rect: DOMRect) => number) =>
    Math.max(
      0,
      ...Array.from(document.querySelectorAll(selector), (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height ? Math.round(inset(rect)) : 0;
      }),
    );
  return {
    top: 0,
    left: reach("[data-sidebar]", (rect) => rect.right - box.left),
    right: reach('[data-map-cover="right"]', (rect) => box.right - rect.left),
    bottom: 0,
  };
}

// Brings the camera's padding up to date without moving the map on screen: only the padded
// center (where flyTo, fitBounds, and zooming aim) moves. A padding change is a jumpTo, which
// would cut a flight or a pinch's inertia short, so while the map moves it waits for moveend.
function syncPadding(map: MapLibreMap, atMoveEnd = false) {
  if (!atMoveEnd && map.isMoving()) return;
  const next = cameraPadding(map.getContainer());
  const { top = 0, right = 0, bottom = 0, left = 0 } = map.getPadding();
  if (next.top === top && next.right === right && next.bottom === bottom && next.left === left) return;
  const center = map.project(map.getCenter());
  const dx = (next.left - left - (next.right - right)) / 2;
  const dy = (next.top - top - (next.bottom - bottom)) / 2;
  map.jumpTo({ center: map.unproject([center.x + dx, center.y + dy]), padding: next });
}

type PinProps = { id: string; name: string; category: Category };

const pinKey = (id: string | null) => `p:${id}`;

// `focus` is the pin to pan to; a new object each time a visit is saved. `coverTick` changes
// when a panel over the map changes (useMapCover).
export function MapView({
  places,
  focus,
  coverTick,
}: {
  places: MapPlace[];
  focus: NewPin | null;
  coverTick: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [near, setNear] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const legendId = useId();
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

        // The camera's padding keeps the start view's fit, flyTo, and zooming centered in the
        // part of the map the desktop sidebar and panels don't cover. It's set before the fit,
        // which adds FIT_PADDING on top of it. Duration 0 fits at once, as the constructor's
        // bounds would.
        map.setPadding(cameraPadding(containerRef.current));
        map.fitBounds(startBounds, { padding: FIT_PADDING, maxZoom: START_MAX_ZOOM, duration: 0 });
        setNear(map.getZoom() >= NEAR_ZOOM);
        map.on("zoom", () => setNear(map.getZoom() >= NEAR_ZOOM));
        map.once("load", () => setLoaded(true));

        // Stop zooming out once the world is as wide as the map: further out, the pixels swallow
        // countries. MapLibre fires resize for container size changes, orientation changes
        // included. setMinZoom zooms back in if the map is now below the new minimum. The
        // sidebar comes and goes at the desktop breakpoint, so the camera's padding follows it. Padding changes wait for a movement to end.
        map.on("resize", () => {
          const minZoom = minZoomFor(map.getContainer().clientWidth);
          if (map.getMinZoom() !== minZoom) map.setMinZoom(minZoom);
          syncPadding(map);
        });
        map.on("moveend", () => syncPadding(map, true));

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
    if (map) syncPadding(map);
  }, [map, coverTick]);

  useEffect(() => {
    selectedRef.current = selectedId;
    markSelected(markers.current, selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!map || !selected) return;
    const popup = new Popup({
      closeButton: false,
      offset: popupOffset(near ? 96 : 64),
      padding: popupPadding(map.getPadding()),
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
  }, [map, selected, popupNode, near]);

  useEffect(() => {
    if (!map || !focus) return;
    // Open its popup once the flight ends, if it shows as its own pin (not inside a cluster).
    const select = () => {
      if (markers.current.has(pinKey(focus.id))) setSelectedId(focus.id);
    };
    map.once("moveend", select);
    // The panels as they are now (the confirmation card has just closed), so the flight ends
    // centered in the uncovered part of the map and leaves that padding in place.
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      padding: cameraPadding(map.getContainer()),
    });
    return () => {
      map.off("moveend", select);
    };
  }, [map, focus]);

  return (
    <div className="absolute inset-0">
      {/* data-pixelated is set on it by the mode switch; data-near grows the pins (map.css). */}
      <div ref={containerRef} data-near={near || undefined} className="size-full" />

      {/* Until the first full draw (same plate as the code-loading one in overworld.tsx). */}
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loading className="bg-text px-4 py-3 text-background" />
        </div>
      )}

      {/* Mobile: below the avatar menu button (top-right, 44px + shadow), with the same inset from
          the edge. Desktop: top-right, left of the confirmation panel while it's open
          (--map-right, map.css). The icon buttons' pixel border sits 4px outside them, hence
          mr-1: the border's outer edge lines up with the avatar's. z-10 keeps them above the
          legend and the popups. */}
      <div
        className={cn(
          CONTROLS_TOP,
          "absolute right-[calc(1rem+var(--map-right,0px)+env(safe-area-inset-right))] z-10 flex flex-col gap-4",
        )}
      >
        <Button variant="secondary" size="icon" aria-label="Zoom in" onClick={() => map?.zoomIn()} className="mr-1 ml-0">
          <Plus aria-hidden="true" className="size-6" />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Zoom out" onClick={() => map?.zoomOut()} className="mr-1 ml-0">
          <Minus aria-hidden="true" className="size-6" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Map legend"
          aria-expanded={legendOpen}
          aria-controls={legendId}
          onClick={() => setLegendOpen((open) => !open)}
          className="mr-1 ml-0"
        >
          <InfoBox aria-hidden="true" className="size-6" />
        </Button>
      </div>

      {legendOpen && <MapLegend id={legendId} />}

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

// A tap target of at least 44px (SPEC §16.5) with the sprite at its bottom, so the marker's
// bottom anchor is the pin's tip. The sizes are in map.css: single pins (.pin-place) grow when
// selected and when zoomed in; clusters stay 32px.
function pinButton(label: string, sprite: string, badge: string | null, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.className = badge ? "pin" : "pin pin-place";
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
  img.className = "pixelated";
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

// A speech bubble: the card plus a pixel tail pointing at the pin (map.css). The shadow is on
// the wrapper so it follows the tail too. Everything lines up on the content's left edge; the
// button's pixel border sits 6px outside its box, hence its 6px side margins.
function PinCard({ place }: { place: MapPlace }) {
  const where = [place.city, place.country].filter(Boolean).join(", ");
  return (
    <div className="relative drop-shadow-pixel">
      <Card className="w-64 font-body drop-shadow-none">
        <CardContent className="flex flex-col gap-2">
          <CardTitle className="break-words">{place.name}</CardTitle>
          <p className="flex items-center gap-2">
            {CATEGORY_LABELS[place.category]}
            <Image
              src={categorySprite(place.category)}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="pixelated"
            />
          </p>
          {where && <p>{where}</p>}
          <hr className="border-0 border-t border-text" />
          <p>{place.visits === 1 ? "1 visit" : `${place.visits} visits`}</p>
          <Button asChild className="mx-1.5 mt-2">
            <Link href={`/places/${place.id}`}>View</Link>
          </Button>
        </CardContent>
      </Card>
      <span aria-hidden="true" className="speech-tail pin-tail" />
    </div>
  );
}

// Mobile: below the avatar menu button. Desktop: top-right.
const CONTROLS_TOP = "top-[calc(4.75rem+env(safe-area-inset-top))] md:top-[calc(1rem+env(safe-area-inset-top))]";

// Never covers the map controls, and is never taller than the map minus room for the
// attribution; it scrolls inside when it doesn't fit (SPEC §13.6). Mobile: below the controls
// (their three 44px buttons with 16px gaps = 164px, their 4px shadow, a 16px gap), across the
// map's width, in two columns. Desktop: beside the controls, top-aligned with them, in one
// column; 70px = the 44px buttons + their 4px outside border + a 16px gap + the card's 6px
// outside border. Both leave room for the card's 6px outside side borders.
function MapLegend({ id }: { id: string }) {
  return (
    <div
      className={cn(
        "absolute top-[calc(4.75rem+184px+env(safe-area-inset-top))] right-[calc(1rem+6px+env(safe-area-inset-right))] left-[calc(1rem+6px+env(safe-area-inset-left))] flex max-h-[calc(100%-4.75rem-184px-env(safe-area-inset-top)-4rem)] flex-col",
        "md:top-[calc(1rem+env(safe-area-inset-top))] md:right-[calc(1.25rem+70px+var(--map-right,0px)+env(safe-area-inset-right))] md:left-auto md:max-h-[calc(100%-1rem-env(safe-area-inset-top)-4rem)]",
      )}
    >
      <Card
        id={id}
        role="region"
        aria-labelledby={`${id}-title`}
        className="flex min-h-0 w-full flex-col font-body [--card-spacing:--spacing(3)] md:w-56"
      >
        <CardHeader>
          <CardTitle id={`${id}-title`}>MAP LEGEND</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-tiny md:grid-cols-1 md:text-small">
            {CATEGORIES.map((category) => (
              <LegendRow key={category} sprite={categorySprite(category)} label={CATEGORY_LABELS[category]} />
            ))}
            <LegendRow sprite="/sprites/pin_group.png" label="Group" />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function LegendRow({ sprite, label }: { sprite: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <Image src={sprite} alt="" width={32} height={32} unoptimized className="pixelated shrink-0" />
      {label}
    </li>
  );
}

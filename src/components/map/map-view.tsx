"use client";

import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Image from "next/image";
import Link from "next/link";
import {
  type GeoJSONSource,
  LngLatBounds,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  type MapMouseEvent,
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

import { SpiritsError } from "@/components/dialogs/rpg-box";
import { Loading } from "@/components/loading";
import type { Drop, MapCenterRef } from "@/components/map/overworld";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { CATEGORIES, type Category, CATEGORY_LABELS, categorySprite } from "@/lib/categories";
import {
  clusterLabel,
  clusterZoomAt,
  countryCodes,
  type MapPlace,
  mapZoomFor,
  type NewPin,
  pinSizeAt,
  selectedPinSize,
} from "@/lib/map/places";
import {
  BASE_STYLE_URL,
  blockAt,
  COUNTRIES_SOURCE,
  COUNTRIES_URL,
  type MapMode,
  mapPixelRatio,
  type MapToken,
  minZoomFor,
  modeAt,
  modePaints,
  pixelStyle,
  VISITED_LAYER,
  visitedFilter,
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
// Placing a pin from a photo's coordinates starts at street level, close enough to move it to
// the right building.
const DROP_ZOOM = 16;
// The style and the first tiles have this long to load before the map counts as failed.
const LOAD_TIMEOUT_MS = 20_000;

// The popup card's pixel tail (map.css) reaches 18px past the card; 8px more leaves room for
// its 4px shadow plus a gap before the pin. At a corner anchor, the card shifts so the pin is
// TAIL_INSET px in from that corner, under the tail.
const TAIL_REACH = 26;
const TAIL_INSET = 30;

// The selected pin is anchored at its bottom tip and is pinHeight tall (selectedPinSize). The
// card sits above it (bottom anchors), or below the tip when there's no room above.
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
// when a panel over the map changes (useMapCover), and `coverOpens` when one opens. `drop` is the
// dropped pin (SPEC §11.4). `centerRef` gets a reader for the map's center (its crosshair).
export function MapView({
  places,
  focus,
  coverTick,
  coverOpens,
  drop,
  centerRef,
}: {
  places: MapPlace[];
  focus: NewPin | null;
  coverTick: number;
  coverOpens: number;
  drop: Drop | null;
  centerRef: MapCenterRef;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  // The style or the first tiles failed, or took too long (SPEC §11.7). Try again builds the map
  // afresh (a new attempt), without reloading the page.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Pins' and clusters' size (pinSizeAt), updated when a movement ends, so never mid-pinch.
  const [pinSize, setPinSize] = useState(32);
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

  // While a pin is being placed, a tap places it, so no place popup stays open.
  const onPick = drop?.onPick ?? null;
  if (onPick && selectedId) setSelectedId(null);

  // A panel opening over the map (the desktop confirmation panel) closes the popup, which could
  // otherwise end up under the zoom buttons as they move left of the panel.
  const [seenCoverOpens, setSeenCoverOpens] = useState(coverOpens);
  if (coverOpens !== seenCoverOpens) {
    setSeenCoverOpens(coverOpens);
    setSelectedId(null);
  }

  const selected = places.find((place) => place.id === selectedId) ?? null;
  const visitedCountries = useMemo(() => countryCodes(places), [places]);

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | undefined;
    let dprQuery: MediaQueryList | undefined;
    let onDprChange: (() => void) | undefined;
    // Until the first full draw, the style request failing, any map error (a tile, a source), or
    // the timeout means the map failed. Errors after that (a tile while panning offline) are only
    // logged.
    let drawn = false;
    const timeout = setTimeout(() => {
      console.error(`Overworld map didn't load within ${LOAD_TIMEOUT_MS / 1000} s`);
      setFailed(true);
    }, LOAD_TIMEOUT_MS);
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
        setPinSize(pinSizeAt(map.getZoom()));
        map.on("moveend", () => setPinSize(pinSizeAt(map.getZoom())));
        // The country shapes load once the map has drawn, so they hold up neither the first draw
        // nor the pins. MapLibre fetches and parses them off the main thread; if that fails, it
        // logs the error and the map carries on without the fill.
        map.on("error", ({ error }) => {
          console.error("Overworld map error:", error);
          if (!drawn) setFailed(true);
        });
        map.once("load", () => {
          drawn = true;
          clearTimeout(timeout);
          setLoaded(true);
          map.getSource<GeoJSONSource>(COUNTRIES_SOURCE)?.setData(COUNTRIES_URL);
        });

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
          // The visited-country fill is pixel mode's only (SPEC §13.3), so it and the
          // pixelation always change together.
          map.setLayoutProperty(VISITED_LAYER, "visibility", mode === "pixel" ? "visible" : "none");
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
      .catch((error) => {
        if (cancelled) return;
        console.error("Overworld map failed to load:", error);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (onDprChange) dprQuery?.removeEventListener("change", onDprChange);
      created?.remove();
    };
  }, [startBounds, attempt]);

  function retry() {
    setFailed(false);
    setLoaded(false);
    setMap(null);
    setAttempt((count) => count + 1);
  }

  // HTML markers only, never symbol layers: the canvas is pixelated, markers stay crisp (SPEC §13.4).
  // Recomputed on moveend, which zooming fires too, and only for what's in view. Clustered at
  // clusterZoomAt, so the radius grows with the pins; a cluster tap zooms to where it splits.
  useEffect(() => {
    if (!map) return;
    const shown = markers.current;

    function render(map: MapLibreMap) {
      const b = map.getBounds();
      const items = index.getClusters(
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        clusterZoomAt(map.getZoom()),
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
              ? pinButton(`${props.point_count} places`, "/sprites/pin_group.png", clusterLabel(props.point_count), () => {
                  setLegendOpen(false);
                  map.easeTo({ center: [lng, lat], zoom: mapZoomFor(index.getClusterExpansionZoom(props.cluster_id)) });
                })
              : pinButton(props.name, categorySprite(props.category), null, () => {
                  setLegendOpen(false);
                  setSelectedId(props.id);
                });
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

  // The legend (SPEC §13.6) also closes on Escape and on a tap or click on the map (a pin tap
  // closes it too, above). MapLibre doesn't report a drag or a pinch as a click.
  useEffect(() => {
    if (!legendOpen) return;
    const close = () => setLegendOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    document.addEventListener("keydown", onKeyDown);
    map?.on("click", close);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      map?.off("click", close);
    };
  }, [map, legendOpen]);

  // The style is ready from the first full draw. setFilter skips an unchanged filter.
  useEffect(() => {
    if (map && loaded) map.setFilter(VISITED_LAYER, visitedFilter(visitedCountries));
  }, [map, loaded, visitedCountries]);

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
      offset: popupOffset(selectedPinSize(pinSize)),
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
  }, [map, selected, popupNode, pinSize]);

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

  // Drop a pin (SPEC §11.4). The pixel pin, anchored at its tip; it takes no taps, so a tap on it
  // moves it like a tap anywhere else.
  const dropAt = drop?.at ?? null;
  useEffect(() => {
    if (!map || !dropAt) return;
    const marker = new Marker({ element: dropPinElement(), anchor: "bottom" }).setLngLat([dropAt.lng, dropAt.lat]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, dropAt]);

  // A tap (or click) on the map places the pin, and the next one moves it. MapLibre doesn't
  // report a drag or a pinch as a click.
  useEffect(() => {
    if (!map || !onPick) return;
    const onClick = (event: MapMouseEvent) => onPick({ lat: event.lngLat.lat, lng: event.lngLat.wrap().lng });
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, onPick]);

  // The center of the part of the map the panels leave uncovered, where the crosshair is: "Drop pin
  // at center" places the pin there (SPEC §11.4).
  useEffect(() => {
    if (!map) return;
    centerRef.current = () => {
      const center = map.getCenter();
      return { lat: center.lat, lng: center.wrap().lng };
    };
    return () => {
      centerRef.current = null;
    };
  }, [map, centerRef]);

  // While placing: the crosshair follows the camera's padding (the desktop sidebar), which only
  // changes when a movement ends or the map resizes. The map takes focus, so the arrow keys pan it.
  const placing = onPick !== null;
  useEffect(() => {
    if (!map || !placing) return;
    const wrapper = wrapperRef.current;
    const place = () => {
      const { x, y } = map.project(map.getCenter());
      wrapper?.style.setProperty("--crosshair-x", `${Math.round(x)}px`);
      wrapper?.style.setProperty("--crosshair-y", `${Math.round(y)}px`);
    };
    place();
    map.on("moveend", place);
    map.on("resize", place);
    map.getCanvas().focus({ preventScroll: true });
    return () => {
      map.off("moveend", place);
      map.off("resize", place);
    };
  }, [map, placing]);

  // Starting from a photo's coordinates: fly there, close enough to adjust the pin.
  const dropStart = drop?.start ?? null;
  useEffect(() => {
    if (!map || !dropStart) return;
    map.flyTo({ center: [dropStart.lng, dropStart.lat], zoom: Math.max(map.getZoom(), DROP_ZOOM) });
  }, [map, dropStart]);

  return (
    // data-placing: map.css turns the place pins' taps off and shows a crosshair cursor.
    <div ref={wrapperRef} className="absolute inset-0" data-placing={onPick ? "" : undefined}>
      {/* data-pixelated is set on it by the mode switch; the pin sizes are for map.css. */}
      <div
        ref={containerRef}
        style={{ "--pin-size": `${pinSize}px`, "--pin-selected": `${selectedPinSize(pinSize)}px` } as CSSProperties}
        className="size-full"
      />

      {/* While placing a pin: the crosshair at the map's center, where "Drop pin at center" puts
          the pin. */}
      {placing && <Crosshair />}

      {/* Until the first full draw (same plate as the code-loading one in overworld.tsx), or, if
          the map failed, the RPG error with Try again in its place. z-10: above the pins. */}
      {failed ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4 *:pointer-events-auto">
          <SpiritsError onRetry={retry} />
        </div>
      ) : (
        !loaded && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loading className="bg-text px-4 py-3 text-background" />
          </div>
        )
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
// bottom anchor is the pin's tip. The sizes are in map.css: pins and clusters take the map
// container's --pin-size, and the selected single pin (.pin-place) --pin-selected.
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
  // Its size grows with the pin (.pin-count in map.css).
  if (badge) {
    const count = document.createElement("span");
    count.className = "pin-count absolute bg-text font-display text-background";
    count.textContent = badge;
    frame.append(count);
  }

  button.append(frame);
  return button;
}

// The dropped pin: a round-headed map pin, unlike the category shields, drawn on a 12×16 pixel
// grid at 4× (48×64px, SPEC §16.5 rule 4) in palette colors: X outline (text), P fill (primary),
// C highlight (background).
const DROP_PIN = [
  "...XXXXXX...",
  "..XPPPPPPX..",
  ".XPPPPPPPPX.",
  "XPPPPCCPPPPX",
  "XPPPCCCCPPPX",
  "XPPPCCCCPPPX",
  "XPPPPCCPPPPX",
  "XPPPPPPPPPPX",
  ".XPPPPPPPPX.",
  ".XPPPPPPPPX.",
  "..XPPPPPPX..",
  "...XPPPPX...",
  "...XPPPPX...",
  "....XPPX....",
  "....XPPX....",
  ".....XX.....",
];
const DROP_PIN_COLORS = { X: "--text", P: "--primary", C: "--background" } as const;

// One <path> per color, a 1-pixel-tall rectangle per run of that color in a row.
const DROP_PIN_SVG = (() => {
  const paths = Object.entries(DROP_PIN_COLORS).map(([key, token]) => {
    let d = "";
    DROP_PIN.forEach((row, y) => {
      for (const match of row.matchAll(new RegExp(`${key}+`, "g"))) d += `M${match.index} ${y}h${match[0].length}v1h-${match[0].length}z`;
    });
    return `<path d="${d}" style="fill:var(${token})"/>`;
  });
  const width = DROP_PIN[0].length;
  const height = DROP_PIN.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 4}" height="${height * 4}" shape-rendering="crispEdges" aria-hidden="true">${paths.join("")}</svg>`;
})();

function dropPinElement() {
  const element = document.createElement("div");
  element.className = "drop-pin";
  element.innerHTML = DROP_PIN_SVG;
  return element;
}

// The placing crosshair: a pixel plus with a gap around its middle pixel, on a 13×13 grid at 2×
// (26px), in `text` with a 1-pixel `background` halo, so it reads over water, land, and buildings.
const CROSSHAIR_GRID = 13;
const CROSSHAIR_PATHS = (() => {
  const mid = (CROSSHAIR_GRID - 1) / 2;
  const core = new Set([`${mid},${mid}`]);
  for (let d = 2; d < mid; d++) {
    for (const [x, y] of [
      [mid, mid - d],
      [mid, mid + d],
      [mid - d, mid],
      [mid + d, mid],
    ]) {
      core.add(`${x},${y}`);
    }
  }
  const halo = new Set<string>();
  for (const cell of core) {
    const [x, y] = cell.split(",").map(Number);
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        if (!core.has(`${x + dx},${y + dy}`)) halo.add(`${x + dx},${y + dy}`);
      }
    }
  }
  const path = (cells: Set<string>) => [...cells].map((cell) => `M${cell.replace(",", " ")}h1v1h-1z`).join("");
  return { core: path(core), halo: path(halo) };
})();

function Crosshair() {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${CROSSHAIR_GRID} ${CROSSHAIR_GRID}`}
      width={CROSSHAIR_GRID * 2}
      height={CROSSHAIR_GRID * 2}
      shapeRendering="crispEdges"
      className="drop-crosshair"
    >
      <path d={CROSSHAIR_PATHS.halo} style={{ fill: "var(--background)" }} />
      <path d={CROSSHAIR_PATHS.core} style={{ fill: "var(--text)" }} />
    </svg>
  );
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
              <LegendRow
                key={category}
                icon={<LegendSprite src={categorySprite(category)} />}
                label={CATEGORY_LABELS[category]}
              />
            ))}
            <LegendRow icon={<LegendSprite src="/sprites/pin_group.png" />} label="Group" />
            <LegendRow icon={<span className="size-8 shrink-0 bg-visited" />} label="Visited country" />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function LegendRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {icon}
      {label}
    </li>
  );
}

function LegendSprite({ src }: { src: string }) {
  return <Image src={src} alt="" width={32} height={32} unoptimized className="pixelated shrink-0" />;
}

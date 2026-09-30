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
import { BASE_STYLE_URL, pixelStyle } from "@/lib/map/style";

import "./map.css";

// One fixed, low pixel ratio for the pixel look (SPEC §13.1). Tuned on real phones in Phase 3.
const MAP_PIXEL_RATIO = 0.5;

const START_MAX_ZOOM = 12;
const FIT_PADDING = 64;
// The whole world, minus the stretched polar rows. A 375px phone needs a little below zoom 0 to fit it.
const WORLD_BOUNDS: LngLatBoundsLike = [
  [-180, -60],
  [180, 75],
];
const MIN_ZOOM = -1;
const CLUSTER_RADIUS_PX = 40;
// Pans to a new pin at least this close, so it shows as a pin rather than inside a cluster.
const FOCUS_ZOOM = 12;

// The selected pin is 64px tall and anchored at its bottom tip; the popup sits clear of it.
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
    fetch(BASE_STYLE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`style request failed (${res.status})`);
        return res.json();
      })
      .then((base) => {
        if (cancelled || !containerRef.current) return;
        const css = getComputedStyle(document.documentElement);
        created = new MapLibreMap({
          container: containerRef.current,
          style: pixelStyle(base, (token) => css.getPropertyValue(token).trim()),
          pixelRatio: MAP_PIXEL_RATIO,
          bounds: startBounds,
          fitBoundsOptions: { padding: FIT_PADDING, maxZoom: START_MAX_ZOOM },
          minZoom: MIN_ZOOM,
          attributionControl: { compact: false },
          // There's no compass button, so there'd be no way back from a rotated or tilted map.
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        created.touchZoomRotate.disableRotation();
        created.keyboard.disableRotation();
        setMap(created);
      })
      .catch((error) => console.error("Overworld map failed to load:", error));
    return () => {
      cancelled = true;
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
    const popup = new Popup({ closeButton: false, offset: POPUP_OFFSET, maxWidth: "none", className: "pin-popup" })
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

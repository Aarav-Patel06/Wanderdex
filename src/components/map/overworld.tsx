"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";

import dynamic from "next/dynamic";

import { useAddVisit } from "@/components/add/add-visit-context";
import { Loading } from "@/components/loading";
import { addVisit, type MapPlace, type NewPin } from "@/lib/map/places";

// MapLibre needs the browser (WebGL, window), so the map never renders on the server. While
// its code loads, and then while it draws (MapView shows the same plate), "Loading" shows on a
// dark plate, which reads over the ocean and over land alike.
const MapView = dynamic(() => import("@/components/map/map-view").then((mod) => mod.MapView), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <Loading className="bg-text px-4 py-3 text-background" />
    </div>
  ),
});

type OverworldApi = {
  // Puts a just-saved visit's pin on the map and pans to it (SPEC §11.6 step 7).
  addPin: (pin: NewPin) => void;
  // A floating panel over the map (data-map-cover) appeared, resized, or went away.
  coversChanged: () => void;
};

const OverworldContext = createContext<OverworldApi | null>(null);

// For the save flow, rendered as a child of <Overworld>.
export function useOverworld() {
  const api = use(OverworldContext);
  if (!api) throw new Error("useOverworld must be used inside <Overworld>");
  return api;
}

// A ref for a panel floating over the map, marked data-map-cover="bottom" or "right". The map
// pads its camera by how far the panel reaches in (SPEC §13.1), so no pin hides behind it,
// and follows the panel as it resizes and when it goes away.
export function useMapCover() {
  const { coversChanged } = useOverworld();
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      const observer = new ResizeObserver(coversChanged);
      observer.observe(element);
      return () => {
        observer.disconnect();
        coversChanged();
      };
    },
    [coversChanged],
  );
}

// The Overworld (SPEC §13): a full-bleed map of the user's places.
export function Overworld({
  initialPlaces,
  children,
}: {
  initialPlaces: MapPlace[];
  children?: React.ReactNode;
}) {
  const [places, setPlaces] = useState(initialPlaces);
  const [focus, setFocus] = useState<NewPin | null>(null);
  const [coverTick, setCoverTick] = useState(0);
  const api = useMemo<OverworldApi>(
    () => ({
      addPin(pin) {
        setPlaces((current) => addVisit(current, pin));
        setFocus({ ...pin });
      },
      coversChanged: () => setCoverTick((tick) => tick + 1),
    }),
    [],
  );

  return (
    <OverworldContext value={api}>
      {/* isolate: the map's markers and popups stack below the shell's avatar menu.
          .overworld: map.css moves the map controls clear of the confirmation panel. */}
      <div className="overworld relative isolate h-full bg-map-ocean">
        <MapView places={places} focus={focus} coverTick={coverTick} />
        {places.length === 0 && <EmptyHint />}
        {children}
      </div>
    </OverworldContext>
  );
}

// No places yet (SPEC §11.7): an RPG dialog-style hint, not a modal, with a choice that opens
// the add panel. Mobile: near the bottom, clear of the zoom buttons. Desktop: in the part of
// the map the sidebar and the confirmation panel don't cover. The rpg-box styles are in
// shell.css (the sidebar's box).
function EmptyHint() {
  const addVisit = useAddVisit();
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-20 flex justify-center md:top-1/3 md:right-[calc(1rem+var(--map-right))] md:bottom-auto md:left-80">
      <div className="pointer-events-auto w-full max-w-sm drop-shadow-pixel">
        <div className="rpg-box relative flex flex-col gap-4 border-6 border-accent bg-text p-4 text-background">
          <span aria-hidden="true" className="rpg-box-corner top-0 left-0" />
          <span aria-hidden="true" className="rpg-box-corner top-0 right-0" />
          <span aria-hidden="true" className="rpg-box-corner bottom-0 left-0" />
          <span aria-hidden="true" className="rpg-box-corner right-0 bottom-0" />
          <p className="font-display text-h3">Your adventure starts here. Add your first place!</p>
          <button
            type="button"
            onClick={addVisit}
            className="flex min-h-11 items-center gap-3 self-start font-display text-button"
          >
            <span aria-hidden="true" className="text-accent">
              ▶︎
            </span>
            Add Visit
          </button>
        </div>
      </div>
    </div>
  );
}

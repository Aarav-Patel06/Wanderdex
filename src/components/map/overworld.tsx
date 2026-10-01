"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";

import dynamic from "next/dynamic";

import { useAddVisit, useAddVisitBubble } from "@/components/add/add-visit-context";
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

// A ref for a panel floating over the map, marked data-map-cover="right". The map
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

// No places yet (SPEC §11.7): an RPG dialog-style hint, not a modal, as a speech bubble whose
// tail points at Add Visit: beside the sidebar on desktop, above the tab bar (pointing down at
// the Add Visit tab) on mobile (useAddVisitBubble; 6 = the RPG box's border is inside it).
// "Later" hides it until the Overworld next loads, and so does pressing Add Visit. The rpg-box
// and tail styles are in shell.css.
function EmptyHint() {
  const { open } = useAddVisit();
  const [hidden, setHidden] = useState(open);
  if (open && !hidden) setHidden(true);
  const ref = useAddVisitBubble(6, true);
  if (hidden) return null;

  return (
    <div
      ref={ref}
      style={{ visibility: "hidden" }}
      className="speech-bubble fixed inset-x-4 ml-auto max-w-sm drop-shadow-pixel md:right-auto md:ml-0 md:w-96 md:max-w-none"
    >
      <div className="rpg-box relative flex flex-col gap-4 border-6 border-accent bg-text p-4 text-background">
        <span aria-hidden="true" className="rpg-box-corner top-0 left-0" />
        <span aria-hidden="true" className="rpg-box-corner top-0 right-0" />
        <span aria-hidden="true" className="rpg-box-corner bottom-0 left-0" />
        <span aria-hidden="true" className="rpg-box-corner right-0 bottom-0" />
        <p className="font-display text-h3">Your adventure starts here. Add your first place!</p>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="flex min-h-11 items-center gap-3 self-start font-display text-button"
        >
          <span aria-hidden="true" className="text-accent">
            ▶︎
          </span>
          Later
        </button>
      </div>
      <span aria-hidden="true" className="speech-tail [--tail-fill:var(--text)] [--tail-outline:var(--accent)]" />
    </div>
  );
}

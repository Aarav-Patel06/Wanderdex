"use client";

import { createContext, use, useMemo, useState } from "react";

import dynamic from "next/dynamic";

import { addVisit, type MapPlace, type NewPin } from "@/lib/map/places";

// MapLibre needs the browser (WebGL, window), so the map never renders on the server.
const MapView = dynamic(() => import("@/components/map/map-view").then((mod) => mod.MapView), {
  ssr: false,
});

type OverworldApi = {
  // Puts a just-saved visit's pin on the map and pans to it (SPEC §11.6 step 7).
  addPin: (pin: NewPin) => void;
};

const OverworldContext = createContext<OverworldApi | null>(null);

// For the save flow, rendered as a child of <Overworld>.
export function useOverworld() {
  const api = use(OverworldContext);
  if (!api) throw new Error("useOverworld must be used inside <Overworld>");
  return api;
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
  const api = useMemo<OverworldApi>(
    () => ({
      addPin(pin) {
        setPlaces((current) => addVisit(current, pin));
        setFocus({ ...pin });
      },
    }),
    [],
  );

  return (
    <OverworldContext value={api}>
      {/* isolate: the map's markers and popups stack below the shell's avatar menu. */}
      <div className="relative isolate h-full bg-map-ocean">
        <MapView places={places} focus={focus} />
        {children}
      </div>
    </OverworldContext>
  );
}

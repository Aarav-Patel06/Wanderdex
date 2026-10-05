"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useAddVisit, useAddVisitBubble } from "@/components/add/add-visit-context";
import { type AddMode, AddPanel, type PanelMessage, type TextMode } from "@/components/add/add-panel";
import { errorCopy, postJson } from "@/components/add/api";
import { ConfirmCard, type Lookup } from "@/components/add/confirm-card";
import { AddDrawer, ConfirmPanel } from "@/components/add/confirm-surfaces";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { type Drop, useMapCover, useOverworld } from "@/components/map/overworld";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { toast } from "@/components/ui/8bit/toast";
import { useIsDesktop } from "@/components/use-is-desktop";
import type { LatLng } from "@/lib/links/parse";
import { formatTaken, isPhotoFile, type PhotoInfo, type PhotoTaken, photoVisited, readPhoto } from "@/lib/photo";
import type { LinkResult, NearbyResult, ResolveResult } from "@/lib/resolve";
import { saveToasts } from "@/lib/save-toasts";
import type { SavedVisit } from "@/lib/visits";

import "./add.css";

// SPEC §11.7.
const UNREADABLE_PHOTO = "That file isn't a photo we can read.";

// Placing a dropped pin (SPEC §11.4): where it is so far, where it started (a photo's
// coordinates, which the map flies to), and the photo's date to carry into its card.
type Placing = { at: LatLng | null; start: LatLng | null; taken: PhotoTaken | null };

// Adding a visit on the Overworld (SPEC §11, §14.2): lookup → confirmation card → save.
// Desktop: "Add Visit" in the sidebar opens a speech bubble beside it with the add panel, and
// the confirmation card opens as a side panel on the right. Mobile: a drawer that holds the add
// panel and turns into the confirmation card after a lookup. Both share this state; whether the
// panel is open lives in the shell (useAddVisit), since the nav items toggle it.
// "Drop a pin" closes the bubble or drawer while the user places the pin on the map, then opens
// the card for the new place, named there.
export function AddFlow() {
  const router = useRouter();
  const { addPin, setDrop, mapCenter } = useOverworld();
  const { open, toggle, close } = useAddVisit();
  const isDesktop = useIsDesktop();
  const bubbleOpen = open && isDesktop;
  const bubbleRef = useAddVisitBubble(0);
  const panelRef = useMapCover();
  // The input of each panel (bubble, drawer), for focus after the RPG dialog.
  const bubbleInput = useRef<HTMLInputElement>(null);
  const drawerInput = useRef<HTMLInputElement>(null);
  // Set by a pointerdown inside the bubble, so the document's listener can tell it from one outside.
  const insideBubble = useRef(false);
  const headingId = useId();

  const [mode, setMode] = useState<AddMode | null>(null);
  const [inputs, setInputs] = useState<Record<TextMode, string>>({ link: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<PanelMessage | null>(null);
  // The date of a photo without GPS, carried into Type Location (SPEC §11.2 step 3).
  const [photoTaken, setPhotoTaken] = useState<PhotoTaken | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [confirmingPin, setConfirmingPin] = useState(false);
  // A link that couldn't be read, with the name it carried (if any) for Type Location.
  const [unreadable, setUnreadable] = useState<{ name: string | null } | null>(null);
  const dialogOpen = unreadable !== null;
  // Bumped by resetPanel, so a lookup that finishes after the panel closed is dropped.
  const requests = useRef(0);

  // Opening the add panel (Add Visit) gives up on placing a pin.
  if (open && placing) setPlacing(null);

  const resetPanel = useCallback(() => {
    requests.current += 1;
    setMode(null);
    setInputs({ link: "", text: "" });
    setLoading(false);
    setMessage(null);
    setPhotoTaken(null);
  }, []);

  function reset() {
    resetPanel();
    setLookup(null);
  }

  // Closing the bubble (Escape, a click outside it, Add Visit again, or a lookup that found
  // places) starts the next one afresh.
  useEffect(() => {
    if (!bubbleOpen) return;
    return resetPanel;
  }, [bubbleOpen, resetPanel]);

  // The bubble closes on Escape and on a press outside it. The nav's Add Visit toggles it
  // itself, and the RPG dialog (a link that couldn't be read) sits on top of it for a moment.
  useEffect(() => {
    if (!bubbleOpen || dialogOpen) return;
    function onPointerDown(event: PointerEvent) {
      const inside = insideBubble.current;
      insideBubble.current = false;
      if (inside || (event.target instanceof Element && event.target.closest("[data-add-visit]"))) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      close();
      document.querySelector<HTMLElement>("[data-sidebar] [data-add-visit]")?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [bubbleOpen, dialogOpen, close]);

  // Escape also gives up on placing a pin.
  const isPlacing = placing !== null;
  useEffect(() => {
    if (!isPlacing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) setPlacing(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isPlacing]);

  // The dropped pin on the map: while it's being placed (a tap places or moves it), and then
  // while its card is open.
  const pick = useCallback((at: LatLng) => setPlacing((current) => current && { ...current, at }), []);
  const pinPlace = lookup && "pin" in lookup ? lookup.pin : null;
  const drop = useMemo<Drop | null>(() => {
    if (placing) return { at: placing.at, start: placing.start, onPick: pick };
    if (pinPlace) return { at: pinPlace, start: null, onPick: null };
    return null;
  }, [placing, pinPlace, pick]);
  useEffect(() => {
    setDrop(drop);
    return () => setDrop(null);
  }, [drop, setDrop]);

  function pickMode(next: AddMode | null) {
    setMode(next);
    setMessage(null);
    setPhotoTaken(null);
  }

  async function find() {
    if (!mode || mode === "photo" || loading) return;
    const input = inputs[mode].trim();
    if (!input) return;
    const request = ++requests.current;
    setLoading(true);
    setMessage(null);
    const result =
      mode === "link"
        ? await postJson<LinkResult>("/api/resolve/link", { url: input })
        : await postJson<ResolveResult>("/api/resolve/text", {
            text: input,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
          });
    if (request !== requests.current) return;
    setLoading(false);

    if (result.ok) {
      const { candidates, visited, source_input } = result.data;
      // After a photo without GPS, the photo's date, unless the typed text gave one.
      const photo = mode === "text" && photoTaken ? { location: null, taken: photoTaken } : undefined;
      setLookup({
        id: request,
        candidates,
        visited: visited ?? photoVisited(photo?.taken ?? null, candidates[0].timezone),
        source: mode,
        source_input,
        photo,
      });
      // Desktop: the bubble gives way to the card. Mobile: the drawer becomes the card.
      if (isDesktop) close();
    } else if (result.error === "unauthorized") {
      router.push("/login");
    } else if (result.error === "link_unparseable") {
      setUnreadable({ name: result.name });
    } else {
      setMessage({ kind: "error", text: errorCopy(result.error), dropPin: result.error === "no_results" });
    }
  }

  // Upload Photo (SPEC §11.2): read the photo here, then look up only its coordinates.
  async function findPhoto(file: File) {
    if (loading) return;
    const request = ++requests.current;
    setMessage(null);
    if (!isPhotoFile(file)) return setMessage({ kind: "error", text: UNREADABLE_PHOTO });
    setLoading(true);

    let info: PhotoInfo | null;
    try {
      info = await readPhoto(file);
    } catch (error) {
      // The photo reader's code didn't load (offline).
      console.error("Reading the photo failed:", error);
      if (request !== requests.current) return;
      setLoading(false);
      return setMessage({ kind: "error", text: errorCopy("upstream_error") });
    }
    if (request !== requests.current) return;
    if (!info) {
      setLoading(false);
      return setMessage({ kind: "error", text: UNREADABLE_PHOTO });
    }
    // No GPS: type the place instead, keeping the photo's date (SPEC §11.2 step 3).
    if (!info.location) {
      setLoading(false);
      setMode("text");
      setPhotoTaken(info.taken);
      return setMessage({ kind: "no_location" });
    }

    const { location, taken } = info;
    const result = await postJson<NearbyResult>("/api/resolve/nearby", location);
    if (request !== requests.current) return;
    setLoading(false);
    if (result.ok) {
      const { candidates } = result.data;
      setLookup({
        id: request,
        candidates,
        visited: photoVisited(taken, candidates[0].timezone),
        source: "photo",
        source_input: null,
        photo: { location, taken },
      });
      if (isDesktop) close();
    } else if (result.error === "no_results") {
      // Nothing within 150 m: straight to the pin, at the photo's coordinates (SPEC §11.2 step 4).
      startPlacing(location, taken);
    } else if (result.error === "unauthorized") {
      router.push("/login");
    } else {
      setMessage({ kind: "error", text: errorCopy(result.error) });
    }
  }

  // "Can't find it? Drop a pin": the bubble or drawer gets out of the way of the map. From a
  // photo, the pin starts at its coordinates (if it had any) and the card gets its date.
  function startPlacing(start: LatLng | null, taken: PhotoTaken | null) {
    requests.current += 1;
    setPlacing({ at: start, start, taken });
    setLookup(null);
    close();
  }

  // The pin's card: the zone from its coordinates, for the date & time (the server works out
  // its own when saving). Phones: the drawer comes back with the card.
  async function confirmPin() {
    if (!placing?.at || confirmingPin) return;
    const { at, taken } = placing;
    setConfirmingPin(true);
    const timezone = await zoneAt(at);
    setConfirmingPin(false);
    setPlacing(null);
    setLookup({ id: ++requests.current, pin: { ...at, timezone }, visited: photoVisited(taken, timezone) });
    if (!isDesktop && !open) toggle();
  }

  // The dialog's button: switch to Type Location, carrying over the name read from the link.
  function typeInstead() {
    const name = unreadable?.name;
    setUnreadable(null);
    pickMode("text");
    if (name) setInputs((current) => ({ ...current, text: name }));
  }

  // Close the card (and the drawer), then show the pin: the map flies to it with the panels as
  // they are after closing. The refresh keeps the server-rendered pages in step with the save.
  // Toasts: SPEC §11.6 step 6 (lib/save-toasts).
  function saved(result: SavedVisit) {
    const { place, visit } = result;
    for (const { title, ...options } of saveToasts(result)) toast(title, options);
    if (open && !isDesktop) close(); // reset() runs when the drawer has slid away
    else reset();
    addPin({
      id: place.id,
      name: place.name,
      category: visit.category,
      city: place.city,
      country: place.country,
      country_code: place.country_code,
      lat: place.lat,
      lng: place.lng,
    });
    router.refresh();
  }

  // The bubble and the drawer show the same panel.
  const panelProps = {
    mode,
    onMode: pickMode,
    value: mode && mode !== "photo" ? inputs[mode] : "",
    onValue: (value: string) => {
      if (mode && mode !== "photo") setInputs((current) => ({ ...current, [mode]: value }));
      // Typing clears an error; the no-location warning stays while the user types the place.
      setMessage((current) => (current?.kind === "error" ? null : current));
    },
    onFind: find,
    onPhoto: findPhoto,
    onDropPin: () => startPlacing(null, mode === "text" ? photoTaken : null),
    loading,
    message,
    photoDate: mode === "text" && photoTaken ? formatTaken(photoTaken) : null,
  };

  const card = lookup && (
    <ConfirmCard
      key={lookup.id}
      lookup={lookup}
      compact={!isDesktop}
      onCancel={() => setLookup(null)}
      onSaved={saved}
      onDropPin={
        "candidates" in lookup
          ? () => startPlacing(lookup.photo?.location ?? null, lookup.photo?.taken ?? null)
          : undefined
      }
    />
  );
  const cardTitle = lookup && "pin" in lookup ? "New place" : "Confirm visit";

  return (
    <>
      {/* Desktop: a speech bubble beside the sidebar, its tail pointing at Add Visit (placed by
          useAddVisitBubble; 0 = the Card's side borders sit outside its box). A cream pixel card
          like the pin popup; the shadow is on the wrapper, so it follows the tail too. */}
      {bubbleOpen && (
        <section
          ref={bubbleRef}
          role="dialog"
          aria-labelledby={`${headingId}-add`}
          onPointerDownCapture={() => {
            insideBubble.current = true;
          }}
          className="speech-bubble fixed z-20 w-96 drop-shadow-pixel [--tail-overlap:0px]"
        >
          <Card font="normal" className="drop-shadow-none">
            <CardHeader>
              <CardTitle id={`${headingId}-add`}>Add Anything</CardTitle>
            </CardHeader>
            <CardContent>
              <AddPanel layout="list" {...panelProps} inputRef={bubbleInput} />
            </CardContent>
          </Card>
          <span aria-hidden="true" className="speech-tail" />
        </section>
      )}

      {placing && (
        <PinBanner
          verb={isDesktop ? "Click" : "Tap"}
          placed={placing.at !== null}
          busy={confirmingPin}
          onCenter={() => {
            const center = mapCenter();
            if (center) pick(center);
          }}
          onConfirm={confirmPin}
          onCancel={() => setPlacing(null)}
        />
      )}

      {/* Desktop side panel over the map (the attribution moves left of it, map.css). Its
          presence (data-confirm-panel) moves the map controls clear of it (map.css). z-20: above
          the map's markers (the selected pin and the dropped pin have a z-index). */}
      {isDesktop && card && (
        <ConfirmPanel ref={panelRef} title={cardTitle} data-map-cover="right" data-confirm-panel className="absolute z-20">
          {card}
        </ConfirmPanel>
      )}

      {/* Mobile drawer. Closing it resets the flow once it has slid away. */}
      <AddDrawer
        open={open && !isDesktop}
        onClose={close}
        onClosed={reset}
        title={card ? cardTitle : "Add Anything"}
      >
        {card || <AddPanel layout="grid" {...panelProps} inputRef={drawerInput} />}
      </AddDrawer>

      <RpgDialog
        open={unreadable !== null}
        onOpenChange={(next) => {
          if (!next) setUnreadable(null);
        }}
        title="Couldn't read that link."
        description="Try typing the place instead."
        choices={[{ label: "Type Location", onSelect: typeInstead }]}
        // Back to the panel's input (Type Location after the button). The Find button that had
        // focus before was disabled during the lookup, so Radix would leave focus on <body>.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (isDesktop ? bubbleInput : drawerInput).current?.focus();
        }}
      />
    </>
  );
}

// The pin's IANA zone. The tz lookup table (72 KB) loads only now, when a pin is confirmed. If it
// can't load, the browser's zone stands in for the card; the server uses the pin's real zone.
async function zoneAt({ lat, lng }: LatLng) {
  try {
    const { default: tzLookup } = await import("@photostructure/tz-lookup");
    return tzLookup(lat, lng);
  } catch (error) {
    console.error("Time zone lookup failed:", error);
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  }
}

// While placing a pin (SPEC §11.4): what to do, "Drop pin at center" (at the map's crosshair, for
// keyboards, or a precise spot on a phone), and Confirm / Cancel, over the bottom of the map,
// just above the attribution (which must stay visible, SPEC §12.4, and wraps to two lines on
// phones, hence measured). Desktop: beside the sidebar; phones: across the map.
function PinBanner({
  verb,
  placed,
  busy,
  onCenter,
  onConfirm,
  onCancel,
}: {
  verb: "Click" | "Tap";
  placed: boolean;
  busy: boolean;
  onCenter: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const ref = useCallback((banner: HTMLElement | null) => {
    if (!banner) return;
    const place = () => {
      const map = banner.offsetParent?.getBoundingClientRect();
      const attribution = banner.offsetParent?.querySelector(".maplibregl-ctrl-bottom-right")?.getBoundingClientRect();
      if (!map) return;
      const above = attribution?.height ? map.bottom - attribution.top : 0;
      banner.style.bottom = `${Math.round(above + 16)}px`;
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, []);

  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      className="absolute right-[calc(1rem+6px+env(safe-area-inset-right))] left-[calc(1rem+6px+env(safe-area-inset-left))] z-20 md:right-auto md:left-[calc(22rem+6px)] md:w-96"
    >
      <Card font="normal">
        <CardHeader>
          <CardTitle id={titleId}>Drop a pin</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p aria-live="polite">
            {placed ? `Pin dropped. ${verb} again to move it.` : `${verb} the map to drop a pin.`}
          </p>
          <div className="flex flex-wrap gap-button-group px-1.5">
            {/* Its own row. The label is 288px of Press Start 2P, more than a 375px phone's banner
                has, so there it wraps to two lines. */}
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onCenter}
              className="w-full py-2 text-center whitespace-normal"
            >
              Drop pin at center
            </Button>
            <Button type="button" disabled={!placed || busy} onClick={onConfirm} className="flex-1">
              Confirm
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

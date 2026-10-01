"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { useRouter } from "next/navigation";

import { useAddVisit, useAddVisitBubble } from "@/components/add/add-visit-context";
import { type AddMode, AddPanel } from "@/components/add/add-panel";
import { errorCopy, postJson } from "@/components/add/api";
import { ConfirmCard, type Lookup } from "@/components/add/confirm-card";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { useMapCover, useOverworld } from "@/components/map/overworld";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/8bit/drawer";
import type { LinkResult, ResolveResult } from "@/lib/resolve";
import type { SavedVisit } from "@/lib/visits";

import "./add.css";

// Tailwind's md breakpoint, where the shell switches to the desktop sidebar.
const DESKTOP = "(min-width: 48rem)";

function subscribeDesktop(onChange: () => void) {
  const query = matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => matchMedia(DESKTOP).matches, () => false);
}

// Adding a visit on the Overworld (SPEC §11, §14.2): lookup → confirmation card → save.
// Desktop: "Add Visit" in the sidebar opens a speech bubble beside it with the add panel, and
// the confirmation card opens as a side panel on the right. Mobile: a drawer that holds the add
// panel and turns into the confirmation card after a lookup. Both share this state; whether the
// panel is open lives in the shell (useAddVisit), since the nav items toggle it.
export function AddFlow() {
  const router = useRouter();
  const { addPin } = useOverworld();
  const { open, close } = useAddVisit();
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
  const [inputs, setInputs] = useState<Record<AddMode, string>>({ link: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  // A link that couldn't be read, with the name it carried (if any) for Type Location.
  const [unreadable, setUnreadable] = useState<{ name: string | null } | null>(null);
  const dialogOpen = unreadable !== null;
  // Bumped by resetPanel, so a lookup that finishes after the panel closed is dropped.
  const requests = useRef(0);

  const resetPanel = useCallback(() => {
    requests.current += 1;
    setMode(null);
    setInputs({ link: "", text: "" });
    setLoading(false);
    setError(null);
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

  function pickMode(next: AddMode | null) {
    setMode(next);
    setError(null);
  }

  async function find() {
    if (!mode || loading) return;
    const input = inputs[mode].trim();
    if (!input) return;
    const request = ++requests.current;
    setLoading(true);
    setError(null);
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
      setLookup({ id: request, candidates, visited, source: mode, source_input });
      // Desktop: the bubble gives way to the card. Mobile: the drawer becomes the card.
      if (isDesktop) close();
    } else if (result.error === "unauthorized") {
      router.push("/login");
    } else if (result.error === "link_unparseable") {
      setUnreadable({ name: result.name });
    } else {
      setError(errorCopy(result.error));
    }
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
  function saved({ place, visit }: SavedVisit) {
    if (open && !isDesktop) close(); // reset() runs when the drawer has slid away
    else reset();
    addPin({
      id: place.id,
      name: place.name,
      category: visit.category,
      city: place.city,
      country: place.country,
      lat: place.lat,
      lng: place.lng,
    });
    router.refresh();
  }

  // The bubble and the drawer show the same panel.
  const panelProps = {
    mode,
    onMode: pickMode,
    value: mode ? inputs[mode] : "",
    onValue: (value: string) => {
      if (mode) setInputs((current) => ({ ...current, [mode]: value }));
      setError(null);
    },
    onFind: find,
    loading,
    error,
  };

  const card = lookup && (
    <ConfirmCard key={lookup.id} lookup={lookup} onCancel={() => setLookup(null)} onSaved={saved} />
  );

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

      {/* Desktop side panel, from the top to above the attribution; it scrolls inside. Its
          presence (data-confirm-panel) moves the map controls clear of it (map.css). */}
      {isDesktop && card && (
        <section
          ref={panelRef}
          data-map-cover="right"
          data-confirm-panel
          aria-labelledby={`${headingId}-confirm`}
          className="absolute top-4 right-[calc(1rem+6px)] bottom-12 flex w-96 flex-col"
        >
          <Card font="normal" className="flex max-h-full min-h-0 flex-col">
            <CardHeader>
              <CardTitle id={`${headingId}-confirm`}>Confirm visit</CardTitle>
            </CardHeader>
            {/* pb: the last button's pixel border and shadow reach 10px below it, which would
                otherwise make the content scroll. */}
            <CardContent className="min-h-0 overflow-y-auto pb-2.5">{card}</CardContent>
          </Card>
        </section>
      )}

      {/* Mobile drawer. Its bottom sits on the tab bar (4rem + the safe-area inset), and it
          never reaches past the top safe area (plus 0.5rem). Closing it resets the flow once it has slid away.
          repositionInputs off: with the keyboard open, Vaul sets an inline height and bottom on
          the drawer and, once the keyboard closes, restores the height it had while the input
          was focused, so the confirmation card that replaces the input scrolls inside a
          too-short drawer, and the drawer drops over the tab bar. Without it, iOS scrolls the
          focused input into view itself. */}
      <Drawer
        open={open && !isDesktop}
        repositionInputs={false}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        onAnimationEnd={(next) => {
          if (!next) reset();
        }}
      >
        <DrawerContent
          font="normal"
          aria-describedby={undefined}
          className="add-drawer text-body data-[vaul-drawer-direction=bottom]:bottom-[calc(4rem+env(safe-area-inset-bottom))] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom)-env(safe-area-inset-top)-0.5rem)]"
        >
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-6 pb-4">
            <DrawerTitle className="text-h3">{card ? "Confirm visit" : "Add Anything"}</DrawerTitle>
            {card || <AddPanel layout="grid" {...panelProps} inputRef={drawerInput} />}
          </div>
        </DrawerContent>
      </Drawer>

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

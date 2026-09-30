"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";

import { useRouter } from "next/navigation";

import { useAddVisitTarget } from "@/components/add/add-visit-context";
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
// Desktop: the "Add Anything" dock along the bottom of the map and the confirmation card as a
// side panel on the right. Mobile: a drawer that holds the add panel and turns into the
// confirmation card after a lookup. Both share this state.
export function AddFlow() {
  const router = useRouter();
  const { addPin } = useOverworld();
  const isDesktop = useIsDesktop();
  const dockRef = useMapCover();
  const panelRef = useMapCover();
  const firstMode = useRef<HTMLButtonElement>(null);
  // The input of each panel (dock, drawer), for focus after the RPG dialog.
  const dockInput = useRef<HTMLInputElement>(null);
  const drawerInput = useRef<HTMLInputElement>(null);
  const headingId = useId();

  const [mode, setMode] = useState<AddMode | null>(null);
  const [inputs, setInputs] = useState<Record<AddMode, string>>({ link: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  // A link that couldn't be read, with the name it carried (if any) for Type Location.
  const [unreadable, setUnreadable] = useState<{ name: string | null } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Bumped by reset, so a lookup that finishes after the drawer closed is dropped.
  const requests = useRef(0);

  // "Add Visit" in the nav. The dock is always open on desktop, so it takes focus there.
  const open = useCallback(() => {
    if (matchMedia(DESKTOP).matches) firstMode.current?.focus();
    else setDrawerOpen(true);
  }, []);
  useAddVisitTarget(open);

  function reset() {
    requests.current += 1;
    setMode(null);
    setInputs({ link: "", text: "" });
    setLoading(false);
    setError(null);
    setLookup(null);
  }

  function pickMode(next: AddMode) {
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
    if (drawerOpen) setDrawerOpen(false); // reset() runs when the drawer has slid away
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

  // The dock and the drawer show the same panel.
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
      {/* Desktop dock: between the floating sidebar (1rem + 18rem + 1rem, plus the card's 6px
          outside border) and the right edge, above the attribution. It pads the map's camera
          (data-map-cover), so no pin hides behind it. */}
      <section
        ref={dockRef}
        data-map-cover="bottom"
        aria-labelledby={`${headingId}-add`}
        className="absolute right-[calc(1rem+6px+var(--map-right))] bottom-12 left-[calc(20rem+6px)] hidden md:block"
      >
        <Card font="normal">
          <CardHeader>
            <CardTitle id={`${headingId}-add`}>Add Anything</CardTitle>
          </CardHeader>
          <CardContent><AddPanel {...panelProps} inputRef={dockInput} firstModeRef={firstMode} /></CardContent>
        </Card>
      </section>

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
            <CardContent className="min-h-0 overflow-y-auto">{card}</CardContent>
          </Card>
        </section>
      )}

      {/* Mobile drawer. Its bottom sits on the tab bar (4rem + the safe-area inset), and it
          never reaches past the top safe area. Closing it resets the flow once it has slid away. */}
      <Drawer
        open={drawerOpen && !isDesktop}
        onOpenChange={(next) => {
          if (!next) setDrawerOpen(false);
        }}
        onAnimationEnd={(next) => {
          if (!next) reset();
        }}
      >
        <DrawerContent
          font="normal"
          aria-describedby={undefined}
          className="add-drawer text-body data-[vaul-drawer-direction=bottom]:bottom-[calc(4rem+env(safe-area-inset-bottom))] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom)-env(safe-area-inset-top)-1rem)]"
        >
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-6">
            <DrawerTitle className="text-h3">{card ? "Confirm visit" : "Add Anything"}</DrawerTitle>
            {card || <AddPanel {...panelProps} inputRef={drawerInput} />}
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
          (isDesktop ? dockInput : drawerInput).current?.focus();
        }}
      />
    </>
  );
}

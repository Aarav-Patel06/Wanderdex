"use client";

import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ExternalLink } from "pixelarticons/react/ExternalLink";

import { errorCopy, sendJson } from "@/components/add/api";
import { ConfirmCard, type KnownPlace, type Lookup } from "@/components/add/confirm-card";
import { AddDrawer, ConfirmPanel } from "@/components/add/confirm-surfaces";
import { CategorySelect } from "@/components/add/visit-fields";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { Loading } from "@/components/loading";
import { EditVisitDialog } from "@/components/places/edit-visit-dialog";
import { Rating } from "@/components/rating";
import { BackButton } from "@/components/shell/back-button";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Card } from "@/components/ui/8bit/card";
import { Label } from "@/components/ui/8bit/label";
import { toast } from "@/components/ui/8bit/toast";
import { useIsDesktop } from "@/components/use-is-desktop";
import { type Category, categorySprite } from "@/lib/categories";
import type { Precision } from "@/lib/dates";
import { saveToasts } from "@/lib/save-toasts";
import type { SavedVisit } from "@/lib/visits";

import "./place.css";

// The place, with the user's category for it (their most recently logged visit's, like the pin)
// and its zone, as the confirmation card takes it, plus what the header shows.
export type PlaceInfo = KnownPlace & { address: string | null; mapsUrl: string };

// One of the user's visits here, its date already formatted on the server; `visited` is the
// same date as a local value in its zone, for the edit dialog.
export type PlaceVisit = {
  id: string;
  date: string;
  visited: { value: string; precision: Precision };
  timezone: string;
  rating: number | null;
  note: string | null;
};

// Place detail (SPEC §14.4). Every change goes through a route handler, then the page refreshes
// from the server, which stays the source of truth (and formats the dates).
export function PlaceDetail({
  place,
  visits,
  highlight,
}: {
  place: PlaceInfo;
  visits: PlaceVisit[];
  highlight: string | null;
}) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [editing, setEditing] = useState<PlaceVisit | null>(null);
  const [deleting, setDeleting] = useState<PlaceVisit | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  // "Add another visit": the card's lookup, and whether its panel or drawer is open (the drawer
  // keeps the card while it slides away).
  const [adding, setAdding] = useState<Lookup | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addCount = useRef(0);

  // Opened from My Visits (?visit=<id>): scroll to that visit; place.css flashes it.
  useEffect(() => {
    if (highlight) document.getElementById(`visit-${highlight}`)?.scrollIntoView({ block: "center" });
  }, [highlight]);

  function startAdding() {
    setAdding({ id: ++addCount.current, place });
    setAddOpen(true);
  }

  function closeAdding() {
    setAddOpen(false);
    if (isDesktop) setAdding(null); // the drawer clears it once it has slid away
  }

  // Toasts: SPEC §11.6 step 6 (lib/save-toasts); here it's always a return visit.
  function added(result: SavedVisit) {
    for (const { title, ...options } of saveToasts(result)) toast(title, options);
    closeAdding();
    router.refresh();
  }

  // Never the place row (SPEC §8). After the last visit here, the page has nothing left to show,
  // so it goes to My Visits (SPEC §14.4).
  function remove() {
    if (!deleting || removing) return;
    setDeleteError(null);
    startRemoving(async () => {
      const result = await sendJson<{ last: boolean }>("DELETE", `/api/visits/${deleting.id}`);
      if (!result.ok) {
        if (result.error === "unauthorized") return router.push("/login");
        return setDeleteError(errorCopy(result.error));
      }
      startRemoving(() => {
        if (result.data.last) router.push("/visits");
        else router.refresh();
        setDeleting(null);
      });
    });
  }

  function closeDelete() {
    if (removing) return;
    setDeleting(null);
    setDeleteError(null);
  }

  const card = adding && (
    <ConfirmCard key={adding.id} lookup={adding} compact={!isDesktop} onCancel={closeAdding} onSaved={added} />
  );

  return (
    // Mobile: the back button sits below the status bar (the viewport runs under it).
    <section className="flex max-w-2xl flex-col gap-6 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-8 md:px-8 md:pt-8">
      <BackButton fallback="/visits" className="-mb-2 gap-2 self-start px-0 md:hidden" />

      <PlaceHeader place={place} />

      <Button type="button" onClick={startAdding} className="mx-1.5 self-start">
        Add another visit
      </Button>

      <div className="flex flex-col gap-4">
        <h2>Your visits</h2>
        <Card font="normal">
          <ul className="divide-y-4 divide-text">
            {visits.map((visit) => (
              <li
                key={visit.id}
                id={`visit-${visit.id}`}
                data-highlight={visit.id === highlight || undefined}
                className="visit-row flex flex-col gap-2 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4">
                  <span>{visit.date}</span>
                  {visit.rating !== null && <Rating value={visit.rating} />}
                </div>
                {visit.note && <p className="break-words whitespace-pre-wrap">{visit.note}</p>}
                {/* my: the buttons' pixel borders sit 6px outside them. */}
                <div className="my-1.5 flex flex-wrap gap-x-3 gap-y-7 px-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Edit visit on ${visit.date}`}
                    onClick={() => setEditing(visit)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Delete visit on ${visit.date}`}
                    onClick={() => setDeleting(visit)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {editing && <EditVisitDialog key={editing.id} visit={editing} onClose={() => setEditing(null)} />}

      <RpgDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) closeDelete();
        }}
        title="Delete this visit?"
        description="This can't be undone."
        choices={[
          { label: "Delete", onSelect: remove, disabled: removing },
          { label: "Cancel", onSelect: closeDelete, disabled: removing },
        ]}
      >
        {(removing || deleteError) && (
          <>
            {removing && <Loading />}
            {deleteError && (
              <Alert variant="error">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </RpgDialog>

      {/* The confirmation card, as on the Overworld (SPEC §14.2): a side panel on the right on
          desktop, over the page; the drawer on phones. */}
      {isDesktop && addOpen && card && <ConfirmPanel className="fixed z-20">{card}</ConfirmPanel>}
      <AddDrawer open={addOpen && !isDesktop} onClose={closeAdding} onClosed={() => setAdding(null)} title="Confirm visit">
        {card}
      </AddDrawer>
    </section>
  );
}

// Sprite, name, address, city/country, the user's category (editable), and Open in Google Maps.
function PlaceHeader({ place }: { place: PlaceInfo }) {
  const router = useRouter();
  const categoryId = useId();
  // The new category shows while it saves and the page refreshes, and reverts if it fails.
  const [category, setCategory] = useOptimistic(place.category);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const where = [place.city, place.country].filter(Boolean).join(", ");

  // All of the user's visits here (SPEC §8), so their pin uses it on the Overworld.
  function changeCategory(next: Category) {
    setError(null);
    startSaving(async () => {
      setCategory(next);
      const result = await sendJson("PATCH", `/api/places/${place.id}/category`, { category: next });
      if (!result.ok) {
        if (result.error === "unauthorized") return router.push("/login");
        return setError(errorCopy(result.error));
      }
      startSaving(() => router.refresh());
    });
  }

  return (
    <header className="flex flex-col gap-4">
      {/* Phones: the sprite above the name, so a long name gets the full width. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <Image
          src={categorySprite(category)}
          alt=""
          width={64}
          height={64}
          unoptimized
          className="pixelated shrink-0"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="break-words text-h2 md:text-h1">{place.name}</h1>
          {place.address && <p className="text-small">{place.address}</p>}
          {where && <p>{where}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={categoryId} className="w-20 shrink-0">
          Category
        </Label>
        <div className="max-w-72 min-w-0 flex-1 px-1.5">
          <CategorySelect id={categoryId} value={category} onChange={changeCategory} disabled={saving} />
        </div>
      </div>
      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* px-2 on phones: the label alone is 304px of Press Start 2P, which just fits at 375px;
          the icon joins it from sm up. */}
      <Button asChild variant="secondary" className="mx-1.5 gap-2 self-start px-2 sm:px-4">
        <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer">
          Open in Google Maps
          <span className="sr-only"> (opens in a new tab)</span>
          <ExternalLink aria-hidden="true" className="hidden size-6 shrink-0 sm:block" />
        </a>
      </Button>
    </header>
  );
}

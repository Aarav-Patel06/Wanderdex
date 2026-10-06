"use client";

import { startTransition, useEffect, useId, useRef, useState } from "react";

import { formatInTimeZone } from "date-fns-tz";
import Image from "next/image";
import { Check } from "pixelarticons/react/Check";
import { Plus } from "pixelarticons/react/Plus";
import { Dialog as DialogPrimitive } from "radix-ui";

import { CategorySelect, NoteField, RatingField } from "@/components/add/visit-fields";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { Button } from "@/components/ui/8bit/button";
import { Label } from "@/components/ui/8bit/label";
import { type Category, categorySprite } from "@/lib/categories";
import { type Skipped, skippedLine, type TripStop } from "@/lib/trip/group";

import "./import.css";

// An import ready for review: its id (SPEC §11.8 step 8), its stops in time order, each stop's
// thumbnail (its first photo's EXIF thumbnail, JPEG bytes, or null), and what was skipped.
export type TripReviewData = { id: string; stops: TripStop[]; thumbnails: (Uint8Array | null)[]; skipped: Skipped };

// The stop cards render a few at a time, each step a transition (React yields while rendering
// it): up to 150 at once would hold the page for seconds on a phone (SPEC §20: no task over
// 100 ms). The review opens with one, which keeps its first, unsliced commit short.
const CARDS_PER_STEP = 4;

// The user's choices for a stop. No stop has a match until lookups are built (Phase 4.2), so
// every stop starts unchecked (SPEC §11.8 step 7) at Other.
type StopChoice = {
  include: boolean;
  match: null;
  category: Category;
  rating: number | null;
  note: string;
  extras: boolean;
};

// The stop's time, in its zone (the place's, once a stop has a match): "Mar 12, 2025, 3:45 PM",
// as lib/dates' formatVisited shows an exact time.
const formatStopTime = (stop: TripStop) => formatInTimeZone(stop.instant, stop.timezone, "MMM d, yyyy, h:mm a");

// The review screen (SPEC §11.8 step 7): modal, so nothing behind it can be reached. Phones: full
// screen, over the tab bar. Desktop: a large panel over the map, right of the sidebar. Close and
// Escape ask first while stops are unsaved (all of them, until saving is built); reloading or
// closing the tab gets the browser's own warning.
export function TripReview({ review, onClose }: { review: TripReviewData; onClose: () => void }) {
  const [choices, setChoices] = useState<StopChoice[]>(() =>
    review.stops.map(() => ({ include: false, match: null, category: "other", rating: null, note: "", extras: false })),
  );
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (shown >= review.stops.length) return;
    const next = setTimeout(() => startTransition(() => setShown((count) => count + CARDS_PER_STEP)));
    return () => clearTimeout(next);
  }, [shown, review.stops.length]);
  const unsaved = review.stops.length > 0;
  // Checked stops with a match or a named pin (none until lookups are built).
  const saveCount = choices.filter((choice) => choice.include && choice.match !== null).length;
  const skipped = skippedLine(review.skipped);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const leave = () => (unsaved ? setLeaving(true) : onClose());
  const choose = (index: number, change: Partial<StopChoice>) =>
    setChoices((current) => current.map((choice, i) => (i === index ? { ...choice, ...change } : choice)));

  return (
    <>
      <DialogPrimitive.Root open onOpenChange={(open) => !open && leave()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 hidden bg-text/60 md:block" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              leave();
            }}
            onInteractOutside={(event) => event.preventDefault()}
            className="fixed inset-0 z-50 flex flex-col bg-background text-body md:top-4 md:right-4 md:bottom-4 md:left-88 md:border-4 md:border-text md:shadow-pixel"
          >
            <header className="flex flex-col gap-2 border-b-4 border-text px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 md:pt-4">
              <DialogPrimitive.Title className="font-display text-h3">Review trip</DialogPrimitive.Title>
              {skipped && <p className="text-small">{skipped}</p>}
            </header>

            {/* scroll-py: a field scrolled into view by keyboard focus keeps its focus ring inside. */}
            <ol className="flex min-h-0 flex-1 scroll-py-3 flex-col gap-5 overflow-y-auto px-4 py-4 pr-5">
              {review.stops.slice(0, shown).map((stop, index) => (
                <StopCard
                  key={stop.number}
                  stop={stop}
                  thumbnail={review.thumbnails[index]}
                  choice={choices[index]}
                  onChange={(change) => choose(index, change)}
                />
              ))}
            </ol>

            <footer className="flex flex-wrap gap-button-group border-t-4 border-text px-5.5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4">
              <Button type="button" disabled={saveCount === 0}>
                Save {saveCount} {saveCount === 1 ? "visit" : "visits"}
              </Button>
              <Button type="button" variant="secondary" onClick={leave}>
                Close
              </Button>
            </footer>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <RpgDialog
        open={leaving}
        onOpenChange={(open) => !open && setLeaving(false)}
        title="Leave without saving?"
        description="Unsaved stops will be lost."
        choices={[
          { label: "Leave", onSelect: onClose },
          { label: "Stay", onSelect: () => setLeaving(false) },
        ]}
      />
    </>
  );
}

function StopCard({
  stop,
  thumbnail,
  choice,
  onChange,
}: {
  stop: TripStop;
  thumbnail: Uint8Array | null;
  choice: StopChoice;
  onChange: (change: Partial<StopChoice>) => void;
}) {
  const ids = useId();
  // The browser may not be able to show the thumbnail; the sprite stands in.
  const [broken, setBroken] = useState(false);
  // The thumbnail as an object URL (local, never uploaded), made as the card shows and revoked as
  // it goes, which is when the review closes. Set on the element, so making it doesn't re-render.
  const thumbnailRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = thumbnailRef.current;
    if (!image || !thumbnail) return;
    const url = URL.createObjectURL(new Blob([thumbnail as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }));
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);
  const photos = stop.photos.length;
  const time = formatStopTime(stop);

  return (
    <li className="trip-stop flex flex-col gap-3 p-3" aria-label={`Stop ${stop.number}, ${time}`}>
      <div className="flex items-start gap-3">
        {thumbnail && !broken ? (
          // A plain img: next/image needs its src while rendering, and this one is set afterwards.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={thumbnailRef}
            alt=""
            width={64}
            height={64}
            onError={() => setBroken(true)}
            className="size-16 shrink-0 border-4 border-text object-cover"
          />
        ) : (
          <Image src={categorySprite(choice.category)} alt="" width={64} height={64} unoptimized className="pixelated size-16 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p>{time}</p>
          <p className="text-small">
            {photos} {photos === 1 ? "photo" : "photos"}
          </p>
        </div>
        <label className="trip-check flex min-h-11 shrink-0 cursor-pointer items-center gap-2">
          <span className="text-small">Include</span>
          <input
            type="checkbox"
            checked={choice.include}
            onChange={(event) => onChange({ include: event.target.checked })}
            aria-label={`Include stop ${stop.number}`}
            className="sr-only"
          />
          <span aria-hidden="true" className="trip-check-box flex size-7 items-center justify-center">
            <Check className="size-6" />
          </span>
        </label>
      </div>

      {/* Place lookups come in Phase 4.2: the match, its candidates, "Your places", and "Drop a
          pin" go here. */}
      <div className="border-4 border-dashed border-text px-3 py-2 text-small">
        Match: place lookups aren&apos;t built yet.
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`${ids}-category`} className="w-20 shrink-0">
          Category
        </Label>
        <div className="min-w-0 flex-1 px-1.5">
          <CategorySelect
            id={`${ids}-category`}
            value={choice.category}
            onChange={(category) => onChange({ category })}
            disabled={false}
            lazy
          />
        </div>
      </div>

      {choice.extras ? (
        <>
          <RatingField value={choice.rating} onChange={(rating) => onChange({ rating })} disabled={false} />
          <NoteField value={choice.note} onChange={(note) => onChange({ note })} disabled={false} />
        </>
      ) : (
        <Button type="button" variant="ghost" onClick={() => onChange({ extras: true })} className="gap-2 self-start px-0">
          <Plus aria-hidden="true" className="size-6 shrink-0" />
          Add rating & note
        </Button>
      )}
    </li>
  );
}

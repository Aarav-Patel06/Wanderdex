"use client";

import { type RefObject, startTransition, useEffect, useId, useRef, useState } from "react";

import { formatInTimeZone } from "date-fns-tz";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check } from "pixelarticons/react/Check";
import { MapPin } from "pixelarticons/react/MapPin";
import { Plus } from "pixelarticons/react/Plus";
import { Dialog as DialogPrimitive } from "radix-ui";

import { postJson } from "@/components/add/api";
import { PlaceOption } from "@/components/add/confirm-card";
import { CategorySelect, NoteField, RatingField } from "@/components/add/visit-fields";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { type Category, categorySprite } from "@/lib/categories";
import { isDecodableFile, type Thumbnail } from "@/lib/photo";
import { type Skipped, skippedLine, type TripStop } from "@/lib/trip/group";
import type { ImportResult, ImportStop } from "@/lib/trip/lookup";
import {
  initialChoice,
  isAlreadyLogged,
  isSaveable,
  lookupsLine,
  type Match,
  outOfLookupsLine,
  type StopChoice,
  stopZone,
  visitBody,
  withMatch,
} from "@/lib/trip/review";
import { type Thumbnailer, thumbnailer, type ThumbnailRequest } from "@/lib/trip/thumbnails";
import type { SavedVisit } from "@/lib/visits";

import "./import.css";

// An import ready for review: its id (SPEC §11.8 step 8), the picked files (they stay in the
// browser), its stops in time order, each stop's EXIF thumbnail (or null), what was skipped, and
// what /api/resolve/import found for each stop, with its counts.
export type TripReviewData = {
  id: string;
  files: File[];
  stops: TripStop[];
  thumbnails: (Thumbnail | null)[];
  skipped: Skipped;
  lookups: ImportResult;
};

// The stop cards render a few at a time, each step a transition (React yields while rendering
// it): up to 150 at once would hold the page for seconds on a phone (SPEC §20: no task over
// 100 ms). The review opens with one, which keeps its first, unsliced commit short.
const CARDS_PER_STEP = 4;

// lib/visits' MANUAL_NAME_MAX (the browser can't import lib/visits' values, see visit-fields).
const NAME_MAX = 100;

// The stop's time, in its zone (its match's): "Mar 12, 2025, 3:45 PM", as lib/dates'
// formatVisited shows an exact time.
const formatStopTime = (stop: TripStop, timeZone: string) => formatInTimeZone(stop.instant, timeZone, "MMM d, yyyy, h:mm a");

// The review screen (SPEC §11.8 steps 5–9): modal, so nothing behind it can be reached. Phones:
// full screen, over the tab bar. Desktop: a large panel over the map, right of the sidebar. Close
// and Escape ask first while stops are unsaved; reloading or closing the tab gets the browser's
// own warning. "Save N visits" saves the checked stops one at a time; onSaved gets the visits
// saved, and whether all of them were (then the review is done).
export function TripReview({
  review,
  onClose,
  onSaved,
}: {
  review: TripReviewData;
  onClose: () => void;
  onSaved: (saved: SavedVisit[], done: boolean) => void;
}) {
  const router = useRouter();
  const lookups = review.lookups.stops;
  const [choices, setChoices] = useState<StopChoice[]>(() => lookups.map(initialChoice));
  // While saving: how many of the checked stops are done.
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(1);
  const listRef = useRef<HTMLOListElement>(null);
  // Makes thumbnails for stops without an EXIF one; its worker stops when the review closes.
  const [thumbnails] = useState(thumbnailer);
  useEffect(() => thumbnails.stop, [thumbnails]);
  useEffect(() => {
    if (shown >= review.stops.length) return;
    const next = setTimeout(() => startTransition(() => setShown((count) => count + CARDS_PER_STEP)));
    return () => clearTimeout(next);
  }, [shown, review.stops.length]);
  const unsaved = choices.some((choice) => choice.status !== "saved");
  const saveCount = choices.filter(isSaveable).length;
  const skipped = skippedLine(review.skipped);
  const outOfLookups = outOfLookupsLine(review.lookups.counts);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const leave = () => {
    if (saving) return;
    if (unsaved) setLeaving(true);
    else onClose();
  };
  const choose = (index: number, change: Partial<StopChoice>) =>
    setChoices((current) => current.map((choice, i) => (i === index ? { ...choice, ...change } : choice)));

  // The checked stops, one at a time in time order (SPEC §11.8 step 8). A failed stop stays,
  // checked, so Save retries it (its import id and number make a retry answer with the visit if
  // the first try saved it after all); saved stops leave the review.
  async function save() {
    const indices = choices.flatMap((choice, index) => (isSaveable(choice) ? [index] : []));
    const saved: SavedVisit[] = [];
    let failed = 0;
    setSaving({ done: 0, total: indices.length });
    for (const [done, index] of indices.entries()) {
      const body = visitBody(review.id, review.stops[index], lookups[index], choices[index]);
      const result = await postJson<SavedVisit>("/api/visits", body);
      if (!result.ok && result.error === "unauthorized") return router.push("/login");
      if (result.ok) saved.push(result.data);
      else failed++;
      choose(index, { status: result.ok ? "saved" : "failed" });
      setSaving({ done: done + 1, total: indices.length });
    }
    setSaving(null);
    onSaved(saved, failed === 0);
  }

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
              <p className="text-small">{lookupsLine(review.lookups.counts)}</p>
              {skipped && <p className="text-small">{skipped}</p>}
              {outOfLookups && (
                <Alert variant="warning">
                  <AlertDescription>{outOfLookups}</AlertDescription>
                </Alert>
              )}
            </header>

            {/* scroll-py: a field scrolled into view by keyboard focus keeps its focus ring inside. */}
            <ol ref={listRef} className="flex min-h-0 flex-1 scroll-py-3 flex-col gap-5 overflow-y-auto px-4 py-4 pr-5">
              {review.stops.slice(0, shown).map(
                (stop, index) =>
                  choices[index].status !== "saved" && (
                    <StopCard
                      key={stop.number}
                      stop={stop}
                      thumbnail={review.thumbnails[index]}
                      photo={review.files[stop.photos[0]]}
                      thumbnails={thumbnails}
                      list={listRef}
                      lookup={lookups[index]}
                      choice={choices[index]}
                      disabled={saving !== null}
                      onChange={(change) => choose(index, change)}
                    />
                  ),
              )}
            </ol>

            <footer className="flex flex-wrap items-center gap-button-group border-t-4 border-text px-5.5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4">
              <Button type="button" disabled={saveCount === 0 || saving !== null} onClick={save}>
                Save {saveCount} {saveCount === 1 ? "visit" : "visits"}
              </Button>
              <Button type="button" variant="secondary" disabled={saving !== null} onClick={leave}>
                Close
              </Button>
              {saving && (
                <p role="status">
                  Saving {saving.done}/{saving.total}
                </p>
              )}
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

// The CSS that turns an EXIF thumbnail upright, by EXIF Orientation (1 = upright): mirrored (2,
// 4), turned (3, 6, 8), or both (5, 7). On a square image (object-cover), turning keeps its box.
const ORIENTATION_TRANSFORM: Record<number, string | undefined> = {
  2: "scaleX(-1)",
  3: "rotate(180deg)",
  4: "scaleY(-1)",
  5: "rotate(90deg) scaleY(-1)",
  6: "rotate(90deg)",
  7: "rotate(90deg) scaleX(-1)",
  8: "rotate(270deg)",
};

// A thumbnail is made only for cards within a list's height of the visible part of the list.
const NEAR_MARGIN = "100% 0px";

function StopCard({
  stop,
  thumbnail,
  photo,
  thumbnails,
  list,
  lookup,
  choice,
  disabled,
  onChange,
}: {
  stop: TripStop;
  thumbnail: Thumbnail | null;
  // The stop's first photo, to make a thumbnail from when it has no EXIF one.
  photo: File;
  thumbnails: Thumbnailer;
  list: RefObject<HTMLOListElement | null>;
  // What the lookup found for this stop: the user's places near it and Google's candidates.
  lookup: ImportStop;
  choice: StopChoice;
  disabled: boolean;
  onChange: (change: Partial<StopChoice>) => void;
}) {
  const ids = useId();
  const cardRef = useRef<HTMLLIElement>(null);
  // Without an EXIF thumbnail, one made from the photo (local, never uploaded): asked for once the
  // card is near the viewport, dropped if it scrolls away while still waiting its turn. null: the
  // browser can't decode the photo, so the sprite stays.
  const [made, setMade] = useState<Blob | null>();
  const canMake = !thumbnail && isDecodableFile(photo);
  useEffect(() => {
    const card = cardRef.current;
    if (!canMake || made !== undefined || !card) return;
    let request: ThumbnailRequest | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !request) {
          request = thumbnails.request(photo);
          void request.result.then(setMade);
        } else if (!entry.isIntersecting && request?.cancel()) request = null;
      },
      { root: list.current, rootMargin: NEAR_MARGIN },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
      request?.cancel();
    };
  }, [canMake, made, photo, thumbnails, list]);
  // The browser may not be able to show the thumbnail; the sprite stands in.
  const [broken, setBroken] = useState(false);
  // The thumbnail as an object URL, made as the card shows it and revoked as it goes, which is
  // when the review closes. Set on the element, so making it doesn't re-render.
  const thumbnailRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = thumbnailRef.current;
    const source = made ?? (thumbnail && new Blob([thumbnail.bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }));
    if (!image || !source) return;
    const url = URL.createObjectURL(source);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [thumbnail, made]);
  const photos = stop.photos.length;
  const time = formatStopTime(stop, stopZone(stop, lookup, choice));

  return (
    <li ref={cardRef} className="trip-stop flex flex-col gap-3 p-3" aria-label={`Stop ${stop.number}, ${time}`}>
      {/* The date and time get the card's width beside the thumbnail, so they stay on one line at
          375px; the photo count and Include share the line below. */}
      <div className="flex items-center gap-3">
        {(thumbnail || made) && !broken ? (
          // A plain img: next/image needs its src while rendering, and this one is set afterwards.
          // A made thumbnail is already upright; an EXIF one is turned by the photo's orientation.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={thumbnailRef}
            alt=""
            width={64}
            height={64}
            onError={() => setBroken(true)}
            style={{ transform: made ? undefined : ORIENTATION_TRANSFORM[thumbnail?.orientation ?? 1] }}
            className="trip-thumbnail size-16 shrink-0 border-4 border-text object-cover"
          />
        ) : (
          <Image src={categorySprite(choice.category)} alt="" width={64} height={64} unoptimized className="pixelated size-16 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p>{time}</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-small">
              {photos} {photos === 1 ? "photo" : "photos"}
            </p>
            <label className="trip-check flex min-h-11 shrink-0 cursor-pointer items-center gap-2">
              <span className="text-small">Include</span>
              <input
                type="checkbox"
                checked={choice.include}
                onChange={(event) => onChange({ include: event.target.checked })}
                disabled={disabled}
                aria-label={`Include stop ${stop.number}`}
                className="sr-only"
              />
              <span aria-hidden="true" className="trip-check-box flex size-7 items-center justify-center">
                <Check className="size-6" />
              </span>
            </label>
          </div>
        </div>
      </div>

      <MatchField
        group={`${ids}-match`}
        lookup={lookup}
        choice={choice}
        disabled={disabled}
        onMatch={(match) => onChange(withMatch(lookup, choice, match))}
        onName={(name) => onChange({ name })}
      />

      <div className="flex items-center gap-3">
        <Label htmlFor={`${ids}-category`} className="w-20 shrink-0">
          Category
        </Label>
        <div className="min-w-0 flex-1 px-1.5">
          <CategorySelect
            id={`${ids}-category`}
            value={choice.category}
            onChange={(category) => onChange({ category })}
            disabled={disabled}
            lazy
          />
        </div>
      </div>

      {choice.extras ? (
        <>
          <RatingField value={choice.rating} onChange={(rating) => onChange({ rating })} disabled={disabled} />
          <NoteField value={choice.note} onChange={(note) => onChange({ note })} disabled={disabled} />
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange({ extras: true })}
          className="gap-2 self-start px-0"
        >
          <Plus aria-hidden="true" className="size-6 shrink-0" />
          Add rating & note
        </Button>
      )}

      {choice.status === "failed" && (
        <Alert variant="error">
          <AlertDescription>Couldn&apos;t save this stop. Try again.</AlertDescription>
        </Alert>
      )}
    </li>
  );
}

// The stop's match (SPEC §11.8 step 7), switchable among its "Your places" and its candidates,
// each shown as on the confirmation card, plus "Drop a pin": a new place at the stop's location
// (the photos' location is the pin, so there's no map placement), named here. "Already logged"
// follows the chosen match.
function MatchField({
  group,
  lookup,
  choice,
  disabled,
  onMatch,
  onName,
}: {
  group: string;
  lookup: ImportStop;
  choice: StopChoice;
  disabled: boolean;
  onMatch: (match: Match) => void;
  onName: (name: string) => void;
}) {
  const { match } = choice;
  const is = (kind: "yours" | "candidate", index: number) => match?.kind === kind && match.index === index;
  const sprite = (category: Category) => (
    <Image src={categorySprite(category)} alt="" width={32} height={32} unoptimized className="pixelated shrink-0" />
  );
  const where = (place: { city: string | null; country: string | null }) => [place.city, place.country].filter(Boolean).join(", ");

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex w-full items-center justify-between gap-3 text-small">
        Match
        {isAlreadyLogged(lookup, match) && <span className="trip-logged px-1.5 text-tiny">Already logged</span>}
      </legend>
      {lookup.yours.length > 0 && <p className="text-tiny">Your places</p>}
      {lookup.yours.map((place, index) => (
        <PlaceOption
          key={place.id}
          group={group}
          checked={is("yours", index)}
          onChange={() => onMatch({ kind: "yours", index })}
          icon={sprite(place.category)}
          name={place.name}
          detail={where(place)}
          disabled={disabled}
        />
      ))}
      {lookup.candidates.length > 0 && <p className="text-tiny">Places nearby</p>}
      {lookup.candidates.map((place, index) => (
        <PlaceOption
          key={place.google_place_id}
          group={group}
          checked={is("candidate", index)}
          onChange={() => onMatch({ kind: "candidate", index })}
          icon={sprite(place.category)}
          name={place.name}
          detail={where(place)}
          disabled={disabled}
        />
      ))}
      {lookup.yours.length === 0 && lookup.candidates.length === 0 && <p className="text-tiny">No places found here.</p>}
      <PlaceOption
        group={group}
        checked={match?.kind === "pin"}
        onChange={() => onMatch({ kind: "pin" })}
        icon={<MapPin aria-hidden="true" className="size-8 shrink-0" />}
        name="Drop a pin"
        detail="A new place where the photos were taken"
        disabled={disabled}
      />
      {match?.kind === "pin" && (
        <div className="flex items-center gap-3">
          <Label htmlFor={`${group}-name`} className="w-20 shrink-0">
            Name
          </Label>
          <div className="min-w-0 flex-1 px-1.5">
            <Input
              id={`${group}-name`}
              required
              maxLength={NAME_MAX}
              autoComplete="off"
              placeholder="What is this place?"
              value={choice.name}
              onChange={(event) => onName(event.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </fieldset>
  );
}

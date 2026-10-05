"use client";

import { useEffect, useId, useRef, useState } from "react";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus } from "pixelarticons/react/Plus";

import { DropPinLink } from "@/components/add/add-panel";
import { errorCopy, postJson } from "@/components/add/api";
import { CategorySelect, NoteField, RatingField, WhenField } from "@/components/add/visit-fields";
import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { type Category, categorySprite } from "@/lib/categories";
import type { LatLng } from "@/lib/links/parse";
import type { PhotoTaken } from "@/lib/photo";
import type { ResolvedCandidate, Visited } from "@/lib/resolve";
import { cn } from "@/lib/utils";
import type { NewVisit, SavedVisit } from "@/lib/visits";
import { initialWhen, isComplete, whenValue } from "@/lib/when";

// A place the user already has visits at, for "Add another visit" on its detail page: the card's
// only candidate, with the user's current category, saved by its id (SPEC §11.6).
export type KnownPlace = {
  id: string;
  name: string;
  category: Category;
  city: string | null;
  country: string | null;
  timezone: string;
};

// A dropped pin (SPEC §11.4): its coordinates and their zone, for the date & time.
export type PinPlace = LatLng & { timezone: string };

// The lookup's source and input as /api/visits takes them: a photo has no input (SPEC §8).
type LookupSource = { source: "link" | "text"; source_input: string } | { source: "photo"; source_input: null };

// What the card confirms: a successful lookup, a known place, or a dropped pin (a new manual
// place, named on the card). A lookup that started from a photo keeps the photo's location (if it
// had one) and date, so "Drop a pin" from the card can start from them (SPEC §11.4).
export type Lookup =
  | ({
      id: number;
      candidates: ResolvedCandidate[];
      visited: Visited;
      photo?: { location: LatLng | null; taken: PhotoTaken | null };
    } & LookupSource)
  | { id: number; place: KnownPlace }
  | { id: number; pin: PinPlace; visited: Visited };

// lib/visits' MANUAL_NAME_MAX (the browser can't import lib/visits' values, see visit-fields).
const NAME_MAX = 100;

// The confirmation card (SPEC §11.5): candidates, date & time with its precision, category,
// rating, note, Save / Cancel, and "Can't find it? Drop a pin" (onDropPin, after a lookup). For a
// dropped pin, a name field takes the candidates' place, and the category starts at Other.
// compact (the phone drawer): rating and note start behind an "Add rating & note" button, so
// the card fits a 390×844 phone (SPEC §14.2) and a plain save stays one tap.
export function ConfirmCard({
  lookup,
  compact,
  onCancel,
  onSaved,
  onDropPin,
}: {
  lookup: Lookup;
  compact: boolean;
  onCancel: () => void;
  onSaved: (saved: SavedVisit) => void;
  onDropPin?: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const candidates = "place" in lookup ? [lookup.place] : "candidates" in lookup ? lookup.candidates : null;
  const [selected, setSelected] = useState(0);
  const candidate = candidates?.[selected];
  const timeZone = candidate?.timezone ?? ("pin" in lookup ? lookup.pin.timezone : "UTC");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>(candidate?.category ?? "other");
  // In the first candidate's zone (or the pin's); candidates are near each other, and the
  // wall-clock time stays as entered if another one is picked.
  const [when, setWhen] = useState(() => initialWhen("place" in lookup ? null : lookup.visited, timeZone));
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [extrasOpen, setExtrasOpen] = useState(false);
  const showExtras = !compact || extrasOpen;
  const ratingRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The button that showed rating and note is gone, so focus goes to the first rating cell
  // (which also scrolls it into view in the drawer).
  useEffect(() => {
    if (extrasOpen) ratingRef.current?.querySelector("button")?.focus();
  }, [extrasOpen]);

  // Each candidate brings its own auto-detected category (SPEC §12.5).
  function pick(index: number) {
    setSelected(index);
    setCategory(candidates![index].category);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const choices = { category, visited: { value: whenValue(when), precision: when.precision }, rating, note };
    const visit: NewVisit =
      "place" in lookup
        ? { place_id: lookup.place.id, ...choices }
        : "pin" in lookup
          ? { manual_place: { name: name.trim(), lat: lookup.pin.lat, lng: lookup.pin.lng }, ...choices }
          : {
              place: lookup.candidates[selected],
              ...choices,
              ...(lookup.source === "photo"
                ? { source: "photo" as const, source_input: null }
                : { source: lookup.source, source_input: lookup.source_input }),
            };
    const result = await postJson<SavedVisit>("/api/visits", visit);
    if (result.ok) return onSaved(result.data);
    setSaving(false);
    if (result.error === "unauthorized") return router.push("/login");
    setError(errorCopy(result.error));
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {candidates ? (
        <fieldset disabled={saving} className="flex flex-col gap-2">
          {/* The drop-pin link shares this row, so it adds no row of its own (SPEC §14.2 fit). Its
              44px tap target reaches 4px into the empty gaps above and below (-my-1), so the row
              is only 36px tall. A fieldset doesn't disable its legend's contents, hence its own
              disabled. */}
          <legend className={cn("flex w-full items-center justify-between gap-x-3 text-small", !onDropPin && "mb-1")}>
            {candidates.length === 1 ? "Match" : `Matches (${candidates.length})`}
            {onDropPin && <DropPinLink onClick={onDropPin} disabled={saving} className="-my-1" />}
          </legend>
          {candidates.map((option, index) => (
            // Native radios: arrow keys move between them. The row is the tap target; the chosen
            // one is accent with dark text. The list never changes while the card is open.
            <label
              key={index}
              className="flex min-h-11 cursor-pointer items-center gap-3 border-4 border-text bg-background px-2 py-0.5 has-checked:bg-accent has-focus-visible:outline-4 has-focus-visible:outline-accent has-focus-visible:[box-shadow:var(--focus-ring)]"
            >
              <input
                type="radio"
                name={`${ids}-place`}
                checked={selected === index}
                onChange={() => pick(index)}
                className="sr-only"
              />
              <Image
                src={categorySprite(option.category)}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="pixelated shrink-0"
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-small break-words">{option.name}</span>
                <span className="text-tiny">{[option.city, option.country].filter(Boolean).join(", ")}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        // A dropped pin: the user names the place (SPEC §11.4). Label beside, like Category.
        <div className="flex items-center gap-3">
          <Label htmlFor={`${ids}-name`} className="w-20 shrink-0">
            Name
          </Label>
          <div className="min-w-0 flex-1 px-1.5">
            <Input
              id={`${ids}-name`}
              // Not on phones, where the keyboard would cover the drawer.
              autoFocus={!compact}
              required
              maxLength={NAME_MAX}
              autoComplete="off"
              placeholder="What is this place?"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      )}

      <WhenField when={when} onChange={setWhen} timeZone={timeZone} disabled={saving} />

      {/* Label beside the control, to fit the card (SPEC §14.2). */}
      <div className="flex items-center gap-3">
        <Label htmlFor={`${ids}-category`} className="w-20 shrink-0">
          Category
        </Label>
        <div className="min-w-0 flex-1 px-1.5">
          <CategorySelect id={`${ids}-category`} value={category} onChange={setCategory} disabled={saving} />
        </div>
      </div>

      {!showExtras && (
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={() => setExtrasOpen(true)}
          className="gap-2 self-start px-0"
        >
          <Plus aria-hidden="true" className="size-6 shrink-0" />
          Add rating & note
        </Button>
      )}

      {showExtras && (
        <>
          <RatingField ref={ratingRef} value={rating} onChange={setRating} disabled={saving} />
          <NoteField value={note} onChange={setNote} disabled={saving} />
        </>
      )}

      {/* Side by side, the shared button-group gap apart; they wrap at 375px. px-3: with px-4
          they'd wrap on a 390px phone too, and the card would no longer fit it (SPEC §14.2).
          mt: with the gap, 20px; the note's and the buttons' pixel borders take 6px each. */}
      <div className="mt-2 flex flex-wrap gap-button-group px-1.5">
        {/* An exact time that was cleared can't be saved, nor a pin without a name. */}
        <Button
          type="submit"
          disabled={saving || !isComplete(when) || (!candidates && !name.trim())}
          className="flex-1 px-3"
        >
          Save visit
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel} className="flex-1 px-3">
          Cancel
        </Button>
      </div>
      {(saving || error) && (
        <div className="px-1.5">
          {saving && <Loading />}
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </form>
  );
}

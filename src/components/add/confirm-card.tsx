"use client";

import { useEffect, useId, useRef, useState } from "react";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus } from "pixelarticons/react/Plus";

import { errorCopy, postJson } from "@/components/add/api";
import { CategorySelect, NoteField, RatingField, WhenField } from "@/components/add/visit-fields";
import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Label } from "@/components/ui/8bit/label";
import { type Category, categorySprite } from "@/lib/categories";
import type { ResolvedCandidate, Visited } from "@/lib/resolve";
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

// What the card confirms: a successful lookup, or a known place.
export type Lookup =
  | {
      id: number;
      candidates: ResolvedCandidate[];
      visited: Visited;
      source: "link" | "text";
      source_input: string;
    }
  | { id: number; place: KnownPlace };

// The confirmation card (SPEC §11.5): candidates, date & time with its precision, category,
// rating, note, and Save / Cancel. "Drop a pin" comes with the manual fallback.
// compact (the phone drawer): rating and note start behind an "Add rating & note" button, so
// the card fits a 390×844 phone (SPEC §14.2) and a plain save stays one tap.
export function ConfirmCard({
  lookup,
  compact,
  onCancel,
  onSaved,
}: {
  lookup: Lookup;
  compact: boolean;
  onCancel: () => void;
  onSaved: (saved: SavedVisit) => void;
}) {
  const router = useRouter();
  const ids = useId();
  const candidates = "place" in lookup ? [lookup.place] : lookup.candidates;
  const [selected, setSelected] = useState(0);
  const candidate = candidates[selected];
  const [category, setCategory] = useState<Category>(candidate.category);
  // In the first candidate's zone; candidates are near each other, and the wall-clock time stays
  // as entered if another one is picked.
  const [when, setWhen] = useState(() => initialWhen("place" in lookup ? null : lookup.visited, candidate.timezone));
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
    setCategory(candidates[index].category);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const choices = { category, visited: { value: whenValue(when), precision: when.precision }, rating, note };
    const visit: NewVisit =
      "place" in lookup
        ? { place_id: lookup.place.id, ...choices }
        : {
            place: lookup.candidates[selected],
            ...choices,
            source: lookup.source,
            source_input: lookup.source_input,
          };
    const result = await postJson<SavedVisit>("/api/visits", visit);
    if (result.ok) return onSaved(result.data);
    setSaving(false);
    if (result.error === "unauthorized") return router.push("/login");
    setError(errorCopy(result.error));
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <fieldset disabled={saving} className="flex flex-col gap-2">
        <legend className="mb-1 text-small">
          {candidates.length === 1 ? "Match" : `Matches (${candidates.length})`}
        </legend>
        {candidates.map((option, index) => (
          // Native radios: arrow keys move between them. The row is the tap target; the chosen
          // one is accent with dark text. The list never changes while the card is open.
          <label
            key={index}
            className="flex min-h-11 cursor-pointer items-center gap-3 border-4 border-text bg-background px-2 py-0.5 has-checked:bg-accent has-focus-visible:outline-4 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
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

      <WhenField when={when} onChange={setWhen} timeZone={candidate.timezone} disabled={saving} />

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

      {/* Side by side where both fit (wraps at 375px). gap-x-3: each button's pixel border
          reaches 6px outside it; gap-y-7 leaves a clear 12px below Save's shadow when wrapped.
          mt: with the gap, 20px; the note's and the buttons' pixel borders take 6px each. */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-7 px-1.5">
        {/* An exact time that was cleared can't be saved. */}
        <Button type="submit" disabled={saving || !isComplete(when)} className="flex-1">
          Save visit
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel} className="flex-1">
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

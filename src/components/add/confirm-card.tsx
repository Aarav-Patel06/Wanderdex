"use client";

import { useId, useState } from "react";

import { formatInTimeZone } from "date-fns-tz";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon } from "pixelarticons/react/Calendar";

import { errorCopy, postJson } from "@/components/add/api";
import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Calendar } from "@/components/ui/8bit/calendar";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/8bit/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/8bit/select";
import { CATEGORIES, type Category, CATEGORY_LABELS, categorySprite } from "@/lib/categories";
import type { ResolvedCandidate, Visited } from "@/lib/resolve";
import type { NewVisit, SavedVisit } from "@/lib/visits";
import { dateToDay, dayToDate, formatDay, initialWhen, whenValue, withDay, withTime } from "@/lib/when";

// A successful lookup, ready to confirm.
export type Lookup = {
  id: number;
  candidates: ResolvedCandidate[];
  visited: Visited;
  source: NewVisit["source"];
  source_input: string;
};

// The confirmation card's fields (SPEC §11.5), Phase 1: candidates, date & time, category, and
// Save / Cancel. Rating, note, the precision control, and "Drop a pin" come in Phase 2.
export function ConfirmCard({
  lookup,
  onCancel,
  onSaved,
}: {
  lookup: Lookup;
  onCancel: () => void;
  onSaved: (saved: SavedVisit) => void;
}) {
  const router = useRouter();
  const ids = useId();
  const [selected, setSelected] = useState(0);
  const candidate = lookup.candidates[selected];
  const [category, setCategory] = useState<Category>(candidate.category);
  // In the first candidate's zone; candidates are near each other, and the wall-clock time stays
  // as entered if another one is picked.
  const [when, setWhen] = useState(() => initialWhen(lookup.visited, candidate.timezone));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The calendar marks today in the place's zone, not the browser's.
  const [today] = useState(() => dayToDate(formatInTimeZone(new Date(), candidate.timezone, "yyyy-MM-dd")));

  // Each candidate brings its own auto-detected category (SPEC §12.5).
  function pick(index: number) {
    setSelected(index);
    setCategory(lookup.candidates[index].category);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const visit: NewVisit = {
      place: candidate,
      category,
      visited: { value: whenValue(when), precision: when.precision },
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
    <form onSubmit={save} className="flex flex-col gap-4">
      <fieldset disabled={saving} className="flex flex-col gap-2">
        <legend className="mb-1 text-small">
          {lookup.candidates.length === 1 ? "Match" : `Matches (${lookup.candidates.length})`}
        </legend>
        {lookup.candidates.map((option, index) => (
          // Native radios: arrow keys move between them. The row is the tap target; the chosen
          // one is accent with dark text.
          <label
            key={option.google_place_id}
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

      <div role="group" aria-labelledby={`${ids}-when`} className="flex flex-col gap-1.5">
        <span id={`${ids}-when`} className="text-small">
          Date & time
        </span>
        <div className="flex flex-wrap items-center gap-4 px-1.5">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                font="normal"
                disabled={saving}
                aria-label={`Date: ${formatDay(when)}`}
                className="flex-1 justify-start gap-2 font-body text-body"
              >
                <CalendarIcon aria-hidden="true" className="size-6 shrink-0" />
                {formatDay(when)}
              </Button>
            </PopoverTrigger>
            <PopoverContent font="normal" align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                required
                // A month-precision date has no day to highlight; the calendar just opens on it.
                selected={when.precision === "month" ? undefined : dayToDate(when.day)}
                defaultMonth={dayToDate(when.day)}
                today={today}
                onSelect={(date) => {
                  setWhen(withDay(when, dateToDay(date)));
                  setCalendarOpen(false);
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
          <Input
            type="time"
            aria-label="Time"
            value={when.time}
            onChange={(event) => setWhen(withTime(when, event.target.value))}
            disabled={saving}
            className="w-36"
          />
        </div>
        <p className="text-tiny">Local time at the place.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-category`}>Category</Label>
        <div className="px-1.5">
          <Select value={category} onValueChange={(value) => setCategory(value as Category)} disabled={saving}>
            <SelectTrigger id={`${ids}-category`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((option) => (
                <SelectItem key={option} value={option}>
                  <Image src={categorySprite(option)} alt="" width={32} height={32} unoptimized className="pixelated" />
                  {CATEGORY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* gap-7: each button's pixel border reaches 6px outside it and Save's shadow 4px below,
          so this leaves a clear 12px between Save visit and Cancel. */}
      <div className="flex flex-col gap-7 px-1.5">
        {/* An exact time that was cleared can't be saved. */}
        <Button type="submit" disabled={saving || (when.precision === "datetime" && !when.time)}>
          Save visit
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        {saving && <Loading />}
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
}

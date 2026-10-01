"use client";

import { useId, useState } from "react";

import { formatInTimeZone } from "date-fns-tz";
import Image from "next/image";
import { Calendar as CalendarIcon } from "pixelarticons/react/Calendar";

import { MonthPicker } from "@/components/add/month-picker";
import { Calendar } from "@/components/ui/8bit/calendar";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/8bit/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/8bit/select";
import { Textarea } from "@/components/ui/8bit/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/8bit/toggle-group";
import { CATEGORIES, type Category, CATEGORY_LABELS, categorySprite } from "@/lib/categories";
import type { Precision } from "@/lib/dates";
import {
  dateToDay,
  dayToDate,
  formatDay,
  type When,
  withDay,
  withMonth,
  withPrecision,
  withTime,
} from "@/lib/when";
import { cn } from "@/lib/utils";

// A visit's fields, shared by the confirmation card (SPEC §11.5) and the place detail page's edit
// dialog (§14.4), so both follow the same rules.

// lib/visits' NOTE_MAX; the browser can't import lib/visits' values (it pulls in lib/dates and
// its tz lookup table). The count shows from 90% of it.
const NOTE_MAX = 2000;
const NOTE_COUNT_FROM = 1800;

const PRECISION_OPTIONS: { value: Precision; label: string }[] = [
  { value: "datetime", label: "Exact time" },
  { value: "date", label: "Date only" },
  { value: "month", label: "Month only" },
];

const RATINGS = Array.from({ length: 10 }, (_, index) => String(index + 1));

// Segmented toggle groups (precision, rating): cells share 4px dark lines. The group draws the
// top and left edges and each cell its right and bottom ones, so a cell's box, border
// included, is the 44px tap target (SPEC §16.5). Chosen = accent with dark text, like the
// candidates. No press movement: a cell would slide over its neighbour. Also My Visits' date
// range (From / To).
export const segmented = "grid w-full items-stretch gap-0 border-t-4 border-l-4 border-text";
export const segment =
  "h-11 min-w-0 border-r-4 border-b-4 border-text bg-background px-1 text-text hover:bg-surface-dark data-[state=on]:bg-accent data-[state=on]:hover:bg-accent focus-visible:ring-0 active:translate-x-0 active:translate-y-0";

// Date & time with its precision control, as local wall-clock values in `timeZone`, the place's.
export function WhenField({
  when,
  onChange,
  timeZone,
  disabled,
}: {
  when: When;
  onChange: (when: When) => void;
  timeZone: string;
  disabled: boolean;
}) {
  const id = useId();
  const [calendarOpen, setCalendarOpen] = useState(false);
  // The calendar marks today in the place's zone, not the browser's.
  const [today] = useState(() => dayToDate(formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd")));

  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span id={id} className="text-small">
          Date & time
        </span>
        <span className="text-tiny">Local time at the place</span>
      </div>
      {/* Precision (SPEC §8): starts at the given one. "" is a tap on the chosen one, which
          keeps it. */}
      <ToggleGroup
        type="single"
        font="normal"
        aria-label="Precision"
        value={when.precision}
        onValueChange={(value) => {
          if (value) onChange(withPrecision(when, value as Precision));
        }}
        disabled={disabled}
        className={cn(segmented, "grid-cols-3")}
      >
        {PRECISION_OPTIONS.map(({ value, label }) => (
          <ToggleGroupItem key={value} value={value} font="normal" className={cn(segment, "text-small")}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {/* The date opens a picker, but it's drawn as a field like the time beside it (and the
          Select and Note): a 6px pixel border top and bottom in the box, sides 6px outside it
          (hence px-1.5 here), icon on the right. gap-5: 8px clear between the two borders.
          mt: with the gap, 12px. */}
      <div className="mt-1.5 flex items-center gap-5 px-1.5">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <div className="relative min-w-0 flex-1 border-y-6 border-text">
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label={`${when.precision === "month" ? "Month" : "Date"}: ${formatDay(when)}`}
                className="flex min-h-11 w-full items-center gap-2 bg-background px-2.5 text-left text-body text-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                {formatDay(when)}
                <CalendarIcon aria-hidden="true" className="ml-auto size-6 shrink-0" />
              </button>
            </PopoverTrigger>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-text" />
          </div>
          <PopoverContent font="normal" align="start" className="w-auto p-0">
            {when.precision === "month" ? (
              <MonthPicker
                value={when.day.slice(0, 7)}
                onSelect={(month) => {
                  onChange(withMonth(when, month));
                  setCalendarOpen(false);
                }}
              />
            ) : (
              <Calendar
                mode="single"
                required
                selected={dayToDate(when.day)}
                defaultMonth={dayToDate(when.day)}
                today={today}
                onSelect={(date) => {
                  onChange(withDay(when, dateToDay(date)));
                  setCalendarOpen(false);
                }}
                autoFocus
              />
            )}
          </PopoverContent>
        </Popover>
        {when.precision === "datetime" && (
          <Input
            type="time"
            aria-label="Time"
            value={when.time}
            onChange={(event) => onChange(withTime(when, event.target.value))}
            disabled={disabled}
            className="w-36"
          />
        )}
      </div>
    </div>
  );
}

// The 10 categories (SPEC §12.5) as a dropdown with their sprites.
export function CategorySelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: Category;
  onChange: (category: Category) => void;
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Category)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
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
  );
}

// Rating (SPEC §11.5): one row of 10 where ten 44px cells fit (27.75rem = 4px + 10 × 44px), two
// rows of 5 otherwise (phones). Tapping the chosen number again clears it.
export function RatingField({
  value,
  onChange,
  disabled,
  ref,
}: {
  value: number | null;
  onChange: (rating: number | null) => void;
  disabled: boolean;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const id = useId();
  return (
    <div ref={ref} role="group" aria-labelledby={id} className="@container flex flex-col gap-1.5">
      <span id={id} className="text-small">
        Rating (optional)
      </span>
      <ToggleGroup
        type="single"
        font="retro"
        aria-labelledby={id}
        value={value === null ? "" : String(value)}
        onValueChange={(next) => onChange(next ? Number(next) : null)}
        disabled={disabled}
        className={cn(segmented, "grid-cols-5 @[27.75rem]:grid-cols-10")}
      >
        {RATINGS.map((rating) => (
          <ToggleGroupItem key={rating} value={rating} font="retro" className={cn(segment, "text-button")}>
            {rating}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

// Label beside the field, with the count under it near the limit. mt: with the gap, 16px; the
// field's pixel border reaches 6px above it. The field starts at one line and grows with the
// text (field-sizing, from the base Textarea) up to two lines, then scrolls inside, so the
// desktop card still fits at 1280×800.
export function NoteField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (note: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className="mt-1 flex items-start gap-3">
      <div className="flex w-20 shrink-0 flex-col pt-2.5">
        <Label htmlFor={id}>Note</Label>
        {value.length >= NOTE_COUNT_FROM && (
          <span id={`${id}-count`} className="text-tiny">
            {value.length}/{NOTE_MAX}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 px-1.5">
        <Textarea
          id={id}
          rows={1}
          maxLength={NOTE_MAX}
          placeholder="Optional"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-describedby={value.length >= NOTE_COUNT_FROM ? `${id}-count` : undefined}
          className="max-h-16 min-h-11 resize-none"
        />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { ChevronRight } from "pixelarticons/react/ChevronRight";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Same look as the 8bit Calendar's nav buttons and days: 44px targets (SPEC §16.5), the chosen
// one accent with dark text.
const navButton =
  "flex size-11 items-center justify-center border-4 border-foreground bg-surface hover:bg-surface-dark [&_svg]:size-6";

// Month precision's picker (SPEC §11.5 "month only"): a year with arrows, then its 12 months.
// value and onSelect use "YYYY-MM".
export function MonthPicker({ value, onSelect }: { value: string; onSelect: (month: string) => void }) {
  const [year, setYear] = useState(Number(value.slice(0, 4)));

  return (
    <div className="relative w-max border-y-6 border-foreground bg-popover p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous year" onClick={() => setYear(year - 1)} className={navButton}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <span aria-live="polite" className="text-body select-none">
          {year}
        </span>
        <button type="button" aria-label="Next year" onClick={() => setYear(year + 1)} className={navButton}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1">
        {MONTHS.map((label, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`;
          const chosen = month === value;
          return (
            <button
              key={month}
              type="button"
              aria-pressed={chosen}
              aria-label={`${label} ${year}`}
              onClick={() => onSelect(month)}
              // Opens on the chosen month, as the calendar opens on the chosen day.
              autoFocus={chosen}
              className="h-11 w-20 text-body hover:bg-surface-dark focus-visible:relative focus-visible:z-10 aria-pressed:bg-accent aria-pressed:text-text"
            >
              {label}
            </button>
          );
        })}
      </div>
      <div
        className="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

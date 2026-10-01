"use client";

import { useOptimistic, useState, useTransition } from "react";

import { format } from "date-fns";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown } from "pixelarticons/react/ChevronDown";

import { segment, segmented } from "@/components/add/visit-fields";
import { Button } from "@/components/ui/8bit/button";
import { Calendar } from "@/components/ui/8bit/calendar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/8bit/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/8bit/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/8bit/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/8bit/toggle-group";
import { CATEGORIES, type Category, CATEGORY_LABELS, categorySprite } from "@/lib/categories";
import {
  categoriesFromChips,
  citiesIn,
  type FilterOptions,
  filtersSearch,
  hasFilters,
  NO_FILTERS,
  type VisitFilters,
  withCountry,
} from "@/lib/visit-filters";
import { dateToDay, dayToDate } from "@/lib/when";
import { cn } from "@/lib/utils";

// Phones show "All" and the first two categories, the rest under "More", as in the sheet:
// with "More" that's what fits across 375px (SPEC §14.3). From sm, all of them, wrapping.
const PHONE_CHIPS = 2;
const MORE = CATEGORIES.slice(PHONE_CHIPS);

// Chips: chosen = accent with dark text, like the add flow's candidates and toggles. A
// multi-select toggle is aria-pressed, which the base toggle fills with `muted`.
const chip =
  "h-11 shrink-0 border-4 border-text bg-background px-3 text-body text-text hover:bg-surface-dark aria-pressed:bg-accent data-[state=on]:bg-accent data-[state=on]:hover:bg-accent";

// The dropdowns' "all" item (a Select item can't have an empty value).
const ANY = "__any__";

// My Visits' filters (SPEC §14.3): category chips, then City / Country / Date, and "Clear
// filters" while any is set. Every change replaces the URL query, so the page loads the
// matching visits on the server, and reload and Back keep the filters. The controls show the
// new filters at once; the list dims until the server's answer arrives.
export function FilterBar({
  filters,
  options,
  noMatches,
  children,
}: {
  filters: VisitFilters;
  options: FilterOptions;
  noMatches: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, startLoading] = useTransition();
  const [shown, setShown] = useOptimistic(filters);

  function apply(next: VisitFilters) {
    startLoading(() => {
      setShown(next);
      const search = filtersSearch(next);
      router.replace(search ? `/visits?${search}` : "/visits", { scroll: false });
    });
  }

  const clear = () => apply(NO_FILTERS);

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Filters" className="flex flex-col gap-4">
        <CategoryChips value={shown.categories} onChange={(categories) => apply({ ...shown, categories })} />
        {/* Equal thirds. gap-4 and px-1.5: the fields' side borders sit 6px outside them. */}
        <div className="grid grid-cols-3 gap-4 px-1.5">
          <PlaceSelect
            label="City"
            all="All cities"
            value={shown.city}
            names={citiesIn(options, shown.country)}
            onChange={(city) => apply({ ...shown, city })}
          />
          <PlaceSelect
            label="Country"
            all="All countries"
            value={shown.country}
            names={options.countries}
            onChange={(country) => apply(withCountry(shown, country, options))}
          />
          <DateRange from={shown.from} to={shown.to} onChange={(range) => apply({ ...shown, ...range })} />
        </div>
        {hasFilters(shown) && (
          <Button type="button" variant="ghost" onClick={clear} className="self-start px-0">
            Clear filters
          </Button>
        )}
      </div>

      <div aria-busy={loading} className={cn(loading && "opacity-50")}>
        {noMatches ? (
          <div className="flex flex-col items-start gap-4">
            <p>No visits match these filters.</p>
            <Button type="button" variant="secondary" onClick={clear} className="mx-1.5">
              Clear filters
            </Button>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// "All" plus the 10 categories, multi-select; on phones the last 8 are in "More".
function CategoryChips({ value, onChange }: { value: Category[]; onChange: (categories: Category[]) => void }) {
  const moreChosen = MORE.filter((category) => value.includes(category));

  return (
    <ToggleGroup
      type="multiple"
      font="normal"
      aria-label="Categories"
      value={value.length ? value : ["all"]}
      onValueChange={(next) => onChange(categoriesFromChips(value, next))}
      className="w-full flex-wrap justify-start gap-2"
    >
      <ToggleGroupItem value="all" font="normal" className={chip}>
        All
      </ToggleGroupItem>
      {CATEGORIES.map((category, index) => (
        <ToggleGroupItem
          key={category}
          value={category}
          font="normal"
          className={cn(chip, index >= PHONE_CHIPS && "hidden sm:inline-flex")}
        >
          {CATEGORY_LABELS[category]}
        </ToggleGroupItem>
      ))}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={moreChosen.length ? `More categories, ${moreChosen.length} chosen` : "More categories"}
          className={cn(chip, "inline-flex items-center gap-1 pr-2 sm:hidden", moreChosen.length > 0 && "bg-accent hover:bg-accent")}
        >
          More
          <ChevronDown aria-hidden="true" className="size-6" />
        </DropdownMenuTrigger>
        <DropdownMenuContent font="normal" align="end">
          {MORE.map((category) => (
            <DropdownMenuCheckboxItem
              key={category}
              checked={value.includes(category)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...value, category] : value.filter((chosen) => chosen !== category))
              }
              // Stays open, so several can be picked.
              onSelect={(event) => event.preventDefault()}
              className="min-h-11 gap-2 rounded-none border-y-3 border-dashed border-transparent bg-transparent pr-10 text-body hover:border-foreground focus:border-foreground focus:bg-transparent focus:text-text [&_svg]:size-6"
            >
              <Image src={categorySprite(category)} alt="" width={32} height={32} unoptimized className="pixelated" />
              {CATEGORY_LABELS[category]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </ToggleGroup>
  );
}

// City or country: the user's own values, plus "all". Accent while one is chosen.
function PlaceSelect({
  label,
  all,
  value,
  names,
  onChange,
}: {
  label: string;
  all: string;
  value: string | null;
  names: string[];
  onChange: (name: string | null) => void;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? null : next)}>
      <SelectTrigger aria-label={`${label}: ${value ?? all}`} className={cn("w-full min-w-0", value && "bg-accent")}>
        <SelectValue className="min-w-0">
          <span className="min-w-0 truncate">{value ?? label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{all}</SelectItem>
        {names.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Range = Pick<VisitFilters, "from" | "to">;

const formatDay = (day: string) => format(dayToDate(day), "MMM d, yyyy");

// "Date": a popover with From and To on one calendar (SPEC §16.6), switched by a toggle;
// either can be left open ("Any"). Picking From moves on to To. Days that would put From
// after To can't be picked.
function DateRange({ from, to, onChange }: Range & { onChange: (range: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState<keyof Range>("from");
  const [month, setMonth] = useState(() => dayToDate(from ?? to ?? dateToDay(new Date())));
  const value = end === "from" ? from : to;
  const active = Boolean(from || to);

  function openChange(next: boolean) {
    setOpen(next);
    if (next) showEnd("from");
  }

  function showEnd(next: keyof Range) {
    setEnd(next);
    const day = next === "from" ? from : to;
    if (day) setMonth(dayToDate(day));
  }

  function pick(day: string | null) {
    onChange(end === "from" ? { from: day, to } : { from, to: day });
    if (end === "from" && day) setEnd("to");
  }

  const summary = active ? `from ${from ? formatDay(from) : "any date"} to ${to ? formatDay(to) : "any date"}` : "any";

  return (
    <Popover open={open} onOpenChange={openChange}>
      {/* Drawn like the Selects beside it: 6px pixel border top and bottom, sides 6px outside. */}
      <div className="relative min-w-0 border-y-6 border-text">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Date: ${summary}`}
            className={cn(
              "flex min-h-11 w-full items-center justify-between gap-1.5 bg-background pr-2 pl-2.5 text-left text-body text-text",
              active && "bg-accent",
            )}
          >
            <span className="min-w-0 truncate">Date</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-text" />
      </div>
      {/* collisionPadding: the side borders, 6px outside the box, stay on screen. */}
      <PopoverContent font="normal" align="end" collisionPadding={12} className="flex w-auto flex-col gap-3 p-3 text-body">
        <ToggleGroup
          type="single"
          font="normal"
          aria-label="Edit date"
          value={end}
          onValueChange={(next) => {
            if (next) showEnd(next as keyof Range);
          }}
          className={cn(segmented, "grid-cols-2")}
        >
          <ToggleGroupItem value="from" font="normal" className={cn(segment, "text-small")}>
            From: {from ? formatDay(from) : "Any"}
          </ToggleGroupItem>
          <ToggleGroupItem value="to" font="normal" className={cn(segment, "text-small")}>
            To: {to ? formatDay(to) : "Any"}
          </ToggleGroupItem>
        </ToggleGroup>
        <Calendar
          mode="single"
          selected={value ? dayToDate(value) : undefined}
          month={month}
          onMonthChange={setMonth}
          disabled={
            end === "from" ? (to ? { after: dayToDate(to) } : undefined) : from ? { before: dayToDate(from) } : undefined
          }
          // Tapping the chosen day again clears it, like the Clear button.
          onSelect={(date) => pick(date ? dateToDay(date) : null)}
        />
        <div className="flex justify-between gap-4 px-1.5">
          <Button
            type="button"
            variant="secondary"
            disabled={!value}
            onClick={() => pick(null)}
            aria-label={`Clear ${end === "from" ? "From" : "To"}`}
          >
            Clear
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

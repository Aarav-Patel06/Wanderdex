import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "pixelarticons/react/ArrowRight";

import { type Category, CATEGORY_LABELS, categorySprite } from "@/lib/categories";
import type { StatsPlace } from "@/lib/stats/profile";
import { cn } from "@/lib/utils";

// The profile's stats and travel stats (SPEC §14.6). Tiles and rows are My Visits' pixel cards
// (visits.css): plain panels, and rows that are one link each.

export function StatTile({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className={cn("visits-panel flex flex-col gap-1", className)}>
      <p className="text-small">{label}</p>
      {/* 16px on phones, where "195/195" in 24px wouldn't fit half the width. */}
      <p className="font-display text-h3 md:text-h2">{value}</p>
    </div>
  );
}

// The earliest visit, on a tile that links to its place.
export function FirstVisit({ place, date }: { place: StatsPlace; date: string }) {
  return (
    <Link href={`/places/${place.id}`} className="visit-link col-span-2 flex items-center gap-3 px-3 py-2">
      <Sprite category={place.category} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-small">First visit</span>
        <span className="truncate">{place.name}</span>
        <span className="text-small">{date}</span>
      </span>
      <ArrowRight aria-hidden="true" className="size-6 shrink-0" />
    </Link>
  );
}

// One of the most revisited places.
export function PlaceRow({ place, visits }: { place: StatsPlace; visits: number }) {
  const where = [place.city, place.country].filter(Boolean).join(", ");
  return (
    <Link href={`/places/${place.id}`} className="visit-link flex min-h-11 items-center gap-3 px-3 py-2">
      <Sprite category={place.category} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{place.name}</span>
        {where && <span className="truncate text-small">{where}</span>}
      </span>
      <span className="shrink-0 text-small whitespace-nowrap">{visits} visits</span>
      <ArrowRight aria-hidden="true" className="size-6 shrink-0" />
    </Link>
  );
}

// Pins per category: a pixel bar chart of plain boxes (profile.css), no chart library. Each
// row: the sprite, the label and count, and a bar as long as its share of the largest count.
export function CategoryBars({ categories }: { categories: { category: Category; count: number }[] }) {
  const max = Math.max(...categories.map(({ count }) => count));
  return (
    <ol className="visits-panel flex flex-col gap-3">
      {categories.map(({ category, count }) => (
        <li key={category} className="flex items-center gap-3">
          <Sprite category={category} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex justify-between gap-2">
              <span className="truncate">{CATEGORY_LABELS[category]}</span>
              <span>
                {count}
                <span className="sr-only"> {count === 1 ? "pin" : "pins"}</span>
              </span>
            </span>
            <span
              aria-hidden="true"
              className="category-bar"
              style={{ "--share": count / max } as React.CSSProperties}
            />
          </span>
        </li>
      ))}
    </ol>
  );
}

function Sprite({ category }: { category: Category }) {
  return (
    <Image src={categorySprite(category)} alt="" width={32} height={32} unoptimized className="pixelated shrink-0" />
  );
}

"use client";

import { useState, useTransition } from "react";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "pixelarticons/react/ArrowRight";
import { Calendar } from "pixelarticons/react/Calendar";

import { loadVisits } from "@/app/(app)/visits/actions";
import { errorCopy } from "@/components/add/api";
import { Loading } from "@/components/loading";
import { Rating } from "@/components/rating";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { categorySprite } from "@/lib/categories";
import type { VisitFilters } from "@/lib/visit-filters";

// The visits list, 30 at a time: the page renders the first 30 matching the filters, "Load
// more" appends the next. A row (visits.css) opens its place, scrolled to that visit with a
// brief highlight (?visit=, SPEC §14.3).
export function VisitList({
  filters,
  initial,
}: {
  filters: VisitFilters;
  initial: Awaited<ReturnType<typeof loadVisits>>;
}) {
  const [items, setItems] = useState(initial.items);
  const [next, setNext] = useState(initial.next);
  const [error, setError] = useState(false);
  const [loading, startLoading] = useTransition();

  function loadMore() {
    if (next === null) return;
    setError(false);
    startLoading(async () => {
      try {
        const page = await loadVisits(filters, next);
        setItems((current) => [...current, ...page.items]);
        setNext(page.next);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* A container: the row layout follows the list's width, not the window's. */}
      <ul className="@container flex flex-col gap-3">
        {items.map((visit) => (
          <li key={visit.id}>
            <Link
              href={`/places/${visit.placeId}?visit=${visit.id}`}
              className="visit-link flex min-h-11 items-center gap-2 px-2 py-2 @md:gap-3 @md:px-3"
            >
              <Image
                src={categorySprite(visit.category)}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="pixelated shrink-0"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{visit.name}</span>
                {visit.where && <span className="truncate text-small">{visit.where}</span>}
              </span>
              {/* Wide: a 4px divider, then date and rating side by side. Narrow: date over
                  rating, tighter gaps, and an exact time left out. Fixed widths line the
                  columns up. */}
              <span aria-hidden="true" className="hidden w-1 self-stretch bg-text @2xl:block" />
              <span className="flex shrink-0 flex-col text-small @2xl:flex-row @2xl:items-center @2xl:gap-6">
                <span className="flex items-center gap-1">
                  <Calendar aria-hidden="true" className="size-6 shrink-0" />
                  <span className="w-[12ch] whitespace-nowrap @md:w-[22ch]">
                    <span className="sr-only">Visited </span>
                    {visit.date}
                    {visit.time && <span className="hidden @md:inline">, {visit.time}</span>}
                  </span>
                </span>
                <span className="w-[calc(1.75rem+5ch)]">
                  <Rating value={visit.rating} />
                </span>
              </span>
              <ArrowRight aria-hidden="true" className="size-6 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      {loading ? (
        <Loading />
      ) : (
        next !== null && (
          <Button type="button" variant="secondary" onClick={loadMore} className="mx-1.5 self-start">
            Load more
          </Button>
        )
      )}
      {error && (
        <Alert variant="error">
          <AlertDescription>{errorCopy("upstream_error")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import Image from "next/image";
import Link from "next/link";

import { loadVisits } from "@/app/(app)/visits/actions";
import { errorCopy } from "@/components/add/api";
import { Loading } from "@/components/loading";
import { Rating } from "@/components/rating";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Card } from "@/components/ui/8bit/card";
import { categorySprite } from "@/lib/categories";

// The visits list, 30 at a time: the page renders the first 30, "Load more" appends the next.
// A row opens its place, scrolled to that visit with a brief highlight (?visit=, SPEC §14.3).
export function VisitList({ initial }: { initial: Awaited<ReturnType<typeof loadVisits>> }) {
  const [items, setItems] = useState(initial.items);
  const [next, setNext] = useState(initial.next);
  const [error, setError] = useState(false);
  const [loading, startLoading] = useTransition();

  function loadMore() {
    if (next === null) return;
    setError(false);
    startLoading(async () => {
      try {
        const page = await loadVisits(next);
        setItems((current) => [...current, ...page.items]);
        setNext(page.next);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card font="normal">
        <ul className="divide-y-4 divide-text">
          {items.map((visit) => (
            <li key={visit.id}>
              <Link
                href={`/places/${visit.placeId}?visit=${visit.id}`}
                className="flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-surface-dark"
              >
                <Image
                  src={categorySprite(visit.category)}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  className="pixelated shrink-0"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="break-words">{visit.name}</span>
                  {visit.where && <span className="text-small">{visit.where}</span>}
                  <span className="flex flex-wrap items-center gap-x-4 text-small">
                    {visit.date}
                    {visit.rating !== null && <Rating value={visit.rating} />}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

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

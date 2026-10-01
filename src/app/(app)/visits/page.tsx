import type { Metadata } from "next";

import { loadVisits } from "@/app/(app)/visits/actions";
import { VisitList } from "@/app/(app)/visits/visit-list";

export const metadata: Metadata = { title: "My Visits · Wanderdex" };

// My Visits, basic version (SPEC §14.3): newest visit first, 30 at a time, with ratings. Filters
// come in Phase 2.
export default async function VisitsPage() {
  const first = await loadVisits(0);

  return (
    <section className="flex max-w-2xl flex-col gap-6 px-4 py-8 md:px-8">
      <h1>My Visits</h1>
      {first.items.length ? (
        <VisitList initial={first} />
      ) : (
        <p>No visits yet, traveler. Your adventure starts on the Overworld!</p>
      )}
    </section>
  );
}

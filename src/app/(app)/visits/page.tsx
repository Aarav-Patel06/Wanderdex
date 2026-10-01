import type { Metadata } from "next";

import { loadVisits } from "@/app/(app)/visits/actions";
import { FilterBar } from "@/app/(app)/visits/filter-bar";
import { VisitList } from "@/app/(app)/visits/visit-list";
import { createClient } from "@/lib/supabase/server";
import { filterOptions, filtersFromSearchParams, filtersSearch, hasFilters } from "@/lib/visit-filters";

export const metadata: Metadata = { title: "My Visits · Wanderdex" };

// My Visits (SPEC §14.3): newest visit first, 30 at a time, filtered by the URL query.
export default async function VisitsPage({ searchParams }: PageProps<"/visits">) {
  const filters = filtersFromSearchParams(await searchParams);
  const [options, first] = await Promise.all([loadFilterOptions(), loadVisits(filters, 0)]);

  return (
    <section className="flex max-w-2xl flex-col gap-6 px-4 py-8 md:px-8">
      <h1>My Visits</h1>
      {first.items.length || hasFilters(filters) ? (
        <FilterBar filters={filters} options={options} noMatches={!first.items.length}>
          {/* A new list for new filters, starting from their first page. */}
          <VisitList key={filtersSearch(filters)} filters={filters} initial={first} />
        </FilterBar>
      ) : (
        <p>No visits yet, traveler. Your adventure starts on the Overworld!</p>
      )}
    </section>
  );
}

// The city and country dropdowns' values, from the user's own visits. The user's session
// applies, so RLS returns only their own visits (SPEC §9).
async function loadFilterOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visits")
    .select("places!inner(city, country)")
    // Untyped client: it can't tell that `places` is many-to-one (one object, not an array).
    .overrideTypes<{ places: { city: string | null; country: string | null } }[], { merge: false }>();
  if (error) throw error;
  return filterOptions(data.map(({ places }) => places));
}

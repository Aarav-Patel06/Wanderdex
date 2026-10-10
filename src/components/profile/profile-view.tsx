import { formatInTimeZone } from "date-fns-tz";
import Image from "next/image";

import { AccountSection } from "@/components/profile/account-section";
import { CategoryBars, FirstVisit, PlaceRow, StatTile } from "@/components/profile/profile-stats";
import { UserInitial } from "@/components/shell/avatar";
import { formatVisited } from "@/lib/dates";
import { CONTINENTS } from "@/lib/stats/continents";
import { STATE_COUNT } from "@/lib/stats/countries";
import type { ProfileStats } from "@/lib/stats/profile";

// Its rows and panels are My Visits' (visit-link, visits-panel).
import "@/app/(app)/visits/visits.css";
import "@/components/profile/profile.css";

// Profile (SPEC §14.6): who the user is, their stats and travel stats, and their account.
export function ProfileView({
  username,
  joined,
  stats,
}: {
  username: string;
  joined: string | null;
  stats: ProfileStats;
}) {
  const { first } = stats;

  return (
    // One column. Mobile: the header sits below the status bar (the viewport runs under it).
    <section className="flex max-w-3xl flex-col gap-8 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-8 md:px-8 md:pt-8">
      <header className="flex items-center gap-4">
        <UserInitial username={username} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* A 20-character username is wider than a phone, so it may break anywhere. */}
          <h1 className="text-h2 [overflow-wrap:anywhere] md:text-h1">{username}</h1>
          {/* profiles.created_at, in UTC: the server doesn't know the user's zone. */}
          {joined && <p className="text-small">Joined {formatInTimeZone(joined, "UTC", "MMMM yyyy")}</p>}
        </div>
        {/* 2×, 3× from md. The passport secret's trigger in Phase 4.5 (SPEC §15.1). */}
        <Image
          src="/sprites/passport.png"
          alt=""
          width={96}
          height={96}
          unoptimized
          className="pixelated size-16 shrink-0 md:size-24"
        />
      </header>

      <section aria-labelledby="stats-title" className="flex flex-col gap-4">
        <h2 id="stats-title">Stats</h2>
        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Places discovered" value={stats.places} />
          <StatTile label="Countries" value={`${stats.countries}/${STATE_COUNT}`} />
          <StatTile label="Continents" value={`${stats.continents}/${CONTINENTS.length}`} />
          <StatTile label="Total visits" value={stats.visits} />
          {first ? (
            <FirstVisit place={first.place} date={formatVisited(first.visitedAt, first.precision, first.timezone)} />
          ) : (
            <StatTile label="First visit" value="--" className="col-span-2" />
          )}
        </div>
      </section>

      <section aria-labelledby="travel-title" className="flex flex-col gap-4">
        <h2 id="travel-title">Travel stats</h2>
        {stats.visits ? (
          <>
            <h3>Pins per category</h3>
            <CategoryBars categories={stats.categories} />
            <h3 className="mt-2">Most revisited</h3>
            {stats.revisited.length ? (
              <ol className="flex flex-col gap-3">
                {stats.revisited.map(({ place, visits }) => (
                  <li key={place.id}>
                    <PlaceRow place={place} visits={visits} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="visits-panel">No return visits yet.</p>
            )}
          </>
        ) : (
          <p className="visits-panel">No pins yet, traveler. Your adventure starts on the Overworld!</p>
        )}
      </section>

      <AccountSection username={username} />
    </section>
  );
}

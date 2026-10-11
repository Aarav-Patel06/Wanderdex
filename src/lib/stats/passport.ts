import { formatVisited } from "@/lib/dates";
import { CONTINENTS } from "@/lib/stats/continents";
import { STATE_COUNT } from "@/lib/stats/countries";
import type { ProfileStats } from "@/lib/stats/profile";

// What the passport secret shows (SPEC §15.1): the profile's numbers (SPEC §14.6), ready to
// print. Made on the server, so the browser needs neither the tables nor the tz lookup.
export type PassportData = {
  countries: string; // "12/195"
  continents: string; // "3/7"
  pins: number; // places
  firstPin: { name: string; date: string } | null; // the date at its precision, in its zone
};

export function passportData(stats: ProfileStats): PassportData {
  const { first } = stats;
  return {
    countries: `${stats.countries}/${STATE_COUNT}`,
    continents: `${stats.continents}/${CONTINENTS.length}`,
    pins: stats.places,
    firstPin: first && { name: first.place.name, date: formatVisited(first.visitedAt, first.precision, first.timezone) },
  };
}

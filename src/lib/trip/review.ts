import { formatInTimeZone } from "date-fns-tz";

import type { Category } from "@/lib/categories";
import type { TripStop } from "@/lib/trip/group";
import type { ImportCounts, ImportStop } from "@/lib/trip/lookup";
import type { NewVisit, SavedVisit } from "@/lib/visits";

// The Trip Photos review's logic (SPEC §11.8 steps 5–9), browser-safe and unit tested; the screen
// is components/import/trip-review.

// A stop's match: one of the user's places or a Google candidate (by index), a new place at the
// stop's location named by the user ("Drop a pin"), or none yet.
export type Match = { kind: "yours" | "candidate"; index: number } | { kind: "pin" } | null;

// The user's choices for a stop, and how its save went.
export type StopChoice = {
  include: boolean;
  match: Match;
  name: string;
  category: Category;
  rating: number | null;
  note: string;
  extras: boolean;
  status: "unsaved" | "saved" | "failed";
};

// The chosen place (null for a pin or none): it carries the user's category or the candidate's
// auto category, its zone, and whether it's "Already logged".
export function matchedPlace(lookup: ImportStop, match: Match) {
  if (match?.kind === "yours") return lookup.yours[match.index];
  if (match?.kind === "candidate") return lookup.candidates[match.index];
  return null;
}

// "Already logged" (SPEC §11.8 step 6) follows the chosen match.
export function isAlreadyLogged(lookup: ImportStop, match: Match) {
  return matchedPlace(lookup, match)?.logged ?? false;
}

// Preselected: the nearest of the user's places within 50 m, else the first candidate. Checked,
// except an "Already logged" match, so importing a trip again doesn't duplicate its visits. The
// category starts at the match's: the user's for one of their places, else the candidate's auto
// category (Other for none).
export function initialChoice(lookup: ImportStop): StopChoice {
  const match: Match = lookup.local ? { kind: "yours", index: 0 } : lookup.candidates.length ? { kind: "candidate", index: 0 } : null;
  return {
    include: !isAlreadyLogged(lookup, match),
    match,
    name: "",
    category: matchedPlace(lookup, match)?.category ?? "other",
    rating: null,
    note: "",
    extras: false,
    status: "unsaved",
  };
}

// Switching the match brings its category, as on the confirmation card; a pin starts at Other
// (SPEC §11.4).
export function withMatch(lookup: ImportStop, choice: StopChoice, match: Match): StopChoice {
  return { ...choice, match, category: matchedPlace(lookup, match)?.category ?? "other" };
}

// A stop that "Save N visits" saves: checked, not saved yet, with a match or a named pin.
export function isSaveable(choice: StopChoice) {
  if (!choice.include || choice.status === "saved") return false;
  if (choice.match?.kind === "pin") return choice.name.trim() !== "";
  return choice.match !== null;
}

// The zone the stop's time shows and saves in: its match's, else the stop's own (from its
// centroid, as the server works out a pin's).
export function stopZone(stop: TripStop, lookup: ImportStop, choice: StopChoice) {
  return matchedPlace(lookup, choice.match)?.timezone ?? stop.timezone;
}

// The save request for a stop (SPEC §11.8 step 8): its match, its time at exact-time precision in
// the place's zone, its category, rating, and note, and the import's id with its number, so a
// retried save never makes a second visit. Always source "photo" (set by the server for a place by
// id or a pin).
export function visitBody(importId: string, stop: TripStop, lookup: ImportStop, choice: StopChoice): NewVisit {
  const base = {
    category: choice.category,
    visited: { value: formatInTimeZone(stop.instant, stopZone(stop, lookup, choice), "yyyy-MM-dd'T'HH:mm"), precision: "datetime" as const },
    rating: choice.rating,
    note: choice.note,
    trip: { import_id: importId, stop: stop.number },
  };
  const { match } = choice;
  if (match?.kind === "yours") return { place_id: lookup.yours[match.index].id, ...base };
  if (match?.kind === "candidate") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { logged, ...place } = lookup.candidates[match.index];
    return { place, ...base, source: "photo", source_input: null };
  }
  if (match?.kind === "pin") return { manual_place: { name: choice.name.trim(), lat: stop.lat, lng: stop.lng }, ...base };
  throw new Error(`Stop ${stop.number} has no match to save`);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Under the review's title (SPEC §11.8 step 5): "Place lookups: 12 sent to Google, 85 avoided (60
// your places, 18 shared, 7 cached)".
export function lookupsLine({ local_matches, shared, cache_hits, google_lookups }: ImportCounts) {
  const avoided = local_matches + shared + cache_hits;
  const parts = `${local_matches} your places, ${shared} shared, ${cache_hits} cached`;
  return `Place lookups: ${google_lookups} sent to Google, ${avoided} avoided${avoided ? ` (${parts})` : ""}`;
}

// When the allowance or a cap ran out (SPEC §11.7), else null.
export function outOfLookupsLine({ unmatched_limit }: ImportCounts) {
  if (!unmatched_limit) return null;
  const stops = unmatched_limit === 1 ? "1 stop has" : `${unmatched_limit} stops have`;
  return `Out of place lookups for now. ${stops} no match: pick one of your places or drop a pin.`;
}

// One toast for the whole import (SPEC §11.8 step 9): N saved visits, M of them a first visit in a
// country.
export function importToast(saved: SavedVisit[]) {
  const countries = saved.filter((result) => result.first_in_country).length;
  return {
    title: "Trip imported!",
    description: `${plural(saved.length, "place", "places")} logged, ${plural(countries, "new country", "new countries")}`,
    variant: "success" as const,
  };
}

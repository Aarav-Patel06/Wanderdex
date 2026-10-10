import tzLookup from "@photostructure/tz-lookup";
import { describe, it, vi } from "vitest";

import { metres, planTrip, type TripStop } from "../src/lib/trip/group";
import { type ImportCounts, type ImportResult, resolveImport, type VisitPlaceRow } from "../src/lib/trip/lookup";
import { fakeSupabase } from "../src/test/fake-supabase";
import { syntheticTrip } from "./synthetic-trip";

// `pnpm bench:import` (SPEC §11.8 step 11): the synthetic trip through the real grouping and the
// real lookup pipeline (lib/trip/lookup, with the grid index and the shared cache), with a report.
// Google is mocked (a fake fetch that knows the trip's places) and Supabase is the route tests'
// in-memory fake. Runs on Vitest (vitest.bench.config.mts), outside `pnpm test`.

const RUNS = 20;

function report(photos: number) {
  const trip = syntheticTrip({ photos });
  const times: number[] = [];
  let plan = planTrip(trip.reads, tzLookup);
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    plan = planTrip(trip.reads, tzLookup);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const usable = trip.reads.filter((read) => read.status === "ok").length;
  const stops = plan.kind === "stops" ? plan.stops : [];
  const perStop = stops.map((stop) => stop.photos.length);
  console.log(
    [
      `Synthetic trip, ${photos} photos (seed 2026): ${trip.days} days, ${trip.visits} visits to ${trip.places} places`,
      `  usable photos:      ${usable}`,
      `  skipped:            ${plan.kind === "stops" ? `${plan.skipped.noLocationOrDate} without a location or date, ${plan.skipped.unreadable} unreadable` : plan.kind}`,
      `  stops:              ${stops.length} (photos per stop: ${Math.min(...perStop)}–${Math.max(...perStop)}, median ${perStop.sort((a, b) => a - b)[Math.floor(perStop.length / 2)]})`,
      `  grouping time:      median ${times[Math.floor(RUNS / 2)].toFixed(2)} ms, worst ${times.at(-1)!.toFixed(2)} ms (${RUNS} runs, after a warm-up)`,
    ].join("\n"),
  );
}

// The fake Google: each of the trip's places, plus two neighbours 25 m and 35 m from it, as
// Nearby Search (New) answers: those within the circle, nearest first, up to 3.
function mockGoogle(spots: { lat: number; lng: number }[]) {
  const world = spots.flatMap((spot, i) => [
    { id: `spot-${i}`, ...spot },
    { id: `spot-${i}-north`, lat: spot.lat + 25 / 111_195, lng: spot.lng },
    { id: `spot-${i}-east`, lat: spot.lat, lng: spot.lng + 35 / (111_195 * Math.cos((spot.lat * Math.PI) / 180)) },
  ]);
  const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
    const { center, radius } = JSON.parse(init?.body as string).locationRestriction.circle;
    const point = { lat: center.latitude, lng: center.longitude };
    const places = world
      .filter((place) => metres(point, place) <= radius)
      .sort((a, b) => metres(point, a) - metres(point, b))
      .slice(0, 3)
      .map(({ id, lat, lng }) => ({
        id,
        displayName: { text: id },
        primaryType: "tourist_attraction",
        types: ["tourist_attraction"],
        location: { latitude: lat, longitude: lng },
        addressComponents: [
          { longText: "Tokyo", shortText: "Tokyo", types: ["administrative_area_level_1"] },
          { longText: "Japan", shortText: "JP", types: ["country"] },
        ],
      }));
    return Response.json({ places });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// What saving every stop's preselected match would leave in the user's visits: one place per
// Google place, and a visit at each stop's time.
function savedTrip(stops: TripStop[], result: ImportResult) {
  const places = new Map<string, NonNullable<VisitPlaceRow["place"]>>();
  return stops.flatMap((stop, i): VisitPlaceRow[] => {
    const match = result.stops[i].candidates[0];
    if (!match) return [];
    let place = places.get(match.google_place_id);
    if (!place) {
      place = { id: crypto.randomUUID(), google_place_id: match.google_place_id, name: match.name, city: match.city, country: match.country, lat: match.lat, lng: match.lng };
      places.set(match.google_place_id, place);
    }
    return [{ category: match.category, visited_at: new Date(stop.instant).toISOString(), visited_precision: "datetime", timezone: stop.timezone, place }];
  });
}

function lookupLine(label: string, counts: ImportCounts, extra = "") {
  const avoided = counts.local_matches + counts.shared + counts.cache_hits;
  return [
    `  ${label}`,
    `    sent to Google:   ${counts.google_lookups} lookups, ${counts.google_calls} calls (${counts.google_calls - counts.google_lookups} were 150 m retries)`,
    `    avoided:          ${avoided} of ${counts.stops} stops (${counts.local_matches} your places, ${counts.shared} shared, ${counts.cache_hits} cached)${extra}`,
  ].join("\n");
}

async function lookupReport(photos: number) {
  const trip = syntheticTrip({ photos });
  const plan = planTrip(trip.reads, tzLookup);
  if (plan.kind !== "stops") throw new Error(`No stops: ${plan.kind}`);
  const body = { import_id: crypto.randomUUID(), stops: plan.stops.map(({ lat, lng, localDate }) => ({ lat, lng, date: localDate })) };
  const { client, tables } = fakeSupabase();
  const fetchMock = mockGoogle(trip.spots);
  const lookup = async (rows: VisitPlaceRow[]) => {
    const start = performance.now();
    const result = await resolveImport({ ...body, import_id: crypto.randomUUID() }, rows, { admin: client, userId: "bench-user" });
    return { result, ms: performance.now() - start };
  };

  const cold = await lookup([]);
  const coldFetches = fetchMock.mock.calls.length;
  const warm = await lookup([]);
  const warmFetches = fetchMock.mock.calls.length - coldFetches;
  const saved = savedTrip(plan.stops, cold.result);
  const again = await lookup(saved);
  const logged = again.result.stops.filter((stop) => stop.yours[0]?.logged).length;

  console.log(
    [
      `Lookups, the same ${photos}-photo trip: ${plan.stops.length} stops (Google mocked, Supabase faked)`,
      `  with no layers, every stop would be its own lookup: ${plan.stops.length} lookups, ${plan.stops.length}+ calls`,
      lookupLine(`empty cache (${cold.ms.toFixed(0)} ms):`, cold.result.counts),
      lookupLine(`warm cache, the same import again (${warm.ms.toFixed(0)} ms):`, warm.result.counts),
      lookupLine(
        `re-import after saving it (${again.ms.toFixed(0)} ms):`,
        again.result.counts,
        `\n    Already logged:   ${logged} of ${plan.stops.length} stops (start unchecked)`,
      ),
      `  fetches to Google: ${coldFetches} cold, ${warmFetches} warm; nearby_cache rows: ${tables.nearby_cache.length}; import allowance used: ${tables.resolve_log.length}`,
    ].join("\n"),
  );
}

describe("bench:import", () => {
  it("reports the synthetic 300-photo trip's grouping, and a 500-photo one's", () => {
    report(300);
    report(500);
  });

  it("reports the 300-photo trip's lookups: empty cache, then warm", async () => {
    vi.stubEnv("RESOLVE_SIGNING_SECRET", "bench");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await lookupReport(300);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

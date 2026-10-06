import tzLookup from "@photostructure/tz-lookup";
import { describe, it } from "vitest";

import { planTrip } from "../src/lib/trip/group";
import { syntheticTrip } from "./synthetic-trip";

// `pnpm bench:import` (SPEC §11.8 step 11): the synthetic trip through the real grouping, with a
// report. Runs on Vitest (vitest.bench.config.mts), outside `pnpm test`. The lookup part (Google
// calls made and avoided, cold and warm cache) comes with the lookups in Phase 4.2.

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

describe("bench:import (grouping)", () => {
  it("reports the synthetic 300-photo trip, and a 500-photo one", () => {
    report(300);
    report(500);
  });
});

import type { PhotoRead } from "../src/lib/trip/read";

// A synthetic Trip Photos import (SPEC §11.8 step 11) for `pnpm bench:import`: what the reading
// worker would hand the grouping for a week in Tokyo. Seeded, so every run is the same trip.
// Each day starts and ends at the hotel and visits a few spots between; a spot gets a burst of
// photos a few minutes apart, scattered within ~40 m. Some photos lack a location or a date, and a
// few are unreadable, as from a real phone.
// No imports beyond types, so a plain Node script can use it too.

export type SyntheticTrip = { reads: PhotoRead[]; days: number; visits: number; places: number };

// mulberry32: a small, fast, seeded PRNG.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKYO = { lat: 35.681, lng: 139.767 };
const M_PER_DEG = 111_195;
const JST = 9 * 3_600_000;
const MINUTE = 60_000;

export function syntheticTrip({ photos = 300, seed = 2026 } = {}): SyntheticTrip {
  const rand = random(seed);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const offset = (base: { lat: number; lng: number }, north: number, east: number) => ({
    lat: base.lat + north / M_PER_DEG,
    lng: base.lng + east / (M_PER_DEG * Math.cos((base.lat * Math.PI) / 180)),
  });

  const hotel = offset(TOKYO, 300, -400);
  // 40 places across ~8 km of the city; some get visited twice on different days.
  const places = Array.from({ length: 40 }, () => offset(TOKYO, between(-4000, 4000), between(-4000, 4000)));
  const reads: PhotoRead[] = [];
  let visits = 0;
  let day = 0;

  function burst(at: { lat: number; lng: number }, start: number, count: number) {
    let time = start;
    for (let i = 0; i < count && reads.length < photos; i++) {
      const location = offset(at, between(-40, 40), between(-40, 40));
      const roll = rand();
      if (roll < 0.05) reads.push({ status: "no_location" });
      else if (roll < 0.07) reads.push({ status: "no_date", location });
      else if (roll < 0.08) reads.push({ status: "unreadable" });
      else reads.push({ status: "ok", location, instant: Math.round(time) });
      time += between(0.5, 6) * MINUTE;
    }
    visits++;
    return time;
  }

  while (reads.length < photos) {
    // 08:00 JST on 2025-04-01, then each next day.
    let time = Date.UTC(2025, 3, 1 + day, 8) - JST;
    time = burst(hotel, time, Math.round(between(1, 4)));
    const stops = Math.round(between(3, 7));
    for (let i = 0; i < stops && reads.length < photos; i++) {
      time += between(30, 90) * MINUTE; // travel
      const place = places[Math.floor(rand() * places.length)];
      time = burst(place, time, Math.round(between(2, 14)));
    }
    time += between(30, 60) * MINUTE;
    burst(hotel, time, Math.round(between(1, 3)));
    day++;
  }
  return { reads, days: day, visits, places: places.length + 1 };
}

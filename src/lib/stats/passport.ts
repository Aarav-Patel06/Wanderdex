import { formatInTimeZone } from "date-fns-tz";

import { type Category, CATEGORY_LABELS } from "@/lib/categories";
import { formatVisited } from "@/lib/dates";
import { type Continent, CONTINENTS } from "@/lib/stats/continents";
import { STATE_COUNT } from "@/lib/stats/countries";
import type { ProfileStats } from "@/lib/stats/profile";

// The passport's continent stamps.
const CONTINENT_CODES: Record<Continent, string> = {
  Africa: "AF",
  Antarctica: "AN",
  Asia: "AS",
  Europe: "EU",
  "North America": "NA",
  Oceania: "OC",
  "South America": "SA",
};

// The data page's entry stamps: the first few countries visited.
export const ENTRY_STAMPS_MAX = 6;

// A real passport's (TD3) machine-readable lines are 44 characters.
export const MRZ_LENGTH = 44;
// The issuing state's code in the machine-readable zone, also the holder's nationality.
const ISSUER = "WDX";

// A place on the passport: its page, name, and sprite.
type PassportPlace = { id: string; name: string; category: Category };

// What the passport secret shows (SPEC §15.1): who the user is, and the profile's numbers
// (SPEC §14.6), ready to print. Made on the server, so the browser needs neither the tables nor
// the tz lookup.
export type PassportData = {
  name: string; // the username
  travelerNo: string; // "3F9A2C1B", from the user id
  issued: string; // "OCT 2026", the join month, or "--"
  issuer: string; // "WDX", the issuing state's code (and the holder's nationality)
  mrz: [string, string]; // the TD3 machine-readable zone, MRZ_LENGTH characters each
  countries: { visited: number; total: number };
  // Entry stamps: the first ENTRY_STAMPS_MAX countries visited, in time order, each with its
  // first visit's date ("12 MAR 2025", or "MAR 2025" at month precision) in that visit's zone.
  entries: { code: string; date: string }[];
  continents: { code: string; name: Continent; visited: boolean }[]; // all 7, in the fixed order
  pins: number; // places
  visits: number;
  cities: number;
  favorite: { category: Category; label: string } | null; // the category with the most pins
  topRated: (PassportPlace & { rating: number }) | null;
  // The earliest visit's place, its "City, Country", and the date at its precision, in its zone.
  firstPin: (PassportPlace & { where: string; date: string }) | null;
};

export type PassportOwner = { userId: string; username: string; joined: string | null };

export function passportData(stats: ProfileStats, { userId, username, joined }: PassportOwner): PassportData {
  const { first, topRated } = stats;
  const favorite = stats.categories[0]?.category;
  const travelerNo = userId.replaceAll("-", "").slice(0, 8).toUpperCase();
  return {
    name: username,
    travelerNo,
    // profiles.created_at, in UTC, as on the profile.
    issued: joined ? formatInTimeZone(joined, "UTC", "MMM yyyy").toUpperCase() : "--",
    issuer: ISSUER,
    mrz: mrzLines(username, travelerNo, joined),
    countries: { visited: stats.countries, total: STATE_COUNT },
    entries: stats.countryFirsts.slice(0, ENTRY_STAMPS_MAX).map(({ code, visitedAt, precision, timezone }) => ({
      code,
      date: formatInTimeZone(visitedAt, timezone, precision === "month" ? "MMM yyyy" : "dd MMM yyyy").toUpperCase(),
    })),
    continents: CONTINENTS.map((name) => ({
      code: CONTINENT_CODES[name],
      name,
      visited: stats.continents.includes(name),
    })),
    pins: stats.places,
    visits: stats.visits,
    cities: stats.cities,
    favorite: favorite ? { category: favorite, label: CATEGORY_LABELS[favorite] } : null,
    topRated: topRated && {
      id: topRated.place.id,
      name: topRated.place.name,
      category: topRated.place.category,
      rating: topRated.rating,
    },
    firstPin: first && {
      id: first.place.id,
      name: first.place.name,
      category: first.place.category,
      where: [first.place.city, first.place.country].filter(Boolean).join(", "),
      date: formatVisited(first.visitedAt, first.precision, first.timezone),
    },
  };
}

// The passport's machine-readable zone, in the real (ICAO 9303 TD3) layout:
// - line 1: "P<", the issuer, then the name: the username in capitals, its first "_" (or other
//   separator) as "<<" (the surname and given names' separator) and the rest as "<";
// - line 2: the traveler number padded to 9, its check digit, the nationality, the join date
//   (YYMMDD, UTC) in the birth date's place and its check digit, an unknown sex, no expiry
//   (a Wanderdex passport never expires), an empty personal number, and the composite check
//   digit. Everything padded with "<".
export function mrzLines(username: string, travelerNo: string, joined: string | null): [string, string] {
  const [surname = "", ...given] = username.toUpperCase().split(/[^A-Z0-9]+/);
  const name = given.length ? `${surname}<<${given.join("<")}` : surname;
  const line1 = `P<${ISSUER}${name}`.padEnd(MRZ_LENGTH, "<").slice(0, MRZ_LENGTH);

  const doc = travelerNo.padEnd(9, "<").slice(0, 9);
  const born = joined ? formatInTimeZone(joined, "UTC", "yyMMdd") : "<<<<<<";
  const body = `${doc}${checkDigit(doc)}${ISSUER}${born}${joined ? checkDigit(born) : "<"}<${"<".repeat(7)}${"<".repeat(15)}`;
  // The composite covers the number, the birth date, and the expiry onwards (with their checks).
  const composite = checkDigit(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43));
  return [line1, `${body}${composite}`];
}

// ICAO 9303's check digit: digits count as themselves, A–Z as 10–35, "<" as 0, weighted 7, 3, 1
// in turn; the sum's last digit.
export function checkDigit(field: string) {
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) {
    const char = field[i];
    const value = char === "<" ? 0 : /[0-9]/.test(char) ? Number(char) : char.charCodeAt(0) - 55;
    sum += value * [7, 3, 1][i % 3];
  }
  return String(sum % 10);
}

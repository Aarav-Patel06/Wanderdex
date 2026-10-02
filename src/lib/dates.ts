import tzLookup from "@photostructure/tz-lookup";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// SPEC §8 "Dates": visited_at is a UTC instant plus the place's IANA zone and a
// precision. Month and date precision store 12:00 local time (month on the 1st).

export const PRECISIONS = ["datetime", "date", "month"] as const;
export type Precision = (typeof PRECISIONS)[number];

// Local values, by precision: "YYYY-MM-DDTHH:mm", "YYYY-MM-DD", "YYYY-MM".
const LOCAL_VALUE: Record<Precision, RegExp> = {
  datetime: /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  date: /^(\d{4})-(\d{2})-(\d{2})$/,
  month: /^(\d{4})-(\d{2})$/,
};

const LOCAL_FORMAT: Record<Precision, string> = {
  datetime: "yyyy-MM-dd'T'HH:mm",
  date: "yyyy-MM-dd",
  month: "yyyy-MM",
};

const DISPLAY: Record<Precision, string> = {
  datetime: "MMM d, yyyy, h:mm a",
  date: "MMM d, yyyy",
  month: "MMM yyyy",
};

// Offline lookup from coordinates (SPEC §4).
export function timezoneAt(lat: number, lng: number) {
  return tzLookup(lat, lng);
}

export function isTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// True when value has the format for its precision and is a real calendar date/time.
export function isLocalValue(value: string, precision: Precision) {
  const m = value.match(LOCAL_VALUE[precision]);
  if (!m) return false;
  const [year, month, day = 1, hour = 0, minute = 0] = m.slice(1).map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute
  );
}

// Wall-clock time in a zone ("YYYY-MM-DDTHH:mm" or with ":ss") → UTC instant.
export function localToUtc(local: string, timeZone: string) {
  return fromZonedTime(local, timeZone);
}

// A local value at its precision → the UTC instant to store in visited_at.
export function visitedAtUtc(value: string, precision: Precision, timeZone: string) {
  if (!isLocalValue(value, precision)) throw new RangeError(`Not a ${precision} value: ${value}`);
  const local = precision === "month" ? `${value}-01T12:00` : precision === "date" ? `${value}T12:00` : value;
  return localToUtc(local, timeZone);
}

// The first instant of a local day ("YYYY-MM-DD") in a zone. Where a clock change skips
// midnight (America/Santiago in September) or the whole day (Pacific/Apia, 2011-12-30),
// date-fns-tz lands on an earlier local day; the day then starts when the clock jumps, which
// is as far ahead as the wall clock is behind.
export function startOfLocalDay(day: string, timeZone: string) {
  const guess = fromZonedTime(`${day}T00:00`, timeZone);
  const local = formatInTimeZone(guess, timeZone, "yyyy-MM-dd'T'HH:mm:ss.SSS");
  const behind = Date.parse(`${day}T00:00Z`) - Date.parse(`${local}Z`);
  return behind > 0 ? new Date(guess.getTime() + behind) : guess;
}

// The reverse: a stored visited_at as the local value at its precision, in the visit's zone, so
// editing a visit starts from the wall clock it shows.
export function localValue(visitedAt: Date | string, precision: Precision, timeZone: string) {
  return formatInTimeZone(visitedAt, timeZone, LOCAL_FORMAT[precision]);
}

// EXIF DateTimeOriginal ("YYYY:MM:DD HH:MM:SS") → UTC (SPEC §11.2 step 5). Uses
// OffsetTimeOriginal ("+02:00") when present, otherwise the place's zone. Pass the raw
// EXIF strings: exifr's default Date conversion would use the browser's zone.
// Returns null for a missing or invalid date (cameras write "0000:00:00 00:00:00").
export function exifToUtc(dateTimeOriginal: string, offset: string | null | undefined, placeTimeZone: string) {
  const m = dateTimeOriginal.trim().match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, year, month, day, hour, minute, second] = m;
  if (!isLocalValue(`${year}-${month}-${day}T${hour}:${minute}`, "datetime") || Number(second) > 59) return null;

  const local = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const trimmedOffset = offset?.trim();
  if (trimmedOffset && /^[+-]\d{2}:\d{2}$/.test(trimmedOffset)) return new Date(`${local}${trimmedOffset}`);
  return localToUtc(local, placeTimeZone);
}

// "Mar 2025", "Mar 12, 2025", or "Mar 12, 2025, 3:45 PM", in the place's zone.
export function formatVisited(visitedAt: Date | string, precision: Precision, timeZone: string) {
  return formatInTimeZone(visitedAt, timeZone, DISPLAY[precision]);
}

// The same, with an exact time apart from its date, so a narrow list can leave the time out:
// { date: "Mar 12, 2025", time: "3:45 PM" }, and time null for the other precisions.
export function formatVisitedParts(visitedAt: Date | string, precision: Precision, timeZone: string) {
  if (precision !== "datetime") return { date: formatVisited(visitedAt, precision, timeZone), time: null };
  return { date: formatVisited(visitedAt, "date", timeZone), time: formatInTimeZone(visitedAt, timeZone, "h:mm a") };
}

// Today's date ("YYYY-MM-DD") in a zone, for resolving relative dates in typed text.
export function todayIn(timeZone: string, now = new Date()) {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

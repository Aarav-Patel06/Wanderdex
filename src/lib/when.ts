import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import type { Precision } from "@/lib/dates";

// The confirmation card's date & time, as local wall-clock values in the place's zone (SPEC
// §11.5). Browser-safe: lib/dates also imports the tz lookup table, which stays on the server.

// day is "YYYY-MM-DD" (the 1st for month precision); time is "HH:mm", or "" when the time
// isn't known (date and month precision).
export type When = { day: string; time: string; precision: Precision };

// From the parsed date (typed text), or now in the place's zone.
export function initialWhen(
  visited: { value: string; precision: Precision } | null,
  timeZone: string,
  now = new Date(),
): When {
  if (!visited) {
    const local = formatInTimeZone(now, timeZone, "yyyy-MM-dd'T'HH:mm");
    return { day: local.slice(0, 10), time: local.slice(11), precision: "datetime" };
  }
  const { value, precision } = visited;
  if (precision === "datetime") return { day: value.slice(0, 10), time: value.slice(11), precision };
  if (precision === "date") return { day: value, time: "", precision };
  return { day: `${value}-01`, time: "", precision };
}

// Picking a day or a time makes the visit exact (datetime). A day picked without a known time
// gets 12:00, the same time date precision stores (SPEC §8).
export function withDay(when: When, day: string): When {
  return { day, time: when.time || "12:00", precision: "datetime" };
}

export function withTime(when: When, time: string): When {
  return { ...when, time, precision: "datetime" };
}

// The local value /api/visits takes: "YYYY-MM-DDTHH:mm", "YYYY-MM-DD", or "YYYY-MM".
export function whenValue({ day, time, precision }: When) {
  if (precision === "datetime") return `${day}T${time}`;
  if (precision === "date") return day;
  return day.slice(0, 7);
}

// A calendar day as a Date for the date picker, which works in the browser's zone. It only
// carries the year, month, and day; the place's zone is applied on the server.
export function dayToDate(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function dateToDay(date: Date) {
  return format(date, "yyyy-MM-dd");
}

// The date part, as lib/dates displays it: "Mar 2025" (month) or "Mar 12, 2025".
export function formatDay({ day, precision }: When) {
  return format(dayToDate(day), precision === "month" ? "MMM yyyy" : "MMM d, yyyy");
}

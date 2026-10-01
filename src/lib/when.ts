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

// Changing the day, month, or time keeps the precision the user picked (SPEC §11.5).
export function withDay(when: When, day: string): When {
  return { ...when, day };
}

// month is "YYYY-MM"; month precision keeps the 1st (SPEC §8).
export function withMonth(when: When, month: string): When {
  return { ...when, day: `${month}-01` };
}

export function withTime(when: When, time: string): When {
  return { ...when, time };
}

// The precision control. The time is kept while it's hidden, so switching back to exact time
// brings it back; with no known time, exact time starts at 12:00, the time date precision
// stores (SPEC §8).
export function withPrecision(when: When, precision: Precision): When {
  return { ...when, precision, time: precision === "datetime" ? when.time || "12:00" : when.time };
}

// A cleared exact time can't be saved; date and month precision need no time.
export function isComplete({ time, precision }: When) {
  return precision !== "datetime" || time !== "";
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

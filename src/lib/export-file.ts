import { format } from "date-fns";

// Export data (SPEC §14.6): the files, built in the browser from the rows /api/export returns.
// Browser-safe: the rows are shaped on the server (lib/export), which needs lib/dates.

// One visit with its place, newest first. Columns in this order in the CSV.
export const EXPORT_COLUMNS = [
  "name",
  "category",
  "address",
  "city",
  "country",
  "country_code",
  "lat",
  "lng",
  "visited_at_utc",
  "visited_local",
  "precision",
  "timezone",
  "rating",
  "note",
  "source",
  "source_input",
  "google_place_id",
  "created_at",
] as const;

type Cell = string | number | null;

export type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], Cell>;

// A cell a spreadsheet would read as a formula (OWASP's CSV injection list: =, +, -, @, and a
// leading tab or carriage return).
const FORMULA_START = /^[=+\-@\t\r]/;

// One CSV cell (RFC 4180). Text that a spreadsheet would run as a formula gets a leading ' so
// it shows as text; then a cell with a comma, quote, or line break is quoted, its quotes doubled.
// Numbers are written as they are, so a negative latitude stays a number. Null is empty.
export function csvCell(value: Cell) {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// The whole CSV: a UTF-8 byte order mark (so Excel reads accents as UTF-8), the header, then a
// row per visit, each line ending in CRLF.
export function toCsv(rows: ExportRow[]) {
  const lines = [EXPORT_COLUMNS.join(","), ...rows.map((row) => EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(","))];
  return `﻿${lines.map((line) => `${line}\r\n`).join("")}`;
}

export function toJson(rows: ExportRow[]) {
  return JSON.stringify(rows, null, 2);
}

// wanderdex-export-YYYY-MM-DD.csv, by the browser's own date.
export function exportFilename(extension: "csv" | "json", now = new Date()) {
  return `wanderdex-export-${format(now, "yyyy-MM-dd")}.${extension}`;
}

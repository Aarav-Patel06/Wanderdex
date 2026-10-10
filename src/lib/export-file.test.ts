import { describe, expect, it } from "vitest";

import { csvCell, EXPORT_COLUMNS, type ExportRow, exportFilename, toCsv, toJson } from "@/lib/export-file";

const ROW: ExportRow = {
  name: "Café Zoë",
  category: "cafe",
  address: "1 Rue de Rivoli, Paris",
  city: "Paris",
  country: "France",
  country_code: "FR",
  lat: 48.8566,
  lng: -2.3522,
  visited_at_utc: "2025-03-12T13:30:00.000Z",
  visited_local: "2025-03-12T14:30",
  precision: "datetime",
  timezone: "Europe/Paris",
  rating: 8,
  note: null,
  source: "link",
  source_input: "https://maps.app.goo.gl/abc",
  google_place_id: "ChIJ123",
  created_at: "2025-03-12T14:00:00.000Z",
};

describe("csvCell", () => {
  it("leaves plain text as it is", () => {
    expect(csvCell("Paris")).toBe("Paris");
    expect(csvCell("")).toBe("");
  });

  it("quotes a cell with a comma, quote, or line break, doubling its quotes", () => {
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('the "best" one')).toBe('"the ""best"" one"');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvCell("line 1\r\nline 2")).toBe('"line 1\r\nline 2"');
  });

  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])("prefixes a formula-looking cell %j with '", (value) => {
    expect(csvCell(value).replace(/^"/, "")).toMatch(/^'/);
  });

  it("guards a formula first, then quotes it", () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell("-cool, right")).toBe(`"'-cool, right"`);
  });

  it("guards only the start of a cell", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("2 + 2")).toBe("2 + 2");
  });

  it("writes numbers as numbers, negative ones unguarded", () => {
    expect(csvCell(-33.8688)).toBe("-33.8688");
    expect(csvCell(151.2093)).toBe("151.2093");
    expect(csvCell(10)).toBe("10");
  });

  it("writes null as an empty cell", () => {
    expect(csvCell(null)).toBe("");
  });
});

describe("toCsv", () => {
  it("starts with a UTF-8 byte order mark and the header, in column order, lines ending in CRLF", () => {
    const csv = toCsv([]);
    expect(csv).toBe(`﻿${EXPORT_COLUMNS.join(",")}\r\n`);
  });

  it("writes one row per visit, accents kept", () => {
    const csv = toCsv([ROW, { ...ROW, name: "Second", note: 'Ate "everything",\nthen left', rating: null }]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      'Café Zoë,cafe,"1 Rue de Rivoli, Paris",Paris,France,FR,48.8566,-2.3522,2025-03-12T13:30:00.000Z,2025-03-12T14:30,datetime,Europe/Paris,8,,link,https://maps.app.goo.gl/abc,ChIJ123,2025-03-12T14:00:00.000Z',
    );
    // The note's line break stays inside its quotes, so the row is still one record.
    expect(lines[2]).toContain(',,"Ate ""everything"",\nthen left",link,');
    expect(lines[3]).toBe("");
  });
});

describe("toJson", () => {
  it("is the rows as an array, nulls kept", () => {
    expect(JSON.parse(toJson([ROW]))).toEqual([ROW]);
    expect(JSON.parse(toJson([]))).toEqual([]);
  });
});

describe("exportFilename", () => {
  it("is wanderdex-export-YYYY-MM-DD in the browser's date", () => {
    const now = new Date(2026, 9, 5, 23, 59);
    expect(exportFilename("csv", now)).toBe("wanderdex-export-2026-10-05.csv");
    expect(exportFilename("json", now)).toBe("wanderdex-export-2026-10-05.json");
  });
});

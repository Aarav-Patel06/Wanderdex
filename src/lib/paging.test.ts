import { describe, expect, it, vi } from "vitest";

import { PAGE_ROWS, readAllPages } from "@/lib/paging";

// A table of `total` numbered rows, served like `.range(from, to)` would.
function table(total: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  return vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
}

describe("readAllPages", () => {
  it("reads 1,000 rows a page", () => {
    expect(PAGE_ROWS).toBe(1000);
  });

  it("stops after one short page", async () => {
    const page = table(3);
    expect(await readAllPages(page)).toEqual([0, 1, 2]);
    expect(page.mock.calls).toEqual([[0, 999]]);
  });

  it("reads an empty table with one request", async () => {
    const page = table(0);
    expect(await readAllPages(page)).toEqual([]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("keeps reading past 1,000 rows, in order, until a page comes back short", async () => {
    const page = table(2500);
    const rows = await readAllPages(page);
    expect(rows).toHaveLength(2500);
    expect(rows).toEqual(Array.from({ length: 2500 }, (_, i) => i));
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more after an exactly full page, and stops at the empty one", async () => {
    const page = table(2000);
    expect(await readAllPages(page)).toHaveLength(2000);
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("throws a query error, on any page", async () => {
    const error = new Error("boom");
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: Array(PAGE_ROWS).fill(0), error: null })
      .mockResolvedValueOnce({ data: null, error });
    await expect(readAllPages(page)).rejects.toBe(error);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("treats null data without an error as the end", async () => {
    expect(await readAllPages(async () => ({ data: null, error: null }))).toEqual([]);
  });
});

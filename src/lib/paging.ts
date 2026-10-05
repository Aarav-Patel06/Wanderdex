// Supabase returns at most 1,000 rows per request (the API's default max rows), so reads that need
// every row of the user's go page by page.
export const PAGE_ROWS = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

// Every row of a query, PAGE_ROWS at a time until a page comes back short. `page(from, to)` runs
// the query for rows from–to (inclusive, as `.range()` takes them), in a stable order, so pages
// neither overlap nor skip rows. A query error throws.
export async function readAllPages<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return rows;
  }
}

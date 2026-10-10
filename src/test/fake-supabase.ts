import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

// An in-memory stand-in for the Supabase client, for tests: tables are arrays of rows. Supports
// the query shapes the server uses: select (with { count, head }, and embedded rows written
// `alias:table(...)`, found by the row's `<alias>_id`), insert, upsert (onConflict,
// ignoreDuplicates), update, delete, eq, neq, gte, lt, in, order, range, single, and maybeSingle.
// Inserted rows get an id and created_at, as the database would. `unique` lists each table's
// unique column sets (a row with a null in the set never conflicts, like a partial index on not
// null): an insert that would repeat one fails with Postgres' 23505.
export function fakeSupabase(tables: Record<string, Row[]> = {}, { unique = {} }: { unique?: Record<string, string[][]> } = {}) {
  const sameKey = (a: Row, b: Row, columns: string[]) => columns.every((column) => a[column] != null && a[column] === b[column]);
  const added = (row: Row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row });

  function from(table: string) {
    const rows = (tables[table] ??= []);
    let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let payload: Row[] = [];
    let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let head = false;
    let single = false;
    let embeds: { alias: string; table: string }[] = [];
    const filters: ((row: Row) => boolean)[] = [];
    const orders: { column: string; ascending: boolean }[] = [];
    let range: [number, number] | null = null;

    function run() {
      if (op === "insert") {
        const conflict = payload.some((row) =>
          (unique[table] ?? []).some((columns) => rows.some((other) => sameKey(row, other, columns))),
        );
        if (conflict) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        const inserted = payload.map(added);
        rows.push(...inserted);
        return { data: single ? inserted[0] : inserted, error: null };
      }
      if (op === "upsert") {
        const columns = (upsertOptions.onConflict ?? "id").split(",");
        const written: Row[] = [];
        for (const row of payload) {
          const existing = rows.find((other) => sameKey(row, other, columns));
          if (!existing) written.push(rows[rows.push(added(row)) - 1]);
          else if (!upsertOptions.ignoreDuplicates) written.push(Object.assign(existing, row));
        }
        return { data: written, error: null };
      }
      const matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (op === "update") {
        matched.forEach((row) => Object.assign(row, payload[0]));
        return { data: null, error: null };
      }
      if (op === "delete") {
        for (const row of matched) rows.splice(rows.indexOf(row), 1);
        return { data: null, error: null };
      }
      if (head) return { data: null, count: matched.length, error: null };
      for (const { column, ascending } of [...orders].reverse()) {
        matched.sort((a, b) => (a[column] === b[column] ? 0 : (String(a[column]) < String(b[column])) === ascending ? -1 : 1));
      }
      const page = (range ? matched.slice(range[0], range[1] + 1) : matched).map((row) =>
        embeds.length
          ? {
              ...row,
              ...Object.fromEntries(
                embeds.map(({ alias, table: other }) => [alias, tables[other]?.find((r) => r.id === row[`${alias}_id`]) ?? null]),
              ),
            }
          : row,
      );
      return { data: single ? (page[0] ?? null) : page, error: null };
    }

    const query = {
      select: (columns?: string, options?: { head?: boolean }) => {
        if (op === "select") {
          head = Boolean(options?.head);
          embeds = [...(columns ?? "").matchAll(/(\w+):(\w+)\(/g)].map(([, alias, other]) => ({ alias, table: other }));
        }
        return query;
      },
      insert: (row: Row | Row[]) => ((op = "insert"), (payload = [row].flat()), query),
      upsert: (row: Row | Row[], options: typeof upsertOptions = {}) => (
        (op = "upsert"), (payload = [row].flat()), (upsertOptions = options), query
      ),
      update: (row: Row) => ((op = "update"), (payload = [row]), query),
      delete: () => ((op = "delete"), query),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
      neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), query),
      // Timestamps are ISO strings, which sort as text.
      gte: (column: string, value: string) => (filters.push((row) => String(row[column]) >= value), query),
      lt: (column: string, value: string) => (filters.push((row) => String(row[column]) < value), query),
      in: (column: string, values: readonly unknown[]) => (filters.push((row) => values.includes(row[column])), query),
      order: (column: string, options?: { ascending?: boolean }) => (
        orders.push({ column, ascending: options?.ascending ?? true }), query
      ),
      range: (fromRow: number, toRow: number) => ((range = [fromRow, toRow]), query),
      single: () => ((single = true), query),
      maybeSingle: () => ((single = true), query),
      overrideTypes: () => query,
      then: (resolve: (value: ReturnType<typeof run>) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve().then(run).then(resolve, reject),
    };
    return query;
  }

  return { client: { from } as unknown as SupabaseClient, tables };
}

// `count` rows made `minutesAgo` before `now`.
export function rowsAt(count: number, now: Date, minutesAgo: number, row: Row) {
  const created_at = new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  return Array.from({ length: count }, () => ({ ...row, created_at }));
}

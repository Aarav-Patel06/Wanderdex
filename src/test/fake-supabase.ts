import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

// An in-memory stand-in for the Supabase client, for tests: tables are arrays of rows. Supports
// the query shapes the server uses: select (with { count, head }), insert, update, eq, neq, gte,
// single, and maybeSingle. Inserted rows get an id and created_at, as the database would.
export function fakeSupabase(tables: Record<string, Row[]> = {}) {
  function from(table: string) {
    const rows = (tables[table] ??= []);
    let op: "select" | "insert" | "update" = "select";
    let payload: Row[] = [];
    let head = false;
    let single = false;
    const filters: ((row: Row) => boolean)[] = [];

    function run() {
      if (op === "insert") {
        const added = payload.map((row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (op === "update") {
        matched.forEach((row) => Object.assign(row, payload[0]));
        return { data: null, error: null };
      }
      if (head) return { data: null, count: matched.length, error: null };
      return { data: single ? (matched[0] ?? null) : matched, error: null };
    }

    const query = {
      select: (_columns?: string, options?: { head?: boolean }) => {
        if (op === "select") head = Boolean(options?.head);
        return query;
      },
      insert: (row: Row | Row[]) => ((op = "insert"), (payload = [row].flat()), query),
      update: (row: Row) => ((op = "update"), (payload = [row]), query),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
      neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), query),
      // Timestamps are ISO strings, which sort as text.
      gte: (column: string, value: string) => (filters.push((row) => String(row[column]) >= value), query),
      single: () => ((single = true), query),
      maybeSingle: () => ((single = true), query),
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

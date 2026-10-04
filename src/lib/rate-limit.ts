import type { SupabaseClient } from "@supabase/supabase-js";

import type { CallGate, GoogleSku } from "@/lib/google/places";
import { GOOGLE_CALLS_PER_MONTH, LOOKUPS_PER_DAY, LOOKUPS_PER_HOUR } from "@/lib/rate-limits";

// SPEC §17's rate limits, kept in resolve_log and google_call_log. Both tables are service_role
// only, so these take the admin client. Each check counts, then logs: two requests at the same
// moment can both pass just below a limit, which the margins in lib/rate-limits allow for.

// Hitting a limit; the routes answer rate_limited ("Slow down, traveler!", SPEC §11.7).
export class RateLimitError extends Error {
  constructor() {
    super("Rate limit reached");
  }
}

export type LookupKind = "link" | "text" | "nearby";

const HOUR_MS = 60 * 60 * 1000;

// A user's lookup (/api/resolve/*, or a manual-place save), before any of its work: throws once
// they've had LOOKUPS_PER_HOUR in the last hour or LOOKUPS_PER_DAY in the last 24 hours (so the
// 61st in an hour is the first one refused), otherwise logs it.
// A rejected request isn't logged, so a user who keeps trying is let back in as the window moves.
export async function limitLookup(admin: SupabaseClient, userId: string, kind: LookupKind) {
  const since = (ms: number) => countRows(admin, "resolve_log", "user_id", userId, new Date(Date.now() - ms));
  const [hour, day] = await Promise.all([since(HOUR_MS), since(24 * HOUR_MS)]);
  if (hour >= LOOKUPS_PER_HOUR || day >= LOOKUPS_PER_DAY) throw new RateLimitError();
  await insertRow(admin, "resolve_log", { user_id: userId, kind });
}

// The gate the Places client calls before each Google request: throws once that SKU has
// GOOGLE_CALLS_PER_MONTH calls this calendar month (UTC) across all users, otherwise logs the call.
export function googleCallGate(admin: SupabaseClient, userId: string): CallGate {
  return async (sku: GoogleSku) => {
    const calls = await countRows(admin, "google_call_log", "sku", sku, monthStartUtc(new Date()));
    if (calls >= GOOGLE_CALLS_PER_MONTH[sku]) throw new RateLimitError();
    await insertRow(admin, "google_call_log", { sku, user_id: userId });
  };
}

export function monthStartUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function countRows(admin: SupabaseClient, table: string, column: string, value: string, since: Date) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function insertRow(admin: SupabaseClient, table: string, row: object) {
  const { error } = await admin.from(table).insert(row);
  if (error) throw error;
}

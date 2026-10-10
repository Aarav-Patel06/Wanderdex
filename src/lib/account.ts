import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Delete account (SPEC §14.6). Browser-safe apart from deleteAccount, which the route runs with
// the admin client.

// DELETE /api/account: the username the user typed to confirm.
export const deleteAccountSchema = z.strictObject({ username: z.string().max(100) });

// Usernames aren't case-sensitive and are stored lowercase (SPEC §10), and phone keyboards add
// spaces after autocomplete, so the typed name is trimmed and lowercased first, as at login.
export function usernameMatches(typed: string, username: string) {
  return username !== "" && typed.trim().toLowerCase() === username;
}

// Deletes everything of the user's, in an order that never orphans a row and can be run again
// after a failure part way: their visits (which reference places), then their private manual
// places (created_by = user, google_place_id null; nothing else refers to them, SPEC §9), then
// the auth user, which cascades to the profile and resolve_log and sets google_call_log and
// import_log to null (SPEC §8). Shared Google places stay. Until the last step the profile still
// exists, so a retry passes the username check again. Throws on the first failure.
export async function deleteAccount(admin: SupabaseClient, userId: string) {
  const visits = await admin.from("visits").delete().eq("user_id", userId);
  if (visits.error) throw visits.error;

  const places = await admin.from("places").delete().eq("created_by", userId).is("google_place_id", null);
  if (places.error) throw places.error;

  const { error } = await admin.auth.admin.deleteUser(userId);
  // 404: already deleted, by an earlier attempt whose answer was lost.
  if (error && error.status !== 404) throw error;
}

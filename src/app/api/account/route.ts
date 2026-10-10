import { deleteAccount, deleteAccountSchema, usernameMatches } from "@/lib/account";
import { errorResponse, readBody, session } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

// Delete account (SPEC §14.6): after the session check, the typed username must be the user's
// own. The deletion itself needs the admin API (secret key, SPEC §17); lib/account has its order.
export async function DELETE(request: Request) {
  const { supabase, userId } = await session();
  if (!userId) return errorResponse("unauthorized");

  const body = await readBody(request, deleteAccountSchema);
  if (!body) return errorResponse("invalid_input");

  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", userId)
      .maybeSingle<{ username: string }>();
    if (error) throw error;
    // The dialog only enables Delete once the name matches, so this is a forged or stale request.
    if (!profile || !usernameMatches(body.username, profile.username)) return errorResponse("invalid_input");

    await deleteAccount(createAdminClient(), userId);
  } catch (error) {
    console.error("account delete failed:", error);
    return errorResponse("upstream_error");
  }

  // The user's sessions went with them; this clears this browser's cookies (local: there's no
  // session left to sign out on the server, and that call's 404 is ignored).
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) console.error("sign-out after account delete failed:", error);
  return Response.json({ deleted: true });
}

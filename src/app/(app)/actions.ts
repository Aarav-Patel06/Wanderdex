"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { changePasswordSchema } from "@/lib/auth";
import { loadStatsVisits } from "@/lib/stats/load";
import { type PassportData, passportData } from "@/lib/stats/passport";
import { profileStats } from "@/lib/stats/profile";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// The passport secret's numbers (SPEC §15.1), for the sidebar's trigger: the profile's stats,
// computed the same way under the user's session.
export async function loadPassport(): Promise<PassportData> {
  return passportData(profileStats(await loadStatsVisits()));
}

export interface PasswordFormState {
  fieldErrors?: Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string[]>>;
  error?: string;
  changed?: boolean;
}

const WRONG_PASSWORD = "That's not your current password.";
const RATE_LIMITED = "Slow down, traveler! Try again in a bit.";
const SOMETHING_BROKE = "The map spirits aren't answering. Try again.";

// Change password (SPEC §14.6). The current password is checked by signing in with it (the
// user's placeholder email, SPEC §10), which also gives a fresh session: Supabase's "secure
// password change" setting accepts only a recent sign-in. That session replaces this browser's
// in its cookies; a wrong password leaves everything as it was. Then the password changes, and
// every other session (other devices, and the one just replaced) is signed out. Supabase's auth
// rate limits apply to both calls.
export async function changePassword(_: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { currentPassword, newPassword } = parsed.data;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // The auth email is the placeholder <username>@wanderdex.local.
  const email = data?.claims?.email;
  if (!email) redirect("/login");

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (signInError?.code === "invalid_credentials") return { fieldErrors: { currentPassword: [WRONG_PASSWORD] } };
  if (signInError) return failed(signInError);

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return failed(updateError);

  // The password has changed either way, so a failure here is only logged.
  const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
  if (othersError) console.error("[auth] signing out other sessions failed:", othersError);
  return { changed: true };
}

// Logs the real error server-side; the user gets game-style copy (SPEC §11.7).
function failed(error: { message: string; status?: number }): PasswordFormState {
  console.error("[auth]", error);
  return { error: error.status === 429 ? RATE_LIMITED : SOMETHING_BROKE };
}

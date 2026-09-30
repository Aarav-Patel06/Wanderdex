"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { loginSchema, signupSchema, usernameToEmail } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  fieldErrors?: Partial<Record<"username" | "password" | "confirmPassword", string[]>>;
  error?: string;
  // Echoed back so the form can keep what was typed (passwords are never echoed).
  username?: string;
}

const USERNAME_TAKEN = "Username taken";
const WRONG_CREDENTIALS = "Wrong username or password. Try again, traveler!";
const RATE_LIMITED = "Slow down, traveler! Try again in a bit.";
const SOMETHING_BROKE = "The map spirits aren't answering. Try again.";

export async function signup(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const typed = String(formData.get("username") ?? "");
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, username: typed };
  }
  const { username, password } = parsed.data;
  const taken = { fieldErrors: { username: [USERNAME_TAKEN] }, username: typed };

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();
  if (lookupError) return failed(lookupError, typed);
  if (existing) return taken;

  // With email confirmations off, signUp also starts the session (sets the cookies).
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
  });
  // "Already registered" covers two signups racing for the same username.
  if (error?.code === "user_already_exists" || error?.message.includes("already registered")) {
    return taken;
  }
  if (error) return failed(error, typed);
  if (!data.user || !data.session) {
    // Happens only if email confirmations are still on in the Supabase dashboard.
    return failed(new Error("signUp returned no session. Turn off email confirmations."), typed);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ user_id: data.user.id, username });
  if (profileError) {
    // Roll back so the username isn't stuck without a profile.
    await supabase.auth.signOut();
    await admin.auth.admin.deleteUser(data.user.id);
    return profileError.code === "23505" ? taken : failed(profileError, typed);
  }

  redirect("/");
}

export async function login(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const typed = String(formData.get("username") ?? "");
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, username: typed };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(parsed.data.username),
    password: parsed.data.password,
  });
  if (error?.code === "invalid_credentials") return { error: WRONG_CREDENTIALS, username: typed };
  if (error) return failed(error, typed);

  redirect("/");
}

// Logs the real error server-side; the user gets game-style copy (SPEC §11.7).
function failed(error: { message: string; status?: number }, username: string): AuthFormState {
  console.error("[auth]", error);
  return { error: error.status === 429 ? RATE_LIMITED : SOMETHING_BROKE, username };
}

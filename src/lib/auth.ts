import { z } from "zod";

// SPEC §10: 3–20 characters, a–z 0–9 _, not case-sensitive (stored lowercase).
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "Use 3–20 letters, numbers, or _.");

// SPEC §10: minimum 6, no other rules. 72 is Supabase's (bcrypt's) upper limit.
const passwordSchema = z
  .string()
  .min(6, "At least 6 characters.")
  .max(72, "72 characters max.");

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Enter your password."),
});

export const signupSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

// Supabase Auth is email-based; each username maps to a hidden placeholder email
// that users never see (SPEC §10). Pass an already-validated username.
export function usernameToEmail(username: string) {
  return `${username}@wanderdex.local`;
}

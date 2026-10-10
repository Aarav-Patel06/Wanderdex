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

// Change password on the profile (SPEC §14.6): the new one follows the signup rules. Typing the
// current password again as the new one is caught here (Supabase would refuse it anyway).
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "That's your current password. Pick a new one.",
    path: ["newPassword"],
  });

// Supabase Auth is email-based; each username maps to a hidden placeholder email
// that users never see (SPEC §10). Pass an already-validated username.
export function usernameToEmail(username: string) {
  return `${username}@wanderdex.local`;
}

import type { Metadata } from "next";

import { AuthHeader } from "@/components/auth/auth-header";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in · Wanderdex" };

// ?deleted: the user just deleted their account (SPEC §14.6).
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { deleted } = await searchParams;
  return (
    <>
      <AuthHeader />
      <LoginForm notice={deleted !== undefined ? "Account deleted." : undefined} />
    </>
  );
}

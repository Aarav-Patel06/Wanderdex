import type { Metadata } from "next";

import { AuthHeader } from "@/components/auth/auth-header";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in · Wanderdex" };

export default function LoginPage() {
  return (
    <>
      <AuthHeader />
      <LoginForm />
    </>
  );
}

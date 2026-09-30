import type { Metadata } from "next";

import { AuthHeader } from "@/components/auth/auth-header";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Sign up · Wanderdex" };

export default function SignupPage() {
  return (
    <>
      <AuthHeader />
      <SignupForm />
    </>
  );
}

"use client";

import { useActionState } from "react";

import Link from "next/link";

import { type AuthFormState, signup } from "@/app/(auth)/actions";
import { FormField, usernameInputProps } from "@/components/auth/form-field";
import { Alert, AlertTitle } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signup, {});

  return (
    <form action={action} noValidate className="flex flex-col gap-6 px-1.5">
      <FormField
        name="username"
        label="Username"
        defaultValue={state.username}
        errors={state.fieldErrors?.username}
        {...usernameInputProps}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors?.password}
      />
      <FormField
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors?.confirmPassword}
      />
      <Alert variant="warning">
        <AlertTitle>Passwords can&apos;t be recovered. Pick one you&apos;ll remember.</AlertTitle>
      </Alert>
      {state.error && (
        <Alert variant="error">
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        Sign up
      </Button>
      <p className="flex flex-wrap items-center justify-center gap-x-2">
        Have an account?
        <Button asChild variant="ghost">
          <Link href="/login">Log in</Link>
        </Button>
      </p>
    </form>
  );
}

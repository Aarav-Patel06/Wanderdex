"use client";

import { useActionState } from "react";

import Link from "next/link";

import { type AuthFormState, login } from "@/app/(auth)/actions";
import { FormField, usernameInputProps } from "@/components/auth/form-field";
import { Alert, AlertTitle } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, {});

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
        autoComplete="current-password"
        errors={state.fieldErrors?.password}
      />
      {state.error && (
        <Alert variant="error">
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        Log in
      </Button>
      <p className="flex flex-wrap items-center justify-center gap-x-2">
        No account yet?
        <Button asChild variant="ghost">
          <Link href="/signup">Sign up</Link>
        </Button>
      </p>
    </form>
  );
}

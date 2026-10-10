"use client";

import { useActionState } from "react";

import { changePassword, type PasswordFormState } from "@/app/(app)/actions";
import { FormField } from "@/components/auth/form-field";
import { Alert, AlertTitle } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { toast } from "@/components/ui/8bit/toast";

// Change password (SPEC §14.6), with the signup form's fields, rules, and server-only validation.
// The fields clear after every submit, as on the auth forms; success shows a toast.
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<PasswordFormState, FormData>(async (previous, formData) => {
    const next = await changePassword(previous, formData);
    if (next.changed) toast("Password changed!", { variant: "success" });
    return next;
  }, {});

  return (
    <form action={action} noValidate className="flex flex-col gap-6 px-1.5">
      <FormField
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        errors={state.fieldErrors?.currentPassword}
      />
      <FormField
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors?.newPassword}
      />
      <FormField
        name="confirmPassword"
        label="Confirm new password"
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
      <Button type="submit" disabled={pending} className="self-start">
        Change password
      </Button>
    </form>
  );
}

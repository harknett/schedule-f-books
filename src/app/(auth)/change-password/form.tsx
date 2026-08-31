"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { choosePassword, type ChangePasswordState } from "./actions";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Setting…" : "Set my password"}
    </Button>
  );
}

export function ChoosePasswordForm() {
  const [state, action] = useActionState<ChangePasswordState, FormData>(choosePassword, {});

  return (
    <Card>
      <form action={action} className="space-y-4">
        <ErrorBanner message={state.error} />

        <Field label="Temporary password" htmlFor="currentPassword" hint="The one you were given.">
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Only you should know it.`}
        >
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>

        <Field label="New password again" htmlFor="confirmPassword">
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>

        <Submit />
      </form>
    </Card>
  );
}

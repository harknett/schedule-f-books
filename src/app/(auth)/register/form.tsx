"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { registerOwner, type AuthState } from "../actions";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create owner account"}
    </Button>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState<AuthState, FormData>(registerOwner, {});

  return (
    <Card>
      <form action={action} className="space-y-4">
        <ErrorBanner message={state.error} />
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        >
          <Input
            id="password"
            name="password"
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

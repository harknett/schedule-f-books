"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type AuthState } from "../actions";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function SignInForm() {
  const [state, action] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <Card>
      <form action={action} className="space-y-4">
        <ErrorBanner message={state.error} />
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
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Submit />
      </form>
    </Card>
  );
}

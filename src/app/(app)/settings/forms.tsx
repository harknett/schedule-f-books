"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { addUser, changePassword, type SettingsState } from "./actions";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Success({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm text-accent">
      {message}
    </p>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<SettingsState, FormData>(changePassword, {});

  return (
    <Card>
      <form action={action} className="space-y-4">
        <h2 className="font-semibold">Change your password</h2>
        <ErrorBanner message={state.error} />
        <Success message={state.success} />

        <Field label="Current password" htmlFor="currentPassword">
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field
          label="New password"
          htmlFor="newPassword"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
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
        <Submit label="Update password" />
      </form>
    </Card>
  );
}

export function AddUserForm() {
  const [state, action] = useActionState<SettingsState, FormData>(addUser, {});

  return (
    <Card>
      <form action={action} className="space-y-4">
        <div>
          <h2 className="font-semibold">Add someone to the books</h2>
          <p className="text-sm text-muted mt-0.5">
            They see the same farm ledger. Hours stay personal to whoever logged them.
          </p>
        </div>
        <ErrorBanner message={state.error} />
        <Success message={state.success} />

        <Field label="Name" htmlFor="new-name">
          <Input id="new-name" name="name" autoComplete="off" required />
        </Field>
        <Field label="Email" htmlFor="new-email">
          <Input
            id="new-email"
            name="email"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            required
          />
        </Field>
        <Field
          label="Temporary password"
          htmlFor="new-password"
          hint="Give it to them directly; they can change it once signed in."
        >
          <Input
            id="new-password"
            name="password"
            type="text"
            autoComplete="off"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>
        <Submit label="Create account" />
      </form>
    </Card>
  );
}

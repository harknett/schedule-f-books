import { redirect } from "next/navigation";

import { Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

import { RegisterForm } from "./form";

export const metadata = { title: "Set up · Schedule F Books" };

export default async function RegisterPage() {
  if (await currentUser()) redirect("/");

  // Registration is a one-time bootstrap. Once an owner exists, additional
  // accounts are created from Settings rather than by anyone who finds the URL.
  if (getStore().countUsers() > 0) redirect("/login");

  // Unset means closed: an installation nobody has finished configuring should
  // not be claimable by whoever loads this page first.
  const open = Boolean(process.env.SETUP_TOKEN?.trim());

  if (!open) {
    return (
      <Card className="space-y-2">
        <p className="font-semibold">Setup is closed</p>
        <p className="text-sm text-muted">
          No <code className="font-mono">SETUP_TOKEN</code> is set, so the owner account cannot be
          created. Set one in the service environment, restart, and reload this page.
        </p>
        <p className="text-sm text-muted">
          That gate exists because between a service starting and its first account being made,
          whoever loads this page becomes the owner of the farm&apos;s books.
        </p>
      </Card>
    );
  }

  return (
    <>
      <p className="text-center text-sm text-muted">
        Setting up this installation. This first account is the farm owner.
      </p>
      <RegisterForm />
    </>
  );
}

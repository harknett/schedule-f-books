import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

import { SignInForm } from "./form";

export const metadata = { title: "Sign in · Schedule F Books" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  // A fresh install has nobody to sign in as - send them to set up the owner.
  const needsSetup = getStore().countUsers() === 0;
  if (needsSetup) redirect("/register");

  return (
    <>
      <SignInForm />
      <p className="text-center text-xs text-muted leading-relaxed">
        Forgotten your password? The farm owner can reset it from Settings.
        <br />
        If you are the owner, run <code className="font-mono">npm run set-password</code> on the
        machine this is running on.
      </p>
    </>
  );
}

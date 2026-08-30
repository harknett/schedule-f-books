import Link from "next/link";
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
      <p className="text-center text-xs text-muted">
        No account?{" "}
        <Link href="/register" className="underline">
          Farm owners set up accounts
        </Link>{" "}
        from Settings.
      </p>
    </>
  );
}

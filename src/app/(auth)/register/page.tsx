import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

import { RegisterForm } from "./form";

export const metadata = { title: "Set up · Schedule F Books" };

export default async function RegisterPage() {
  if (await currentUser()) redirect("/");

  // Registration is a one-time bootstrap. Once an owner exists, additional
  // accounts are created from Settings rather than by anyone who finds the URL.
  if (getStore().countUsers() > 0) redirect("/login");

  return (
    <>
      <p className="text-center text-sm text-muted">
        Setting up this installation. This first account is the farm owner.
      </p>
      <RegisterForm />
    </>
  );
}

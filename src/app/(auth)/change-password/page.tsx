import { redirect } from "next/navigation";

import { signOut } from "../actions";
import { ChoosePasswordForm } from "./form";
import { currentUser } from "@/lib/auth/session";

export const metadata = { title: "Choose a password · Schedule F Books" };

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Nothing to do here once the account holds its own password.
  if (!user.mustChangePassword) redirect("/");

  return (
    <>
      <p className="text-center text-sm text-muted">
        Welcome, {user.name.split(" ")[0]}. This account is using a password someone else set, so
        please choose your own before going on.
      </p>

      <ChoosePasswordForm />

      <form action={signOut} className="text-center">
        <button type="submit" className="text-xs text-muted underline">
          Sign out instead
        </button>
      </form>
    </>
  );
}

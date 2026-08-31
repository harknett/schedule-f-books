"use server";

import { redirect } from "next/navigation";

import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { requireSignedIn } from "@/lib/auth/guard";
import { startSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

export interface ChangePasswordState {
  error?: string;
}

/**
 * Choose a password for an account that is currently holding one somebody else
 * set. Uses requireSignedIn rather than requireUser: requireUser would bounce
 * the caller straight back here.
 */
export async function choosePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireSignedIn();

  try {
    const current = String(formData.get("currentPassword") ?? "");
    const next = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");

    const store = getStore();
    const record = store.findUserByEmail(user.email);
    if (!record || !(await verifyPassword(current, record.passwordHash))) {
      return { error: "That temporary password is not correct." };
    }

    validatePassword(next);
    if (next !== confirm) return { error: "The two new passwords do not match." };
    if (next === current) {
      return { error: "Choose a password different from the temporary one." };
    }

    // Their own choice now, so the hold comes off.
    store.setPassword(user.id, await hashPassword(next), false);

    // Anything else signed in with the temporary password is ended, and this
    // session is reissued so the person changing it stays put.
    store.deleteUserSessions(user.id);
    await startSession(user.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set the password." };
  }

  redirect("/");
}

"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

export interface SettingsState {
  error?: string;
  success?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only the owner can add people to the books. */
export async function addUser(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const actor = await requireUser();
  if (actor.role !== "owner") {
    return { error: "Only the farm owner can add accounts." };
  }

  try {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
    if (name === "") return { error: "Name is required." };
    validatePassword(password);

    const store = getStore();
    if (store.findUserByEmail(email)) {
      return { error: `${email} already has an account.` };
    }

    store.createUser({
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "member",
    });

    revalidatePath("/settings");
    return { success: `${name} can now sign in. Share the password with them directly.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the account." };
  }
}

export async function changePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireUser();

  try {
    const current = String(formData.get("currentPassword") ?? "");
    const next = String(formData.get("newPassword") ?? "");

    const store = getStore();
    const record = store.findUserByEmail(actor.email);
    if (!record || !(await verifyPassword(current, record.passwordHash))) {
      return { error: "Your current password is not correct." };
    }

    validatePassword(next);
    if (next === current) return { error: "The new password matches the old one." };

    store.setPassword(actor.id, await hashPassword(next));

    // A password change should end any other session using the old one.
    store.deleteUserSessions(actor.id);
    await startSession(actor.id);

    return { success: "Password updated. Any other signed-in device was signed out." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not change the password." };
  }
}

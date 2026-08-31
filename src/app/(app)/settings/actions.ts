"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import {
  generateTemporaryPassword,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

export interface SettingsState {
  error?: string;
  success?: string;
}

export interface ResetState {
  error?: string;
  /** Shown once, never stored. */
  temporaryPassword?: string;
  forName?: string;
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
      // Somebody else chose it, so they pick their own at first sign-in.
      mustChangePassword: true,
    });

    revalidatePath("/settings");
    return {
      success: `${name} can now sign in. Share the password directly — they will be asked to choose their own.`,
    };
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

    // Their own choice, so no hold.
    store.setPassword(actor.id, await hashPassword(next), false);

    // A password change should end any other session using the old one.
    store.deleteUserSessions(actor.id);
    await startSession(actor.id);

    return { success: "Password updated. Any other signed-in device was signed out." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not change the password." };
  }
}

/**
 * Reset somebody's password to a fresh temporary one.
 *
 * The generated password is returned once for the owner to hand over and is
 * never stored in the clear. Every session that account had is ended, and it
 * is held at the change-password page until it picks its own.
 */
export async function resetUserPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const actor = await requireUser();
  if (actor.role !== "owner") {
    return { error: "Only the farm owner can reset a password." };
  }

  try {
    const userId = Number(formData.get("userId"));
    if (!Number.isInteger(userId)) return { error: "Invalid account." };

    const store = getStore();
    const target = store.getUser(userId);
    if (!target) return { error: "That account no longer exists." };

    const temporaryPassword = generateTemporaryPassword();
    store.setPassword(userId, await hashPassword(temporaryPassword), true);
    store.deleteUserSessions(userId);

    revalidatePath("/settings");
    return { temporaryPassword, forName: target.name };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reset the password." };
  }
}

"use server";

import { redirect } from "next/navigation";

import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { endSession, startSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

export interface AuthState {
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCredentials(formData: FormData): { email: string; password: string } {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
  if (password === "") throw new Error("Password is required.");
  return { email, password };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  let userId: number;
  try {
    const { email, password } = readCredentials(formData);
    const user = getStore().findUserByEmail(email);

    // Same message either way - it shouldn't reveal which emails exist.
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) return { error: "That email and password don't match." };
    userId = user.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sign in failed." };
  }

  await startSession(userId);
  redirect("/");
}

/**
 * Bootstrap registration: only available while the books have no users.
 * Everyone after the first is created by the owner from Settings.
 */
export async function registerOwner(_prev: AuthState, formData: FormData): Promise<AuthState> {
  let userId: number;
  try {
    const store = getStore();
    if (store.countUsers() > 0) {
      return { error: "This installation already has an owner. Ask them for an account." };
    }

    const { email, password } = readCredentials(formData);
    const name = String(formData.get("name") ?? "").trim();
    if (name === "") return { error: "Name is required." };
    validatePassword(password);

    const user = store.createUser({
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "owner",
    });
    userId = user.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the account." };
  }

  await startSession(userId);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}

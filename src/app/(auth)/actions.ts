"use server";

import { redirect } from "next/navigation";

import {
  hashPassword,
  validatePassword,
  verifyAgainstDecoy,
  verifyPassword,
} from "@/lib/auth/password";
import {
  checkLoginThrottle,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/auth/throttle";
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
  let email: string;

  try {
    const credentials = readCredentials(formData);
    email = credentials.email;

    // Checked before the password is touched, so a guessing run costs the
    // attacker time rather than costing us a scrypt hash per attempt.
    const throttle = await checkLoginThrottle(email);
    if (throttle.blocked) return { error: throttle.message };

    const user = getStore().findUserByEmail(email);

    // Same message either way, and the same cost either way: an unknown
    // address verifies against a decoy so it cannot answer faster than a wrong
    // password and reveal which emails have accounts.
    const ok = user
      ? await verifyPassword(credentials.password, user.passwordHash)
      : await verifyAgainstDecoy(credentials.password);

    if (!user || !ok) {
      await recordLoginFailure(email);
      return { error: "That email and password don't match." };
    }
    userId = user.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sign in failed." };
  }

  await clearLoginFailures(email);
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

    /*
      Gated on a token from the environment, not merely on "no owner exists
      yet".

      On a laptop those are the same thing. On a server they are not: between
      the service starting and you creating the account there is a window in
      which whoever loads this page becomes the owner of the farm's books, and
      on a public hostname that window is a race against scanners which find
      new certificates in the transparency logs within hours. The token turns
      it into a door only the operator can open.

      Unset means closed. That is the safe default for an installation nobody
      has finished configuring — including every existing one, which already
      has an owner and so never reaches this line.
    */
    const expected = process.env.SETUP_TOKEN?.trim();
    if (!expected) {
      return {
        error:
          "Setup is closed. Set SETUP_TOKEN in the service environment to create the owner account.",
      };
    }
    if (String(formData.get("setupToken") ?? "").trim() !== expected) {
      return { error: "That setup token is not right." };
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

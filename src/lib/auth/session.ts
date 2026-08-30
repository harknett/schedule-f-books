import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { getStore } from "@/lib/db";
import type { User } from "@/lib/db/types";

import { SESSION_COOKIE } from "./cookie";

export { SESSION_COOKIE };
const SESSION_DAYS = 30;

/** The cookie holds the raw token; only its SHA-256 is persisted. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function startSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  const store = getStore();
  store.deleteExpiredSessions();
  store.createSession(hashToken(token), userId, expires.toISOString().replace("T", " ").slice(0, 19));

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) getStore().deleteSession(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getStore().findSessionUser(hashToken(token)) ?? null;
}

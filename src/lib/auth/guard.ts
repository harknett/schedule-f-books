import "server-only";

import { redirect } from "next/navigation";

import type { User } from "@/lib/db/types";

import { currentUser } from "./session";

/**
 * Every page and action behind the app shell calls this. Server-side checks are
 * the real gate - middleware only handles the redirect for a nicer experience.
 */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

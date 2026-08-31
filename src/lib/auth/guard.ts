import "server-only";

import { redirect } from "next/navigation";

import type { User } from "@/lib/db/types";

import { currentUser } from "./session";

/**
 * The gate every page and action behind the app shell passes through.
 *
 * Two conditions, not one: signed in, and holding a password of their own. An
 * account still carrying a password somebody else set is held at
 * /change-password until it picks one.
 *
 * The check lives here rather than only in the layout so that a Server Action
 * cannot be posted around it - the layout guards the render, this guards the
 * work.
 */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

/**
 * Signed in, but without the must-change gate.
 *
 * Only for the change-password flow itself and for signing out - anything else
 * wants requireUser, or a held account could keep working around the hold.
 */
export async function requireSignedIn(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The same two conditions, for route handlers.
 *
 * Route handlers return a response rather than redirecting, so they cannot use
 * requireUser - but they must not be a way around it either. The export route
 * hands over every figure in the books and every receipt, so an account still
 * holding a password somebody else chose has no business calling it.
 *
 * Returns the user, or the response to send instead.
 */
export async function requireApiUser(): Promise<
  { user: User; response?: never } | { user?: never; response: Response }
> {
  const user = await currentUser();
  if (!user) {
    return { response: new Response("Unauthorized", { status: 401 }) };
  }
  if (user.mustChangePassword) {
    return {
      response: new Response(
        "Choose your own password before using this. Sign in and you will be prompted.",
        { status: 403 },
      ),
    };
  }
  return { user };
}

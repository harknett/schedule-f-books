import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Redirects signed-out visitors to /login before a page renders.
 *
 * This is a convenience, not the security boundary: proxy runs on the Edge
 * runtime and only sees that a cookie exists, not whether it is valid. Every
 * page, action, and route calls requireUser()/currentUser() server-side, which
 * is what actually enforces access.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname === "/register") return NextResponse.next();
  // The health probe has no cookie and never will; redirecting it to /login
  // would answer 307 and read as healthy to anything following redirects.
  if (pathname === "/api/health") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except Next internals, the manifest, and static assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
  ],
};

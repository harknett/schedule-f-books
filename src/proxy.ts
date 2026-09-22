import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Content Security Policy, with a per-request nonce.
 *
 * This cannot live in `next.config.ts`. Next streams each page's data to the
 * browser inside inline `<script>` tags, and a static `script-src 'self'`
 * blocks every one of them: the page still renders and the server logs
 * nothing, but React never hydrates (minified error #412) and every client
 * component goes inert — the receipt picker, the import preview, every form's
 * error message.
 *
 * Next parses this header while rendering and stamps the nonce onto its own
 * scripts, so they run and an injected one does not. `'strict-dynamic'` lets a
 * nonced script pull in the chunks it needs without naming each one.
 *
 * Styles keep `'unsafe-inline'` and deliberately take no nonce: browsers
 * ignore `'unsafe-inline'` once a nonce is present in a directive, which would
 * drop Next's inlined critical CSS and leave the books unstyled.
 *
 * Every page here is dynamically rendered, so every page can carry a nonce.
 * A statically prerendered page could not — it is built before any request
 * exists — which is why adding one would quietly break it.
 */
function contentSecurityPolicy(nonce: string): string {
  // React uses eval in development to rebuild server stacks in the browser.
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // 'self' serves stored receipts through /api/receipts; blob: is the
    // pre-upload preview; data: is the inline icon.
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Redirects signed-out visitors to /login before a page renders, and sets the
 * policy above on everything.
 *
 * This is a convenience, not the security boundary: proxy runs on the Edge
 * runtime and only sees that a cookie exists, not whether it is valid. Every
 * page, action, and route calls requireUser()/currentUser() server-side, which
 * is what actually enforces access.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  /** Pass the request through, carrying the nonce to the renderer. */
  const proceed = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  if (request.cookies.has(SESSION_COOKIE)) return proceed();
  if (pathname === "/login" || pathname === "/register") return proceed();
  // The health probe has no cookie and never will; redirecting it to /login
  // would answer 307 and read as healthy to anything following redirects.
  if (pathname === "/api/health") return proceed();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  const redirect = NextResponse.redirect(url);
  redirect.headers.set("Content-Security-Policy", csp);
  return redirect;
}

export const config = {
  matcher: [
    {
      // Everything except Next internals, the manifest, and static assets.
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
      // A prefetch is not a render: giving one a nonce would hand the cached
      // HTML a value that no longer matches by the time it is used.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

import type { NextConfig } from "next";

import { SERVER_ACTION_BODY_LIMIT_BYTES } from "./src/lib/receipt-limits";

/**
 * Response headers.
 *
 * This app is meant to sit behind a VPN rather than on the open internet, but
 * headers are the cheapest defence there is and "internal" is a description of
 * today's network, not a property of the code.
 *
 * `img-src` includes `blob:` deliberately: the receipt picker previews a photo
 * before upload with URL.createObjectURL, and a policy without it breaks that
 * silently — the form still submits, the thumbnail is just gone. That is
 * exactly the kind of failure a header change ships without anyone noticing.
 *
 * `'unsafe-inline'` for styles is Next's inlined critical CSS. Scripts get
 * `'self'` only, which is the half that matters.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
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

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],

  // Nothing gained by telling every visitor which framework to look up.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
          /*
            No `preload` here, unlike the public site. Preloading commits a
            hostname to HTTPS in every browser ahead of time and is painful to
            undo; for books, which may well be reached over a VPN on a name
            that changes, plain HSTS is the right amount of commitment.
          */
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // Financial records are never cached by anything in the middle.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
    ];
  },

  /**
   * Emit a self-contained server alongside the build.
   *
   * `.next/standalone/server.js` runs without node_modules, which is what the
   * systemd unit points at: the app directory can then be mounted read-only,
   * and unlike `next start` the standalone server honours HOSTNAME, so the
   * service can bind loopback from the unit file rather than a wrapper script.
   * `next start` still works for local use.
   */
  output: "standalone",

  /**
   * Keep the books out of the build.
   *
   * Output file tracing statically follows `fs` usage, and paths.ts names
   * `./data` as the fallback data directory. That was enough for the tracer to
   * copy the live books.db - real financial records - into
   * `.next/standalone/data/`, where deploying the build would carry them onto
   * the server as a stale, unread, unnoticed copy. Excluded for every route,
   * along with the source and tests the tracer also swept in.
   */
  outputFileTracingExcludes: {
    "/*": ["data/**/*", "test/**/*", "deploy/**/*", "scripts/**/*"],
  },

  experimental: {
    serverActions: {
      /**
       * Receipts are uploaded through a Server Action, so Next's body cap -
       * 1 MB by default - is the real limit on a receipt, whatever the app
       * says elsewhere. Derived from the receipt limits rather than written
       * out again, because the default silently rejected every phone photo
       * while the picker advertised 15 MB.
       */
      bodySizeLimit: SERVER_ACTION_BODY_LIMIT_BYTES,
    },
  },
};

export default nextConfig;

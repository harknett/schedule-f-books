import type { NextConfig } from "next";

import { SERVER_ACTION_BODY_LIMIT_BYTES } from "./src/lib/receipt-limits";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],

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

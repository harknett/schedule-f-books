import { defineConfig } from "vitest/config";

const src = new URL("./src", import.meta.url).pathname;

export default defineConfig({
  resolve: {
    alias: {
      "@": src,
      // `server-only` is a marker package whose default entry exists purely to
      // throw when it lands in a client bundle. Tests run server-side, so point
      // it at the package's own no-op build - the same file a Server Component
      // gets through the "react-server" condition.
      // Resolved as a file path: the package's exports field only exposes ".".
      "server-only": new URL("./node_modules/server-only/empty.js", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});

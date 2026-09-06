import "server-only";

import { Store } from "./store";
import { dbFile, ensureDataDir } from "./paths";

export { dataDir, dbFile, receiptsDir } from "./paths";

// Next re-evaluates modules on hot reload; keep one connection per process.
const globalForStore = globalThis as unknown as {
  __store?: Store;
  __storeClass?: unknown;
  __shutdownHooked?: boolean;
};

/**
 * Close the database when the service is asked to stop.
 *
 * `systemctl stop` and `systemctl restart` send SIGTERM. SQLite in WAL mode
 * recovers from an abrupt exit, so this is not about corruption - it is about
 * checkpointing the WAL back into the database file, so that a backup taken
 * while the service is down is a single complete file rather than one that
 * needs its sidecars to be whole.
 *
 * Registered once per process, guarded on the same global as the connection:
 * a hot reload re-evaluates this module, and adding a listener each time would
 * trip Node's max-listeners warning after a dozen edits.
 */
function hookShutdown(): void {
  if (globalForStore.__shutdownHooked) return;
  globalForStore.__shutdownHooked = true;

  const close = (signal: NodeJS.Signals) => () => {
    try {
      globalForStore.__store?.close();
    } catch {
      // Already closed, or never opened. Nothing useful to do while exiting.
    }
    // Re-raise with the default handler so the exit status tells systemd the
    // truth about how we stopped.
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  };

  process.once("SIGTERM", close("SIGTERM"));
  process.once("SIGINT", close("SIGINT"));
}

export function getStore(): Store {
  // The cached instance is only good while it came from the class we are
  // holding now. A hot reload of store.ts produces a new class object, and an
  // instance built from the old one keeps the old prototype - so a method
  // added in the edit you just saved would be missing, which reads as a
  // baffling "not a function" until the server is restarted. Comparing the
  // class identity makes the reload rebuild the connection instead.
  if (globalForStore.__store && globalForStore.__storeClass === Store) {
    return globalForStore.__store;
  }

  globalForStore.__store?.close();
  ensureDataDir();
  globalForStore.__store = new Store(dbFile());
  globalForStore.__storeClass = Store;
  hookShutdown();
  return globalForStore.__store;
}

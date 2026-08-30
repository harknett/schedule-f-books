import "server-only";

import fs from "node:fs";
import path from "node:path";

import { Store } from "./store";

/**
 * Where the books live. Defaults to ./data so a self-hosted install is one
 * directory to back up; override with DATA_DIR when deploying.
 */
export function dataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  return configured && configured !== ""
    ? path.resolve(configured)
    : path.join(process.cwd(), "data");
}

export function receiptsDir(): string {
  return path.join(dataDir(), "receipts");
}

export function dbFile(): string {
  return path.join(dataDir(), "books.db");
}

// Next re-evaluates modules on hot reload; keep one connection per process.
const globalForStore = globalThis as unknown as {
  __store?: Store;
  __storeClass?: unknown;
};

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
  fs.mkdirSync(receiptsDir(), { recursive: true });
  globalForStore.__store = new Store(dbFile());
  globalForStore.__storeClass = Store;
  return globalForStore.__store;
}

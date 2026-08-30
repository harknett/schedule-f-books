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
const globalForStore = globalThis as unknown as { __store?: Store };

export function getStore(): Store {
  if (!globalForStore.__store) {
    fs.mkdirSync(receiptsDir(), { recursive: true });
    globalForStore.__store = new Store(dbFile());
  }
  return globalForStore.__store;
}

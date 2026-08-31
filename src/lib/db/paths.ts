import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where the books live.
 *
 * Deliberately free of the server-only guard so the maintenance CLI can find
 * the same database the app uses. It resolves paths and touches nothing else.
 *
 * Priority:
 *   1. $DATA_DIR
 *   2. ./data, beside the app
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

/** Create the data directory if it is not there yet, and return the db path. */
export function ensureDataDir(): string {
  fs.mkdirSync(receiptsDir(), { recursive: true });
  return dbFile();
}

/** Only used to describe the default in CLI help text. */
export function homeRelative(target: string): string {
  const home = os.homedir();
  return target.startsWith(home) ? `~${target.slice(home.length)}` : target;
}

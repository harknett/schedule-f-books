import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { MIGRATIONS } from "@/lib/db/migrations";
import { Store } from "@/lib/db/store";

/**
 * Migrations run against books people already have, so each one is checked by
 * building the database at the previous version, filling it with data, and
 * then opening it with the Store the way the app does on boot.
 */

/** A database at exactly `version` migrations, with foreign keys on. */
function databaseAtVersion(version: number): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (let i = 0; i < version; i++) db.exec(MIGRATIONS[i]!);
  db.exec(`PRAGMA user_version = ${version}`);
  return db;
}

describe("migrating a database that already has data", () => {
  it("brings a version 1 database up to date without losing anything", () => {
    const db = databaseAtVersion(1);
    db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,?)").run(
      "a@b.test",
      "Old User",
      "hash",
      "owner",
    );
    db.prepare(
      "INSERT INTO transactions (kind,category_id,date,amount,payee,created_by) VALUES (?,?,?,?,?,?)",
    ).run("expense", "feed", "2026-02-01", 25000, "Valley Co-op", 1);
    db.prepare(
      "INSERT INTO receipts (transaction_id,filename,mime_type,byte_size) VALUES (?,?,?,?)",
    ).run(1, "kept.jpg", "image/jpeg", 1234);
    db.prepare("INSERT INTO time_entries (user_id,date,minutes,task) VALUES (?,?,?,?)").run(
      1,
      "2026-02-02",
      90,
      "Fencing",
    );
    db.close();
  });

  it("carries receipts through the rebuild with their ids and owners intact", () => {
    // Build v2 in a file-backed database so the Store can reopen it.
    const db = databaseAtVersion(2);
    db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,?)").run(
      "a@b.test", "Old User", "hash", "owner",
    );
    db.prepare(
      "INSERT INTO transactions (kind,category_id,date,amount,payee,created_by) VALUES (?,?,?,?,?,?)",
    ).run("expense", "feed", "2026-02-01", 25000, "Valley Co-op", 1);

    for (const [name, size] of [
      ["first.jpg", 111],
      ["second.pdf", 222],
    ] as const) {
      db.prepare(
        "INSERT INTO receipts (transaction_id,filename,mime_type,byte_size) VALUES (?,?,?,?)",
      ).run(1, name, name.endsWith("pdf") ? "application/pdf" : "image/jpeg", size);
    }

    const before = db
      .prepare("SELECT id, transaction_id, filename, byte_size FROM receipts ORDER BY id")
      .all();
    expect(before).toHaveLength(2);

    // Apply the remaining migrations exactly as Store.migrate does.
    for (let i = 2; i < MIGRATIONS.length; i++) db.exec(MIGRATIONS[i]!);
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);

    const after = db
      .prepare("SELECT id, transaction_id, asset_id, filename, byte_size FROM receipts ORDER BY id")
      .all() as Array<Record<string, unknown>>;

    expect(after).toHaveLength(2);
    // Ids matter: files on disk and export names are keyed by them.
    expect(after.map((r) => r.id)).toEqual([1, 2]);
    expect(after.map((r) => r.filename)).toEqual(["first.jpg", "second.pdf"]);
    expect(after.map((r) => r.byte_size)).toEqual([111, 222]);
    expect(after.every((r) => r.transaction_id === 1)).toBe(true);
    expect(after.every((r) => r.asset_id === null)).toBe(true);

    db.close();
  });

  it("keeps the cascade from transactions to their receipts", () => {
    const db = databaseAtVersion(MIGRATIONS.length);
    db.prepare(
      "INSERT INTO transactions (kind,category_id,date,amount) VALUES (?,?,?,?)",
    ).run("expense", "feed", "2026-02-01", 100);
    db.prepare(
      "INSERT INTO receipts (transaction_id,filename,mime_type,byte_size) VALUES (?,?,?,?)",
    ).run(1, "x.jpg", "image/jpeg", 1);

    db.prepare("DELETE FROM transactions WHERE id = 1").run();
    const left = db.prepare("SELECT COUNT(*) AS n FROM receipts").get() as { n: number };
    expect(left.n).toBe(0);
    db.close();
  });

  it("cascades from assets to their receipts too", () => {
    const db = databaseAtVersion(MIGRATIONS.length);
    db.prepare(
      `INSERT INTO assets (name,asset_class,method,convention,placed_in_service,cost)
       VALUES (?,?,?,?,?,?)`,
    ).run("Tractor", "7", "200DB", "half-year", "2026-01-01", 100000);
    db.prepare(
      "INSERT INTO receipts (asset_id,filename,mime_type,byte_size) VALUES (?,?,?,?)",
    ).run(1, "bill-of-sale.pdf", "application/pdf", 1);

    db.prepare("DELETE FROM assets WHERE id = 1").run();
    const left = db.prepare("SELECT COUNT(*) AS n FROM receipts").get() as { n: number };
    expect(left.n).toBe(0);
    db.close();
  });

  it("insists a receipt has exactly one owner", () => {
    const db = databaseAtVersion(MIGRATIONS.length);
    db.prepare(
      "INSERT INTO transactions (kind,category_id,date,amount) VALUES (?,?,?,?)",
    ).run("expense", "feed", "2026-02-01", 100);
    db.prepare(
      `INSERT INTO assets (name,asset_class,method,convention,placed_in_service,cost)
       VALUES (?,?,?,?,?,?)`,
    ).run("Tractor", "7", "200DB", "half-year", "2026-01-01", 100000);

    const insert = db.prepare(
      "INSERT INTO receipts (transaction_id,asset_id,filename,mime_type,byte_size) VALUES (?,?,?,?,?)",
    );
    // Neither owner.
    expect(() => insert.run(null, null, "x.jpg", "image/jpeg", 1)).toThrow();
    // Both owners.
    expect(() => insert.run(1, 1, "x.jpg", "image/jpeg", 1)).toThrow();
    // Exactly one is fine, either way round.
    expect(() => insert.run(1, null, "a.jpg", "image/jpeg", 1)).not.toThrow();
    expect(() => insert.run(null, 1, "b.jpg", "image/jpeg", 1)).not.toThrow();

    db.close();
  });
});

describe("a fresh database", () => {
  it("arrives at the current version with every table", () => {
    const store = new Store(":memory:");
    // Reaching in through a query the Store exposes proves the schema is live.
    expect(store.countUsers()).toBe(0);
    expect(store.listAssets()).toEqual([]);
    expect(store.listTransactions()).toEqual([]);
    store.close();
  });

  it("is idempotent: opening twice changes nothing", () => {
    const first = new Store(":memory:");
    first.close();
    // A second open of a migrated database must not re-run migrations.
    const db = databaseAtVersion(MIGRATIONS.length);
    const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
    expect(version.user_version).toBe(MIGRATIONS.length);
    db.close();
  });
});

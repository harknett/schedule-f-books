import { DatabaseSync } from "node:sqlite";

import { beforeEach, describe, expect, it } from "vitest";

import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { MIGRATIONS } from "@/lib/db/migrations";
import { Store } from "@/lib/db/store";

let store: Store;

beforeEach(() => {
  store = new Store(":memory:");
});

async function makeUser(overrides: { mustChangePassword?: boolean } = {}) {
  return store.createUser({
    email: "member@farm.test",
    name: "Pat Fields",
    passwordHash: await hashPassword("original-password"),
    role: "member",
    ...overrides,
  });
}

describe("generateTemporaryPassword", () => {
  it("is long enough to satisfy the policy it will be checked against", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });

  it("avoids the characters people mishear or mistype", () => {
    // No i/l/1 or o/0, because these get read aloud across a yard.
    for (let i = 0; i < 200; i++) {
      expect(generateTemporaryPassword()).not.toMatch(/[il1o0]/);
    }
  });

  it("is grouped for reading out, and otherwise plain", () => {
    expect(generateTemporaryPassword()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, generateTemporaryPassword));
    expect(seen.size).toBe(500);
  });

  it("produces something the hasher accepts and can verify", async () => {
    const temporary = generateTemporaryPassword();
    const hash = await hashPassword(temporary);
    expect(await verifyPassword(temporary, hash)).toBe(true);
    expect(await verifyPassword(generateTemporaryPassword(), hash)).toBe(false);
  });
});

describe("the must-change flag", () => {
  it("is off for an account that chose its own password", async () => {
    const user = await makeUser();
    expect(user.mustChangePassword).toBe(false);
  });

  it("is on for an account somebody else set up", async () => {
    const user = await makeUser({ mustChangePassword: true });
    expect(user.mustChangePassword).toBe(true);
    expect(store.getUser(user.id)!.mustChangePassword).toBe(true);
  });

  it("comes off when the holder chooses their own", async () => {
    const user = await makeUser({ mustChangePassword: true });
    store.setPassword(user.id, await hashPassword("my-own-password"), false);
    expect(store.getUser(user.id)!.mustChangePassword).toBe(false);
  });

  it("goes back on when an owner resets it", async () => {
    const user = await makeUser();
    store.setPassword(user.id, await hashPassword("temp-from-owner"), true);
    expect(store.getUser(user.id)!.mustChangePassword).toBe(true);
  });

  it("defaults to off, so setPassword cannot lock someone out by omission", async () => {
    const user = await makeUser({ mustChangePassword: true });
    store.setPassword(user.id, await hashPassword("chosen-by-them"));
    expect(store.getUser(user.id)!.mustChangePassword).toBe(false);
  });

  it("survives a lookup by email, which is what sign-in uses", async () => {
    await makeUser({ mustChangePassword: true });
    const found = store.findUserByEmail("member@farm.test")!;
    expect(found.mustChangePassword).toBe(true);
  });
});

describe("resetting a password", () => {
  it("replaces the old one, which stops working", async () => {
    const user = await makeUser();
    const before = store.findUserByEmail(user.email)!;
    expect(await verifyPassword("original-password", before.passwordHash)).toBe(true);

    const temporary = generateTemporaryPassword();
    store.setPassword(user.id, await hashPassword(temporary), true);

    const after = store.findUserByEmail(user.email)!;
    expect(await verifyPassword("original-password", after.passwordHash)).toBe(false);
    expect(await verifyPassword(temporary, after.passwordHash)).toBe(true);
  });

  it("signs that account out everywhere, and leaves other accounts alone", async () => {
    const target = await makeUser();
    const other = store.createUser({
      email: "other@farm.test",
      name: "Other",
      passwordHash: "x",
      role: "owner",
    });

    store.createSession("target-a", target.id, "2999-01-01 00:00:00");
    store.createSession("target-b", target.id, "2999-01-01 00:00:00");
    store.createSession("other-session", other.id, "2999-01-01 00:00:00");

    store.deleteUserSessions(target.id);

    expect(store.findSessionUser("target-a")).toBeUndefined();
    expect(store.findSessionUser("target-b")).toBeUndefined();
    // Somebody else's reset must not sign the owner out.
    expect(store.findSessionUser("other-session")?.id).toBe(other.id);
  });

  it("never keeps the temporary password in the clear", async () => {
    const user = await makeUser();
    const temporary = generateTemporaryPassword();
    store.setPassword(user.id, await hashPassword(temporary), true);

    // Scan the whole users row for the plaintext.
    const db = new DatabaseSync(":memory:");
    db.close();
    const stored = JSON.stringify(store.findUserByEmail(user.email));
    expect(stored).not.toContain(temporary);
    expect(stored).toContain("scrypt$");
  });
});

describe("migrating existing accounts", () => {
  function databaseAtVersion(version: number): DatabaseSync {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (let i = 0; i < version; i++) db.exec(MIGRATIONS[i]!);
    db.exec(`PRAGMA user_version = ${version}`);
    return db;
  }

  it("leaves people who already chose a password free to carry on", () => {
    // Everything up to but not including the must-change migration.
    const db = databaseAtVersion(MIGRATIONS.length - 1);
    db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,?)").run(
      "existing@farm.test",
      "Existing Owner",
      "scrypt$16384$8$1$abc$def",
      "owner",
    );

    db.exec(MIGRATIONS[MIGRATIONS.length - 1]!);

    const user = db.prepare("SELECT * FROM users WHERE id = 1").get() as Record<string, unknown>;
    // Nobody is locked out by the upgrade itself.
    expect(user.must_change_password).toBe(0);
    expect(user.password_hash).toBe("scrypt$16384$8$1$abc$def");
    db.close();
  });

  it("only allows the two states it means", () => {
    const db = databaseAtVersion(MIGRATIONS.length);
    const insert = db.prepare(
      "INSERT INTO users (email,name,password_hash,role,must_change_password) VALUES (?,?,?,?,?)",
    );
    expect(() => insert.run("a@x.test", "A", "h", "member", 2)).toThrow();
    expect(() => insert.run("b@x.test", "B", "h", "member", -1)).toThrow();
    expect(() => insert.run("c@x.test", "C", "h", "member", 1)).not.toThrow();
    expect(() => insert.run("d@x.test", "D", "h", "member", 0)).not.toThrow();
    db.close();
  });
});

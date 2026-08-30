import { describe, expect, it } from "vitest";

import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently each time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("stores its own parameters, so cost can change later", async () => {
    const hash = await hashPassword("whatever");
    expect(hash.split("$").slice(0, 4)).toEqual(["scrypt", "16384", "8", "1"]);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    for (const bad of ["", "not-a-hash", "scrypt$1$2$3", "bcrypt$1$2$3$4$5"]) {
      expect(await verifyPassword("x", bad), `expected "${bad}" to fail closed`).toBe(false);
    }
  });

  it("treats unicode-equivalent passwords as equal", async () => {
    // "é" composed vs. decomposed - a phone keyboard may send either.
    const hash = await hashPassword("café password");
    expect(await verifyPassword("café password", hash)).toBe(true);
  });
});

describe("validatePassword", () => {
  it("requires a reasonable length", () => {
    expect(() => validatePassword("short")).toThrow(/at least/);
    expect(() => validatePassword("x".repeat(2000))).toThrow(/too long/);
    expect(() => validatePassword("long enough to pass")).not.toThrow();
  });
});

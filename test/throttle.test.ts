import { beforeEach, describe, expect, it } from "vitest";

import { Store } from "@/lib/db/store";
import { hashPassword, verifyAgainstDecoy, verifyPassword } from "@/lib/auth/password";

let store: Store;

beforeEach(() => {
  store = new Store(":memory:");
});

describe("login throttling", () => {
  it("counts failures separately by address and by account", () => {
    // The two limits hold different attacks: one address guessing many
    // passwords, and many addresses each guessing a little at one account.
    store.recordLoginFailure("1.2.3.4", "a@example.com");
    store.recordLoginFailure("1.2.3.4", "b@example.com");
    store.recordLoginFailure("5.6.7.8", "a@example.com");

    expect(store.loginFailuresByIp("1.2.3.4", 15)).toBe(2);
    expect(store.loginFailuresByEmail("a@example.com", 15)).toBe(2);
    expect(store.loginFailuresByIp("9.9.9.9", 15)).toBe(0);
  });

  it("matches an account case-insensitively", () => {
    // Otherwise the per-account limit is walked around by varying capitals.
    store.recordLoginFailure("1.2.3.4", "Owner@Farm.COM");
    expect(store.loginFailuresByEmail("owner@farm.com", 15)).toBe(1);
    expect(store.loginFailuresByEmail("OWNER@FARM.COM", 15)).toBe(1);
  });

  it("only counts failures inside the window", () => {
    store.recordLoginFailure("1.2.3.4", "a@example.com");
    expect(store.loginFailuresByIp("1.2.3.4", 15)).toBe(1);
    // A zero-minute window excludes everything already recorded.
    expect(store.loginFailuresByIp("1.2.3.4", 0)).toBe(0);
  });

  it("clears the slate on a success, by address and by account", () => {
    // A fumbled password should not be held against you once you get in.
    store.recordLoginFailure("1.2.3.4", "a@example.com");
    store.recordLoginFailure("5.6.7.8", "a@example.com");
    store.recordLoginFailure("1.2.3.4", "other@example.com");

    store.clearLoginFailures("1.2.3.4", "a@example.com");

    expect(store.loginFailuresByIp("1.2.3.4", 15)).toBe(0);
    expect(store.loginFailuresByEmail("a@example.com", 15)).toBe(0);
  });

  it("prunes only what is older than a day", () => {
    store.recordLoginFailure("1.2.3.4", "a@example.com");
    store.pruneLoginAttempts();
    expect(store.loginFailuresByIp("1.2.3.4", 15)).toBe(1);
  });
});

describe("decoy verification", () => {
  it("always fails", async () => {
    await expect(verifyAgainstDecoy("anything at all")).resolves.toBe(false);
  });

  it("costs about what a real verification costs", async () => {
    /*
      The point of the decoy: sign-in used to skip scrypt when the email was
      unknown, so a missing account answered far faster than a wrong password.
      The error text was identical; the clock told you which addresses had
      accounts.

      Timing on a shared machine is noisy, so this asserts the property that
      matters — the decoy is within the same order of magnitude as a real
      verification — rather than a tight ratio that would flake.
    */
    const hash = await hashPassword("a real password here");

    const realStart = performance.now();
    await verifyPassword("wrong guess", hash);
    const real = performance.now() - realStart;

    const decoyStart = performance.now();
    await verifyAgainstDecoy("wrong guess");
    const decoy = performance.now() - decoyStart;

    expect(decoy).toBeGreaterThan(real / 4);
    expect(decoy).toBeLessThan(real * 4);
  });
});

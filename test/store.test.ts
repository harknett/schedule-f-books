import { beforeEach, describe, expect, it } from "vitest";

import { Store } from "@/lib/db/store";
import { buildReport } from "@/lib/report";

let store: Store;

beforeEach(() => {
  store = new Store(":memory:");
});

function makeUser(email = "farmer@example.com") {
  return store.createUser({ email, name: "Test Farmer", passwordHash: "x", role: "owner" });
}

describe("users", () => {
  it("counts users, which gates bootstrap registration", () => {
    expect(store.countUsers()).toBe(0);
    makeUser();
    expect(store.countUsers()).toBe(1);
  });

  it("looks up by email case-insensitively", () => {
    makeUser("Farmer@Example.com");
    expect(store.findUserByEmail("farmer@example.com")?.name).toBe("Test Farmer");
  });
});

describe("sessions", () => {
  it("resolves a live session and ignores an expired one", () => {
    const user = makeUser();
    store.createSession("live-hash", user.id, "2999-01-01 00:00:00");
    store.createSession("dead-hash", user.id, "2000-01-01 00:00:00");

    expect(store.findSessionUser("live-hash")?.id).toBe(user.id);
    expect(store.findSessionUser("dead-hash")).toBeUndefined();
  });

  it("clears every session for a user on password change", () => {
    const user = makeUser();
    store.createSession("a", user.id, "2999-01-01 00:00:00");
    store.createSession("b", user.id, "2999-01-01 00:00:00");

    store.deleteUserSessions(user.id);
    expect(store.findSessionUser("a")).toBeUndefined();
    expect(store.findSessionUser("b")).toBeUndefined();
  });
});

describe("transactions", () => {
  it("records an expense with its author", () => {
    const user = makeUser();
    const created = store.createTransaction({
      kind: "expense",
      categoryId: "feed",
      date: "2026-03-14",
      amount: 4525,
      payee: "Valley Co-op",
      createdBy: user.id,
    });

    expect(created.amount).toBe(4525);
    expect(created.createdByName).toBe("Test Farmer");
    expect(created.receiptCount).toBe(0);
  });

  it("filters by kind and year", () => {
    store.createTransaction({ kind: "expense", categoryId: "feed", date: "2026-01-05", amount: 100 });
    store.createTransaction({ kind: "income", categoryId: "raised_sales", date: "2026-06-01", amount: 900 });
    store.createTransaction({ kind: "expense", categoryId: "fuel", date: "2025-11-02", amount: 300 });

    expect(store.listTransactions({ year: 2026 })).toHaveLength(2);
    expect(store.listTransactions({ year: 2026, kind: "expense" })).toHaveLength(1);
    expect(store.listTransactions({ year: 2025 })).toHaveLength(1);
  });

  it("returns newest first and paginates", () => {
    for (const day of ["01", "02", "03", "04", "05"]) {
      store.createTransaction({
        kind: "expense",
        categoryId: "supplies",
        date: `2026-04-${day}`,
        amount: 100,
      });
    }
    const firstPage = store.listTransactions({ limit: 2 });
    expect(firstPage[0]!.date).toBe("2026-04-05");

    const secondPage = store.listTransactions({ limit: 2, offset: 2 });
    expect(secondPage[0]!.date).toBe("2026-04-03");
  });

  it("counts transactions independently of the page size", () => {
    for (let i = 0; i < 7; i++) {
      store.createTransaction({
        kind: "expense",
        categoryId: "supplies",
        date: "2026-04-01",
        amount: 100,
      });
    }
    expect(store.countTransactions()).toBe(7);
    expect(store.listTransactions({ limit: 3 })).toHaveLength(3);
  });

  it("lists years with activity, newest first", () => {
    store.createTransaction({ kind: "expense", categoryId: "feed", date: "2024-01-01", amount: 1 });
    store.createTransaction({ kind: "expense", categoryId: "feed", date: "2026-01-01", amount: 1 });
    expect(store.transactionYears()).toEqual([2026, 2024]);
  });

  it("updates in place", () => {
    const created = store.createTransaction({
      kind: "expense",
      categoryId: "feed",
      date: "2026-03-14",
      amount: 100,
    });
    const updated = store.updateTransaction(created.id, {
      kind: "expense",
      categoryId: "fuel",
      date: "2026-03-15",
      amount: 250,
    });
    expect(updated?.categoryId).toBe("fuel");
    expect(updated?.amount).toBe(250);
  });
});

describe("category totals feed the report", () => {
  it("groups a year's transactions into Schedule F lines", () => {
    store.createTransaction({ kind: "income", categoryId: "raised_sales", date: "2026-05-01", amount: 80_000 });
    store.createTransaction({ kind: "income", categoryId: "raised_sales", date: "2026-09-01", amount: 45_000 });
    store.createTransaction({ kind: "expense", categoryId: "feed", date: "2026-02-01", amount: 30_000 });
    store.createTransaction({ kind: "expense", categoryId: "fuel", date: "2026-07-01", amount: 12_500 });
    // Prior year - must not leak into 2026.
    store.createTransaction({ kind: "expense", categoryId: "feed", date: "2025-12-31", amount: 99_999 });

    const report = buildReport(2026, store.categoryTotals(2026));
    expect(report.grossIncome).toBe(125_000);
    expect(report.totalExpenses).toBe(42_500);
    expect(report.netProfit).toBe(82_500);
    expect(report.transactionCount).toBe(4);
  });
});

describe("receipts", () => {
  it("attaches to a transaction and reports the count", () => {
    const tx = store.createTransaction({
      kind: "expense",
      categoryId: "supplies",
      date: "2026-03-01",
      amount: 100,
    });
    store.createReceipt({
      transactionId: tx.id,
      filename: "a.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
    });

    expect(store.listReceipts(tx.id)).toHaveLength(1);
    expect(store.getTransaction(tx.id)?.receiptCount).toBe(1);
  });

  it("hands back filenames to unlink when a transaction is deleted", () => {
    const tx = store.createTransaction({
      kind: "expense",
      categoryId: "supplies",
      date: "2026-03-01",
      amount: 100,
    });
    store.createReceipt({ transactionId: tx.id, filename: "a.jpg", mimeType: "image/jpeg", byteSize: 1 });
    store.createReceipt({ transactionId: tx.id, filename: "b.jpg", mimeType: "image/jpeg", byteSize: 1 });

    expect(store.deleteTransaction(tx.id).sort()).toEqual(["a.jpg", "b.jpg"]);
    expect(store.getTransaction(tx.id)).toBeUndefined();
    // The cascade removed the metadata rows too.
    expect(store.listReceipts(tx.id)).toHaveLength(0);
  });
});

describe("time entries", () => {
  it("totals minutes for the year", () => {
    const user = makeUser();
    store.createTimeEntry({ userId: user.id, date: "2026-03-01", minutes: 150, task: "Fencing" });
    store.createTimeEntry({ userId: user.id, date: "2026-03-02", minutes: 90, task: "Fencing" });
    store.createTimeEntry({ userId: user.id, date: "2025-03-02", minutes: 600, task: "Old year" });

    expect(store.totalMinutes(user.id, 2026)).toBe(240);
    expect(store.totalMinutes(user.id)).toBe(840);
  });

  it("groups minutes by task, largest first", () => {
    const user = makeUser();
    store.createTimeEntry({ userId: user.id, date: "2026-03-01", minutes: 60, task: "Fencing" });
    store.createTimeEntry({ userId: user.id, date: "2026-03-02", minutes: 30, task: "Fencing" });
    store.createTimeEntry({ userId: user.id, date: "2026-03-03", minutes: 120, task: "Harvest" });

    expect(store.minutesByTask(user.id, 2026)).toEqual([
      { task: "Harvest", minutes: 120 },
      { task: "Fencing", minutes: 90 },
    ]);
  });

  it("only lets the owner of an entry delete it", () => {
    const mine = makeUser("me@example.com");
    const theirs = store.createUser({
      email: "them@example.com",
      name: "Someone Else",
      passwordHash: "x",
      role: "member",
    });
    const entry = store.createTimeEntry({
      userId: mine.id,
      date: "2026-03-01",
      minutes: 60,
      task: "Chores",
    });

    expect(store.deleteTimeEntry(entry.id, theirs.id)).toBe(false);
    expect(store.getTimeEntry(entry.id)).toBeDefined();

    expect(store.deleteTimeEntry(entry.id, mine.id)).toBe(true);
    expect(store.getTimeEntry(entry.id)).toBeUndefined();
  });

  it("keeps each person's hours separate", () => {
    const a = makeUser("a@example.com");
    const b = store.createUser({ email: "b@example.com", name: "B", passwordHash: "x", role: "member" });
    store.createTimeEntry({ userId: a.id, date: "2026-03-01", minutes: 60, task: "Chores" });
    store.createTimeEntry({ userId: b.id, date: "2026-03-01", minutes: 120, task: "Chores" });

    expect(store.totalMinutes(a.id, 2026)).toBe(60);
    expect(store.listTimeEntries(b.id, { year: 2026 })).toHaveLength(1);
  });
});

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv";
import { Store } from "@/lib/db/store";
import type { Receipt, TransactionWithMeta } from "@/lib/db/types";
import {
  buildExportEntries,
  exportFileName,
  receiptArchiveName,
  yearsInRange,
  type ExportInput,
} from "@/lib/export";
import { createZip } from "@/lib/zip";

/**
 * Builds a real export from a real database and opens the result with the
 * system unzip, so the assertions are about what an accountant would actually
 * find in the archive.
 */

let store: Store;
let userId: number;
let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-test-"));
  store = new Store(":memory:");
  userId = store.createUser({
    email: "owner@farm.test",
    name: "Sam Rivers",
    passwordHash: "x",
    role: "owner",
  }).id;

  // A year of activity across both parts of the form.
  store.createTransaction({
    kind: "income", categoryId: "raised_sales", date: "2026-06-15",
    amount: 48250, payee: "Saturday market", createdBy: userId,
  });
  store.createTransaction({
    kind: "income", categoryId: "custom_hire_income", date: "2026-08-02",
    amount: 35000, payee: "Neighbour", createdBy: userId,
  });
  store.createTransaction({
    kind: "expense", categoryId: "feed", date: "2026-02-11",
    amount: 24575, payee: "Valley Co-op, Inc", description: "Hay", createdBy: userId,
  });
  store.createTransaction({
    kind: "expense", categoryId: "fuel", date: "2026-04-22",
    amount: 18840, payee: "Fuel Depot", createdBy: userId,
  });
  // Prior year, to prove the range filter.
  store.createTransaction({
    kind: "expense", categoryId: "feed", date: "2025-12-20",
    amount: 99999, payee: "Last year", createdBy: userId,
  });

  store.createAsset({
    name: "John Deere 5075E", assetClassId: "7", method: "200DB", convention: "half-year",
    placedInService: "2026-04-10", cost: 4_500_000, section179: 1_000_000,
    bonusPercent: 0, businessUsePercent: 100, createdBy: userId,
  });

  store.createTimeEntry({ userId, date: "2026-08-01", minutes: 150, task: "Fencing" });
  store.createTimeEntry({ userId, date: "2026-08-02", minutes: 480, task: "Harvest" });
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function buildInput(
  from: string,
  to: string,
  overrides: Partial<ExportInput> = {},
): ExportInput {
  const transactions: TransactionWithMeta[] = store.listTransactions({ from, to });
  const receiptsByTransaction = new Map<number, Receipt[]>(
    transactions.map((t) => [t.id, store.listReceipts(t.id)]),
  );
  return {
    from,
    to,
    generatedAt: new Date(2026, 11, 31, 12, 0, 0),
    generatedBy: "Sam Rivers",
    transactions,
    receiptsByTransaction,
    assets: store.listAssets(),
    timeEntries: store.listTimeEntriesInRange(from, to, userId),
    receiptFiles: [],
    includeReceipts: true,
    includeArchiveJson: true,
    ...overrides,
  };
}

/** Build, zip, and extract with the real tool. */
function exportAndExtract(input: ExportInput): Map<string, string> {
  const archive = path.join(workDir, "export.zip");
  fs.writeFileSync(archive, createZip(buildExportEntries(input)));
  execFileSync("unzip", ["-t", archive], { stdio: "pipe" });

  const out = path.join(workDir, "out");
  execFileSync("unzip", ["-q", "-o", archive, "-d", out]);

  const files = new Map<string, string>();
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, name);
      else files.set(name, fs.readFileSync(full, "utf8"));
    }
  };
  walk(out, "");
  return files;
}

describe("yearsInRange", () => {
  it("covers every tax year the range touches", () => {
    expect(yearsInRange("2026-01-01", "2026-12-31")).toEqual([2026]);
    expect(yearsInRange("2024-06-01", "2026-03-01")).toEqual([2024, 2025, 2026]);
  });
});

describe("the package", () => {
  it("extracts cleanly and holds what a preparer needs", () => {
    const files = exportAndExtract(buildInput("2026-01-01", "2026-12-31"));

    expect([...files.keys()].sort()).toEqual([
      "README.txt",
      "archive.json",
      "assets.csv",
      "depreciation-2026.csv",
      "hours.csv",
      "schedule-f-2026.csv",
      "transactions.csv",
    ]);
  });

  it("writes one Schedule F per tax year in the range", () => {
    const files = exportAndExtract(buildInput("2025-01-01", "2026-12-31"));
    expect(files.has("schedule-f-2025.csv")).toBe(true);
    expect(files.has("schedule-f-2026.csv")).toBe(true);
    expect(files.has("depreciation-2025.csv")).toBe(true);
  });

  it("keeps the range: last year's entry is not in this year's export", () => {
    const files = exportAndExtract(buildInput("2026-01-01", "2026-12-31"));
    expect(files.get("transactions.csv")).not.toContain("Last year");
    expect(files.get("transactions.csv")).toContain("Valley Co-op, Inc");
  });
});

describe("schedule-f-<year>.csv", () => {
  it("totals income, expenses, and the net, with depreciation on line 14", () => {
    const files = exportAndExtract(buildInput("2026-01-01", "2026-12-31"));
    const rows = parseCsv(files.get("schedule-f-2026.csv")!);
    const find = (line: string) =>
      rows.find((r) => r[1] === line && !r[0]!.startsWith("Section"));

    // Income: 482.50 + 350.00
    expect(find("9")?.[3]).toBe("832.50");

    // Line 14: 10,000 of section 179 plus first-year MACRS on the 35,000 left.
    const macrsYearOne = Math.round(3_500_000 * (2 / 7) * 0.5) / 100;
    const depreciation = 10_000 + macrsYearOne;
    expect(find("14")?.[3]).toBe(depreciation.toFixed(2));

    // Expenses: 245.75 + 188.40 + depreciation
    const totalExpenses = 245.75 + 188.4 + depreciation;
    expect(find("33")?.[3]).toBe(totalExpenses.toFixed(2));
    expect(find("34")?.[3]).toBe((832.5 - totalExpenses).toFixed(2));
  });
});

describe("transactions.csv", () => {
  it("carries the Schedule F line on every row", () => {
    const files = exportAndExtract(buildInput("2026-01-01", "2026-12-31"));
    const rows = parseCsv(files.get("transactions.csv")!);
    const header = rows[0]!;

    expect(header).toContain("schedule_f_line");
    expect(header).toContain("amount");

    const lineColumn = header.indexOf("schedule_f_line");
    const payeeColumn = header.indexOf("payee");
    const amountColumn = header.indexOf("amount");

    const feed = rows.find((r) => r[payeeColumn] === "Valley Co-op, Inc")!;
    expect(feed[lineColumn]).toBe("16");
    expect(feed[amountColumn]).toBe("245.75"); // dollars, not cents

    // Every data row names a line.
    for (const row of rows.slice(1)) expect(row[lineColumn]).not.toBe("");
  });
});

describe("depreciation-<year>.csv", () => {
  it("shows the working for Form 4562 and totals it", () => {
    const files = exportAndExtract(buildInput("2026-01-01", "2026-12-31"));
    const rows = parseCsv(files.get("depreciation-2026.csv")!);

    const asset = rows.find((r) => r[1] === "John Deere 5075E")!;
    expect(asset[2]).toBe("7-year property");
    expect(asset[7]).toBe("10000.00"); // section 179
    expect(asset[9]).toBe("35000.00"); // depreciable basis

    const deduction = 10_000 + Math.round(3_500_000 * (2 / 7) * 0.5) / 100;
    expect(asset[10]).toBe(deduction.toFixed(2));

    const total = rows.at(-1)!;
    expect(total[1]).toBe("TOTAL");
    expect(total[10]).toBe(deduction.toFixed(2));
  });
});

describe("hours.csv", () => {
  it("gives minutes and decimal hours, with a total", () => {
    const files = exportAndExtract(buildInput("2026-01-01", "2026-12-31"));
    const rows = parseCsv(files.get("hours.csv")!);

    expect(rows[0]).toEqual(["date", "person", "task", "minutes", "hours", "notes"]);
    const fencing = rows.find((r) => r[2] === "Fencing")!;
    expect(fencing[1]).toBe("Sam Rivers");
    expect(fencing[3]).toBe("150");
    expect(fencing[4]).toBe("2.50");

    const total = rows.at(-1)!;
    expect(total[1]).toBe("TOTAL");
    expect(total[3]).toBe("630");
    expect(total[4]).toBe("10.50");
  });
});

describe("archive.json", () => {
  it("is valid JSON, in cents, and lossless", () => {
    const files = exportAndExtract(buildInput("2026-01-01", "2026-12-31"));
    const archive = JSON.parse(files.get("archive.json")!);

    expect(archive.format).toBe("schedule-f-books/export");
    expect(archive.formatVersion).toBe(1);
    expect(archive.range).toEqual({ from: "2026-01-01", to: "2026-12-31" });

    const feed = archive.transactions.find(
      (t: { payee: string }) => t.payee === "Valley Co-op, Inc",
    );
    expect(feed.amountCents).toBe(24575); // cents, not dollars
    expect(feed.scheduleFLine).toBe("16");

    // The asset carries its whole computed schedule.
    const asset = archive.assets[0];
    expect(asset.costCents).toBe(4_500_000);
    expect(asset.schedule).toHaveLength(8); // 7-year property spans 8 years
    expect(asset.schedule.reduce((s: number, y: { amountCents: number }) => s + y.amountCents, 0)).toBe(
      asset.depreciableBasisCents,
    );

    expect(archive.timeEntries).toHaveLength(2);
    expect(archive.timeEntries[0].minutes).toBe(150);
  });

  it("can be left out", () => {
    const files = exportAndExtract(
      buildInput("2026-01-01", "2026-12-31", { includeArchiveJson: false }),
    );
    expect(files.has("archive.json")).toBe(false);
    expect(files.has("schedule-f-2026.csv")).toBe(true);
  });
});

describe("receipts", () => {
  const jpeg = Buffer.from("fake jpeg bytes");

  it("are named so they tie back to their transaction", () => {
    expect(receiptArchiveName(42, 0, "abc123.jpg")).toBe("receipts/txn-000042-1.jpg");
    expect(receiptArchiveName(7, 2, "x.HEIC")).toBe("receipts/txn-000007-3.heic");
    // ASCII only, so Info-ZIP cannot mangle them.
    expect(/^[\x20-\x7e]+$/.test(receiptArchiveName(1, 0, "a.jpg"))).toBe(true);
  });

  it("land in the archive and are listed against the transaction", () => {
    const transaction = store.listTransactions({ from: "2026-02-01", to: "2026-02-28" })[0]!;
    store.createReceipt({
      transactionId: transaction.id,
      filename: "stored-name.jpg",
      mimeType: "image/jpeg",
      byteSize: jpeg.length,
    });

    const input = buildInput("2026-01-01", "2026-12-31");
    const name = receiptArchiveName(transaction.id, 0, "stored-name.jpg");
    input.receiptFiles = [{ name, data: jpeg }];

    const files = exportAndExtract(input);
    expect(files.get(name)).toBe("fake jpeg bytes");

    // transactions.csv points at the file by its archive name.
    expect(files.get("transactions.csv")).toContain(name);
  });

  it("are omitted when asked, and the CSV then claims no files", () => {
    const transaction = store.listTransactions({ from: "2026-02-01", to: "2026-02-28" })[0]!;
    store.createReceipt({
      transactionId: transaction.id, filename: "x.jpg", mimeType: "image/jpeg", byteSize: 3,
    });

    const files = exportAndExtract(
      buildInput("2026-01-01", "2026-12-31", { includeReceipts: false }),
    );
    expect([...files.keys()].some((k) => k.startsWith("receipts/"))).toBe(false);

    // The count is still recorded, so a preparer knows one exists.
    const rows = parseCsv(files.get("transactions.csv")!);
    const header = rows[0]!;
    const row = rows.find((r) => r[header.indexOf("payee")] === "Valley Co-op, Inc")!;
    expect(row[header.indexOf("receipts")]).toBe("1");
    expect(row[header.indexOf("receipt_files")]).toBe("");
  });
});

describe("README.txt", () => {
  it("names the range, the contents, and the caveats", () => {
    const files = exportAndExtract(buildInput("2026-01-01", "2026-12-31"));
    const readme = files.get("README.txt")!;

    expect(readme).toContain("Jan 1, 2026");
    expect(readme).toContain("Dec 31, 2026");
    expect(readme).toContain("Sam Rivers");
    expect(readme).toContain("schedule-f-2026.csv");
    expect(readme).toContain("depreciation-2026.csv");

    // Totals a preparer can cross-check against.
    expect(readme).toContain("$832.50"); // income
    expect(readme).toContain("10.50"); // hours

    // And the limits are stated, not buried.
    expect(readme).toContain("not tax advice");
    expect(readme).toMatch(/Section 179 limits[\s\S]*NOT applied/);
  });

  it("lines the contents up, whatever the range does to the filenames", () => {
    for (const [from, to] of [
      ["2026-01-01", "2026-12-31"],
      ["2024-01-01", "2026-12-31"], // longer list, same widths
    ]) {
      const files = exportAndExtract(buildInput(from!, to!));
      const readme = files.get("README.txt")!;

      // Just the "WHAT IS IN HERE" block: from its underline to the next blank line.
      const all = readme.split("\n");
      const start = all.indexOf("---------------") + 1;
      const listing = all.slice(start, all.indexOf("", start));

      expect(listing.length).toBeGreaterThan(3);

      // Every description must begin in the same column.
      const columns = listing.map((line) => line.length - line.replace(/^\s+\S+\s+/, "").length);
      expect(new Set(columns).size, `misaligned:\n${listing.join("\n")}`).toBe(1);
    }
  });
});

describe("exportFileName", () => {
  it("is dated, so archives sort and do not overwrite", () => {
    expect(exportFileName("2026-01-01", "2026-12-31")).toBe(
      "farm-books-2026-01-01-to-2026-12-31.zip",
    );
  });
});

describe("an empty range", () => {
  it("still produces a usable package", () => {
    const files = exportAndExtract(buildInput("2020-01-01", "2020-12-31"));
    expect(files.has("README.txt")).toBe(true);
    expect(files.has("schedule-f-2020.csv")).toBe(true);

    const rows = parseCsv(files.get("transactions.csv")!);
    expect(rows).toHaveLength(1); // header only
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv";
import { Store } from "@/lib/db/store";
import { formatDuration } from "@/lib/duration";
import {
  autoMap,
  detectDateOrder,
  flagDuplicates,
  isTransaction,
  parseRows,
  timeEntryKey,
  transactionKey,
  type ImportKind,
} from "@/lib/import";
import { formatUsd } from "@/lib/money";
import { buildReport } from "@/lib/report";

/**
 * The whole path a real file takes: parse, guess the mapping and date order,
 * validate every row, spot duplicates against what is already stored, then
 * write. Mirrors what the server action does, against a real database.
 */

let store: Store;
let userId: number;

beforeEach(() => {
  store = new Store(":memory:");
  userId = store.createUser({
    email: "farmer@example.com",
    name: "Test Farmer",
    passwordHash: "x",
    role: "owner",
  }).id;
});

/** Run the import pipeline exactly as commitImport does, and write the rows. */
function runImport(
  csvText: string,
  kind: ImportKind,
  defaultCategoryId = "other_expense",
  skipDuplicates = true,
) {
  const rows = parseCsv(csvText);
  const mapping = autoMap(rows[0]!, kind);
  const dateOrder = detectDateOrder(rows.slice(1).map((r) => r[mapping.date!] ?? ""));

  const parsed = parseRows(rows, {
    kind,
    mapping,
    dateOrder: dateOrder.order,
    defaultCategoryId,
    hasHeader: true,
  });

  const usable = parsed.rows.filter((r) => r.value !== null);
  const dates = usable.map((r) => r.value!.date).sort();
  const from = dates[0] ?? "1900-01-01";
  const to = dates.at(-1) ?? "2999-12-31";

  const existing = new Set(
    kind === "time"
      ? store.timeEntryFingerprints(userId, from, to).map(timeEntryKey)
      : store.transactionFingerprints(from, to).map(transactionKey),
  );
  flagDuplicates(parsed.rows, existing);

  const toInsert = usable.filter((r) => !(skipDuplicates && r.duplicate));
  const imported = store.transaction(() => {
    let n = 0;
    for (const row of toInsert) {
      const record = row.value!;
      if (isTransaction(record)) store.createTransaction({ ...record, createdBy: userId });
      else store.createTimeEntry({ ...record, userId });
      n++;
    }
    return n;
  });

  return { parsed, mapping, dateOrder, imported, skipped: usable.length - toInsert.length };
}

/**
 * A US bank export, with the awkwardness such files actually have: a quoted
 * payee containing a comma, negative debits, a thousands separator, an
 * accounting-style negative in parentheses, a blank category, a repeated row,
 * and two rows that are simply broken.
 */
const BANK_CSV = `Transaction Date,Description,Amount,Category
03/14/2026,"Valley Co-op, Inc",-245.75,16
03/18/2026,Seed Supplier,"-1,412.30",Seeds & plants
04/02/2026,Fuel Depot,-188.40,
04/22/2026,Large Animal Vet,-320.00,31
04/22/2026,Large Animal Vet,-320.00,31
05/30/2026,Rural Electric,(142.88),Utilities
bad-date,Something,-10.00,16
06/01/2026,Missing Amount,,16
`;

describe("importing a bank export", () => {
  it("guesses the mapping, including Description as the payee", () => {
    const { mapping } = runImport(BANK_CSV, "expense");
    expect(mapping).toMatchObject({ date: 0, payee: 1, amount: 2, category: 3 });
  });

  it("reads the dates as month-first, and knows it is sure", () => {
    const { dateOrder } = runImport(BANK_CSV, "expense");
    // 03/14 has a 14 in second place, which settles it.
    expect(dateOrder).toEqual({ order: "mdy", certain: true });
  });

  it("imports the good rows, skips the duplicate, refuses the broken ones", () => {
    const { parsed, imported, skipped } = runImport(BANK_CSV, "expense");

    expect(parsed.valid).toBe(6);
    expect(parsed.invalid).toBe(2);
    expect(skipped).toBe(1); // the repeated vet visit
    expect(imported).toBe(5);
    expect(store.countTransactions()).toBe(5);
  });

  it("stores the amounts as positive cents, whatever sign the bank used", () => {
    runImport(BANK_CSV, "expense");
    const byPayee = Object.fromEntries(
      store.listTransactions().map((t) => [t.payee, t.amount]),
    );

    expect(byPayee["Valley Co-op, Inc"]).toBe(24575); // quoted comma survived
    expect(byPayee["Seed Supplier"]).toBe(141230); // thousands separator
    expect(byPayee["Fuel Depot"]).toBe(18840);
    expect(byPayee["Rural Electric"]).toBe(14288); // (142.88) read as negative
  });

  it("files each row against the Schedule F line its category names", () => {
    runImport(BANK_CSV, "expense");
    const byPayee = Object.fromEntries(
      store.listTransactions().map((t) => [t.payee, t.categoryId]),
    );

    expect(byPayee["Valley Co-op, Inc"]).toBe("feed"); // by line number "16"
    expect(byPayee["Seed Supplier"]).toBe("seeds_plants"); // by label
    expect(byPayee["Rural Electric"]).toBe("utilities");
    expect(byPayee["Fuel Depot"]).toBe("other_expense"); // blank -> default
  });

  it("points at the right line when a row is refused", () => {
    const { parsed } = runImport(BANK_CSV, "expense");
    const broken = parsed.rows.filter((r) => r.error);
    expect(broken.map((r) => r.line)).toEqual([8, 9]);
    expect(broken[0]!.error).toMatch(/date/i);
    expect(broken[1]!.error).toMatch(/empty/i);
  });

  it("does not double the books when the same file is imported twice", () => {
    runImport(BANK_CSV, "expense");
    const second = runImport(BANK_CSV, "expense");

    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(6);
    expect(store.countTransactions()).toBe(5);
  });

  it("imports every row when duplicate skipping is turned off", () => {
    runImport(BANK_CSV, "expense");
    const second = runImport(BANK_CSV, "expense", "other_expense", false);
    expect(second.imported).toBe(6);
    expect(store.countTransactions()).toBe(11);
  });

  it("feeds the Schedule F report", () => {
    runImport(BANK_CSV, "expense");
    const report = buildReport(2026, store.categoryTotals(2026));

    // 245.75 + 1412.30 + 188.40 + 320.00 + 142.88
    expect(report.totalExpenses).toBe(230933);
    expect(formatUsd(report.totalExpenses)).toBe("$2,309.33");
    expect(report.expenses.find((l) => l.line === "16")!.amount).toBe(24575);
  });
});

/** A European timesheet: semicolons, CRLF endings, and day-first dates. */
const TIMESHEET_CSV =
  "Day;Activity;Hours;Comments\r\n" +
  "25/08/2026;Fencing;2.5;North boundary\r\n" +
  "26/08/2026;Harvest;8:00;\r\n" +
  "27/08/2026;Livestock chores;90m;\r\n" +
  '28/08/2026;Fencing;1h 45m;"Gate, hinges"\r\n';

describe("importing a timesheet", () => {
  it("copes with semicolons and CRLF without being told", () => {
    const { parsed } = runImport(TIMESHEET_CSV, "time");
    expect(parsed.valid).toBe(4);
    expect(parsed.invalid).toBe(0);
  });

  it("reads day-first dates, because 25 cannot be a month", () => {
    const { dateOrder } = runImport(TIMESHEET_CSV, "time");
    expect(dateOrder).toEqual({ order: "dmy", certain: true });

    const dates = store.listTimeEntries(userId).map((e) => e.date).sort();
    expect(dates).toEqual(["2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"]);
  });

  it("accepts each way a duration was written", () => {
    runImport(TIMESHEET_CSV, "time");
    const byTaskAndDate = Object.fromEntries(
      store.listTimeEntries(userId).map((e) => [e.date, e.minutes]),
    );
    expect(byTaskAndDate["2026-08-25"]).toBe(150); // 2.5
    expect(byTaskAndDate["2026-08-26"]).toBe(480); // 8:00
    expect(byTaskAndDate["2026-08-27"]).toBe(90); // 90m
    expect(byTaskAndDate["2026-08-28"]).toBe(105); // 1h 45m
  });

  it("keeps a quoted note containing the delimiter", () => {
    runImport(TIMESHEET_CSV, "time");
    const entry = store.listTimeEntries(userId).find((e) => e.date === "2026-08-28")!;
    expect(entry.notes).toBe("Gate, hinges");
  });

  it("totals into the hours summary", () => {
    runImport(TIMESHEET_CSV, "time");
    expect(store.totalMinutes(userId, 2026)).toBe(825); // 150 + 480 + 90 + 105
    expect(formatDuration(825)).toBe("13h 45m");

    // Largest first, and the two Fencing rows are added together.
    expect(store.minutesByTask(userId, 2026)).toEqual([
      { task: "Harvest", minutes: 480 },
      { task: "Fencing", minutes: 255 },
      { task: "Livestock chores", minutes: 90 },
    ]);
  });

  it("will not re-import the same timesheet", () => {
    runImport(TIMESHEET_CSV, "time");
    const second = runImport(TIMESHEET_CSV, "time");
    expect(second.imported).toBe(0);
    expect(store.listTimeEntries(userId)).toHaveLength(4);
  });
});

describe("income", () => {
  const INCOME_CSV = `Date,Payee,Amount,Category
2026-06-15,Saturday market,482.50,2
2026-07-20,Restaurant Co,"1,240.00",Sales of raised livestock, produce & grains
2026-08-02,Neighbour,350.00,7
`;

  it("files income against Part I and reaches gross income", () => {
    // Note the third row's category contains commas, so it is split across
    // columns - the importer should fall back to the default rather than fail.
    runImport(INCOME_CSV, "income", "raised_sales");

    const report = buildReport(2026, store.categoryTotals(2026));
    expect(report.grossIncome).toBe(207250); // 482.50 + 1240.00 + 350.00
    expect(report.expenses.every((l) => l.amount === 0)).toBe(true);
  });
});

describe("atomicity", () => {
  it("writes nothing when the batch fails part-way", () => {
    const before = store.countTransactions();
    expect(() =>
      store.transaction(() => {
        store.createTransaction({
          kind: "expense",
          categoryId: "feed",
          date: "2026-01-01",
          amount: 100,
        });
        throw new Error("failure after the first insert");
      }),
    ).toThrow(/failure after/);

    expect(store.countTransactions()).toBe(before);
  });
});

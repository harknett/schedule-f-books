import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv";
import {
  autoMap,
  detectDateOrder,
  flagDuplicates,
  isTransaction,
  parseFlexibleDate,
  parseRows,
  resolveCategory,
  templateFor,
  timeEntryKey,
  transactionKey,
  type ImportedTransaction,
  type ImportedTimeEntry,
} from "@/lib/import";

describe("autoMap", () => {
  it("maps a typical bank export", () => {
    const mapping = autoMap(
      ["Transaction Date", "Description", "Amount", "Category"],
      "expense",
    );
    expect(mapping.date).toBe(0);
    expect(mapping.amount).toBe(2);
    expect(mapping.category).toBe(3);
  });

  it("sends a lone Description column to payee, where the entry list shows it", () => {
    const mapping = autoMap(["Date", "Description", "Amount"], "expense");
    expect(mapping.payee).toBe(1);
    expect(mapping.description).toBe(-1);
  });

  it("splits Payee and Description when the file has both", () => {
    const mapping = autoMap(["Date", "Payee", "Description", "Amount"], "expense");
    expect(mapping.payee).toBe(1);
    expect(mapping.description).toBe(2);
  });

  it("never assigns one column to two fields", () => {
    const mapping = autoMap(["Date", "Description", "Amount"], "expense");
    const used = Object.values(mapping).filter((i) => i !== -1);
    expect(new Set(used).size).toBe(used.length);
  });

  it("prefers an exact header over a partial one", () => {
    const mapping = autoMap(["Posting Date", "Date", "Amount"], "expense");
    expect(mapping.date).toBe(1);
  });

  it("marks fields it cannot find as -1", () => {
    const mapping = autoMap(["Foo", "Bar"], "expense");
    expect(mapping.date).toBe(-1);
    expect(mapping.amount).toBe(-1);
  });

  it("maps a timesheet", () => {
    const mapping = autoMap(["Day", "Activity", "Hours", "Comments"], "time");
    expect(mapping.date).toBe(0);
    expect(mapping.task).toBe(1);
    expect(mapping.duration).toBe(2);
    expect(mapping.notes).toBe(3);
  });
});

describe("date handling", () => {
  it("reads ISO straight through", () => {
    expect(parseFlexibleDate("2026-03-04", "mdy")).toBe("2026-03-04");
  });

  it("respects the chosen order for ambiguous dates", () => {
    expect(parseFlexibleDate("03/04/2026", "mdy")).toBe("2026-03-04");
    expect(parseFlexibleDate("03/04/2026", "dmy")).toBe("2026-04-03");
  });

  it("lets an out-of-range component override the order", () => {
    // 25 cannot be a month, whatever the setting says.
    expect(parseFlexibleDate("25/03/2026", "mdy")).toBe("2026-03-25");
    expect(parseFlexibleDate("03/25/2026", "dmy")).toBe("2026-03-25");
  });

  it("expands two-digit years", () => {
    expect(parseFlexibleDate("3/4/26", "mdy")).toBe("2026-03-04");
    expect(parseFlexibleDate("3/4/99", "mdy")).toBe("1999-03-04");
  });

  it("accepts dots and dashes as separators", () => {
    expect(parseFlexibleDate("03.04.2026", "mdy")).toBe("2026-03-04");
    expect(parseFlexibleDate("3-4-2026", "mdy")).toBe("2026-03-04");
  });

  it("accepts month names in either order", () => {
    expect(parseFlexibleDate("Jan 5, 2026", "mdy")).toBe("2026-01-05");
    expect(parseFlexibleDate("5 January 2026", "dmy")).toBe("2026-01-05");
    expect(parseFlexibleDate("2026 Mar 4", "mdy")).toBe("2026-03-04");
  });

  it("rejects impossible and unreadable dates", () => {
    expect(() => parseFlexibleDate("2026-02-30", "mdy")).toThrow(/not a real date/);
    expect(() => parseFlexibleDate("13/13/2026", "mdy")).toThrow();
    expect(() => parseFlexibleDate("someday", "mdy")).toThrow(/don't|not a date/i);
    expect(() => parseFlexibleDate("", "mdy")).toThrow();
  });
});

describe("detectDateOrder", () => {
  it("is certain when a day above 12 appears first", () => {
    expect(detectDateOrder(["03/04/2026", "25/12/2026"])).toEqual({
      order: "dmy",
      certain: true,
    });
  });

  it("is certain when a day above 12 appears second", () => {
    expect(detectDateOrder(["03/04/2026", "12/25/2026"])).toEqual({
      order: "mdy",
      certain: true,
    });
  });

  it("admits when the file is genuinely ambiguous", () => {
    expect(detectDateOrder(["03/04/2026", "05/06/2026"])).toEqual({
      order: "mdy",
      certain: false,
    });
  });
});

describe("resolveCategory", () => {
  it("matches our id, the line number, and the label", () => {
    expect(resolveCategory("feed", "expense")?.id).toBe("feed");
    expect(resolveCategory("16", "expense")?.id).toBe("feed");
    expect(resolveCategory("Feed", "expense")?.id).toBe("feed");
    expect(resolveCategory("21a", "expense")?.id).toBe("interest_mortgage");
  });

  it("matches a line number with its label attached", () => {
    expect(resolveCategory("16 Feed", "expense")?.id).toBe("feed");
  });

  it("will not cross the income/expense divide", () => {
    expect(resolveCategory("feed", "income")).toBeUndefined();
    expect(resolveCategory("raised_sales", "expense")).toBeUndefined();
  });

  it("returns undefined for nonsense and blanks", () => {
    expect(resolveCategory("", "expense")).toBeUndefined();
    expect(resolveCategory("zzz", "expense")).toBeUndefined();
  });
});

const EXPENSE_CSV = `Date,Description,Amount,Category
03/14/2026,Valley Co-op,245.75,16
03/18/2026,Seed supplier,"1,412.30",Seeds & plants
03/22/2026,Fuel depot,-188.40,
`;

function importExpenses(text: string, defaultCategoryId = "other_expense") {
  const rows = parseCsv(text);
  return parseRows(rows, {
    kind: "expense",
    mapping: autoMap(rows[0]!, "expense"),
    dateOrder: "mdy",
    defaultCategoryId,
    hasHeader: true,
  });
}

describe("parseRows · expenses", () => {
  it("reads a whole file", () => {
    const result = importExpenses(EXPENSE_CSV);
    expect(result.valid).toBe(3);
    expect(result.invalid).toBe(0);

    const first = result.rows[0]!.value as ImportedTransaction;
    expect(first).toMatchObject({
      kind: "expense",
      categoryId: "feed",
      date: "2026-03-14",
      amount: 24575,
      payee: "Valley Co-op",
    });
  });

  it("handles thousands separators inside quotes", () => {
    const result = importExpenses(EXPENSE_CSV);
    expect((result.rows[1]!.value as ImportedTransaction).amount).toBe(141230);
    expect((result.rows[1]!.value as ImportedTransaction).categoryId).toBe("seeds_plants");
  });

  it("stores a negative bank debit as a positive expense", () => {
    const result = importExpenses(EXPENSE_CSV);
    expect((result.rows[2]!.value as ImportedTransaction).amount).toBe(18840);
  });

  it("reads parentheses as a negative", () => {
    const result = importExpenses("Date,Amount\n03/14/2026,(50.00)\n");
    expect((result.rows[0]!.value as ImportedTransaction).amount).toBe(5000);
  });

  it("falls back to the default category and says so", () => {
    const result = importExpenses(EXPENSE_CSV);
    const row = result.rows[2]!;
    expect((row.value as ImportedTransaction).categoryId).toBe("other_expense");
    expect(row.warnings).toEqual([]);
  });

  it("warns when a category was present but unrecognised", () => {
    const result = importExpenses("Date,Amount,Category\n03/14/2026,10.00,Nonsense\n");
    expect(result.rows[0]!.warnings[0]).toMatch(/wasn't recognised/);
    expect((result.rows[0]!.value as ImportedTransaction).categoryId).toBe("other_expense");
  });

  it("rejects a row rather than guessing", () => {
    const result = importExpenses(
      "Date,Amount\nnot-a-date,10.00\n03/14/2026,\n03/15/2026,0\n03/16/2026,abc\n",
    );
    expect(result.valid).toBe(0);
    expect(result.invalid).toBe(4);
    expect(result.rows[0]!.error).toMatch(/date/i);
    expect(result.rows[1]!.error).toMatch(/empty/i);
    expect(result.rows[2]!.error).toMatch(/zero/i);
    expect(result.rows[3]!.error).toBeTruthy();
  });

  it("fails a row when there is no category and no default", () => {
    const result = importExpenses("Date,Amount\n03/14/2026,10.00\n", "");
    expect(result.rows[0]!.error).toMatch(/no default|No category/i);
  });

  it("numbers lines so an error points at the right row", () => {
    const result = importExpenses("Date,Amount\n03/14/2026,10\nbad,10\n");
    expect(result.rows[0]!.line).toBe(2);
    expect(result.rows[1]!.line).toBe(3);
  });

  it("warns about a negative amount imported as income", () => {
    const rows = parseCsv("Date,Amount\n03/14/2026,-100.00\n");
    const result = parseRows(rows, {
      kind: "income",
      mapping: autoMap(rows[0]!, "income"),
      dateOrder: "mdy",
      defaultCategoryId: "raised_sales",
      hasHeader: true,
    });
    expect(result.rows[0]!.warnings[0]).toMatch(/refund/i);
  });
});

describe("parseRows · time", () => {
  const TIME_CSV = `Day,Activity,Hours,Comments
2026-08-01,Fencing,2.5,North boundary
2026-08-02,Harvest,8:00,
2026-08-03,Chores,90m,
`;

  function importTime(text: string) {
    const rows = parseCsv(text);
    return parseRows(rows, {
      kind: "time",
      mapping: autoMap(rows[0]!, "time"),
      dateOrder: "mdy",
      hasHeader: true,
    });
  }

  it("accepts the several ways a duration gets written", () => {
    const result = importTime(TIME_CSV);
    expect(result.valid).toBe(3);
    const minutes = result.rows.map((r) => (r.value as ImportedTimeEntry).minutes);
    expect(minutes).toEqual([150, 480, 90]);
  });

  it("keeps the task and notes", () => {
    const first = importTime(TIME_CSV).rows[0]!.value as ImportedTimeEntry;
    expect(first).toMatchObject({ date: "2026-08-01", task: "Fencing", notes: "North boundary" });
  });

  it("requires a task and a duration", () => {
    const result = importTime("Day,Activity,Hours\n2026-08-01,,2.5\n2026-08-02,Fencing,\n");
    expect(result.rows[0]!.error).toMatch(/task/i);
    expect(result.rows[1]!.error).toMatch(/time worked/i);
  });
});

describe("headerless files", () => {
  it("reads from the first line when told there is no header", () => {
    const rows = parseCsv("03/14/2026,245.75,Valley Co-op\n");
    const result = parseRows(rows, {
      kind: "expense",
      mapping: { date: 0, amount: 1, payee: 2, description: -1, category: -1, paymentMethod: -1 },
      dateOrder: "mdy",
      defaultCategoryId: "feed",
      hasHeader: false,
    });
    expect(result.valid).toBe(1);
    expect(result.rows[0]!.line).toBe(1);
  });
});

describe("duplicates", () => {
  const rows = parseCsv("Date,Amount,Payee\n03/14/2026,245.75,Valley Co-op\n");
  const build = () =>
    parseRows(rows, {
      kind: "expense",
      mapping: autoMap(rows[0]!, "expense"),
      dateOrder: "mdy",
      defaultCategoryId: "feed",
      hasHeader: true,
    }).rows;

  it("flags a row already in the books", () => {
    const parsed = build();
    const existing = new Set([
      transactionKey({ kind: "expense", date: "2026-03-14", amount: 24575, payee: "Valley Co-op" }),
    ]);
    flagDuplicates(parsed, existing);
    expect(parsed[0]!.duplicate).toBe(true);
  });

  it("ignores payee case and padding when comparing", () => {
    const parsed = build();
    const existing = new Set([
      transactionKey({ kind: "expense", date: "2026-03-14", amount: 24575, payee: "  valley co-op " }),
    ]);
    flagDuplicates(parsed, existing);
    expect(parsed[0]!.duplicate).toBe(true);
  });

  it("leaves a genuinely new row alone", () => {
    const parsed = build();
    flagDuplicates(parsed, new Set());
    expect(parsed[0]!.duplicate).toBe(false);
  });

  it("catches a row repeated within the same file", () => {
    const doubled = parseCsv(
      "Date,Amount,Payee\n03/14/2026,245.75,Valley Co-op\n03/14/2026,245.75,Valley Co-op\n",
    );
    const parsed = parseRows(doubled, {
      kind: "expense",
      mapping: autoMap(doubled[0]!, "expense"),
      dateOrder: "mdy",
      defaultCategoryId: "feed",
      hasHeader: true,
    }).rows;
    flagDuplicates(parsed, new Set());
    expect(parsed.map((r) => r.duplicate)).toEqual([false, true]);
  });

  it("keys time entries on date, minutes, and task", () => {
    const a = timeEntryKey({ date: "2026-08-01", minutes: 150, task: "Fencing" });
    const b = timeEntryKey({ date: "2026-08-01", minutes: 150, task: "  fencing" });
    const c = timeEntryKey({ date: "2026-08-01", minutes: 151, task: "Fencing" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("isTransaction", () => {
  it("tells the two record shapes apart", () => {
    const transaction = importExpenses(EXPENSE_CSV).rows[0]!.value!;
    expect(isTransaction(transaction)).toBe(true);
    expect(isTransaction({ date: "2026-01-01", minutes: 60, task: "x", notes: null })).toBe(false);
  });
});

describe("templates", () => {
  it("produces a file this importer can read back", () => {
    for (const kind of ["expense", "income", "time"] as const) {
      const rows = parseCsv(templateFor(kind));
      const result = parseRows(rows, {
        kind,
        mapping: autoMap(rows[0]!, kind),
        dateOrder: "mdy",
        defaultCategoryId: kind === "income" ? "raised_sales" : "other_expense",
        hasHeader: true,
      });
      expect(result.invalid, `${kind} template should parse cleanly`).toBe(0);
      expect(result.valid).toBeGreaterThan(0);
    }
  });
});

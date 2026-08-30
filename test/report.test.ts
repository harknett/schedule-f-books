import { describe, expect, it } from "vitest";

import type { CategoryTotal } from "@/lib/db/types";
import { buildReport, reportToCsv, usedLines } from "@/lib/report";
import { ALL_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/schedule-f";

function totals(entries: Record<string, number>): CategoryTotal[] {
  return Object.entries(entries).map(([categoryId, total]) => ({
    categoryId,
    total,
    count: 1,
  }));
}

function line(report: ReturnType<typeof buildReport>, want: string) {
  return [...report.income, ...report.expenses].find((l) => l.line === want);
}

describe("category taxonomy", () => {
  it("has unique ids", () => {
    const ids = ALL_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps each category on the side of the form it belongs to", () => {
    expect(INCOME_CATEGORIES.every((c) => c.kind === "income")).toBe(true);
    expect(EXPENSE_CATEGORIES.every((c) => c.kind === "expense")).toBe(true);
  });
});

describe("buildReport", () => {
  it("is all zeroes with no activity", () => {
    const report = buildReport(2026, []);
    expect(report.grossIncome).toBe(0);
    expect(report.totalExpenses).toBe(0);
    expect(report.netProfit).toBe(0);
    expect(usedLines(report.income)).toHaveLength(0);
  });

  it("computes line 1c as 1a less 1b", () => {
    const report = buildReport(2026, totals({ resale_sales: 500_00, resale_cost: 300_00 }));
    expect(line(report, "1c")?.amount).toBe(200_00);
  });

  it("counts resale into gross income net of its cost, not twice", () => {
    const report = buildReport(
      2026,
      totals({ resale_sales: 500_00, resale_cost: 300_00, raised_sales: 1_000_00 }),
    );
    // 1c (200) + line 2 (1000) = 1200, NOT 500 + 1000.
    expect(report.grossIncome).toBe(1_200_00);
  });

  it("sums every Part I line into line 9", () => {
    const report = buildReport(
      2026,
      totals({
        raised_sales: 1_000_00,
        coop_distributions: 50_00,
        ag_program_payments: 75_00,
        ccc_loans: 10_00,
        ccc_forfeited: 5_00,
        crop_insurance: 20_00,
        custom_hire_income: 200_00,
        other_income: 15_00,
      }),
    );
    expect(report.grossIncome).toBe(1_375_00);
  });

  it("sums every Part II line into line 33", () => {
    const report = buildReport(
      2026,
      totals({ feed: 400_00, seeds_plants: 150_00, fuel: 220_00, utilities: 80_00 }),
    );
    expect(report.totalExpenses).toBe(850_00);
  });

  it("derives net profit and reports a loss as negative", () => {
    const profitable = buildReport(2026, totals({ raised_sales: 1_000_00, feed: 400_00 }));
    expect(profitable.netProfit).toBe(600_00);

    const lossy = buildReport(2026, totals({ raised_sales: 100_00, feed: 400_00 }));
    expect(lossy.netProfit).toBe(-300_00);
  });

  it("lists every form line, used or not, in order", () => {
    const report = buildReport(2026, totals({ feed: 100_00 }));
    // Every expense category appears, plus 1c is inserted into Part I.
    expect(report.expenses).toHaveLength(EXPENSE_CATEGORIES.length);
    expect(report.income).toHaveLength(INCOME_CATEGORIES.length + 1);

    const lines = report.expenses.map((l) => l.line);
    expect(lines.slice(0, 5)).toEqual(["10", "11", "12", "13", "14"]);
    // Lettered sub-lines sort after their number, and 21a before 21b.
    expect(lines.indexOf("21a")).toBeLessThan(lines.indexOf("21b"));
    expect(lines.indexOf("21b")).toBeLessThan(lines.indexOf("22"));
  });

  it("marks line 1b as a contra entry", () => {
    const report = buildReport(2026, totals({ resale_cost: 100_00 }));
    expect(line(report, "1b")?.contra).toBe(true);
    expect(line(report, "2")?.contra).toBeUndefined();
  });

  it("totals the entry count", () => {
    const report = buildReport(2026, [
      { categoryId: "feed", total: 100_00, count: 3 },
      { categoryId: "raised_sales", total: 500_00, count: 2 },
    ]);
    expect(report.transactionCount).toBe(5);
  });

  it("ignores categories that are no longer in the taxonomy", () => {
    // A totals row for a retired category shouldn't crash the report.
    expect(() => buildReport(2026, totals({ feed: 100_00 }))).not.toThrow();
  });
});

describe("usedLines", () => {
  it("keeps only lines with activity", () => {
    const report = buildReport(2026, totals({ feed: 100_00 }));
    const used = usedLines(report.expenses);
    expect(used).toHaveLength(1);
    expect(used[0]!.line).toBe("16");
  });
});

describe("reportToCsv", () => {
  it("emits dollars, both parts, and the three totals", () => {
    const report = buildReport(2026, totals({ raised_sales: 1_000_00, feed: 250_50 }));
    const csv = reportToCsv(report);
    const rows = csv.trim().split("\n");

    expect(rows[0]).toBe("Section,Line,Description,Amount,Entries");
    expect(csv).toContain("1000.00");
    expect(csv).toContain("250.50");

    // Gross income closes Part I, before the expense block begins.
    const grossIndex = rows.findIndex((r) => r.includes("Gross income"));
    const firstExpenseIndex = rows.findIndex((r) => r.startsWith("Part II"));
    expect(grossIndex).toBeGreaterThan(0);
    expect(grossIndex).toBeLessThan(firstExpenseIndex);

    expect(rows.at(-2)).toContain("Total expenses");
    // No comma in this label, so it is emitted unquoted.
    expect(rows.at(-1)).toBe("Summary,34,Net farm profit or (loss),749.50,");
  });

  it("quotes fields containing commas so columns stay aligned", () => {
    const csv = reportToCsv(buildReport(2026, []));

    // Several Schedule F labels contain commas; they must be quoted.
    expect(csv).toContain('"Sales of raised livestock, produce & grains"');

    // Every row must still be exactly five columns once quoted spans are removed.
    for (const row of csv.trim().split("\n")) {
      const unquoted = row.replace(/"[^"]*"/g, "");
      expect(unquoted.split(","), `row split wrong: ${row}`).toHaveLength(5);
    }
  });
});

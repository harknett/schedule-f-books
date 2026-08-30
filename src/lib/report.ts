import type { CategoryTotal } from "@/lib/db/types";
import type { Cents } from "@/lib/money";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  lineSortKey,
  requireCategory,
} from "@/lib/schedule-f";

export interface ReportLine {
  line: string;
  label: string;
  amount: Cents;
  /** Absent on computed subtotal rows. */
  categoryId?: string;
  count: number;
  /** Subtotal/total rows (1c, 9, 33, 34) are derived, not entered. */
  computed?: boolean;
  /** Line 1b is entered as a positive number but subtracts from gross income. */
  contra?: boolean;
}

export interface ScheduleFReport {
  year: number;
  /** Part I, in form order, including the computed line 1c. */
  income: ReportLine[];
  /** Line 9. */
  grossIncome: Cents;
  /** Part II, in form order. */
  expenses: ReportLine[];
  /** Line 33. */
  totalExpenses: Cents;
  /** Line 34. Negative means a loss. */
  netProfit: Cents;
  transactionCount: number;
}

/**
 * Roll per-category totals up into Schedule F's line structure.
 *
 * Simplifications, stated plainly because they matter at filing time:
 *   - Taxable-amount lines (3b, 4b, 5c, 6b) are treated as equal to the gross
 *     amounts entered. Elections and deferrals (6c/6d) are not modelled.
 *   - Line 32 "other expenses" is a single bucket rather than 32a-32f.
 */
export function buildReport(year: number, totals: CategoryTotal[]): ScheduleFReport {
  const byCategory = new Map(totals.map((t) => [t.categoryId, t]));

  const lineFor = (categoryId: string): ReportLine => {
    const category = requireCategory(categoryId);
    const total = byCategory.get(categoryId);
    return {
      line: category.line,
      label: category.label,
      amount: total?.total ?? 0,
      categoryId,
      count: total?.count ?? 0,
      contra: category.contra,
    };
  };

  const incomeLines = INCOME_CATEGORIES.map((c) => lineFor(c.id));
  const amountOf = (categoryId: string): Cents => byCategory.get(categoryId)?.total ?? 0;

  // Line 1c: sales of resale items, less what they cost.
  const netResale = amountOf("resale_sales") - amountOf("resale_cost");

  const income: ReportLine[] = [];
  for (const row of incomeLines) {
    income.push(row);
    if (row.line === "1b") {
      income.push({
        line: "1c",
        label: "Net sales of resale items (1a less 1b)",
        amount: netResale,
        count: 0,
        computed: true,
      });
    }
  }

  // Line 9: everything in Part I except 1a/1b, which are represented by 1c.
  const grossIncome =
    netResale +
    INCOME_CATEGORIES.filter((c) => c.line !== "1a" && c.line !== "1b").reduce(
      (sum, c) => sum + amountOf(c.id),
      0,
    );

  const expenses = EXPENSE_CATEGORIES.map((c) => lineFor(c.id)).sort((a, b) => {
    const [an, as] = lineSortKey(a.line);
    const [bn, bs] = lineSortKey(b.line);
    return an - bn || as.localeCompare(bs);
  });

  const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);
  const transactionCount = totals.reduce((sum, t) => sum + t.count, 0);

  return {
    year,
    income,
    grossIncome,
    expenses,
    totalExpenses,
    netProfit: grossIncome - totalExpenses,
    transactionCount,
  };
}

/** Rows with activity, for the compact on-screen view. */
export function usedLines(lines: ReportLine[]): ReportLine[] {
  return lines.filter((l) => l.amount !== 0 || l.count > 0);
}

/** Schedule F as CSV, one row per line, for handing to a preparer. */
export function reportToCsv(report: ScheduleFReport): string {
  const escape = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const dollars = (cents: Cents): string => (cents / 100).toFixed(2);

  const rows: string[][] = [["Section", "Line", "Description", "Amount", "Entries"]];

  for (const l of report.income) {
    rows.push(["Part I - Income", l.line, l.label, dollars(l.amount), String(l.count)]);
  }
  rows.push(["Part I - Income", "9", "Gross income", dollars(report.grossIncome), ""]);

  for (const l of report.expenses) {
    rows.push(["Part II - Expenses", l.line, l.label, dollars(l.amount), String(l.count)]);
  }
  rows.push(["Part II - Expenses", "33", "Total expenses", dollars(report.totalExpenses), ""]);
  rows.push(["Summary", "34", "Net farm profit or (loss)", dollars(report.netProfit), ""]);

  return rows.map((r) => r.map(escape).join(",")).join("\n") + "\n";
}

import { beforeEach, describe, expect, it } from "vitest";

import { Store } from "@/lib/db/store";
import type { Loan, LoanPayment } from "@/lib/db/types";
import {
  LOAN_KIND_LINES,
  interestForYear,
  paymentTotal,
  summarizeLoan,
  totalPayments,
} from "@/lib/loans";
import { buildReport } from "@/lib/report";

let store: Store;
let userId: number;

beforeEach(() => {
  store = new Store(":memory:");
  userId = store.createUser({
    email: "owner@farm.test",
    name: "Sam Rivers",
    passwordHash: "x",
    role: "owner",
  }).id;
});

function makeLoan(overrides: Partial<Loan> = {}) {
  return store.createLoan({
    name: "North quarter mortgage",
    lender: "Farm Credit",
    kind: "mortgage",
    principal: 250_000_00,
    interestRate: 6.25,
    startDate: "2020-03-01",
    createdBy: userId,
    ...overrides,
  });
}

describe("paymentTotal", () => {
  it("is always the sum of the parts", () => {
    expect(paymentTotal({ interest: 400_00, principal: 800_00, escrow: 34_56 })).toBe(1_234_56);
    expect(paymentTotal({ interest: 0, principal: 0, escrow: 5_00 })).toBe(500);
  });
});

describe("summarizeLoan", () => {
  it("tracks the balance down as principal is repaid", () => {
    const loan = makeLoan({ principal: 100_000_00 });
    store.addLoanPayment({ loanId: loan.id, date: "2026-01-15", interest: 500_00, principal: 300_00 });
    store.addLoanPayment({ loanId: loan.id, date: "2026-02-15", interest: 498_00, principal: 302_00 });

    const summary = summarizeLoan(loan, store.listLoanPayments(loan.id), 2026);
    expect(summary.paid.principal).toBe(602_00);
    expect(summary.paid.interest).toBe(998_00);
    expect(summary.balance).toBe(100_000_00 - 602_00);
    expect(summary.paymentCount).toBe(2);
  });

  it("counts only the year asked about for the deductible figure", () => {
    const loan = makeLoan();
    store.addLoanPayment({ loanId: loan.id, date: "2025-12-15", interest: 500_00, principal: 100_00 });
    store.addLoanPayment({ loanId: loan.id, date: "2026-01-15", interest: 490_00, principal: 110_00 });

    const payments = store.listLoanPayments(loan.id);
    expect(summarizeLoan(loan, payments, 2026).interestInYear).toBe(490_00);
    expect(summarizeLoan(loan, payments, 2025).interestInYear).toBe(500_00);
    // All-time totals ignore the year.
    expect(summarizeLoan(loan, payments, 2026).paid.interest).toBe(990_00);
  });

  it("reads a fully repaid loan as cleared, never as negative", () => {
    const loan = makeLoan({ principal: 1_000_00 });
    store.addLoanPayment({ loanId: loan.id, date: "2026-01-15", interest: 0, principal: 1_500_00 });
    expect(summarizeLoan(loan, store.listLoanPayments(loan.id), 2026).balance).toBe(0);
  });

  it("keeps escrow out of both interest and principal", () => {
    const loan = makeLoan({ principal: 10_000_00 });
    store.addLoanPayment({
      loanId: loan.id, date: "2026-01-15",
      interest: 400_00, principal: 800_00, escrow: 34_56,
    });

    const summary = summarizeLoan(loan, store.listLoanPayments(loan.id), 2026);
    expect(summary.paid.escrow).toBe(34_56);
    expect(summary.paid.total).toBe(1_234_56);
    expect(summary.balance).toBe(10_000_00 - 800_00);
  });
});

describe("totalPayments", () => {
  it("is zero for no payments", () => {
    expect(totalPayments([])).toEqual({ interest: 0, principal: 0, escrow: 0, total: 0 });
  });
});

describe("interestForYear", () => {
  it("splits mortgage interest from other interest", () => {
    const mortgage = makeLoan({ kind: "mortgage" });
    const operating = makeLoan({ name: "Operating line", kind: "other", principal: 50_000_00 });

    store.addLoanPayment({ loanId: mortgage.id, date: "2026-03-01", interest: 900_00, principal: 300_00 });
    store.addLoanPayment({ loanId: operating.id, date: "2026-04-01", interest: 250_00, principal: 100_00 });

    const interest = interestForYear(store.listLoans(), store.listAllLoanPayments(), 2026);
    expect(interest.mortgage).toBe(900_00);
    expect(interest.other).toBe(250_00);
    expect(interest.total).toBe(1_150_00);
  });

  it("ignores payments outside the year", () => {
    const loan = makeLoan();
    store.addLoanPayment({ loanId: loan.id, date: "2025-06-01", interest: 999_00, principal: 1_00 });
    expect(interestForYear(store.listLoans(), store.listAllLoanPayments(), 2026).total).toBe(0);
  });

  it("ignores a payment whose loan is gone", () => {
    const loan = makeLoan();
    store.addLoanPayment({ loanId: loan.id, date: "2026-03-01", interest: 100_00, principal: 0 });
    const orphan: LoanPayment[] = [
      {
        id: 999, loanId: 12345, date: "2026-03-01",
        interest: 500_00, principal: 0, escrow: 0,
        notes: null, createdBy: null, createdAt: "",
      },
    ];
    const interest = interestForYear(store.listLoans(), [...store.listAllLoanPayments(), ...orphan], 2026);
    expect(interest.total).toBe(100_00);
  });

  it("names the right Schedule F line for each kind", () => {
    expect(LOAN_KIND_LINES.mortgage).toBe("21a");
    expect(LOAN_KIND_LINES.other).toBe("21b");
  });
});

describe("the report", () => {
  it("puts loan interest on lines 21a and 21b and says where it came from", () => {
    const report = buildReport(2026, [], {
      loanInterest: { mortgage: 900_00, other: 250_00 },
    });

    const line21a = report.expenses.find((l) => l.line === "21a")!;
    const line21b = report.expenses.find((l) => l.line === "21b")!;

    expect(line21a.amount).toBe(900_00);
    expect(line21a.note).toBe("From recorded loan payments");
    expect(line21b.amount).toBe(250_00);
    expect(report.totalExpenses).toBe(1_150_00);
    expect(report.loanInterest).toEqual({ mortgage: 900_00, other: 250_00 });
  });

  it("adds it to interest entered by hand rather than replacing it", () => {
    const report = buildReport(
      2026,
      [{ categoryId: "interest_mortgage", total: 100_00, count: 1 }],
      { loanInterest: { mortgage: 900_00, other: 0 } },
    );

    const line21a = report.expenses.find((l) => l.line === "21a")!;
    expect(line21a.amount).toBe(1_000_00);
    expect(line21a.note).toContain("plus entries recorded by hand");
  });

  it("leaves the lines alone when there are no loans", () => {
    const report = buildReport(2026, [
      { categoryId: "interest_mortgage", total: 100_00, count: 1 },
    ]);
    const line21a = report.expenses.find((l) => l.line === "21a")!;
    expect(line21a.amount).toBe(100_00);
    expect(line21a.note).toBeUndefined();
    expect(report.loanInterest).toEqual({ mortgage: 0, other: 0 });
  });

  it("carries principal and escrow nowhere near the return", () => {
    const loan = makeLoan();
    store.addLoanPayment({
      loanId: loan.id, date: "2026-03-01",
      interest: 400_00, principal: 800_00, escrow: 34_56,
    });

    const report = buildReport(2026, [], {
      loanInterest: interestForYear(store.listLoans(), store.listAllLoanPayments(), 2026),
    });
    // Only the interest reaches the form.
    expect(report.totalExpenses).toBe(400_00);
  });
});

describe("persistence", () => {
  it("round-trips a loan", () => {
    const created = makeLoan();
    const read = store.getLoan(created.id)!;
    expect(read).toMatchObject({
      name: "North quarter mortgage",
      lender: "Farm Credit",
      kind: "mortgage",
      principal: 250_000_00,
      interestRate: 6.25,
      startDate: "2020-03-01",
    });
  });

  it("updates and deletes, cascading payments", () => {
    const loan = makeLoan();
    store.addLoanPayment({ loanId: loan.id, date: "2026-01-15", interest: 100_00, principal: 0 });
    expect(store.listLoanPayments(loan.id)).toHaveLength(1);

    const updated = store.updateLoan(loan.id, {
      name: "Renamed", kind: "other", principal: 1_00,
    })!;
    expect(updated.name).toBe("Renamed");
    expect(updated.kind).toBe("other");

    store.deleteLoan(loan.id);
    expect(store.getLoan(loan.id)).toBeUndefined();
    expect(store.listAllLoanPayments()).toHaveLength(0);
  });

  it("refuses a payment of nothing at all", () => {
    const loan = makeLoan();
    expect(() =>
      store.addLoanPayment({ loanId: loan.id, date: "2026-01-15", interest: 0, principal: 0 }),
    ).toThrow();
  });

  it("refuses negative parts at the database boundary", () => {
    const loan = makeLoan();
    expect(() =>
      store.addLoanPayment({ loanId: loan.id, date: "2026-01-15", interest: -1, principal: 100 }),
    ).toThrow();
  });

  it("refuses a loan kind Schedule F has no line for", () => {
    expect(() =>
      // @ts-expect-error deliberately invalid, to prove the CHECK constraint bites
      store.createLoan({ name: "x", kind: "personal", principal: 100 }),
    ).toThrow();
  });

  it("filters payments by date range for the export", () => {
    const loan = makeLoan();
    store.addLoanPayment({ loanId: loan.id, date: "2025-06-01", interest: 1_00, principal: 0 });
    store.addLoanPayment({ loanId: loan.id, date: "2026-06-01", interest: 2_00, principal: 0 });

    expect(store.listAllLoanPayments("2026-01-01", "2026-12-31")).toHaveLength(1);
    expect(store.listAllLoanPayments()).toHaveLength(2);
  });

  it("lists payments newest first", () => {
    const loan = makeLoan();
    store.addLoanPayment({ loanId: loan.id, date: "2026-01-15", interest: 1_00, principal: 0 });
    store.addLoanPayment({ loanId: loan.id, date: "2026-03-15", interest: 2_00, principal: 0 });
    expect(store.listLoanPayments(loan.id).map((p) => p.date)).toEqual([
      "2026-03-15",
      "2026-01-15",
    ]);
  });
});

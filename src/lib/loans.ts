/**
 * Farm loans, and the interest that comes off them.
 *
 * Only interest is deductible; principal is not an expense, it is the money
 * you borrowed going back. Escrow is whatever the lender bundles in - property
 * tax, insurance - which belongs on its own Schedule F line, not on 21.
 *
 * Nothing here amortises a payment for you. The split between interest and
 * principal comes from the lender's statement, because that is the number the
 * IRS will see on a Form 1098 and the one a preparer will reconcile to.
 */

import type { Loan, LoanKind, LoanPayment } from "./db/types";
import type { Cents } from "./money";

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  mortgage: "Mortgage on farm property",
  other: "Other farm loan",
};

/** Which Schedule F line a loan's interest belongs on. */
export const LOAN_KIND_LINES: Record<LoanKind, string> = {
  mortgage: "21a",
  other: "21b",
};

/** The total of a payment is always the sum of its parts. */
export function paymentTotal(payment: {
  interest: Cents;
  principal: Cents;
  escrow: Cents;
}): Cents {
  return payment.interest + payment.principal + payment.escrow;
}

export interface LoanTotals {
  interest: Cents;
  principal: Cents;
  escrow: Cents;
  total: Cents;
}

export function totalPayments(payments: LoanPayment[]): LoanTotals {
  const totals = payments.reduce(
    (sum, p) => ({
      interest: sum.interest + p.interest,
      principal: sum.principal + p.principal,
      escrow: sum.escrow + p.escrow,
    }),
    { interest: 0, principal: 0, escrow: 0 },
  );
  return { ...totals, total: totals.interest + totals.principal + totals.escrow };
}

export interface LoanSummary {
  loan: Loan;
  /** Everything paid, over the life of the loan. */
  paid: LoanTotals;
  /** Original principal less the principal repaid. Never below zero. */
  balance: Cents;
  /** Interest paid in the year asked about - what reaches Schedule F. */
  interestInYear: Cents;
  paymentCount: number;
}

export function summarizeLoan(
  loan: Loan,
  payments: LoanPayment[],
  year: number,
): LoanSummary {
  const paid = totalPayments(payments);
  const interestInYear = payments
    .filter((p) => p.date.slice(0, 4) === String(year))
    .reduce((sum, p) => sum + p.interest, 0);

  return {
    loan,
    paid,
    // Overpaying principal should read as cleared, not as a negative balance.
    balance: Math.max(0, loan.principal - paid.principal),
    interestInYear,
    paymentCount: payments.length,
  };
}

export interface InterestByLine {
  /** Schedule F line 21a. */
  mortgage: Cents;
  /** Schedule F line 21b. */
  other: Cents;
  total: Cents;
}

/**
 * Interest paid in one tax year, split the way Schedule F splits it.
 * Payments belonging to a loan that no longer exists are ignored.
 */
export function interestForYear(
  loans: Loan[],
  payments: LoanPayment[],
  year: number,
): InterestByLine {
  const kindOf = new Map(loans.map((loan) => [loan.id, loan.kind]));
  let mortgage = 0;
  let other = 0;

  for (const payment of payments) {
    if (payment.date.slice(0, 4) !== String(year)) continue;
    const kind = kindOf.get(payment.loanId);
    if (!kind) continue;
    if (kind === "mortgage") mortgage += payment.interest;
    else other += payment.interest;
  }

  return { mortgage, other, total: mortgage + other };
}

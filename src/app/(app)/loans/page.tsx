import Link from "next/link";

import { ChevronIcon } from "@/components/icons";
import { ButtonLink, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear } from "@/lib/dates";
import { LOAN_KIND_LINES, interestForYear, summarizeLoan } from "@/lib/loans";
import { formatUsd } from "@/lib/money";

export const metadata = { title: "Loans · Schedule F Books" };

export default async function LoansPage() {
  await requireUser();
  const store = getStore();
  const year = currentYear();

  const loans = store.listLoans();
  const summaries = loans.map((loan) =>
    summarizeLoan(loan, store.listLoanPayments(loan.id), year),
  );

  const interest = interestForYear(loans, store.listAllLoanPayments(), year);
  const owed = summaries.reduce((sum, s) => sum + s.balance, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loans"
        subtitle={`Interest paid in ${year} reaches Schedule F lines 21a and 21b.`}
        action={
          <ButtonLink href="/loans/new" variant="secondary">
            Add
          </ButtonLink>
        }
      />

      {loans.length === 0 ? (
        <EmptyState
          title="No loans yet"
          body="Add a mortgage or an operating loan, record its payments, and the interest lands on your Schedule F."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={`${year} interest`} cents={interest.total} tone="expense" small />
            <Stat label="Still owed" cents={owed} small />
          </div>

          {interest.total > 0 ? (
            <p className="text-xs text-muted">
              {formatUsd(interest.mortgage)} on line 21a (mortgage) ·{" "}
              {formatUsd(interest.other)} on line 21b (other).
            </p>
          ) : null}

          <ul className="card divide-y divide-[var(--border)] overflow-hidden p-0">
            {summaries.map(({ loan, balance, interestInYear }) => (
              <li key={loan.id}>
                <Link
                  href={`/loans/${loan.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {loan.name}
                      {balance === 0 && loan.principal > 0 ? (
                        <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                          cleared
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {loan.lender ? `${loan.lender} · ` : ""}line {LOAN_KIND_LINES[loan.kind]} ·{" "}
                      {formatUsd(balance)} owed
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular font-semibold text-expense">
                      {formatUsd(interestInYear)}
                    </p>
                    <p className="text-xs text-muted">{year} interest</p>
                  </div>
                  <ChevronIcon className="h-5 w-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-xs text-muted leading-relaxed">
        Only interest is deductible. Principal is the money you borrowed going back, and escrow —
        property tax or insurance the lender collects — belongs on its own line, not on 21.
      </p>
    </div>
  );
}

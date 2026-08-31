import Link from "next/link";

import { ArrowDownIcon, ArrowUpIcon, ClockIcon } from "@/components/icons";
import { TransactionList } from "@/components/transaction-row";
import { ButtonLink, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { summarizeYear } from "@/lib/assets";
import { interestForYear } from "@/lib/loans";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { formatUsd } from "@/lib/money";
import { buildReport } from "@/lib/report";

export const metadata = { title: "Schedule F Books" };

const QUICK_ACTIONS = [
  { href: "/expenses/new", label: "Expense", Icon: ArrowUpIcon, tone: "text-expense" },
  { href: "/income/new", label: "Income", Icon: ArrowDownIcon, tone: "text-income" },
  { href: "/time", label: "Hours", Icon: ClockIcon, tone: "text-accent" },
] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const store = getStore();
  const year = currentYear();

  const depreciation = summarizeYear(store.listAssets(), year);
  const loanInterest = interestForYear(store.listLoans(), store.listAllLoanPayments(), year);
  const report = buildReport(year, store.categoryTotals(year), {
    assetDepreciation: depreciation.total,
    loanInterest,
  });
  const recent = store.listTransactions({ limit: 6 });
  const minutes = store.totalMinutes(user.id, year);

  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader title={`Hello, ${firstName}`} subtitle={`Your ${year} farm books at a glance.`} />

      <section aria-label="Quick actions" className="grid grid-cols-3 gap-3">
        {QUICK_ACTIONS.map(({ href, label, Icon, tone }) => (
          <Link
            key={href}
            href={href}
            className="card flex flex-col items-center gap-1.5 py-4 hover:bg-surface-muted transition-colors"
          >
            <Icon className={`h-6 w-6 ${tone}`} />
            <span className="text-sm font-medium">{label}</span>
          </Link>
        ))}
      </section>

      <section aria-label={`${year} totals`} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Gross income" cents={report.grossIncome} tone="income" small />
          <Stat label="Expenses" cents={report.totalExpenses} tone="expense" small />
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">
            Net farm {report.netProfit < 0 ? "loss" : "profit"} · Schedule F line 34
          </p>
          <p
            className={`tabular text-3xl font-semibold ${
              report.netProfit < 0 ? "text-expense" : "text-income"
            }`}
          >
            {report.netProfit < 0 ? "−" : ""}$
            {(Math.abs(report.netProfit) / 100).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="mt-1 text-xs text-muted">
            {report.transactionCount} {report.transactionCount === 1 ? "entry" : "entries"} ·{" "}
            {formatDuration(minutes)} logged
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent entries</h2>
          <Link href="/transactions" className="text-sm text-accent underline">
            All entries
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            title="No entries yet"
            body="Record your first expense or sale and the Schedule F report builds itself."
          />
        ) : (
          <TransactionList transactions={recent} />
        )}
      </section>

      {depreciation.total > 0 ? (
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">Depreciation · line 14</p>
            <p className="text-sm text-muted">
              {formatUsd(depreciation.total)} from {depreciation.rows.length}{" "}
              {depreciation.rows.length === 1 ? "asset" : "assets"} this year.
            </p>
          </div>
          <ButtonLink href="/assets" variant="secondary">
            Assets
          </ButtonLink>
        </Card>
      ) : null}

      {loanInterest.total > 0 ? (
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">Loan interest · lines 21a/21b</p>
            <p className="text-sm text-muted">
              {formatUsd(loanInterest.total)} paid this year.
            </p>
          </div>
          <ButtonLink href="/loans" variant="secondary">
            Loans
          </ButtonLink>
        </Card>
      ) : null}

      {report.transactionCount > 0 || depreciation.total > 0 || loanInterest.total > 0 ? (
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Year-end report</p>
            <p className="text-sm text-muted">Every line, ready for your preparer.</p>
          </div>
          <ButtonLink href="/report" variant="secondary">
            View
          </ButtonLink>
        </Card>
      ) : null}
    </div>
  );
}

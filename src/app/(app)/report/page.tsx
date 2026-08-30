import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear } from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import { buildReport, type ReportLine } from "@/lib/report";

export const metadata = { title: "Schedule F · Schedule F Books" };

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; all?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const store = getStore();

  const years = store.transactionYears();
  const requested = Number(params.year);
  const year =
    Number.isInteger(requested) && requested > 1900
      ? requested
      : (years[0] ?? currentYear());

  const showAll = params.all === "1";
  const report = buildReport(year, store.categoryTotals(year));

  const visible = (lines: ReportLine[]) =>
    showAll ? lines : lines.filter((l) => l.amount !== 0 || l.count > 0 || l.computed);

  const incomeRows = visible(report.income);
  const expenseRows = visible(report.expenses);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Schedule F · ${year}`}
        subtitle={`${report.transactionCount} ${
          report.transactionCount === 1 ? "entry" : "entries"
        } rolled up by line.`}
      />

      <div className="no-print flex flex-wrap items-center gap-2">
        {years.length > 1
          ? years.map((y) => (
              <Link
                key={y}
                href={`/report?year=${y}${showAll ? "&all=1" : ""}`}
                aria-current={y === year ? "true" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm ${
                  y === year
                    ? "bg-accent text-white dark:text-[#12140f]"
                    : "border border-line bg-surface text-muted hover:bg-surface-muted"
                }`}
              >
                {y}
              </Link>
            ))
          : null}

        <div className="ml-auto flex gap-2">
          <Link
            href={`/report?year=${year}${showAll ? "" : "&all=1"}`}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted hover:bg-surface-muted"
          >
            {showAll ? "Used lines only" : "Show every line"}
          </Link>
          <a
            href={`/report/${year}.csv`}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted hover:bg-surface-muted"
          >
            CSV
          </a>
        </div>
      </div>

      <Section title="Part I · Farm income">
        {incomeRows.map((line) => (
          <LineRow key={`${line.line}-${line.label}`} line={line} />
        ))}
        <TotalRow line="9" label="Gross income" amount={report.grossIncome} />
      </Section>

      <Section title="Part II · Farm expenses">
        {expenseRows.map((line) => (
          <LineRow key={`${line.line}-${line.label}`} line={line} />
        ))}
        <TotalRow line="33" label="Total expenses" amount={report.totalExpenses} />
      </Section>

      <div className="card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="font-semibold">
              Net farm {report.netProfit < 0 ? "loss" : "profit"}
            </p>
            <p className="text-xs text-muted">Line 34 · gross income less total expenses</p>
          </div>
          <p
            className={`tabular text-2xl font-semibold ${
              report.netProfit < 0 ? "text-expense" : "text-income"
            }`}
          >
            {formatUsd(report.netProfit)}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        This is a summary of what you recorded, not tax advice, and not a filable form. Taxable-amount
        lines (3b, 4b, 5c, 6b) are shown equal to the gross amounts entered; elections and deferrals
        are not modelled, and line 32 is a single bucket rather than 32a–32f. Check it against the
        current year&rsquo;s Schedule F instructions, and have a preparer review it before you file.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="card divide-y divide-[var(--border)] overflow-hidden p-0">{children}</div>
    </section>
  );
}

function LineRow({ line }: { line: ReportLine }) {
  const empty = line.amount === 0 && line.count === 0;

  return (
    <div
      className={`flex items-baseline gap-3 px-4 py-2.5 text-sm ${
        line.computed ? "bg-surface-muted font-medium" : ""
      } ${empty ? "text-muted" : ""}`}
    >
      <span className="tabular w-9 shrink-0 text-muted">{line.line}</span>
      <span className="min-w-0 flex-1">
        {line.label}
        {line.contra ? <span className="text-muted"> (subtracted)</span> : null}
      </span>
      {line.count > 0 ? (
        <span className="tabular hidden shrink-0 text-xs text-muted sm:inline">
          {line.count}
        </span>
      ) : null}
      <span className="tabular shrink-0 font-medium">{formatUsd(line.amount)}</span>
    </div>
  );
}

function TotalRow({ line, label, amount }: { line: string; label: string; amount: number }) {
  return (
    <div className="flex items-baseline gap-3 bg-accent-soft px-4 py-3 text-sm font-semibold">
      <span className="tabular w-9 shrink-0">{line}</span>
      <span className="flex-1">{label}</span>
      <span className="tabular">{formatUsd(amount)}</span>
    </div>
  );
}

import Link from "next/link";

import { TransactionList } from "@/components/transaction-row";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear } from "@/lib/dates";
import type { CategoryKind } from "@/lib/schedule-f";

export const metadata = { title: "Books · Schedule F Books" };

const PAGE_SIZE = 50;

function parseKind(value: string | undefined): CategoryKind | undefined {
  return value === "income" || value === "expense" ? value : undefined;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; year?: string; page?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const store = getStore();

  const years = store.transactionYears();
  const requestedYear = Number(params.year);
  const year =
    Number.isInteger(requestedYear) && years.includes(requestedYear)
      ? requestedYear
      : (years[0] ?? currentYear());

  const kind = parseKind(params.kind);
  const page = Math.max(1, Number(params.page) || 1);

  const filter = { kind, year };
  const total = store.countTransactions(filter);
  const transactions = store.listTransactions({
    ...filter,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const totals = store.categoryTotals(year);
  const byKind = (want: CategoryKind) =>
    store
      .listTransactions({ year, kind: want })
      .reduce((sum, t) => sum + t.amount, 0);
  const incomeTotal = byKind("income");
  const expenseTotal = byKind("expense");

  const hasMore = page * PAGE_SIZE < total;

  /** Build a link that keeps the current filters, with the given overrides applied. */
  const query = (overrides: {
    kind?: CategoryKind | undefined;
    year?: number;
    page?: number;
  }): string => {
    const merged = { kind, year, page, ...overrides };
    const next = new URLSearchParams();
    if (merged.kind) next.set("kind", merged.kind);
    next.set("year", String(merged.year));
    // Page 1 is the default; leaving it out keeps the URL clean.
    if (merged.page > 1) next.set("page", String(merged.page));
    return `/transactions?${next.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Books" subtitle={`${total} ${total === 1 ? "entry" : "entries"} in ${year}`} />

      {totals.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Income" cents={incomeTotal} tone="income" small />
          <Stat label="Expenses" cents={expenseTotal} tone="expense" small />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Filter href={query({ kind: undefined, page: 1 })} active={!kind} label="All" />
        <Filter href={query({ kind: "income", page: 1 })} active={kind === "income"} label="Income" />
        <Filter
          href={query({ kind: "expense", page: 1 })}
          active={kind === "expense"}
          label="Expenses"
        />

        {years.length > 1 ? (
          <div className="ml-auto flex gap-1.5">
            {years.map((y) => (
              <Filter key={y} href={query({ year: y, page: 1 })} active={y === year} label={String(y)} />
            ))}
          </div>
        ) : null}
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body={kind ? `No ${kind} entries recorded for ${year}.` : `No entries recorded for ${year}.`}
        />
      ) : (
        <TransactionList transactions={transactions} />
      )}

      {total > PAGE_SIZE ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link href={query({ page: page - 1 })} className="text-accent underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {page} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          {hasMore ? (
            <Link href={query({ page: page + 1 })} className="text-accent underline">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function Filter({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "bg-accent text-white dark:text-[#12140f]"
          : "border border-line bg-surface text-muted hover:bg-surface-muted"
      }`}
    >
      {label}
    </Link>
  );
}

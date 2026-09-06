import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { suggestCategory } from "@/lib/categorise";
import { currentYear } from "@/lib/dates";
import { getStore } from "@/lib/db";
import { formatUsd } from "@/lib/money";
import { categoriesFor } from "@/lib/schedule-f";

import { AcceptConfident, ReviewRow } from "./review-client";

export const metadata = { title: "Sort expenses · Schedule F Books" };

/**
 * Clearing the catch-all line.
 *
 * Line 32 is where an imported expense lands when the file it came from had no
 * Schedule F column - which is every bank and card export ever written. A
 * return whose expenses are entirely "other" gives a preparer nothing to work
 * with, so this screen exists to empty that line before it matters.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const store = getStore();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) && requested > 1900 ? requested : undefined;

  const pending = store.listTransactions({
    kind: "expense",
    categoryId: "other_expense",
    year,
  });

  const rows = pending.map((entry) => ({
    entry,
    suggestion: suggestCategory(entry.payee, entry.description),
  }));

  const confident = rows.filter((r) => r.suggestion?.confidence === "strong").length;
  const categories = categoriesFor("expense").filter((c) => c.id !== "other_expense");
  const years = store.transactionYears();

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sort expenses" />
        <div className="card p-8 text-center">
          <p className="font-medium">Nothing waiting on the catch-all line</p>
          <p className="mt-1 text-sm text-muted">
            Every expense{year ? ` in ${year}` : ""} is filed on a Schedule F line of its own.
          </p>
          <Link href="/report" className="mt-3 inline-block text-sm text-accent underline">
            See the Schedule F report
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sort expenses"
        subtitle={`${rows.length} ${rows.length === 1 ? "entry is" : "entries are"} on line 32, "other expenses"${year ? ` in ${year}` : ""}.`}
      />

      <div className="card space-y-3 p-4">
        <p className="text-sm">
          A CSV from a bank or card never names a Schedule F line, so imported expenses land here.
          Filing them properly is what turns the year-end report from one lump sum into something
          your preparer can use — and a return that is all &ldquo;other expenses&rdquo; is the kind
          that gets questions asked.
        </p>
        <p className="text-sm text-muted">
          Suggestions come from words in the payee and description. They are guesses, and the ones
          marked <em>worth a look</em> are guesses the rules are less sure of. Nothing moves until
          you file it.
        </p>
        <AcceptConfident count={confident} />
      </div>

      {years.length > 1 ? (
        <nav className="flex flex-wrap gap-2 text-sm">
          <YearChip href="/review" label="All years" active={year == null} />
          {years.map((y) => (
            <YearChip
              key={y}
              href={`/review?year=${y}`}
              label={String(y)}
              active={year === y}
            />
          ))}
        </nav>
      ) : null}

      <ul className="space-y-3">
        {rows.map(({ entry, suggestion }) => (
          <ReviewRow
            key={entry.id}
            id={entry.id}
            date={entry.date}
            payee={entry.payee}
            description={entry.description}
            amount={formatUsd(entry.amount)}
            categories={categories.map((c) => ({ id: c.id, line: c.line, label: c.label }))}
            suggestion={
              suggestion
                ? {
                    id: suggestion.category.id,
                    line: suggestion.category.line,
                    label: suggestion.category.label,
                    matchedOn: suggestion.matchedOn,
                    confidence: suggestion.confidence,
                  }
                : null
            }
          />
        ))}
      </ul>

      <p className="text-xs text-muted">
        Anything genuinely miscellaneous can stay on line 32 — leave it here and it will be
        counted there. The current tax year is {currentYear()}.
      </p>
    </div>
  );
}

function YearChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-xl border px-3 transition-colors active:bg-surface-muted ${
        active ? "border-accent bg-accent-soft font-medium" : "border-line bg-surface"
      }`}
    >
      {label}
    </Link>
  );
}

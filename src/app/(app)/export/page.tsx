import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear, today } from "@/lib/dates";

import { ExportChooser, type ExportCounts } from "./chooser";

export const metadata = { title: "Export · Schedule F Books" };

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const store = getStore();

  // Per-year tallies, so the chooser can size any range the user picks without
  // going back to the server on every change.
  const transactionsByYear: Record<number, number> = {};
  const receiptsByYear: Record<number, number> = {};
  const receiptBytesByYear: Record<number, number> = {};
  const timeEntriesByYear: Record<number, number> = {};

  for (const transaction of store.listTransactions()) {
    const year = Number(transaction.date.slice(0, 4));
    transactionsByYear[year] = (transactionsByYear[year] ?? 0) + 1;
    if (transaction.receiptCount > 0) {
      for (const receipt of store.listReceipts(transaction.id)) {
        receiptsByYear[year] = (receiptsByYear[year] ?? 0) + 1;
        receiptBytesByYear[year] = (receiptBytesByYear[year] ?? 0) + receipt.byteSize;
      }
    }
  }

  for (const entry of store.listTimeEntriesInRange("1900-01-01", "2999-12-31", user.id)) {
    const year = Number(entry.date.slice(0, 4));
    timeEntriesByYear[year] = (timeEntriesByYear[year] ?? 0) + 1;
  }

  const activeYears = [
    ...new Set([
      ...Object.keys(transactionsByYear).map(Number),
      ...Object.keys(timeEntriesByYear).map(Number),
      currentYear(),
    ]),
  ].sort((a, b) => b - a);

  const counts: ExportCounts = {
    transactionsByYear,
    timeEntriesByYear,
    receiptsByYear,
    receiptBytesByYear,
    assetCount: store.listAssets().length,
    activeYears,
    isOwner: user.role === "owner",
  };

  // Arriving from the report's "Full export" link pre-selects that year.
  const requested = Number(params.year);
  const initialYear =
    Number.isInteger(requested) && requested > 1900 ? requested : currentYear();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Export"
        subtitle="A package to archive, or to hand to whoever prepares the return."
      />
      <ExportChooser counts={counts} today={today()} initialYear={initialYear} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { ReceiptIcon, TrashIcon } from "@/components/icons";
import { Button, ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { prettyDate } from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import { getCategory } from "@/lib/schedule-f";

import { deleteReceipt, deleteTransaction } from "../actions";

export const metadata = { title: "Entry · Schedule F Books" };

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId)) notFound();

  const store = getStore();
  const transaction = store.getTransaction(transactionId);
  if (!transaction) notFound();

  const receipts = store.listReceipts(transactionId);
  const category = getCategory(transaction.categoryId);
  const isIncome = transaction.kind === "income";

  return (
    <div className="space-y-5">
      <PageHeader
        title={transaction.payee ?? (isIncome ? "Income" : "Expense")}
        subtitle={prettyDate(transaction.date)}
        action={
          <ButtonLink href={`/transactions/${transactionId}/edit`} variant="secondary">
            Edit
          </ButtonLink>
        }
      />

      <Card>
        <p className={`tabular text-3xl font-semibold ${isIncome ? "text-income" : "text-expense"}`}>
          {isIncome ? "+" : "−"}
          {formatUsd(transaction.amount)}
        </p>

        <dl className="mt-4 space-y-2.5 text-sm">
          <Row label="Schedule F line">
            {category ? (
              <span>
                <span className="tabular font-medium">{category.line}</span> · {category.label}
              </span>
            ) : (
              <span className="text-danger">Unknown category ({transaction.categoryId})</span>
            )}
          </Row>
          {transaction.paymentMethod ? (
            <Row label="Paid by">{transaction.paymentMethod}</Row>
          ) : null}
          {transaction.description ? (
            <Row label="Description">{transaction.description}</Row>
          ) : null}
          {transaction.createdByName ? (
            <Row label="Entered by">{transaction.createdByName}</Row>
          ) : null}
        </dl>
      </Card>

      <section className="space-y-3">
        <h2 className="font-semibold">
          Receipts{receipts.length > 0 ? ` (${receipts.length})` : ""}
        </h2>

        {receipts.length === 0 ? (
          <Card className="flex items-center gap-3 text-sm text-muted">
            <ReceiptIcon className="h-5 w-5 shrink-0" />
            <span>No receipt attached. You can add one from Edit.</span>
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="relative">
                <a
                  href={`/api/receipts/${receipt.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square overflow-hidden rounded-xl border border-line bg-surface-muted"
                >
                  {receipt.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/receipts/${receipt.id}`}
                      alt="Receipt"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center gap-1 text-muted">
                      <ReceiptIcon className="h-8 w-8" />
                      <span className="text-xs">PDF</span>
                    </div>
                  )}
                </a>
                <form action={deleteReceipt} className="absolute -right-1.5 -top-1.5">
                  <input type="hidden" name="receiptId" value={receipt.id} />
                  <input type="hidden" name="transactionId" value={transactionId} />
                  <button
                    type="submit"
                    aria-label="Delete this receipt"
                    className="grid h-7 w-7 place-items-center rounded-full bg-danger text-white shadow"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center justify-between pt-2">
        <Link href="/transactions" className="text-sm text-accent underline">
          ← Back to books
        </Link>
        <form action={deleteTransaction}>
          <input type="hidden" name="id" value={transactionId} />
          <Button type="submit" variant="danger">
            <TrashIcon className="h-4 w-4" />
            Delete entry
          </Button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

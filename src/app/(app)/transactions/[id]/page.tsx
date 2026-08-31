import Link from "next/link";
import { notFound } from "next/navigation";

import { TrashIcon } from "@/components/icons";
import { ReceiptGallery } from "@/components/receipt-gallery";
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

        <ReceiptGallery
          receipts={receipts}
          ownerField="transactionId"
          ownerId={transactionId}
          onDelete={deleteReceipt}
          emptyMessage="No receipt attached. You can add one from Edit."
        />
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

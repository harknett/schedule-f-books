import { notFound } from "next/navigation";

import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { today } from "@/lib/dates";

import { updateTransaction } from "../../actions";

export const metadata = { title: "Edit entry · Schedule F Books" };

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId)) notFound();

  const transaction = getStore().getTransaction(transactionId);
  if (!transaction) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Edit ${transaction.kind}`}
        subtitle="Changes are reflected in the Schedule F report immediately."
      />
      <TransactionForm
        kind={transaction.kind}
        action={updateTransaction.bind(null, transactionId)}
        today={today()}
        existing={transaction}
        submitLabel="Save changes"
      />
    </div>
  );
}

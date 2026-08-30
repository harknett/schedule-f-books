import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { today } from "@/lib/dates";

import { createTransaction } from "../../transactions/actions";

export const metadata = { title: "New expense · Schedule F Books" };

export default async function NewExpensePage() {
  await requireUser();

  return (
    <div className="space-y-5">
      <PageHeader title="New expense" subtitle="Money out — attach the receipt while you have it." />
      <TransactionForm
        kind="expense"
        action={createTransaction}
        today={today()}
        submitLabel="Save expense"
      />
    </div>
  );
}

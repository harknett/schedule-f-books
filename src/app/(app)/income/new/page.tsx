import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { today } from "@/lib/dates";

import { createTransaction } from "../../transactions/actions";

export const metadata = { title: "New income · Schedule F Books" };

export default async function NewIncomePage() {
  await requireUser();

  return (
    <div className="space-y-5">
      <PageHeader title="New income" subtitle="Money in — sales, program payments, custom work." />
      <TransactionForm
        kind="income"
        action={createTransaction}
        today={today()}
        submitLabel="Save income"
      />
    </div>
  );
}

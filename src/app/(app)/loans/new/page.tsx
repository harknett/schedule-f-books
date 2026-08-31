import { LoanForm } from "@/components/loan-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";

import { createLoan } from "../actions";

export const metadata = { title: "Add loan · Schedule F Books" };

export default async function NewLoanPage() {
  await requireUser();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Add a loan"
        subtitle="A mortgage on farm property, an operating loan, or equipment finance."
      />
      <LoanForm action={createLoan} submitLabel="Save loan" />
    </div>
  );
}

import { notFound } from "next/navigation";

import { LoanForm } from "@/components/loan-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";

import { updateLoan } from "../../actions";

export const metadata = { title: "Edit loan · Schedule F Books" };

export default async function EditLoanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const loanId = Number(id);
  if (!Number.isInteger(loanId)) notFound();

  const loan = getStore().getLoan(loanId);
  if (!loan) notFound();

  return (
    <div className="space-y-5">
      <PageHeader title={`Edit ${loan.name}`} />
      <LoanForm action={updateLoan.bind(null, loanId)} existing={loan} submitLabel="Save changes" />
    </div>
  );
}

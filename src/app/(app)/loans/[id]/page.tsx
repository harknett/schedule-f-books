import Link from "next/link";
import { notFound } from "next/navigation";

import { TrashIcon } from "@/components/icons";
import { Button, ButtonLink, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear, prettyDate, shortDate, today } from "@/lib/dates";
import { LOAN_KIND_LABELS, LOAN_KIND_LINES, paymentTotal, summarizeLoan } from "@/lib/loans";
import { formatUsd } from "@/lib/money";

import { deleteLoan, deletePayment } from "../actions";
import { PaymentForm } from "./payment-form";

export const metadata = { title: "Loan · Schedule F Books" };

export default async function LoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const loanId = Number(id);
  if (!Number.isInteger(loanId)) notFound();

  const store = getStore();
  const loan = store.getLoan(loanId);
  if (!loan) notFound();

  const payments = store.listLoanPayments(loanId);
  const year = currentYear();
  const { paid, balance, interestInYear } = summarizeLoan(loan, payments, year);

  const repaidShare = loan.principal > 0 ? (paid.principal / loan.principal) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={loan.name}
        subtitle={`${LOAN_KIND_LABELS[loan.kind]} · interest on line ${LOAN_KIND_LINES[loan.kind]}`}
        action={
          <ButtonLink href={`/loans/${loanId}/edit`} variant="secondary">
            Edit
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat label={`${year} interest`} cents={interestInYear} tone="expense" small />
        <Stat label="Still owed" cents={balance} small />
      </div>

      <Card className="space-y-3">
        <dl className="space-y-2.5 text-sm">
          <Row label="Borrowed">{formatUsd(loan.principal)}</Row>
          <Row label="Principal repaid">
            {formatUsd(paid.principal)}
            {loan.principal > 0 ? (
              <span className="text-muted"> · {repaidShare.toFixed(1)}%</span>
            ) : null}
          </Row>
          <Row label="Interest paid, all time">{formatUsd(paid.interest)}</Row>
          {paid.escrow > 0 ? <Row label="Escrow paid">{formatUsd(paid.escrow)}</Row> : null}
          {loan.lender ? <Row label="Lender">{loan.lender}</Row> : null}
          {loan.interestRate != null ? <Row label="Rate">{loan.interestRate}%</Row> : null}
          {loan.startDate ? <Row label="Started">{prettyDate(loan.startDate)}</Row> : null}
          {loan.notes ? <Row label="Notes">{loan.notes}</Row> : null}
        </dl>

        {loan.principal > 0 ? (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="presentation"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, repaidShare)}%` }}
            />
          </div>
        ) : null}
      </Card>

      <PaymentForm loanId={loanId} today={today()} />

      <section className="space-y-3">
        <h2 className="font-semibold">
          Payments{payments.length > 0 ? ` (${payments.length})` : ""}
        </h2>

        {payments.length === 0 ? (
          <EmptyState
            title="No payments recorded"
            body="Record them above and the interest reaches your Schedule F."
          />
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 text-right font-medium">Interest</th>
                    <th className="px-4 py-2.5 text-right font-medium">Principal</th>
                    <th className="px-4 py-2.5 text-right font-medium">Escrow</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                    <th className="px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="tabular px-4 py-2.5">
                        {shortDate(payment.date)}
                        <span className="text-muted"> {payment.date.slice(0, 4)}</span>
                        {payment.notes ? (
                          <span className="block text-xs text-muted">{payment.notes}</span>
                        ) : null}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-expense">
                        {formatUsd(payment.interest)}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-muted">
                        {formatUsd(payment.principal)}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-muted">
                        {payment.escrow > 0 ? formatUsd(payment.escrow) : "—"}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right font-medium">
                        {formatUsd(paymentTotal(payment))}
                      </td>
                      <td className="px-2 py-2.5">
                        <form action={deletePayment}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input type="hidden" name="loanId" value={loanId} />
                          <button
                            type="submit"
                            aria-label={`Delete the payment on ${payment.date}`}
                            className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-danger"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-surface-muted font-semibold">
                    <td className="px-4 py-2.5">All time</td>
                    <td className="tabular px-4 py-2.5 text-right">{formatUsd(paid.interest)}</td>
                    <td className="tabular px-4 py-2.5 text-right">{formatUsd(paid.principal)}</td>
                    <td className="tabular px-4 py-2.5 text-right">{formatUsd(paid.escrow)}</td>
                    <td className="tabular px-4 py-2.5 text-right">{formatUsd(paid.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-muted leading-relaxed">
          Only the interest column is deductible, and it reaches Schedule F line{" "}
          {LOAN_KIND_LINES[loan.kind]}. Principal repays what you borrowed and is not an expense;
          escrow is money the lender holds for tax or insurance, which belongs on whichever line
          it is eventually spent against.
        </p>
      </section>

      <div className="flex items-center justify-between pt-2">
        <Link href="/loans" className="text-sm text-accent underline">
          ← All loans
        </Link>
        <form action={deleteLoan}>
          <input type="hidden" name="id" value={loanId} />
          <Button type="submit" variant="danger">
            <TrashIcon className="h-4 w-4" />
            Delete loan
          </Button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-40 shrink-0 text-muted">{label}</dt>
      <dd className="tabular min-w-0 flex-1">{children}</dd>
    </div>
  );
}

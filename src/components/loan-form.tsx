"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Card, ErrorBanner, Field, Input, Select, Textarea } from "./ui";
import type { LoanFormState } from "@/app/(app)/loans/actions";
import type { Loan, LoanKind } from "@/lib/db/types";
import { LOAN_KIND_LABELS, LOAN_KIND_LINES } from "@/lib/loans";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function LoanForm({
  action,
  existing,
  submitLabel,
}: {
  action: (state: LoanFormState, formData: FormData) => Promise<LoanFormState>;
  existing?: Loan;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<LoanFormState, FormData>(action, {});
  const [kind, setKind] = useState<LoanKind>(existing?.kind ?? "mortgage");
  const [farmUse, setFarmUse] = useState(String(existing?.farmUsePercent ?? 100));

  const farmUseNumber = Number(farmUse);
  const partlyPersonal =
    Number.isFinite(farmUseNumber) && farmUseNumber > 0 && farmUseNumber < 100;

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <ErrorBanner message={state.error} />

        <Field label="What is the loan for?" htmlFor="name">
          <Input
            id="name"
            name="name"
            defaultValue={existing?.name ?? ""}
            placeholder="North quarter mortgage"
            autoCapitalize="sentences"
            required
          />
        </Field>

        <Field
          label="Kind"
          htmlFor="kind"
          hint={`Interest goes to Schedule F line ${LOAN_KIND_LINES[kind]}.`}
        >
          <Select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as LoanKind)}
          >
            {(Object.keys(LOAN_KIND_LABELS) as LoanKind[]).map((option) => (
              <option key={option} value={option}>
                {LOAN_KIND_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Amount borrowed" htmlFor="principal">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted">
                $
              </span>
              <Input
                id="principal"
                name="principal"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={existing ? (existing.principal / 100).toFixed(2) : ""}
                required
                className="pl-8 text-lg font-semibold tabular"
              />
            </div>
          </Field>

          <Field label="Lender" htmlFor="lender">
            <Input
              id="lender"
              name="lender"
              defaultValue={existing?.lender ?? ""}
              placeholder="Farm Credit"
              autoCapitalize="words"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Interest rate %" htmlFor="interestRate" hint="For reference only.">
            <Input
              id="interestRate"
              name="interestRate"
              inputMode="decimal"
              placeholder="6.25"
              defaultValue={existing?.interestRate != null ? String(existing.interestRate) : ""}
              className="tabular"
            />
          </Field>

          <Field
            label="Farm use %"
            htmlFor="farmUsePercent"
            hint="100 unless part of it is personal."
          >
            <Input
              id="farmUsePercent"
              name="farmUsePercent"
              inputMode="decimal"
              value={farmUse}
              onChange={(e) => setFarmUse(e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Start date" htmlFor="startDate">
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={existing?.startDate ?? ""}
            />
          </Field>
        </div>

        {partlyPersonal ? (
          <p className="rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm text-accent">
            {farmUseNumber}% of the interest on this loan will be deducted on line{" "}
            {LOAN_KIND_LINES[kind]}. Record payments in full — the share is applied when the
            deductible figure is worked out, so you can correct it later and every year re-runs.
          </p>
        ) : null}

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} defaultValue={existing?.notes ?? ""} />
        </Field>

        <p className="text-xs text-muted leading-relaxed">
          Payments are recorded against the loan afterwards, split into interest, principal, and
          escrow as your lender&rsquo;s statement reports them. Nothing is amortised from the rate:
          the split that reaches your return should be the one on the statement.
        </p>

        <Submit label={submitLabel} />
      </form>
    </Card>
  );
}

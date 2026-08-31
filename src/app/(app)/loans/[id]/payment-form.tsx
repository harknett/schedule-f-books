"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { addPayment, type PaymentFormState } from "../actions";
import { Button, Card, ErrorBanner, Field, Input, Textarea } from "@/components/ui";
import { formatUsd, parseAmount } from "@/lib/money";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Record payment"}
    </Button>
  );
}

/** Parse without throwing, for the running total. */
function tryAmount(value: string): number {
  if (value.trim() === "") return 0;
  try {
    return parseAmount(value);
  } catch {
    return 0;
  }
}

export function PaymentForm({ loanId, today }: { loanId: number; today: string }) {
  const [state, action] = useActionState<PaymentFormState, FormData>(
    addPayment.bind(null, loanId),
    {},
  );

  return (
    <Card>
      <form action={action} className="space-y-5">
        <div>
          <h2 className="font-semibold">Record a payment</h2>
          <p className="text-sm text-muted mt-0.5">
            Split it the way your lender&rsquo;s statement does.
          </p>
        </div>

        <ErrorBanner message={state.error} />
        {state.savedTotal != null && !state.error ? (
          <p className="rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm text-accent">
            Recorded {formatUsd(state.savedTotal)}.
          </p>
        ) : null}

        {/*
          Keyed on the save token: each successful save remounts the fields, so
          they come back empty for the next payment without an effect reaching
          in to clear them.
        */}
        <PaymentFields key={state.savedAt ?? 0} today={today} />

        <Submit />
      </form>
    </Card>
  );
}

function PaymentFields({ today }: { today: string }) {
  const [interest, setInterest] = useState("");
  const [principal, setPrincipal] = useState("");
  const [escrow, setEscrow] = useState("");

  const total = tryAmount(interest) + tryAmount(principal) + tryAmount(escrow);

  return (
    <>
      <Field label="Date" htmlFor="date">
        <Input id="date" name="date" type="date" defaultValue={today} required />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Interest" htmlFor="interest" hint="The deductible part.">
          <Input
            id="interest"
            name="interest"
            inputMode="decimal"
            placeholder="0.00"
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            className="tabular"
          />
        </Field>

        <Field label="Principal" htmlFor="principal" hint="Not an expense.">
          <Input
            id="principal"
            name="principal"
            inputMode="decimal"
            placeholder="0.00"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            className="tabular"
          />
        </Field>

        <Field label="Escrow" htmlFor="escrow" hint="Tax, insurance.">
          <Input
            id="escrow"
            name="escrow"
            inputMode="decimal"
            placeholder="0.00"
            value={escrow}
            onChange={(e) => setEscrow(e.target.value)}
            className="tabular"
          />
        </Field>
      </div>

      {total > 0 ? (
        <div className="flex items-baseline justify-between rounded-xl bg-surface-muted px-3 py-2.5">
          <span className="text-sm text-muted">Total payment</span>
          <span className="tabular text-lg font-semibold">{formatUsd(total)}</span>
        </div>
      ) : null}

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} placeholder="Optional." />
      </Field>
    </>
  );
}

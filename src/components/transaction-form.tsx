"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ReceiptPicker } from "./receipt-picker";
import { Button, Card, ErrorBanner, Field, Input, Select, Textarea } from "./ui";
import type { TransactionFormState } from "@/app/(app)/transactions/actions";
import type { TransactionWithMeta } from "@/lib/db/types";
import { categoriesFor, getCategory, type CategoryKind } from "@/lib/schedule-f";

const PAYMENT_METHODS = ["Cash", "Check", "Debit card", "Credit card", "Bank transfer", "Other"];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function TransactionForm({
  kind,
  action,
  today,
  existing,
  submitLabel,
}: {
  kind: CategoryKind;
  action: (state: TransactionFormState, formData: FormData) => Promise<TransactionFormState>;
  today: string;
  existing?: TransactionWithMeta;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<TransactionFormState, FormData>(action, {});
  const categories = categoriesFor(kind);
  const selected = existing ? getCategory(existing.categoryId) : undefined;

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <ErrorBanner message={state.error} />
        <input type="hidden" name="kind" value={kind} />

        <Field label="Amount" htmlFor="amount">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xl text-muted">
              $
            </span>
            <Input
              id="amount"
              name="amount"
              // A numeric keypad with a decimal point, not a full keyboard.
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={existing ? (existing.amount / 100).toFixed(2) : ""}
              required
              autoFocus={!existing}
              className="pl-8 text-2xl font-semibold tabular min-h-14"
            />
          </div>
        </Field>

        <Field
          label="Schedule F category"
          htmlFor="categoryId"
          hint={selected?.hint ?? "Filing it now means the year-end report adds itself up."}
        >
          <Select id="categoryId" name="categoryId" defaultValue={existing?.categoryId ?? ""} required>
            <option value="" disabled>
              Choose a category…
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.line} · {category.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Date" htmlFor="date">
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={existing?.date ?? today}
              required
            />
          </Field>

          <Field label={kind === "expense" ? "Paid to" : "Received from"} htmlFor="payee">
            <Input
              id="payee"
              name="payee"
              defaultValue={existing?.payee ?? ""}
              placeholder={kind === "expense" ? "Co-op, feed store…" : "Buyer, market…"}
              autoCapitalize="words"
            />
          </Field>
        </div>

        <Field label="Payment method" htmlFor="paymentMethod">
          <Select
            id="paymentMethod"
            name="paymentMethod"
            defaultValue={existing?.paymentMethod ?? ""}
          >
            <option value="">Not recorded</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Description"
          htmlFor="description"
          hint="What it was for. Line 32 'other' entries need this at filing time."
        >
          <Textarea
            id="description"
            name="description"
            defaultValue={existing?.description ?? ""}
            rows={2}
          />
        </Field>

        <Field label={existing ? "Add more receipts" : "Receipt"}>
          <ReceiptPicker />
        </Field>

        <Submit label={submitLabel} />
      </form>
    </Card>
  );
}

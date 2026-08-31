"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { ReceiptPicker } from "./receipt-picker";
import { Button, Card, ErrorBanner, Field, Input, Select, Textarea } from "./ui";
import type { AssetFormState } from "@/app/(app)/assets/actions";
import type { Asset } from "@/lib/db/types";
import {
  ASSET_CLASSES,
  CONVENTION_LABELS,
  METHOD_LABELS,
  computeSchedule,
  getAssetClass,
  type Convention,
  type DepreciationMethod,
} from "@/lib/depreciation";
import { formatUsd, parseAmount } from "@/lib/money";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Parse without throwing, for the live preview. */
function tryAmount(value: string): number | null {
  try {
    return parseAmount(value);
  } catch {
    return null;
  }
}

export function AssetForm({
  action,
  today,
  existing,
  submitLabel,
  midQuarterSuggested,
}: {
  action: (state: AssetFormState, formData: FormData) => Promise<AssetFormState>;
  today: string;
  existing?: Asset;
  submitLabel: string;
  /** True when this year's Q4 additions already exceed 40% of the total. */
  midQuarterSuggested?: boolean;
}) {
  const [state, formAction] = useActionState<AssetFormState, FormData>(action, {});

  const [assetClassId, setAssetClassId] = useState(existing?.assetClassId ?? "7");
  const [method, setMethod] = useState<DepreciationMethod>(existing?.method ?? "200DB");
  const [convention, setConvention] = useState<Convention>(
    existing?.convention ?? (midQuarterSuggested ? "mid-quarter" : "half-year"),
  );
  const [cost, setCost] = useState(existing ? (existing.cost / 100).toFixed(2) : "");
  const [placedInService, setPlacedInService] = useState(existing?.placedInService ?? today);
  const [section179, setSection179] = useState(
    existing && existing.section179 > 0 ? (existing.section179 / 100).toFixed(2) : "",
  );
  const [bonusPercent, setBonusPercent] = useState(String(existing?.bonusPercent ?? 0));
  const [businessUse, setBusinessUse] = useState(String(existing?.businessUsePercent ?? 100));

  const assetClass = getAssetClass(assetClassId);

  /** Switching class resets the method and convention to what that class uses. */
  function chooseClass(nextId: string) {
    setAssetClassId(nextId);
    const next = getAssetClass(nextId);
    if (!next) return;
    setMethod(next.defaultMethod);
    setConvention(
      next.realProperty ? "mid-month" : midQuarterSuggested ? "mid-quarter" : "half-year",
    );
  }

  // Live schedule, so the first-year deduction is visible before saving.
  const preview = useMemo(() => {
    const costCents = tryAmount(cost);
    if (costCents == null || costCents <= 0 || !assetClass) return null;
    try {
      return computeSchedule({
        cost: costCents,
        placedInService,
        assetClassId,
        method,
        convention,
        section179: tryAmount(section179) ?? 0,
        bonusPercent: Number(bonusPercent) || 0,
        businessUsePercent: Number(businessUse) || 100,
      });
    } catch {
      return null;
    }
  }, [cost, placedInService, assetClassId, method, convention, section179, bonusPercent, businessUse, assetClass]);

  const methodChoices: DepreciationMethod[] = assetClass?.realProperty
    ? ["SL"]
    : ["200DB", "150DB", "SL"];
  const conventionChoices: Convention[] = assetClass?.realProperty
    ? ["mid-month"]
    : ["half-year", "mid-quarter"];

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <ErrorBanner message={state.error} />

        <Field label="What is it?" htmlFor="name">
          <Input
            id="name"
            name="name"
            defaultValue={existing?.name ?? ""}
            placeholder="John Deere 5075E"
            autoCapitalize="words"
            required
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Cost" htmlFor="cost">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted">
                $
              </span>
              <Input
                id="cost"
                name="cost"
                inputMode="decimal"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                required
                className="pl-8 text-lg font-semibold tabular"
              />
            </div>
          </Field>

          <Field label="Placed in service" htmlFor="placedInService" hint="When you started using it.">
            <Input
              id="placedInService"
              name="placedInService"
              type="date"
              value={placedInService}
              onChange={(e) => setPlacedInService(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="Property class" htmlFor="assetClassId" hint={assetClass?.examples}>
          <Select
            id="assetClassId"
            name="assetClassId"
            value={assetClassId}
            onChange={(e) => chooseClass(e.target.value)}
            required
          >
            {ASSET_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Method" htmlFor="method">
            <Select
              id="method"
              name="method"
              value={method}
              onChange={(e) => setMethod(e.target.value as DepreciationMethod)}
            >
              {methodChoices.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Convention"
            htmlFor="convention"
            hint={
              midQuarterSuggested && !assetClass?.realProperty
                ? "More than 40% of this year's additions are in Q4, which makes mid-quarter mandatory."
                : undefined
            }
          >
            <Select
              id="convention"
              name="convention"
              value={convention}
              onChange={(e) => setConvention(e.target.value as Convention)}
            >
              {conventionChoices.map((c) => (
                <option key={c} value={c}>
                  {CONVENTION_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Section 179" htmlFor="section179" hint="Expensed up front.">
            <Input
              id="section179"
              name="section179"
              inputMode="decimal"
              placeholder="0.00"
              value={section179}
              onChange={(e) => setSection179(e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Bonus %" htmlFor="bonusPercent" hint="Of what 179 leaves.">
            <Input
              id="bonusPercent"
              name="bonusPercent"
              inputMode="decimal"
              value={bonusPercent}
              onChange={(e) => setBonusPercent(e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Business use %" htmlFor="businessUsePercent" hint="100 unless shared.">
            <Input
              id="businessUsePercent"
              name="businessUsePercent"
              inputMode="decimal"
              value={businessUse}
              onChange={(e) => setBusinessUse(e.target.value)}
              className="tabular"
            />
          </Field>
        </div>

        {preview ? (
          <div className="rounded-xl border border-accent/40 bg-accent-soft p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-accent">
              First year deduction · {placedInService.slice(0, 4)}
            </p>
            <p className="tabular text-2xl font-semibold text-accent">
              {formatUsd(preview.firstYearTotal)}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-4">
              <Split label="Section 179" value={formatUsd(preview.section179)} />
              <Split label="Bonus" value={formatUsd(preview.bonus)} />
              <Split
                label="MACRS year 1"
                value={formatUsd(preview.years[0]?.amount ?? 0)}
              />
              <Split label="Basis to recover" value={formatUsd(preview.depreciableBasis)} />
            </dl>
            <p className="text-xs text-muted">
              {preview.years.length > 0
                ? `Recovered over ${preview.years.length} tax years, ending ${preview.years.at(-1)!.year}.`
                : "Fully written off in the first year."}
            </p>
          </div>
        ) : null}

        <Field
          label={existing ? "Add more paperwork" : "Paperwork"}
          hint="Bill of sale, invoice, or finance agreement. Kept with the asset."
        >
          <ReceiptPicker />
        </Field>

        <details className="rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Disposal and notes
          </summary>
          <div className="mt-4 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Disposal date"
                htmlFor="disposedDate"
                hint="Leave empty while you still own it."
              >
                <Input
                  id="disposedDate"
                  name="disposedDate"
                  type="date"
                  defaultValue={existing?.disposedDate ?? ""}
                />
              </Field>
              <Field label="Sale proceeds" htmlFor="disposalProceeds">
                <Input
                  id="disposalProceeds"
                  name="disposalProceeds"
                  inputMode="decimal"
                  placeholder="0.00"
                  defaultValue={
                    existing?.disposalProceeds != null
                      ? (existing.disposalProceeds / 100).toFixed(2)
                      : ""
                  }
                  className="tabular"
                />
              </Field>
            </div>
            <Field label="Description" htmlFor="description">
              <Input
                id="description"
                name="description"
                defaultValue={existing?.description ?? ""}
                placeholder="Serial number, dealer, condition"
              />
            </Field>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} defaultValue={existing?.notes ?? ""} />
            </Field>
          </div>
        </details>

        <Submit label={submitLabel} />
      </form>
    </Card>
  );
}

function Split({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="tabular font-medium text-foreground">{value}</dd>
    </div>
  );
}

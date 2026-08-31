"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import type { LoanKind, NewLoan } from "@/lib/db/types";
import { requireIsoDate } from "@/lib/dates";
import { parseAmount } from "@/lib/money";

export interface LoanFormState {
  error?: string;
}

export interface PaymentFormState {
  error?: string;
  savedTotal?: number;
  /** Unique per successful save; the form is keyed on it so the fields remount clear. */
  savedAt?: number;
}

function optional(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function readLoan(formData: FormData): Omit<NewLoan, "createdBy"> {
  const name = String(formData.get("name") ?? "").trim();
  if (name === "") throw new Error("Give the loan a name.");

  const kind = String(formData.get("kind") ?? "") as LoanKind;
  if (kind !== "mortgage" && kind !== "other") throw new Error("Choose what kind of loan it is.");

  const principal = parseAmount(String(formData.get("principal") ?? ""));
  if (principal < 0) throw new Error("The amount borrowed cannot be negative.");

  const rateRaw = optional(formData, "interestRate");
  let interestRate: number | null = null;
  if (rateRaw != null) {
    interestRate = Number(rateRaw);
    if (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100) {
      throw new Error("The interest rate must be between 0 and 100.");
    }
  }

  const startRaw = optional(formData, "startDate");

  return {
    name,
    lender: optional(formData, "lender"),
    kind,
    principal,
    interestRate,
    startDate: startRaw ? requireIsoDate(startRaw, "Start date") : null,
    notes: optional(formData, "notes"),
  };
}

function revalidateAll(id?: number): void {
  revalidatePath("/");
  revalidatePath("/loans");
  revalidatePath("/report");
  if (id != null) revalidatePath(`/loans/${id}`);
}

export async function createLoan(
  _prev: LoanFormState,
  formData: FormData,
): Promise<LoanFormState> {
  const user = await requireUser();

  let id: number;
  try {
    id = getStore().createLoan({ ...readLoan(formData), createdBy: user.id }).id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the loan." };
  }

  revalidateAll(id);
  redirect(`/loans/${id}`);
}

export async function updateLoan(
  id: number,
  _prev: LoanFormState,
  formData: FormData,
): Promise<LoanFormState> {
  await requireUser();

  try {
    const store = getStore();
    if (!store.getLoan(id)) return { error: "That loan no longer exists." };
    store.updateLoan(id, readLoan(formData));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the loan." };
  }

  revalidateAll(id);
  redirect(`/loans/${id}`);
}

export async function deleteLoan(formData: FormData): Promise<void> {
  await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid loan id.");

  getStore().deleteLoan(id);
  revalidateAll();
  redirect("/loans");
}

/**
 * Record a payment from the lender's statement.
 *
 * The split is entered, not computed: it is the figure the lender reports and
 * the one a preparer reconciles to.
 */
export async function addPayment(
  loanId: number,
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const user = await requireUser();

  try {
    const store = getStore();
    if (!store.getLoan(loanId)) return { error: "That loan no longer exists." };

    const amountOr0 = (key: string): number => {
      const raw = String(formData.get(key) ?? "").trim();
      if (raw === "") return 0;
      const value = parseAmount(raw);
      if (value < 0) throw new Error("Payment amounts cannot be negative.");
      return value;
    };

    const interest = amountOr0("interest");
    const principal = amountOr0("principal");
    const escrow = amountOr0("escrow");

    if (interest + principal + escrow === 0) {
      throw new Error("Enter at least one of interest, principal, or escrow.");
    }

    store.addLoanPayment({
      loanId,
      date: requireIsoDate(String(formData.get("date") ?? "")),
      interest,
      principal,
      escrow,
      notes: optional(formData, "notes"),
      createdBy: user.id,
    });

    revalidateAll(loanId);
    return { savedTotal: interest + principal + escrow, savedAt: Date.now() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the payment." };
  }
}

export async function deletePayment(formData: FormData): Promise<void> {
  await requireUser();
  const paymentId = Number(formData.get("paymentId"));
  const loanId = Number(formData.get("loanId"));
  if (!Number.isInteger(paymentId)) throw new Error("Invalid payment id.");

  getStore().deleteLoanPayment(paymentId);
  revalidateAll(loanId);
}

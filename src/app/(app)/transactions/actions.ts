"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { requireIsoDate } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { deleteReceiptFile, saveReceiptFile } from "@/lib/receipts";
import { requireCategory, type CategoryKind } from "@/lib/schedule-f";

export interface TransactionFormState {
  error?: string;
}

function optional(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function readKind(formData: FormData): CategoryKind {
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "income" && kind !== "expense") throw new Error("Invalid entry type.");
  return kind;
}

function readCommonFields(formData: FormData) {
  const kind = readKind(formData);
  const categoryId = String(formData.get("categoryId") ?? "");
  const category = requireCategory(categoryId);
  if (category.kind !== kind) {
    throw new Error(`"${category.label}" is not a valid ${kind} category.`);
  }

  return {
    kind,
    categoryId,
    date: requireIsoDate(String(formData.get("date") ?? "")),
    amount: parseAmount(String(formData.get("amount") ?? "")),
    payee: optional(formData, "payee"),
    description: optional(formData, "description"),
    paymentMethod: optional(formData, "paymentMethod"),
  };
}

/** Attach every non-empty file under `receipts` to a transaction. */
async function attachReceipts(formData: FormData, transactionId: number): Promise<void> {
  const files = formData.getAll("receipts").filter((f): f is File => f instanceof File && f.size > 0);
  const store = getStore();
  for (const file of files) {
    const saved = await saveReceiptFile(file);
    store.createReceipt({ transactionId, ...saved });
  }
}

export async function createTransaction(
  _prev: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const user = await requireUser();

  let kind: CategoryKind;
  try {
    const fields = readCommonFields(formData);
    kind = fields.kind;
    const created = getStore().createTransaction({ ...fields, createdBy: user.id });
    await attachReceipts(formData, created.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the entry." };
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/report");
  redirect(`/transactions?saved=${kind}`);
}

export async function updateTransaction(
  id: number,
  _prev: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  await requireUser();

  try {
    const store = getStore();
    if (!store.getTransaction(id)) return { error: "That entry no longer exists." };
    store.updateTransaction(id, readCommonFields(formData));
    await attachReceipts(formData, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the entry." };
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath(`/transactions/${id}`);
  revalidatePath("/report");
  redirect(`/transactions/${id}`);
}

export async function deleteTransaction(formData: FormData): Promise<void> {
  await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid entry id.");

  // Drop the row first, then the files it referenced.
  const filenames = getStore().deleteTransaction(id);
  await Promise.all(filenames.map((f) => deleteReceiptFile(f)));

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/report");
  redirect("/transactions");
}

export async function deleteReceipt(formData: FormData): Promise<void> {
  await requireUser();
  const receiptId = Number(formData.get("receiptId"));
  const transactionId = Number(formData.get("transactionId"));
  if (!Number.isInteger(receiptId)) throw new Error("Invalid receipt id.");

  const filename = getStore().deleteReceipt(receiptId);
  if (filename) await deleteReceiptFile(filename);

  revalidatePath(`/transactions/${transactionId}`);
}

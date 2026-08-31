"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { deleteReceiptFile, saveReceiptFile } from "@/lib/receipts";
import type { NewAsset } from "@/lib/db/types";
import { requireIsoDate } from "@/lib/dates";
import { requireAssetClass, type Convention, type DepreciationMethod } from "@/lib/depreciation";
import { parseAmount } from "@/lib/money";

export interface AssetFormState {
  error?: string;
}

const METHODS: DepreciationMethod[] = ["200DB", "150DB", "SL"];
const CONVENTIONS: Convention[] = ["half-year", "mid-quarter", "mid-month"];

function optional(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function readPercent(formData: FormData, key: string, label: string, fallback: number): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100.`);
  }
  return value;
}

function readAsset(formData: FormData): Omit<NewAsset, "createdBy"> {
  const name = String(formData.get("name") ?? "").trim();
  if (name === "") throw new Error("Give the asset a name.");

  const assetClassId = String(formData.get("assetClassId") ?? "");
  const assetClass = requireAssetClass(assetClassId);

  const method = String(formData.get("method") ?? "") as DepreciationMethod;
  if (!METHODS.includes(method)) throw new Error("Choose a depreciation method.");

  const convention = String(formData.get("convention") ?? "") as Convention;
  if (!CONVENTIONS.includes(convention)) throw new Error("Choose a convention.");

  if (assetClass.realProperty && convention !== "mid-month") {
    throw new Error(`${assetClass.label} must use the mid-month convention.`);
  }
  if (!assetClass.realProperty && convention === "mid-month") {
    throw new Error(`${assetClass.label} uses the half-year or mid-quarter convention.`);
  }

  const cost = parseAmount(String(formData.get("cost") ?? ""));
  if (cost < 0) throw new Error("Cost cannot be negative.");

  const section179Raw = String(formData.get("section179") ?? "").trim();
  const section179 = section179Raw === "" ? 0 : parseAmount(section179Raw);
  if (section179 < 0) throw new Error("Section 179 cannot be negative.");

  const businessUsePercent = readPercent(formData, "businessUsePercent", "Business use", 100);
  if (businessUsePercent <= 0) throw new Error("Business use must be greater than 0.");

  const disposedDateRaw = optional(formData, "disposedDate");
  const placedInService = requireIsoDate(
    String(formData.get("placedInService") ?? ""),
    "Placed in service",
  );
  const disposedDate = disposedDateRaw
    ? requireIsoDate(disposedDateRaw, "Disposal date")
    : null;

  if (disposedDate && disposedDate < placedInService) {
    throw new Error("An asset cannot be disposed of before it was placed in service.");
  }

  const proceedsRaw = optional(formData, "disposalProceeds");

  return {
    name,
    description: optional(formData, "description"),
    assetClassId,
    method,
    convention,
    placedInService,
    cost,
    section179,
    bonusPercent: readPercent(formData, "bonusPercent", "Bonus depreciation", 0),
    businessUsePercent,
    disposedDate,
    disposalProceeds: proceedsRaw ? parseAmount(proceedsRaw) : null,
    notes: optional(formData, "notes"),
  };
}

/** Attach every non-empty file under `receipts` to an asset. */
async function attachReceipts(formData: FormData, assetId: number): Promise<void> {
  const files = formData.getAll("receipts").filter((f): f is File => f instanceof File && f.size > 0);
  const store = getStore();
  for (const file of files) {
    const saved = await saveReceiptFile(file);
    store.createReceipt({ assetId, ...saved });
  }
}

function revalidateAll(id?: number): void {
  revalidatePath("/");
  revalidatePath("/assets");
  revalidatePath("/report");
  if (id != null) revalidatePath(`/assets/${id}`);
}

export async function createAsset(
  _prev: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  const user = await requireUser();

  let id: number;
  try {
    const created = getStore().createAsset({ ...readAsset(formData), createdBy: user.id });
    id = created.id;
    await attachReceipts(formData, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the asset." };
  }

  revalidateAll(id);
  redirect(`/assets/${id}`);
}

export async function updateAsset(
  id: number,
  _prev: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  await requireUser();

  try {
    const store = getStore();
    if (!store.getAsset(id)) return { error: "That asset no longer exists." };
    store.updateAsset(id, readAsset(formData));
    await attachReceipts(formData, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the asset." };
  }

  revalidateAll(id);
  redirect(`/assets/${id}`);
}

export async function deleteAsset(formData: FormData): Promise<void> {
  await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid asset id.");

  // Drop the row first, then the files its receipts referenced.
  const filenames = getStore().deleteAsset(id);
  await Promise.all(filenames.map((f) => deleteReceiptFile(f)));

  revalidateAll();
  redirect("/assets");
}

export async function deleteAssetReceipt(formData: FormData): Promise<void> {
  await requireUser();
  const receiptId = Number(formData.get("receiptId"));
  const assetId = Number(formData.get("assetId"));
  if (!Number.isInteger(receiptId)) throw new Error("Invalid receipt id.");

  const filename = getStore().deleteReceipt(receiptId);
  if (filename) await deleteReceiptFile(filename);

  revalidatePath(`/assets/${assetId}`);
}

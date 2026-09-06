"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { suggestCategory } from "@/lib/categorise";
import { getStore } from "@/lib/db";
import { requireCategory } from "@/lib/schedule-f";

export interface ReviewState {
  error?: string;
  /** How many entries the last action moved, for the confirmation line. */
  moved?: number;
  at?: number;
}

/** File one entry on the line chosen for it. */
export async function fileEntry(formData: FormData): Promise<void> {
  await requireUser();

  const id = Number(formData.get("id"));
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!Number.isInteger(id) || categoryId === "") return;

  // Throws on anything that is not a real category, so a hand-crafted post
  // cannot park an entry on a line that does not exist.
  const category = requireCategory(categoryId);
  if (category.kind !== "expense") return;

  getStore().setTransactionCategory(id, categoryId);
  revalidatePath("/", "layout");
}

/**
 * Accept every suggestion the rules are confident about, in one go.
 *
 * Only the strong ones. The weak suggestions are the rows where a word fits
 * the line but could belong elsewhere, and sweeping those through unread is
 * the failure this screen exists to prevent - an itemised return that is
 * quietly wrong is worse than an honest pile on line 32.
 */
export async function acceptConfident(
  // Both arguments are required by useActionState's signature; this action
  // reads neither, because what it operates on is whatever is still pending.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ReviewState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<ReviewState> {
  await requireUser();
  const store = getStore();

  let moved = 0;
  try {
    const pending = store.listTransactions({ kind: "expense", categoryId: "other_expense" });
    for (const entry of pending) {
      const suggestion = suggestCategory(entry.payee, entry.description);
      if (!suggestion || suggestion.confidence !== "strong") continue;
      if (store.setTransactionCategory(entry.id, suggestion.category.id)) moved++;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not file those entries." };
  }

  revalidatePath("/", "layout");
  return { moved, at: Date.now() };
}

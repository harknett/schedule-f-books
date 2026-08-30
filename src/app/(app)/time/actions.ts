"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { requireIsoDate } from "@/lib/dates";
import { parseDuration } from "@/lib/duration";

export interface TimeFormState {
  error?: string;
  savedMinutes?: number;
}

export async function logTime(_prev: TimeFormState, formData: FormData): Promise<TimeFormState> {
  const user = await requireUser();

  try {
    const task = String(formData.get("task") ?? "").trim();
    if (task === "") return { error: "Say what you worked on." };

    const notes = String(formData.get("notes") ?? "").trim();
    const minutes = parseDuration(String(formData.get("duration") ?? ""));

    getStore().createTimeEntry({
      userId: user.id,
      date: requireIsoDate(String(formData.get("date") ?? "")),
      minutes,
      task,
      notes: notes === "" ? null : notes,
    });

    revalidatePath("/time");
    revalidatePath("/");
    return { savedMinutes: minutes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that entry." };
  }
}

export async function deleteTimeEntry(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid entry id.");

  // Scoped to the signed-in user: nobody edits someone else's hours.
  getStore().deleteTimeEntry(id, user.id);

  revalidatePath("/time");
  revalidatePath("/");
}

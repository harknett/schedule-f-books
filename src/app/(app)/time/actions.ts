"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { datesBetween, requireIsoDate, type Weekday } from "@/lib/dates";
import { parseDuration } from "@/lib/duration";
import { timeEntryKey } from "@/lib/import";

export interface TimeFormState {
  error?: string;
  /** Minutes in one entry, for the confirmation message. */
  savedMinutes?: number;
  /** How many entries were written. 1 for a single day. */
  savedCount?: number;
  /** Days that already had this exact entry and were left alone. */
  skippedCount?: number;
  /** Unique per successful save, so the form can remount clear. */
  savedAt?: number;
}

/** Which days of the week were ticked. Absent means every day. */
function readWeekdays(formData: FormData): Weekday[] {
  const values = formData.getAll("weekdays").map((v) => Number(v));
  return values.filter((v): v is Weekday => Number.isInteger(v) && v >= 0 && v <= 6);
}

/**
 * Log time, either on one day or across a range.
 *
 * The range case is for catching up: the same chore, the same length, on every
 * day it was done. Days that already carry an identical entry are left alone,
 * so running the catch-up twice does not double the hours.
 */
export async function logTime(_prev: TimeFormState, formData: FormData): Promise<TimeFormState> {
  const user = await requireUser();

  try {
    const task = String(formData.get("task") ?? "").trim();
    if (task === "") return { error: "Say what you worked on." };

    const notesRaw = String(formData.get("notes") ?? "").trim();
    const notes = notesRaw === "" ? null : notesRaw;
    const minutes = parseDuration(String(formData.get("duration") ?? ""));

    const repeating = String(formData.get("mode") ?? "single") === "range";

    // Expand to the days being logged. A single day is just a range of one,
    // so both paths write through the same code below.
    const dates = repeating
      ? datesBetween(
          requireIsoDate(String(formData.get("from") ?? ""), "First day"),
          requireIsoDate(String(formData.get("to") ?? ""), "Last day"),
          readWeekdays(formData),
        )
      : [requireIsoDate(String(formData.get("date") ?? ""))];

    if (dates.length === 0) {
      return { error: "No day in that range falls on the days you chose." };
    }

    const store = getStore();

    // Compare against what is already logged over the same span, so a repeated
    // catch-up adds only the days that were missing.
    const existing = new Set(
      store
        .listTimeEntriesInRange(dates[0]!, dates.at(-1)!, user.id)
        .map(timeEntryKey),
    );

    const toWrite = dates.filter(
      (date) => !existing.has(timeEntryKey({ date, minutes, task })),
    );

    if (toWrite.length === 0) {
      return {
        error:
          dates.length === 1
            ? "That entry is already logged for this day."
            : `All ${dates.length} of those days already have this entry.`,
      };
    }

    store.transaction(() => {
      for (const date of toWrite) {
        store.createTimeEntry({ userId: user.id, date, minutes, task, notes });
      }
    });

    revalidatePath("/time");
    revalidatePath("/");
    return {
      savedMinutes: minutes,
      savedCount: toWrite.length,
      skippedCount: dates.length - toWrite.length,
      savedAt: Date.now(),
    };
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

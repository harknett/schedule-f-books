"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { parseCsv } from "@/lib/csv";
import { getStore } from "@/lib/db";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  flagDuplicates,
  isTransaction,
  parseRows,
  timeEntryKey,
  transactionKey,
  type CommitRequest,
  type CommitResult,
} from "@/lib/import";

// A "use server" module may only export async functions, so the limits and the
// request/result shapes live in lib/import.ts alongside the parsing they guard.

/**
 * Commit an import.
 *
 * The browser previewed the file, but this re-parses from the original text
 * rather than accepting a row list the client assembled - the preview is a
 * convenience, not a source of truth. Everything lands in one database
 * transaction, so a failure part-way leaves the books untouched.
 */
export async function commitImport(request: CommitRequest): Promise<CommitResult> {
  const user = await requireUser();

  try {
    if (typeof request.csvText !== "string" || request.csvText.trim() === "") {
      return { error: "There is nothing to import." };
    }
    if (Buffer.byteLength(request.csvText, "utf8") > MAX_IMPORT_BYTES) {
      return { error: "That file is larger than 2 MB. Split it and import in parts." };
    }

    const rows = parseCsv(request.csvText);
    if (rows.length === 0) return { error: "That file has no rows." };
    if (rows.length > MAX_IMPORT_ROWS + 1) {
      return { error: `That file has more than ${MAX_IMPORT_ROWS} rows. Split it and import in parts.` };
    }

    const parsed = parseRows(rows, {
      kind: request.kind,
      mapping: request.mapping,
      dateOrder: request.dateOrder,
      defaultCategoryId: request.defaultCategoryId || undefined,
      hasHeader: request.hasHeader,
    });

    const usable = parsed.rows.filter((row) => row.value !== null);
    if (usable.length === 0) {
      return { error: "No row in that file could be read. Check the column mapping." };
    }

    const store = getStore();

    // Compare only against the span the file covers, not the whole ledger.
    const dates = usable.map((row) => row.value!.date).sort();
    const from = dates[0]!;
    const to = dates.at(-1)!;

    const existingKeys = new Set(
      request.kind === "time"
        ? store.timeEntryFingerprints(user.id, from, to).map(timeEntryKey)
        : store.transactionFingerprints(from, to).map(transactionKey),
    );
    flagDuplicates(parsed.rows, existingKeys);

    const toInsert = usable.filter((row) => !(request.skipDuplicates && row.duplicate));

    const imported = store.transaction(() => {
      let count = 0;
      for (const row of toInsert) {
        const record = row.value!;
        if (isTransaction(record)) {
          store.createTransaction({ ...record, createdBy: user.id });
        } else {
          store.createTimeEntry({ ...record, userId: user.id });
        }
        count++;
      }
      return count;
    });

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/time");
    revalidatePath("/report");

    return {
      imported,
      skippedDuplicates: usable.length - toInsert.length,
      skippedInvalid: parsed.invalid,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The import failed." };
  }
}

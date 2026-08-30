import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { isIsoDate } from "@/lib/dates";
import {
  buildExportEntries,
  exportFileName,
  receiptArchiveName,
  type ExportInput,
} from "@/lib/export";
import { readReceiptFile } from "@/lib/receipts";
import { createZip, type ZipEntry } from "@/lib/zip";

/**
 * Build and return the export archive.
 *
 * A GET route rather than an action so the browser handles it as a real
 * download, and so the same URL can be fetched by a backup script.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return new NextResponse("Give a valid from and to date.", { status: 400 });
  }
  if (from > to) {
    return new NextResponse("The start date is after the end date.", { status: 400 });
  }

  const includeReceipts = params.get("receipts") !== "0";
  const includeArchiveJson = params.get("json") !== "0";
  // Hours are personal; only the owner may take everyone's.
  const everyonesHours = params.get("allHours") === "1" && user.role === "owner";

  const store = getStore();
  const transactions = store.listTransactions({ from, to });

  const receiptsByTransaction = new Map(
    transactions.map((t) => [t.id, store.listReceipts(t.id)]),
  );

  // Assets are not filtered by range: a tractor bought in 2019 still
  // depreciates into the years being exported.
  const assets = store.listAssets();

  const timeEntries = store.listTimeEntriesInRange(
    from,
    to,
    everyonesHours ? undefined : user.id,
  );

  const receiptFiles: ZipEntry[] = [];
  if (includeReceipts) {
    for (const [transactionId, receipts] of receiptsByTransaction) {
      for (const [index, receipt] of receipts.entries()) {
        try {
          receiptFiles.push({
            name: receiptArchiveName(transactionId, index, receipt.filename),
            data: await readReceiptFile(receipt.filename),
          });
        } catch {
          // A missing file should not sink the whole export; the CSV still
          // records that a receipt was expected here.
        }
      }
    }
  }

  const input: ExportInput = {
    from,
    to,
    generatedAt: new Date(),
    generatedBy: user.name,
    transactions,
    receiptsByTransaction,
    assets,
    timeEntries,
    receiptFiles,
    includeReceipts,
    includeArchiveJson,
  };

  let archive: Buffer;
  try {
    archive = createZip(buildExportEntries(input));
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "The export could not be built.",
      { status: 400 },
    );
  }

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(archive.byteLength),
      "Content-Disposition": `attachment; filename="${exportFileName(from, to)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

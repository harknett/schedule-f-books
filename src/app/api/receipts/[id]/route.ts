import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { readReceiptFile } from "@/lib/receipts";

/**
 * Serve a receipt image.
 *
 * These are financial records, so they are read through an authenticated route
 * rather than from /public where anyone with the URL could fetch them.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await currentUser())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const receipt = getStore().getReceipt(receiptId);
  if (!receipt) return new NextResponse("Not found", { status: 404 });

  let file: Buffer;
  try {
    file = await readReceiptFile(receipt.filename);
  } catch {
    // Metadata without a file on disk - report it as missing rather than 500.
    return new NextResponse("Receipt file is missing", { status: 404 });
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Length": String(receipt.byteSize),
      "Content-Disposition": `inline; filename="receipt-${receipt.id}"`,
      // Private: correct for per-user financial documents.
      "Cache-Control": "private, max-age=3600",
    },
  });
}

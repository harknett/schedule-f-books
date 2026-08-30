import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { receiptsDir } from "@/lib/db";
import { MAX_RECEIPT_BYTES, MAX_RECEIPT_MB, receiptExtension } from "@/lib/receipt-limits";

/**
 * Persist an uploaded receipt under a generated name.
 *
 * The client-supplied filename is never used on disk - it would let a caller
 * steer the write path. We keep only the extension implied by the MIME type,
 * and re-check size and type here rather than trusting the browser.
 */
export async function saveReceiptFile(
  file: File,
): Promise<{ filename: string; mimeType: string; byteSize: number }> {
  const mimeType = file.type.toLowerCase();
  const extension = receiptExtension(mimeType);
  if (!extension) {
    throw new Error("Receipts must be a JPEG, PNG, WebP, HEIC image, or a PDF.");
  }
  if (file.size <= 0) throw new Error("The receipt file is empty.");
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error(`Receipts must be under ${MAX_RECEIPT_MB} MB.`);
  }

  const dir = receiptsDir();
  await fs.mkdir(dir, { recursive: true });

  const filename = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  return { filename, mimeType, byteSize: buffer.byteLength };
}

/**
 * Resolve a stored filename to an absolute path, refusing anything that escapes
 * the receipts directory.
 */
export function receiptPath(filename: string): string {
  const dir = receiptsDir();
  const resolved = path.resolve(dir, filename);
  if (resolved !== path.join(dir, path.basename(filename))) {
    throw new Error("Invalid receipt path.");
  }
  return resolved;
}

export async function deleteReceiptFile(filename: string): Promise<void> {
  await fs.rm(receiptPath(filename), { force: true });
}

export async function readReceiptFile(filename: string): Promise<Buffer> {
  return fs.readFile(receiptPath(filename));
}

/**
 * Receipt constraints shared by the browser and the server.
 *
 * Deliberately free of any Node imports: the picker component validates against
 * these before upload, and the server enforces the same values on arrival.
 * Client-side checks are for fast feedback only - saveReceiptFile re-checks.
 */

/** Phone cameras produce JPEG or HEIC; allow the common web formats and PDFs too. */
export const RECEIPT_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf",
};

export const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

export const MAX_RECEIPT_MB = Math.floor(MAX_RECEIPT_BYTES / 1024 / 1024);

/** For an <input accept="..."> attribute. */
export const ACCEPTED_RECEIPT_TYPES = Object.keys(RECEIPT_EXTENSIONS).join(",");

export function receiptExtension(mimeType: string): string | undefined {
  return RECEIPT_EXTENSIONS[mimeType.toLowerCase()];
}

export function isAllowedReceiptType(mimeType: string): boolean {
  return receiptExtension(mimeType) !== undefined;
}

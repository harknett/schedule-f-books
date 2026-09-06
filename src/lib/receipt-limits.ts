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

/**
 * The most one submission may carry, across every receipt attached to it.
 *
 * Receipts travel inside a Server Action, and Next caps the whole request
 * body - so this is the number that actually decides whether an upload
 * survives. next.config.ts derives its `serverActions.bodySizeLimit` from this
 * constant rather than repeating it: the two being written out separately is
 * exactly how the per-file limit came to advertise 15 MB while the framework
 * quietly refused anything over 1 MB.
 */
export const MAX_UPLOAD_TOTAL_BYTES = 30 * 1024 * 1024;

export const MAX_UPLOAD_TOTAL_MB = Math.floor(MAX_UPLOAD_TOTAL_BYTES / 1024 / 1024);

/**
 * Room for what multipart encoding adds on top of the files themselves:
 * boundaries, per-part headers, and the other form fields. The Next docs
 * suggest 10-20 KB is typical; a megabyte is cheap insurance against an
 * upload failing for want of a few hundred bytes.
 */
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/** What `serverActions.bodySizeLimit` has to be for the above to be honest. */
export const SERVER_ACTION_BODY_LIMIT_BYTES =
  MAX_UPLOAD_TOTAL_BYTES + MULTIPART_OVERHEAD_BYTES;

/** For an <input accept="..."> attribute. */
export const ACCEPTED_RECEIPT_TYPES = Object.keys(RECEIPT_EXTENSIONS).join(",");

export function receiptExtension(mimeType: string): string | undefined {
  return RECEIPT_EXTENSIONS[mimeType.toLowerCase()];
}

export function isAllowedReceiptType(mimeType: string): boolean {
  return receiptExtension(mimeType) !== undefined;
}

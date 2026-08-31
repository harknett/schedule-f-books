import { ReceiptIcon, TrashIcon } from "./icons";
import { Card } from "./ui";
import type { Receipt } from "@/lib/db/types";

/**
 * The stored receipts for a transaction or an asset.
 *
 * Images are served through the authenticated /api/receipts route rather than
 * from a public path, so a link here still requires a session.
 */
export function ReceiptGallery({
  receipts,
  ownerField,
  ownerId,
  onDelete,
  emptyMessage,
}: {
  receipts: Receipt[];
  /** Hidden field naming the owner, so the delete action can revalidate it. */
  ownerField: "transactionId" | "assetId";
  ownerId: number;
  onDelete: (formData: FormData) => Promise<void>;
  emptyMessage: string;
}) {
  if (receipts.length === 0) {
    return (
      <Card className="flex items-center gap-3 text-sm text-muted">
        <ReceiptIcon className="h-5 w-5 shrink-0" />
        <span>{emptyMessage}</span>
      </Card>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {receipts.map((receipt) => (
        <li key={receipt.id} className="relative">
          <a
            href={`/api/receipts/${receipt.id}`}
            target="_blank"
            rel="noreferrer"
            className="block aspect-square overflow-hidden rounded-xl border border-line bg-surface-muted"
          >
            {receipt.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/receipts/${receipt.id}`}
                alt="Receipt"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center gap-1 text-muted">
                <ReceiptIcon className="h-8 w-8" />
                <span className="text-xs">PDF</span>
              </div>
            )}
          </a>
          <form action={onDelete} className="absolute -right-1.5 -top-1.5">
            <input type="hidden" name="receiptId" value={receipt.id} />
            <input type="hidden" name={ownerField} value={ownerId} />
            <button
              type="submit"
              aria-label="Delete this receipt"
              className="grid h-7 w-7 place-items-center rounded-full bg-danger text-white shadow"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { CameraIcon, ReceiptIcon, TrashIcon } from "./icons";
import { ACCEPTED_RECEIPT_TYPES, MAX_RECEIPT_BYTES, MAX_RECEIPT_MB } from "@/lib/receipt-limits";

interface Preview {
  file: File;
  /** Object URL for images; null for PDFs, which get an icon instead. */
  url: string | null;
}

/**
 * Receipt capture.
 *
 * Two entry points, because they are different jobs on a phone: `capture`
 * opens the rear camera straight away for the receipt in your hand, while the
 * plain picker reaches the photo library or a PDF a supplier emailed.
 *
 * Both feed one hidden `receipts` input, kept in sync via DataTransfer, so the
 * server action sees a single list no matter how the files arrived.
 */
export function ReceiptPicker() {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const payloadRef = useRef<HTMLInputElement>(null);

  // Mirror state into the real form control the server action reads.
  useEffect(() => {
    if (!payloadRef.current) return;
    const transfer = new DataTransfer();
    for (const { file } of previews) transfer.items.add(file);
    payloadRef.current.files = transfer.files;
  }, [previews]);

  useEffect(() => {
    return () => {
      for (const { url } of previews) if (url) URL.revokeObjectURL(url);
    };
    // Revoking only on unmount is deliberate; `remove` revokes its own URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted: Preview[] = [];
    let rejected: string | null = null;

    for (const file of Array.from(list)) {
      if (file.size > MAX_RECEIPT_BYTES) {
        rejected = `${file.name} is over ${MAX_RECEIPT_MB} MB.`;
        continue;
      }
      accepted.push({
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    }

    setError(rejected);
    if (accepted.length > 0) setPreviews((current) => [...current, ...accepted]);
  }

  function remove(index: number) {
    setPreviews((current) => {
      const target = current[index];
      if (target?.url) URL.revokeObjectURL(target.url);
      return current.filter((_, i) => i !== index);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent-soft text-accent min-h-12 px-3 font-medium"
        >
          <CameraIcon className="h-5 w-5" />
          Take photo
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface min-h-12 px-4"
        >
          <ReceiptIcon className="h-5 w-5" />
          <span className="sr-only sm:not-sr-only">Upload</span>
        </button>
      </div>

      {/* Rear camera, one shot at a time. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Library or file manager, several at once. */}
      <input
        ref={libraryRef}
        type="file"
        accept={ACCEPTED_RECEIPT_TYPES}
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <input ref={payloadRef} type="file" name="receipts" multiple className="hidden" />

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {previews.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {previews.map((preview, index) => (
            <li key={index} className="relative">
              <div className="aspect-square overflow-hidden rounded-xl border border-line bg-surface-muted">
                {preview.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt={`Receipt ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-muted">
                    <ReceiptIcon className="h-8 w-8" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove receipt ${index + 1}`}
                className="absolute -right-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full bg-danger text-white shadow"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          Snap the receipt now — it is filed with the entry and kept for your records.
        </p>
      )}
    </div>
  );
}

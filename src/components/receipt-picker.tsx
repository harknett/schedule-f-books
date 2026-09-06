"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CameraIcon, ReceiptIcon, TrashIcon } from "./icons";
import { downscaleImage } from "@/lib/downscale";
import {
  ACCEPTED_RECEIPT_TYPES,
  MAX_RECEIPT_BYTES,
  MAX_RECEIPT_MB,
  MAX_UPLOAD_TOTAL_BYTES,
  MAX_UPLOAD_TOTAL_MB,
} from "@/lib/receipt-limits";

/**
 * Out of sight but still in the render tree.
 *
 * Not `display: none`: Safari will not open a file picker for an input that
 * has been taken out of the layout, and it leaves the input unfocusable, which
 * would strand keyboard users on the label.
 */
const VISUALLY_HIDDEN =
  "absolute h-px w-px overflow-hidden opacity-0 [clip:rect(0,0,0,0)]";

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
 *
 * The two controls are <label>s rather than buttons calling input.click().
 * Tapping a label activates its input natively, with real user activation, in
 * every browser - whereas a scripted click on a `display: none` input is
 * ignored by Safari and iOS Safari, which is the one place this feature has to
 * work. The inputs are therefore moved out of sight rather than out of the
 * render tree.
 */
export function ReceiptPicker() {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Set while photos are being resized, which is slow enough to notice. */
  const [busy, setBusy] = useState(false);

  const payloadRef = useRef<HTMLInputElement>(null);
  /** Mirrors `previews` for code that has awaited and may hold a stale copy. */
  const previewsRef = useRef<Preview[]>([]);

  // Ids that stay unique when two pickers share a page.
  const fieldId = useId();
  const cameraId = `${fieldId}-camera`;
  const libraryId = `${fieldId}-library`;

  // Mirror state into the real form control the server action reads.
  useEffect(() => {
    previewsRef.current = previews;
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

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted: Preview[] = [];
    let rejected: string | null = null;

    setBusy(true);
    try {
      for (const original of Array.from(list)) {
        // Shrink first: a 4 MB camera photo becomes a few hundred KB, so the
        // checks below measure what will actually be uploaded.
        const file = await downscaleImage(original);

        if (file.size > MAX_RECEIPT_BYTES) {
          rejected = `${original.name} is over ${MAX_RECEIPT_MB} MB.`;
          continue;
        }
        accepted.push({
          file,
          url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        });
      }

      if (accepted.length === 0) {
        setError(rejected);
        return;
      }

      // Every receipt on this entry travels in one request, so the total is
      // what the server will be asked to accept. previewsRef rather than the
      // previews state: this function has awaited, so the closed-over value
      // may be a render behind.
      const already = previewsRef.current.reduce((sum, p) => sum + p.file.size, 0);
      const incoming = accepted.reduce((sum, p) => sum + p.file.size, 0);

      if (already + incoming > MAX_UPLOAD_TOTAL_BYTES) {
        for (const { url } of accepted) if (url) URL.revokeObjectURL(url);
        setError(
          `That would put this entry over ${MAX_UPLOAD_TOTAL_MB} MB of receipts. Save it and put the rest on another entry.`,
        );
        return;
      }

      setError(rejected);
      setPreviews((current) => [...current, ...accepted]);
    } finally {
      setBusy(false);
    }
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
        <label
          htmlFor={cameraId}
          className="flex-1 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent bg-accent-soft text-accent min-h-12 px-3 font-medium focus-within:ring-2 focus-within:ring-accent/40"
        >
          <CameraIcon className="h-5 w-5" />
          Take photo
        </label>
        <label
          htmlFor={libraryId}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface min-h-12 px-4 focus-within:ring-2 focus-within:ring-accent/40"
        >
          <ReceiptIcon className="h-5 w-5" />
          <span className="sr-only sm:not-sr-only">Upload</span>
        </label>
      </div>

      {/* Rear camera, one shot at a time. */}
      <input
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        className={VISUALLY_HIDDEN}
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Library or file manager, several at once. */}
      <input
        id={libraryId}
        type="file"
        accept={ACCEPTED_RECEIPT_TYPES}
        multiple
        className={VISUALLY_HIDDEN}
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Never clicked, only read: this is what the server action submits. */}
      <input ref={payloadRef} type="file" name="receipts" multiple className={VISUALLY_HIDDEN} />

      {busy ? <p className="text-xs text-muted">Preparing photo…</p> : null}
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
          Snap the receipt now — it is filed with the entry and kept for your records. Photos are
          resized before upload, so this works on a slow connection.
        </p>
      )}
    </div>
  );
}

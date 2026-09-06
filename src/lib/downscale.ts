/**
 * Shrinking a camera photo before it is uploaded.
 *
 * A phone takes 12-megapixel photos of a 4-inch till receipt: several
 * megabytes to carry over a field connection, to store forever, and to read
 * back, for an image whose only job is to be legible enough to prove what was
 * bought. Resizing in the browser turns that into a few hundred kilobytes.
 *
 * Free of Node imports - this runs in the picker, on the phone.
 */

/**
 * Long edge, in pixels. Comfortably enough to read the small print on a till
 * receipt, and far below what any phone camera produces.
 */
const MAX_EDGE = 2000;

const JPEG_QUALITY = 0.85;

/** Formats a browser canvas can reliably decode and re-encode. */
const DOWNSCALABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export function canDownscale(type: string): boolean {
  return DOWNSCALABLE.has(type.toLowerCase());
}

/**
 * Return a smaller version of an image file, or the original.
 *
 * Deliberately total: any failure hands back the file untouched rather than
 * throwing. A receipt that uploads at full size is a minor cost; a receipt
 * that cannot be attached at all because the canvas refused to decode it is
 * the feature not working. HEIC is the live example - Safari decodes it,
 * Chrome and Firefox do not.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!canDownscale(file.type)) return file;

  try {
    // `from-image` applies the EXIF orientation, so a photo taken sideways is
    // stored the right way up instead of relying on a tag we then strip.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small enough, and re-encoding would only lose quality.
    if (scale === 1 && file.type === "image/jpeg") {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    // A PNG screenshot of a receipt can come out larger as a JPEG; keep
    // whichever is actually smaller.
    if (blob.size >= file.size) return file;

    return new File([blob], renameToJpeg(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

function renameToJpeg(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "receipt"}.jpg`;
}

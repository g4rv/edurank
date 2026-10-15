/**
 * Shrinks a chosen JPG/PNG in the browser before it is hashed and uploaded.
 * Evidence is a scan or a phone photo, read on screen — a 12 MP original in R2
 * buys nothing. PDFs are never touched.
 *
 * Browser-only (`createImageBitmap`, canvas). The decisions that can be tested
 * without a canvas are pure functions below.
 */

export const MAX_SIDE_PX = 2000;
export const JPEG_QUALITY = 0.8;

const COMPRESSIBLE = ['image/jpeg', 'image/png'];

/** Size after scaling the long side down to `maxSide`; never scales up. */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE_PX) {
  const longSide = Math.max(width, height);
  if (longSide <= maxSide) return { width, height };
  const k = maxSide / longSide;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** The result is only used when it is really smaller. */
export function isWorthKeeping(originalBytes: number, compressedBytes: number): boolean {
  return compressedBytes > 0 && compressedBytes < originalBytes;
}

/** `scan.png` → `scan.jpg`; a name without an extension just gets one. */
export function jpegName(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.jpg`;
}

/**
 * Returns the smaller JPEG, or the original file when it is not an image we
 * handle, cannot be decoded, or would not get smaller. Never throws: a failed
 * compression must not block an upload that would have worked.
 * Transparency becomes white (these are documents).
 */
export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob || !isWorthKeeping(file.size, blob.size)) return file;
    return new File([blob], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

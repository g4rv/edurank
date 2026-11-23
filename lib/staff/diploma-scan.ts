/**
 * The diploma scan's formats (owner, 2026-11-23: «any image type»; JPG only
 * from 2026-10-27 until then). Pure constants, importable from a client
 * component — the picker refuses a non-image before uploading, the server
 * refuses it again from the stored bytes, in the same words.
 *
 * What is STORED is JPEG or PNG, nothing else: those are the two image types
 * the shared file checks can verify from their bytes. The picker takes ANY
 * image, and one that is not already JPEG or PNG (WebP, GIF, BMP, AVIF…) is
 * turned into a JPEG in the browser first (`convertToJpeg`). A PDF is not an
 * image and is refused.
 */
export const DIPLOMA_SCAN_TYPES = ['image/jpeg', 'image/png'] as const;

/** The `accept` of the picker — a hint to the dialog, never a guarantee */
export const DIPLOMA_SCAN_ACCEPT = 'image/*';

export const DIPLOMA_SCAN_TYPE_MESSAGE = 'Скан диплома — лише зображення (JPG, PNG та інші)';

/** The browser could not read an image of an unusual type to convert it */
export const DIPLOMA_SCAN_UNREADABLE_MESSAGE =
  'Не вдалося прочитати це зображення. Збережіть його як JPG або PNG і спробуйте ще раз';

/** Is this a type the server stores for a diploma scan? */
export function isDiplomaScanType(type: string): boolean {
  return (DIPLOMA_SCAN_TYPES as readonly string[]).includes(type);
}

/** The file extension a stored scan's key carries */
export function diplomaScanExtension(type: string): 'jpg' | 'png' {
  return type === 'image/png' ? 'png' : 'jpg';
}

/**
 * How every read of a person's diplomas selects them: in their order, and
 * without the scan's R2 key and hash — a key is a capability and never leaves
 * the server (the certificates' rule). The name stays: it is what says a scan
 * is there, the five columns being set together.
 */
export const DIPLOMA_ROWS = {
  orderBy: { position: 'asc' },
  omit: { fileKey: true, fileSha256: true },
} as const;

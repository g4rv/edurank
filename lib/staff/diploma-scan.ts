/**
 * The diploma scan's one format (owner, 2026-10-27: «JPG was only requested»).
 * Pure constants, importable from a client component — the picker refuses a
 * PNG or a PDF before uploading, the server refuses it again from the stored
 * bytes, in the same words.
 */
export const DIPLOMA_SCAN_TYPE = 'image/jpeg';

export const DIPLOMA_SCAN_TYPE_MESSAGE = 'Скан диплома — лише у форматі JPG';

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

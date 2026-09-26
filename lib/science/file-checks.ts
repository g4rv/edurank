import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

/**
 * The checks that need the BYTES — everything here reads a buffer, so this
 * module is server-only (`node:crypto`, `pdf-lib`).
 *
 * The type and size rules live in `./file-limits.ts` instead, because the
 * picker in the browser has to apply the same ones before it spends an upload.
 * They are re-exported here so every existing caller keeps one import.
 */
export { ALLOWED_FILE_TYPES, ACCEPT_FILE_TYPES, MAX_FILE_BYTES, fileProblem } from './file-limits';

import type { ALLOWED_FILE_TYPES } from './file-limits';

/**
 * What the file REALLY is, read from its first bytes rather than from the
 * `Content-Type` a browser declared — which is a claim, not a fact. Returns
 * null for anything outside the three types the app accepts.
 */
export function sniffType(bytes: Uint8Array): (typeof ALLOWED_FILE_TYPES)[number] | null {
  // %PDF
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return 'application/pdf';
  }

  // 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // FF D8 FF — every JPEG variant starts with this SOI marker
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  return null;
}

/**
 * D28's identity: the SHA-256 of the bytes, lowercase hex. Renaming a file,
 * re-exporting it or changing its date does not move this; only changing its
 * content does, which is the whole reason the check is not on `fileName`.
 */
export function sha256Hex(bytes: Uint8Array): string {
  const hash = createHash('sha256');
  hash.update(bytes);
  return hash.digest('hex');
}

/**
 * How many pages the PDF really has — the number a reviewer compares against a
 * page claim, since item 4 pays 50 год per page. Null when the bytes are not a
 * PDF we can parse; a damaged file is not a reason to refuse the upload, only
 * a reason to have no page count for it.
 *
 * `ignoreEncryption` so a certificate exported with an owner password (common,
 * and harmless — it still opens) is counted rather than dropped.
 */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return null;
  }
}

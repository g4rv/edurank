/**
 * What counts as an acceptable evidence file — the pure half of the file
 * rules, importable from a CLIENT component.
 *
 * `lib/science/file-checks.ts` pulls in `node:crypto` and `pdf-lib`, so a
 * browser bundle cannot touch it. That left the picker duplicating the accept
 * string as a literal and doing no size check at all: a 500 MB file was read
 * whole into browser memory by `crypto.subtle`, and only then refused by the
 * server. Same rule, same Ukrainian sentence, one definition — the browser
 * says it early to save the upload, the server says it again because a
 * browser's word is not evidence.
 */

export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** The `accept` attribute for a file picker. A hint to the dialog, never a
 *  guarantee — a person can always choose «all files». */
export const ACCEPT_FILE_TYPES = ALLOWED_FILE_TYPES.join(',');

/**
 * Validates what we know about a file before reading its bytes: its declared
 * type and its size. Returns a Ukrainian sentence, or null when it passes.
 */
export function fileProblem(input: { declaredType: string; sizeBytes: number }): string | null {
  const allowed: readonly string[] = ALLOWED_FILE_TYPES;
  if (!allowed.includes(input.declaredType)) {
    return 'Підтримуються лише PDF, JPG і PNG';
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    return `Файл завеликий — не більше ${MAX_FILE_BYTES / 1024 / 1024} МБ`;
  }
  if (input.sizeBytes === 0) {
    return 'Файл порожній';
  }
  return null;
}

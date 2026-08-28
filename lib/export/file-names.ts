/** Characters Windows refuses in a filename */
const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * One safe, unique `.xlsx` filename per person, in the same order as the input.
 *
 * Two people genuinely share a ПІБ here, and a zip keyed by name alone would
 * silently keep only the last of them — so a repeat gets a numeric suffix
 * rather than overwriting. The suffix counts within one export, which is why
 * order in equals order out.
 *
 * `suffix` names the document when a person can have more than one kind, e.g.
 * «Коваленко Іван Петрович - Характеристика_РНПАВ.xlsx» — the university's own
 * naming, taken from the files in `edu-reference/csv/`.
 */
export function personFileNames(fullNames: readonly string[], suffix = ''): string[] {
  const usedCount = new Map<string, number>();

  return fullNames.map((fullName) => {
    const safe = fullName.replace(FORBIDDEN_FILENAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
    const named = safe || 'Без імені';
    const base = suffix ? `${named} - ${suffix}` : named;
    const seen = (usedCount.get(base) ?? 0) + 1;
    usedCount.set(base, seen);
    return seen === 1 ? `${base}.xlsx` : `${base} (${seen}).xlsx`;
  });
}

/**
 * A `Content-Disposition` value that survives a non-ASCII filename.
 *
 * Every name here is Cyrillic, and a raw one in the plain `filename=` parameter
 * is mangled or dropped by the browser — the header is latin-1. `filename*`
 * (RFC 5987) carries the real name; the ASCII `filename` stays as a fallback
 * for anything that does not understand it.
 */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * The other half of `attachmentHeader`: read a filename back off the header.
 *
 * Needed because a download with a progress indicator cannot be a plain
 * navigation — the file arrives through `fetch` as a blob, and a blob URL has
 * no name of its own, so the one the server chose has to be carried across by
 * hand or every export saves as «download».
 *
 * `filename*` (RFC 5987) is preferred and read first: every name here is
 * Cyrillic, and the plain `filename` is only ever the ASCII-mangled fallback.
 */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim()) || null;
    } catch {
      // A malformed percent-escape must not lose the download — fall through
      // to the ASCII name below.
    }
  }

  const plain = /filename="([^"]*)"/i.exec(header) ?? /filename=([^;]+)/i.exec(header);
  return plain?.[1].trim() || null;
}

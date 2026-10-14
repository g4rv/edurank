import { db } from '@/lib/db';
import type { CertificateKind, CertificateValues } from '@/lib/language-certificates/options';

/** One stored certificate, as the card and the form read it. */
export interface CertificateRecord extends CertificateValues {
  /** The scan, if one was attached. The key itself never leaves the server. */
  file: { name: string; sizeBytes: number } | null;
}

/** `null` for a kind the person has not entered. */
export type PersonCertificates = Record<CertificateKind, CertificateRecord | null>;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The language certificates of one person (owner, 2026-10-14). **No permission
 * check here** — like every `lib/queries` function it trusts its caller. The
 * text of a certificate is read like the rest of «Освіта»; opening the SCAN is
 * a separate check in `languageCertificateFileUrl`, and a page decides whether to
 * offer the button.
 */
export async function getLanguageCertificates(staffId: string): Promise<PersonCertificates> {
  const rows = await db.languageCertificate.findMany({ where: { staffId } });
  const result: PersonCertificates = { ENGLISH: null, UKRAINIAN: null };

  for (const row of rows) {
    result[row.kind] = {
      series: row.series,
      number: row.number,
      issuedOn: iso(row.issuedOn),
      issuedBy: row.issuedBy,
      level: row.level,
      decisionNumber: row.decisionNumber,
      decisionDate: row.decisionDate ? iso(row.decisionDate) : null,
      file: row.fileKey
        ? { name: row.fileName ?? 'файл', sizeBytes: row.fileSizeBytes ?? 0 }
        : null,
    };
  }
  return result;
}

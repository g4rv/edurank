/**
 * The language certificates as the profile forms hold them (owner, 2026-10-14) —
 * plain data, no 'use client', because a SERVER page builds the default values
 * (see `academic-form-values.ts` for the same reason). The inputs live in
 * certificate-fields.tsx.
 */

import type { PersonCertificates } from '@/lib/queries/get-language-certificates';
import type { CertificateKind } from '@/lib/language-certificates/options';

/**
 * One certificate's inputs. Strings, blank for «nothing» — the schema folds an
 * all-blank block into «no certificate». The same shape serves both kinds; the
 * English block simply never shows `level` and the decision, and the Ukrainian
 * one never shows `issuedBy`.
 *
 * `file` is NOT here by default: absent means «leave the stored scan as it is».
 * The scan field sets it when somebody chooses, replaces or removes one.
 */
export interface CertificateFormRow {
  series: string;
  number: string;
  issuedBy: string;
  issuedOn: string;
  level: string;
  decisionNumber: string;
  decisionDate: string;
  file?: { objectKey: string; fileName: string } | null;
}

export type CertificatesFormValues = {
  englishCertificate: CertificateFormRow;
  ukrainianCertificate: CertificateFormRow;
};

export const EMPTY_CERTIFICATE_ROW: CertificateFormRow = {
  series: '',
  number: '',
  issuedBy: '',
  issuedOn: '',
  level: '',
  decisionNumber: '',
  decisionDate: '',
};

/**
 * What the form needs to know about the scans already stored: whose they are (an
 * upload is minted under the owner's own folder) and each kind's file name.
 * Present only where certificates are edited at all — an existing person's edit
 * form and their own profile, never the create dialog.
 */
export interface CertificateScans {
  staffId: string;
  stored: Record<CertificateKind, { name: string } | null>;
}

export function certificatesToFormValues(certs: PersonCertificates): CertificatesFormValues {
  const row = (record: PersonCertificates[CertificateKind]): CertificateFormRow =>
    record
      ? {
          series: record.series ?? '',
          number: record.number,
          issuedBy: record.issuedBy ?? '',
          issuedOn: record.issuedOn,
          level: record.level ?? '',
          decisionNumber: record.decisionNumber ?? '',
          decisionDate: record.decisionDate ?? '',
        }
      : { ...EMPTY_CERTIFICATE_ROW };
  return {
    englishCertificate: row(certs.ENGLISH),
    ukrainianCertificate: row(certs.UKRAINIAN),
  };
}

export function certificateScansOf(staffId: string, certs: PersonCertificates): CertificateScans {
  return {
    staffId,
    stored: {
      ENGLISH: certs.ENGLISH?.file ? { name: certs.ENGLISH.file.name } : null,
      UKRAINIAN: certs.UKRAINIAN?.file ? { name: certs.UKRAINIAN.file.name } : null,
    },
  };
}

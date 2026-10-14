/**
 * The vocabulary of the two language certificates in an НПП's «Освіта» (owner,
 * 2026-10-14) — client-safe (no Prisma, no Node), so the form, the card and the
 * schema read one definition.
 *
 * The kinds match the `LanguageCertificateKind` enum; each one is also the NAME
 * of the Staff-level field it travels under in a save, which is also what a
 * division is granted (`englishCertificate`, `ukrainianCertificate`).
 */

export const CERTIFICATE_KINDS = ['ENGLISH', 'UKRAINIAN'] as const;
export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];

/** The key a certificate travels under in a profile save, and the field grant. */
export const CERTIFICATE_FIELDS = {
  ENGLISH: 'englishCertificate',
  UKRAINIAN: 'ukrainianCertificate',
} as const satisfies Record<CertificateKind, string>;
export type CertificateField = (typeof CERTIFICATE_FIELDS)[CertificateKind];

export const CERTIFICATE_KIND_BY_FIELD: Record<CertificateField, CertificateKind> = {
  englishCertificate: 'ENGLISH',
  ukrainianCertificate: 'UKRAINIAN',
};

/** The headings, as the owner worded them. */
export const CERTIFICATE_TITLES: Record<CertificateKind, string> = {
  ENGLISH: 'Сертифікат з англійської мови (на рівні не нижче В2)',
  UKRAINIAN: 'Державний сертифікат про володіння українською мовою',
};

/** The button that opens an empty form for it, in the edit form's «Освіта». */
export const CERTIFICATE_ADD_LABELS: Record<CertificateKind, string> = {
  ENGLISH: 'Додати сертифікат з англійської мови',
  UKRAINIAN: 'Додати державний сертифікат з української мови',
};

/**
 * The English certificate must be at least B2 (owner, 2026-10-14), so its level is
 * B2 and up — and B2, the baseline, is what a new certificate starts on.
 *
 * **The Ukrainian certificate's «Рівень володіння» is NOT a list** (owner,
 * 2026-10-14): it is a free text box, as the document words it. Only the English
 * level is fixed.
 */
export const ENGLISH_LEVELS = ['B2', 'C1', 'C2'] as const;
export const DEFAULT_ENGLISH_LEVEL = 'B2';

/** The oldest date a certificate may carry. */
export const CERTIFICATE_MIN_DATE = '1990-01-01';

/**
 * A certificate as the profile form, the card and the audit read it — dates as
 * `YYYY-MM-DD`, never a `Date`, so no time zone can move a day.
 */
export interface CertificateValues {
  series: string | null;
  number: string;
  /** Дата видачі */
  issuedOn: string;
  /** ENGLISH: «Ким виданий» */
  issuedBy: string | null;
  /** UKRAINIAN: «Рівень володіння» */
  level: string | null;
  /** UKRAINIAN: the commission's decision — number and date, both or neither */
  decisionNumber: string | null;
  decisionDate: string | null;
  /** A link to the certificate — http(s) only */
  url: string | null;
}

/**
 * «Серія» before «№», and nothing for what is missing. A certificate with
 * neither has no number to print — `null`, not an empty «№».
 */
export function certificateNumber(
  series: string | null | undefined,
  number: string | null | undefined
): string | null {
  if (series && number) return `${series} № ${number}`;
  if (number) return `№ ${number}`;
  return series || null;
}

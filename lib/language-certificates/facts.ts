import { formatIssuedOn } from '@/lib/qualifications/format';
import { certificateNumber, type CertificateKind } from '@/lib/language-certificates/options';

/**
 * A certificate's facts as the short lines both the edit form's card and the
 * profile read — one definition, so a card in the form and the card on the record
 * can never word the same certificate two ways.
 *
 * Takes blanks as «nothing» (`null`, `undefined` or `''`) because the form holds
 * empty strings and the database holds `null`.
 */
export interface CertificateFactsInput {
  series?: string | null;
  number?: string | null;
  /** `YYYY-MM-DD` */
  issuedOn: string;
  issuedBy?: string | null;
  level?: string | null;
  decisionNumber?: string | null;
  /** `YYYY-MM-DD` */
  decisionDate?: string | null;
}

export function certificateFacts(kind: CertificateKind, v: CertificateFactsInput): string[] {
  const parts: string[] = [];
  const number = certificateNumber(v.series, v.number);
  if (number) parts.push(number);
  // Both kinds carry a level; the English one is B2 and up.
  if (v.level) parts.push(`Рівень: ${v.level}`);
  if (kind === 'ENGLISH') {
    if (v.issuedBy) parts.push(`Ким виданий: ${v.issuedBy}`);
  } else {
    if (v.decisionNumber && v.decisionDate) {
      parts.push(`Рішення НК: № ${v.decisionNumber} від ${formatIssuedOn(v.decisionDate)}`);
    }
  }
  if (v.issuedOn) parts.push(`Дата видачі: ${formatIssuedOn(v.issuedOn)}`);
  return parts;
}

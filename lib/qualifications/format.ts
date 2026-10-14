import { pluralUk } from '@/lib/plural';

/** 150 → «1,5», 300 → «3», 25 → «0,25» — a Ukrainian decimal comma, no padding. */
export function formatCredits(hundredths: number): string {
  return String(hundredths / 100).replace('.', ',');
}

/** «1,5 кредита», «1 кредит», «5 кредитів». A fraction takes the «few» form. */
export function creditsLabel(hundredths: number): string {
  const whole = hundredths % 100 === 0;
  const word = whole ? pluralUk(hundredths / 100, 'кредит', 'кредити', 'кредитів') : 'кредита';
  return `${formatCredits(hundredths)} ${word}`;
}

/** One навчальний кредит is 30 годин (owner, 2026-10-13). */
export const HOURS_PER_CREDIT = 30;

/**
 * The hours a number of credits stands for — **derived, never stored and never
 * typed**. 150 hundredths (1,5 кредита) → 45; 25 → 7,5. Integer arithmetic until
 * the last step, so 0,01 кредита is 0,3 and not 0.30000000000000004.
 */
export function hoursFromCredits(creditsHundredths: number): number {
  return (creditsHundredths * HOURS_PER_CREDIT) / 100;
}

/**
 * «45 годин», «1 година», «2 години», and «7,5 години» for a fraction — the
 * genitive singular, as with credits.
 */
export function hoursLabel(hours: number): string {
  if (!Number.isInteger(hours)) return `${String(hours).replace('.', ',')} години`;
  return `${hours} ${pluralUk(hours, 'година', 'години', 'годин')}`;
}

/** `2025-05-20` → «20.05.2025». A calendar date: never run through `Date`. */
export function formatIssuedOn(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * «ПК № 12345» / «№ 12345» / «ПК» — a series and a number are both optional, and
 * a document with neither has nothing to print (`null`).
 */
export function documentNumber(
  series: string | null | undefined,
  number: string | null | undefined
): string | null {
  if (series && number) return `${series} № ${number}`;
  if (number) return `№ ${number}`;
  return series || null;
}

/** «204,8 КБ» — a reasonable read, not an exact one. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} КБ`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} МБ`;
}

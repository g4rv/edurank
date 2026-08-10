import { z } from 'zod';
import {
  LICENCE_POSITIONS,
  groupOf,
  type LicencePositionLink,
} from '@/lib/kharakterystyka/positions';

// Validates `ActivityType.licencePositions` — which п.38 position(s) of the
// Характеристика this indicator's entries satisfy.
//
// Why a column and not a list in code: `requiresVerification` and
// `entityFirstEntry` were both hardcoded code lists once, and each one silently
// excluded any indicator an admin built themselves. An indicator the вчена рада
// votes in next year must be able to feed position 1 without a deploy.
//
// An EMPTY array is meaningful and common — most indicators satisfy no licence
// position, and two satisfy none *on purpose*: `patent_application` and
// `intl_grant_application`. An application scores in the rating, because the
// rating rewards the effort, but it closes no position, because the licence asks
// for a finished thing (decided 2026-08-07).

const POSITION_NUMBERS = new Set(LICENCE_POSITIONS.map((p) => p.number));

/** Machine names are JSON keys on the evidence — same rule as the field specs */
const fieldName = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, { error: 'Некоректна службова назва поля' });

export const licencePositionLinkSchema: z.ZodType<LicencePositionLink> = z.strictObject({
  position: z
    .number()
    .int()
    .refine((n) => POSITION_NUMBERS.has(n), { error: 'Невідома позиція ліцензійних умов' }),
  group: z.string().trim().min(1).max(64).optional(),
  when: z
    .strictObject({
      field: fieldName,
      in: z.array(z.string().min(1)).min(1, { error: 'Вкажіть хоча б одне значення' }).readonly(),
    })
    .optional(),
}) as z.ZodType<LicencePositionLink>;

export const licencePositionsSchema = z.array(licencePositionLinkSchema);

/**
 * Links off an ActivityType row's JSON.
 *
 * Unlike `parseTypeSpecs`, this never throws. The Характеристика is a read-only
 * view assembled from ~67 indicator rows, and one malformed row must not take a
 * person's whole document down. A bad row simply feeds no position — which
 * surfaces as a position that should be met and is not, rather than as a blank
 * page nobody can explain.
 */
export function parseLicencePositions(value: unknown): LicencePositionLink[] {
  const parsed = licencePositionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/**
 * Problems with a link set, in Ukrainian, for the admin editor. Empty = valid.
 * Mirrors `specProblems` in activity-type-spec.ts, which does the same job for
 * the evidence fields and the scoring rule.
 */
export function licencePositionProblems(links: readonly LicencePositionLink[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    // The same (position, group) twice would count every entry of this
    // indicator twice against that threshold — five publications would satisfy
    // a bar of ten, and the document would claim a position nobody earned.
    const key = `${link.position}:${groupOf(link)}`;
    if (seen.has(key)) {
      problems.push(`Позицію ${link.position} вказано двічі для однієї групи`);
    }
    seen.add(key);
  }

  return problems;
}

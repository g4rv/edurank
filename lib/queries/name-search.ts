import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * «Ігнатенко Микола» has to find «Ігнатенко Микола Миколайович».
 *
 * Testing the whole box against each column in turn is the obvious thing, and
 * it fails on the first thing anybody actually types. A surname and a given
 * name together are not in `lastName`, and not in `firstName` either, so the
 * search says «Нікого не знайдено» about somebody who is plainly on the list —
 * and the reader concludes the person is missing from the system rather than
 * from the query. Reported on production, 2026-08-23.
 *
 * Every WORD must match one of the fields, and they need not match the same
 * one. So «Ігнатенко Микола» and «Микола Ігнатенко» both find her, a single
 * word behaves exactly as it did before, and adding a word can only ever
 * narrow the result — which is what typing more is for.
 *
 * KNOWN LIMIT: matching is literal, so «Дем'яненко» and «Дем’яненко» are two
 * different searches. The roster builder normalises those four apostrophes for
 * exactly this reason; doing it here needs the comparison to happen in SQL
 * (an expression index or `unaccent`-style normalisation), not in Prisma's
 * `contains`.
 */
export function nameSearch(
  q: string,
  fields: readonly string[]
): Prisma.StaffWhereInput | undefined {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;

  return {
    AND: words.map((word) => ({
      OR: fields.map((field) => ({ [field]: { contains: word, mode: 'insensitive' } })),
    })),
  } as Prisma.StaffWhereInput;
}

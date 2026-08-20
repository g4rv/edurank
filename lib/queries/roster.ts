import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * Everyone still on the active roster.
 *
 * Archived people (left the university, декретна відпустка) keep every row they
 * ever had — that is the point of archiving rather than deleting — so every
 * list an editor works from, and every number for the CURRENT year, has to
 * exclude them explicitly. Closed years are the exception: their ranking is
 * frozen history and must keep showing whoever was in it, archived since or not.
 *
 * Spread it into a `where`, so the rule is one greppable thing rather than
 * eleven copies of a null check:
 *
 *   where: { ...ON_ROSTER, isNpp: true }
 */
export const ON_ROSTER = {
  archivedAt: null,
  // The seeded core administrator is not a colleague. It exists so a fresh
  // database is never locked out, and it has no кафедра, no rating and no
  // ставка — counting it would put a phantom person on somebody's кафедра and
  // one extra head in every «N НПП».
  isSystem: false,
} satisfies Prisma.StaffWhereInput;

/**
 * Everyone who is a real person, archived or not.
 *
 * For the places `ON_ROSTER` is deliberately skipped — a CLOSED year keeps the
 * people who were in it — where a service account still has no business
 * appearing.
 */
export const REAL_PEOPLE = { isSystem: false } satisfies Prisma.StaffWhereInput;

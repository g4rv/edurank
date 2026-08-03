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
export const ON_ROSTER = { archivedAt: null } satisfies Prisma.StaffWhereInput;

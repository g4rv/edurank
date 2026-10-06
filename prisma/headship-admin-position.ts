import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { backfillProfileDerived, derivedEvidence } from '../lib/rating/profile-derived';
import { effectiveAdminPosition } from '../lib/staff/academic';
import { ADMIN_POSITION_LABELS } from '../lib/labels';

// Gives every завідувач and декан their rating 1.6 post for the open year.
//
//   pnpm db:headship-admin-position          list who moves, write nothing
//   pnpm db:headship-admin-position --apply  write it
//
// WHY. Until 2026-10-06 rating 1.6 paid only the post somebody picked on the
// profile. Being named завідувач on a кафедра or декан on a факультет is that
// post (owner, 2026-10-06), so `derivedEvidence` now counts the headship
// itself (`effectiveAdminPosition`). Each person's points move the next time
// their profile or their кафедра is saved — this moves everybody's at once,
// on deploy, instead of whenever somebody happens to touch them.
//
// **THIS ADDS RATING POINTS, AND THAT IS THE DECISION.** The report prints
// each person and the post they gain before anything is written.
//
// Writes through `backfillProfileDerived`, the same sync every profile save
// runs, so it can only produce what a save would. Closed years are untouched —
// they render from `RatingEntry.snapshot`. Safe to run twice: the second run
// finds nobody to move.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const apply = process.argv.includes('--apply');

  const template = await prisma.ratingTemplate.findFirst({
    where: { isActive: true, status: 'OPEN' },
    select: {
      year: true,
      activityTypes: {
        where: { code: 'admin_position', isActive: true },
        select: { id: true },
      },
    },
  });
  const type = template?.activityTypes[0];
  if (!template || !type) {
    console.log('Немає відкритого року з показником 1.6 — нічого робити.');
    return;
  }

  const heads = await prisma.staff.findMany({
    where: {
      isNpp: true,
      archivedAt: null,
      OR: [{ headOfDepartment: { isNot: null } }, { deanOfFaculty: { isNot: null } }],
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      adminPosition: true,
      headOfDepartment: { select: { id: true } },
      deanOfFaculty: { select: { id: true } },
      activities: {
        where: { activityTypeId: type.id, status: { not: 'REMOVED' } },
        select: { score: true, evidence: true },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  let moving = 0;
  for (const s of heads) {
    const post = effectiveAdminPosition({
      adminPosition: s.adminPosition,
      isHead: s.headOfDepartment !== null,
      isDean: s.deanOfFaculty !== null,
    });
    // Against the 1.6 row the rating holds, not the profile field: that row is
    // what moves, and comparing it is what makes a second run report nobody.
    const want = derivedEvidence('admin_position', s as never)?.option ?? null;
    const have = (s.activities[0]?.evidence as { option?: string } | undefined)?.option ?? null;
    if (want === have) continue;
    moving++;
    const before = s.activities[0]?.score ?? 0;
    const was = s.adminPosition ? ADMIN_POSITION_LABELS[s.adminPosition] : '—';
    console.log(
      `  ${s.lastName} ${s.firstName}: ${was} → ${post ? ADMIN_POSITION_LABELS[post] : '—'} (зараз ${before} б.)`
    );
  }
  console.log(`\n${template.year}: завідувачів і деканів, чий 1.6 зміниться — ${moving}`);

  if (!apply) {
    console.log('Нічого не записано. Запустіть з --apply, щоб записати.');
    return;
  }

  const changed = await backfillProfileDerived();
  console.log(`Записано. Змінено осіб: ${changed}`);
}

main().finally(() => prisma.$disconnect());

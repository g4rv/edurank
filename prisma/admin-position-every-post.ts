import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { backfillProfileDerived, derivedEvidences } from '../lib/rating/profile-derived';
import { computeScore } from '../lib/rating/scoring';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { ADMIN_POSITION_LABELS } from '../lib/labels';
import type { AdminPosition } from '../lib/generated/prisma/client';

// Rating 1.6 pays EVERY post, not the highest (owner, 2026-10-28).
//
//   pnpm db:admin-position-every-post          list who moves, write nothing
//   pnpm db:admin-position-every-post --apply  write it
//
// WHY. Until now 1.6 made one row per person — the highest post. «Each
// different post pays its points to the sum», even two the положення prints
// under one option, so the sync now writes one row per post
// (`derivedEvidences`). Each person's rows move the next time their profile is
// saved — this moves everybody at once, on deploy.
//
// **THIS ADDS RATING POINTS, AND THAT IS THE DECISION.** The report prints each
// person, their posts and the 1.6 total before and after. On a copy of
// production (27.10): 28 people hold two posts.
//
// Writes through `backfillProfileDerived`, the same sync every profile save
// runs, so it can only produce what a save would. A row written before keeps
// its id (it is adopted for the post it stood for). Closed years are untouched —
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
        where: { code: 'admin_position', isActive: true, inputSource: 'PROFILE_DERIVED' },
        select: { id: true, code: true, coefficient: true, evidenceFields: true, scoring: true },
      },
    },
  });
  const type = template?.activityTypes[0];
  if (!template || !type) {
    console.log('Немає відкритого року з показником 1.6 — нічого робити.');
    return;
  }
  const specs = parseTypeSpecs(type);
  const points = (evidence: Record<string, unknown>) =>
    computeScore(
      {
        code: type.code,
        coefficient: type.coefficient,
        scoring: specs.scoring,
        evidenceFields: specs.fields,
      },
      evidence
    ).score;

  const people = await prisma.staff.findMany({
    where: { isNpp: true, archivedAt: null },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      isNpp: true,
      archivedAt: true,
      adminPositions: true,
      headOfDepartment: { select: { id: true } },
      deanOfFaculty: { select: { id: true } },
      activities: {
        where: { activityTypeId: type.id, status: { not: 'REMOVED' } },
        select: { score: true },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  let moving = 0;
  let added = 0;
  for (const s of people) {
    const wanted = derivedEvidences('admin_position', s as never);
    const after = wanted.reduce((sum, e) => sum + points(e), 0);
    // Against the rows the rating holds, not the profile: they are what moves,
    // and comparing them is what makes a second run report nobody.
    const before = s.activities.reduce((sum, a) => sum + a.score, 0);
    if (after === before && s.activities.length === wanted.length) continue;
    moving++;
    added += after - before;
    const posts = wanted.map((e) => ADMIN_POSITION_LABELS[e.post as AdminPosition]).join(' + ');
    console.log(`  ${s.lastName} ${s.firstName}: ${posts} — ${before} → ${after} б.`);
  }
  console.log(`\n${template.year}: осіб, чий 1.6 зміниться — ${moving}; балів разом: +${added}`);

  if (!apply) {
    console.log('Нічого не записано. Запустіть з --apply, щоб записати.');
    return;
  }

  const changed = await backfillProfileDerived();
  console.log(`Записано. Змінено осіб: ${changed}`);
}

main().finally(() => prisma.$disconnect());

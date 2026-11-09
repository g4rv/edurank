import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { backfillProfileDerived, derivedEvidences } from '../lib/rating/profile-derived';
import { computeScore } from '../lib/rating/scoring';
import { parseTypeSpecs } from '../validations/activity-type-spec';

// Rating 1.9 pays EVERY basic education that fits the кафедра (owner, 2026-11-09).
//
//   pnpm db:basic-education-every-match          list who moves, write nothing
//   pnpm db:basic-education-every-match --apply  write it
//
// WHY. Until now 1.9 made one row per person, however many basic educations
// matched. Now the sync writes one row per matching diploma (`derivedEvidences`).
// Each person's rows move the next time their profile is saved — this moves
// everybody at once, on deploy.
//
// **THIS ADDS RATING POINTS, AND THAT IS THE DECISION.** The report prints each
// person, how many matching educations they hold and the 1.9 total before and
// after.
//
// Writes through `backfillProfileDerived`, the same sync every profile save
// runs. A row written before keeps its id (it is adopted for the first diploma).
// Closed years are untouched — they render from `RatingEntry.snapshot`. Safe to
// run twice: the second run finds nobody to move.

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
        where: { code: 'basic_education_match', isActive: true, inputSource: 'PROFILE_DERIVED' },
        select: { id: true, code: true, coefficient: true, evidenceFields: true, scoring: true },
      },
    },
  });
  const type = template?.activityTypes[0];
  if (!template || !type) {
    console.log('Немає відкритого року з показником 1.9 — нічого робити.');
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
      basicEducationMatch: true,
      basicEducationSpecialty: true,
      diplomas: {
        select: { id: true, degree: true, specialty: true, matchesDepartment: true },
        orderBy: { position: 'asc' },
      },
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
    const wanted = derivedEvidences('basic_education_match', s as never);
    const after = wanted.reduce((sum, e) => sum + points(e), 0);
    // Against the rows the rating holds, not the profile: they are what moves,
    // and comparing them is what makes a second run report nobody.
    const before = s.activities.reduce((sum, a) => sum + a.score, 0);
    if (after === before && s.activities.length === wanted.length) continue;
    moving++;
    added += after - before;
    const names = wanted.map((e) => String(e.specialty || '—')).join(' + ');
    console.log(`  ${s.lastName} ${s.firstName}: ${names} — ${before} → ${after} б.`);
  }
  console.log(`\n${template.year}: осіб, чий 1.9 зміниться — ${moving}; балів разом: +${added}`);

  if (!apply) {
    console.log('Нічого не записано. Запустіть з --apply, щоб записати.');
    return;
  }

  const changed = await backfillProfileDerived();
  console.log(`Записано. Змінено осіб: ${changed}`);
}

main().finally(() => prisma.$disconnect());

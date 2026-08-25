import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { backfillProfileDerived } from '../lib/rating/profile-derived';

// Empties the four research-profile links and the three h-індекс counts on
// EVERY staff record, so each НПП fills their own in through /profile.
//
//   pnpm db:clear-profile-links          list what would change, write nothing
//   pnpm db:clear-profile-links --apply  write it
//
// WHY. `pnpm import:profiles` filled these from `edu-reference/УГСП_Дані.xlsx`,
// a sheet the department kept by hand. A wrong link on somebody's profile is
// our mistake to have made on their behalf, and the only person who can be
// trusted with their own ORCID is them (owner, 2026-08-25).
//
// **THIS DROPS RATING POINTS AND THE OWNER DECIDED THAT KNOWINGLY.** The three
// counts are not decoration: `citations_wos`, `citations_scopus` and
// `citations_scholar` are PROFILE_DERIVED indicators that read them straight
// off the column (`lib/rating/profile-derived.ts`). Emptying a count deletes
// that person's derived row for the open year and lowers their total. The
// report below prints the exact number of points before anything is written —
// read it, then decide whether to pass --apply.
//
// **And an НПП cannot put the counts back.** /profile carries the four links
// only; the h-індекс fields are editable on /staff/[id]/edit by ADMIN, or by an
// EDITOR whose division was granted them. Somebody has to re-enter 300 numbers,
// or the indicators stay at zero until they do.
//
// Closed years are untouched — they render from `RatingEntry.snapshot`, and
// `backfillProfileDerived` only ever writes the active OPEN template.
//
// Safe to run twice: the second run finds nothing to clear and says so.

const LINK_FIELDS = ['wosUrl', 'scopusUrl', 'googleScholarUrl', 'orcidId'] as const;
const COUNT_FIELDS = [
  'wosCitationCount',
  'scopusCitationCount',
  'googleScholarCitationCount',
] as const;

/** The derived indicators that read the counts — what the score report is about */
const CITATION_CODES = ['citations_wos', 'citations_scopus', 'citations_scholar'];

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes('--apply');

  const staff = await prisma.staff.findMany({
    where: {
      OR: [
        { wosUrl: { not: null } },
        { scopusUrl: { not: null } },
        { googleScholarUrl: { not: null } },
        { orcidId: { not: null } },
        // `@default(0)`, so «not set» arrives as 0 for anybody the import never
        // touched. Only a positive count is worth clearing — and only a
        // positive one scores, which is the same test `derivedEvidence` makes.
        { wosCitationCount: { gt: 0 } },
        { scopusCitationCount: { gt: 0 } },
        { googleScholarCitationCount: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      wosUrl: true,
      scopusUrl: true,
      googleScholarUrl: true,
      orcidId: true,
      wosCitationCount: true,
      scopusCitationCount: true,
      googleScholarCitationCount: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  if (staff.length === 0) {
    console.log('Жодного заповненого посилання чи h-індексу. Нічого змінювати.');
    return;
  }

  const withLinks = staff.filter((s) => LINK_FIELDS.some((f) => s[f] !== null)).length;
  const withCounts = staff.filter((s) => COUNT_FIELDS.some((f) => (s[f] ?? 0) > 0)).length;

  console.log(`${staff.length} осіб мають що очищати.`);
  console.log(`  посилання (WoS / Scopus / Scholar / ORCID): ${withLinks}`);
  console.log(`  h-індекс (три поля): ${withCounts}\n`);

  for (const s of staff) {
    const parts: string[] = [];
    for (const f of LINK_FIELDS) if (s[f] !== null) parts.push(f);
    for (const f of COUNT_FIELDS) if ((s[f] ?? 0) > 0) parts.push(`${f}=${s[f]}`);
    console.log(`  ${s.lastName} ${s.firstName} ${s.patronymic ?? ''} — ${parts.join(', ')}`);
  }

  // ── What it costs in rating points ──────────────────────────────────────────
  //
  // Counted off the activities themselves rather than recomputed from the
  // coefficient: `Activity.score` is frozen at save, so the rows currently in
  // the open year ARE the points this removes.
  const template = await prisma.ratingTemplate.findFirst({
    where: { isActive: true, status: 'OPEN' },
    select: { year: true },
  });

  if (!template) {
    console.log('\nНемає відкритого рейтингового року — бали не зміняться.');
  } else {
    const rows = await prisma.activity.findMany({
      where: {
        year: template.year,
        status: 'APPROVED',
        staffId: { in: staff.map((s) => s.id) },
        activityType: { code: { in: CITATION_CODES } },
      },
      select: { score: true, staffId: true, activityType: { select: { code: true } } },
    });

    const points = rows.reduce((sum, r) => sum + r.score, 0);
    const people = new Set(rows.map((r) => r.staffId)).size;
    const byCode = new Map<string, number>();
    for (const r of rows) {
      byCode.set(r.activityType.code, (byCode.get(r.activityType.code) ?? 0) + r.score);
    }

    console.log(`\n── Рейтинг ${template.year} ──`);
    console.log(`  зникне рядків: ${rows.length} у ${people} осіб`);
    for (const code of CITATION_CODES) {
      console.log(`    ${code}: ${(byCode.get(code) ?? 0).toFixed(2)}`);
    }
    console.log(`  РАЗОМ БАЛІВ БУДЕ ВТРАЧЕНО: ${points.toFixed(2)}`);
  }

  if (!apply) {
    console.log(`\n${staff.length} записів буде змінено. Запустіть з --apply, щоб записати.`);
    return;
  }

  const { count } = await prisma.staff.updateMany({
    where: { id: { in: staff.map((s) => s.id) } },
    data: {
      wosUrl: null,
      scopusUrl: null,
      googleScholarUrl: null,
      orcidId: null,
      // Null, not 0. Both score nothing, but null is «не вказано» — which is
      // what the profile shows and what the person is being asked to fill in.
      wosCitationCount: null,
      scopusCitationCount: null,
      googleScholarCitationCount: null,
    },
  });
  console.log(`\nОчищено записів: ${count}.`);

  // The columns are empty now; this is what actually removes the derived rows
  // and rewrites each person's total for the open year.
  const synced = await backfillProfileDerived();
  console.log(`Перераховано рейтинг: ${synced} осіб.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

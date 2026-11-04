/**
 * Checks every active НПП's research profiles against the university's
 * requirements and writes a JSON report. Read-only: nothing in the database
 * changes, and the report is a file, not a table (yet).
 *
 *   pnpm profiles:check                  all active НПП with at least one link
 *   pnpm profiles:check --limit 10       the first 10 — try it before the whole list
 *   pnpm profiles:check --out report.json --concurrency 2
 *
 * Today only ORCID is judged (public API, no browser). WoS, Scopus and Google
 * Scholar are reported as `not_implemented` until their requirements are given
 * — see lib/profile-check/platforms.ts. The report holds real people's data:
 * it is gitignored, keep it local.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { checkPeople } from '../lib/profile-check/run';
import type { PersonInput } from '../lib/profile-check/types';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const concurrency = arg('concurrency') ? Number(arg('concurrency')) : 4;
  const out = arg('out') ?? 'profile-check-report.json';

  const staff = await prisma.staff.findMany({
    where: {
      isNpp: true,
      archivedAt: null,
      OR: [
        { orcidId: { not: null } },
        { wosUrl: { not: null } },
        { scopusUrl: { not: null } },
        { googleScholarUrl: { not: null } },
      ],
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      orcidId: true,
      wosUrl: true,
      scopusUrl: true,
      googleScholarUrl: true,
      department: { select: { name: true, faculty: { select: { name: true } } } },
      partTimeDepartments: {
        select: { department: { select: { name: true, faculty: { select: { name: true } } } } },
        take: 1,
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: limit,
  });

  const people: PersonInput[] = staff.map((s) => {
    // A сумісник with no primary кафедра is shown under the additional one
    const dept = s.department ?? s.partTimeDepartments[0]?.department ?? null;
    return {
      staffId: s.id,
      name: [s.lastName, s.firstName, s.patronymic].filter(Boolean).join(' '),
      faculty: dept?.faculty.name ?? null,
      department: dept?.name ?? null,
      links: {
        orcid: s.orcidId,
        wos: s.wosUrl,
        scopus: s.scopusUrl,
        googleScholar: s.googleScholarUrl,
      },
    };
  });

  console.log(`Checking ${people.length} people, ${concurrency} at a time…`);
  const results = await checkPeople(people, {
    concurrency,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) console.log(`  ${done}/${total}`);
    },
  });

  writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');

  const counts: Record<string, number> = {};
  for (const r of results) {
    for (const p of r.platforms) {
      const key = `${p.platform}: ${p.status}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  console.log('\nSummary');
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(28)} ${v}`);
  console.log(`\nReport → ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

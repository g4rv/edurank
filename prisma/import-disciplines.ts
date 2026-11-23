import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { uniqueDisciplines } from '../lib/disciplines/assigned';
import { matchSupervisor, parseSupervisors } from '../lib/aspirants/match-supervisor';
import { matchPeople } from '../lib/staff-check/match';

// Loads the disciplines the departments assigned to each НПП (owner, 2026-11-19).
//
//   pnpm db:import-disciplines                       — report only, writes nothing
//   pnpm db:import-disciplines --apply               — write them
//   [--file edu-reference/NAME_TOPICS.json]          — the list: [{ name, topics[] }]
//   [--year 2026]                                    — the rating year (default: the
//                                                      open template's)
//
// A person who has any must answer rating 5.1 once for EACH discipline, and the
// year counts 0 at close without them all. A person with none keeps the old rule.
//
// Matching is on the full ПІБ (`matchPeople`: the same name rules as the staff
// list check); a name written as surname + initials («Самолюк А.А.») falls back
// to `matchSupervisor`. A name that fits nobody, or several people, is REPORTED
// and skipped — never guessed. The same discipline written twice for one person
// (taught to several groups) is kept once.
//
// Safe to run again with a corrected file: for the people in it, the year's rows
// are brought to exactly what the file says; everybody else's are left alone.
// An entry already saved is evidence text and is never touched.
//
// NOT a seed: the server has no edu-reference/. Copy the JSON up like
// `kharakterystyka.json`, then run it there — report first, then --apply.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface SourcePerson {
  name: string;
  topics: string[];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const file = resolve(arg('file') ?? 'edu-reference/NAME_TOPICS.json');
  const source = JSON.parse(readFileSync(file, 'utf8')) as SourcePerson[];

  const year =
    Number(arg('year')) ||
    (
      await prisma.ratingTemplate.findFirst({
        where: { isActive: true, status: 'OPEN' },
        select: { year: true },
      })
    )?.year;
  if (!year) throw new Error('Немає відкритого рейтингового року — вкажіть --year');
  console.log(`${file}: ${source.length} осіб · рейтинговий рік ${year}\n`);

  const staff = await prisma.staff.findMany({
    where: { isNpp: true, archivedAt: null },
    select: { id: true, lastName: true, firstName: true, patronymic: true },
  });
  const label = (id: string) => {
    const s = staff.find((x) => x.id === id)!;
    return `${s.lastName} ${s.firstName} ${s.patronymic ?? ''}`.trim();
  };

  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const byStaff = new Map<string, string[]>();
  for (const p of source) {
    const [last, ...rest] = p.name.trim().split(/\s+/);
    let id: string | null = null;
    const full = matchPeople(last, rest.join(' ') || null, staff);
    if (full) {
      if (full.people.length === 1) id = full.people[0].id;
      else {
        ambiguous.push(`${p.name} (${full.people.length} облікових записів)`);
        continue;
      }
    } else {
      // «Самолюк А.А.» — surname and initials
      const mention = parseSupervisors(p.name)[0];
      const hit =
        mention &&
        matchSupervisor(
          mention,
          staff.map((s) => ({ ...s, patronymic: s.patronymic ?? '' }))
        );
      if (hit) id = hit.id;
    }
    if (!id) {
      unmatched.push(p.name);
      continue;
    }
    byStaff.set(id, [...(byStaff.get(id) ?? []), ...p.topics]);
  }

  let total = 0;
  const people = [...byStaff].map(([id, topics]) => {
    const names = uniqueDisciplines(topics);
    total += names.length;
    return { id, names };
  });
  console.log(`Знайдено в системі: ${people.length} з ${source.length}`);
  console.log(`Дисциплін після об’єднання однакових: ${total}`);
  console.log(`Не впізнано (${unmatched.length}): ${unmatched.join(' · ') || '—'}`);
  console.log(`Неоднозначно (${ambiguous.length}): ${ambiguous.join(' · ') || '—'}`);
  const most = [...people].sort((a, b) => b.names.length - a.names.length).slice(0, 5);
  console.log(
    `Найбільше дисциплін: ${most.map((p) => `${label(p.id)} — ${p.names.length}`).join('; ')}`
  );

  const before = await prisma.assignedDiscipline.count({ where: { year } });
  console.log(`\nУ базі за ${year} уже є: ${before}`);
  if (!apply) {
    console.log('\nУ базі нічого не змінено. Запустіть з --apply, щоб записати.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const p of people) {
        await tx.assignedDiscipline.deleteMany({
          where: {
            staffId: p.id,
            year,
            nameNormalised: { notIn: p.names.map((n) => n.nameNormalised) },
          },
        });
        await tx.assignedDiscipline.createMany({
          data: p.names.map((n) => ({ staffId: p.id, year, ...n })),
          skipDuplicates: true,
        });
      }
    },
    { timeout: 120_000 }
  );
  console.log(
    `Записано. Тепер за ${year}: ${await prisma.assignedDiscipline.count({ where: { year } })}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

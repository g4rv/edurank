import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import {
  disciplineKey,
  evidenceDisciplineKey,
  uniqueDisciplines,
} from '../lib/disciplines/assigned';

// One person's mandatory list, edited by hand: replace one assigned name with one
// or more others (owner, 2026-11-24). For when the department gave ONE shortened
// name for several groups — «Практична граматика англ. мови» for В11 and ВА4 — and
// the person's entries are right as typed. The person's ENTRIES are never touched.
//
//   pnpm db:discipline-list-edit --email x@uhsp.edu.ua \
//        --replace "Практична граматика англ. мови" \
//        --with "Практична граматика англійської мови для В11" \
//        --with "Практична граматика англійської мови для ВА4"           — report only
//   … --apply                                                              — write
//   --year N for another рік (default: the open one)
//
// Note: `db:import-disciplines` replaces a person's rows from the departments'
// file, so importing again would put the old name back.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const one = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const many = (flag: string) =>
  args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const apply = args.includes('--apply');

async function main() {
  const email = one('--email');
  const replace = one('--replace');
  const withNames = uniqueDisciplines(many('--with')).map((n) => n.name);
  if (!email || !replace || withNames.length === 0) {
    throw new Error('Потрібні --email, --replace і хоча б один --with');
  }

  const template = one('--year')
    ? { year: Number(one('--year')) }
    : await prisma.ratingTemplate.findFirst({
        where: { status: 'OPEN' },
        orderBy: { year: 'desc' },
        select: { year: true },
      });
  if (!template) throw new Error('Немає відкритого року');
  const year = template.year;

  const person = await prisma.staff.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, lastName: true, firstName: true, archivedAt: true },
  });
  if (!person) throw new Error(`Людину з ${email} не знайдено`);
  const who = `${person.lastName} ${person.firstName}`;

  const rows = await prisma.assignedDiscipline.findMany({
    where: { staffId: person.id, year },
    orderBy: { name: 'asc' },
  });
  const target = rows.find((r) => r.nameNormalised === disciplineKey(replace));
  if (!target) {
    throw new Error(
      `У списку ${who} за ${year} немає «${replace}». Список: ${rows.map((r) => `«${r.name}»`).join('; ')}`
    );
  }
  const clash = withNames.filter((n) =>
    rows.some((r) => r.id !== target.id && r.nameNormalised === disciplineKey(n))
  );
  if (clash.length > 0) {
    throw new Error(`Уже є у списку: ${clash.map((n) => `«${n}»`).join('; ')}`);
  }

  const entries = await prisma.activity.findMany({
    where: {
      staffId: person.id,
      year,
      status: 'APPROVED',
      activityType: { gatesRating: true, isActive: true },
    },
    select: { evidence: true },
  });
  const have = new Set(entries.map((e) => evidenceDisciplineKey(e.evidence)));
  const next = [...rows.filter((r) => r.id !== target.id).map((r) => r.name), ...withNames].sort(
    (a, b) => a.localeCompare(b, 'uk')
  );
  const covered = (names: string[]) => names.filter((n) => have.has(disciplineKey(n))).length;

  console.log(`${who}, рік ${year}.\n`);
  console.log(`Замінити: «${target.name}»`);
  for (const n of withNames)
    console.log(
      `   на:    «${n}»${have.has(disciplineKey(n)) ? '  (є запис)' : '  (запису немає)'}`
    );
  if (have.has(target.nameNormalised)) {
    console.log(`\nУВАГА: на «${target.name}» уже є запис, і він перестане його зараховувати.`);
  }
  console.log(
    `\nСписок: ${rows.length} → ${next.length}. Зараховано: ${covered(rows.map((r) => r.name))} з ${rows.length} → ${covered(next)} з ${next.length}.`
  );
  console.log(`Записи людини не змінюються.`);

  if (!apply) {
    console.log('\nНічого не змінено. Запустіть з --apply.');
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.assignedDiscipline.delete({ where: { id: target.id } });
    for (const name of withNames) {
      await tx.assignedDiscipline.create({
        data: { staffId: person.id, year, name, nameNormalised: disciplineKey(name) },
      });
    }
    await tx.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'AssignedDiscipline',
        entityId: person.id,
        label: `${who}: обов'язковий список 5.1 за ${year} змінено вручну (db:discipline-list-edit)`,
        changes: { list: { from: rows.map((r) => r.name).join('; '), to: next.join('; ') } },
        userId: null,
      },
    });
  });
  console.log('\nГотово.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { buildKharakterystyka } from '../lib/kharakterystyka/build';
import { windowFor } from '../lib/kharakterystyka/positions';

// Removes imported «evidence» that evidences nothing, and strips the form
// prompts that came in with the rest.
//
//   pnpm db:kharakterystyka-cleanup             — report only, writes nothing
//   pnpm db:kharakterystyka-cleanup --apply     — remove tier 1 + strip prompts
//   pnpm db:kharakterystyka-cleanup --apply --bare
//                                               — also remove tier 2
//
// «Дані підтвердження показника» is read against the Ліцензійні умови. A cell
// that answers a question, or names a role with no subject, proves nothing to
// whoever is checking — and the row still counts towards the position.
//
// Two tiers, because they are not equally clear-cut (owner, 2026-09-01):
//
//   TIER 1 — answers, not evidence. «Так», «Ні», a bare number. «Ні» is the
//     worst of them: the person said they have NONE of this, and the importer
//     stored it as proof that they do. Always removed.
//
//   TIER 2 — a fragment with no subject. «виконавець» (of what?), «1 місце»
//     (in what?), «Навчальний посібник» (which one?). Each names half a fact.
//     Removed only with --bare, because unlike tier 1 they are not false — just
//     unusable as evidence.
//
// An organisation's name is NOT in either tier: «ДЮСШ Переяслав» is short but
// it answers «where», which is what п.11 and п.19 ask for.
//
// The importer refuses tier 1 by itself now, so a re-import cannot bring it
// back. MANUAL rows are never touched — somebody typed those on purpose.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');
const bare = process.argv.includes('--bare');
const YEAR = 2026;

/** Answers to a question, and bare counts. Never evidence of anything. */
const TIER_1 = [
  'Так',
  'так',
  'ТАК',
  'Ні',
  'ні',
  'НІ',
  'Ні.',
  'Yes',
  'No',
  '-',
  '—',
  '–',
  'н/д',
  'немає',
  'відсутні',
  'відсутній',
];

/** A role, a place or a type with nothing it belongs to. */
const TIER_2 = [
  'виконавець',
  'керівник',
  'учасник',
  'менеджер',
  'керівник/координатор',
  'координатор',
  'голова',
  'член',
  '1 місце',
  '2 місце',
  '3 місце',
  'І місце',
  'ІІ місце',
  'ІІІ місце',
  'Навчальний посібник',
  'навчальний посібник',
  'Підручник',
  'підручник',
];

const PROMPT = /^\s*обер[іи]ть[^:]{0,40}:\s*/iu;
/** A cell holding only digits — a count somebody typed into an evidence column */
const ONLY_DIGITS = /^\d{1,6}$/;

const SEL = {
  year: true,
  status: true,
  evidence: true,
  activityType: {
    select: {
      code: true,
      itemNumber: true,
      label: true,
      isActive: true,
      evidenceFields: true,
      licencePositions: true,
    },
  },
} as const;

async function build(staffId: string, dropIds: Set<string>) {
  const { from, to } = windowFor(YEAR);
  const person = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { isNpp: true, scientificDegree: true, degreeDefenceDate: true },
  });
  if (!person?.isNpp) return null;
  const [activities, entries] = await Promise.all([
    prisma.activity.findMany({
      where: { staffId, year: { gte: from, lte: to } },
      select: SEL,
    }),
    prisma.kharakterystykaEntry.findMany({
      where: { staffId, year: { gte: from, lte: to } },
      select: { id: true, position: true, group: true, year: true, text: true, itemNumber: true },
    }),
  ]);
  const kept = entries.filter((e) => !dropIds.has(e.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildKharakterystyka(activities as any, person, YEAR, kept);
}

/**
 * Who stops qualifying for Кнпп if these rows go.
 *
 * Named, not counted: a person leaving Кнпп is a licence fact about their
 * кафедра, and whoever runs this has to be able to look at them one by one.
 */
async function knppImpact(rows: { id: string; staffId: string }[]) {
  const ids = new Set(rows.map((r) => r.id));
  const people = [...new Set(rows.map((r) => r.staffId))];
  const dropped: string[] = [];
  for (const staffId of people) {
    const before = await build(staffId, new Set());
    const after = await build(staffId, ids);
    if (before?.qualifies && !after?.qualifies) {
      const s = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { lastName: true, firstName: true, department: { select: { name: true } } },
      });
      dropped.push(
        `${s?.lastName} ${s?.firstName} (${s?.department?.name ?? '—'}) ` +
          `${before?.metCount} → ${after?.metCount} позицій`
      );
    }
  }
  return { people: people.length, dropped };
}

async function main() {
  const all = await prisma.kharakterystykaEntry.findMany({
    where: { source: 'IMPORT' },
    select: { id: true, staffId: true, position: true, text: true },
  });

  const norm = (t: string) => t.trim();
  const tier1 = all.filter((r) => TIER_1.includes(norm(r.text)) || ONLY_DIGITS.test(norm(r.text)));
  const tier2 = all.filter((r) => TIER_2.includes(norm(r.text)));

  for (const [name, rows] of [
    ['ТИП 1 — відповідь, а не доказ («Так», «Ні», число)', tier1],
    ['ТИП 2 — уламок без предмета («виконавець», «1 місце»)', tier2],
  ] as const) {
    const byPos = new Map<number, number>();
    for (const r of rows) byPos.set(r.position, (byPos.get(r.position) ?? 0) + 1);
    console.log(`\n═══ ${name}: ${rows.length} рядків ═══`);
    for (const [p, n] of [...byPos].sort((a, b) => b[1] - a[1])) {
      console.log(`  п.${p}: ${n}`);
    }
    const impact = await knppImpact(rows);
    console.log(`  осіб: ${impact.people}, випадає з Кнпп: ${impact.dropped.length}`);
    for (const line of impact.dropped) console.log(`    ⚠ ${line}`);
  }

  const prompted = await prisma.kharakterystykaEntry.findMany({
    where: { source: 'IMPORT', text: { startsWith: 'Оберіть' } },
    select: { id: true, text: true },
  });
  console.log(`\n═══ Підказка форми в тексті: ${prompted.length} рядків ═══`);
  if (prompted[0]) {
    console.log(`  було:  ${prompted[0].text.slice(0, 84)}`);
    console.log(`  стане: ${prompted[0].text.replace(PROMPT, '').trim().slice(0, 84)}`);
  }

  if (!apply) {
    console.log('\nНічого не змінено. --apply прибирає тип 1, --apply --bare — обидва.');
    return;
  }

  const doomed = bare ? [...tier1, ...tier2] : tier1;
  const removed = await prisma.kharakterystykaEntry.deleteMany({
    where: { id: { in: doomed.map((r) => r.id) } },
  });
  console.log(`\nВилучено рядків: ${removed.count}${bare ? ' (тип 1 + тип 2)' : ' (тип 1)'}`);

  let fixed = 0;
  for (const r of prompted) {
    const text = r.text.replace(PROMPT, '').trim();
    if (!text || text === r.text) continue;
    await prisma.kharakterystykaEntry.update({ where: { id: r.id }, data: { text } });
    fixed += 1;
  }
  console.log(`Очищено текстів: ${fixed}`);
  console.log('Кнпп перераховується сам — він ніде не зберігається.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

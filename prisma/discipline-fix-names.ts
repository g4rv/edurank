import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { evidenceDisciplineKey } from '../lib/disciplines/assigned';
import { pairNearMatches } from '../lib/disciplines/near-match';

// 5.1 «once for each assigned discipline» compares NAMES, so an entry typed with a
// slip («органзація», «німмецької», a Latin «i») does not count for the discipline
// it is about (owner, 2026-11-24: Каменська's «(фвху)»). This renames such an
// entry's discipline to the assigned name, for the open year only.
//
//   pnpm db:discipline-fix-names                 — report only, writes nothing
//   pnpm db:discipline-fix-names --apply         — write
//   pnpm db:discipline-fix-names --min 0.95      — only the very close ones (default 0.9)
//
// What it changes: ONLY the `discipline` text of an approved, not removed 5.1
// entry, and only when ONE entry and ONE assigned name belong together with no
// close rival. The link, the materials and the points are never touched. Each
// change is written to the audit log. Re-running changes nothing more: a renamed
// entry now covers its discipline. Anything it is not sure of is listed, never
// changed — a person or a moderator decides.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const apply = process.argv.includes('--apply');
const minArg = process.argv.indexOf('--min');
const min = minArg >= 0 ? Number(process.argv[minArg + 1]) : 0.9;

async function main() {
  if (!(min > 0 && min <= 1)) throw new Error('--min takes a number between 0 and 1');

  const template = await prisma.ratingTemplate.findFirst({
    where: { status: 'OPEN' },
    orderBy: { year: 'desc' },
    select: { id: true, year: true },
  });
  if (!template) {
    console.log('Немає відкритого року.');
    return;
  }

  const people = await prisma.staff.findMany({
    where: {
      archivedAt: null,
      isNpp: true,
      isExternalPartTimer: false,
      assignedDisciplines: { some: { year: template.year } },
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      assignedDisciplines: { where: { year: template.year } },
    },
    orderBy: { lastName: 'asc' },
  });

  const changes: {
    who: string;
    staffId: string;
    activityId: string;
    from: string;
    to: string;
    similarity: number;
    evidence: Record<string, unknown>;
  }[] = [];
  const skipped: string[] = [];

  for (const p of people) {
    const who = `${p.lastName} ${p.firstName}`;
    const acts = await prisma.activity.findMany({
      where: {
        staffId: p.id,
        status: 'APPROVED',
        removedAt: null,
        activityType: { itemNumber: '5.1', templateId: template.id },
      },
      select: { id: true, evidence: true },
    });
    const assignedKeys = new Set(p.assignedDisciplines.map((a) => a.nameNormalised));
    const covered = new Set(acts.map((a) => evidenceDisciplineKey(a.evidence)).filter(Boolean));
    const missing = p.assignedDisciplines.filter((a) => !covered.has(a.nameNormalised));
    if (missing.length === 0) continue;
    const extras = acts.flatMap((a) => {
      const key = evidenceDisciplineKey(a.evidence);
      const name = (a.evidence as Record<string, unknown>).discipline;
      return key && !assignedKeys.has(key) && typeof name === 'string'
        ? [{ id: a.id, name, evidence: a.evidence as Record<string, unknown> }]
        : [];
    });

    const { pairs, ambiguous } = pairNearMatches(
      missing.map((m) => ({ name: m.name })),
      extras.map((e) => ({ id: e.id, name: e.name })),
      min
    );
    for (const pair of pairs) {
      const entry = extras.find((e) => e.id === pair.entryId)!;
      changes.push({
        who,
        staffId: p.id,
        activityId: pair.entryId,
        from: pair.entryName,
        to: pair.missing,
        similarity: pair.similarity,
        evidence: entry.evidence,
      });
    }
    for (const a of ambiguous) {
      skipped.push(
        `${who}: «${a.missing}» ~ «${a.entryName}» (${a.similarity.toFixed(2)}) — ${
          a.reason === 'extends' ? 'одна назва — друга з додатковими словами' : 'є схожий суперник'
        }`
      );
    }
  }

  console.log(`Рік ${template.year}. Поріг схожості ${min}. Люди зі списком: ${people.length}.\n`);
  for (const c of changes) {
    console.log(`${c.who}\n   «${c.from}»\n → «${c.to}»  (${c.similarity.toFixed(2)})`);
  }
  console.log(
    `\nБуде перейменовано: ${changes.length} запис(ів), людей: ${new Set(changes.map((c) => c.staffId)).size}.`
  );
  if (skipped.length) {
    console.log(`\nНе чіпаю (неоднозначно): ${skipped.length}`);
    for (const s of skipped) console.log('  ' + s);
  }

  if (!apply) {
    console.log(`\nНічого не змінено${changes.length ? '. Запустіть з --apply.' : '.'}`);
    return;
  }

  let done = 0;
  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      // Re-read inside the transaction: nothing may have moved since the report
      const now = await tx.activity.findUnique({
        where: { id: c.activityId },
        select: { evidence: true, status: true, removedAt: true },
      });
      const was = (now?.evidence as Record<string, unknown> | undefined)?.discipline;
      if (!now || now.status !== 'APPROVED' || now.removedAt || was !== c.from) {
        console.log(`Пропущено (змінилось): ${c.who} «${c.from}»`);
        continue;
      }
      await tx.activity.update({
        where: { id: c.activityId },
        data: {
          evidence: {
            ...(now.evidence as Record<string, unknown>),
            discipline: c.to,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'Activity',
          entityId: c.activityId,
          label: `П. 5.1 ${c.who}: назву дисципліни виправлено на призначену (db:discipline-fix-names)`,
          changes: { discipline: { from: c.from, to: c.to } },
          userId: null,
        },
      });
      done++;
    }
  });
  console.log(`\nГотово: перейменовано ${done}. Посилання, матеріали й бали не змінено.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

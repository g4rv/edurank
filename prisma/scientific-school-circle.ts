import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { CODE, SCHOOL, planConversion } from './scientific-school-circle-plan';

// Rating 3.17: «Керівництво науковою школою» gains a second option, «постійно
// діючий студентський науковий гурток / проблемна група», 100 points (owner,
// 2026-11-25) — so every variant of Характеристика п.14 has an indicator to come
// from. Both options feed п.14; the link has no condition and is not touched.
//
//   pnpm db:scientific-school-circle           — report only, writes nothing
//   pnpm db:scientific-school-circle --apply   — convert the form, mark the entries
//
// Open years only: a closed year renders from its snapshot and keeps its words.
// The catalogue has the new form for a seeded database; this is for one that is
// never seeded again. What a row becomes: `./scientific-school-circle-plan.ts`.
//
// Scores do not move: the школа keeps the row's own points, every entry saved
// before gets the «наукова школа» answer, and `Activity.score` is frozen at save.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const apply = process.argv.includes('--apply');

async function main() {
  const types = await prisma.activityType.findMany({
    where: { code: CODE, template: { status: 'OPEN' } },
    select: {
      id: true,
      itemNumber: true,
      label: true,
      coefficient: true,
      coefficientNote: true,
      evidenceFields: true,
      scoring: true,
      template: { select: { year: true } },
    },
    orderBy: { template: { year: 'asc' } },
  });
  if (types.length === 0) {
    console.log(`Показника ${CODE} немає у відкритих роках.`);
    return;
  }

  const plans = types.map((t) => ({ type: t, plan: planConversion(t) }));
  for (const { type, plan } of plans) {
    const head = `${type.template.year}, п. ${type.itemNumber}`;
    if (plan.kind === 'done') console.log(`• ${head}: вже оновлено — пропущено`);
    else if (plan.kind === 'unexpected') console.log(`• ${head}: НЕ ОНОВЛЕНО — ${plan.reason}`);
    else {
      console.log(
        `• ${head}: буде два варіанти — наукова школа (${plan.schoolPoints}), гурток / проблемна група` +
          (plan.keptLabel ? `; назву адміністратора збережено: «${type.label}»` : '')
      );
      if (type.coefficientNote)
        console.log(`  стара підказка «${type.coefficientNote}» буде замінена`);
    }
  }

  const converting = plans.flatMap(({ type, plan }) =>
    plan.kind === 'convert' ? [{ id: type.id, data: plan.data }] : []
  );
  const entries = await prisma.activity.findMany({
    where: { activityTypeId: { in: converting.map((c) => c.id) } },
    select: {
      id: true,
      evidence: true,
      score: true,
      staff: { select: { lastName: true, firstName: true } },
    },
    orderBy: [{ staff: { lastName: 'asc' } }, { createdAt: 'asc' }],
  });
  const unanswered = entries.filter(
    (e) => (e.evidence as Record<string, unknown> | null)?.option === undefined
  );
  console.log(`\nЗаписів, яким буде вказано «наукова школа»: ${unanswered.length}`);
  for (const e of unanswered) {
    const title = (e.evidence as Record<string, unknown> | null)?.title;
    console.log(
      `  ${e.staff.lastName} ${e.staff.firstName} — «${String(title ?? '')}», ${e.score} б.`
    );
  }

  if (plans.some((p) => p.plan.kind === 'unexpected')) {
    console.log('\nВідмовлено: є рядок, який скрипт не розуміє (див. вище). Нічого не змінено.');
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log('\nНічого не змінено. Запустіть з --apply.');
    return;
  }
  if (converting.length === 0) {
    console.log('\nНічого оновлювати.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const c of converting) {
      await tx.activityType.update({
        where: { id: c.id },
        data: {
          label: c.data.label,
          coefficient: c.data.coefficient,
          coefficientNote: c.data.coefficientNote,
          evidenceFields: c.data.evidenceFields as unknown as Prisma.InputJsonValue,
          scoring: c.data.scoring as unknown as Prisma.InputJsonValue,
        },
      });
    }
    for (const e of unanswered) {
      await tx.activity.update({
        where: { id: e.id },
        data: {
          evidence: {
            ...(e.evidence as Record<string, unknown>),
            option: SCHOOL,
          } as Prisma.InputJsonValue,
        },
      });
    }
  });
  console.log(
    `\nГотово: показників оновлено ${converting.length}, записів ${unanswered.length}. Бали не змінено.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

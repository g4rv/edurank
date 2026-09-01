import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { ACTIVITY_TYPES_2026 } from '../lib/rating/activity-types';
import { dbSpecs } from '../lib/rating/db-specs';

// Teaches indicator 3.25 «Отримання патенту» which kind of patent a row is.
//
//   pnpm db:patent-kind                        — report only, writes nothing
//   pnpm db:patent-kind --apply                — update the indicator rows
//   pnpm db:patent-kind --apply --assume-invention
//                                              — and fill existing patents as
//                                                «на винахід», which is what the
//                                                app already counted them as
//
// Why: п.38 позиція 2 asks for ONE патент на винахід, or FIVE деклараційних, or
// FIVE свідоцтв про авторське право. The indicator covers «винахід / корисну
// модель» in one row and stored nothing telling them apart, so every patent fed
// the bar of one — and a person with a single патент на корисну модель printed
// as «Виконано» on a licence document (owner, 2026-09-01).
//
// The fix adds a «Вид патенту» select and routes each answer to its own bar.
// `pnpm db:seed` would do this for the 2026 template, but prod is populated by
// admin edits and is never seeded again, and a CLONED template is not reseeded
// at all — which is what this script is for.
//
// Activities written before the field existed carry no answer, so they now feed
// NEITHER bar. That is deliberate: an unanswered patent is a claim nobody has
// checked, and silently keeping it on the bar of one is the very thing being
// fixed. `--assume-invention` is there for whoever decides the old rows are all
// винаходи — it never runs on its own.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CODE = 'patent_granted';
const apply = process.argv.includes('--apply');
const assumeInvention = process.argv.includes('--assume-invention');

/** Evidence is a JSON column, so nothing about its shape is guaranteed. */
function field(evidence: unknown, name: string): string {
  if (typeof evidence !== 'object' || evidence === null) return '';
  const value = (evidence as Record<string, unknown>)[name];
  return value === undefined || value === null ? '' : String(value);
}

async function main() {
  const def = ACTIVITY_TYPES_2026.find((d) => d.code === CODE);
  if (!def) throw new Error(`${CODE} відсутній у каталозі`);
  const specs = dbSpecs(def);

  const rows = await prisma.activityType.findMany({
    where: { code: CODE },
    select: { id: true, template: { select: { year: true, status: true } } },
    orderBy: { template: { year: 'asc' } },
  });

  if (rows.length === 0) {
    console.log(`Показника ${CODE} немає в жодному шаблоні.`);
    return;
  }

  console.log(`Показник ${CODE} знайдено в шаблонах: ${rows.length}`);
  for (const row of rows) {
    console.log(`  ${row.template.year} (${row.template.status})`);
  }

  // Every patent already entered, whatever its template — the five-year window
  // of the Характеристика reaches back across all of them.
  const activities = await prisma.activity.findMany({
    where: { activityType: { code: CODE } },
    select: {
      id: true,
      year: true,
      status: true,
      evidence: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
    orderBy: [{ year: 'desc' }],
  });
  const unanswered = activities.filter((a) => field(a.evidence, 'patentKind') === '');

  console.log(
    `\nЗаписів за показником: ${activities.length}, без виду патенту: ${unanswered.length}`
  );
  for (const row of unanswered) {
    const { lastName, firstName, patronymic } = row.staff;
    const flag = row.status === 'APPROVED' ? '' : `  [${row.status}]`;
    console.log(`  ${row.year}  ${lastName} ${firstName} ${patronymic}${flag}`);
    console.log(`        № ${field(row.evidence, 'registrationNumber') || '—'}`);
    console.log(`        ${field(row.evidence, 'title') || '(без назви)'}`);
  }

  // The same over-claim in the other table. The 2022–2024 backfill routed a
  // patent row onto позиція 2 with no `when` to judge it, so it landed on the
  // bar of one — «патент» — whatever kind it actually was. Re-running the
  // importer now puts such a row into its «невідомий варіант» report instead,
  // which is the point; these are the ones already imported under the old rule.
  const imported = await prisma.kharakterystykaEntry.findMany({
    where: { position: 2, group: 'patent', source: 'IMPORT' },
    select: {
      year: true,
      text: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
    orderBy: { year: 'desc' },
  });
  if (imported.length > 0) {
    console.log(
      `\nІмпортованих записів позиції 2 на смузі «патент на винахід»: ${imported.length}.\n` +
        'Кожен із них сам закриває позицію. Перевірте, чи це справді патенти на винахід:'
    );
    for (const row of imported) {
      const { lastName, firstName, patronymic } = row.staff;
      console.log(`  ${row.year}  ${lastName} ${firstName} ${patronymic}`);
      console.log(`        ${row.text.replace(/\s+/g, ' ').slice(0, 96)}`);
    }
  }

  if (!apply) {
    console.log('\nНічого не змінено. Запустіть з --apply, щоб оновити показник.');
    if (unanswered.length > 0) {
      console.log(
        'Записи без виду патенту не зараховуватимуться до позиції 2, доки вид не буде вказано.\n' +
          'Якщо всі вони — патенти на винахід, додайте --assume-invention.'
      );
    }
    return;
  }

  await prisma.activityType.updateMany({
    where: { code: CODE },
    data: {
      evidenceFields: specs.evidenceFields as unknown as Prisma.InputJsonValue,
      licencePositions: specs.licencePositions as unknown as Prisma.InputJsonValue,
    },
  });
  console.log(`\nОновлено показників: ${rows.length}.`);

  if (unanswered.length === 0) {
    console.log('Записів без виду патенту немає — нічого заповнювати.');
    return;
  }

  if (!assumeInvention) {
    console.log(
      `Записів без виду патенту: ${unanswered.length}. Вони не зараховуються до позиції 2, ` +
        'доки хтось не вкаже вид.'
    );
    return;
  }

  // Rewritten one by one: `evidence` is a JSON blob and updateMany cannot merge
  // a key into it. Scores are untouched — the indicator is FIXED and pays 50 for
  // either kind, and a saved score is frozen at submission anyway.
  for (const row of unanswered) {
    const evidence =
      typeof row.evidence === 'object' && row.evidence !== null
        ? (row.evidence as Record<string, unknown>)
        : {};
    await prisma.activity.update({
      where: { id: row.id },
      data: { evidence: { ...evidence, patentKind: 'invention' } as Prisma.InputJsonValue },
    });
  }
  console.log(
    `Заповнено як «патент на винахід»: ${unanswered.length}. Перевірте їх у /moderation.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

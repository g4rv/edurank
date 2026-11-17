import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';

// Rating 3.8 «Квартиль»: the one option «Квартиль Q3-4 / відсутній» becomes two,
// «Квартиль Q3-4» and «Квартиль відсутній», same points (owner, 2026-11-17) — so
// Рейтинг кафедри 7.2 (Scopus/WoS, Q3-Q4) can count Q3-4 alone.
//
//   pnpm db:cat-a-quartile                  — report only, writes nothing
//   pnpm db:cat-a-quartile --apply          — split the option, move the entries
//   pnpm db:cat-a-quartile --apply --rest=q3_4|none
//                                           — and put every entry NOT in the lists
//                                             below on that option
//
// Open years only: a closed year renders from its snapshot and keeps its words.
// The catalogue (`lib/rating/evidence-fields.ts`) has the new options for a
// seeded database; this is for one that is never seeded again.
//
// Scores do not move: both new options carry the old option's own points, read
// from the row (an admin may have changed them), and `Activity.score` is frozen
// at save anyway.
//
// Which entry goes where: ННВ looked up each journal's quartile (owner,
// 2026-11-17). Ids from the production copy of 2026-11-16. An entry saved later
// with the old option is not guessed — it is listed, and --apply refuses until
// it is added here or --rest names where the rest go.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CODE = 'publication_cat_a';
const OLD = 'q3_4_or_none';
const Q3_4 = { value: 'q3_4', label: 'Квартиль Q3-4' };
const NONE = { value: 'none', label: 'Квартиль відсутній' };

/** No quartile: E-learning (a book series) and European Journal of Sustainable Development */
const TO_NONE = new Set(['cmw6jfxo500eq01n0f9x8fyve', 'cmvqp8gpc023k01qtxetnhk2w']);

/** Q3 or Q4, by journal */
const TO_Q3_4 = new Set([
  // Society. Document. Communication — Q3
  'cmw57qw38005w01n0sxhtn793',
  'cmvwl1d7f01ep01nptl7ncnsh',
  'cmw582py9006i01n0ffix525x',
  'cmuo2j3u1002z01rtwncofw8d',
  'cmvqfsmvq01qo01qtjyvyuntb',
  'cmw6foasq00cg01n05wuprlif',
  'cmw6fqi8h00cm01n07xaka0s8',
  'cmw6fobbq00cj01n0mrxjxfon',
  'cmw9pnrus00fg01pjisufjuq0',
  // Eastern-European Journal of Enterprise Technologies — Q3
  'cmw9hmns9007001pjk7vgga88',
  'cmw9hqcep007e01pj3vbcx5av',
  'cmv9ttnny003o01pdwzyiogub',
  'cmv9tvsqf003t01pdbfcouv41',
  // Technology Audit and Production Reserves — Q4
  'cmw9hosxg007701pjkeqs7wez',
  'cmv9tz06s003w01pdio7rcski',
  'cmw4yp39y001t01rl496gmltu',
  // Revista Conrado — Q4
  'cmvp6sx0m01i601qtqt8636v0',
  'cmvpb6ddb01mf01qtzvq5fvbx',
  'cmvjtnnxb004f01qtdnyf0229',
  // European Journal of Social Science Education and Research — Q3
  'cmvvi43fm017z01npryzmk969',
  'cmvvidknp018201np08whno5d',
  // Interacción y Perspectiva — Q4
  'cmvu6xro1000j01nplwtl3s2w',
  'cmvmtpx3d00lp01qti1ar0pf0',
  // Cadernos de Dereito Actual — Q4
  'cmvku36d000at01qtggkoywq7',
  // Journal of Theoretical and Applied Information Technology — Q4
  'cmvtn80tb03jd01qt8mpfa6ap',
  // Regulatory Mechanisms in Biosystems — Q4
  'cmveahcqx00qx01pr0vhwax8g',
  // Revista de Cercetare si Interventie Sociala — Q3
  'cmv0p678t03or01tdyl7aa1tr',
  // Acta Balneologica — Q3
  'cmvgnczaj00ki01n07svlx95z',
  // BRAIN. Broad Research in AI and Neuroscience — Q4
  'cmvfdf293001z01n0p53xl4x8',
  // The New Educational Review — Q3/Q4
  'cmvp0256l00y101qtbooi73wv',
  // Veredas do Direito — Q3
  'cmwc4ix1o01xh01pjswikzj7g',
  // Wiadomości Lekarskie — Q4
  'cmvusupd400ez01npf9odrmz1',
]);

const apply = process.argv.includes('--apply');
const restArg = process.argv.find((a) => a.startsWith('--rest='))?.slice('--rest='.length);
if (restArg !== undefined && restArg !== Q3_4.value && restArg !== NONE.value) {
  throw new Error(`--rest має бути ${Q3_4.value} або ${NONE.value}`);
}

/** The note printed under the picker. Replaced only while it still reads exactly the old way — an admin's own wording stays. */
const OLD_NOTE =
  'квартиль Q1 — 600, квартиль Q2 — 500, квартиль Q3-4 / відсутній — 400; посилання Scopus або WoS';
const NEW_NOTE =
  'квартиль Q1 — 600, квартиль Q2 — 500, квартиль Q3-4 — 400, квартиль відсутній — 400; посилання Scopus або WoS';

type Option = { value: string; label: string; points?: number };
type Field = { name?: string; kind?: string; options?: Option[] };

/** The «Квартиль» select with the old option replaced, in place, by the two new ones */
function splitFields(fields: unknown): Field[] | null {
  if (!Array.isArray(fields)) return null;
  let changed = false;
  const next = (fields as Field[]).map((f) => {
    if (f.name !== 'option' || !Array.isArray(f.options)) return f;
    const at = f.options.findIndex((o) => o.value === OLD);
    if (at < 0) return f;
    changed = true;
    const old = f.options[at];
    const keep = f.options.filter((o) => o.value !== Q3_4.value && o.value !== NONE.value);
    const i = keep.findIndex((o) => o.value === OLD);
    return {
      ...f,
      options: [
        ...keep.slice(0, i),
        { ...Q3_4, points: old.points },
        { ...NONE, points: old.points },
        ...keep.slice(i + 1),
      ],
    };
  });
  return changed ? next : null;
}

function targetFor(id: string): string | undefined {
  if (TO_NONE.has(id)) return NONE.value;
  if (TO_Q3_4.has(id)) return Q3_4.value;
  return restArg;
}

async function main() {
  const types = await prisma.activityType.findMany({
    where: { code: CODE, template: { status: 'OPEN' } },
    select: {
      id: true,
      evidenceFields: true,
      coefficientNote: true,
      template: { select: { year: true } },
    },
  });
  if (types.length === 0) {
    console.log(`Показника ${CODE} немає у відкритих роках.`);
    return;
  }

  const plans = types.map((t) => ({
    ...t,
    fields: splitFields(t.evidenceFields),
    note: t.coefficientNote === OLD_NOTE ? NEW_NOTE : null,
  }));
  for (const p of plans) {
    console.log(
      `${p.template.year}: ${p.fields ? 'варіант буде розділено' : 'старого варіанта немає — вже розділено'}` +
        (p.note ? '; підказку під вибором оновлено' : '')
    );
  }

  const entries = await prisma.activity.findMany({
    where: { activityTypeId: { in: types.map((t) => t.id) } },
    select: {
      id: true,
      status: true,
      evidence: true,
      staff: { select: { lastName: true, firstName: true } },
    },
    orderBy: [{ staff: { lastName: 'asc' } }, { createdAt: 'asc' }],
  });
  const old = entries.filter((e) => (e.evidence as Record<string, unknown> | null)?.option === OLD);

  console.log(`\nЗаписів зі старим варіантом: ${old.length}`);
  const unknown: typeof old = [];
  for (const e of old) {
    const to = targetFor(e.id);
    const listed = TO_NONE.has(e.id) || TO_Q3_4.has(e.id);
    if (!listed) unknown.push(e);
    const label = to === NONE.value ? NONE.label : to === Q3_4.value ? Q3_4.label : '???';
    const flag = listed ? '' : '  [НЕ У СПИСКУ]';
    const status = e.status === 'APPROVED' ? '' : `  [${e.status}]`;
    console.log(`  ${e.staff.lastName} ${e.staff.firstName} → ${label}${flag}${status}`);
  }

  if (!apply) {
    console.log('\nНічого не змінено. Запустіть з --apply.');
    if (unknown.length > 0 && !restArg) {
      console.log(
        `${unknown.length} записів не у списку — додайте їх або вкажіть --rest=q3_4|none.`
      );
    }
    return;
  }
  if (unknown.some((e) => !targetFor(e.id))) {
    console.log(
      `\nВідмовлено: ${unknown.length} записів не у списку. Додайте їх у скрипт або вкажіть --rest=q3_4|none.`
    );
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plans) {
      if (!p.fields && !p.note) continue;
      await tx.activityType.update({
        where: { id: p.id },
        data: {
          ...(p.fields && { evidenceFields: p.fields as unknown as Prisma.InputJsonValue }),
          ...(p.note && { coefficientNote: p.note }),
        },
      });
    }
    for (const e of old) {
      await tx.activity.update({
        where: { id: e.id },
        data: {
          evidence: {
            ...(e.evidence as Record<string, unknown>),
            option: targetFor(e.id),
          } as Prisma.InputJsonValue,
        },
      });
    }
  });
  console.log(
    `\nГотово: показників оновлено ${plans.filter((p) => p.fields || p.note).length}, записів ${old.length}. Бали не змінено.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

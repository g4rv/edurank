import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { ACTIVITY_TYPES_2026 } from '../lib/rating/activity-types';
import { LICENCE_POSITION_LINKS } from '../lib/rating/db-specs';

// Point the 2025 template's indicators at the п.38 positions they satisfy.
//
//   pnpm db:link-positions-2025          — show what would change
//   pnpm db:link-positions-2025 --apply  — write it
//   pnpm db:link-positions-2025 --undo   — put every one of them back to []
//
// The undo exists so that running this against production is a decision that
// can be taken back in one command. It restores the exact state the template
// was in before — `licencePositions: []` on all 53 — which is where
// `import-template-2025.ts` left it.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `import-template-2025.ts` built the 2025 template from the university's own
// sheet and set `licencePositions: []` on every one of its 53 indicators. So
// all 10 592 imported 2025 activities close no licence position, the
// Характеристика renders 0/20 for all 327 НПП, and `Кнпп` is 0 on every
// кафедра. The document has never worked, and nothing anywhere said why.
//
// ── WHY A SCRIPT AND NOT THE ADMIN PAGE ─────────────────────────────────────
//
// 2025 is CLOSED and `updateActivityType` refuses a closed year, rightly.
// Reopening it would put a whole year's scoring back in play for a change that
// cannot move a single number: `licencePositions` is read by
// `lib/kharakterystyka/build.ts` and by nothing else. Neither `recompute.ts`
// nor `scoring.ts` mentions it, so no Activity.score, no RatingEntry and no
// ставка can change. Same one-off shape as `gate-to-check-sum.ts`.
//
// ── WHY THE MAP IS TYPED OUT BY HAND ────────────────────────────────────────
//
// Item numbers moved between 2025 and 2026, which makes matching on them
// actively dangerous: 2025's «3.25 Рецензування робіт ІІ туру» lines up with
// 2026's «3.25 copyright_registration» and would have handed 24 people the
// patent position, while «3.29 Свідоцтва/патенти» — the indicator that really
// is п.2 — matched nothing at all. Matching on the label catches most of it and
// still misses the reworded ones: 2025's «Ініціативна тематика кафедри» against
// 2026's «Реалізація ініціативної тематики кафедри», 286 rows.
//
// So every pair below was read and approved by the owner, and ONLY indicators
// that do close a position appear. Everything else keeps the empty list it
// already has — a wrong link here writes a false claim into a document the
// university is licensed against.
const MAP: Record<string, string> = {
  '1.5': 'mon_nazyavo_councils', //      п.9   ради МОН / НАЗЯВО
  '1.10': 'prof_associations', //        п.19  професійні обєднання
  '2.2': 'edition_publication', //       п.3 / п.4, split by the option chosen
  '2.3': 'foreign_language_teaching', // п.13  заняття іноземною мовою
  '3.1': 'intl_grant_won', //            п.10  міжнародні проєкти
  '3.2': 'intl_program_participation', //п.10
  '3.4': 'ndr_execution', //             п.8   НДР
  '3.5': 'initiative_topic', //          п.8   ініціативна тематика (reworded in 2026)
  '3.6': 'intl_open_lectures', //        п.10  відкриті лекції
  '3.7': 'monograph_ua', //              п.3   монографія — 2026 splits UA/EU, both п.3
  '3.8': 'publication_cat_a', //         п.1   Scopus / WoS
  '3.9': 'publication_cat_b', //         п.1   фахові «Б»
  '3.11': 'defense_supervision', //      п.6   захист під керівництвом
  '3.13': 'intl_olympiad_winners', //    п.14
  '3.14': 'ukr_olympiad_winners', //     п.14
  '3.15': 'olympiad_jury', //            п.14
  '3.16': 'scientific_school', //        п.14
  '3.17': 'specialized_council', //      п.7   спецради
  '3.18': 'journal_editorial_b', //      п.8   редколегія фахового збірника
  '3.19': 'org_consulting', //           п.11  наукове консультування установ
  '3.20': 'conf_abroad', //              п.12
  '3.21': 'conf_ukraine', //             п.12
  '3.23': 'dissertation_opponent', //    п.7   опонування
  '3.26': 'mon_textbook_expertise', //   п.9   експертиза підручників
  // п.2 — and the owner checked the DATA rather than the law. Of 66 rows there
  // is not one патент на винахід, корисна модель or деклараційний патент: every
  // one is a свідоцтво про авторське право, in the same 132k–139k registry
  // range. So the five-свідоцтва route, which is what actually happened, and
  // not the one-патент one.
  '3.29': 'copyright_registration',
  '5.1': 'moodle_course', //             п.4   навчально-методичне забезпечення
};

// Deliberately closing NO position, listed so nobody re-adds them later
// believing they were forgotten:
//
//   1.8, 1.11, 2.6, 2.9, 3.12, 3.22, 3.24, 3.27, 3.28, 4.1–4.3 — real work the
//     п.38 list simply does not ask about
//   3.3  подання на конкурс — an unwon application is not a project, the same
//     rule that keeps intl_grant_application unlinked in the 2026 catalogue
//   3.10 статті поза фаховими виданнями — owner, asked directly: not п.12
//   3.25 рецензування робіт ІІ туру — owner, asked directly: not п.14

const apply = process.argv.includes('--apply');
const undo = process.argv.includes('--undo');
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

async function main() {
  const template = await prisma.ratingTemplate.findFirst({
    where: { year: 2025 },
    select: { id: true, status: true },
  });
  if (!template) throw new Error('немає шаблону 2025');

  if (undo) {
    const { count } = await prisma.activityType.updateMany({
      where: { templateId: template.id },
      data: { licencePositions: [] },
    });
    console.log(`ПОВЕРНУТО: ${count} показників тепер не закривають жодної позиції.`);
    console.log('Характеристика знову буде порожня — це стан до запуску скрипта.');
    return;
  }

  const catalogue = new Map(ACTIVITY_TYPES_2026.map((t) => [t.code, t]));
  const types = await prisma.activityType.findMany({
    where: { templateId: template.id },
    select: { id: true, itemNumber: true, label: true, licencePositions: true },
    orderBy: { itemNumber: 'asc' },
  });

  let planned = 0;
  let already = 0;
  const rows: string[] = [];

  for (const type of types) {
    const code = MAP[type.itemNumber];
    if (!code) continue;

    if (!catalogue.has(code)) {
      throw new Error(`у каталозі 2026 немає коду «${code}» (показник ${type.itemNumber})`);
    }
    const links = LICENCE_POSITION_LINKS[code] ?? [];
    if (links.length === 0) {
      throw new Error(`код «${code}» не закриває жодної позиції — прибери його з MAP`);
    }

    if (JSON.stringify(type.licencePositions ?? []) === JSON.stringify(links)) {
      already++;
      continue;
    }

    planned++;
    const positions = links.map((l) => `п.${l.position}${l.group ? `/${l.group}` : ''}`).join(' ');
    rows.push(
      `${type.itemNumber.padEnd(5)} ${type.label.slice(0, 44).padEnd(46)} → ${code.padEnd(27)} ${positions}`
    );

    if (apply) {
      await prisma.activityType.update({
        where: { id: type.id },
        data: { licencePositions: links as unknown as Prisma.InputJsonValue },
      });
    }
  }

  console.log(`шаблон 2025 [${template.status}] — показників ${types.length}\n`);
  for (const r of rows) console.log('  ' + r);
  console.log(
    `\n${apply ? 'ЗАПИСАНО' : 'БУДЕ ЗАПИСАНО'}: ${planned}` +
      (already ? `, вже правильні: ${already}` : '') +
      (apply ? '' : '\n\nЩоб застосувати: pnpm db:link-positions-2025 --apply')
  );

  const missing = Object.keys(MAP).filter((n) => !types.some((t) => t.itemNumber === n));
  if (missing.length) console.log(`\n⚠ у шаблоні немає показників: ${missing.join(' ')}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

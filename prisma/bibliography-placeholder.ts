import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { EVIDENCE_FIELDS, type EvidenceField } from '../lib/rating/evidence-fields';

// Gives every «Бібліографічний опис» box an example of the description it wants.
//
//   pnpm db:bib-placeholder            — report only, writes nothing
//   pnpm db:bib-placeholder --apply    — write it
//
// Why a script: an indicator's form lives in `ActivityType.evidenceFields`, a
// JSON column, so editing the catalogue in `lib/rating/` changes nothing that
// is already in a template. `pnpm db:seed` would carry it into 2026 only, and
// production is never seeded again.
//
// Deliberately NARROW. It does not re-sync the field specs from the catalogue —
// an admin may have edited an indicator in /admin/rating, and overwriting their
// work to deliver a grey hint would be a poor trade. It finds text fields named
// `bibliography`, and sets `placeholder` on them. Nothing else is touched, and
// a field that already carries one is left alone.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

/** The example the catalogue gives this indicator's bibliography box */
function exampleFor(code: string): string | undefined {
  const fields = EVIDENCE_FIELDS[code];
  if (!fields) return undefined;
  for (const f of fields) {
    if (f.kind === 'text' && f.name === 'bibliography') return f.placeholder;
  }
  return undefined;
}

async function main() {
  const rows = await prisma.activityType.findMany({
    select: {
      id: true,
      code: true,
      itemNumber: true,
      evidenceFields: true,
      template: { select: { year: true, status: true } },
    },
    orderBy: [{ template: { year: 'asc' } }, { itemNumber: 'asc' }],
  });

  let changed = 0;
  let already = 0;
  let noExample = 0;

  for (const row of rows) {
    const fields = row.evidenceFields as unknown as EvidenceField[] | null;
    if (!Array.isArray(fields)) continue;

    const target = fields.find((f) => f.kind === 'text' && f.name === 'bibliography');
    if (!target) continue;

    const example = exampleFor(row.code);
    if (!example) {
      noExample += 1;
      console.log(
        `  ? ${row.template.year} ${row.itemNumber} ${row.code} — немає зразка в каталозі`
      );
      continue;
    }
    // Compared, not merely checked for presence: the wording is edited from
    // time to time — «Наприклад:» was added to the front of every one of them —
    // and a script that only fills empty fields would leave the old text in
    // place with nothing to say so.
    if (target.kind === 'text' && target.placeholder === example) {
      already += 1;
      continue;
    }

    const next = fields.map((f) =>
      f.kind === 'text' && f.name === 'bibliography' ? { ...f, placeholder: example } : f
    );
    changed += 1;
    console.log(`  + ${row.template.year} ${row.itemNumber} ${row.code}`);
    console.log(`      ${example.slice(0, 88)}…`);

    if (apply) {
      await prisma.activityType.update({
        where: { id: row.id },
        data: { evidenceFields: next as unknown as Prisma.InputJsonValue },
      });
    }
  }

  console.log(
    `\nПоказників із «Бібліографічний опис»: ${changed + already + noExample}\n` +
      `  оновлено: ${changed}${apply ? '' : ' (нічого не записано)'}\n` +
      `  вже мали зразок: ${already}\n` +
      `  без зразка в каталозі: ${noExample}`
  );
  if (!apply && changed > 0) console.log('\nЗапустіть з --apply, щоб записати.');
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

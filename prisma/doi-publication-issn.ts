import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { EVIDENCE_FIELDS, type EvidenceField } from '../lib/rating/evidence-fields';

// Rating 3.11 (`doi_publication`): DOI, ISBN OR ISSN, at least one (owner,
// 2026-11-23) — it was DOI or ISBN. The title and the hint say so too.
//
//   pnpm db:doi-publication-issn          — report only, writes nothing
//   pnpm db:doi-publication-issn --apply  — write
//
// Run AFTER db:doi-publication-isbn. Open years only: a closed year renders
// from its snapshot. The DOI and ISBN boxes keep everything an admin may have
// changed and only take the new condition; the ISSN box is the catalogue's,
// put right after ISBN. No entry or score moves.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CODE = 'doi_publication';
type WithRule = EvidenceField & {
  requiredWhen?: { field?: unknown; empty?: unknown; alsoEmpty?: unknown };
};
const catalogue = EVIDENCE_FIELDS[CODE] as WithRule[];
const RULE = (name: string) => catalogue.find((f) => f.name === name)!.requiredWhen;
const ISSN = catalogue.find((f) => f.name === 'issn')!;

const OLD_NOTE =
  "стаття одноосібно — 100, стаття у співавторстві — 50, конференція — 40; DOI або ISBN — обов'язково";
const NEW_NOTE =
  "стаття одноосібно — 100, стаття у співавторстві — 50, конференція — 40; DOI, ISBN або ISSN — обов'язково";
const OLD_LABEL =
  'Наукові публікації, що мають цифровий ідентифікатор DOI або ISBN та не належать до категорій «А» і «Б»';
const NEW_LABEL =
  'Наукові публікації, що мають цифровий ідентифікатор DOI, ISBN або ISSN та не належать до категорій «А» і «Б»';

const apply = process.argv.includes('--apply');

function nextFields(fields: unknown): EvidenceField[] | null {
  if (!Array.isArray(fields)) return null;
  const list = fields as WithRule[];
  const isbnAt = list.findIndex((f) => f.name === 'isbn');
  if (isbnAt < 0) return null; // db:doi-publication-isbn has not run
  const done =
    list.some((f) => f.name === 'issn') &&
    ['doi', 'isbn'].every((n) => {
      const r = list.find((f) => f.name === n)?.requiredWhen;
      return Array.isArray(r?.alsoEmpty) && (r.alsoEmpty as unknown[]).length === 1;
    });
  if (done) return null;
  const next = list.map((f) =>
    ['doi', 'isbn'].includes(f.name) ? ({ ...f, requiredWhen: RULE(f.name) } as WithRule) : f
  );
  if (!next.some((f) => f.name === 'issn')) {
    next.splice(next.findIndex((f) => f.name === 'isbn') + 1, 0, ISSN);
  }
  return next;
}

async function main() {
  const types = await prisma.activityType.findMany({
    where: { code: CODE, template: { status: 'OPEN' } },
    select: {
      id: true,
      evidenceFields: true,
      coefficientNote: true,
      label: true,
      template: { select: { year: true } },
    },
  });
  if (types.length === 0) {
    console.log(`Показника ${CODE} немає у відкритих роках.`);
    return;
  }

  const plans = types.map((t) => ({
    ...t,
    fields: nextFields(t.evidenceFields),
    note: t.coefficientNote === OLD_NOTE ? NEW_NOTE : null,
    label: t.label === OLD_LABEL ? NEW_LABEL : null,
  }));
  for (const p of plans) {
    console.log(
      `${p.template.year}: ${p.fields ? 'DOI, ISBN або ISSN — буде оновлено' : 'вже оновлено або немає поля ISBN (спершу db:doi-publication-isbn)'}` +
        (p.note ? '; підказку оновлено' : '') +
        (p.label ? '; назву оновлено' : '')
    );
  }

  const todo = plans.filter((p) => p.fields || p.note || p.label);
  if (!apply) {
    console.log(`\nНічого не змінено${todo.length ? '. Запустіть з --apply.' : '.'}`);
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const p of todo) {
      await tx.activityType.update({
        where: { id: p.id },
        data: {
          ...(p.fields && { evidenceFields: p.fields as unknown as Prisma.InputJsonValue }),
          ...(p.note && { coefficientNote: p.note }),
          ...(p.label && { label: p.label }),
        },
      });
    }
  });
  console.log(`\nГотово: показників оновлено ${todo.length}. Записи й бали не змінено.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

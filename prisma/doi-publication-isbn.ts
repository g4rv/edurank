import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { EVIDENCE_FIELDS, type EvidenceField } from '../lib/rating/evidence-fields';

// Rating 3.11 (`doi_publication`): DOI OR ISBN, at least one (owner,
// 2026-11-17) — the DOI alone was mandatory until then. The title and the hint
// say so too.
//
//   pnpm db:doi-publication-isbn          — report only, writes nothing
//   pnpm db:doi-publication-isbn --apply  — write
//
// Open years only: a closed year renders from its snapshot. The catalogue has
// the new fields for a seeded database; this is for one never seeded again.
// The DOI box keeps everything an admin may have changed and only gains the
// condition; the ISBN box is the catalogue's, put right after it. No entry or
// score moves — every saved entry already has its DOI.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CODE = 'doi_publication';
type WithRule = EvidenceField & { requiredWhen?: { field?: unknown; empty?: unknown } };
const catalogue = EVIDENCE_FIELDS[CODE] as WithRule[];
const DOI_RULE = catalogue.find((f) => f.name === 'doi')!.requiredWhen;
const ISBN = catalogue.find((f) => f.name === 'isbn')!;

/** The note printed under the form. Replaced only while it still reads exactly the old way. */
const OLD_NOTE =
  "стаття одноосібно — 100, стаття у співавторстві — 50, конференція — 40; DOI — обов'язково";
const NEW_NOTE =
  "стаття одноосібно — 100, стаття у співавторстві — 50, конференція — 40; DOI або ISBN — обов'язково";

/** The title, on the same terms: an admin's own wording stays. */
const OLD_LABEL =
  'Наукові публікації, що мають цифровий ідентифікатор DOI та не належать до категорій «А» і «Б»';
const NEW_LABEL =
  'Наукові публікації, що мають цифровий ідентифікатор DOI або ISBN та не належать до категорій «А» і «Б»';

const apply = process.argv.includes('--apply');

function nextFields(fields: unknown): EvidenceField[] | null {
  if (!Array.isArray(fields)) return null;
  const list = fields as WithRule[];
  const at = list.findIndex((f) => f.name === 'doi');
  if (at < 0) return null;
  const hasIsbn = list.some((f) => f.name === 'isbn');
  // Compared field by field: jsonb stores the keys in its own order
  const rule = list[at].requiredWhen;
  const doiDone = rule?.field === 'isbn' && rule?.empty === true;
  if (hasIsbn && doiDone) return null;
  const next = [...list];
  next[at] = { ...list[at], requiredWhen: DOI_RULE } as WithRule;
  if (!hasIsbn) next.splice(at + 1, 0, ISBN);
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
      `${p.template.year}: ${p.fields ? 'DOI або ISBN — буде оновлено' : 'вже оновлено або немає поля DOI'}` +
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

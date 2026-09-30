import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../lib/generated/prisma/client';

// One-time correction for two things the record form got wrong (owner,
// 2026-09-30):
//
//   1. «Наукова стаття» asked for the link TWICE — «Посилання на статтю» as an
//      evidence field and the record's own link box. The article's page IS the
//      work, so the extra field goes and the record's link becomes the article's
//      identity (`identityFields` names `link`).
//   2. «Видання монографії…» and «Перевидання…» had no ISBN at all. It is now a
//      mandatory field and the first thing a book is told apart by.
//
// Why a script and not the seed: `pnpm db:seed` upserts one template and
// OVERWRITES what an admin edited on it (link/file rules, hours); production is
// never seeded again; and a template CLONED from another copies the JSON and is
// never reseeded. This touches ONLY the fields named above, in EVERY template.
//
// It also tidies works already saved: the article's `url` value moves out of
// `evidence` (which would now fail the stricter form on the next edit) into the
// work's own `link` — kept, never dropped — unless the work already has one.
//
// It also puts those three types' fields in the order the form now reads
// (name → category → link → DOI/ISBN → pages): the order is stored in the JSON,
// so a database made before it keeps the old one until this runs. Only the ORDER
// of fields already there changes — never a label, a rule or a point value.
//
//   pnpm db:science-link-isbn            reports
//   pnpm db:science-link-isbn --apply    writes

const apply = process.argv.includes('--apply');

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

type Field = { kind?: string; name?: string; label?: string; [key: string]: unknown };

const ISBN_FIELD: Field = { kind: 'isbn', name: 'isbn', label: 'ISBN' };

/** `code` is the stable semantic key here — `label` is editable by an admin. */
const ARTICLE = 'article';
const BOOKS = ['monograph', 'monograph_reissue'];

function asFields(value: unknown): Field[] {
  return Array.isArray(value) ? (value as Field[]) : [];
}
function asNames(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/**
 * The order a type's fields are shown in. Fields not named keep their relative
 * order and go last, so an admin-added field is never dropped or reshuffled.
 */
const ORDER: Record<string, string[]> = {
  article: ['title', 'option', 'doi', 'credits', 'publishedOn'],
  monograph: ['title', 'option', 'isbn', 'credits'],
  monograph_reissue: ['title', 'isbn', 'value'],
};

function inOrder(fields: Field[], code: string): Field[] {
  const wanted = ORDER[code] ?? [];
  const rank = (f: Field) => {
    const at = wanted.indexOf(String(f.name));
    return at === -1 ? wanted.length : at;
  };
  // `sort` is stable, so the fields nobody named keep their relative order.
  return [...fields].sort((x, y) => rank(x) - rank(y));
}

const namesOf = (fields: Field[]) => fields.map((f) => f.name).join();

function fixArticle(fields: Field[], identity: string[]) {
  const nextFields = inOrder(
    fields.filter((f) => !(f.name === 'url' && f.kind === 'url')),
    ARTICLE
  );
  const nextIdentity = [...new Set(identity.map((n) => (n === 'url' ? 'link' : n)))];
  const changed =
    namesOf(nextFields) !== namesOf(fields) || nextIdentity.join() !== identity.join();
  return { changed, fields: nextFields, identity: nextIdentity };
}

function fixBook(code: string, fields: Field[], identity: string[]) {
  const hasIsbn = fields.some((f) => f.kind === 'isbn');
  // Added last, then put in its place by `inOrder`.
  const nextFields = inOrder(hasIsbn ? fields : [...fields, ISBN_FIELD], code);
  const nextIdentity = identity.includes('isbn') ? identity : ['isbn', ...identity];
  return {
    changed:
      !hasIsbn ||
      namesOf(nextFields) !== namesOf(fields) ||
      nextIdentity.join() !== identity.join(),
    fields: nextFields,
    identity: nextIdentity,
  };
}

async function main() {
  const types = await prisma.scienceWorkType.findMany({
    where: { code: { in: [ARTICLE, ...BOOKS] } },
    select: {
      id: true,
      code: true,
      evidenceFields: true,
      identityFields: true,
      template: { select: { academicYear: true } },
    },
    orderBy: [{ template: { academicYear: 'asc' } }, { code: 'asc' }],
  });

  const typeChanges: { id: string; fields: Field[]; identity: string[] }[] = [];
  for (const row of types) {
    const fields = asFields(row.evidenceFields);
    const identity = asNames(row.identityFields);
    const fix =
      row.code === ARTICLE ? fixArticle(fields, identity) : fixBook(row.code, fields, identity);
    if (!fix.changed) continue;
    typeChanges.push({ id: row.id, fields: fix.fields, identity: fix.identity });
    console.log(
      `  ${row.template.academicYear} · ${row.code} — ` +
        (row.code === ARTICLE
          ? 'без «Посилання на статтю», нова послідовність полів'
          : 'ISBN обовʼязковий, нова послідовність полів')
    );
  }

  // Articles already saved with the second link typed into their evidence.
  const articleTypeIds = types.filter((t) => t.code === ARTICLE).map((t) => t.id);
  const works = await prisma.scienceWork.findMany({
    where: { workTypeId: { in: articleTypeIds } },
    select: { id: true, evidence: true, link: true },
  });
  const workChanges = works
    .filter((w) => w.evidence && typeof w.evidence === 'object' && 'url' in w.evidence)
    .map((w) => {
      const { url, ...rest } = w.evidence as Record<string, unknown>;
      const typed = typeof url === 'string' && url.trim() ? url.trim() : null;
      return { id: w.id, evidence: rest, link: w.link ?? typed };
    });
  for (const w of workChanges) console.log(`  робота ${w.id} — адреса статті з evidence → link`);

  const books = await prisma.scienceWork.count({
    where: { workType: { code: { in: BOOKS } } },
  });
  if (books > 0) {
    console.log(
      `\nУвага: ${books} вже збережених монографій не мають ISBN — його треба буде вказати при першому редагуванні.`
    );
  }

  if (typeChanges.length === 0 && workChanges.length === 0) {
    console.log('Нічого змінювати: усе вже відповідає новому опису.');
    return;
  }
  if (!apply) {
    console.log(
      `\nВидів роботи: ${typeChanges.length}, робіт: ${workChanges.length}. Запустіть з --apply, щоб записати.`
    );
    return;
  }

  await prisma.$transaction([
    ...typeChanges.map((c) =>
      prisma.scienceWorkType.update({
        where: { id: c.id },
        data: {
          evidenceFields: c.fields as unknown as Prisma.InputJsonValue,
          identityFields: c.identity as unknown as Prisma.InputJsonValue,
        },
      })
    ),
    ...workChanges.map((w) =>
      prisma.scienceWork.update({
        where: { id: w.id },
        data: { evidence: w.evidence as Prisma.InputJsonValue, link: w.link },
      })
    ),
  ]);
  console.log(`\nГотово. Видів роботи: ${typeChanges.length}, робіт: ${workChanges.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

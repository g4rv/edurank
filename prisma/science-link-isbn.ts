import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../lib/generated/prisma/client';
import { isValidDoi, normalizeDoi } from '../lib/doi';

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
// Since 2026-09-30 it also:
//
//   3. puts a book's ISBN in front of the link — Назва → Вид → ISBN — and makes it
//      required only for a монографія / підручник (`requiredWhen`), optional for a
//      посібник;
//   4. sets each вид роботи's PROOF rules to what the owner decided after reading
//      the наказ's «Форма звітності»: link REQUIRED and no file for the article,
//      дисертація, both books and the п.10 editorial pair; link OR file (both
//      OPTIONAL, at least one) for every other type. «Керівництво аспірантами» is
//      left alone — it asks no proof. **This overwrites a rule an admin set by
//      hand on any of those types, in every template**, so read the report first.
//
// Since 2026-10-02 it also:
//
//   5. makes the article LINK OR DOI — link OPTIONAL, no file: a filled DOI is a
//      proof of its own, so the link is no longer required (`doiProof`);
//   6. moves a DOI somebody pasted into an article's LINK box into its «DOI»
//      field, where it belongs now that the link box refuses one, and re-keys
//      the work by that DOI (`doi:…`). A work whose DOI another work already
//      holds is reported and left alone — that pair is a duplicate for a person
//      to resolve, not for a script.
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

/** Link required, no file box. Everything else — bar `phd_supervision` — is link OR file. */
const LINK_ONLY = [
  'dissertation',
  'editorial_board',
  'english_support',
  'monograph',
  'monograph_reissue',
];
/** Link OR DOI, at least one; no file box (owner, 2026-10-02). */
const LINK_OR_DOI = ['article'];
/** Asks no proof at all; never touched here. */
const NO_PROOF = ['phd_supervision'];

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

/** JSON with sorted keys — jsonb hands keys back in its own order, so comparing
 *  plain `JSON.stringify` calls reports a change that is not one. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );

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
  const ordered = inOrder(hasIsbn ? fields : [...fields, ISBN_FIELD], code);
  // A монографія / підручник needs its ISBN, a посібник does not.
  const nextFields =
    code === 'monograph'
      ? ordered.map((f) =>
          f.kind === 'isbn' ? { ...f, requiredWhen: { field: 'option', in: ['monograph'] } } : f
        )
      : ordered;
  const nextIdentity = identity.includes('isbn') ? identity : ['isbn', ...identity];
  return {
    changed:
      !hasIsbn || stable(nextFields) !== stable(fields) || nextIdentity.join() !== identity.join(),
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

  // The proof rules, in every template and every вид роботи.
  const all = await prisma.scienceWorkType.findMany({
    where: { code: { notIn: NO_PROOF } },
    select: {
      id: true,
      code: true,
      linkRule: true,
      fileRule: true,
      template: { select: { academicYear: true } },
    },
    orderBy: [{ template: { academicYear: 'asc' } }, { order: 'asc' }],
  });
  const ruleChanges = all.flatMap((row) => {
    const want = LINK_ONLY.includes(row.code)
      ? { linkRule: 'REQUIRED' as const, fileRule: 'NONE' as const }
      : LINK_OR_DOI.includes(row.code)
        ? { linkRule: 'OPTIONAL' as const, fileRule: 'NONE' as const }
        : { linkRule: 'OPTIONAL' as const, fileRule: 'OPTIONAL' as const };
    if (row.linkRule === want.linkRule && row.fileRule === want.fileRule) return [];
    console.log(
      `  ${row.template.academicYear} · ${row.code} — підтвердження: ` +
        `${row.linkRule}/${row.fileRule} → ${want.linkRule}/${want.fileRule}`
    );
    return [{ id: row.id, ...want }];
  });

  // Articles already saved with the second link typed into their evidence.
  const articleTypeIds = types.filter((t) => t.code === ARTICLE).map((t) => t.id);
  const works = await prisma.scienceWork.findMany({
    where: { workTypeId: { in: articleTypeIds } },
    select: { id: true, evidence: true, link: true, dedupKey: true },
  });
  const workChanges = works
    .filter((w) => w.evidence && typeof w.evidence === 'object' && 'url' in w.evidence)
    .map((w) => {
      const { url, ...rest } = w.evidence as Record<string, unknown>;
      const typed = typeof url === 'string' && url.trim() ? url.trim() : null;
      return { id: w.id, evidence: rest, link: w.link ?? typed };
    });
  for (const w of workChanges) console.log(`  робота ${w.id} — адреса статті з evidence → link`);

  // A DOI pasted into the link box → the «DOI» field (step 6). Read off the
  // link each work will have after the move above.
  const moved = new Map(workChanges.map((w) => [w.id, w]));
  const allKeys = new Set(
    (await prisma.scienceWork.findMany({ select: { dedupKey: true } })).map((w) => w.dedupKey)
  );
  const doiMoves: { id: string; evidence: Record<string, unknown>; dedupKey: string }[] = [];
  for (const w of works) {
    const evidence = (moved.get(w.id)?.evidence ??
      (w.evidence as Record<string, unknown> | null) ??
      {}) as Record<string, unknown>;
    const link = moved.get(w.id)?.link ?? w.link;
    if (!link || !isValidDoi(link)) continue;
    if (typeof evidence.doi === 'string' && evidence.doi.trim()) {
      console.log(`  робота ${w.id} — DOI у посиланні, але поле DOI вже заповнене; лишаю як є`);
      continue;
    }
    const doi = normalizeDoi(link);
    const dedupKey = `doi:${doi.toLowerCase()}`;
    if (allKeys.has(dedupKey) && w.dedupKey !== dedupKey) {
      console.log(`  робота ${w.id} — DOI ${doi} уже має інша робота: це дубль, вирішіть вручну`);
      continue;
    }
    allKeys.add(dedupKey);
    doiMoves.push({ id: w.id, evidence: { ...evidence, doi }, dedupKey });
    console.log(`  робота ${w.id} — DOI ${doi} з посилання → поле DOI`);
  }

  const books = await prisma.scienceWork.count({
    where: { workType: { code: { in: BOOKS } } },
  });
  if (books > 0) {
    console.log(
      `\nУвага: ${books} вже збережених монографій не мають ISBN — його треба буде вказати при першому редагуванні.`
    );
  }

  if (
    typeChanges.length === 0 &&
    workChanges.length === 0 &&
    ruleChanges.length === 0 &&
    doiMoves.length === 0
  ) {
    console.log('Нічого змінювати: усе вже відповідає новому опису.');
    return;
  }
  if (!apply) {
    console.log(
      `\nВидів роботи: ${typeChanges.length}, правил підтвердження: ${ruleChanges.length}, робіт: ${workChanges.length}, DOI з посилань: ${doiMoves.length}. Запустіть з --apply, щоб записати.`
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
    ...ruleChanges.map((c) =>
      prisma.scienceWorkType.update({
        where: { id: c.id },
        data: { linkRule: c.linkRule, fileRule: c.fileRule },
      })
    ),
    ...workChanges.map((w) =>
      prisma.scienceWork.update({
        where: { id: w.id },
        data: { evidence: w.evidence as Prisma.InputJsonValue, link: w.link },
      })
    ),
    // After the url → link move: these overwrite the same rows' evidence and
    // link with the DOI taken out of the link.
    ...doiMoves.map((w) =>
      prisma.scienceWork.update({
        where: { id: w.id },
        data: {
          evidence: w.evidence as Prisma.InputJsonValue,
          link: null,
          dedupKey: w.dedupKey,
        },
      })
    ),
  ]);
  console.log(
    `\nГотово. Видів роботи: ${typeChanges.length}, правил підтвердження: ${ruleChanges.length}, робіт: ${workChanges.length}, DOI з посилань: ${doiMoves.length}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

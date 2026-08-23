import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type AcademicRank,
  type ScientificDegree,
} from '../lib/generated/prisma/client';
import {
  hasDomainHost,
  hostMatches,
  withProtocol,
  SCHOLAR_HOSTS,
  SCOPUS_HOSTS,
  WOS_HOSTS,
} from '../lib/link-hosts';
import { backfillProfileDerived } from '../lib/rating/profile-derived';
import { byFullName, nameKey, resolvePerson, tidy as trim } from './rating-sheet-2025';

// Fills the `Staff` profile from the university's own staff sheet.
//
//   pnpm import:profiles              report only, writes nothing
//   pnpm import:profiles --apply      writes it
//   pnpm import:profiles --apply --overwrite   also replaces values already set
//
// `pnpm db:seed:staff` creates the people; it has names, addresses and кафедри
// and nothing else, so every profile lands empty. This is the second half:
// `edu-reference/УГСП_Дані.xlsx` «НПП» carries стаж, звання, ступінь, the three
// research profiles and their h-індекс — which is exactly what every
// `PROFILE_DERIVED` indicator reads. Until this runs, indicators 1.1, 1.2, 1.3
// and 3.24 score nothing for anybody, however well the activities import.
//
// **Only people in `staff-roster.json`** (owner, 2026-08-19). The sheet lists
// 317 and the roster is the definition of who works here now; the rest are
// printed and skipped.
//
// **A filled field is never overwritten** unless `--overwrite` is passed.
// Somebody may already have corrected their own ORCID through /profile, and a
// re-run of an import is not a reason to undo that.
//
// **`employmentRate` is not imported.** The sheet's «Обсяг ставки» column is
// empty for everybody, and the ставка is set by the розподіл, not here.
// Neither is the address: ours is the corporate one, the sheet holds personal
// Gmail accounts.

const SOURCE = 'edu-reference/УГСП_Дані.xlsx';
const OUT = 'import-report';

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { richText?: unknown[]; text?: unknown; result?: unknown; hyperlink?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map(text).join('');
    if (o.text !== undefined) return text(o.text);
    if (o.result !== undefined) return text(o.result);
    if (o.hyperlink !== undefined) return text(o.hyperlink);
    return '';
  }
  return String(v);
}
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

const RANKS: Record<string, AcademicRank> = {
  професор: 'PROFESSOR',
  доцент: 'DOCENT',
  'старший викладач': 'SENIOR_LECTURER',
  викладач: 'LECTURER',
};

/**
 * «…за спеціальністю кафедри» is not a fifth degree — it is the degree PLUS
 * `degreeMatchesDepartment`, a separate boolean worth 10 more points in 1.3.
 */
function parseDegree(raw: string): { degree: ScientificDegree | null; matches: boolean } {
  const s = raw.toLowerCase();
  const matches = s.includes('за спеціальністю кафедри');
  if (s.startsWith('доктор наук')) return { degree: 'DOCTOR', matches };
  if (s.startsWith('кандидат наук')) return { degree: 'CANDIDATE', matches };
  return { degree: null, matches: false };
}

/**
 * The form expects a bare `0000-0000-0000-0000`, and the sheet holds anything
 * from that to a full https://orcid.org/… link. Pull the identifier out rather
 * than storing whatever was pasted, or /profile renders a link to a link.
 */
function parseOrcid(raw: string): string | null {
  return /(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])/.exec(raw)?.[1]?.toUpperCase() ?? null;
}

/** A profile link, checked against the same host list the staff form accepts */
function parseLink(raw: string, hosts: readonly string[]): string | null {
  const value = withProtocol(tidy(raw));
  if (!value) return null;
  try {
    new URL(value);
  } catch {
    return null;
  }
  if (!hasDomainHost(value) || !hostMatches(value, hosts)) return null;
  return value;
}

/**
 * h-індекс — a small non-negative integer, not a citation count.
 *
 * An empty cell is null, never 0. `Number('')` is 0, and writing that would
 * turn «we do not know this person's стаж» into «this person has no стаж»,
 * which the profile then shows as a fact.
 */
function parseIndex(raw: string): number | null {
  const value = tidy(raw);
  if (!value) return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** The columns of the «НПП» sheet, by their header row */
const COL = {
  name: 2,
  department: 3,
  experience: 5,
  rank: 6,
  degree: 7,
  wosIndex: 11,
  wosUrl: 12,
  scopusIndex: 13,
  scopusUrl: 14,
  scholarIndex: 15,
  scholarUrl: 16,
  orcid: 17,
} as const;

/** Every column this import may write, with 0 counting as empty for an h-індекс */
const FIELDS = [
  'pedagogicalExperience',
  'academicRank',
  'scientificDegree',
  'degreeMatchesDepartment',
  'wosUrl',
  'wosCitationCount',
  'scopusUrl',
  'scopusCitationCount',
  'googleScholarUrl',
  'googleScholarCitationCount',
  'orcidId',
] as const;
type Field = (typeof FIELDS)[number];

/** Exactly the shape `staff.update` takes for these columns */
interface Values {
  pedagogicalExperience: number | null;
  academicRank: AcademicRank | null;
  scientificDegree: ScientificDegree | null;
  degreeMatchesDepartment: boolean | null;
  wosUrl: string | null;
  wosCitationCount: number | null;
  scopusUrl: string | null;
  scopusCitationCount: number | null;
  googleScholarUrl: string | null;
  googleScholarCitationCount: number | null;
  orcidId: string | null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const overwrite = process.argv.includes('--overwrite');
  mkdirSync(OUT, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const roster = JSON.parse(readFileSync('staff-roster.json', 'utf8')) as {
      fullName: string;
      email: string;
    }[];

    const staff = await prisma.staff.findMany({
      where: { isSystem: false },
      select: {
        id: true,
        email: true,
        lastName: true,
        firstName: true,
        patronymic: true,
        pedagogicalExperience: true,
        academicRank: true,
        scientificDegree: true,
        degreeMatchesDepartment: true,
        wosUrl: true,
        wosCitationCount: true,
        scopusUrl: true,
        scopusCitationCount: true,
        googleScholarUrl: true,
        googleScholarCitationCount: true,
        orcidId: true,
        department: { select: { name: true } },
      },
    });
    const byName = byFullName(staff);

    // Membership: the docx roster, PLUS whoever already exists as Staff — the
    // 34 people `import:missing-staff` created on a `.invalid` placeholder
    // (no corporate address, so `staff:build` could never have listed them)
    // are real staff with a filled 2025 rating table, and their профіль data
    // sits in this same sheet. Excluding them left «not on roster» skip every
    // one, so nobody without a real email ever got стаж/звання/ступінь/ORCID.
    // WHICH person a name means is still settled against the database and the
    // sheet's own кафедра column below — this set only decides membership.
    const onRoster = new Set([
      ...roster.map((r) => nameKey(r.fullName)),
      ...staff.map((s) => nameKey(`${s.lastName} ${s.firstName} ${s.patronymic}`.trim())),
    ]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(SOURCE);
    const sheet = wb.getWorksheet('НПП');
    if (!sheet) throw new Error(`${SOURCE} has no «НПП» sheet`);

    let listed = 0;
    const notOnRoster: string[] = [];
    const noAccount: string[] = [];
    const unreadable = new Map<string, string[]>();
    const note = (what: string, detail: string) =>
      unreadable.set(what, [...(unreadable.get(what) ?? []), detail]);

    interface Planned {
      id: string;
      name: string;
      set: Partial<Values>;
      kept: Field[];
    }
    const planned: Planned[] = [];
    const wouldFill = new Map<Field, number>();
    const wouldReplace = new Map<Field, number>();

    sheet.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const name = tidy(text(row.getCell(COL.name).value));
      if (!name) return;
      listed += 1;

      if (!onRoster.has(nameKey(name))) {
        notOnRoster.push(name);
        return;
      }
      const unit = trim(text(row.getCell(COL.department).value));
      const found = resolvePerson(byName, name, unit);
      if (found.ambiguous) {
        noAccount.push(`${name} — двоє з таким ПІБ, кафедра «${unit}» не розрізнила їх`);
        return;
      }
      const person = found.person;
      if (!person) {
        noAccount.push(name);
        return;
      }

      const cell = (c: number) => tidy(text(row.getCell(c).value));

      const rankRaw = cell(COL.rank);
      const rank = RANKS[rankRaw.toLowerCase()] ?? null;
      if (rankRaw && !rank) note('звання', `${name}: «${rankRaw}»`);

      const degreeRaw = cell(COL.degree);
      const { degree, matches } = parseDegree(degreeRaw);
      if (degreeRaw && !degree) note('ступінь', `${name}: «${degreeRaw}»`);

      const orcidRaw = cell(COL.orcid);
      const orcid = parseOrcid(orcidRaw);
      if (orcidRaw && !orcid) note('ORCID', `${name}: «${orcidRaw}»`);

      const links: [Field, string, readonly string[]][] = [
        ['wosUrl', cell(COL.wosUrl), WOS_HOSTS],
        ['scopusUrl', cell(COL.scopusUrl), SCOPUS_HOSTS],
        ['googleScholarUrl', cell(COL.scholarUrl), SCHOLAR_HOSTS],
      ];
      const link: Partial<Record<Field, string | null>> = {};
      for (const [field, raw, hosts] of links) {
        const parsed = parseLink(raw, hosts);
        if (raw && !parsed) note(field, `${name}: «${raw.slice(0, 60)}»`);
        link[field] = parsed;
      }

      const experience = parseIndex(cell(COL.experience));

      // A degree that is not there cannot match a кафедра — the boolean is
      // only meaningful beside one, and writing `false` on its own would show
      // «ступінь не за спеціальністю» for somebody with no ступінь at all.
      const wanted: Values = {
        pedagogicalExperience: experience,
        academicRank: rank,
        scientificDegree: degree,
        degreeMatchesDepartment: degree ? matches : null,
        wosUrl: link.wosUrl ?? null,
        wosCitationCount: parseIndex(cell(COL.wosIndex)),
        scopusUrl: link.scopusUrl ?? null,
        scopusCitationCount: parseIndex(cell(COL.scopusIndex)),
        googleScholarUrl: link.googleScholarUrl ?? null,
        googleScholarCitationCount: parseIndex(cell(COL.scholarIndex)),
        orcidId: orcid,
      };

      const set: Partial<Values> = {};
      const kept: Field[] = [];
      for (const field of FIELDS) {
        const next = wanted[field];
        if (next === null || next === undefined) continue;

        // 0 is what the schema defaults an h-індекс to, so it reads as «not
        // filled in» rather than «measured as zero» — otherwise nobody's
        // citations would ever import.
        const current = person[field];
        if (current === next) continue;
        const empty = current === null || current === undefined || current === 0;
        if (!empty) {
          wouldReplace.set(field, (wouldReplace.get(field) ?? 0) + 1);
          if (!overwrite) {
            kept.push(field);
            continue;
          }
        } else {
          wouldFill.set(field, (wouldFill.get(field) ?? 0) + 1);
        }
        (set as Record<Field, unknown>)[field] = next;
      }

      if (Object.keys(set).length > 0 || kept.length > 0) {
        planned.push({
          id: person.id,
          name: `${person.lastName} ${person.firstName} ${person.patronymic}`.trim(),
          set,
          kept,
        });
      }
    });

    const writes = planned.filter((p) => Object.keys(p.set).length > 0);
    console.log(`${SOURCE} «НПП»: ${listed} listed`);
    console.log(`  not on the roster        ${notOnRoster.length}`);
    console.log(`  on the roster, no account ${noAccount.length}`);
    console.log(`  people to update         ${writes.length}`);
    console.log('\n  field                        fill  replace');
    for (const field of FIELDS) {
      const f = wouldFill.get(field) ?? 0;
      const r = wouldReplace.get(field) ?? 0;
      if (f || r)
        console.log(
          `  ${field.padEnd(28)} ${String(f).padStart(4)}  ${String(r).padStart(7)}${overwrite ? '' : ' (kept)'}`
        );
    }
    for (const [what, list] of unreadable)
      console.log(
        `\n  ! ${what} not understood — ${list.length}:\n    ${list.slice(0, 6).join('\n    ')}`
      );

    const report = [
      '# Profile import from УГСП_Дані.xlsx',
      '',
      `Listed in the sheet: ${listed} · updated: **${writes.length}** · ` +
        `mode: ${apply ? (overwrite ? 'apply + overwrite' : 'apply') : 'report only'}`,
      '',
      '| field | filled | already set |',
      '| --- | --- | --- |',
      ...FIELDS.filter((f) => wouldFill.get(f) || wouldReplace.get(f)).map(
        (f) => `| ${f} | ${wouldFill.get(f) ?? 0} | ${wouldReplace.get(f) ?? 0} |`
      ),
      '',
      ...(notOnRoster.length
        ? [
            `## In the sheet, not on our roster — ${notOnRoster.length}`,
            '',
            'Skipped, per the owner. A name one or two letters out is a typo, not a leaver.',
            '',
            ...notOnRoster.map((n) => `- ${n}`),
            '',
          ]
        : []),
      ...(noAccount.length
        ? [
            `## On the roster with no account — ${noAccount.length}`,
            '',
            'Run `pnpm db:seed:staff` first.',
            '',
            ...noAccount.map((n) => `- ${n}`),
            '',
          ]
        : []),
      ...[...unreadable].flatMap(([what, list]) => [
        `## «${what}» not understood — ${list.length}`,
        '',
        ...list.map((l) => `- ${l}`),
        '',
      ]),
      ...(planned.some((p) => p.kept.length)
        ? [
            '## Left alone — a value was already set',
            '',
            'Re-run with `--overwrite` to replace these.',
            '',
            ...planned.filter((p) => p.kept.length).map((p) => `- ${p.name}: ${p.kept.join(', ')}`),
            '',
          ]
        : []),
    ].join('\n');
    writeFileSync(join(OUT, 'profiles-import.md'), report, 'utf8');
    console.log(`\n  → ${OUT}/profiles-import.md`);

    if (!apply) {
      console.log('\nNothing written. Re-run with --apply.');
      return;
    }

    await prisma.$transaction(
      async (tx) => {
        for (const p of writes) {
          await tx.staff.update({ where: { id: p.id }, data: p.set });
        }
      },
      { timeout: 300_000 }
    );
    console.log(`\nWritten: ${writes.length} profiles.`);

    // The profile is the input to 1.1, 1.2, 1.3 and 3.24; nothing recomputes
    // them on its own, so an import that stopped here would leave every derived
    // indicator at zero and look like it had not run.
    const synced = await backfillProfileDerived();
    console.log(`Profile-derived indicators re-synced for ${synced} people.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
